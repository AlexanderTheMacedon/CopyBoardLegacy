import type { DocNode, DocumentContent, DocumentItem, TextItem } from './types';

// Document model helpers (pure, no editor library). The stored tree is a whitelisted subset of ProseMirror JSON; everything
// that enters it, whether typed, pasted or loaded from disk, passes `sanitizeDocument`, so unknown nodes, unsafe link targets
// and arbitrary colours never reach storage or the editor.
//
// Schema history: 1 = Run A (structure, emphasis, links, palette colour, alignment, tables, task lists).
//                 2 = Run C adds curated typography (font family, font size, highlight) and paragraph format (indent, line
//                     height, paragraph spacing). Every v1 tree is a valid v2 tree, so the migration only restamps it.

export const DOCUMENT_SCHEMA = 2 as const;
export const DEFAULT_DOCUMENT_TITLE = 'Unbenanntes Dokument';

/** Curated text colours (label for the tooltip, value stored). The default colour carries no mark at all. */
export const TEXT_COLORS: readonly { readonly label: string; readonly value: string }[] = [
  { label: 'Orange', value: '#c2410c' },
  { label: 'Blau', value: '#2563eb' },
  { label: 'Grün', value: '#15803d' },
  { label: 'Violett', value: '#7e22ce' },
  { label: 'Rosé', value: '#be123c' },
  { label: 'Grau', value: '#64748b' },
];

/** Highlighter palette: the stored key names the colour; light and dark tints are chosen by the surface rendering it. */
export const HIGHLIGHT_COLORS: readonly { readonly label: string; readonly value: string; readonly hex: string }[] = [
  { label: 'Gelb', value: 'yellow', hex: '#fde68a' },
  { label: 'Orange', value: 'orange', hex: '#fed7aa' },
  { label: 'Grün', value: 'green', hex: '#bbf7d0' },
  { label: 'Blau', value: 'blue', hex: '#bfdbfe' },
  { label: 'Violett', value: 'violet', hex: '#ddd6fe' },
  { label: 'Rosé', value: 'pink', hex: '#fecdd3' },
];

/** Curated font families (key stored, stack rendered). The document's own face carries no mark at all. */
export const FONT_FAMILIES: readonly { readonly label: string; readonly value: string; readonly stack: string }[] = [
  { label: 'Serif', value: 'serif', stack: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" },
  { label: 'Editorial', value: 'display', stack: "'Instrument Serif', 'Iowan Old Style', Georgia, serif" },
  { label: 'Rund', value: 'rounded', stack: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { label: 'Mono', value: 'mono', stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
];

/** Font sizes a selection can carry (px at 100 % zoom). Paragraph text is 17, headings 38 / 25 / 20. */
export const FONT_SIZES: readonly number[] = [12, 14, 15, 17, 20, 25, 32, 38, 48, 64];
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 64;
export const BLOCK_FONT_SIZE: Readonly<Record<string, number>> = { paragraph: 17, h1: 38, h2: 25, h3: 20 };

/** Paragraph format: line height (unitless) and space before a block (em). Absent = the page's calm default. */
export const LINE_HEIGHTS: readonly { readonly label: string; readonly value: string }[] = [
  { label: 'Einfach', value: '1.2' },
  { label: '1,5-fach', value: '1.5' },
  { label: 'Doppelt', value: '2' },
];
export const PARAGRAPH_SPACINGS: readonly { readonly label: string; readonly value: string; readonly em: number }[] = [
  { label: 'Ohne', value: 'none', em: 0 },
  { label: 'Klein', value: 'small', em: 0.35 },
  { label: 'Groß', value: 'large', em: 1.4 },
];
export const MAX_INDENT = 8;

const MAX_DEPTH = 24;
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const COLOR_VALUES = new Set(TEXT_COLORS.map((c) => c.value));
const HIGHLIGHT_VALUES = new Set(HIGHLIGHT_COLORS.map((c) => c.value));
const FONT_VALUES = new Set(FONT_FAMILIES.map((f) => f.value));
const LINE_HEIGHT_VALUES = new Set(LINE_HEIGHTS.map((l) => l.value));
const SPACING_VALUES = new Set(PARAGRAPH_SPACINGS.map((p) => p.value));

/** A palette text colour from `#rrggbb` or the browser's canonical `rgb(r, g, b)`; anything else is no colour. */
export function paletteColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let value = raw.trim().toLowerCase();
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (rgb) value = `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return COLOR_VALUES.has(value) ? value : undefined;
}
export const highlightColor = (raw: unknown): string | undefined => (typeof raw === 'string' && HIGHLIGHT_VALUES.has(raw) ? raw : undefined);
export const fontFamilyKey = (raw: unknown): string | undefined => (typeof raw === 'string' && FONT_VALUES.has(raw) ? raw : undefined);
/** A curated size as stored (`"20"`), from `20`, `"20"` or `"20px"`. */
export function fontSizeValue(raw: unknown): string | undefined {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim().replace(/px$/, '')) : NaN;
  return FONT_SIZES.includes(n) ? String(n) : undefined;
}
export const lineHeightValue = (raw: unknown): string | undefined => (typeof raw === 'string' && LINE_HEIGHT_VALUES.has(raw) ? raw : typeof raw === 'number' && LINE_HEIGHT_VALUES.has(String(raw)) ? String(raw) : undefined);
export const spacingValue = (raw: unknown): string | undefined => (typeof raw === 'string' && SPACING_VALUES.has(raw) ? raw : undefined);
export const indentValue = (raw: unknown): number | undefined => {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_INDENT ? n : undefined;
};

type Attrs = Record<string, string | number | boolean | null | readonly (number | null)[]>;

const int = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

/** A link target the app may ever render: absolute http(s)/mailto/tel only. Returns the normalised URL or `undefined`. */
export function safeHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** What the user types into the link field: a bare domain gets `https://`; anything else unsafe is rejected. */
export function normalizeHref(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return safeHref(value);
  return safeHref(`https://${value}`);
}

const nodeAttrs = (type: string, raw: Record<string, unknown>): Attrs | undefined => {
  const attrs: Attrs = {};
  switch (type) {
    case 'heading':
      attrs.level = int(raw.level, 1, 3) ?? 2;
      break;
    case 'orderedList':
      attrs.start = int(raw.start, 0, 9999) ?? 1;
      break;
    case 'taskItem':
      attrs.checked = raw.checked === true;
      break;
    case 'codeBlock':
      attrs.language = typeof raw.language === 'string' && /^[\w+#.-]{1,24}$/.test(raw.language) ? raw.language : null;
      break;
    case 'tableCell':
    case 'tableHeader': {
      attrs.colspan = int(raw.colspan, 1, 20) ?? 1;
      attrs.rowspan = int(raw.rowspan, 1, 20) ?? 1;
      attrs.colwidth = Array.isArray(raw.colwidth) ? raw.colwidth.map((w) => int(w, 20, 2000) ?? null) : null;
      break;
    }
  }
  if (type === 'paragraph' || type === 'heading') {
    if (typeof raw.textAlign === 'string' && ALIGNMENTS.has(raw.textAlign)) attrs.textAlign = raw.textAlign;
    const indent = indentValue(raw.indent);
    if (indent) attrs.indent = indent;
    const lineHeight = lineHeightValue(raw.lineHeight);
    if (lineHeight) attrs.lineHeight = lineHeight;
    const spacing = spacingValue(raw.spacing);
    if (spacing) attrs.spacing = spacing;
  }
  return Object.keys(attrs).length ? attrs : undefined;
};

const markOf = (raw: unknown): { type: string; attrs?: Record<string, string> } | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const { type, attrs } = raw as { type?: unknown; attrs?: Record<string, unknown> };
  switch (type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'code':
      return { type };
    case 'link': {
      const href = safeHref(attrs?.href);
      return href ? { type: 'link', attrs: { href } } : undefined;
    }
    case 'textStyle': {
      // one span may carry several curated properties; each is validated on its own, an empty style is no mark
      const kept: Record<string, string> = {};
      const color = paletteColor(attrs?.color);
      if (color) kept.color = color;
      const fontFamily = fontFamilyKey(attrs?.fontFamily);
      if (fontFamily) kept.fontFamily = fontFamily;
      const fontSize = fontSizeValue(attrs?.fontSize);
      if (fontSize) kept.fontSize = fontSize;
      return Object.keys(kept).length ? { type: 'textStyle', attrs: kept } : undefined;
    }
    case 'highlight': {
      const color = highlightColor(attrs?.color);
      return color ? { type: 'highlight', attrs: { color } } : undefined;
    }
    default:
      return undefined;
  }
};

/** Block containers: node type → whether it may directly hold text. Anything else is dropped (its text children survive). */
const BLOCKS = new Set([
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'codeBlock',
  'horizontalRule', 'table', 'tableRow', 'tableHeader', 'tableCell', 'hardBreak',
]);

function cleanNode(raw: unknown, depth: number): DocNode[] {
  if (!raw || typeof raw !== 'object' || depth > MAX_DEPTH) return [];
  const node = raw as { type?: unknown; text?: unknown; content?: unknown; attrs?: Record<string, unknown>; marks?: unknown };
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || !node.text) return [];
    const marks = Array.isArray(node.marks) ? node.marks.map(markOf).filter((m): m is NonNullable<ReturnType<typeof markOf>> => !!m) : [];
    return [marks.length ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text }];
  }
  const children = Array.isArray(node.content) ? node.content.flatMap((child) => cleanNode(child, depth + 1)) : [];
  if (typeof node.type !== 'string' || !BLOCKS.has(node.type)) return children; // unknown wrapper: keep what is inside
  const attrs = nodeAttrs(node.type, node.attrs ?? {});
  const out: { type: string; attrs?: Attrs; content?: DocNode[] } = { type: node.type };
  if (attrs) out.attrs = attrs;
  if (children.length) out.content = children;
  return [out];
}

/** Plain-text paragraphs as a document: the recovery shape for content that cannot be read as structure. */
export const documentFromText = (text: string): DocumentContent => ({
  schema: DOCUMENT_SCHEMA,
  doc: {
    type: 'doc',
    content: text.split(/\r?\n/).map((line): DocNode => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
  },
});

/**
 * What converting a plain text into a document changes, so the confirmation can say it plainly instead of hiding it:
 * the number of paragraphs (one per line), CRLF line ends that become plain breaks, lone CR characters that stay inside
 * their paragraph, and empty lines at the end, which stay as empty paragraphs but are not part of the copied text.
 */
export function conversionNotes(text: string): { paragraphs: number; crlf: boolean; loneCr: boolean; trailingBlank: number } {
  const lines = text.split(/\r?\n/);
  let trailingBlank = 0;
  while (trailingBlank < lines.length - 1 && !lines[lines.length - 1 - trailingBlank]) trailingBlank++;
  return { paragraphs: lines.length, crlf: text.includes('\r\n'), loneCr: /\r(?!\n)/.test(text), trailingBlank };
}

export const emptyDocument = (): DocumentContent => ({ schema: DOCUMENT_SCHEMA, doc: { type: 'doc', content: [{ type: 'paragraph' }] } });

/**
 * Whitelists a stored or editor-produced tree and stamps the current schema. Never throws; the result always has at least
 * one block. Accepts schema 1 (migrated: a v1 tree is a valid v2 tree) and schema 2; a bare ProseMirror `doc` is read too.
 */
export function sanitizeDocument(raw: unknown): DocumentContent {
  const root = raw && typeof raw === 'object' && 'doc' in raw && (raw as { schema?: unknown }).schema !== undefined ? (raw as { doc: unknown }).doc : raw;
  const content = root && typeof root === 'object' && Array.isArray((root as { content?: unknown }).content) ? ((root as { content: unknown[] }).content) : [];
  // stray inline nodes at the top level (a foreign wrapper was dropped) get a paragraph of their own
  const blocks = content.flatMap((child) => cleanNode(child, 1)).map((n): DocNode => (n.type === 'text' || n.type === 'hardBreak' ? { type: 'paragraph', content: [n] } : n));
  return { schema: DOCUMENT_SCHEMA, doc: { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] } };
}

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'codeBlock']);

/** Derived plain text: one line per text block, table cells separated by tabs. Feeds search, previews and "copy". */
export function documentText(doc: DocNode): string {
  const lines: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === 'text') return;
    if (TEXT_BLOCKS.has(node.type)) {
      lines.push(inlineText(node));
      return;
    }
    if (node.type === 'tableRow') {
      lines.push((node.content ?? []).map((cell) => (cell.content ?? []).map(inlineText).join(' ')).join('\t'));
      return;
    }
    node.content?.forEach(walk);
  };
  const inlineText = (node: DocNode): string =>
    (node.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : c.type === 'hardBreak' ? '\n' : inlineText(c))).join('');
  walk(doc);
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

/** Headings for the outline in the context rail. */
export function documentOutline(doc: DocNode): { level: number; text: string }[] {
  return (doc.content ?? [])
    .filter((n) => n.type === 'heading')
    .map((n) => ({ level: Number(n.attrs?.level ?? 2), text: (n.content ?? []).map((c) => c.text ?? '').join('') }))
    .filter((h) => h.text.trim());
}

/** First non-empty line of the document, clipped: the automatic title of a document the user never named. */
export function titleFromText(text: string): string {
  const line = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  if (!line) return DEFAULT_DOCUMENT_TITLE;
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * A plain text card as a Dokument (explicit user choice, never on open): same id, place, title, tags, favourite, origin
 * and creation date; every line becomes a paragraph, so the text itself is kept character for character (line endings
 * normalised, trailing empty lines dropped like everywhere else documents derive their text). `updatedAt` is the moment
 * of the conversion, because the stored format changed then.
 */
export function textItemToDocument(item: TextItem, now = new Date()): DocumentItem {
  // Markdown has its own source semantics; only plain text cards convert
  if (item.kind !== 'text') throw new TypeError('only text cards convert to documents');
  const { body, kind: _kind, ...base } = item;
  const content = documentFromText(body);
  return { ...base, kind: 'document', content, text: documentText(content.doc), updatedAt: now.toISOString() };
}
