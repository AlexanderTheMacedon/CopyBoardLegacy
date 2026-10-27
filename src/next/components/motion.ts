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

    const place = () => {
      const target = root.querySelector<HTMLElement>(activeSelector);
      if (!target) {
        root.style.setProperty('--glider-o', '0');
        return;
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
      root.style.setProperty('--glider-x', `${x}px`);
      root.style.setProperty('--glider-y', `${y}px`);
      root.style.setProperty('--glider-w', `${target.offsetWidth}px`);
      root.style.setProperty('--glider-h', `${target.offsetHeight}px`);
      root.style.setProperty('--glider-o', '1');
    };

    place();
    // The first placement never animates; afterwards selection changes glide.
    const frame = requestAnimationFrame(() => root.setAttribute('data-glide', 'on'));

    let snapFrame = 0;
    const observer = new ResizeObserver(() => {
      root.setAttribute('data-glide', 'snap');
      place();
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
