import { useEffect, useRef, useState, type AnimationEvent } from 'react';
import { usePreview } from '../../app/context';
import { BrandLogo } from '../../components/BrandLogo';

/** A fresh start: the intro did not play within this window, so reloads (or reload loops) never replay it. */
const REPLAY_AFTER_MS = 20 * 60 * 1000;

/**
 * Signature intro "Paste Bloom" (~1.2 s, `--cb-intro-dur`): on a fresh start the two halves of the CopyBoard mark arrive
 * offset like a copy and its paste, click into one mark, send a soft ring of light through the room and dissolve while the
 * dock's own mark answers with the same click — a hand-over of light, not a flight into the navigation. One motion path:
 * CSS keyframes on this layer, and the layer unmounts on its own `animationend`. It never blocks: the app renders and
 * accepts input underneath (the layer is click-through and hidden from assistive tech), and the first pointer, key or
 * wheel interaction cuts it short without being swallowed. Off via Settings → Startanimation, skipped with reduced motion.
 */
export function SignatureIntro() {
  const { state, workspace } = usePreview();
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'play' | 'skip' | 'done'>(() => {
    if (typeof window === 'undefined' || state.prefs.intro === 'off' || state.prefs.motion === 'reduced') return 'done';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'done';
    if (workspace.introPlayedAt !== undefined && Date.now() - workspace.introPlayedAt < REPLAY_AFTER_MS) return 'done';
    return 'play';
  });

  const active = phase !== 'done';
  const { markIntroPlayed } = workspace;
  useEffect(() => {
    if (!active) return;
    markIntroPlayed();
    const app = ref.current?.closest('.cb-app');
    app?.setAttribute('data-intro', '');
    const skip = () => setPhase((p) => (p === 'play' ? 'skip' : p));
    const options = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', skip, options);
    window.addEventListener('keydown', skip, options);
    window.addEventListener('wheel', skip, options);
    return () => {
      app?.removeAttribute('data-intro');
      window.removeEventListener('pointerdown', skip, options);
      window.removeEventListener('keydown', skip, options);
      window.removeEventListener('wheel', skip, options);
    };
  }, [active, markIntroPlayed]);

  // the preference switched off while it plays: leave at once
  useEffect(() => {
    if (state.prefs.intro === 'off' || state.prefs.motion === 'reduced') setPhase((p) => (p === 'play' ? 'skip' : p));
  }, [state.prefs.intro, state.prefs.motion]);

  if (!active) return null;

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setPhase('done');
  };

  return (
    <div ref={ref} className="cb-intro" aria-hidden="true" data-phase={phase} onAnimationEnd={onAnimationEnd}>
      <span className="cb-intro__veil" />
      <span className="cb-intro__ring" />
      <span className="cb-intro__mark">
        <BrandLogo width={96} className="cb-intro__logo" />
      </span>
    </div>
  );
}
