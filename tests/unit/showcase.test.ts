import { describe, expect, it } from 'vitest';
import { applyBatch, buildLibrary, emptyData } from '../../src/next/app/operations';
import { buildShowcase, planShowcase, SHOWCASE_META_KEY, SHOWCASE_SPACE_ID, type ShowcaseMedia } from '../../src/next/data/showcase';
import { fixtureLibrary } from '../../src/next/fixtures';

const blob = (type: string, text = 'x') => ({ blob: new Blob([text], { type }), mimeType: type });
const media: ShowcaseMedia = {
  images: Array.from({ length: 4 }, () => ({ asset: blob('image/png'), width: 10, height: 10 })),
  audio: Array.from({ length: 2 }, () => ({ asset: blob('audio/wav'), durationSec: 2 })),
  files: { pdf: blob('application/pdf', '%PDF'), csv: blob('text/csv'), json: blob('application/json'), txt: blob('text/plain'), md: blob('text/markdown') },
};
const now = new Date('2026-10-28T12:00:00Z');
const none = { itemIds: new Set<string>(), folderIds: new Set<string>(), spaceIds: new Set<string>() };

describe('showcase space "Full"', () => {
  const data = buildShowcase(now, media);

  it('covers every kind with 60+ entries and folders four levels deep', () => {
    expect(data.items.length).toBeGreaterThanOrEqual(60);
    expect(new Set(data.items.map((i) => i.kind))).toEqual(new Set(['document', 'text', 'markdown', 'code', 'link', 'image', 'file', 'audio']));
    const depth = (id: string | null): number => (id ? 1 + depth(data.folders.find((f) => f.id === id)?.parentId ?? null) : 0);
    expect(Math.max(...data.folders.map((f) => depth(f.id)))).toBe(4);
    expect(data.items.some((i) => !i.folderId)).toBe(true);
    expect(data.items.every((i) => i.spaceId === SHOWCASE_SPACE_ID && i.origin === 'local' && i.tags.includes('showcase'))).toBe(true);
    expect(new Set(data.items.map((i) => i.id)).size).toBe(data.items.length);
  });

  it('adds only missing records and never overwrites or deletes', () => {
    const first = planShowcase(none, data, now);
    expect(first.added).toBe(1 + data.folders.length + data.items.length);
    expect(first.batch.items?.delete).toBeUndefined();
    expect(first.batch.meta).toHaveProperty(SHOWCASE_META_KEY);

    const stored = applyBatch(emptyData, first.batch);
    const existing = {
      itemIds: new Set(stored.local.map((i) => i.id)),
      folderIds: new Set(stored.folders.map((f) => f.id)),
      spaceIds: new Set(stored.spaceRecords.map((s) => s.id)),
    };
    const second = planShowcase(existing, buildShowcase(new Date('2026-11-01T00:00:00Z'), media), now);
    expect(second.added).toBe(0);
    expect(second.batch.items).toBeUndefined();
    expect(second.batch.spaces).toBeUndefined();

    // a deleted entry comes back only on the explicit path, and only that one
    existing.itemIds.delete('it-sc-09');
    expect(planShowcase(existing, data, now).batch.items?.put?.map((i) => i.id)).toEqual(['it-sc-09']);
  });

  it('appears as its own space next to the fixtures', () => {
    const stored = applyBatch(emptyData, planShowcase(none, data, now).batch);
    const library = buildLibrary(fixtureLibrary, stored, fixtureLibrary.collections);
    expect(library.getSpace(SHOWCASE_SPACE_ID)?.name).toBe('Full');
    expect(library.listItems({ type: 'space', spaceId: SHOWCASE_SPACE_ID }).length).toBe(data.items.length);
    expect(library.spaces.length).toBe(fixtureLibrary.spaces.length + 1);
  });
});
