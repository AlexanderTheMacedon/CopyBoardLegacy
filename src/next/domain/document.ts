import type { DocNode, DocumentContent } from './types';

// Document model helpers (pure, no editor library). The stored tree is a whitelisted subset of ProseMirror JSON; everything
// that enters it, whether typed, pasted or loaded from disk, passes `sanitizeDocument`, so unknown nodes, unsafe link targets
// and arbitrary colours never reach storage or the editor.

export const DOCUMENT_SCHEMA = 1 as const;
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

const MAX_DEPTH = 24;
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const COLOR_VALUES = new Set(TEXT_COLORS.map((c) => c.value));

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
  if ((type === 'paragraph' || type === 'heading') && typeof raw.textAlign === 'string' && ALIGNMENTS.has(raw.textAlign)) attrs.textAlign = raw.textAlign;
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
      const color = typeof attrs?.color === 'string' ? attrs.color.toLowerCase() : '';
      return COLOR_VALUES.has(color) ? { type: 'textStyle', attrs: { color } } : undefined;
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

export const emptyDocument = (): DocumentContent => ({ schema: DOCUMENT_SCHEMA, doc: { type: 'doc', content: [{ type: 'paragraph' }] } });

/** Whitelists a stored or editor-produced tree. Never throws; the result always has at least one block. */
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
