// Pure content detection for Universal Paste, drop and the file picker. No browser APIs: everything here is unit-tested in Node.

/** What a paste/drop delivered, read synchronously from the event (or from the async Clipboard API). */
export interface RawClipboard {
  readonly files: readonly File[];
  readonly text: string;
  readonly html: string;
}

/** One thing to capture. A paste with several files yields several sources. */
export type CaptureSource = { readonly type: 'text'; readonly text: string } | { readonly type: 'file'; readonly file: File };

export type TextClass =
  | { readonly kind: 'link'; readonly url: string }
  | { readonly kind: 'code'; readonly language: string; readonly body: string }
  | { readonly kind: 'markdown' | 'text'; readonly body: string };

const URL_PATTERN = /^https?:\/\/[^\s<>"]+$/i;

export const isWebUrl = (value: string): boolean => {
  if (!URL_PATTERN.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
};

/**
 * Decides what a clipboard payload actually is. Real file data wins when it is the payload (screenshots, copied images,
 * Finder files). Office apps put an image *rendering* next to their text, so an image beside substantial text is ignored in
 * favour of the text. Nothing is invented: HTML that only references an image yields no image source.
 */
export function pickSources(raw: RawClipboard): CaptureSource[] {
  const text = normalizeText(raw.text);
  const files = raw.files.filter((f) => f.size > 0);
  if (files.length) {
    const names = new Set(files.map((f) => f.name));
    const incidentalText = !text || isWebUrl(text) || text.split('\n').every((line) => names.has(line.trim()));
    const allImages = files.every((f) => f.type.startsWith('image/'));
    if (!allImages || incidentalText) return files.map((file) => ({ type: 'file', file }));
  }
  return text ? [{ type: 'text', text }] : [];
}

/** HTML that only points at an image (e.g. "copy image address" in some browsers) without delivering pixels. */
export const referencesImageOnly = (raw: RawClipboard): boolean => !raw.files.length && !raw.text.trim() && /<img\b/i.test(raw.html);

/** Unifies line endings and drops blank lines around the content; inner whitespace and indentation stay untouched. */
export const normalizeText = (text: string): string => text.replace(/\r\n?/g, '\n').replace(/^\s*\n|\s+$/g, '');

const FENCE = /^```([\w+#.-]*)[ \t]*\n([\s\S]*?)\n```$/;

/** Language guess for code: strong syntactic signals only; `null` means "probably not code". */
export function detectLanguage(body: string): string | null {
  const trimmed = body.trim();
  if (/^[[{]/.test(trimmed) && /[\]}]$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // not JSON, keep looking
    }
  }
  if (/^<(!doctype|html|div|svg|template|[a-z]+[\s>])/i.test(trimmed) && /<\/[a-z]+>\s*$/i.test(trimmed)) return 'html';
  if (/^\s*(select\s.+\sfrom\s|insert\s+into\s|update\s+\w+\s+set\s|create\s+(table|index|view)\s|delete\s+from\s)/im.test(trimmed)) return 'sql';
  if (/^(#!\/|\$ )/.test(trimmed) || /^(npm|npx|pnpm|yarn|git|cd|ls|brew|curl|docker|sudo|export)\s.+(\n(npm|npx|pnpm|yarn|git|cd|ls|brew|curl|docker|sudo|export)\s.+)+$/.test(trimmed))
    return 'shell';
  if (/^\s*(def\s+\w+\(.*\)\s*(->.*)?:|class\s+\w+(\(.*\))?:|from\s+[\w.]+\s+import\s|import\s+\w+\s*$)/m.test(trimmed) && !/[;{}]\s*$/m.test(trimmed))
    return 'python';
  if (/^\s*[.#@]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^}]*:[^}]*;?[^}]*\}/m.test(trimmed) && !/\b(function|const|let|return)\b/.test(trimmed)) return 'css';
  const ts = /\b(interface\s+\w+|type\s+\w+\s*=|:\s*(string|number|boolean|void|unknown|Record<)|as\s+const|<\w+>\()/.test(trimmed);
  const js = /(\b(const|let|var|function|return|import|export|async|await|class)\b.*[=({;]|=>|\bconsole\.\w+\()/.test(trimmed);
  if (ts && js) return 'typescript';
  if (js) return 'javascript';
  if (/^\s*(fn\s+\w+|let\s+mut\s|use\s+[\w:]+;|impl\s)/m.test(trimmed)) return 'rust';
  if (/^\s*(func\s+\w+\(|package\s+\w+$)/m.test(trimmed)) return 'go';
  if (/^\s*(public|private|protected)\s+(static\s+)?[\w<>[\]]+\s+\w+\s*\(/m.test(trimmed)) return 'java';
  // Generic code shape: most lines end in code punctuation or are indented blocks.
  const lines = trimmed.split('\n').filter((l) => l.trim());
  if (lines.length >= 3) {
    const codeLike = lines.filter((l) => /[;{}]\s*$/.test(l) || /^\s{2,}\S/.test(l) && /[=(){}[\];]/.test(l)).length;
    if (codeLike / lines.length >= 0.6) return 'code';
  }
  return null;
}

const markdownSignals = (body: string): number => {
  let score = 0;
  if (/^#{1,6}\s+\S/m.test(body)) score += 2;
  if (/^\s*[-*+]\s+\S/m.test(body)) score += 1;
  if (/^\s*\d+\.\s+\S/m.test(body)) score += 1;
  if (/^>\s+\S/m.test(body)) score += 1;
  if (/^```/m.test(body)) score += 2;
  if (/\[[^\]]+\]\([^)]+\)/.test(body)) score += 1;
  if (/(\*\*|__)[^*_\n]+\1/.test(body)) score += 1;
  if (/^\s*[-*+]\s+\[[ xX]\]\s/m.test(body)) score += 2;
  return score;
};

/** Text → link, code, Markdown or plain text. */
export function classifyText(input: string): TextClass {
  const body = normalizeText(input);
  if (isWebUrl(body.trim())) return { kind: 'link', url: body.trim() };
  const fence = FENCE.exec(body);
  if (fence) return { kind: 'code', language: fence[1] || detectLanguage(fence[2] ?? '') || 'code', body: fence[2] ?? '' };
  const multiLine = body.includes('\n');
  if (multiLine || /^[[{<]/.test(body)) {
    const language = detectLanguage(body);
    if (language && markdownSignals(body) < 2) return { kind: 'code', language, body };
  }
  if (markdownSignals(body) >= 2) return { kind: 'markdown', body };
  return { kind: 'text', body };
}

const TITLE_MAX = 64;

const clip = (value: string): string => (value.length > TITLE_MAX ? `${value.slice(0, TITLE_MAX - 1).trimEnd()}…` : value);

/** A readable card title: first meaningful line without Markdown markers; links show host + path. */
export function deriveTitle(cls: TextClass): string {
  if (cls.kind === 'link') {
    const url = new URL(cls.url);
    const path = url.pathname === '/' ? '' : decodeURIComponent(url.pathname).replace(/\/$/, '');
    return clip(`${url.hostname.replace(/^www\./, '')}${path}`);
  }
  const line =
    cls.body
      .split('\n')
      .map((l) => l.replace(/^\s*(#{1,6}|[-*+>]|\d+\.)\s+/, '').replace(/[*_`]/g, '').trim())
      .find((l) => l && !/^```/.test(l)) ?? '';
  return clip(line || (cls.kind === 'code' ? 'Code-Snippet' : 'Notiz'));
}

/** Browsers name pasted clipboard images generically ("image.png"); those get a dated title instead. */
export const isGenericImageName = (name: string): boolean => !name || /^(image|clipboard|blob|untitled)(\.\w+)?$/i.test(name);
