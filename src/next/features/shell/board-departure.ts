import type { BoardFilter, UiAction, UiState } from '../../app/state';
import { motionReduced } from '../../components/motion';

/** Exit leg of a board change: shorter than the arrival, so the new content is already settling while the old one leaves. */
const DEPART_MS = 260;

const sameLocation = (a: UiState['location'], b: UiState['location']) =>
  a.type === b.type && (a.type === 'space' ? b.type === 'space' && a.spaceId === b.spaceId : b.type === 'collection' && a.collectionId === b.collectionId);

/** True when the action replaces what the board shows: another space or collection, view or density. A filter change only
 *  thins out or fills up the same board; it gets the targeted `departFiltered` instead. */
export function replacesBoard(action: UiAction, state: UiState): boolean {
  if (state.composerItemId || state.openFolderId || state.cinema) return false;
  switch (action.type) {
    case 'navigate':
      return !sameLocation(action.location, state.location);
    case 'setPreference':
      return (action.patch.view !== undefined && action.patch.view !== state.view) || (action.patch.density !== undefined && action.patch.density !== state.density);
    default:
      return false;
  }
}

/**
 * Departure: the board as it is drawn right now is copied into an inert, hidden-from-AT ghost over the workspace, which
 * recedes while the new content settles in with its own staggered reveal underneath — exit, transition, arrival, instead of
 * swapping every card in one frame. Pure DOM, no React state, at most one ghost at a time (a quick second change replaces
 * it), skipped with reduced motion. The live board is never touched; the ghost carries no ids and takes no pointer.
 */
export function departBoard() {
  if (motionReduced()) return;
  const stage = document.querySelector<HTMLElement>('.cb-stage');
  const workspace = stage?.querySelector<HTMLElement>('.cb-workspace');
  const root = workspace?.querySelector<HTMLElement>(':scope > .cb-board-root');
  if (!stage || !workspace || !root) return;
  stage.querySelector(':scope > .cb-departure')?.remove();

  const stageRect = stage.getBoundingClientRect();
  const viewRect = workspace.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const ghost = root.cloneNode(true) as HTMLElement;
  // the toolbar row keeps its height (the columns below must not shift), but the live island stays the only one drawn
  ghost.querySelectorAll<HTMLElement>('.cb-toolbar, .cb-selbar').forEach((el) => (el.style.visibility = 'hidden'));
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  ghost.removeAttribute('id');
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${rootRect.left - viewRect.left}px`,
    top: `${rootRect.top - viewRect.top}px`,
    width: `${rootRect.width}px`,
    minHeight: `${rootRect.height}px`,
  });

  const layer = document.createElement('div');
  layer.className = 'cb-departure';
  layer.removeAttribute('data-drift');
  layer.style.removeProperty('--cb-drift');
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  Object.assign(layer.style, {
    left: `${viewRect.left - stageRect.left}px`,
    top: `${viewRect.top - stageRect.top}px`,
    width: `${viewRect.width}px`,
    height: `${viewRect.height}px`,
  });
  layer.append(ghost);
  stage.append(layer);

  // fades early and drifts on: old and new text barely overlap, the movement still reads as one leaving gesture
  const leave = ghost.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0.3, offset: 0.4 },
      { opacity: 0, transform: 'translateY(-12px) scale(0.988)' },
    ],
    { duration: DEPART_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
  );
  leave.onfinish = () => layer.remove();
  leave.oncancel = () => layer.remove();
}

/** Cards leaving with a filter change: only the ones on screen are copied, and never more than this. */
const FILTER_GHOST_MAX = 36;
const FILTER_DEPART_MS = 220;

const keepsTile = (tile: HTMLElement, filter: BoardFilter) =>
  filter === 'all' || (filter === 'favorites' ? tile.dataset.favorite !== undefined : tile.dataset.kind === filter);

/**
 * Filter change, exit leg: the live grid stays mounted (focus, selection, scroll and the cards that remain are untouched;
 * they glide to their new places via useLayoutMotion, new ones settle in). Only the cards on screen that the new filter
 * drops get a still, inert copy at their place, which softly shrinks and fades. Pure DOM, at most one set at a time (a
 * quick second change replaces it), skipped with reduced motion.
 */
export function departFiltered(action: UiAction, state: UiState) {
  if (action.type !== 'setFilter' || action.filter === state.filter) return;
  if (state.composerItemId || state.openFolderId || state.cinema || motionReduced()) return;
  const grid = document.querySelector<HTMLElement>('.cb-stage .cb-workspace > .cb-board-root .cb-grid');
  const host = grid?.parentElement;
  if (!grid || !host) return;
  host.querySelector(':scope > .cb-filter-departure')?.remove();

  // the layer is fixed to the viewport: it never adds scroll height, and when the shorter board clamps the scroll position
  // the leaving cards stay where they were seen (the remaining ones compensate the same jump, useLayoutMotion)
  const layer = grid.cloneNode(false) as HTMLElement;
  layer.className = `${grid.className} cb-filter-departure`;
  layer.removeAttribute('aria-label');
  layer.removeAttribute('data-drift');
  layer.style.removeProperty('--cb-drift');
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  let count = 0;
  for (const tile of grid.querySelectorAll<HTMLElement>(':scope > .cb-tile[data-item-id]')) {
    if (keepsTile(tile, action.filter)) continue;
    const rect = tile.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const ghost = tile.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-item-id');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    Object.assign(ghost.style, {
      position: 'absolute',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    layer.append(ghost);
    if (++count >= FILTER_GHOST_MAX) break;
  }
  if (!count) return;
  host.append(layer);
  const leave = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FILTER_DEPART_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' });
  for (const ghost of layer.children) {
    ghost.animate([{ transform: 'none', filter: 'blur(0)' }, { transform: 'scale(0.94)', filter: 'blur(3px)' }], {
      duration: FILTER_DEPART_MS,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    });
  }
  leave.onfinish = () => layer.remove();
  leave.oncancel = () => layer.remove();
}
