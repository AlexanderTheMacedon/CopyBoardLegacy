# Run D — Glass Experience WOW v2 (React preview)

Branch `feature/copyboard-glass-experience-wow-v2`, based on `feature/copyboard-design-wow-v1` (Run C, `0f996ca`).
Scope: visual/interaction transformation of the read-only React preview only. No data model, storage, backend, recorder or
legacy changes.

## What changed

| Area | Result |
| --- | --- |
| Design system | `tokens.css`: four glass tiers (thin / regular / thick / solid) with one lit edge, sheen and elevation family; nested squircle radii; motion tokens (hover 160 ms, select 240 ms, panel 380 ms, exit 190 ms) plus sampled `linear()` springs; reduced motion and reduced transparency collapse centrally. |
| Motion primitives | `components/motion.ts`: `useGlider` (one gliding selection indicator), `useScrollFade` (overlay scrollbars that fade in while scrolling), `usePresence` (exit transitions before unmount). |
| Ambient scene | `AmbientScene`: fixed light fields, warm counter-light and drifting bokeh behind every glass surface (gradients only, no blur filters). |
| Logo | Original kept unchanged at `docs/design/brand/copyboard-logo-original.svg` (+ `currentColor` variant). `BrandLogo` inlines the unchanged paths (72 × 41 viewBox, ratio locked) with a theme gradient; `BrandMark` puts it on a lit glass puck in the sidebar; Pages favicon uses the same mark. |
| Sidebar | Floating pill pair (main + utilities) detached from the edge; active space via gliding glass capsule with colour glow; headings fold into dividers at rest; hover/focus widens both pills as one overlay (no workspace movement, no gap trap). |
| Board header | Only the board name; eyebrow, description and fact pills removed. Filter chips (Alle, kinds present, Favoriten) with real counts, functional via `UiState.filter` (reset on navigation), gliding accent pill. |
| Composer | Same logic; glass capsule at rest, accent aura on focus, height via `min-height` + `field-sizing` (no row jump). |
| Grid / cards | Glass cards with pointer-tracked specular light and edge light, type-specific previews kept; density/view controls share the segmented glass track with gliding thumb. |
| Command center | One continuous glass object (field, results, footer); gliding selection, keyboard scroll-into-view, fading scrollbar, spring entrance and real exit transition (dialog `display`/`overlay` allow-discrete). |
| Inspector | Floating glass rail; board makes room with the same glide; exit transition; real resize separator (pointer drag + arrow keys, 320–720 px, keeps ≥ 420 px board, double-click resets); overlay on tablet, sheet on phone. |
| Settings | Same glass sheet, gliding tab selection, all rows as glass cards; pending features stay explicitly "Noch nicht verfügbar". |

## QA actually run

- `npm test`: syntax 16/16, typecheck (preview + legacy), unit 84/84.
- `npm run test:smoke`: legacy smoke, preview e2e 13/13, R02 security subset 8/8.
- `npm run test:pages-preview`: build + preview e2e 13/13 at `/`.
- Playwright screenshots 1440 × 900 (light/dark), 768 × 1024 touch, 390 × 844 touch; no console errors; no horizontal overflow on phone (one overflow found and fixed: composer placeholder widened the bar).
- Test change: P4 now waits for the inspector's exit transition before asserting it is gone.

## Open points

1. Dialog exit animations rely on `transition-behavior: allow-discrete`; browsers without it close instantly (graceful).
2. Overlay scrollbar fade uses `scrollbar-color`; Safari keeps its native scrollbar behaviour.

Screenshots: `screenshots/` (01 board · 03 sidebar hover · 04 composer · 05 filter · 06 inspector · 07 palette · 08 settings ·
20–22 dark · 30 tablet · 40 phone).
