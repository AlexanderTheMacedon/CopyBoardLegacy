import type { Collection, Folder, FolderId, Item, ItemId, Location, Placement, Space, SpaceId } from './types';

/**
 * Read-only data boundary (ADR-007 §4): UI components only see this interface. The writable workspace (app/workspace.ts)
 * produces a new library after every committed change. There is intentionally no write method.
 */
export interface ReadOnlyLibrary {
  readonly spaces: readonly Space[];
  readonly folders: readonly Folder[];
  readonly collections: readonly Collection[];
  getSpace(id: SpaceId): Space | undefined;
  getItem(id: ItemId): Item | undefined;
  getFolder(id: FolderId): Folder | undefined;
  /** Every item of a space (all folder levels) or collection in stable display order (identical for grid and list, D-023). */
  listItems(location: Location): readonly Item[];
  /** Every item across all spaces, in display order. */
  allItems(): readonly Item[];
  /** Direct children of a placement: its sub-folders and the items that sit exactly on that level. */
  listChildren(placement: Placement): { readonly folders: readonly Folder[]; readonly items: readonly Item[] };
  /** Breadcrumb from the top-level folder down to the given folder (inclusive). */
  folderPath(id: FolderId): readonly Folder[];
  /** All folders below a folder (any depth), in breadth-first order. */
  descendantFolders(id: FolderId): readonly Folder[];
  /** Items in a folder and all of its sub-folders. */
  folderItems(id: FolderId): readonly Item[];
}

const RECENT_LIMIT = 8;

const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });

export function createLibrary(
  spaces: readonly Space[],
  items: readonly Item[],
  collections: readonly Collection[],
  folders: readonly Folder[] = [],
): ReadOnlyLibrary {
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const childrenOf = new Map<string, Folder[]>();
  for (const folder of folders) {
    const key = `${folder.spaceId}/${folder.parentId ?? ''}`;
    const list = childrenOf.get(key) ?? [];
    list.push(folder);
    childrenOf.set(key, list);
  }
  for (const list of childrenOf.values()) list.sort(byName);

  const byCollection = (id: Collection['id']): readonly Item[] => {
    switch (id) {
      case 'all':
        return items;
      case 'favorites':
        return items.filter((i) => i.favorite);
      case 'recent':
        return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT);
      case 'sessions':
        return [];
    }
  };

  const descendantFolders = (id: FolderId): Folder[] => {
    const out: Folder[] = [];
    const root = folderById.get(id);
    if (!root) return out;
    const queue = [root];
    while (queue.length) {
      const current = queue.shift()!;
      const kids = childrenOf.get(`${current.spaceId}/${current.id}`) ?? [];
      out.push(...kids);
      queue.push(...kids);
    }
    return out;
  };

  return {
    spaces,
    folders,
    collections,
    getSpace: (id) => spaceById.get(id),
    getItem: (id) => itemById.get(id),
    getFolder: (id) => folderById.get(id),
    listItems: (location) =>
      location.type === 'space' ? items.filter((i) => i.spaceId === location.spaceId) : byCollection(location.collectionId),
    allItems: () => items,
    listChildren: ({ spaceId, folderId }) => ({
      folders: childrenOf.get(`${spaceId}/${folderId ?? ''}`) ?? [],
      items: items.filter((i) => i.spaceId === spaceId && (i.folderId ?? null) === folderId),
    }),
    folderPath: (id) => {
      const path: Folder[] = [];
      let current = folderById.get(id);
      // Guard against a corrupted parent chain: never loop forever.
      while (current && path.length < 64) {
        path.unshift(current);
        current = current.parentId ? folderById.get(current.parentId) : undefined;
      }
      return path;
    },
    descendantFolders,
    folderItems: (id) => {
      const ids = new Set([id, ...descendantFolders(id).map((f) => f.id)]);
      return items.filter((i) => !!i.folderId && ids.has(i.folderId));
    },
  };
}
