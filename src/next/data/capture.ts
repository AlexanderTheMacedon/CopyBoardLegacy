import { DEFAULT_DOCUMENT_TITLE, emptyDocument } from '../domain/document';
import type { CodeItem, DocumentItem, FolderId, Item, ItemId, SpaceId, TextItem } from '../domain/types';
import { classifyText, deriveTitle, isGenericImageName, type CaptureSource } from './classify';

// Turns capture sources into complete items. Image size and audio waveform are measured from the real data; when a
// format cannot be decoded the content is kept as a file instead of guessing.

/** Per-item ceiling for captured binaries; IndexedDB can hold more, but huge blobs make the board sluggish. */
export const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
/** Audio above this size keeps an empty waveform instead of being decoded in memory. */
const MAX_DECODE_BYTES = 24 * 1024 * 1024;
const WAVE_BARS = 48;

export class CaptureTooLargeError extends Error {
  constructor(readonly fileName: string) {
    super(`${fileName} is too large`);
  }
}

export const newItemId = (): ItemId =>
  `it-local-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;

const timeFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Real waveform: RMS of 48 equal slices of the first channel, normalised to the loudest slice. */
async function analyseAudio(file: File): Promise<{ durationSec: number; waveform: number[] }> {
  const Context = globalThis.AudioContext;
  if (!Context || file.size > MAX_DECODE_BYTES) return { durationSec: 0, waveform: [] };
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const slice = Math.max(1, Math.floor(samples.length / WAVE_BARS));
    const rms: number[] = [];
    for (let bar = 0; bar < WAVE_BARS; bar++) {
      let sum = 0;
      const start = bar * slice;
      const end = Math.min(samples.length, start + slice);
      for (let i = start; i < end; i++) sum += (samples[i] ?? 0) ** 2;
      rms.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
    const peak = Math.max(...rms, 1e-6);
    return {
      durationSec: Math.round(buffer.duration),
      waveform: rms.map((v) => Math.round((0.08 + (v / peak) * 0.92) * 100) / 100),
    };
  } catch {
    return { durationSec: 0, waveform: [] };
  } finally {
    void context.close();
  }
}

interface ItemContext {
  readonly spaceId: SpaceId;
  readonly favorite: boolean;
  readonly now: Date;
}

const base = (ctx: ItemContext, title: string) => {
  const iso = ctx.now.toISOString();
  return { id: newItemId(), spaceId: ctx.spaceId, title, createdAt: iso, updatedAt: iso, tags: [], favorite: ctx.favorite, origin: 'local' } as const;
};

/** A new, empty rich-text document at a placement (space board or folder). Always the user's own, writable content. */
export function createDocumentItem(spaceId: SpaceId, folderId: FolderId | null, now = new Date()): DocumentItem {
  return { ...base({ spaceId, favorite: false, now }, DEFAULT_DOCUMENT_TITLE), kind: 'document', content: emptyDocument(), text: '', ...(folderId ? { folderId } : {}) };
}

/** Titles of new, still unnamed text items; the editor derives a title from the first line while one of these is set. */
export const NEW_ITEM_TITLES = { text: 'Neuer Text', markdown: 'Neues Markdown', code: 'Neuer Code' } as const;

/** A new, empty text, Markdown or code item at a placement. Always the user's own, writable content. */
export function createBlankItem(kind: 'text' | 'markdown', spaceId: SpaceId, folderId: FolderId | null, now?: Date): TextItem;
export function createBlankItem(kind: 'code', spaceId: SpaceId, folderId: FolderId | null, now?: Date, language?: string): CodeItem;
export function createBlankItem(kind: 'text' | 'markdown' | 'code', spaceId: SpaceId, folderId: FolderId | null, now = new Date(), language = 'typescript'): TextItem | CodeItem {
  const head = { ...base({ spaceId, favorite: false, now }, NEW_ITEM_TITLES[kind]), ...(folderId ? { folderId } : {}) };
  return kind === 'code' ? { ...head, kind, language, body: '' } : { ...head, kind, body: '' };
}

export function textItem(text: string, ctx: ItemContext): Item {
  const cls = classifyText(text);
  const head = base(ctx, deriveTitle(cls));
  switch (cls.kind) {
    case 'link':
      return { ...head, kind: 'link', url: cls.url };
    case 'code':
      return { ...head, kind: 'code', language: cls.language, body: cls.body };
    default:
      return { ...head, kind: cls.kind, body: cls.body };
  }
}

async function fileItem(file: File, ctx: ItemContext): Promise<Item> {
  if (file.size > MAX_CAPTURE_BYTES) throw new CaptureTooLargeError(file.name || 'Datei');
  const asset = { blob: file as Blob, mimeType: file.type || 'application/octet-stream' };
  if (file.type.startsWith('image/')) {
    const size = await imageSize(file);
    if (size) {
      const title = isGenericImageName(file.name) ? `Bild · ${timeFormat.format(ctx.now)}` : file.name;
      return { ...base(ctx, title), kind: 'image', alt: title, width: size.width, height: size.height, asset };
    }
  }
  if (file.type.startsWith('audio/')) {
    const { durationSec, waveform } = await analyseAudio(file);
    const title = isGenericImageName(file.name) ? `Audio · ${timeFormat.format(ctx.now)}` : file.name;
    return { ...base(ctx, title), kind: 'audio', durationSec, waveform, fileName: file.name, asset };
  }
  const name = file.name || `Datei · ${timeFormat.format(ctx.now)}`;
  return { ...base(ctx, name), kind: 'file', fileName: name, sizeBytes: file.size, asset };
}

/** Builds items in source order. Each item gets its own id; timestamps are spaced by 1 ms to keep a stable newest-first order. */
export async function buildItems(sources: readonly CaptureSource[], spaceId: SpaceId, favorite = false, now = new Date()): Promise<Item[]> {
  return Promise.all(
    sources.map((source, i) => {
      const ctx = { spaceId, favorite, now: new Date(now.getTime() + (sources.length - i)) };
      return source.type === 'text' ? textItem(source.text, ctx) : fileItem(source.file, ctx);
    }),
  );
}
