# Run E — Orange Squircle & Universal Paste (React app)

Branch `feature/copyboard-orange-squircle-paste-wow`, based on Run D (`6da519b`). Legacy app (`/`, `src/js`) unchanged.

## Storage decision

The React app had no write path (fixtures only). Captures now persist in an **own IndexedDB database `copyboard-next`**
(`src/next/data/store.ts`, Blueprint 05 target candidate: records + Blobs). The legacy `copyboard_state_v1` localStorage blob is
never read or written; fixtures stay synthetic and are merged with the user's items in `app/workspace.ts`. Every write resolves
after the transaction committed (`durability: 'strict'`); success notices appear only after that.

## What changed

| Area | Result |
| --- | --- |
| Universal Paste | ⌘V/Strg+V anywhere outside editable fields (off-screen catcher for browsers without a paste event on non-editable focus). Text, URL (new `link` kind), Markdown, code (+language), images/screenshots (real pixels), files, audio (real waveform). Drop onto the board, file picker and context menu "Einfügen" share one pipeline (`features/capture/useCapture.ts`). |
| Context menu | Board: Einfügen, Neuer Eintrag, Suchen, Ansicht, Einstellungen. Card: Öffnen, Link öffnen, Kopieren, Herunterladen, Bearbeiten, Favorit, Im Space anzeigen, Löschen (own items, with undo). Keyboard, Escape, outside click, viewport clamping; native menu kept in fields, editor and text selections. |
| Visual system | Photo `src/next/assets/ambient-orange.jpg` (2400 px, EXIF rotation baked) as the scene; warm glass tiers, orange/amber accents; light by default (OS theme ignored, explicit choice persists). Squircle radius family, no capsules; single focus ring; fewer double contours and shadows. |
| Dock | One compact floating squircle; only the active space visible; space flyout on hover/focus/tap; quick access unfolds above, utilities below the anchored core (core stays on the viewport centre); settings pill dissolved into the dock. |
| Editor | Floating glass canvas with paper writing surface; close only top right; back arrow removed; one context-rail control at a time; own items autosave. |

## QA

`npm test` (syntax 16/16, typecheck app + legacy, unit 107/107) · `npm run test:smoke` (legacy 6/6, app e2e 15/15, R02 8/8) ·
`npm run test:pages-preview` (static + 15/15 at `/`). Real clipboard data via Chromium permissions, ⌘V, reload.

## Open points

1. Safari/Firefox not run here; the off-screen catcher covers browsers that fire no paste event without an editable focus.
2. Context-menu "Einfügen" depends on the browser's Clipboard API permission; on refusal the notice points to ⌘V.
3. Spaces cannot be created yet ("Neuer Space" in the mobile drawer is still a demo entry).
