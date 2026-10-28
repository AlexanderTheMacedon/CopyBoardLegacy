// Non-destructive image editing model (pure, no DOM). An image item keeps its original asset byte for byte; what the image
// studio changes is stored next to it as a small, versioned parameter set. Everything that enters storage, typed, dragged or
// loaded from disk, passes `normalizeImageEdits`, so out-of-range numbers, unknown filters or a broken crop never reach a
// render. The colour math works on 8-bit RGBA buffers: per-channel lookup tables around one 3×3 channel matrix.

export const IMAGE_EDITS_SCHEMA = 1 as const;

/** Clockwise quarter turns of the original. */
export type QuarterTurn = 0 | 1 | 2 | 3;

/** Crop in the straightened frame, normalised to 0..1 of its width and height. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type CropAspect = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16';

export interface ImageAdjust {
  readonly exposure: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly warmth: number;
  /** Hue rotation in degrees. */
  readonly hue: number;
}

export type FilterId = 'none' | 'natural' | 'cinematic' | 'warm' | 'cool' | 'mono' | 'fade' | 'film';

export interface ImageEdits {
  readonly schema: typeof IMAGE_EDITS_SCHEMA;
  readonly crop: CropRect;
  readonly aspect: CropAspect;
  readonly turns: QuarterTurn;
  readonly flipH: boolean;
  readonly flipV: boolean;
  /** Fine rotation in degrees (−45 … 45); the frame is scaled to cover, so no empty corners appear. */
  readonly straighten: number;
  readonly adjust: ImageAdjust;
  /** Black & white, independent of the filter. */
  readonly mono: boolean;
  readonly filter: FilterId;
  /** 0 … 100 % of the filter's look. */
  readonly filterStrength: number;
}

export const CROP_ASPECTS: readonly { readonly value: CropAspect; readonly label: string }[] = [
  { value: 'free', label: 'Frei' },
  { value: 'original', label: 'Original' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
];

export const ADJUSTMENTS: readonly { readonly key: keyof ImageAdjust; readonly label: string; readonly min: number; readonly max: number }[] = [
  { key: 'exposure', label: 'Belichtung', min: -100, max: 100 },
  { key: 'brightness', label: 'Helligkeit', min: -100, max: 100 },
  { key: 'contrast', label: 'Kontrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Sättigung', min: -100, max: 100 },
  { key: 'warmth', label: 'Wärme', min: -100, max: 100 },
  { key: 'hue', label: 'Farbton', min: -180, max: 180 },
];

type Rgb = readonly [number, number, number];

interface FilterLook {
  readonly adjust?: Partial<ImageAdjust>;
  readonly mono?: boolean;
  /** Lifted blacks / softened whites, 0 … 100. */
  readonly fade?: number;
  /** Split toning: additive tint weighted towards shadows resp. highlights (0..1 units). */
  readonly shadows?: Rgb;
  readonly highlights?: Rgb;
}

export const FILTERS: readonly { readonly id: FilterId; readonly label: string; readonly look: FilterLook }[] = [
  { id: 'none', label: 'Original', look: {} },
  { id: 'natural', label: 'Natural', look: { adjust: { contrast: 8, saturation: 10, warmth: 4, brightness: 3 } } },
  {
    id: 'cinematic',
    label: 'Cinematic',
    look: { adjust: { contrast: 22, saturation: -12, exposure: -4 }, fade: 6, shadows: [-0.04, 0.03, 0.08], highlights: [0.07, 0.02, -0.05] },
  },
  { id: 'warm', label: 'Warm', look: { adjust: { warmth: 38, saturation: 6, brightness: 2 }, highlights: [0.03, 0.01, -0.02] } },
  { id: 'cool', label: 'Cool', look: { adjust: { warmth: -34, saturation: -4, contrast: 4 }, shadows: [-0.01, 0.01, 0.04] } },
  { id: 'mono', label: 'Mono', look: { mono: true, adjust: { contrast: 14 } } },
  { id: 'fade', label: 'Fade', look: { adjust: { contrast: -18, saturation: -22, brightness: 6 }, fade: 34 } },
  { id: 'film', label: 'Film', look: { adjust: { contrast: 12, saturation: -10, warmth: 12 }, fade: 16, shadows: [0, 0.03, 0.02], highlights: [0.04, 0.02, -0.03] } },
];

const FILTER_IDS = new Set<string>(FILTERS.map((f) => f.id));
const ASPECT_IDS = new Set<string>(CROP_ASPECTS.map((a) => a.value));

/** Smallest crop edge, as a share of the frame. */
export const MIN_CROP = 0.04;
export const STRAIGHTEN_LIMIT = 45;

const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
const ZERO_ADJUST: ImageAdjust = { exposure: 0, brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0 };

export const identityEdits = (): ImageEdits => ({
  schema: IMAGE_EDITS_SCHEMA,
  crop: FULL_CROP,
  aspect: 'free',
  turns: 0,
  flipH: false,
  flipV: false,
  straighten: 0,
  adjust: ZERO_ADJUST,
  mono: false,
  filter: 'none',
  filterStrength: 100,
});

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
const num = (value: unknown, min: number, max: number, fallback: number, digits = 1): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const f = 10 ** digits;
  return Math.round(clamp(value, min, max) * f) / f;
};
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

/** A crop that lies inside the frame and is at least MIN_CROP wide and high. */
export function normalizeCrop(raw: unknown): CropRect {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CropRect>;
  const w = num(r.w, MIN_CROP, 1, 1, 4);
  const h = num(r.h, MIN_CROP, 1, 1, 4);
  return { x: num(r.x, 0, 1 - w, 0, 4), y: num(r.y, 0, 1 - h, 0, 4), w, h };
}

/** Validates stored edits. Anything unreadable falls back to "unedited"; a newer, unknown schema is not interpreted. */
export function normalizeImageEdits(raw: unknown): ImageEdits {
  if (!raw || typeof raw !== 'object') return identityEdits();
  const r = raw as Partial<Record<keyof ImageEdits, unknown>>;
  if (r.schema !== IMAGE_EDITS_SCHEMA) return identityEdits();
  const a = (r.adjust && typeof r.adjust === 'object' ? r.adjust : {}) as Partial<Record<keyof ImageAdjust, unknown>>;
  const adjust = {} as Record<keyof ImageAdjust, number>;
  for (const spec of ADJUSTMENTS) adjust[spec.key] = num(a[spec.key], spec.min, spec.max, 0, 0);
  return {
    schema: IMAGE_EDITS_SCHEMA,
    crop: normalizeCrop(r.crop),
    aspect: typeof r.aspect === 'string' && ASPECT_IDS.has(r.aspect) ? (r.aspect as CropAspect) : 'free',
    turns: r.turns === 1 || r.turns === 2 || r.turns === 3 ? r.turns : 0,
    flipH: r.flipH === true,
    flipV: r.flipV === true,
    straighten: num(r.straighten, -STRAIGHTEN_LIMIT, STRAIGHTEN_LIMIT, 0, 1),
    adjust,
    mono: r.mono === true,
    filter: typeof r.filter === 'string' && FILTER_IDS.has(r.filter) ? (r.filter as FilterId) : 'none',
    filterStrength: num(r.filterStrength, 0, 100, 100, 0),
  };
}

export const sameEdits = (a: ImageEdits, b: ImageEdits): boolean => JSON.stringify(a) === JSON.stringify(b);

/** True when the edits change nothing visible (the original is shown and exported as is). */
export const isIdentityEdits = (e: ImageEdits): boolean => isGeometryIdentity(e) && isColorIdentity(e);

export const isGeometryIdentity = (e: ImageEdits): boolean =>
  e.turns === 0 && !e.flipH && !e.flipV && e.straighten === 0 && e.crop.x === 0 && e.crop.y === 0 && e.crop.w === 1 && e.crop.h === 1;

export const isColorIdentity = (e: ImageEdits): boolean =>
  !e.mono && (e.filter === 'none' || e.filterStrength === 0) && ADJUSTMENTS.every((s) => e.adjust[s.key] === 0);

/** Edits as stored on the item: `undefined` when nothing is changed, so untouched images stay exactly as captured. */
export const storedEdits = (e: ImageEdits): ImageEdits | undefined => (isIdentityEdits(e) ? undefined : e);

// --- geometry ---------------------------------------------------------------------------------------------------------

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Size of the original after the quarter turns (= size of the straightened frame). */
export const orientedSize = (width: number, height: number, turns: QuarterTurn): Size => (turns % 2 ? { width: height, height: width } : { width, height });

/** Pixel size of the edited result. */
export function editedSize(width: number, height: number, e: ImageEdits): Size {
  const o = orientedSize(width, height, e.turns);
  return { width: Math.max(1, Math.round(o.width * e.crop.w)), height: Math.max(1, Math.round(o.height * e.crop.h)) };
}

/** Scale that lets a W×H image rotated by `deg` still cover its own W×H frame. */
export function straightenScale(width: number, height: number, deg: number): number {
  if (!deg) return 1;
  const t = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return Math.max((width * c + height * s) / width, (width * s + height * c) / height);
}

/** Pixel width/height ratio of an aspect choice, `null` for a free crop. */
export function aspectRatio(aspect: CropAspect, frame: Size): number | null {
  switch (aspect) {
    case 'free':
      return null;
    case 'original':
      return frame.width / frame.height;
    default: {
      const [w = 1, h = 1] = aspect.split(':').map(Number);
      return w / h;
    }
  }
}

/** Largest crop with the given pixel ratio around the current crop's centre that still fits the frame. */
export function fitCropToAspect(crop: CropRect, ratio: number | null, frame: Size): CropRect {
  if (ratio === null) return crop;
  const rn = (ratio * frame.height) / frame.width; // ratio in normalised units
  let w = Math.min(1, rn);
  let h = w / rn;
  if (h > 1) {
    h = 1;
    w = rn;
  }
  // keep the user's framing: as large as the current crop allows, but never smaller than a usable minimum
  const scale = Math.max(Math.min(crop.w / w, crop.h / h, 1), Math.max(MIN_CROP / w, MIN_CROP / h));
  w *= scale;
  h *= scale;
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  return { x: round4(clamp(cx - w / 2, 0, 1 - w)), y: round4(clamp(cy - h / 2, 0, 1 - h)), w: round4(w), h: round4(h) };
}

export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Crop after dragging `handle` by (dx, dy) — normalised deltas measured from the gesture's start, applied to the crop at the
 * start, so a long drag never accumulates rounding. With a ratio the opposite corner (or edge centre) stays anchored.
 */
export function dragCrop(start: CropRect, handle: CropHandle, dx: number, dy: number, ratio: number | null, frame: Size): CropRect {
  const out = (x: number, y: number, w: number, h: number): CropRect => ({ x: round4(x), y: round4(y), w: round4(w), h: round4(h) });
  if (handle === 'move') return out(clamp(start.x + dx, 0, 1 - start.w), clamp(start.y + dy, 0, 1 - start.h), start.w, start.h);
  const left = start.x;
  const right = start.x + start.w;
  const top = start.y;
  const bottom = start.y + start.h;
  const east = handle.includes('e');
  const west = handle.includes('w');
  const south = handle.includes('s');
  const north = handle.includes('n');
  if (ratio === null) {
    const l = west ? clamp(left + dx, 0, right - MIN_CROP) : left;
    const r = east ? clamp(right + dx, left + MIN_CROP, 1) : right;
    const t = north ? clamp(top + dy, 0, bottom - MIN_CROP) : top;
    const b = south ? clamp(bottom + dy, top + MIN_CROP, 1) : bottom;
    return out(l, t, r - l, b - t);
  }
  const rn = (ratio * frame.height) / frame.width;
  const minW = Math.max(MIN_CROP, MIN_CROP * rn);
  if ((east || west) && (north || south)) {
    const ax = east ? left : right;
    const ay = south ? top : bottom;
    const rawW = start.w + (east ? dx : -dx);
    const rawH = start.h + (south ? dy : -dy);
    const maxW = Math.min(east ? 1 - ax : ax, (south ? 1 - ay : ay) * rn);
    const w = clamp(Math.max(rawW, rawH * rn), Math.min(minW, maxW), maxW);
    const h = w / rn;
    return out(east ? ax : ax - w, south ? ay : ay - h, w, h);
  }
  if (east || west) {
    const ax = east ? left : right;
    const cy = start.y + start.h / 2;
    const maxW = Math.min(east ? 1 - ax : ax, 2 * Math.min(cy, 1 - cy) * rn);
    const w = clamp(start.w + (east ? dx : -dx), Math.min(minW, maxW), maxW);
    const h = w / rn;
    return out(east ? ax : ax - w, cy - h / 2, w, h);
  }
  const ay = south ? top : bottom;
  const cx = start.x + start.w / 2;
  const maxH = Math.min(south ? 1 - ay : ay, (2 * Math.min(cx, 1 - cx)) / rn);
  const h = clamp(start.h + (south ? dy : -dy), Math.min(minW / rn, maxH), maxH);
  const w = h * rn;
  return out(cx - w / 2, south ? ay : ay - h, w, h);
}

/** Turns the whole result a quarter clockwise (`1`) or counter-clockwise (`-1`); crop and mirroring turn with it. */
export function rotateEdits(e: ImageEdits, dir: 1 | -1): ImageEdits {
  const { x, y, w, h } = e.crop;
  const crop = dir === 1 ? { x: round4(1 - y - h), y: x, w: h, h: w } : { x: y, y: round4(1 - x - w), w: h, h: w };
  const swapFlip = e.flipH !== e.flipV;
  const aspect: CropAspect = e.aspect === '16:9' ? '9:16' : e.aspect === '9:16' ? '16:9' : e.aspect === '4:3' || e.aspect === '3:2' ? 'free' : e.aspect;
  return {
    ...e,
    crop,
    aspect,
    turns: (((e.turns + dir) % 4) + 4) % 4 as QuarterTurn,
    flipH: swapFlip ? !e.flipH : e.flipH,
    flipV: swapFlip ? !e.flipV : e.flipV,
  };
}

/** Mirrors the whole result; the crop and the straighten angle are mirrored with it, so the framing stays the same. */
export function flipEdits(e: ImageEdits, axis: 'h' | 'v'): ImageEdits {
  const { x, y, w, h } = e.crop;
  return axis === 'h'
    ? { ...e, flipH: !e.flipH, straighten: -e.straighten || 0, crop: { x: round4(1 - x - w), y, w, h } }
    : { ...e, flipV: !e.flipV, straighten: -e.straighten || 0, crop: { x, y: round4(1 - y - h), w, h } };
}

// --- colour -----------------------------------------------------------------------------------------------------------

export interface ColorPipeline {
  /** Per-channel tone curves (exposure, brightness, contrast, warmth). */
  readonly pre: readonly [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
  /** Row-major 3×3 channel matrix (hue, saturation, mono), `null` when it is the identity. */
  readonly matrix: readonly number[] | null;
  /** Per-channel finishing curves (fade, split toning), `null` when they are the identity. */
  readonly post: readonly [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] | null;
}

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

const multiply = (a: readonly number[], b: readonly number[]): number[] => {
  const m: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!);
  return m;
};

const saturationMatrix = (s: number): number[] => [
  LR + (1 - LR) * s, LG - LG * s, LB - LB * s,
  LR - LR * s, LG + (1 - LG) * s, LB - LB * s,
  LR - LR * s, LG - LG * s, LB + (1 - LB) * s,
];

const hueMatrix = (deg: number): number[] => {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
};

/** User adjustments plus the weighted filter look: the values the pipeline actually renders. */
export function effectiveLook(e: ImageEdits): { adjust: ImageAdjust; mono: number; fade: number; shadows: Rgb; highlights: Rgb } {
  const look = FILTERS.find((f) => f.id === e.filter)?.look ?? {};
  const t = e.filter === 'none' ? 0 : e.filterStrength / 100;
  const adjust = {} as Record<keyof ImageAdjust, number>;
  for (const spec of ADJUSTMENTS) adjust[spec.key] = e.adjust[spec.key] + (look.adjust?.[spec.key] ?? 0) * t;
  const tint = (rgb: Rgb | undefined): Rgb => (rgb ? [rgb[0] * t, rgb[1] * t, rgb[2] * t] : [0, 0, 0]);
  return { adjust, mono: e.mono ? 1 : look.mono ? t : 0, fade: (look.fade ?? 0) * t, shadows: tint(look.shadows), highlights: tint(look.highlights) };
}

export function colorPipeline(e: ImageEdits): ColorPipeline {
  const { adjust, mono, fade, shadows, highlights } = effectiveLook(e);
  const gain = 2 ** (adjust.exposure * 0.015); // ±1.5 stops
  const gamma = 2 ** (-adjust.brightness / 125);
  const k = adjust.contrast >= 0 ? 1 + adjust.contrast * 0.008 : 1 + adjust.contrast * 0.007;
  const warm = adjust.warmth * 0.0007;
  const offsets = [warm, warm * 0.12, -warm];
  const pre = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)] as const;
  for (let v = 0; v < 256; v++) {
    let x = (v / 255) * gain;
    x = clamp(x, 0, 1) ** gamma;
    x = (x - 0.5) * k + 0.5;
    for (let c = 0; c < 3; c++) pre[c]![v] = Math.round(clamp(x + offsets[c]!, 0, 1) * 255);
  }
  const sat = clamp(1 + adjust.saturation / 100, 0, 2) * (1 - mono);
  const matrix = sat === 1 && adjust.hue === 0 ? null : adjust.hue === 0 ? saturationMatrix(sat) : multiply(saturationMatrix(sat), hueMatrix(adjust.hue));
  const toned = fade > 0 || shadows.some(Boolean) || highlights.some(Boolean);
  let post: ColorPipeline['post'] = null;
  if (toned) {
    const f = fade / 100;
    const curves = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)] as const;
    for (let v = 0; v < 256; v++) {
      const x = v / 255;
      const base = x * (1 - f * 0.22) + f * 0.16;
      for (let c = 0; c < 3; c++) curves[c]![v] = Math.round(clamp(base + shadows[c]! * (1 - x) ** 2 + highlights[c]! * x * x, 0, 1) * 255);
    }
    post = curves;
  }
  return { pre, matrix, post };
}

/** Applies the pipeline in place to RGBA pixels (alpha untouched). */
export function applyColor(data: Uint8ClampedArray, p: ColorPipeline): void {
  const [lr, lg, lb] = p.pre;
  const m = p.matrix;
  const post = p.post;
  for (let i = 0; i < data.length; i += 4) {
    let r = lr[data[i]!]!;
    let g = lg[data[i + 1]!]!;
    let b = lb[data[i + 2]!]!;
    if (m) {
      const nr = m[0]! * r + m[1]! * g + m[2]! * b;
      const ng = m[3]! * r + m[4]! * g + m[5]! * b;
      const nb = m[6]! * r + m[7]! * g + m[8]! * b;
      r = nr < 0 ? 0 : nr > 255 ? 255 : nr | 0;
      g = ng < 0 ? 0 : ng > 255 ? 255 : ng | 0;
      b = nb < 0 ? 0 : nb > 255 ? 255 : nb | 0;
    }
    if (post) {
      r = post[0][r]!;
      g = post[1][g]!;
      b = post[2][b]!;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// --- history ----------------------------------------------------------------------------------------------------------

/** Changes of the same control within this window form one undo step (a slider drag, arrow-key nudges). */
export const HISTORY_GROUP_MS = 800;
const HISTORY_LIMIT = 100;

export interface EditHistory {
  readonly past: readonly ImageEdits[];
  readonly present: ImageEdits;
  readonly future: readonly ImageEdits[];
  readonly group?: string;
  readonly groupAt: number;
}

export const startHistory = (present: ImageEdits): EditHistory => ({ past: [], present, future: [], groupAt: 0 });

/** Records a change. With the same `group` key as the previous change, and soon enough, it merges into that step. */
export function commitHistory(h: EditHistory, next: ImageEdits, group: string | undefined, now: number): EditHistory {
  if (sameEdits(h.present, next)) return group ? { ...h, group, groupAt: now } : h;
  if (group && h.group === group && now - h.groupAt < HISTORY_GROUP_MS) return { ...h, present: next, future: [], groupAt: now };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], group, groupAt: now };
}

export const undoHistory = (h: EditHistory): EditHistory =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future], groupAt: 0 } : h;

export const redoHistory = (h: EditHistory): EditHistory =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1), groupAt: 0 } : h;
