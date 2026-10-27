import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { usePreview } from '../../app/context';
import { beginDrag, currentDrag, endDrag, INTERNAL_TYPE, isInternalDrag, subscribeDrag, type DragPayload } from '../../data/dnd';
import type { Placement } from '../../domain/types';
import { absorbGhost, holdGhostHover, returnGhost, startGhost } from './drag-ghost';

/**
 * Native drag and drop for cards and folders. The payload lives in data/dnd.ts; the DataTransfer only carries a marker
 * type, so external file drops (AppShell) and internal moves never get confused. The visual (lifted card miniature,
 * stack, absorb/return motion) is drag-ghost.ts. Keyboard and touch users reach the same operations through the
 * selection bar, context menus and the move dialog.
 */

/** Makes an entry (item or folder) draggable; a selected entry drags the whole selection. */
export function useDraggableEntry(id: string, placement: Placement | undefined) {
  const { state } = usePreview();
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!placement) return;
      const ids = state.selectedIds.includes(id) ? state.selectedIds : [id];
      event.dataTransfer.setData(INTERNAL_TYPE, ids.join(','));
      event.dataTransfer.effectAllowed = 'move';
      startGhost(event.nativeEvent, event.currentTarget, ids.length);
      beginDrag({ ids, from: placement });
      setDragging(true);
    },
    [id, placement, state.selectedIds],
  );

  const onDragEnd = useCallback(() => {
    // a drop target that accepted the payload has already absorbed the ghost; anything else glides home
    returnGhost();
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
  /** How the target receives the dragged card: `merge` (card on card → new folder) or `into` (folder, space, crumb). */
  effect?: 'merge' | 'into';
}

/** Drop-target behaviour for a card, folder, breadcrumb or space. Bubbling stops at the innermost accepting target. */
export function useDropTarget({ accepts, onDrop, armDelay = 0, onHover, effect = 'into' }: DropTargetOptions) {
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
  // the carried card aims for this target while it hovers here
  useEffect(() => (over ? holdGhostHover() : undefined), [over]);

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
    const target = event.currentTarget;
    reset();
    if (ready) absorbGhost(target, effect);
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
