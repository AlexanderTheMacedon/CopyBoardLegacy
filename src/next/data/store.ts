import type { Item, ItemId } from '../domain/types';

/**
 * Local persistence of the React app (Blueprint 05 target candidate: IndexedDB records with binary Blobs).
 * Own database, separate from the legacy app's state blob: legacy data is never read, changed or deleted here.
 * Every write resolves only after the transaction has committed (`complete`), so the UI never reports a save that did not
 * happen. Captured binaries are stored as Blobs inside the item record; nothing is uploaded anywhere.
 */

const DB_NAME = 'copyboard-next';
const DB_VERSION = 1;
const ITEMS = 'items';
const META = 'meta';

export interface StoreSnapshot {
  /** User items, newest first. */
  readonly items: readonly Item[];
  readonly meta: ReadonlyMap<string, unknown>;
}

export interface LocalStore {
  load(): Promise<StoreSnapshot>;
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

function open(): Promise<IDBDatabase> {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
  };
  return request(req);
}

export async function openLocalStore(): Promise<LocalStore> {
  const db = await open();
  const write = (stores: string | string[]) => db.transaction(stores, 'readwrite', { durability: 'strict' });

  return {
    async load() {
      const tx = db.transaction([ITEMS, META], 'readonly');
      const [items, keys, values] = await Promise.all([
        request(tx.objectStore(ITEMS).getAll() as IDBRequest<Item[]>),
        request(tx.objectStore(META).getAllKeys()),
        request(tx.objectStore(META).getAll()),
      ]);
      const meta = new Map<string, unknown>(keys.map((key, i) => [String(key), values[i]]));
      return { items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), meta };
    },
    async putItems(items) {
      const tx = write(ITEMS);
      const store = tx.objectStore(ITEMS);
      for (const item of items) store.put(item);
      await committed(tx);
    },
    async deleteItem(id) {
      const tx = write(ITEMS);
      tx.objectStore(ITEMS).delete(id);
      await committed(tx);
    },
    async putMeta(key, value) {
      const tx = write(META);
      tx.objectStore(META).put(value, key);
      await committed(tx);
    },
  };
}
