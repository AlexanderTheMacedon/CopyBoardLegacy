import { useCallback, useMemo, useRef, useState } from 'react';
import { buildShowcase, planShowcase, SHOWCASE_META_KEY, SHOWCASE_SPACE_ID } from '../data/showcase';
import { createShowcaseMedia } from '../data/showcase-media';
import type { LocalStore, StoreSnapshot, WriteBatch } from '../data/store';
import type { ReadOnlyLibrary } from '../domain/library';
import { isLocal, type Folder, type FolderId, type Item, type ItemId, type Placement, type Space, type SpaceId } from '../domain/types';
import {
  applyBatch,
  buildLibrary,
  emptyData,
  PREFS_KEY,
  planCreateFolder,
  planCreateSpace,
  planDelete,
  planDeleteSpace,
  planDuplicate,
  planFavorites,
  planMove,
  planReorderSpaces,
  planRestore,
  planUpdateFolder,
  planUpdateSpace,
  restoreOverrides,
  type DeletedBundle,
  type FolderInput,
  type MovePlan,
  type PlanContext,
  type SpaceDisposition,
  type SpaceInput,
  type WorkspaceData,
} from './operations';
import type { Preferences } from './preferences';

// Writable workspace over the read-only library boundary: synthetic fixtures + the user's own spaces, folders and items from
// the local store. Every mutation is planned (operations.ts), written as one atomic batch, and reflected in React state only
// after the store confirmed the commit.

export class StorageUnavailableError extends Error {
  constructor() {
    super('Local storage is unavailable');
  }
}

export interface WorkspaceSeed {
  readonly store: LocalStore | null;
  readonly snapshot?: StoreSnapshot;
}

export interface Workspace {
  readonly library: ReadOnlyLibrary;
  /** `false` when IndexedDB is unavailable (e.g. blocked storage); captures then fail visibly instead of pretending. */
  readonly persistent: boolean;
  readonly savedPrefs: Partial<Preferences> | undefined;
  /** When the signature intro last played on this device (ms epoch, from the store's meta), if ever. */
  readonly introPlayedAt: number | undefined;
  markIntroPlayed(): void;
  add(items: readonly Item[]): Promise<void>;
  update(item: Item): Promise<void>;
  remove(item: Item): Promise<void>;
  setFavorite(item: Item, favorite: boolean): Promise<void>;
  savePrefs(prefs: Preferences): Promise<void>;
  // --- entries (items and folders) ---
  moveEntries(ids: readonly string[], to: Placement): Promise<MovePlan>;
  duplicateEntries(ids: readonly string[]): Promise<{ items: Item[]; folders: Folder[] }>;
  deleteEntries(ids: readonly string[]): Promise<DeletedBundle>;
  restore(bundle: DeletedBundle): Promise<void>;
  setFavorites(ids: readonly ItemId[], favorite: boolean): Promise<void>;
  // --- folders ---
  createFolder(input: FolderInput, entryIds?: readonly string[]): Promise<{ folder: Folder; moved: number }>;
  updateFolder(id: FolderId, patch: Partial<Pick<Folder, 'name' | 'icon' | 'color'>>): Promise<void>;
  // --- spaces ---
  createSpace(input: SpaceInput): Promise<Space>;
  updateSpace(id: SpaceId, patch: Partial<Omit<Space, 'id' | 'origin'>>): Promise<void>;
  reorderSpaces(orderedIds: readonly SpaceId[]): Promise<void>;
  deleteSpace(id: SpaceId, disposition: SpaceDisposition): Promise<DeletedBundle>;
  // --- showcase ---
  /** Whether the test space "Full" was seeded on this device (marker), and whether it currently exists. */
  readonly showcase: { readonly seeded: boolean; readonly present: boolean };
  /**
   * Creates the test space "Full" by adding only records that do not exist yet (see data/showcase.ts). `auto` runs at
   * most once per device (marker); `explicit` (the settings action) may rebuild missing parts after the user deleted them,
   * still without overwriting anything. Resolves with the number of records added.
   */
  seedShowcase(mode: 'auto' | 'explicit'): Promise<number>;
}

/** Meta key of the intro's last play (a timestamp, nothing else). */
const INTRO_KEY = 'intro.playedAt';

const seedData = (snapshot: StoreSnapshot | undefined): WorkspaceData =>
  snapshot
    ? { local: snapshot.items, overrides: restoreOverrides(snapshot.meta), spaceRecords: snapshot.spaces, folders: snapshot.folders }
    : emptyData;

export function useWorkspace(base: ReadOnlyLibrary, seed: WorkspaceSeed): Workspace {
  const { store, snapshot } = seed;
  const [data, setData] = useState<WorkspaceData>(() => seedData(snapshot));
  const savedPrefs = snapshot?.meta.get(PREFS_KEY) as Partial<Preferences> | undefined;
  const introPlayedAt = snapshot?.meta.get(INTRO_KEY) as number | undefined;
  const markIntroPlayed = useCallback(() => void store?.putMeta(INTRO_KEY, Date.now()).catch(() => {}), [store]);
  const [showcaseSeeded, setShowcaseSeeded] = useState(() => snapshot?.meta.has(SHOWCASE_META_KEY) ?? false);
  const seeding = useRef<Promise<number> | null>(null);

  const library = useMemo(() => buildLibrary(base, data, base.collections), [base, data]);

  // Planners always read the latest committed state, even when several operations are started in the same tick.
  const latest = useRef<PlanContext>({ library, data });
  latest.current = { library, data };

  const requireStore = useCallback((): LocalStore => {
    if (!store) throw new StorageUnavailableError();
    return store;
  }, [store]);

  /** Writes a batch and, once committed, applies it to the in-memory data. */
  const commit = useCallback(
    async (batch: WriteBatch) => {
      await requireStore().write(batch);
      setData((prev) => {
        const next = applyBatch(prev, batch);
        latest.current = { library: buildLibrary(base, next, base.collections), data: next };
        return next;
      });
    },
    [requireStore, base],
  );

  const add = useCallback((items: readonly Item[]) => commit({ items: { put: items } }), [commit]);
  const update = useCallback((item: Item) => commit({ items: { put: [item] } }), [commit]);
  const remove = useCallback(
    async (item: Item) => {
      if (!isLocal(item)) return;
      await commit({ items: { delete: [item.id] } });
    },
    [commit],
  );
  const setFavorites = useCallback((ids: readonly ItemId[], favorite: boolean) => commit(planFavorites(latest.current, ids, favorite)), [commit]);
  const setFavorite = useCallback((item: Item, favorite: boolean) => setFavorites([item.id], favorite), [setFavorites]);
  const savePrefs = useCallback(async (prefs: Preferences) => store?.putMeta(PREFS_KEY, prefs), [store]);

  const moveEntries = useCallback(
    async (ids: readonly string[], to: Placement) => {
      const plan = planMove(latest.current, ids, to);
      if (plan.moved) await commit(plan.batch);
      return plan;
    },
    [commit],
  );
  const duplicateEntries = useCallback(
    async (ids: readonly string[]) => {
      const plan = planDuplicate(latest.current, ids);
      if (plan.items.length || plan.folders.length) await commit(plan.batch);
      return { items: plan.items, folders: plan.folders };
    },
    [commit],
  );
  const deleteEntries = useCallback(
    async (ids: readonly string[]) => {
      const plan = planDelete(latest.current, ids);
      if (plan.bundle.items.length || plan.bundle.folders.length || plan.batch.meta) await commit(plan.batch);
      return plan.bundle;
    },
    [commit],
  );
  const restore = useCallback((bundle: DeletedBundle) => commit(planRestore(bundle)), [commit]);

  const createFolder = useCallback(
    async (input: FolderInput, entryIds: readonly string[] = []) => {
      const plan = planCreateFolder(latest.current, input, entryIds);
      await commit(plan.batch);
      return { folder: plan.folder, moved: plan.moved };
    },
    [commit],
  );
  const updateFolder = useCallback((id: FolderId, patch: Partial<Pick<Folder, 'name' | 'icon' | 'color'>>) => commit(planUpdateFolder(latest.current, id, patch)), [commit]);

  const createSpace = useCallback(
    async (input: SpaceInput) => {
      const plan = planCreateSpace(latest.current, input);
      await commit(plan.batch);
      return plan.space;
    },
    [commit],
  );
  const updateSpace = useCallback((id: SpaceId, patch: Partial<Omit<Space, 'id' | 'origin'>>) => commit(planUpdateSpace(latest.current, id, patch)), [commit]);
  const reorderSpaces = useCallback((orderedIds: readonly SpaceId[]) => commit(planReorderSpaces(latest.current, orderedIds)), [commit]);
  const deleteSpace = useCallback(
    async (id: SpaceId, disposition: SpaceDisposition) => {
      const plan = planDeleteSpace(latest.current, id, disposition);
      if (!plan) throw new Error('Space kann nicht gelöscht werden');
      await commit(plan.batch);
      return plan.bundle;
    },
    [commit],
  );

  const seedShowcase = useCallback(
    (mode: 'auto' | 'explicit') => {
      if (mode === 'auto' && showcaseSeeded) return Promise.resolve(0);
      // one seed at a time (StrictMode, double clicks): later calls share the running one
      seeding.current ??= (async () => {
        const now = new Date();
        const { data } = latest.current;
        const plan = planShowcase(
          {
            itemIds: new Set(data.local.map((i) => i.id)),
            folderIds: new Set(data.folders.map((f) => f.id)),
            spaceIds: new Set(data.spaceRecords.map((s) => s.id)),
          },
          buildShowcase(now, await createShowcaseMedia()),
          now,
        );
        await commit(plan.batch);
        setShowcaseSeeded(true);
        return plan.added;
      })().finally(() => {
        seeding.current = null;
      });
      return seeding.current;
    },
    [commit, showcaseSeeded],
  );
  const showcase = useMemo(() => ({ seeded: showcaseSeeded, present: !!library.getSpace(SHOWCASE_SPACE_ID) }), [showcaseSeeded, library]);

  return useMemo(
    () => ({
      library,
      persistent: !!store,
      savedPrefs,
      introPlayedAt,
      markIntroPlayed,
      add,
      update,
      remove,
      setFavorite,
      savePrefs,
      moveEntries,
      duplicateEntries,
      deleteEntries,
      restore,
      setFavorites,
      createFolder,
      updateFolder,
      createSpace,
      updateSpace,
      reorderSpaces,
      deleteSpace,
      showcase,
      seedShowcase,
    }),
    [library, store, savedPrefs, introPlayedAt, markIntroPlayed, add, update, remove, setFavorite, savePrefs, moveEntries, duplicateEntries, deleteEntries, restore, setFavorites, createFolder, updateFolder, createSpace, updateSpace, reorderSpaces, deleteSpace, showcase, seedShowcase],
  );
}
