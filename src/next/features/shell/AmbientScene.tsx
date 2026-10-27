import { useEffect, useState } from 'react';
import { usePreview } from '../../app/context';
import { useMediaQuery } from '../../app/hooks';
import { scenes, SCENE_INTERVAL_MS, startScene } from './scenes';

/** Loads and decodes the next photo before it is shown, so a crossfade never reveals a half-loaded image. */
function preload(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}

/**
 * Cinematic Nature background: curated national-park photography behind every glass surface. Two stacked layers
 * crossfade (with a slow settle from a slight zoom) every ~40 s; a veil, a light bleed and a vignette keep the board
 * readable, the per-photo veil strength adapts the contrast. The slideshow pauses while the tab is hidden and stays
 * static with reduced motion or a fixed background. Alternatives: the former orange line photo or a calm gradient.
 * Decorative only; the photo credit is a small link in the corner and in the settings.
 */
export function AmbientScene() {
  const { state } = usePreview();
  const { scene: mode, slideshow, sceneBlur, motion } = state.prefs;
  const osReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const still = slideshow === 'off' || motion === 'reduced' || osReduced;
  const [index, setIndex] = useState(() => startScene());
  // Layer A and B alternate; the inactive one receives the next photo before the fade starts.
  const [layers, setLayers] = useState(() => ({ a: index, b: index, front: 'a' as 'a' | 'b' }));

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

  const current = scenes[index]!;
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
      <div className="cb-scene" aria-hidden="true" data-mode={mode} data-blur={sceneBlur} data-still={still || undefined}>
        {mode === 'nature' ? (
          <>
            {layer('a')}
            {layer('b')}
          </>
        ) : (
          <span className="cb-scene__photo" data-front />
        )}
        <span className="cb-scene__veil" style={mode === 'nature' ? { opacity: current.veil } : undefined} />
      </div>
      {mode === 'nature' && (
        <a key={current.id} className="cb-scene-credit" href={current.url} target="_blank" rel="noreferrer noopener">
          <span className="cb-scene-credit__place">
            {current.place} · {current.park}
          </span>
          <span className="cb-scene-credit__by">Foto: {current.photographer} / Unsplash</span>
        </a>
      )}
    </>
  );
}
