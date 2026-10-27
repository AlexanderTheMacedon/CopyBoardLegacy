/**
 * Living glass backdrop of the whole app (Glass WOW v2): soft light fields, a warm counter-light and a few bokeh discs behind
 * every glass surface, so sidebar, cards, inspector and overlays all refract the same atmosphere. Pure gradients (no blur
 * filters), fixed behind the shell; only the bokeh drifts slowly, and not at all under reduced motion. Decorative only.
 */
export function AmbientScene() {
  return (
    <div className="cb-scene" aria-hidden="true">
      <span className="cb-scene__field cb-scene__field--lilac" />
      <span className="cb-scene__field cb-scene__field--periwinkle" />
      <span className="cb-scene__field cb-scene__field--warm" />
      <span className="cb-scene__field cb-scene__field--orchid" />
      <span className="cb-scene__bokeh cb-scene__bokeh--1" />
      <span className="cb-scene__bokeh cb-scene__bokeh--2" />
      <span className="cb-scene__bokeh cb-scene__bokeh--3" />
      <span className="cb-scene__bokeh cb-scene__bokeh--4" />
      <span className="cb-scene__bokeh cb-scene__bokeh--5" />
      <span className="cb-scene__bokeh cb-scene__bokeh--6" />
      <span className="cb-scene__bokeh cb-scene__bokeh--7" />
    </div>
  );
}
