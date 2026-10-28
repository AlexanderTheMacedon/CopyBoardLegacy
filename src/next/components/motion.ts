import { useEffect, useLayoutEffect, useRef, useState, type DependencyList, type RefObject } from 'react';

// Shared motion primitives of the glass system. Each one only writes CSS custom properties or data attributes; the look and
// timing live in CSS tokens, so reduced motion collapses them centrally.

/**
 * Selection glider: one indicator element (`.cb-glider` inside the container) glides to the active child instead of every
 * option animating its own background. Used by segmented controls, filter chips, the sidebar, settings tabs and the command
 * palette. The container must be positioned. Layout-driven moves (resize, sidebar expansion) snap; selection changes glide.
 */
export function useGlider<T extends HTMLElement>(activeSelector: string, deps: DependencyList): RefObject<T | null> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Last placed geometry: a ResizeObserver notification that changes nothing (every observer reports once on observe)
    // must not switch the glider to snap, or it would cut the selection glide that just started.
    let placed = '';
    const place = () => {
      const target = root.querySelector<HTMLElement>(activeSelector);
      if (!target) {
        root.style.setProperty('--glider-o', '0');
        placed = '';
        return false;
      }
      // offset* ignores transforms, so entrance animations of the target never pull the glider off its final position.
      let x = 0;
      let y = 0;
      let el: HTMLElement | null = target;
      while (el && el !== root) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      const next = `${x},${y},${target.offsetWidth},${target.offsetHeight}`;
      if (next === placed) return false;
      placed = next;
      root.style.setProperty('--glider-x', `${x}px`);
      root.style.setProperty('--glider-y', `${y}px`);
      root.style.setProperty('--glider-w', `${target.offsetWidth}px`);
      root.style.setProperty('--glider-h', `${target.offsetHeight}px`);
      root.style.setProperty('--glider-o', '1');
      return true;
    };

    place();
    // The first placement never animates; afterwards selection changes glide.
    const frame = requestAnimationFrame(() => root.setAttribute('data-glide', 'on'));

    let snapFrame = 0;
    const observer = new ResizeObserver(() => {
      const glideOn = root.getAttribute('data-glide');
      root.setAttribute('data-glide', 'snap');
      if (!place()) {
        if (glideOn) root.setAttribute('data-glide', glideOn);
        return;
      }
      cancelAnimationFrame(snapFrame);
      snapFrame = requestAnimationFrame(() => root.setAttribute('data-glide', 'on'));
    });
    observer.observe(root);
    const target = root.querySelector<HTMLElement>(activeSelector);
    if (target) observer.observe(target);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(snapFrame);
      observer.disconnect();
    };
    // Callers pass the values that move the selection as deps.
  }, deps);

  return ref;
}

/** Overlay-style scrollbars: `data-scrolling` is set while the element scrolls, CSS fades the thumb in and out. */
export function useScrollFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      el.setAttribute('data-scrolling', '');
      clearTimeout(timer);
      timer = window.setTimeout(() => el.removeAttribute('data-scrolling'), 900);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, [ref]);
}

/**
 * Keeps the last value rendered for `exitMs` after it was cleared, so a panel can play its exit transition before it
 * unmounts. `leaving` is true during that window.
 */
export function usePresence<T>(value: T | undefined, exitMs: number): { value: T | undefined; leaving: boolean } {
  const [retained, setRetained] = useState(value);
  if (value !== undefined && value !== retained) setRetained(value);
  const leaving = value === undefined && retained !== undefined;

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setRetained(undefined), exitMs);
    return () => clearTimeout(timer);
  }, [leaving, exitMs]);

  return { value: value ?? retained, leaving };
}

/** True when motion is reduced by the OS or by the in-app preference (`.cb-app[data-motion="reduced"]`). */
export const motionReduced = (): boolean =>
  typeof window !== 'undefined' &&
  (!!document.querySelector('.cb-app[data-motion="reduced"]') || window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Damped spring for script-driven animations; browsers without `linear()` easing get the glide curve. */
export const springEasing = (): string =>
  typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')
    ? 'linear(0, 0.0384, 0.1311, 0.2511, 0.3797, 0.5045, 0.618, 0.7163, 0.7981, 0.8638, 0.9146, 0.9525, 0.9797, 0.9981, 1.0098, 1.0164, 1.0194, 1.0199, 1.0187, 1.0167, 1.0142, 1.0117, 1.0092, 1.0071, 1.0052, 1.0036, 1.0024, 1.0015, 1)'
    : 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Named parts of a morph: key → selector inside the morph root. */
export type MorphParts = Readonly<Record<string, string>>;
type MorphSnapshot = Map<string, { rect: DOMRect; shown: boolean; radius: string }>;

const MORPH_ID = 'cb-morph';

const isShown = (el: Element, rect: DOMRect) => {
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && rect.width > 0 && Number(style.opacity) > 0.05;
};

/** First half of a morph: where every part is drawn right now, running morph animations included. */
export function snapshotMorph(root: HTMLElement, parts: MorphParts): MorphSnapshot {
  const snapshot: MorphSnapshot = new Map();
  for (const [key, selector] of Object.entries(parts)) {
    const el = root.querySelector(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    snapshot.set(key, { rect, shown: isShown(el, rect), radius: getComputedStyle(el).borderRadius });
  }
  return snapshot;
}

interface MorphOptions {
  /**
   * Where a part is drawn at the end where it is hidden: 'self' (its own hidden box, the default), 'other' (where it is
   * shown at the other end: it fades in place) or a rect (e.g. the hero glyph it came from). A null rect falls back to 'self'.
   */
  hidden?: Readonly<Record<string, 'self' | 'other' | (() => DOMRect | null | undefined)>>;
  /** Parts whose box itself reshapes (width, height, radius) instead of scaling: surfaces, never content. */
  resize?: readonly string[];
  /** Parts that hand over from or to another surface: they appear at once and fade out only after they have arrived. */
  late?: readonly string[];
  duration?: number;
}

/**
 * Shared-element morph (FLIP) between two layouts of the same elements: after the layout changed, every part starts from
 * where the snapshot saw it and travels to its new box on the spring. Content parts only translate and scale (no layout
 * work per frame); `resize` surfaces reshape their own absolutely positioned box. Parts that appear or vanish fade.
 * Interruptible: a new snapshot during a running morph starts the next one from the current, in-flight positions.
 */
export function playMorph(root: HTMLElement, parts: MorphParts, first: MorphSnapshot, options: MorphOptions = {}) {
  const { hidden = {}, resize = [], late = [], duration = 560 } = options;
  const still = motionReduced();
  const easing = springEasing();
  for (const [key, selector] of Object.entries(parts)) {
    const el = root.querySelector<HTMLElement>(selector);
    for (const animation of el?.getAnimations() ?? []) if (animation.id === MORPH_ID) animation.cancel();
    const from = first.get(key);
    if (!el || !from || still) continue;
    const box = el.getBoundingClientRect();
    const shown = isShown(el, box);
    if (!from.shown && !shown) continue;
    const rule = hidden[key] ?? 'self';
    const hiddenRect = (self: DOMRect, other: DOMRect) => (rule === 'self' ? self : rule === 'other' ? other : (rule() ?? self));
    const a = from.shown ? from.rect : hiddenRect(from.rect, box);
    const b = shown ? box : hiddenRect(box, from.rect);
    const sized = resize.includes(key);
    // Only a part drawn at both ends (or flying to a stand-in) scales with its box; one that appears or vanishes keeps its
    // size (its hidden box may be squeezed), and one that appears in its own box grows out of it.
    const scales = (from.shown && shown) || typeof rule === 'function';
    const frame = (v: DOMRect, radius: string, grow = 1): Keyframe =>
      sized
        ? { transform: `translate(${v.left - box.left}px, ${v.top - box.top}px)`, width: `${v.width}px`, height: `${v.height}px`, borderRadius: radius }
        : {
            transform: `translate(${v.left + v.width / 2 - (box.left + box.width / 2)}px, ${v.top + v.height / 2 - (box.top + box.height / 2)}px) scale(${
              (scales && box.width ? v.width / box.width : 1) * grow
            })`,
          };
    const grow = !from.shown && rule === 'self' ? 0.6 : 1;
    const move = el.animate([frame(a, from.radius, grow), frame(b, getComputedStyle(el).borderRadius)], { duration, easing });
    move.id = MORPH_ID;
    if (from.shown === shown) continue;
    const fade = shown
      ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: late.includes(key) ? 120 : 240, delay: late.includes(key) ? 0 : duration * 0.18, easing: 'ease-out', fill: 'backwards' })
      : el.animate([{ opacity: 1, visibility: 'visible' }, { opacity: 0, visibility: 'visible' }], {
          duration: late.includes(key) ? duration * 0.45 : 180,
          delay: late.includes(key) ? duration * 0.5 : 0,
          easing: 'ease-out',
          fill: 'backwards',
        });
    fade.id = MORPH_ID;
  }
}

interface LayoutMotionOptions {
  /** Origin rect for the first newly mounted element matching `spawnSelector` (e.g. a folder created by a merge). */
  takeSpawn?: () => DOMRect | null;
  spawnSelector?: string;
}

/**
 * Content reflow (FLIP): children of the list keep their old position for one frame and glide to the new one when
 * entries are added, removed or reordered. Keys come from `data-item-id` / `data-folder-id`. Positions are read with
 * offsetLeft/Top, so running entrance transforms never skew them. A newly mounted spawn element grows out of the given
 * origin rect instead of the usual entrance.
 */
export function useLayoutMotion(ref: RefObject<HTMLElement | null>, { takeSpawn, spawnSelector }: LayoutMotionOptions = {}) {
  const previous = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastList = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    // a remounted list (view, density or filter change) plays its own reveal; positions start fresh
    if (list !== lastList.current) {
      lastList.current = list;
      previous.current = new Map();
    }
    const still = motionReduced();
    const easing = still ? '' : springEasing();
    const next = new Map<string, { x: number; y: number }>();
    for (const child of Array.from(list.children) as HTMLElement[]) {
      const key = child.dataset.itemId ?? child.dataset.folderId;
      if (!key) continue;
      const pos = { x: child.offsetLeft, y: child.offsetTop };
      next.set(key, pos);
      if (still) continue;
      const old = previous.current.get(key);
      if (old) {
        const dx = old.x - pos.x;
        const dy = old.y - pos.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 560, easing });
        }
      } else if (previous.current.size && spawnSelector && child.matches(spawnSelector)) {
        const origin = takeSpawn?.();
        if (!origin) continue;
        child.style.animation = 'none';
        const rect = child.getBoundingClientRect();
        const sx = origin.width / rect.width;
        const sy = origin.height / rect.height;
        child.setAttribute('data-spawned', '');
        child.animate(
          [
            { transformOrigin: 'top left', transform: `translate(${origin.left - rect.left}px, ${origin.top - rect.top}px) scale(${sx}, ${sy})`, opacity: 0.4, filter: 'blur(6px)' },
            { transformOrigin: 'top left', transform: 'none', opacity: 1, filter: 'blur(0)' },
          ],
          { duration: 680, easing },
        ).onfinish = () => {
          child.style.animation = '';
          window.setTimeout(() => child.removeAttribute('data-spawned'), 600);
        };
      }
    }
    previous.current = next;
  });
}

/** Largest visual lag of a card behind the scroll, in px. */
const INERTIA_MAX = 6;

/**
 * Magnetic grid / underwater inertia: while the board scrolls, its cards trail the movement by a few pixels on a soft,
 * slightly underdamped spring and settle back to rest when it stops. Native scrolling, wheel, pointer and scroll position
 * are never touched: the hook only reads `scrollTop` and writes one CSS variable (`--cb-drift`, px) plus `data-drift` on
 * the grid inside the scroll root, once per frame and only while there is motion; CSS turns that into a `translate` per
 * card (a separate property, so it composes with every transform animation). Off with reduced motion, on touch-first
 * devices and while dragging, selecting or a folder window owns the stage.
 */
export function useScrollInertia(scrollRoot: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scrollRoot.current;
    const app = root?.closest<HTMLElement>('.cb-app');
    if (!root || !app) return;
    const coarse = window.matchMedia('(pointer: coarse)');
    let frame = 0;
    let last = root.scrollTop;
    let offset = 0;
    let velocity = 0;
    let grid: HTMLElement | null = null;
    const paused = () =>
      motionReduced() || coarse.matches || app.matches('[data-dragging], [data-selecting], [data-folder], [data-cinema]');
    const rest = () => {
      offset = 0;
      velocity = 0;
      grid?.style.removeProperty('--cb-drift');
      grid?.removeAttribute('data-drift');
      grid = null;
    };
    const tick = () => {
      frame = 0;
      const y = root.scrollTop;
      const delta = y - last;
      last = y;
      if (paused()) return rest();
      if (!grid?.isConnected) grid = root.querySelector<HTMLElement>('.cb-grid');
      if (!grid) return;
      // spring towards a target proportional to the scroll speed of this frame (capped)
      const target = Math.max(-INERTIA_MAX, Math.min(INERTIA_MAX, delta * 0.45));
      velocity = (velocity + (target - offset) * 0.14) * 0.72;
      offset += velocity;
      if (Math.abs(offset) < 0.05 && Math.abs(velocity) < 0.05 && delta === 0) return rest();
      grid.setAttribute('data-drift', '');
      grid.style.setProperty('--cb-drift', `${offset.toFixed(2)}px`);
      frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      rest();
    };
  }, [scrollRoot]);
}
