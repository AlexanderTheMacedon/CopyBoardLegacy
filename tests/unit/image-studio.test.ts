import { describe, expect, it } from 'vitest';
import {
  applyColor,
  colorPipeline,
  commitHistory,
  dragCrop,
  editedSize,
  fitCropToAspect,
  flipEdits,
  HISTORY_GROUP_MS,
  identityEdits,
  isIdentityEdits,
  MIN_CROP,
  normalizeImageEdits,
  redoHistory,
  rotateEdits,
  startHistory,
  storedEdits,
  straightenScale,
  undoHistory,
  type ImageEdits,
} from '../../src/next/domain/image-edits';
import { itemActions, isEditedImage } from '../../src/next/features/items/item-actions';
import { isEditable, isStudioImage, type ImageItem } from '../../src/next/domain/types';

// Run B: the non-destructive image studio model — validation, geometry, colour pipeline, grouped undo and the item contract.

const frame = { width: 1600, height: 1000 };
const edit = (patch: Partial<ImageEdits>): ImageEdits => ({ ...identityEdits(), ...patch });

describe('image edits validation', () => {
  it('falls back to "unedited" for missing, foreign or future data', () => {
    expect(normalizeImageEdits(undefined)).toEqual(identityEdits());
    expect(normalizeImageEdits('x')).toEqual(identityEdits());
    expect(normalizeImageEdits({ schema: 2, mono: true })).toEqual(identityEdits());
    expect(isIdentityEdits(normalizeImageEdits(null))).toBe(true);
  });

  it('clamps numbers, rejects unknown filters/aspects and keeps the crop inside the frame', () => {
    const e = normalizeImageEdits({
      schema: 1,
      crop: { x: 0.9, y: -1, w: 0.5, h: 0.001 },
      aspect: '7:5',
      turns: 5,
      flipH: 'yes',
      straighten: 99,
      adjust: { exposure: 400, contrast: Number.NaN, hue: -999, extra: 3 },
      filter: 'sepia<script>',
      filterStrength: 150,
    });
    expect(e.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: MIN_CROP });
    expect(e).toMatchObject({ aspect: 'free', turns: 0, flipH: false, straighten: 45, filter: 'none', filterStrength: 100 });
    expect(e.adjust).toEqual({ exposure: 100, brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: -180 });
    expect(e.adjust).not.toHaveProperty('extra');
  });

  it('round-trips valid edits unchanged and stores nothing for an unedited image', () => {
    const e = edit({ turns: 1, flipV: true, straighten: -3.5, mono: true, filter: 'film', filterStrength: 60, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } });
    expect(normalizeImageEdits(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(storedEdits(identityEdits())).toBeUndefined();
    expect(storedEdits(e)).toBe(e);
    // strength 0 is no visible change
    expect(isIdentityEdits(edit({ filter: 'warm', filterStrength: 0 }))).toBe(true);
  });
});

describe('image geometry', () => {
  it('computes the edited pixel size from turns and crop', () => {
    expect(editedSize(1600, 1000, identityEdits())).toEqual({ width: 1600, height: 1000 });
    expect(editedSize(1600, 1000, edit({ turns: 1 }))).toEqual({ width: 1000, height: 1600 });
    expect(editedSize(1600, 1000, edit({ crop: { x: 0, y: 0, w: 0.5, h: 0.25 } }))).toEqual({ width: 800, height: 250 });
  });

  it('straightening scales just enough to cover the frame', () => {
    expect(straightenScale(1600, 1000, 0)).toBe(1);
    const s = straightenScale(1600, 1000, 10);
    expect(s).toBeGreaterThan(1);
    // the rotated, scaled image covers the frame's corners
    const t = (10 * Math.PI) / 180;
    expect((1600 * Math.cos(t) + 1000 * Math.sin(t)) / 1600).toBeLessThanOrEqual(s + 1e-9);
  });

  it('fits a crop to an aspect ratio in real pixels, inside the frame', () => {
    const c = fitCropToAspect({ x: 0, y: 0, w: 1, h: 1 }, 1, frame);
    expect((c.w * frame.width) / (c.h * frame.height)).toBeCloseTo(1, 3);
    expect(c.h).toBe(1);
    expect(c.x).toBeCloseTo((1 - c.w) / 2, 3);
    const tall = fitCropToAspect({ x: 0, y: 0, w: 1, h: 1 }, 9 / 16, frame);
    expect((tall.w * frame.width) / (tall.h * frame.height)).toBeCloseTo(9 / 16, 2);
    expect(fitCropToAspect({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, null, frame)).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 });
  });

  it('drags crop edges freely, keeps a minimum size and stays inside the frame', () => {
    const start = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    expect(dragCrop(start, 'e', 0.1, 0, null, frame)).toEqual({ x: 0.2, y: 0.2, w: 0.7, h: 0.6 });
    expect(dragCrop(start, 'e', 5, 0, null, frame).w).toBeCloseTo(0.8, 4);
    expect(dragCrop(start, 'nw', 1, 1, null, frame)).toMatchObject({ w: MIN_CROP, h: MIN_CROP });
    expect(dragCrop(start, 'move', 1, -1, null, frame)).toEqual({ x: 0.4, y: 0, w: 0.6, h: 0.6 });
  });

  it('keeps the ratio and the opposite corner anchored while dragging a corner', () => {
    const start = fitCropToAspect({ x: 0, y: 0, w: 1, h: 1 }, 1, frame);
    const c = dragCrop(start, 'se', -0.2, 0, 1, frame);
    expect((c.w * frame.width) / (c.h * frame.height)).toBeCloseTo(1, 2);
    expect(c.x).toBeCloseTo(start.x, 4);
    expect(c.y).toBeCloseTo(start.y, 4);
    expect(c.x + c.w).toBeLessThanOrEqual(1);
    expect(c.y + c.h).toBeLessThanOrEqual(1);
  });

  it('rotating four times or flipping twice is the identity; flips mirror crop and angle', () => {
    const e = edit({ crop: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, straighten: 5, flipH: true });
    expect(rotateEdits(rotateEdits(rotateEdits(rotateEdits(e, 1), 1), 1), 1)).toEqual(e);
    expect(rotateEdits(rotateEdits(e, 1), -1)).toEqual(e);
    const f = flipEdits(e, 'h');
    expect(f).toMatchObject({ flipH: false, straighten: -5, crop: { x: 0.6, y: 0.2, w: 0.3, h: 0.4 } });
    expect(flipEdits(f, 'h')).toEqual(e);
    // a quarter turn swaps the crop's sides and swaps a single mirror axis
    expect(rotateEdits(e, 1)).toMatchObject({ turns: 1, flipH: false, flipV: true, crop: { x: 0.4, y: 0.1, w: 0.4, h: 0.3 } });
  });
});

describe('image colour pipeline', () => {
  const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 200]);
  const run = (e: ImageEdits, data: Uint8ClampedArray) => {
    applyColor(data, colorPipeline(e));
    return [...data];
  };

  it('is exact for neutral settings and never touches alpha', () => {
    const p = colorPipeline(identityEdits());
    expect(p.matrix).toBeNull();
    expect(p.post).toBeNull();
    expect(run(identityEdits(), px(12, 128, 250))).toEqual([12, 128, 250, 200]);
  });

  it('moves pixels in the expected direction for each control', () => {
    const base = px(100, 120, 140);
    const at = (patch: Partial<ImageEdits['adjust']>) => run(edit({ adjust: { ...identityEdits().adjust, ...patch } }), base.slice());
    expect(at({ exposure: 50 })[0]).toBeGreaterThan(100);
    expect(at({ brightness: -50 })[1]).toBeLessThan(120);
    const warm = at({ warmth: 60 });
    expect(warm[0]).toBeGreaterThan(100);
    expect(warm[2]).toBeLessThan(140);
    const desat = at({ saturation: -100 });
    expect(Math.max(...desat.slice(0, 3)) - Math.min(...desat.slice(0, 3))).toBeLessThanOrEqual(1);
    const contrast = run(edit({ adjust: { ...identityEdits().adjust, contrast: 80 } }), px(60, 128, 200));
    expect(contrast[0]).toBeLessThan(60);
    expect(contrast[2]).toBeGreaterThan(200);
  });

  it('black & white and the Mono filter yield grey pixels; Fade lifts the blacks', () => {
    const grey = run(edit({ mono: true }), px(200, 40, 90));
    expect(new Set(grey.slice(0, 3)).size).toBe(1);
    const mono = run(edit({ filter: 'mono' }), px(200, 40, 90));
    expect(Math.max(...mono.slice(0, 3)) - Math.min(...mono.slice(0, 3))).toBeLessThanOrEqual(1);
    expect(run(edit({ filter: 'fade' }), px(0, 0, 0))[0]).toBeGreaterThan(20);
    // every curated look renders without throwing and changes something
    for (const filter of ['natural', 'cinematic', 'warm', 'cool', 'film'] as const) expect(run(edit({ filter }), px(90, 120, 160))).not.toEqual([90, 120, 160, 200]);
  });
});

describe('image studio history', () => {
  it('groups one slider gesture into a single undo step and separates later gestures', () => {
    let h = startHistory(identityEdits());
    const adj = (v: number) => edit({ adjust: { ...identityEdits().adjust, contrast: v } });
    h = commitHistory(h, adj(10), 'adjust:contrast', 1000);
    h = commitHistory(h, adj(20), 'adjust:contrast', 1100);
    h = commitHistory(h, adj(30), 'adjust:contrast', 1200);
    expect(h.past).toHaveLength(1);
    h = commitHistory(h, adj(40), 'adjust:contrast', 1200 + HISTORY_GROUP_MS + 1);
    expect(h.past).toHaveLength(2);
    h = commitHistory(h, edit({ ...adj(40), mono: true }), undefined, 5000);
    expect(h.past).toHaveLength(3);
    h = undoHistory(undoHistory(h));
    expect(h.present.adjust.contrast).toBe(30);
    h = redoHistory(h);
    expect(h.present.adjust.contrast).toBe(40);
    // a new change after undo drops the redo branch
    h = commitHistory(undoHistory(h), adj(5), undefined, 9000);
    expect(h.future).toHaveLength(0);
    expect(undoHistory(startHistory(identityEdits())).past).toHaveLength(0);
  });

  it('ignores no-op commits', () => {
    const h = startHistory(identityEdits());
    expect(commitHistory(h, identityEdits(), undefined, 1)).toBe(h);
  });
});

describe('image item contract', () => {
  const image: ImageItem = {
    id: 'it-img-1',
    kind: 'image',
    spaceId: 'sp-design',
    title: 'Foto.png',
    alt: 'Foto',
    width: 1600,
    height: 1000,
    createdAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    tags: [],
    favorite: false,
    origin: 'local',
    asset: { blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), mimeType: 'image/png' },
  };

  it('opens images in the studio (not the text Canvas) and offers the original separately once edited', () => {
    expect(isStudioImage(image)).toBe(true);
    expect(isEditable(image)).toBe(false);
    const ids = (i: ImageItem) => itemActions(i, { type: 'space', spaceId: 'sp-design' }).map((a) => a.id);
    expect(ids(image)).toEqual(expect.arrayContaining(['copy', 'download', 'open-composer']));
    expect(ids(image)).not.toContain('download-original');
    const edited = { ...image, edits: edit({ mono: true }) };
    expect(isEditedImage(edited)).toBe(true);
    expect(ids(edited)).toContain('download-original');
    // the edits live next to the asset; the original blob is the very same object
    expect(edited.asset).toBe(image.asset);
    expect(isEditedImage({ ...image, edits: identityEdits() })).toBe(false);
  });
});
