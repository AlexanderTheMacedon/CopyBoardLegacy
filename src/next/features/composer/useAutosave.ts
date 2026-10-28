import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreview } from '../../app/context';
import type { Item } from '../../domain/types';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export const AUTOSAVE_MS = 500;

/** Fields an editor changes; merged into the latest committed record at write time. */
export type ItemPatch = Partial<Pick<Item, 'title'>> & Record<string, unknown>;

export interface Autosave {
  readonly state: SaveState;
  /** Something changed: marks the draft dirty and (re)starts the debounce. Cheap enough for every keystroke. */
  touch(): void;
  /** Writes everything pending, one commit at a time. Resolves `true` when nothing is left unsaved. */
  flush(): Promise<boolean>;
  /** Gives up the unsaved edits (the user chose to close despite a failed save). */
  discard(): void;
}

const failureText = (error: unknown): string =>
  error instanceof DOMException && error.name === 'QuotaExceededError'
    ? 'Der lokale Speicher ist voll. Die Änderungen sind noch im Editor.'
    : 'Speichern ist fehlgeschlagen. Die Änderungen sind noch im Editor.';

/**
 * One persistence abstraction for every Canvas editor. The editor owns its draft and hands over a `collect()` that reads it
 * at write time, so a write always carries the newest keystrokes and never a stale snapshot:
 *  - writes are serialised (one commit in flight; edits made meanwhile trigger exactly one follow-up write),
 *  - each write merges the patch into the *latest committed* record, so favourites, tags or folder moves made in between survive,
 *  - "saved" is reported only after the IndexedDB commit; a failure keeps the draft, says so, and can be retried,
 *  - leaving (unmount, close, item switch) flushes first; a failure that nobody can see any more is announced globally.
 */
export function useAutosave(itemId: string, writable: boolean, collect: () => ItemPatch): Autosave {
  const { workspace, library, notify } = usePreview();
  const [state, setState] = useState<SaveState>('saved');
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const lastWritten = useRef<Item | undefined>(undefined);
  const mounted = useRef(true);
  const refs = useRef({ collect, library, workspace, notify, writable });
  refs.current = { collect, library, workspace, notify, writable };

  const flush = useCallback((): Promise<boolean> => {
    window.clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      while (revision.current !== savedRevision.current) {
        const { collect: read, library: lib, workspace: ws, writable: canWrite } = refs.current;
        if (!canWrite) return true;
        const target = revision.current;
        const patch = read();
        const fresh = lib.getItem(itemId);
        if (!fresh) return true; // deleted while editing: nothing left to save into
        // the library may lag one render behind our own previous commit; never write on top of an older record
        const written = lastWritten.current;
        const base = written && written.updatedAt > fresh.updatedAt ? written : fresh;
        const record = { ...base, ...patch, updatedAt: new Date().toISOString() } as Item;
        if (mounted.current) setState('saving');
        try {
          await ws.update(record);
          lastWritten.current = record;
          savedRevision.current = target;
        } catch (error) {
          if (mounted.current) setState('error');
          else refs.current.notify(failureText(error), { tone: 'error' });
          return false;
        }
      }
      if (mounted.current) setState('saved');
      return true;
    });
    return chain.current;
  }, [itemId]);

  const touch = useCallback(() => {
    if (!refs.current.writable) return;
    revision.current += 1;
    setState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  const discard = useCallback(() => {
    window.clearTimeout(timer.current);
    savedRevision.current = revision.current;
  }, []);

  // Leaving the editor never drops the last keystrokes.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flush();
    };
  }, [flush]);

  // Reload/tab close while something is unsaved: the browser asks first (best effort; IndexedDB cannot finish after unload).
  useEffect(() => {
    if (state === 'saved') return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    const hide = () => void flush();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('beforeunload', guard);
      window.removeEventListener('pagehide', hide);
    };
  }, [state, flush]);

  return { state, touch, flush, discard };
}
