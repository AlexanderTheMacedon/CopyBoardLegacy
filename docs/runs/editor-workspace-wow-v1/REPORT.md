# Run D — Ultimate Editor Workspace WOW (React app)

Branch `feature/copyboard-editor-workspace-wow-v1`, based on `5094a90`. No new editor engine, no global redesign; legacy
app, account/cloud, deployment configuration and the Image Studio are unchanged. MyTXT (`cc1ea2a`) was read via the
GitHub API only (principles, design direction, `editor/setup.ts`, `ui/SelectionPill.tsx`, `styles/editor.css`).

## What changed

| Area | Result |
| --- | --- |
| Line highlight (all CodeMirror editors) | `highlightActiveLine()` and the grey `.cm-activeLine` bar are gone. One rounded band (`writing-surface.ts`, a CodeMirror layer after MyTXT) glides with the caret, marks only the visual row in wrapped prose, stays inside the content and disappears without focus or with a selection. Motion tokens → 0 ms under reduced motion. |
| Klartext | A centred, floating paper sheet with a bounded measure (Lesebreite), inset text, quiet status line (words · characters · `CRLF` when the text uses it), placeholder for empty texts. Text stays text: `lineSeparatorFor` keeps CRLF/mixed endings byte for byte (and `sliceDoc()` replaces `doc.toString()`, which always wrote LF); tabs, trailing spaces and the final newline are untouched; opening never rewrites. |
| Dokument | The page is a floating DIN A4 sheet (`aspect-ratio: 210/297`, 794 page units wide, ~20 mm margins) on the editor glass; longer text continues the sheet downward (no fake pagination); the status-bar zoom scales the sheet; Lesebreite maps to page margins; dark mode gets a lifted night paper; print drops radius, shadow and the A4 frame. |
| Context Rail | Its own floating glass panel (desktop) with a visible gap to the sheet; tablet/phone keep the overlay sheet. |
| Markdown | Source and preview are separate floating surfaces (single mode centred on the measure). Source in the reading font with typeset headings, quiet marks, code chips and fenced blocks (decorations only). Selection pill (bold, italic, strike, code, link) above a mouse selection — never on touch, never steals focus. Source/Preview/Split, scroll sync and persistence unchanged. |
| Code completion | Measured first: TS/JS gave keywords, snippets, local names but nothing after `console.`; JSON, Go, Rust, Swift, Shell, YAML gave nothing. Added (`completions.ts`): members of curated standard globals for JS/TS (no live `window`, inherited `Object.prototype` noise filtered), extra JS snippets (not after a dot/in strings), keywords + snippets for Go/Rust/Swift/Shell, buffer words for languages without scope analysis, ⌘I / ⌃Space and a "Vorschläge" toolbar button, glass popover with kind tiles. No type-aware completion is claimed. |
| Explorer | Toggle in the shared toolbar. Real spaces (switchable), folders (collapsible, active path open) and editable items; active file marked. Switching flushes the autosave first and refuses to switch if that fails. Overlay sheet on tablet/phone. No storage of its own. |
| Inspector | Same action registry, new arrangement (`inspectorLayout`): one primary (writing studio for own text cards, editing for documents, else copy/download/open link), quick secondaries (copy always visible, favourite), an "Organisieren" group, delete tinted at the end. Every registry action appears exactly once (unit-tested for all fixture kinds; E2E compares with the context menu). Calmer meta facts. |
| Neu erstellen | One sheet from the dock plus, the mobile "Neu" button, the board context menu ("Neu erstellen …") and the folder window (+): Dokument, Klartext, Markdown, Code (language picker), Schnellnotiz (capture bar), Sprachaufnahme (existing recorder), Datei importieren (existing capture pipeline). Items are created at the capture placement (open folder, else space), committed, then opened; a failed commit shows no card and opens nothing. New text/Markdown items take their title from the first line until named. No screenshot entry (Run E). |

## QA

- `npm test`: syntax, typecheck (app + legacy), unit **242/242** (new `tests/unit/editor-workspace.test.ts`: completion per
  language, CRLF/mixed/tab/trailing round trips, Explorer tree, Inspector tiers for every fixture, blank items).
- `node scripts/e2e.mjs full`: preview 44/45 (P36, an unchanged Run C test, timed out once under load; 3/3 PASS when
  rerun alone and PASS in smoke and pages-preview), R02 full 29/29. `npm run test:smoke`: legacy 6/6, preview 38/38
  (before P39–P45 existed), R02 8/8. `npm run test:pages-preview`: 45/45. New preview tests **P39–P45** (Klartext sheet +
  band + byte-exact CRLF + undo/redo + reload; A4 ratio, rail gap, long text, zoom, print; TS/Go completion, accept,
  manual open, keyboard; Explorer folder + switch without loss; Inspector hierarchy = context menu; create in folder +
  failed commit + recorder; Markdown typesetting + selection pill + modes + phone). P12 updated for the mobile "Neu" button.
- Visual QA (desktop light/dark, phone): `screenshots/`.

## Open points

1. The editor chunk loads lazily: keystrokes typed during the very first load (before the editor has focus) are not
   captured — unchanged behaviour, now covered by the tests waiting for focus.
2. Completion is lexical (keywords, snippets, buffer words, standard globals); member completion of user-defined objects
   would need a TypeScript language service, deliberately not added.
3. The A4 sheet is one continuous page; real page breaks (and print page breaks) are not simulated.
4. Safari/Firefox not run here.
