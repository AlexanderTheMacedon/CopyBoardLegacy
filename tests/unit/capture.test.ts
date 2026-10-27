import { describe, expect, it } from 'vitest';
import { restorePreferences } from '../../src/next/app/preferences';
import { buildItems, textItem } from '../../src/next/data/capture';
import { classifyText, deriveTitle, detectLanguage, isWebUrl, pickSources, referencesImageOnly } from '../../src/next/data/classify';

const file = (name: string, type: string, body = 'x') => new File([body], name, { type });
const raw = (over: Partial<{ files: File[]; text: string; html: string }>) => ({ files: [], text: '', html: '', ...over });

describe('Universal Paste: what a clipboard payload is', () => {
  it('takes real files when they are the payload (screenshot, copied image, Finder file)', () => {
    expect(pickSources(raw({ files: [file('image.png', 'image/png')] }))).toMatchObject([{ type: 'file' }]);
    // Browsers add the image URL next to "copy image": still the image.
    expect(pickSources(raw({ files: [file('image.png', 'image/png')], text: 'https://example.org/a.png' }))).toMatchObject([{ type: 'file' }]);
    // Finder puts the file name as text next to the file.
    expect(pickSources(raw({ files: [file('Bericht.pdf', 'application/pdf')], text: 'Bericht.pdf' }))).toMatchObject([{ type: 'file' }]);
  });

  it('prefers substantial text over an image rendering (office apps)', () => {
    const sources = pickSources(raw({ files: [file('image.png', 'image/png')], text: 'Umsatz Q3\t12.400\nUmsatz Q4\t13.100' }));
    expect(sources).toEqual([{ type: 'text', text: 'Umsatz Q3\t12.400\nUmsatz Q4\t13.100' }]);
  });

  it('invents nothing: empty payloads and image references without pixels yield no source', () => {
    expect(pickSources(raw({ text: '   \n ' }))).toEqual([]);
    const reference = raw({ html: '<img src="https://example.org/x.png">' });
    expect(pickSources(reference)).toEqual([]);
    expect(referencesImageOnly(reference)).toBe(true);
    expect(pickSources(raw({ files: [file('leer.txt', 'text/plain', '')] }))).toEqual([]);
  });
});

describe('text classification', () => {
  it('recognises single web URLs only', () => {
    expect(classifyText(' https://developer.mozilla.org/de/docs/Web \n')).toEqual({ kind: 'link', url: 'https://developer.mozilla.org/de/docs/Web' });
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(classifyText('Siehe https://example.org und mehr').kind).toBe('text');
  });

  it('recognises code and its language', () => {
    expect(classifyText('const sum = (a: number, b: number): number => {\n  return a + b;\n};')).toMatchObject({ kind: 'code', language: 'typescript' });
    expect(classifyText('{"name": "copyboard", "private": true}')).toMatchObject({ kind: 'code', language: 'json' });
    expect(classifyText('def greet(name):\n    return f"Hallo {name}"')).toMatchObject({ kind: 'code', language: 'python' });
    expect(classifyText('```sql\nselect * from items\n```')).toEqual({ kind: 'code', language: 'sql', body: 'select * from items' });
    expect(detectLanguage('Einkaufsliste\nMilch\nBrot')).toBeNull();
  });

  it('recognises Markdown and keeps plain text plain', () => {
    expect(classifyText('# Plan\n\n- eins\n- zwei').kind).toBe('markdown');
    expect(classifyText('Rückruf bei Studio Nord wegen Freigabe').kind).toBe('text');
    expect(classifyText('Zeile eins\nZeile zwei').kind).toBe('text');
  });

  it('derives readable titles', () => {
    expect(deriveTitle(classifyText('https://www.example.org/docs/start/'))).toBe('example.org/docs/start');
    expect(deriveTitle(classifyText('# Plan für Q4\n\n- eins'))).toBe('Plan für Q4');
    expect(deriveTitle(classifyText('x'.repeat(100))).length).toBeLessThanOrEqual(64);
  });
});

describe('item building', () => {
  const ctx = { spaceId: 'sp-dev', favorite: false, now: new Date('2026-10-27T20:00:00Z') };

  it('builds local items with the detected kind', () => {
    expect(textItem('https://example.org', ctx)).toMatchObject({ kind: 'link', url: 'https://example.org', origin: 'local', spaceId: 'sp-dev' });
    expect(textItem('Notiz', ctx)).toMatchObject({ kind: 'text', body: 'Notiz', title: 'Notiz', createdAt: '2026-10-27T20:00:00.000Z' });
  });

  it('keeps unknown binaries as files with their real size and type', async () => {
    const [item] = await buildItems([{ type: 'file', file: file('daten.bin', 'application/octet-stream', 'abcd') }], 'sp-dev');
    expect(item).toMatchObject({ kind: 'file', fileName: 'daten.bin', sizeBytes: 4, origin: 'local' });
    expect(item?.kind === 'file' && item.asset?.mimeType).toBe('application/octet-stream');
  });

  it('orders a multi-source capture newest first in source order', async () => {
    const items = await buildItems([{ type: 'text', text: 'eins' }, { type: 'text', text: 'zwei' }], 'sp-dev');
    expect(items[0]!.createdAt > items[1]!.createdAt).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });
});

describe('preferences', () => {
  it('restore stored values and fall back to light defaults', () => {
    expect(restorePreferences(undefined)).toEqual({ theme: 'light', density: 'standard', view: 'grid', sort: 'newest' });
    expect(restorePreferences({ theme: 'dark', density: 'bogus', sidebarMode: 'expanded' } as never)).toEqual({ theme: 'dark', density: 'standard', view: 'grid', sort: 'newest' });
  });
});
