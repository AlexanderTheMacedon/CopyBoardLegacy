import { documentText, sanitizeDocument } from '../domain/document';
import type { DocNode, DocumentContent, Folder, Item, ItemAsset, Space } from '../domain/types';
import type { WriteBatch } from './store';

// Showcase / test space "Full": a reproducible workspace with every content kind, 60+ entries and folders four levels deep,
// so scrolling, densities, search, drag & drop, selection, context menus, inspector, editor and file view can be tried on
// realistic data. It is ordinary local data (origin 'local'): it can be edited, moved, deleted and stays after a reload.
// Safety: deterministic ids (`sp-showcase-full`, `fd-sc-…`, `it-sc-…`), so seeding only ever adds records that do not exist
// yet and never touches anything else; the meta marker makes the automatic path run once. Nothing here is real user data.

export const SHOWCASE_SPACE_ID = 'sp-showcase-full';
export const SHOWCASE_META_KEY = 'showcase.full';
export const SHOWCASE_VERSION = 1;
export const SHOWCASE_TAG = 'showcase';

/** Real, non-empty media for the central media paths (generated on the device, see showcase-media.ts). */
export interface ShowcaseMedia {
  readonly images: readonly { readonly asset: ItemAsset; readonly width: number; readonly height: number }[];
  readonly audio: readonly { readonly asset: ItemAsset; readonly durationSec: number }[];
  readonly files: Readonly<Record<'pdf' | 'csv' | 'json' | 'txt' | 'md', ItemAsset>>;
}

export interface ShowcaseData {
  readonly space: Space;
  readonly folders: readonly Folder[];
  readonly items: readonly Item[];
}

const F = {
  projects: 'fd-sc-projekte',
  relaunch: 'fd-sc-relaunch',
  design: 'fd-sc-relaunch-design',
  assets: 'fd-sc-relaunch-design-assets',
  research: 'fd-sc-relaunch-research',
  api: 'fd-sc-api',
  snippets: 'fd-sc-snippets',
  ts: 'fd-sc-snippets-ts',
  shell: 'fd-sc-snippets-shell',
  media: 'fd-sc-medien',
  voice: 'fd-sc-medien-audio',
  archive: 'fd-sc-archiv',
  archive2025: 'fd-sc-archiv-2025',
  empty: 'fd-sc-leer',
} as const;

const wave = (seed: number, bars = 48): number[] =>
  Array.from({ length: bars }, (_, i) => {
    const v = Math.abs(Math.sin((i + 1) * 0.37 * seed) * 0.6 + Math.sin((i + 1) * 0.11 * seed) * 0.4);
    return Math.round((0.18 + v * 0.82) * 100) / 100;
  });

type Draft =
  | { kind: 'document'; title: string; outline: string; folder?: string; fav?: boolean; tags?: string[] }
  | { kind: 'text' | 'markdown'; title: string; body: string; folder?: string; fav?: boolean; tags?: string[] }
  | { kind: 'code'; title: string; language: string; body: string; folder?: string; fav?: boolean; tags?: string[] }
  | { kind: 'link'; title: string; url: string; folder?: string; fav?: boolean; tags?: string[] }
  | { kind: 'image'; title: string; alt: string; size: [number, number]; palette: [string, string, string]; media?: number; folder?: string; fav?: boolean; tags?: string[] }
  | { kind: 'file'; title: string; fileName: string; sizeBytes: number; media?: keyof ShowcaseMedia['files']; folder?: string; fav?: boolean; tags?: string[] }
  | { kind: 'audio'; title: string; durationSec: number; media?: number; folder?: string; fav?: boolean; tags?: string[] };

/** A small rich-text document from a tiny outline: `# ` / `## ` headings, `- ` bullets, anything else a paragraph. */
function documentFromOutline(outline: string): DocumentContent {
  const blocks: DocNode[] = [];
  let list: DocNode[] = [];
  const flush = () => {
    if (list.length) blocks.push({ type: 'bulletList', content: list });
    list = [];
  };
  const text = (t: string): DocNode[] => [{ type: 'text', text: t }];
  for (const line of outline.split('\n')) {
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) list.push({ type: 'listItem', content: [{ type: 'paragraph', content: text(bullet[1] ?? '') }] });
    else {
      flush();
      if (heading) blocks.push({ type: 'heading', attrs: { level: heading[1]?.length ?? 1 }, content: text(heading[2] ?? '') });
      else if (line.trim()) blocks.push({ type: 'paragraph', content: text(line) });
    }
  }
  flush();
  return sanitizeDocument({ type: 'doc', content: blocks });
}

const LOREM =
  'Gute Werkzeuge verschwinden im Gebrauch. Sie nehmen auf, was gerade wichtig ist, und geben es im richtigen Moment wieder her. ';

const drafts: readonly Draft[] = [
  // --- board level: one of every kind, short and long titles ---
  { kind: 'text', title: 'Willkommen im Test-Space „Full“', body: 'Dieser Space ist ein Showcase mit synthetischen Testdaten. Alles hier darf bearbeitet, verschoben und gelöscht werden; es wird nicht automatisch wiederhergestellt.', fav: true },
  { kind: 'markdown', title: 'Checkliste Praxistest', body: '# Praxistest\n\n- [ ] Mehrfach scrollen in allen drei Dichten\n- [ ] Karten in Ordner ziehen\n- [ ] Mehrfachauswahl mit ⇧ und ⌘\n- [ ] Kontextmenü am Rand öffnen\n- [ ] Suche nach „Lichtlinien“\n- [ ] Bild im Inspector öffnen\n- [ ] Code im Editor bearbeiten', fav: true, tags: ['qa'] },
  { kind: 'code', title: 'useDebouncedValue.ts', language: 'typescript', body: "import { useEffect, useState } from 'react';\n\nexport function useDebouncedValue<T>(value: T, ms = 200): T {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => {\n    const timer = setTimeout(() => setDebounced(value), ms);\n    return () => clearTimeout(timer);\n  }, [value, ms]);\n  return debounced;\n}" },
  { kind: 'link', title: 'MDN: writing-mode', url: 'https://developer.mozilla.org/de/docs/Web/CSS/writing-mode', tags: ['css'] },
  { kind: 'image', title: 'Showcase Abendlicht', alt: 'Generiertes Testbild: warmer Verlauf mit Lichtbögen', size: [1600, 1000], palette: ['#FFE9D6', '#F59A5B', '#B4451A'], media: 0, fav: true },
  { kind: 'file', title: 'Quartalsbericht Q3 (Test).pdf', fileName: 'quartalsbericht-q3-test.pdf', sizeBytes: 0, media: 'pdf' },
  { kind: 'audio', title: 'Sprachnotiz Kickoff (Testton)', durationSec: 3, media: 0 },
  { kind: 'text', title: 'Ein sehr langer Titel, der zeigt, wie Karten mit Überlänge in allen Dichten und Ansichten sauber gekürzt werden', body: LOREM.repeat(4) },
  { kind: 'text', title: 'Kurz', body: 'Ein Wort.' },
  { kind: 'markdown', title: 'Release Notes 2.0', body: '## Neu\n\n- Universal Paste überall\n- Spaces mit eigener Farbe\n- Ordner bis in die Tiefe\n\n## Behoben\n\n- Kontextmenüs liegen über allen Karten', tags: ['release'] },
  { kind: 'code', title: 'query.sql', language: 'sql', body: "SELECT space_id, count(*) AS items\nFROM items\nWHERE created_at > now() - interval '30 days'\nGROUP BY space_id\nORDER BY items DESC;" },
  { kind: 'link', title: 'Unsplash License', url: 'https://unsplash.com/license' },
  { kind: 'image', title: 'Screenshot Hochformat', alt: 'Generiertes Testbild im Hochformat', size: [780, 1688], palette: ['#E8F1FB', '#86A9D6', '#2C4C7A'], media: 1 },
  { kind: 'file', title: 'Export Kontakte (Test).csv', fileName: 'kontakte-test.csv', sizeBytes: 0, media: 'csv', tags: ['daten'] },
  { kind: 'text', title: 'Zitat', body: '„Einfachheit ist die höchste Stufe der Vollendung.“ — Leonardo da Vinci' },
  { kind: 'code', title: 'tokens.css', language: 'css', body: ':root {\n  --radius-control: 12px;\n  --radius-card: 20px;\n  --ease-glide: cubic-bezier(0.32, 0.72, 0, 1);\n}' },
  { kind: 'markdown', title: 'Meeting-Notizen Design-Review', body: '### Entscheidungen\n\n1. Rechtes Dock schmaler\n2. Space-Name vertikal in Instrument Serif\n3. Startanimation abschaltbar\n\n> Nächster Termin: Donnerstag', fav: true },
  { kind: 'link', title: 'Web.dev: Interaction to Next Paint', url: 'https://web.dev/articles/inp' },
  { kind: 'image', title: 'Quadrat Moos', alt: 'Synthetisches Testbild in Grüntönen', size: [1200, 1200], palette: ['#EEF5E6', '#9DBF8A', '#3E6B3A'] },
  { kind: 'audio', title: 'Interview-Ausschnitt (synthetisch)', durationSec: 214 },
  // --- Projekte ---
  { kind: 'markdown', title: 'Projektübersicht', folder: F.projects, body: '# Projekte\n\nRelaunch 2027 und API v2 liegen in Unterordnern. Diese Notiz liegt auf der ersten Ebene.' },
  { kind: 'text', title: 'Budgetrahmen', folder: F.projects, body: 'Rahmen 120 k €, davon 40 % Design, 45 % Entwicklung, 15 % Puffer. (Testdaten)' },
  { kind: 'link', title: 'Projekt-Board (Beispiel)', folder: F.projects, url: 'https://example.com/board' },
  // Relaunch 2027 (level 2)
  { kind: 'markdown', title: 'Briefing Relaunch', folder: F.relaunch, body: '## Ziel\n\nEin ruhigeres, schnelleres Produkt.\n\n## Nicht-Ziele\n\n- Kein Rebranding\n- Keine neue Datenhaltung', fav: true },
  { kind: 'text', title: 'Zeitplan', folder: F.relaunch, body: 'Konzept bis November, Design bis Januar, Umsetzung bis April, Launch im Mai.' },
  { kind: 'file', title: 'Anforderungen.md', folder: F.relaunch, fileName: 'anforderungen.md', sizeBytes: 0, media: 'md' },
  // Design (level 3)
  { kind: 'image', title: 'Moodboard Nebelblau', folder: F.design, alt: 'Generiertes Testbild in Blautönen', size: [1440, 900], palette: ['#EEF3F8', '#A9C4E2', '#3B5E8C'], media: 2 },
  { kind: 'image', title: 'Komposition Dämmerung', folder: F.design, alt: 'Synthetisches Testbild in Rosé und Violett', size: [1920, 1080], palette: ['#F3E6EA', '#C9A3C8', '#5C4A7A'] },
  { kind: 'markdown', title: 'Typografie-Skala', folder: F.design, body: '| Rolle | Größe |\n| --- | --- |\n| Display | 64 px |\n| Titel | 22 px |\n| UI | 14 px |\n| Caption | 12 px |' },
  { kind: 'code', title: 'radius.ts', folder: F.design, language: 'typescript', body: 'export const squircle = (size: number) => Math.round(size * 0.3);' },
  // Assets (level 4)
  { kind: 'image', title: 'Icon-Raster 24 px', folder: F.assets, alt: 'Generiertes Testbild: Raster', size: [1024, 1024], palette: ['#F4F4F6', '#C9CCD6', '#5A6070'], media: 3 },
  { kind: 'file', title: 'Farbpalette.json', folder: F.assets, fileName: 'farbpalette.json', sizeBytes: 0, media: 'json' },
  { kind: 'image', title: 'Hero-Variante B', folder: F.assets, alt: 'Synthetisches Testbild in Orange', size: [2400, 1200], palette: ['#FFF1E4', '#FFB27A', '#C8541A'] },
  { kind: 'text', title: 'Asset-Konventionen', folder: F.assets, body: 'Dateinamen in Kleinbuchstaben, Bindestriche statt Leerzeichen, Größe im Namen nur bei Rastergrafiken.' },
  // Research (level 3)
  { kind: 'markdown', title: 'Interview-Leitfaden', folder: F.research, body: '1. Wie sammelst du heute Schnipsel?\n2. Was geht dabei verloren?\n3. Wann suchst du etwas wieder?' },
  { kind: 'audio', title: 'Nutzerinterview 03 (synthetisch)', folder: F.research, durationSec: 1260 },
  { kind: 'link', title: 'Nielsen Norman Group', folder: F.research, url: 'https://www.nngroup.com/articles/' },
  { kind: 'text', title: 'Erkenntnis: Wiederfinden', folder: F.research, body: 'Die meisten Nutzer erinnern sich an den Zeitpunkt, nicht an den Titel. Zeitachsen helfen mehr als Tags.' },
  // API v2 (level 2)
  { kind: 'code', title: 'routes.go', folder: F.api, language: 'go', body: 'func Routes(r *mux.Router) {\n\tr.HandleFunc("/items", listItems).Methods("GET")\n\tr.HandleFunc("/items/{id}", getItem).Methods("GET")\n}' },
  { kind: 'code', title: 'schema.json', folder: F.api, language: 'json', body: '{\n  "type": "object",\n  "required": ["id", "kind"],\n  "properties": {\n    "id": { "type": "string" },\n    "kind": { "enum": ["text", "code", "image"] }\n  }\n}' },
  { kind: 'markdown', title: 'API-Versionierung', folder: F.api, body: 'Breaking Changes nur mit neuer Major-Version; alte Version bleibt 6 Monate erreichbar.' },
  { kind: 'link', title: 'RFC 9110 HTTP Semantics', folder: F.api, url: 'https://www.rfc-editor.org/rfc/rfc9110' },
  // --- Snippets ---
  { kind: 'code', title: 'main.rs', folder: F.snippets, language: 'rust', body: 'fn main() {\n    let items: Vec<&str> = vec!["text", "code", "image"];\n    for (i, kind) in items.iter().enumerate() {\n        println!("{i}: {kind}");\n    }\n}' },
  { kind: 'code', title: 'clipboard.py', folder: F.snippets, language: 'python', body: 'from dataclasses import dataclass\n\n@dataclass\nclass Snippet:\n    title: str\n    body: str\n\n    def preview(self, n: int = 40) -> str:\n        return self.body[:n]' },
  { kind: 'code', title: 'Card.swift', folder: F.snippets, language: 'swift', body: 'struct Card: View {\n    let title: String\n    var body: some View {\n        Text(title).font(.headline)\n    }\n}' },
  { kind: 'code', title: 'index.html', folder: F.snippets, language: 'html', body: '<!doctype html>\n<html lang="de">\n  <head><meta charset="utf-8"><title>Test</title></head>\n  <body><main id="app"></main></body>\n</html>' },
  { kind: 'code', title: 'pipe.ts', folder: F.ts, language: 'typescript', body: 'export const pipe = <T>(...fns: ((x: T) => T)[]) => (x: T) => fns.reduce((v, f) => f(v), x);' },
  { kind: 'code', title: 'assertNever.ts', folder: F.ts, language: 'typescript', body: "export function assertNever(value: never): never {\n  throw new Error(`Unexpected: ${String(value)}`);\n}" },
  { kind: 'code', title: 'groupBy.ts', folder: F.ts, language: 'typescript', fav: true, body: 'export const groupBy = <T, K extends PropertyKey>(xs: readonly T[], key: (x: T) => K) =>\n  xs.reduce((acc, x) => ((acc[key(x)] ??= []).push(x), acc), {} as Record<K, T[]>);' },
  { kind: 'code', title: 'deploy.sh', folder: F.shell, language: 'bash', body: '#!/usr/bin/env bash\nset -euo pipefail\nnpm ci\nnpm run build\necho "Build fertig"' },
  { kind: 'code', title: 'git-cleanup.sh', folder: F.shell, language: 'bash', body: 'git fetch --prune\ngit branch --merged main | grep -v main | xargs -r git branch -d' },
  // --- Medien ---
  { kind: 'image', title: 'Panorama Testbild', folder: F.media, alt: 'Synthetisches Panorama in Petrol', size: [3200, 900], palette: ['#E3F2F1', '#6FB3AE', '#1D5A57'] },
  { kind: 'image', title: 'Porträt Platzhalter', folder: F.media, alt: 'Synthetisches Testbild im Porträtformat', size: [900, 1200], palette: ['#F7EDE6', '#D9A88C', '#7A4A33'] },
  { kind: 'file', title: 'Untertitel.txt', folder: F.media, fileName: 'untertitel.txt', sizeBytes: 0, media: 'txt' },
  { kind: 'file', title: 'Rohschnitt.mov', folder: F.media, fileName: 'rohschnitt.mov', sizeBytes: 734_003_200 },
  { kind: 'audio', title: 'Memo Rückruf (Testton)', folder: F.voice, durationSec: 2, media: 1 },
  { kind: 'audio', title: 'Diktat Wochenplanung (synthetisch)', folder: F.voice, durationSec: 96 },
  { kind: 'audio', title: 'Idee unterwegs (synthetisch)', folder: F.voice, durationSec: 41, fav: true },
  // --- Archiv (level 1 filled, level 2 empty) ---
  { kind: 'text', title: 'Alte Entscheidung: Sidebar', folder: F.archive, body: 'Ersetzt durch das Floating Dock. Nur noch zur Nachvollziehbarkeit hier.' },
  { kind: 'file', title: 'Protokoll 2025.zip', folder: F.archive, fileName: 'protokoll-2025.zip', sizeBytes: 18_874_368 },
  { kind: 'link', title: 'Archivierte Spezifikation', folder: F.archive, url: 'https://example.org/spec-v1' },
  // --- more board-level variety for scrolling ---
  { kind: 'markdown', title: 'Tastenkürzel', body: '- ⌘K Suche\n- ⌘V Einfügen\n- Esc Schließen\n- ⇧ Klick Bereichsauswahl', tags: ['hilfe'] },
  { kind: 'code', title: 'Makefile', language: 'makefile', body: 'build:\n\tnpm run build\n\ntest:\n\tnpm test' },
  { kind: 'text', title: 'Einkaufsliste (Test)', body: 'Kaffee, Hafermilch, Notizbuch A5, Batterien AA' },
  { kind: 'link', title: 'Instrument Serif (Google Fonts)', url: 'https://fonts.google.com/specimen/Instrument+Serif' },
  { kind: 'image', title: 'Nachtglas', alt: 'Synthetisches Testbild in dunklem Blau', size: [1600, 900], palette: ['#C8D0E0', '#5B6A8E', '#151C2E'] },
  { kind: 'file', title: 'Rechnung 2026-10 (Test).pdf', fileName: 'rechnung-2026-10-test.pdf', sizeBytes: 182_400, fav: true },
  { kind: 'text', title: 'Gedanke', body: LOREM },
  // appended last: item ids follow the draft order, so earlier ids stay stable on devices that already seeded the space
  { kind: 'document', title: 'Produktvision 2027', outline: '# Produktvision 2027\nCopyBoard bleibt ein ruhiger Ort für alles, was du sammelst.\n## Leitplanken\n- Lokal zuerst\n- Eine Oberfläche für Text, Code und Bild\n- Schnell, auch mit tausenden Einträgen', fav: true },
  { kind: 'document', title: 'Interview-Notizen (Dokument)', outline: '# Interview 14\nDie Befragte sammelt Screenshots, Links und Zitate in drei verschiedenen Apps.\n## Aufgefallen\n- Wiederfinden dauert länger als Sammeln\n- Ordner werden selten gepflegt', folder: F.research },
];

/** Builds the showcase records. Timestamps fan out backwards from `now` (newest first), so sorting is meaningful. */
export function buildShowcase(now: Date, media: ShowcaseMedia): ShowcaseData {
  const iso = (i: number) => new Date(now.getTime() - i * 37 * 60 * 60 * 1000 - i * 7 * 60 * 1000).toISOString();
  const space: Space = {
    id: SHOWCASE_SPACE_ID,
    name: 'Full',
    color: 'plum',
    icon: 'lucide:layers',
    description: 'Test- und Showcase-Space mit synthetischen Daten. Darf frei bearbeitet und gelöscht werden.',
    order: 999,
    origin: 'local',
  };
  const folder = (id: string, name: string, parentId: string | null, i: number, extra: Partial<Folder> = {}): Folder => ({
    id,
    spaceId: SHOWCASE_SPACE_ID,
    parentId,
    name,
    createdAt: iso(i),
    updatedAt: iso(i),
    ...extra,
  });
  const folders: Folder[] = [
    folder(F.projects, 'Projekte', null, 1, { color: 'sky' }),
    folder(F.relaunch, 'Relaunch 2027', F.projects, 2),
    folder(F.design, 'Design', F.relaunch, 3, { color: 'rose' }),
    folder(F.assets, 'Assets', F.design, 4),
    folder(F.research, 'Research', F.relaunch, 5),
    folder(F.api, 'API v2', F.projects, 6),
    folder(F.snippets, 'Snippets', null, 7, { color: 'mint' }),
    folder(F.ts, 'TypeScript', F.snippets, 8),
    folder(F.shell, 'Shell', F.snippets, 9),
    folder(F.media, 'Medien', null, 10, { color: 'amber' }),
    folder(F.voice, 'Sprachnotizen', F.media, 11),
    folder(F.archive, 'Archiv', null, 12, { color: 'slate' }),
    folder(F.archive2025, '2025 (leer)', F.archive, 13),
    folder(F.empty, 'Leerer Ordner', null, 14),
  ];
  const items = drafts.map((draft, i): Item => {
    const base = {
      id: `it-sc-${String(i + 1).padStart(2, '0')}`,
      spaceId: SHOWCASE_SPACE_ID,
      folderId: draft.folder ?? null,
      title: draft.title,
      createdAt: iso(i),
      updatedAt: iso(i),
      tags: [SHOWCASE_TAG, ...(draft.tags ?? [])],
      favorite: !!draft.fav,
      origin: 'local' as const,
    };
    switch (draft.kind) {
      case 'document': {
        const content = documentFromOutline(draft.outline);
        return { ...base, kind: 'document', content, text: documentText(content.doc) };
      }
      case 'text':
      case 'markdown':
        return { ...base, kind: draft.kind, body: draft.body };
      case 'code':
        return { ...base, kind: 'code', language: draft.language, body: draft.body };
      case 'link':
        return { ...base, kind: 'link', url: draft.url };
      case 'image': {
        const real = draft.media !== undefined ? media.images[draft.media] : undefined;
        return {
          ...base,
          kind: 'image',
          alt: draft.alt,
          width: real?.width ?? draft.size[0],
          height: real?.height ?? draft.size[1],
          palette: draft.palette,
          ...(real ? { asset: real.asset } : {}),
        };
      }
      case 'file': {
        const asset = draft.media ? media.files[draft.media] : undefined;
        return { ...base, kind: 'file', fileName: draft.fileName, sizeBytes: asset?.blob.size ?? draft.sizeBytes, ...(asset ? { asset } : {}) };
      }
      case 'audio': {
        const real = draft.media !== undefined ? media.audio[draft.media] : undefined;
        return {
          ...base,
          kind: 'audio',
          durationSec: real?.durationSec ?? draft.durationSec,
          waveform: wave(i + 3),
          ...(real ? { asset: real.asset, fileName: `${base.id}.wav` } : {}),
        };
      }
    }
  });
  return { space, folders, items };
}

export interface ShowcasePlan {
  readonly batch: WriteBatch;
  /** Number of records the batch adds (0 = everything already exists, nothing to write but the marker). */
  readonly added: number;
}

/**
 * Plans the seed against what is stored: only records whose id does not exist yet are written (never an overwrite, never
 * a delete), plus the version marker. Running it twice therefore adds nothing the second time.
 */
export function planShowcase(
  existing: { readonly itemIds: ReadonlySet<string>; readonly folderIds: ReadonlySet<string>; readonly spaceIds: ReadonlySet<string> },
  data: ShowcaseData,
  now: Date,
): ShowcasePlan {
  const spaces = existing.spaceIds.has(data.space.id) ? [] : [data.space];
  const folders = data.folders.filter((f) => !existing.folderIds.has(f.id));
  const items = data.items.filter((i) => !existing.itemIds.has(i.id));
  const batch: WriteBatch = {
    ...(spaces.length ? { spaces: { put: spaces } } : {}),
    ...(folders.length ? { folders: { put: folders } } : {}),
    ...(items.length ? { items: { put: items } } : {}),
    meta: { [SHOWCASE_META_KEY]: { version: SHOWCASE_VERSION, seededAt: now.toISOString() } },
  };
  return { batch, added: spaces.length + folders.length + items.length };
}
