import { useCallback, useEffect, useRef, useState } from 'react';
import { AppLauncher } from './AppGrid';
import { SmartCapture } from './SmartCapture';

/** A visual-viewport inset above this is an on-screen keyboard (not a browser toolbar or a rounding step). */
const KEYBOARD_MIN = 80;

/**
 * Bottom Floating Composer: the one capture surface of the app, floating centred at the bottom of the content viewport
 * over the board and the folder window (captures follow the open folder, useCapture). It stays mounted while hidden
 * (editor, selection, image mode), so a draft is never lost. Layout data is published as CSS variables on the app root,
 * never as React state: `--cb-composer-h` (live height, for notices and the recorder above it) and `--cb-keyboard` (the
 * on-screen keyboard while typing, from the visual viewport; `data-keyboard` marks that one is actually shown). A soft,
 * purely visual blur aura right around the surface lets it float free of the cards scrolling beneath.
 */
export function ComposerDock({ hidden }: { hidden: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [composing, setComposing] = useState(false);
  // the plus's floating app launcher: open, or still animating out (`closing`)
  const [launcher, setLauncher] = useState<{ x: number; closing: boolean } | null>(null);
  const plus = useRef<HTMLElement | null>(null);
  const trigger = useCallback(() => plus.current, []);
  const closeLauncher = useCallback((returnFocus: boolean) => {
    setLauncher((l) => (l && !l.closing ? { ...l, closing: true } : l));
    if (returnFocus) plus.current?.focus({ preventScroll: true });
  }, []);
  const exited = useCallback(() => setLauncher((l) => (l?.closing ? null : l)), []);
  const toggleLauncher = (button: HTMLElement) => {
    plus.current = button;
    if (launcher && !launcher.closing) return closeLauncher(false);
    const dock = ref.current?.getBoundingClientRect();
    const at = button.getBoundingClientRect();
    setLauncher({ x: at.left + at.width / 2 - (dock?.left ?? 0), closing: false });
  };
  // an editor, selection or image mode hides the dock: the launcher goes with it
  useEffect(() => {
    if (hidden) setLauncher(null);
  }, [hidden]);

  useEffect(() => {
    const dock = ref.current;
    const app = dock?.closest<HTMLElement>('.cb-app');
    const surface = dock?.firstElementChild;
    if (!app || !surface) return;
    const observer = new ResizeObserver(() => app.style.setProperty('--cb-composer-h', `${Math.round(surface.getBoundingClientRect().height)}px`));
    observer.observe(surface);
    return () => {
      observer.disconnect();
      app.style.removeProperty('--cb-composer-h');
    };
  }, []);

  // Only while typing: the keyboard inset of the visual viewport lifts the composer above it (iOS keeps the layout
  // viewport, so `bottom` alone would hide the field). Pinch-zoom outside of typing never moves the composer.
  useEffect(() => {
    const app = ref.current?.closest<HTMLElement>('.cb-app');
    const viewport = window.visualViewport;
    if (!app) return;
    app.toggleAttribute('data-composing', composing);
    if (!composing || !viewport) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      app.style.setProperty('--cb-keyboard', `${Math.round(inset)}px`);
      app.toggleAttribute('data-keyboard', inset > KEYBOARD_MIN);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    update();
    return () => {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
      app.style.removeProperty('--cb-keyboard');
      app.removeAttribute('data-keyboard');
      app.removeAttribute('data-composing');
    };
  }, [composing]);

  return (
    <div
      ref={ref}
      className="cb-composer-dock"
      data-hidden={hidden || undefined}
      inert={hidden}
      onFocus={() => setComposing(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setComposing(false);
      }}
    >
      <SmartCapture launcherOpen={!!launcher && !launcher.closing} onLaunch={toggleLauncher} />
      {/* local blur aura behind the surface (after it: the dock measures its first child) */}
      <span className="cb-composer-halo" aria-hidden="true" />
      {/* a sibling of the surface, never inside it: nested glass would blur only the bar, not the board behind */}
      {launcher && <AppLauncher x={launcher.x} closing={launcher.closing} onClose={closeLauncher} onExited={exited} trigger={trigger} />}
    </div>
  );
}
