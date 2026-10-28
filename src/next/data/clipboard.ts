import { isTextual, type Item } from '../domain/types';
import type { RawClipboard } from './classify';
import { renderImageFile } from './image-render';
import { isIdentityEdits, normalizeImageEdits } from '../domain/image-edits';

// The only module that touches clipboard and drag data. Reads happen only inside a user's paste/drop gesture or an explicit
// "Einfügen" command; writes only on an explicit "Kopieren". No permission is bypassed: a refusal surfaces as an error.

/** Reads a paste or drop payload synchronously (DataTransfer is only readable during the event). */
export function readTransfer(data: DataTransfer): RawClipboard {
  const files: File[] = [...data.files];
  // Some browsers expose pasted images only as items, not in `files`.
  if (!files.length) {
    for (const entry of [...data.items]) {
      if (entry.kind !== 'file') continue;
      const file = entry.getAsFile();
      if (file) files.push(file);
    }
  }
  return { files, text: data.getData('text/plain'), html: data.getData('text/html') };
}

/** True while dragging something that carries files (used for the drop affordance; content is not read here). */
export const transferHasFiles = (data: DataTransfer | null): boolean => !!data && [...data.types].includes('Files');

const extensionFor = (type: string): string => type.split('/')[1]?.split(/[+;]/)[0] ?? 'bin';

export class ClipboardAccessError extends Error {
  constructor(readonly reason: 'unsupported' | 'denied') {
    super(reason);
  }
}

/** Explicit "Einfügen" from a menu: the async Clipboard API, subject to the browser's own permission prompt. */
export async function readSystemClipboard(): Promise<RawClipboard> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard) throw new ClipboardAccessError('unsupported');
  try {
    if (typeof clipboard.read === 'function') {
      const files: File[] = [];
      let text = '';
      let html = '';
      for (const entry of await clipboard.read()) {
        for (const type of entry.types) {
          const blob = await entry.getType(type);
          if (type === 'text/plain') text ||= await blob.text();
          else if (type === 'text/html') html ||= await blob.text();
          else if (/^(image|audio|video|application)\//.test(type)) files.push(new File([blob], `clipboard.${extensionFor(type)}`, { type }));
        }
      }
      return { files, text, html };
    }
    if (typeof clipboard.readText === 'function') return { files: [], text: await clipboard.readText(), html: '' };
  } catch (error) {
    throw new ClipboardAccessError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unsupported');
  }
  throw new ClipboardAccessError('unsupported');
}

/** Plain text that "Kopieren" puts on the clipboard, or undefined if the item has no copyable text. */
export const copyText = (item: Item): string | undefined => (isTextual(item) ? item.body : item.kind === 'document' ? item.text : item.kind === 'link' ? item.url : undefined);

/** "Alles kopieren" of an editor: plain text to the clipboard. Rejects if the browser refuses. */
export async function writeTextToClipboard(text: string): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard) throw new ClipboardAccessError('unsupported');
  try {
    await clipboard.writeText(text);
  } catch (error) {
    throw new ClipboardAccessError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unsupported');
  }
}

async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export const canCopy = (item: Item): boolean => copyText(item) !== undefined || (item.kind === 'image' && !!item.asset);

/** An image (as a pending PNG) to the clipboard. The promise goes straight into ClipboardItem so Safari keeps the gesture. */
export async function writeImageToClipboard(png: Promise<Blob>): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard || typeof ClipboardItem === 'undefined' || typeof clipboard.write !== 'function') throw new ClipboardAccessError('unsupported');
  try {
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch (error) {
    throw new ClipboardAccessError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unsupported');
  }
}

/** Explicit "Kopieren": text via writeText, captured images as PNG (with their studio edits). Rejects if the browser refuses. */
export async function writeItemToClipboard(item: Item): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard) throw new ClipboardAccessError('unsupported');
  const text = copyText(item);
  try {
    if (text !== undefined) return await clipboard.writeText(text);
    if (item.kind === 'image' && item.asset && typeof ClipboardItem !== 'undefined') {
      const edited = !!item.edits && !isIdentityEdits(normalizeImageEdits(item.edits));
      const png = edited ? renderImageFile(item, 'image/png').then((r) => r.blob) : asPng(item.asset.blob);
      return await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    }
  } catch (error) {
    throw new ClipboardAccessError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unsupported');
  }
  throw new ClipboardAccessError('unsupported');
}
