import { useCallback, useMemo, useState } from 'react';
import type { LocalStore, StoreSnapshot } from '../data/store';
import { createLibrary, type ReadOnlyLibrary } from '../domain/library';
import { isLocal, type Item, type ItemId } from '../domain/types';
import type { Preferences } from './preferences';

// Writable workspace over the read-only library boundary: synthetic fixtures + the user's own items from the local store.
// Every mutation is written first and reflected in React state only after the store confirmed the commit.

export class StorageUnavailableError extends Error {
  constructor() {
    super('Local storage is unavailable');
  }
}

/** Favourite flags of fixture items (user items carry their own flag). */
type FavoriteOverrides = Readonly<Record<ItemId, boolean>>;

const FAVORITES_KEY = 'favorites';
const PREFS_KEY = 'prefs';

export interface WorkspaceSeed {
  readonly store: LocalStore | null;
  readonly snapshot?: StoreSnapshot;
}

export interface Workspace {
  readonly library: ReadOnlyLibrary;
  /** `false` when IndexedDB is unavailable (e.g. blocked storage); captures then fail visibly instead of pretending. */
  readonly persistent: boolean;
  readonly savedPrefs: Partial<Preferences> | undefined;
  add(items: readonly Item[]): Promise<void>;
  update(item: Item): Promise<void>;
  remove(item: Item): Promise<void>;
  setFavorite(item: Item, favorite: boolean): Promise<void>;
  savePrefs(prefs: Preferences): Promise<void>;
}

const byNewest = (a: Item, b: Item) => b.createdAt.localeCompare(a.createdAt);

export function useWorkspace(base: ReadOnlyLibrary, seed: WorkspaceSeed): Workspace {
  const { store, snapshot } = seed;
  const [local, setLocal] = useState<readonly Item[]>(() => snapshot?.items ?? []);
  const [favorites, setFavorites] = useState<FavoriteOverrides>(() => (snapshot?.meta.get(FAVORITES_KEY) as FavoriteOverrides) ?? {});
  const savedPrefs = snapshot?.meta.get(PREFS_KEY) as Partial<Preferences> | undefined;

  const library = useMemo(() => {
    const fixtures = base.allItems().map((item) => (item.id in favorites ? { ...item, favorite: !!favorites[item.id] } : item));
    return createLibrary(base.spaces, [...local, ...fixtures], base.collections);
  }, [base, local, favorites]);

  const requireStore = useCallback((): LocalStore => {
    if (!store) throw new StorageUnavailableError();
    return store;
  }, [store]);

  const add = useCallback(
    async (items: readonly Item[]) => {
      await requireStore().putItems(items);
      setLocal((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))].sort(byNewest));
    },
    [requireStore],
  );

  const update = useCallback(
    async (item: Item) => {
      await requireStore().putItems([item]);
      setLocal((prev) => prev.map((p) => (p.id === item.id ? item : p)));
    },
    [requireStore],
  );

  const remove = useCallback(
    async (item: Item) => {
      if (!isLocal(item)) return;
      await requireStore().deleteItem(item.id);
      setLocal((prev) => prev.filter((p) => p.id !== item.id));
    },
    [requireStore],
  );

  const setFavorite = useCallback(
    async (item: Item, favorite: boolean) => {
      if (isLocal(item)) {
        const next = { ...item, favorite };
        await requireStore().putItems([next]);
        setLocal((prev) => prev.map((p) => (p.id === item.id ? next : p)));
        return;
      }
      const next = { ...favorites, [item.id]: favorite };
      await requireStore().putMeta(FAVORITES_KEY, next);
      setFavorites(next);
    },
    [favorites, requireStore],
  );

  const savePrefs = useCallback(async (prefs: Preferences) => store?.putMeta(PREFS_KEY, prefs), [store]);

  return useMemo(
    () => ({ library, persistent: !!store, savedPrefs, add, update, remove, setFavorite, savePrefs }),
    [library, store, savedPrefs, add, update, remove, setFavorite, savePrefs],
  );
}
