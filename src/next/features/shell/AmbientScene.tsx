import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useCaptureSpace, useOpenFolder, usePreview, type PreviewContextValue } from '../../app/context';
import { isPasteShortcut, useMediaQuery } from '../../app/hooks';
import { BrandLogo } from '../../components/BrandLogo';
import { Icon } from '../../components/Icon';
import { usePresence } from '../../components/motion';
import { scenes, SCENE_INTERVAL_MS, startScene, type Scene } from './scenes';

/** Loads and decodes the next photo before it is shown, so a crossfade never reveals a half-loaded image. */
function preload(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}

/** The proximity zone reaches this many times the credit's inline padding beyond its box. */
const REACH_FACTOR = 3;
/** Above this reveal the credit offers its image-mode button. */
const NEAR_AT = 0.35;
const CINEMA_EXIT_MS = 320;
/** Exit control and caption rest after this long without interaction. */
const CINEMA_IDLE_MS = 2600;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Leaves image mode and hands focus back to its entry in the credit. */
export function leaveCinema(dispatch: PreviewContextValue['dispatch']) {
  dispatch({ type: 'setCinema', on: false });
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.cb-scene-credit__cinema')?.focus({ preventScroll: true }));
}
const pasteKey = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Strg V');
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Unsplash Proximity Reveal: while a mouse or pen approaches the photo credit, the scene's blur eases off continuously
 * (distance to the credit's box edge, smoothstep) until the photograph is sharp at the credit itself. Pointer moves are
 * coalesced into one animation frame and written as a CSS variable on the scene layer only: no React state, no repaint of
 * the app, no loop while the pointer is elsewhere. Touch needs no simulated hover; the credit's button stays visible there.
 */
function useProximityReveal(sceneRef: RefObject<HTMLDivElement | null>, creditRef: RefObject<HTMLDivElement | null>, sceneId: string) {
  useEffect(() => {
    const scene = sceneRef.current;
    const credit = creditRef.current;
    if (!scene || !credit) return;
    let frame = 0;
    let x = -1e4;
    let y = -1e4;
    let rect: DOMRect | null = null;
    let reach = 0;
    let reveal = 0;
    const set = (next: number) => {
      if (next === reveal) return;
      reveal = next;
      scene.style.setProperty('--cb-reveal', String(next));
      credit.toggleAttribute('data-near', next > NEAR_AT);
    };
    const apply = () => {
      frame = 0;
      if (!rect) {
        rect = credit.getBoundingClientRect();
        reach = REACH_FACTOR * (parseFloat(getComputedStyle(credit).paddingLeft) || 10);
      }
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const t = clamp01(1 - Math.hypot(dx, dy) / reach);
      // the credit yields to panels (inspector, folder, editor …): a hidden credit reveals nothing
      if (t > 0 && getComputedStyle(credit).visibility === 'hidden') return set(0);
      set(Math.round(smoothstep(t) * 100) / 100);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) set(0); // left the window
    };
    const invalidate = () => {
      rect = null;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut);
    window.addEventListener('resize', invalidate);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      window.removeEventListener('resize', invalidate);
      if (frame) cancelAnimationFrame(frame);
      scene.style.removeProperty('--cb-reveal');
      credit.removeAttribute('data-near');
    };
  }, [sceneRef, creditRef, sceneId]);
}

/**
 * Cinematic image mode: the workspace steps aside (AppShell `data-cinema`, CSS), the photograph turns sharp and keeps its
 * slideshow. This layer carries a quiet editorial frame — the CopyBoard mark top left, the exit as its own glass squircle
 * top right, the motif in Instrument Serif bottom left — that appears on interaction and rests again after a moment.
 * While it is open it owns keyboard and context menu, so no board operation can happen behind it; ⌘V is the one
 * exception: Universal Paste (AppShell) saves the clipboard and returns to the workspace once the save is confirmed.
 * Escape or the exit control return to the untouched workspace (same space, folder, selection, filter and scroll position).
 */
function CinemaLayer({ scene, index, leaving }: { scene: Scene; index: number; leaving: boolean }) {
  const { dispatch } = usePreview();
  const ref = useRef<HTMLDivElement>(null);
  const [idle, setIdle] = useState(false);
  // where a paste in image mode lands (the same placement useCapture uses)
  const folder = useOpenFolder();
  const space = useCaptureSpace();
  const target = folder?.name ?? space?.name;

  useEffect(() => {
    if (leaving) return;
    ref.current?.focus({ preventScroll: true });
    let timer = 0;
    let last = 0;
    const wake = () => {
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      setIdle(false);
      clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), CINEMA_IDLE_MS);
    };
    // Window capture phase: runs before every document and React listener, so board shortcuts (⌘A, ⌘K, Delete …) stay
    // silent. Native activation of the focused exit button (Enter/Space) is a default action and still works. The paste
    // shortcut passes through to Universal Paste, which handles the paste event exactly once.
    const onKey = (event: KeyboardEvent) => {
      if (isPasteShortcut(event)) return;
      event.stopPropagation();
      // editing shortcuts (select all, undo, delete) have nothing to act on here, not even natively
      if ((event.metaKey || event.ctrlKey) && ['a', 'z', 'y', 'backspace', 'delete'].includes(event.key.toLowerCase())) event.preventDefault();
      if (event.key === 'Escape') {
        event.preventDefault();
        leaveCinema(dispatch);
      } else wake();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    timer = window.setTimeout(() => setIdle(true), CINEMA_IDLE_MS);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      clearTimeout(timer);
    };
  }, [dispatch, leaving]);

  return (
    <div
      ref={ref}
      className="cb-cinema"
      role="dialog"
      aria-modal="true"
      aria-label="Bildmodus"
      tabIndex={-1}
      data-idle={idle || undefined}
      data-leaving={leaving || undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragOver={(event) => event.stopPropagation()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <p className="cb-cinema__brand">
        <BrandLogo width={30} tone="current" className="cb-cinema__logo" />
        <span className="cb-cinema__wordmark">CopyBoard</span>
        {target && (
          <span className="cb-cinema__hint">
            <kbd>{pasteKey()}</kbd> sichert in „{target}“
          </span>
        )}
      </p>
      <button type="button" className="cb-cinema__exit" aria-keyshortcuts="Escape" onClick={() => leaveCinema(dispatch)}>
        <span className="cb-cinema__exit-icon">
          <Icon name="shrink" size={16} />
        </span>
        <span className="cb-cinema__exit-label">Bildmodus beenden</span>
        <kbd className="cb-cinema__kbd" aria-hidden="true">
          esc
        </kbd>
      </button>
      <div key={scene.id} className="cb-cinema__caption">
        <p className="cb-cinema__index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
          <span>/</span>
          {String(scenes.length).padStart(2, '0')}
        </p>
        <p className="cb-cinema__place">{scene.place}</p>
        <p className="cb-cinema__meta">
          <span className="cb-cinema__park">{scene.park}</span>
          <span aria-hidden="true">·</span>
          <a href={scene.url} target="_blank" rel="noreferrer noopener">
            Foto: {scene.photographer} / Unsplash
          </a>
        </p>
      </div>
    </div>
  );
}

/**
 * Cinematic Nature background: curated national-park photography behind every glass surface. Two stacked layers
 * crossfade (with a slow settle from a slight zoom) every ~40 s; a veil, a light bleed and a vignette keep the board
 * readable, the per-photo veil strength adapts the contrast. The slideshow pauses while the tab is hidden and stays
 * static with reduced motion or a fixed background. Alternatives: the former orange line photo or a calm gradient.
 * Decorative only; the photo credit is a small link in the corner (with the proximity reveal and the image-mode entry)
 * and in the settings.
 */
export function AmbientScene() {
  const { state, dispatch } = usePreview();
  const { scene: mode, slideshow, sceneBlur, motion } = state.prefs;
  const osReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const still = slideshow === 'off' || motion === 'reduced' || osReduced;
  const [index, setIndex] = useState(() => startScene());
  // Layer A and B alternate; the inactive one receives the next photo before the fade starts.
  const [layers, setLayers] = useState(() => ({ a: index, b: index, front: 'a' as 'a' | 'b' }));
  const sceneRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const cinema = usePresence(state.cinema && mode === 'nature' ? true : undefined, CINEMA_EXIT_MS);

  useEffect(() => {
    if (mode !== 'nature' || still) return;
    let timer = 0;
    let cancelled = false;
    const schedule = () => {
      timer = window.setTimeout(advance, SCENE_INTERVAL_MS);
    };
    const advance = () => {
      if (document.hidden) return schedule();
      const next = (index + 1) % scenes.length;
      void preload(scenes[next]!.src).then(() => {
        if (cancelled) return;
        setLayers((current) => (current.front === 'a' ? { ...current, b: next, front: 'b' } : { ...current, a: next, front: 'a' }));
        setIndex(next);
      });
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, still, index]);

  // Image mode belongs to the photographs: switching to another background mode ends it.
  useEffect(() => {
    if (state.cinema && mode !== 'nature') dispatch({ type: 'setCinema', on: false });
  }, [state.cinema, mode, dispatch]);

  const current = scenes[index]!;
  useProximityReveal(sceneRef, creditRef, mode === 'nature' ? current.id : '');

  const layer = (slot: 'a' | 'b') => {
    const scene = scenes[layers[slot]]!;
    return (
      <span
        key={slot}
        className="cb-scene__photo"
        data-front={layers.front === slot || undefined}
        style={{ backgroundImage: `url(${scene.src})`, backgroundPosition: scene.focus }}
      />
    );
  };

  return (
    <>
      <div ref={sceneRef} className="cb-scene" aria-hidden="true" data-mode={mode} data-blur={sceneBlur} data-still={still || undefined}>
        {mode === 'nature' ? (
          <>
            {layer('a')}
            {layer('b')}
          </>
        ) : (
          <span className="cb-scene__photo" data-front />
        )}
        <span className="cb-scene__veil" style={mode === 'nature' ? ({ '--cb-veil': current.veil } as CSSProperties) : undefined} />
      </div>
      {mode === 'nature' && (
        <div ref={creditRef} className="cb-scene-credit">
          <a key={current.id} className="cb-scene-credit__link" href={current.url} target="_blank" rel="noreferrer noopener">
            <span className="cb-scene-credit__place">
              {current.place} · {current.park}
            </span>
            <span className="cb-scene-credit__by">Foto: {current.photographer} / Unsplash</span>
          </a>
          <button type="button" className="cb-scene-credit__cinema" aria-label="Bildmodus" title="Bildmodus" onClick={() => dispatch({ type: 'setCinema', on: true })}>
            <Icon name="expand" size={15} />
          </button>
        </div>
      )}
      {cinema.value && <CinemaLayer scene={current} index={index} leaving={cinema.leaving} />}
    </>
  );
}
