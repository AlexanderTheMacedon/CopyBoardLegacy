import type { Folder, FolderId, Item, ItemId, Space, SpaceId } from '../domain/types';

/**
 * Local persistence of the React app (Blueprint 05 target candidate: IndexedDB records with binary Blobs).
 * Own database, separate from the legacy app's state blob: legacy data is never read, changed or deleted here.
 * Every write resolves only after the transaction has committed (`complete`), so the UI never reports a save that did not
 * happen. Captured binaries are stored as Blobs inside the item record; nothing is uploaded anywhere.
 *
 * Schema history (migrations run inside the atomic upgrade transaction and only ever add object stores):
 *   v1  items (keyPath id), meta (out-of-line keys)
 *   v2  + spaces (keyPath id: user spaces and overrides of fixture spaces), + folders (keyPath id)
 *       Items keep their records unchanged; an item without `folderId` sits on the board level.
 */

const DB_NAME = 'copyboard-next';
const DB_VERSION = 2;
const ITEMS = 'items';
const META = 'meta';
const SPACES = 'spaces';
const FOLDERS = 'folders';

/** Stored space: a user space (`origin: 'local'`) or the override/tombstone of a fixture space (`hidden`). */
export interface SpaceRecord extends Space {
  readonly hidden?: boolean;
}

export interface StoreSnapshot {
  /** User items, newest first. */
  readonly items: readonly Item[];
  readonly meta: ReadonlyMap<string, unknown>;
  readonly spaces: readonly SpaceRecord[];
  readonly folders: readonly Folder[];
}

/** One atomic write across stores: everything in it commits together or not at all. */
export interface WriteBatch {
  readonly items?: { readonly put?: readonly Item[]; readonly delete?: readonly ItemId[] };
  readonly folders?: { readonly put?: readonly Folder[]; readonly delete?: readonly FolderId[] };
  readonly spaces?: { readonly put?: readonly SpaceRecord[]; readonly delete?: readonly SpaceId[] };
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface LocalStore {
  load(): Promise<StoreSnapshot>;
  write(batch: WriteBatch): Promise<void>;
  putItems(items: readonly Item[]): Promise<void>;
  deleteItem(id: ItemId): Promise<void>;
  putMeta(key: string, value: unknown): Promise<void>;
}

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

/** Resolves when the transaction is durably committed; rejects on error, abort or quota exhaustion. */
const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/** Creates the stores a schema version needs. Idempotent: an interrupted upgrade simply runs again. */
export function upgradeSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' });
  if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
  if (!db.objectStoreNames.contains(SPACES)) db.createObjectStore(SPACES, { keyPath: 'id' });
  if (!db.objectStoreNames.contains(FOLDERS)) db.createObjectStore(FOLDERS, { keyPath: 'id' });
}

function open(): Promise<IDBDatabase> {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => upgradeSchema(req.result);
  return request(req).then((db) => {
    // Another tab upgrading the schema must not be blocked by this connection.
    db.onversionchange = () => db.close();
    return db;
  });
}

const stores = (batch: WriteBatch): string[] => {
  const names: string[] = [];
  if (batch.items) names.push(ITEMS);
  if (batch.folders) names.push(FOLDERS);
  if (batch.spaces) names.push(SPACES);
  if (batch.meta) names.push(META);
  return names;
};

export async function openLocalStore(): Promise<LocalStore> {
  const db = await open();
  const write = (names: string | string[]) => db.transaction(names, 'readwrite', { durability: 'strict' });

  const writeBatch = async (batch: WriteBatch) => {
    const names = stores(batch);
    if (!names.length) return;
    const tx = write(names);
    const apply = <T>(name: string, put?: readonly T[], del?: readonly string[]) => {
      const store = tx.objectStore(name);
      for (const record of put ?? []) store.put(record);
      for (const id of del ?? []) store.delete(id);
    };
    if (batch.items) apply(ITEMS, batch.items.put, batch.items.delete);
    if (batch.folders) apply(FOLDERS, batch.folders.put, batch.folders.delete);
    if (batch.spaces) apply(SPACES, batch.spaces.put, batch.spaces.delete);
    if (batch.meta) for (const [key, value] of Object.entries(batch.meta)) tx.objectStore(META).put(value, key);
    await committed(tx);
  };

  return {
    async load() {
      const tx = db.transaction([ITEMS, META, SPACES, FOLDERS], 'readonly');
      const [items, keys, values, spaces, folders] = await Promise.all([
        request(tx.objectStore(ITEMS).getAll() as IDBRequest<Item[]>),
        request(tx.objectStore(META).getAllKeys()),
        request(tx.objectStore(META).getAll()),
        request(tx.objectStore(SPACES).getAll() as IDBRequest<SpaceRecord[]>),
        request(tx.objectStore(FOLDERS).getAll() as IDBRequest<Folder[]>),
      ]);
      const meta = new Map<string, unknown>(keys.map((key, i) => [String(key), values[i]]));
      return { items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), meta, spaces, folders };
    },
    write: writeBatch,
    putItems: (items) => writeBatch({ items: { put: items } }),
    deleteItem: (id) => writeBatch({ items: { delete: [id] } }),
    putMeta: (key, value) => writeBatch({ meta: { [key]: value } }),
  };
}
