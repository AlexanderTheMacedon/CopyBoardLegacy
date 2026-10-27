import type { SpaceRecord, WriteBatch } from '../data/store';
import { createLibrary, type ReadOnlyLibrary } from '../domain/library';
import {
  FOLDER_PREFIX,
  isFolderId,
  isLocal,
  type Collection,
  type Folder,
  type FolderId,
  type Item,
  type ItemId,
  type Placement,
  type Space,
  type SpaceColor,
  type SpaceIcon,
  type SpaceId,
  type SpacePrefs,
} from '../domain/types';

/**
 * Pure planning of every workspace mutation: given the stored data and a request, produce one atomic WriteBatch plus the
 * data after it. No IndexedDB, no React — fully unit-testable. The hook in workspace.ts writes the batch first and only
 * then applies it to React state.
 *
 * Fixture (demo) content is never rewritten: moving or favouriting a fixture item stores an override in `meta`,
 * editing a fixture space stores a full record in the `spaces` store, deleting one stores a tombstone. User data
 * (`origin: 'local'`) is stored as-is.
 */

export interface ItemOverride {
  readonly favorite?: boolean;
  readonly spaceId?: SpaceId;
  readonly folderId?: FolderId | null;
}

export type ItemOverrides = Readonly<Record<ItemId, ItemOverride>>;

export interface WorkspaceData {
  /** The user's own items (origin local). */
  readonly local: readonly Item[];
  readonly overrides: ItemOverrides;
  readonly spaceRecords: readonly SpaceRecord[];
  readonly folders: readonly Folder[];
}

export const OVERRIDES_KEY = 'itemOverrides';
/** Pre-v2 favourites map (fixture item id → flag); read once and folded into the overrides. */
export const LEGACY_FAVORITES_KEY = 'favorites';
export const PREFS_KEY = 'prefs';

export const emptyData: WorkspaceData = { local: [], overrides: {}, spaceRecords: [], folders: [] };

const uuid = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const newItemId = (): ItemId => `it-local-${uuid()}`;
export const newFolderId = (): FolderId => `${FOLDER_PREFIX}${uuid()}`;
export const newSpaceId = (): SpaceId => `sp-local-${uuid()}`;

const now = () => new Date().toISOString();

/** Fixture favourites written by earlier versions become overrides; nothing is lost when both exist. */
export function restoreOverrides(meta: ReadonlyMap<string, unknown>): ItemOverrides {
  const legacy = (meta.get(LEGACY_FAVORITES_KEY) as Readonly<Record<ItemId, boolean>> | undefined) ?? {};
  const stored = (meta.get(OVERRIDES_KEY) as ItemOverrides | undefined) ?? {};
  const merged: Record<ItemId, ItemOverride> = {};
  for (const [id, favorite] of Object.entries(legacy)) merged[id] = { favorite };
  for (const [id, override] of Object.entries(stored)) merged[id] = { ...merged[id], ...override };
  return merged;
}

/** Spaces as the UI sees them: fixtures (with stored overrides, minus tombstones) plus user spaces, in display order. */
export function mergeSpaces(fixtures: readonly Space[], records: readonly SpaceRecord[]): Space[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const fixtureIds = new Set(fixtures.map((s) => s.id));
  const merged: Space[] = [];
  fixtures.forEach((space, index) => {
    const record = byId.get(space.id);
    if (record?.hidden) return;
    const { hidden: _hidden, ...rest } = record ?? {};
    merged.push({ ...space, ...rest, order: record?.order ?? index });
  });
  for (const record of records) {
    if (fixtureIds.has(record.id) || record.hidden) continue;
    const { hidden: _hidden, ...space } = record;
    merged.push({ ...space, origin: 'local', order: record.order ?? merged.length });
  }
  return merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const applyOverride = (item: Item, override: ItemOverride | undefined): Item =>
  override
    ? {
        ...item,
        ...(override.favorite !== undefined ? { favorite: override.favorite } : {}),
        ...(override.spaceId !== undefined ? { spaceId: override.spaceId } : {}),
        ...(override.folderId !== undefined ? { folderId: override.folderId } : {}),
      }
    : item;

/** Library over fixtures + user data. Items of a deleted space vanish with it; items in a vanished folder fall to the board. */
export function buildLibrary(base: ReadOnlyLibrary, data: WorkspaceData, collections: readonly Collection[]): ReadOnlyLibrary {
  const spaces = mergeSpaces(base.spaces, data.spaceRecords);
  const spaceIds = new Set(spaces.map((s) => s.id));
  const folderIds = new Set(data.folders.map((f) => f.id));
  const fixtures = base.allItems().map((item) => applyOverride(item, data.overrides[item.id]));
  const items = [...data.local, ...fixtures]
    .filter((item) => spaceIds.has(item.spaceId))
    .map((item) => (item.folderId && !folderIds.has(item.folderId) ? { ...item, folderId: null } : item));
  const folders = data.folders.filter((f) => spaceIds.has(f.spaceId));
  return createLibrary(spaces, items, collections, folders);
}

/** Applies a planned batch to the in-memory data (the store has already committed it). */
export function applyBatch(data: WorkspaceData, batch: WriteBatch): WorkspaceData {
  let { local, folders, spaceRecords, overrides } = data;
  if (batch.items) {
    const deleted = new Set(batch.items.delete ?? []);
    const put = new Map((batch.items.put ?? []).map((i) => [i.id, i]));
    local = [...put.values(), ...local.filter((i) => !deleted.has(i.id) && !put.has(i.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  if (batch.folders) {
    const deleted = new Set(batch.folders.delete ?? []);
    const put = new Map((batch.folders.put ?? []).map((f) => [f.id, f]));
    folders = [...folders.filter((f) => !deleted.has(f.id) && !put.has(f.id)), ...put.values()];
  }
  if (batch.spaces) {
    const deleted = new Set(batch.spaces.delete ?? []);
    const put = new Map((batch.spaces.put ?? []).map((s) => [s.id, s]));
    spaceRecords = [...spaceRecords.filter((s) => !deleted.has(s.id) && !put.has(s.id)), ...put.values()];
  }
  if (batch.meta && OVERRIDES_KEY in batch.meta) overrides = batch.meta[OVERRIDES_KEY] as ItemOverrides;
  return { local, overrides, spaceRecords, folders };
}

/** Merges two batches that touch disjoint or compatible records (later entries win). */
export function mergeBatches(...batches: readonly WriteBatch[]): WriteBatch {
  const out: { items: { put: Item[]; delete: string[] }; folders: { put: Folder[]; delete: string[] }; spaces: { put: SpaceRecord[]; delete: string[] }; meta: Record<string, unknown> } = {
    items: { put: [], delete: [] },
    folders: { put: [], delete: [] },
    spaces: { put: [], delete: [] },
    meta: {},
  };
  let hasItems = false;
  let hasFolders = false;
  let hasSpaces = false;
  let hasMeta = false;
  for (const b of batches) {
    if (b.items) {
      hasItems = true;
      out.items.put.push(...(b.items.put ?? []));
      out.items.delete.push(...(b.items.delete ?? []));
    }
    if (b.folders) {
      hasFolders = true;
      out.folders.put.push(...(b.folders.put ?? []));
      out.folders.delete.push(...(b.folders.delete ?? []));
    }
    if (b.spaces) {
      hasSpaces = true;
      out.spaces.put.push(...(b.spaces.put ?? []));
      out.spaces.delete.push(...(b.spaces.delete ?? []));
    }
    if (b.meta) {
      hasMeta = true;
      Object.assign(out.meta, b.meta);
    }
  }
  return {
    ...(hasItems ? { items: out.items } : {}),
    ...(hasFolders ? { folders: out.folders } : {}),
    ...(hasSpaces ? { spaces: out.spaces } : {}),
    ...(hasMeta ? { meta: out.meta } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Planning context: the current library (merged view) plus the raw data.

export interface PlanContext {
  readonly library: ReadOnlyLibrary;
  readonly data: WorkspaceData;
}

const withOverride = (overrides: ItemOverrides, id: ItemId, patch: ItemOverride): ItemOverrides => ({
  ...overrides,
  [id]: { ...overrides[id], ...patch },
});

/** Result of a move: how many entries changed place and which ids were refused (cycles, unknown ids). */
export interface MovePlan {
  readonly batch: WriteBatch;
  readonly moved: number;
  readonly skipped: readonly string[];
}

/** Would placing `folderId` under `target` create a cycle (target is the folder itself or one of its descendants)? */
export function wouldCycle(library: ReadOnlyLibrary, folderId: FolderId, target: FolderId | null): boolean {
  if (!target) return false;
  if (target === folderId) return true;
  return library.descendantFolders(folderId).some((f) => f.id === target);
}

/**
 * Moves items and folders to a placement. Folders carry their whole subtree (and all items in it) along, also across
 * spaces. Fixture items move via overrides. Entries already at the target are counted as moved (idempotent).
 */
export function planMove({ library, data }: PlanContext, ids: readonly string[], to: Placement): MovePlan {
  const itemsPut = new Map<ItemId, Item>();
  const foldersPut = new Map<FolderId, Folder>();
  let overrides = data.overrides;
  const skipped: string[] = [];
  let moved = 0;
  if (!library.getSpace(to.spaceId) || (to.folderId && library.getFolder(to.folderId)?.spaceId !== to.spaceId)) {
    return { batch: {}, moved: 0, skipped: [...ids] };
  }
  const stamp = now();

  const placeItem = (item: Item, placement: Placement) => {
    if (isLocal(item)) itemsPut.set(item.id, { ...item, spaceId: placement.spaceId, folderId: placement.folderId });
    else overrides = withOverride(overrides, item.id, { spaceId: placement.spaceId, folderId: placement.folderId });
  };

  // Folders first: a folder dragged together with its own content must not have that content re-placed afterwards.
  const folderIds = ids.filter(isFolderId);
  const movedSubtree = new Set<FolderId>();
  for (const id of folderIds) {
    const folder = library.getFolder(id);
    if (!folder || wouldCycle(library, id, to.folderId)) {
      skipped.push(id);
      continue;
    }
    foldersPut.set(id, { ...folder, spaceId: to.spaceId, parentId: to.folderId, updatedAt: stamp });
    movedSubtree.add(id);
    moved++;
    if (folder.spaceId !== to.spaceId) {
      for (const sub of library.descendantFolders(id)) {
        foldersPut.set(sub.id, { ...sub, spaceId: to.spaceId });
        movedSubtree.add(sub.id);
      }
      for (const item of library.folderItems(id)) placeItem(item, { spaceId: to.spaceId, folderId: item.folderId ?? null });
    } else for (const sub of library.descendantFolders(id)) movedSubtree.add(sub.id);
  }
  for (const id of ids) {
    if (isFolderId(id)) continue;
    const item = library.getItem(id);
    if (!item) {
      skipped.push(id);
      continue;
    }
    // An item inside a folder that was just moved travels with that folder.
    if (item.folderId && movedSubtree.has(item.folderId)) continue;
    placeItem(item, to);
    moved++;
  }
  const batch: WriteBatch = {
    ...(itemsPut.size ? { items: { put: [...itemsPut.values()] } } : {}),
    ...(foldersPut.size ? { folders: { put: [...foldersPut.values()] } } : {}),
    ...(overrides !== data.overrides ? { meta: { [OVERRIDES_KEY]: overrides } } : {}),
  };
  return { batch, moved, skipped };
}

export interface FolderInput {
  readonly spaceId: SpaceId;
  readonly parentId: FolderId | null;
  readonly name: string;
  readonly icon?: SpaceIcon;
  readonly color?: SpaceColor;
}

/** Creates a folder and, optionally, moves entries into it in the same batch (drop card on card, "Ordner aus Auswahl"). */
export function planCreateFolder(ctx: PlanContext, input: FolderInput, entryIds: readonly string[] = []): { batch: WriteBatch; folder: Folder; moved: number } {
  const stamp = now();
  const folder: Folder = {
    id: newFolderId(),
    spaceId: input.spaceId,
    parentId: input.parentId,
    name: input.name.trim() || 'Neuer Ordner',
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.color ? { color: input.color } : {}),
    createdAt: stamp,
    updatedAt: stamp,
  };
  const create: WriteBatch = { folders: { put: [folder] } };
  if (!entryIds.length) return { batch: create, folder, moved: 0 };
  // Plan the move against a library that already knows the new folder, so the target placement validates.
  const data = applyBatch(ctx.data, create);
  const library = createLibrary(ctx.library.spaces, ctx.library.allItems(), ctx.library.collections, data.folders);
  const move = planMove({ library, data }, entryIds, { spaceId: folder.spaceId, folderId: folder.id });
  return { batch: mergeBatches(create, move.batch), folder, moved: move.moved };
}

export function planUpdateFolder({ library }: PlanContext, id: FolderId, patch: Partial<Pick<Folder, 'name' | 'icon' | 'color'>>): WriteBatch {
  const folder = library.getFolder(id);
  if (!folder) return {};
  const name = patch.name !== undefined ? patch.name.trim() || folder.name : folder.name;
  const next: Folder = { ...folder, ...patch, name, updatedAt: now() };
  return { folders: { put: [next] } };
}

/** Everything a delete removed, so it can be restored verbatim (undo). */
export interface DeletedBundle {
  readonly items: readonly Item[];
  readonly folders: readonly Folder[];
  /** Overrides as they were before the delete (fixture items that were moved out of a deleted folder). */
  readonly overrides: ItemOverrides;
  /** Fixture items that could not be deleted and were left in place. */
  readonly keptFixtures: number;
}

/**
 * Deletes items and folders (folders with their whole subtree). Fixture items are user-independent demo content: they are
 * never deleted; inside a deleted folder they fall back to the board level of their space.
 */
export function planDelete({ library, data }: PlanContext, ids: readonly string[]): { batch: WriteBatch; bundle: DeletedBundle } {
  const items = new Map<ItemId, Item>();
  const folders = new Map<FolderId, Folder>();
  let overrides = data.overrides;
  let keptFixtures = 0;
  const dropItem = (item: Item) => {
    if (isLocal(item)) items.set(item.id, item);
    else keptFixtures++;
  };
  for (const id of ids) {
    if (isFolderId(id)) {
      const folder = library.getFolder(id);
      if (!folder) continue;
      folders.set(id, folder);
      for (const sub of library.descendantFolders(id)) folders.set(sub.id, sub);
      for (const item of library.folderItems(id)) {
        if (isLocal(item)) items.set(item.id, item);
        else {
          keptFixtures++;
          overrides = withOverride(overrides, item.id, { folderId: null });
        }
      }
    } else {
      const item = library.getItem(id);
      if (item) dropItem(item);
    }
  }
  const batch: WriteBatch = {
    ...(items.size ? { items: { delete: [...items.keys()] } } : {}),
    ...(folders.size ? { folders: { delete: [...folders.keys()] } } : {}),
    ...(overrides !== data.overrides ? { meta: { [OVERRIDES_KEY]: overrides } } : {}),
  };
  return {
    batch,
    bundle: { items: [...items.values()], folders: [...folders.values()], overrides: data.overrides, keptFixtures },
  };
}

export function planRestore(bundle: DeletedBundle): WriteBatch {
  return {
    ...(bundle.items.length ? { items: { put: bundle.items } } : {}),
    ...(bundle.folders.length ? { folders: { put: bundle.folders } } : {}),
    meta: { [OVERRIDES_KEY]: bundle.overrides },
  };
}

const copyOf = (item: Item, placement: Placement, stamp: string, suffix: string): Item => ({
  ...item,
  id: newItemId(),
  spaceId: placement.spaceId,
  folderId: placement.folderId,
  title: suffix ? `${item.title} ${suffix}` : item.title,
  createdAt: stamp,
  updatedAt: stamp,
  origin: 'local',
});

/**
 * Duplicates entries next to their originals. Items become user items (copies of fixtures are real, editable data);
 * folders are copied with their whole subtree. Blobs are shared references: IndexedDB stores each record's own copy.
 */
export function planDuplicate({ library }: PlanContext, ids: readonly string[]): { batch: WriteBatch; items: Item[]; folders: Folder[] } {
  const stamp = now();
  const items: Item[] = [];
  const folders: Folder[] = [];
  let tick = 0;
  // Spread timestamps by a millisecond so duplicates keep a stable newest-first order.
  const next = () => new Date(new Date(stamp).getTime() + tick++).toISOString();

  const copyFolder = (folder: Folder, parent: Placement, rename: boolean) => {
    const copy: Folder = { ...folder, id: newFolderId(), spaceId: parent.spaceId, parentId: parent.folderId, name: rename ? `${folder.name} Kopie` : folder.name, createdAt: next(), updatedAt: stamp };
    folders.push(copy);
    const children = library.listChildren({ spaceId: folder.spaceId, folderId: folder.id });
    for (const item of children.items) items.push(copyOf(item, { spaceId: copy.spaceId, folderId: copy.id }, next(), ''));
    for (const sub of children.folders) copyFolder(sub, { spaceId: copy.spaceId, folderId: copy.id }, false);
  };

  for (const id of ids) {
    if (isFolderId(id)) {
      const folder = library.getFolder(id);
      if (folder) copyFolder(folder, { spaceId: folder.spaceId, folderId: folder.parentId }, true);
    } else {
      const item = library.getItem(id);
      if (item) items.push(copyOf(item, { spaceId: item.spaceId, folderId: item.folderId ?? null }, next(), 'Kopie'));
    }
  }
  return {
    batch: {
      ...(items.length ? { items: { put: items } } : {}),
      ...(folders.length ? { folders: { put: folders } } : {}),
    },
    items,
    folders,
  };
}

export function planFavorites({ library, data }: PlanContext, ids: readonly ItemId[], favorite: boolean): WriteBatch {
  const put: Item[] = [];
  let overrides = data.overrides;
  for (const id of ids) {
    const item = library.getItem(id);
    if (!item || item.favorite === favorite) continue;
    if (isLocal(item)) put.push({ ...item, favorite });
    else overrides = withOverride(overrides, id, { favorite });
  }
  return {
    ...(put.length ? { items: { put } } : {}),
    ...(overrides !== data.overrides ? { meta: { [OVERRIDES_KEY]: overrides } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Spaces

export interface SpaceInput {
  readonly name: string;
  readonly color: SpaceColor;
  readonly icon?: SpaceIcon;
  readonly description?: string;
  readonly prefs?: SpacePrefs;
}

export function planCreateSpace({ library }: PlanContext, input: SpaceInput): { batch: WriteBatch; space: Space } {
  const order = Math.max(-1, ...library.spaces.map((s) => s.order ?? 0)) + 1;
  const space: Space = {
    id: newSpaceId(),
    name: input.name.trim() || 'Neuer Space',
    color: input.color,
    description: input.description ?? '',
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.prefs ? { prefs: input.prefs } : {}),
    order,
    origin: 'local',
  };
  return { batch: { spaces: { put: [space] } }, space };
}

/** Fixture spaces get a full stored record (their override); user spaces are rewritten. */
export function planUpdateSpace({ library }: PlanContext, id: SpaceId, patch: Partial<Omit<Space, 'id' | 'origin'>>): WriteBatch {
  const space = library.getSpace(id);
  if (!space) return {};
  const name = patch.name !== undefined ? patch.name.trim() || space.name : space.name;
  const next: Space = { ...space, ...patch, name, ...(patch.prefs ? { prefs: { ...space.prefs, ...patch.prefs } } : {}) };
  return { spaces: { put: [next] } };
}

/** Persists a complete display order; unknown ids are ignored, missing ones keep their relative place at the end. */
export function planReorderSpaces({ library }: PlanContext, orderedIds: readonly SpaceId[]): WriteBatch {
  const known = new Set(library.spaces.map((s) => s.id));
  const order = [...orderedIds.filter((id) => known.has(id)), ...library.spaces.map((s) => s.id).filter((id) => !orderedIds.includes(id))];
  const put: SpaceRecord[] = [];
  order.forEach((id, index) => {
    const space = library.getSpace(id);
    if (space && space.order !== index) put.push({ ...space, order: index });
  });
  return put.length ? { spaces: { put } } : {};
}

export type SpaceDisposition = { readonly moveTo: SpaceId } | { readonly deleteContents: true };

/**
 * Deletes a space. Its folders and items either move to another space (folders keep their hierarchy, top-level folders and
 * items land on that space's board) or are deleted (fixture items then vanish with their fixture space). The last space
 * can never be deleted. A fixture space leaves a tombstone so it stays hidden after reload.
 */
export function planDeleteSpace(ctx: PlanContext, id: SpaceId, disposition: SpaceDisposition): { batch: WriteBatch; bundle: DeletedBundle } | null {
  const { library, data } = ctx;
  const space = library.getSpace(id);
  if (!space || library.spaces.length <= 1) return null;
  if ('moveTo' in disposition && (disposition.moveTo === id || !library.getSpace(disposition.moveTo))) return null;
  const items = library.listItems({ type: 'space', spaceId: id });
  const folders = library.folders.filter((f) => f.spaceId === id);
  const record: SpaceRecord = space.origin === 'local' ? space : { ...space, hidden: true };
  const tombstone: WriteBatch = space.origin === 'local' ? { spaces: { delete: [id] } } : { spaces: { put: [record] } };

  if ('moveTo' in disposition) {
    const target = disposition.moveTo;
    const stamp = now();
    const put: Item[] = [];
    let overrides = data.overrides;
    for (const item of items) {
      const placement: Placement = { spaceId: target, folderId: item.folderId ?? null };
      if (isLocal(item)) put.push({ ...item, ...placement });
      else overrides = withOverride(overrides, item.id, placement);
    }
    const movedFolders = folders.map((f) => ({ ...f, spaceId: target, updatedAt: stamp }));
    const batch = mergeBatches(
      tombstone,
      put.length ? { items: { put } } : {},
      movedFolders.length ? { folders: { put: movedFolders } } : {},
      overrides !== data.overrides ? { meta: { [OVERRIDES_KEY]: overrides } } : {},
    );
    return { batch, bundle: { items: [], folders: [], overrides: data.overrides, keptFixtures: 0 } };
  }
  const local = items.filter(isLocal);
  const batch = mergeBatches(
    tombstone,
    local.length ? { items: { delete: local.map((i) => i.id) } } : {},
    folders.length ? { folders: { delete: folders.map((f) => f.id) } } : {},
  );
  return { batch, bundle: { items: local, folders, overrides: data.overrides, keptFixtures: items.length - local.length } };
}
