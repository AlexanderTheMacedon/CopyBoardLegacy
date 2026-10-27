import { motionReduced } from '../../components/motion';

/**
 * Signature drag visual for cards, folders and file rows. The native drag image is replaced by a transparent pixel; a
 * live miniature of the real card (cloned DOM inside `.cb-app`, so it keeps every token, font and theme) follows the
 * pointer with a damped spring and a slight tilt from its velocity. A multi-selection is shown as a stack with a count.
 * On a successful drop the ghost flies into the target and is absorbed; on cancel it returns to its origin. Visual only:
 * the drag payload and every data operation stay in data/dnd.ts and the drop targets.
 */

// A 1×1 transparent GIF, decoded at module load so it is ready when the first drag starts.
const BLANK = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });

const STACK_MAX = 3;
/** Scale while carried: small enough to reveal drop targets, large enough to stay recognisable. */
const CARRY_SCALE = 0.78;
const HOVER_SCALE = 0.62;
const MAX_WIDTH = 280;

interface Ghost {
  readonly root: HTMLElement;
  readonly source: HTMLElement;
  /** Grab point inside the (unscaled) ghost, so the card stays under the finger where it was picked up. */
  readonly grabX: number;
  readonly grabY: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  scale: number;
  tilt: number;
  hovering: boolean;
  frame: number;
  done: boolean;
}

let ghost: Ghost | null = null;

const reducedMotion = motionReduced;

/** Clean clone of the visible card: no ids (duplicates), no focus targets, no live regions. */
function cloneCard(source: HTMLElement): HTMLElement {
  const face = source.querySelector<HTMLElement>('.cb-tile__open') ?? source.querySelector<HTMLElement>('.cb-files__name');
  const card = document.createElement('div');
  card.className = 'cb-drag-ghost__card';
  if (face?.classList.contains('cb-tile__open')) {
    const clone = face.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    card.classList.add('cb-drag-ghost__card--tile');
    card.dataset.kind = source.dataset.kind ?? '';
    if (source.classList.contains('cb-tile--folder')) card.classList.add('cb-tile--folder');
    card.style.setProperty('--cb-folder-tint', source.style.getPropertyValue('--cb-folder-tint'));
    // grid tokens (density) live on .cb-grid; copy the resolved values so the clone keeps its proportions
    const styles = getComputedStyle(source);
    for (const token of ['--cb-card-inset', '--cb-preview-h', '--cb-row-min-h']) card.style.setProperty(token, styles.getPropertyValue(token));
    card.appendChild(clone);
  } else {
    // file rows: a compact glass chip with the row's thumb and title
    card.classList.add('cb-drag-ghost__card--row');
    const clone = (face?.cloneNode(true) as HTMLElement | undefined) ?? document.createElement('span');
    clone.removeAttribute('id');
    clone.querySelector('.cb-files__chevron')?.remove();
    card.appendChild(clone);
  }
  return card;
}

function render(g: Ghost) {
  g.root.style.transform = `translate3d(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px, 0) rotate(${g.tilt.toFixed(2)}deg) scale(${g.scale.toFixed(3)})`;
}

function loop() {
  const g = ghost;
  if (!g || g.done) return;
  const still = reducedMotion();
  const k = still ? 1 : 0.3;
  const dx = g.tx - g.x;
  g.x += dx * k;
  g.y += (g.ty - g.y) * k;
  const targetScale = g.hovering ? HOVER_SCALE : CARRY_SCALE;
  g.scale += (targetScale - g.scale) * (still ? 1 : 0.18);
  g.tilt += ((still ? 0 : Math.max(-9, Math.min(9, dx * 0.35))) - g.tilt) * 0.22;
  render(g);
  g.frame = requestAnimationFrame(loop);
}

function onDragOver(event: DragEvent) {
  const g = ghost;
  if (!g || g.done || (event.clientX === 0 && event.clientY === 0)) return;
  g.tx = event.clientX - g.grabX;
  g.ty = event.clientY - g.grabY;
  g.root.dataset.visible = '';
}

function onLeaveWindow(event: DragEvent) {
  // leaving the window: the browser shows its own cursor outside, the ghost waits invisibly at the edge
  if (ghost && !event.relatedTarget) delete ghost.root.dataset.visible;
}

/**
 * Starts the ghost for a drag that begins on `source` (a tile `li` or a file `tr`). Call from `dragstart`.
 * Returns false when the custom visual is not available, so the caller can keep the browser default.
 */
export function startGhost(event: DragEvent, source: HTMLElement, count: number): boolean {
  const app = source.closest<HTMLElement>('.cb-app') ?? document.querySelector<HTMLElement>('.cb-app');
  if (!app || !BLANK || !event.dataTransfer) return false;
  dropGhost();
  event.dataTransfer.setDragImage(BLANK, 0, 0);

  const rect = (source.querySelector('.cb-tile__open') ?? source).getBoundingClientRect();
  const width = Math.min(rect.width, MAX_WIDTH);
  const root = document.createElement('div');
  root.className = 'cb-drag-ghost';
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
  root.style.width = `${width}px`;
  for (let i = Math.min(count, STACK_MAX) - 1; i >= 1; i--) {
    const layer = document.createElement('span');
    layer.className = 'cb-drag-ghost__layer';
    layer.style.setProperty('--n', String(i));
    root.appendChild(layer);
  }
  root.appendChild(cloneCard(source));
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'cb-drag-ghost__badge';
    badge.textContent = String(count);
    root.appendChild(badge);
  }
  app.appendChild(root);

  // The grab point keeps its relative position on the card; the transform origin sits there, so scaling and tilting
  // happen around the pointer like a card held between two fingers.
  const grabX = Math.max(0, Math.min(width, event.clientX - rect.left));
  const grabY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  root.style.transformOrigin = `${grabX}px ${grabY}px`;
  hoverCount = 0;
  ghost = { root, source, grabX, grabY, x: rect.left, y: rect.top, tx: rect.left, ty: rect.top, scale: 1, tilt: 0, hovering: false, frame: 0, done: false };
  render(ghost);
  root.dataset.visible = '';
  document.addEventListener('dragover', onDragOver, true);
  document.addEventListener('dragleave', onLeaveWindow, true);
  ghost.frame = requestAnimationFrame(loop);
  return true;
}

let hoverCount = 0;

/**
 * Drop targets report hover, so the carried card shrinks a little more and "aims" for the target. Returns the release
 * function; counting keeps the state right when entering the next target fires before leaving the last one.
 */
export function holdGhostHover(): () => void {
  hoverCount++;
  syncHover();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hoverCount = Math.max(0, hoverCount - 1);
    syncHover();
  };
}

function syncHover() {
  if (!ghost) return;
  ghost.hovering = hoverCount > 0;
  if (ghost.hovering) ghost.root.dataset.hovering = '';
  else delete ghost.root.dataset.hovering;
}

function stop(g: Ghost) {
  g.done = true;
  cancelAnimationFrame(g.frame);
  document.removeEventListener('dragover', onDragOver, true);
  document.removeEventListener('dragleave', onLeaveWindow, true);
  if (ghost === g) ghost = null;
}

function flyTo(g: Ghost, rect: DOMRect, keyframe: Keyframe, duration: number, easing: string) {
  stop(g);
  if (reducedMotion() || !g.root.isConnected) {
    g.root.remove();
    return;
  }
  const from = g.root.style.transform;
  const x = rect.left + rect.width / 2 - g.grabX;
  const y = rect.top + rect.height / 2 - g.grabY;
  const animation = g.root.animate([{ transform: from }, { transform: `translate3d(${x}px, ${y}px, 0) rotate(0deg) scale(0.2)`, ...keyframe }], {
    duration,
    easing,
    fill: 'forwards',
  });
  animation.onfinish = animation.oncancel = () => g.root.remove();
}

/**
 * Successful drop on `target`: the ghost is drawn into the target and absorbed; the target gives a short "received"
 * pulse (CSS `[data-received]`). `kind` selects the target's reaction (merge = card on card, into = folder or space).
 */
export function absorbGhost(target: Element, kind: 'merge' | 'into') {
  const g = ghost;
  const el = target as HTMLElement;
  el.removeAttribute('data-received');
  // restart the pulse even when the same target receives twice in a row
  void el.offsetWidth;
  el.setAttribute('data-received', kind);
  window.setTimeout(() => el.getAttribute('data-received') === kind && el.removeAttribute('data-received'), 900);
  if (!g) return;
  const rect = (el.querySelector('.cb-tile__preview') ?? el).getBoundingClientRect();
  flyTo(g, rect, { opacity: 0, filter: 'blur(2px)' }, 420, 'cubic-bezier(0.5, 0, 0.2, 1)');
}

/** Drag ended without a drop (or on an unarmed target): the card glides back to where it came from. */
export function returnGhost() {
  const g = ghost;
  if (!g) return;
  stop(g);
  if (reducedMotion() || !g.source.isConnected) {
    g.root.remove();
    return;
  }
  const rect = (g.source.querySelector('.cb-tile__open') ?? g.source).getBoundingClientRect();
  const animation = g.root.animate(
    [{ transform: g.root.style.transform, opacity: 1 }, { transform: `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(0deg) scale(1)`, opacity: 0 }],
    { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' },
  );
  animation.onfinish = animation.oncancel = () => g.root.remove();
}

/** Removes any ghost immediately (e.g. a new drag starts before the last one finished). */
export function dropGhost() {
  const g = ghost;
  if (!g) return;
  stop(g);
  g.root.remove();
}

// --- Folder spawn: the folder created by a card-on-card drop grows out of the target card's place --------------------

let spawn: { rect: DOMRect; at: number } | null = null;

export const setSpawnOrigin = (rect: DOMRect | null) => {
  spawn = rect ? { rect, at: Date.now() } : null;
};

/** Consumed by the grid's layout motion for the first new folder tile after a merge; stale origins (failed merge) expire. */
export const takeSpawnOrigin = (): DOMRect | null => {
  const value = spawn;
  spawn = null;
  return value && Date.now() - value.at < 2500 ? value.rect : null;
};
