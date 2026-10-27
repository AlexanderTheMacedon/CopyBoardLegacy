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
