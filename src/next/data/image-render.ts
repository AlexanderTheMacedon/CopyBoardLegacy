import {
  applyColor,
  colorPipeline,
  isColorIdentity,
  isIdentityEdits,
  normalizeImageEdits,
  orientedSize,
  straightenScale,
  type CropRect,
  type ImageEdits,
} from '../domain/image-edits';
import type { ImageItem } from '../domain/types';

// Renders an image item with its studio edits on the device (2D canvas, no library, nothing leaves the browser). The stored
// original is only ever decoded, never re-encoded in place: every edited picture (card preview, download, clipboard, export)
// is a fresh rendition from the original pixels plus the parameters.

export type ImageSource = ImageBitmap | HTMLCanvasElement;

/** Upper bound for one rendered canvas (≈ 16.7 MP: the smallest per-canvas limit among current browsers, iOS Safari). */
export const MAX_RENDER_PIXELS = 16_777_216;
const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export class ImageRenderError extends Error {
  constructor(readonly reason: 'decode' | 'memory' | 'encode') {
    super(reason);
  }
}

/** Synthetic examples have no pixels: their palette is painted as the same soft gradient the card shows. */
function paletteSource(item: ImageItem, maxEdge: number): HTMLCanvasElement {
  const k = Math.min(1, maxEdge / Math.max(item.width, item.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(item.width * k));
  canvas.height = Math.max(1, Math.round(item.height * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageRenderError('memory');
  const [a, b, c] = item.palette ?? ['#f3c09a', '#f08a4b', '#c2410c'];
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, a);
  g.addColorStop(0.55, b);
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(canvas.width * 0.28, canvas.height * 0.3, 0, canvas.width * 0.28, canvas.height * 0.3, Math.max(canvas.width, canvas.height) * 0.6);
  glow.addColorStop(0, 'rgb(255 255 255 / 0.45)');
  glow.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Decodes the original (EXIF orientation applied by the browser). `maxEdge` asks the decoder for a smaller bitmap where it
 * can (previews, the studio's working copy); the stored blob itself is never touched.
 */
export async function decodeImage(item: ImageItem, maxEdge = Infinity): Promise<ImageSource> {
  if (!item.asset) return paletteSource(item, Number.isFinite(maxEdge) ? maxEdge : 2400);
  const long = Math.max(item.width, item.height);
  const resize = Number.isFinite(maxEdge) && long > maxEdge && item.width > 0 && item.height > 0;
  try {
    return resize
      ? await createImageBitmap(item.asset.blob, item.width >= item.height ? { resizeWidth: Math.round(maxEdge), resizeQuality: 'high' } : { resizeHeight: Math.round(maxEdge), resizeQuality: 'high' })
      : await createImageBitmap(item.asset.blob);
  } catch {
    throw new ImageRenderError('decode');
  }
}

export interface RenderOptions {
  /** Longest edge of the result; the source resolution is never exceeded. */
  readonly maxEdge?: number;
  /** `false` shows the whole straightened frame (the crop tool draws its own frame on top). */
  readonly crop?: boolean;
  /** Painted under transparent pixels (JPEG has no alpha). */
  readonly background?: string;
}

/** Draws `source` with `edits` into `canvas` (resized to fit). Returns the scale of the result relative to the source. */
export function renderInto(canvas: HTMLCanvasElement | OffscreenCanvas, source: ImageSource, edits: ImageEdits, options: RenderOptions = {}): number {
  const sw = source.width;
  const sh = source.height;
  const frame = orientedSize(sw, sh, edits.turns);
  const crop = options.crop === false ? FULL : edits.crop;
  const outW = frame.width * crop.w;
  const outH = frame.height * crop.h;
  const k = Math.min(1, (options.maxEdge ?? Infinity) / Math.max(outW, outH), Math.sqrt(MAX_RENDER_PIXELS / (outW * outH)));
  const width = Math.max(1, Math.round(outW * k));
  const height = Math.max(1, Math.round(outH * k));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: !isColorIdentity(edits) }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new ImageRenderError('memory');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(width / outW, height / outH);
  ctx.translate(-crop.x * frame.width, -crop.y * frame.height);
  ctx.translate(frame.width / 2, frame.height / 2);
  if (edits.straighten) {
    ctx.rotate((edits.straighten * Math.PI) / 180);
    const s = straightenScale(frame.width, frame.height, edits.straighten);
    ctx.scale(s, s);
  }
  ctx.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
  ctx.rotate((edits.turns * Math.PI) / 2);
  ctx.drawImage(source, -sw / 2, -sh / 2);
  if (!isColorIdentity(edits)) {
    let pixels: ImageData;
    try {
      pixels = ctx.getImageData(0, 0, width, height);
    } catch {
      throw new ImageRenderError('memory');
    }
    applyColor(pixels.data, colorPipeline(edits));
    ctx.putImageData(pixels, 0, 0);
  }
  return k;
}

export type ExportType = 'image/png' | 'image/jpeg' | 'image/webp';

let webpSupport: boolean | undefined;
/** Whether this browser can encode WebP (Safari, for one, silently falls back to PNG). */
export function canEncodeWebp(): boolean {
  if (webpSupport === undefined) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpSupport = false;
    }
  }
  return webpSupport;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageRenderError('encode'))), type, quality));

export interface Rendition {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  /** `true` when the result had to be scaled below the original resolution (canvas size limit). */
  readonly reduced: boolean;
}

/** The edited image as a new file. Unedited images with a real original are returned as the original bytes. */
export async function renderImageFile(item: ImageItem, type: ExportType, options: { edits?: ImageEdits; maxEdge?: number; quality?: number } = {}): Promise<Rendition> {
  const edits = options.edits ?? normalizeImageEdits(item.edits);
  if (item.asset && isIdentityEdits(edits) && options.maxEdge === undefined && item.asset.mimeType === type)
    return { blob: item.asset.blob, width: item.width, height: item.height, reduced: false };
  const source = await decodeImage(item, options.maxEdge);
  try {
    const canvas = document.createElement('canvas');
    const k = renderInto(canvas, source, edits, { maxEdge: options.maxEdge, background: type === 'image/jpeg' ? '#ffffff' : undefined });
    const blob = await toBlob(canvas, type, type === 'image/png' ? undefined : (options.quality ?? 0.92));
    const result = { blob, width: canvas.width, height: canvas.height, reduced: options.maxEdge === undefined && k < 1 };
    canvas.width = canvas.height = 0; // release the backing store right away
    return result;
  } finally {
    if ('close' in source) source.close();
  }
}

/** Export type that keeps the original's format where the browser can write it. */
export function nativeExportType(item: ImageItem): ExportType {
  const mime = item.asset?.mimeType;
  if (mime === 'image/jpeg') return 'image/jpeg';
  if (mime === 'image/webp' && canEncodeWebp()) return 'image/webp';
  return 'image/png';
}

export const extensionOf = (type: ExportType): string => (type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png');

// --- card / inspector previews ------------------------------------------------------------------------------------------

const PREVIEW_EDGE = 1200;
const previewCache = new Map<string, Promise<Blob>>();
const blobKeys = new WeakMap<Blob, number>();
let blobSeq = 0;

const sourceKey = (item: ImageItem): string => {
  if (!item.asset) return `p:${item.palette?.join(',') ?? ''}:${item.width}x${item.height}`;
  let key = blobKeys.get(item.asset.blob);
  if (key === undefined) blobKeys.set(item.asset.blob, (key = ++blobSeq));
  return `b:${key}`;
};

/** A downsized edited rendition for previews, shared by every card/inspector showing the same image and edits. */
export function editedPreview(item: ImageItem, edits: ImageEdits): Promise<Blob> {
  const key = `${sourceKey(item)}|${JSON.stringify(edits)}`;
  let hit = previewCache.get(key);
  if (hit) {
    previewCache.delete(key); // refresh its position (least recently used goes first)
    previewCache.set(key, hit);
    return hit;
  }
  hit = renderImageFile(item, canEncodeWebp() ? 'image/webp' : 'image/png', { edits, maxEdge: PREVIEW_EDGE, quality: 0.9 }).then((r) => r.blob);
  hit.catch(() => previewCache.delete(key));
  previewCache.set(key, hit);
  while (previewCache.size > 48) previewCache.delete(previewCache.keys().next().value as string);
  return hit;
}
