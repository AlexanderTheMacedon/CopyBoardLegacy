import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { usePreview } from '../../app/context';
import { beginDrag, currentDrag, endDrag, INTERNAL_TYPE, isInternalDrag, subscribeDrag, type DragPayload } from '../../data/dnd';
import { isFolderId, type Placement } from '../../domain/types';

/**
 * Native drag and drop for cards and folders. The payload lives in data/dnd.ts; the DataTransfer only carries a marker
 * type, so external file drops (AppShell) and internal moves never get confused. Keyboard and touch users reach the same
 * operations through the selection bar, context menus and the move dialog.
 */

const GHOST_MAX = 3;

/** Builds the drag image: a small stack of glass cards with the first title and a count badge. */
function makeGhost(titles: readonly string[], count: number): HTMLElement {
  const ghost = document.createElement('div');
  ghost.className = 'cb-drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  for (let i = Math.min(count, GHOST_MAX) - 1; i >= 1; i--) {
    const layer = document.createElement('span');
    layer.className = 'cb-drag-ghost__layer';
    layer.style.setProperty('--n', String(i));
    ghost.appendChild(layer);
  }
  const card = document.createElement('span');
  card.className = 'cb-drag-ghost__card';
  card.textContent = titles[0] ?? '';
  ghost.appendChild(card);
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'cb-drag-ghost__badge';
    badge.textContent = String(count);
    ghost.appendChild(badge);
  }
  document.body.appendChild(ghost);
  return ghost;
}

/** Makes an entry (item or folder) draggable; a selected entry drags the whole selection. */
export function useDraggableEntry(id: string, placement: Placement | undefined, title: string) {
  const { state, library } = usePreview();
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!placement) return;
      const ids = state.selectedIds.includes(id) ? state.selectedIds : [id];
      event.dataTransfer.setData(INTERNAL_TYPE, ids.join(','));
      event.dataTransfer.effectAllowed = 'move';
      const titles = ids.map((entry) => (isFolderId(entry) ? library.getFolder(entry)?.name : library.getItem(entry)?.title)).filter((t): t is string => !!t);
      const ghost = makeGhost(titles[0] === title ? titles : [title, ...titles], ids.length);
      event.dataTransfer.setDragImage(ghost, 24, 22);
      requestAnimationFrame(() => ghost.remove());
      beginDrag({ ids, from: placement });
      setDragging(true);
    },
    [id, placement, state.selectedIds, library, title],
  );

  const onDragEnd = useCallback(() => {
    endDrag();
    setDragging(false);
  }, []);

  return { draggable: !!placement, onDragStart, onDragEnd, dragging };
}

export interface DropTargetOptions {
  /** Whether this target wants the payload (self-drops and cycles return false). */
  accepts: (payload: DragPayload) => boolean;
  onDrop: (payload: DragPayload) => void;
  /** Dwell before the target is armed; a short hover never drops by accident (card-on-card merge). */
  armDelay?: number;
  /** Called when the pointer rests on the target (e.g. to open a flyout or spring-load a folder). */
  onHover?: () => void;
}

/** Drop-target behaviour for a card, folder, breadcrumb or space. Bubbling stops at the innermost accepting target. */
export function useDropTarget({ accepts, onDrop, armDelay = 0, onHover }: DropTargetOptions) {
  const [over, setOver] = useState(false);
  const [armed, setArmed] = useState(armDelay === 0);
  const timer = useRef(0);
  const depth = useRef(0);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    depth.current = 0;
    setOver(false);
    setArmed(armDelay === 0);
  }, [armDelay]);

  useEffect(() => subscribeDrag((payload) => !payload && reset()), [reset]);

  const wanted = (event: DragEvent): DragPayload | null => {
    const payload = currentDrag();
    if (!payload || !isInternalDrag(event.dataTransfer)) return null;
    return accepts(payload) ? payload : null;
  };

  const onDragEnter = (event: DragEvent) => {
    const payload = wanted(event);
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    depth.current++;
    if (!over) {
      setOver(true);
      onHover?.();
      if (armDelay) timer.current = window.setTimeout(() => setArmed(true), armDelay);
    }
  };
  const onDragOver = (event: DragEvent) => {
    const payload = wanted(event);
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (!over) {
      setOver(true);
      onHover?.();
      if (armDelay) timer.current = window.setTimeout(() => setArmed(true), armDelay);
    }
  };
  const onDragLeave = (event: DragEvent) => {
    if (!over) return;
    depth.current = Math.max(0, depth.current - 1);
    const next = event.relatedTarget as Node | null;
    if (depth.current === 0 || !next || !event.currentTarget.contains(next)) reset();
  };
  const onDropHandler = (event: DragEvent) => {
    const payload = wanted(event);
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    const ready = armed;
    reset();
    endDrag();
    if (ready) onDrop(payload);
  };

  return {
    over,
    armed: over && armed,
    props: { onDragEnter, onDragOver, onDragLeave, onDrop: onDropHandler },
  };
}

/** Edge auto-scroll of a scroll container while an internal drag hovers near its top or bottom. */
export function useDragAutoScroll(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const EDGE = 64;
    const onDragOver = (event: globalThis.DragEvent) => {
      if (!currentDrag()) return;
      const rect = el.getBoundingClientRect();
      const top = event.clientY - rect.top;
      const bottom = rect.bottom - event.clientY;
      if (top < EDGE) el.scrollTop -= Math.ceil(((EDGE - top) / EDGE) * 18);
      else if (bottom < EDGE) el.scrollTop += Math.ceil(((EDGE - bottom) / EDGE) * 18);
    };
    el.addEventListener('dragover', onDragOver);
    return () => el.removeEventListener('dragover', onDragOver);
  }, [ref]);
}

/** True while any internal drag is in progress (for app-level data attributes). */
export function useDragActive(): boolean {
  const [active, setActive] = useState(() => !!currentDrag());
  useEffect(() => subscribeDrag((payload) => setActive(!!payload)), []);
  return active;
}
