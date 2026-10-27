import type { IconName } from '../../components/Icon';
import type { Item, ItemKind } from '../../domain/types';
export { spaceColorVar } from '../../components/SpaceIcon';

export const kindLabel: Record<ItemKind, string> = {
  text: 'Text',
  markdown: 'Markdown',
  code: 'Code',
  link: 'Link',
  image: 'Bild',
  file: 'Datei',
  audio: 'Audio',
};

export const kindIcon: Record<ItemKind, IconName> = {
  text: 'text',
  markdown: 'hash',
  code: 'code',
  link: 'link',
  image: 'image',
  file: 'file',
  audio: 'waveform',
};

const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', timeZone: 'Europe/Berlin' });
const dateTimeFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' });

export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export const fileExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toUpperCase() : 'DATEI';
};

/** Text of the first Markdown heading, if any (plain text, never HTML). */
export const firstHeading = (body: string): string | undefined => /^#{1,6}\s+(.+)$/m.exec(body)?.[1]?.trim();

/** Plain-text excerpt for previews; Markdown markers are stripped, nothing is interpreted as HTML. */
export function excerpt(item: Item, max = 180, omitFirstHeading = false): string {
  if (item.kind !== 'text' && item.kind !== 'markdown') return '';
  let body = item.body;
  if (omitFirstHeading) body = body.replace(/^#{1,6}\s+.+$/m, '');
  const plain = body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** Host and path of a link for display, without protocol and `www.`. */
export function linkParts(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`;
    return { host: parsed.hostname.replace(/^www\./, ''), path };
  } catch {
    return { host: url, path: '' };
  }
}
