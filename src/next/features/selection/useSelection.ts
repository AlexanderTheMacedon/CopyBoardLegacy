import { useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { usePreview } from '../../app/context';
import { isEditableTarget } from '../../app/hooks';

/** A modal layer (search, settings, dialogs) owns the keyboard while it is open. */
const modalOpen = () => !!document.querySelector('dialog[open]');

/**
 * Multi-selection over the entries of the visible level (board or folder window). ⌘/Ctrl-click toggles, Shift-click
 * selects a range along `orderedIds`, a plain click toggles once a selection exists (selection mode), ⌘A selects
 * everything shown, Escape and a click on free board space clear. The selection lives in the UI state so the toolbar,
 * context menus and drag & drop all see the same set.
 */
export function useSelection(orderedIds: readonly string[], { active = true } = {}) {
  const { state, dispatch } = usePreview();
  const selected = useMemo(() => new Set(state.selectedIds), [state.selectedIds]);

  const toggle = useCallback((id: string) => dispatch({ type: 'toggleSelection', id }), [dispatch]);
  const clear = useCallback(() => dispatch({ type: 'clearSelection' }), [dispatch]);
  const selectAll = useCallback(() => dispatch({ type: 'setSelection', ids: [...orderedIds], anchor: null }), [dispatch, orderedIds]);

  /** Returns true when the click was consumed as a selection gesture (the caller then skips its default action). */
  const onEntryClick = useCallback(
    (id: string, event: MouseEvent): boolean => {
      if (event.shiftKey && state.selectionAnchor && orderedIds.includes(state.selectionAnchor)) {
        const a = orderedIds.indexOf(state.selectionAnchor);
        const b = orderedIds.indexOf(id);
        if (b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          const range = orderedIds.slice(from, to + 1);
          dispatch({ type: 'setSelection', ids: [...new Set([...state.selectedIds.filter((x) => !range.includes(x)), ...range])], anchor: state.selectionAnchor });
          return true;
        }
      }
      if (event.metaKey || event.ctrlKey || selected.size > 0) {
        toggle(id);
        return true;
      }
      return false;
    },
    [state.selectionAnchor, state.selectedIds, orderedIds, selected.size, dispatch, toggle],
  );

  // ⌘A / Escape for the active level; editable fields and open dialogs keep their own keys.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || modalOpen()) return;
      if (event.key.toLowerCase() === 'a' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        if (!orderedIds.length) return;
        event.preventDefault();
        selectAll();
      } else if (event.key === 'Escape' && selected.size && !event.defaultPrevented) {
        event.preventDefault();
        clear();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, orderedIds, selectAll, clear, selected.size]);

  /** Click on free board space (not on a tile or control) leaves selection mode. */
  const onSurfaceClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest('[data-item-id], [data-folder-id], button, input, a, [role="menu"], [role="radiogroup"]')) return;
      clear();
    },
    [clear],
  );

  return { selected, count: selected.size, active: selected.size > 0, toggle, clear, selectAll, onEntryClick, onSurfaceClick };
}

export type Selection = ReturnType<typeof useSelection>;
