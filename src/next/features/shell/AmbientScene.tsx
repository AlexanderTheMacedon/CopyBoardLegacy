/**
 * Photographic backdrop of the whole app (Orange Ambient Glass): the orange line photograph, softly defocused, under a warm
 * neutral veil that keeps the content side calm, plus a warm light bleed and a vignette for depth. Every glass surface
 * refracts this one scene. Static: no animation, nothing to reduce. Decorative only.
 */
export function AmbientScene() {
  return (
    <div className="cb-scene" aria-hidden="true">
      <span className="cb-scene__photo" />
      <span className="cb-scene__veil" />
    </div>
  );
}
