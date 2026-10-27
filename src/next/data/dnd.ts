import type { Placement } from '../domain/types';

/**
 * Internal drag session for cards and folders. Native HTML5 drag and drop carries only a marker type in the DataTransfer;
 * the payload lives here, because `dataTransfer` is readable only on drop and this module must stay free of clipboard access
 * (data/clipboard.ts is the only reader of transfer contents). External file drags never create a session.
 */

export const INTERNAL_TYPE = 'application/x-copyboard-ids';

export interface DragPayload {
  /** Item and folder ids being dragged (folders by their `fd-` id). */
  readonly ids: readonly string[];
  /** Where the dragged entries come from. */
  readonly from: Placement;
}

let session: DragPayload | null = null;
const listeners = new Set<(payload: DragPayload | null) => void>();

const emit = () => {
  for (const listener of listeners) listener(session);
};

export function beginDrag(payload: DragPayload): void {
  session = payload;
  emit();
}

export function endDrag(): void {
  if (!session) return;
  session = null;
  emit();
}

export const currentDrag = (): DragPayload | null => session;

export function subscribeDrag(listener: (payload: DragPayload | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True for a drag that started inside the app (cards, folders); false for files from outside. */
export const isInternalDrag = (data: DataTransfer | null): boolean =>
  !!session || (!!data && [...data.types].includes(INTERNAL_TYPE));
