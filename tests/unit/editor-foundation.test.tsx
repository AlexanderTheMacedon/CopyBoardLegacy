import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDocumentItem } from '../../src/next/data/capture';
import { documentOutline, documentText, emptyDocument, normalizeHref, safeHref, sanitizeDocument, titleFromText } from '../../src/next/domain/document';
import { searchItems } from '../../src/next/domain/search';
import { isEditable } from '../../src/next/domain/types';
import { MarkdownPreview, renderMarkdown } from '../../src/next/features/composer/MarkdownPreview';
import { markdownOutline } from '../../src/next/features/composer/markdown-outline';
import { itemActions } from '../../src/next/features/items/item-actions';
import { excerpt, kindLabel } from '../../src/next/features/items/item-meta';

// Run A: the Dokument kind (domain model, sanitiser, derived text), the safe Markdown renderer and the editor-facing registries.

describe('document model', () => {
  it('creates an empty, valid local document', () => {
    const item = createDocumentItem('sp-dev', null, new Date('2026-10-28T10:00:00Z'));
    expect(item).toMatchObject({ kind: 'document', origin: 'local', text: '', favorite: false, spaceId: 'sp-dev' });
    expect(item.content).toEqual(emptyDocument());
    expect(item).not.toHaveProperty('folderId');
    expect(createDocumentItem('sp-dev', 'fd-1').folderId).toBe('fd-1');
  });

  it('keeps supported structure, marks and alignment', () => {
    const doc = {
      schema: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Titel' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'fett', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://ok.example/a' } }] }] },
          { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'erledigt' }] }] }] },
        ],
      },
    };
    const clean = sanitizeDocument(doc);
    expect(clean).toEqual({ ...doc, schema: 2 }); // a schema-1 tree is migrated by restamping: nothing is lost
    expect(documentText(clean.doc)).toBe('Titel\nfett\nerledigt');
    expect(documentOutline(clean.doc)).toEqual([{ level: 2, text: 'Titel' }]);
  });

  it('drops unsafe links, unknown marks, foreign colours and unknown nodes (their text survives)', () => {
    const clean = sanitizeDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'böse', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            { type: 'text', text: ' farbe', marks: [{ type: 'textStyle', attrs: { color: 'url(https://evil)' } }, { type: 'highlight' }] },
            { type: 'text', text: ' ok', marks: [{ type: 'textStyle', attrs: { color: '#C2410C' } }] },
          ],
        },
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } },
      ],
    });
    expect(JSON.stringify(clean)).not.toMatch(/javascript:|evil|onerror|highlight|"image"|"script"/);
    expect(clean.doc.content?.[0]?.content?.[2]?.marks).toEqual([{ type: 'textStyle', attrs: { color: '#c2410c' } }]);
    expect(documentText(clean.doc)).toContain('alert(1)'); // text of a dropped wrapper is kept as plain text
  });

  it('never returns an empty document and survives garbage', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}, { doc: 5 }, { type: 'doc' }]) {
      expect(sanitizeDocument(raw).doc.content?.length).toBeGreaterThan(0);
    }
    const deep: Record<string, unknown> = { type: 'paragraph' };
    let cursor = deep;
    for (let i = 0; i < 200; i++) {
      const next = { type: 'blockquote' };
      cursor.content = [next];
      cursor = next;
    }
    expect(JSON.stringify(sanitizeDocument({ type: 'doc', content: [deep] })).length).toBeLessThan(5000);
  });

  it('accepts only http(s), mailto and tel links', () => {
    expect(safeHref('https://a.example')).toBe('https://a.example');
    expect(safeHref('mailto:a@b.de')).toBe('mailto:a@b.de');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil', 'relative/path', '', ' ', 42, null]) expect(safeHref(bad)).toBeUndefined();
    expect(normalizeHref('example.com/x')).toBe('https://example.com/x');
    expect(normalizeHref('javascript:alert(1)')).toBeUndefined();
  });

  it('derives title, excerpt and search text', () => {
    expect(titleFromText('\n  Erste Zeile  \nZweite')).toBe('Erste Zeile');
    expect(titleFromText('')).toBe('Unbenanntes Dokument');
    expect(titleFromText('x'.repeat(100)).length).toBe(60);
    const item = { ...createDocumentItem('sp-dev', null), title: 'Plan', text: 'Alpha\nBeta Gamma' };
    expect(excerpt(item)).toBe('Alpha Beta Gamma');
    expect(searchItems([item], 'gamma')).toHaveLength(1);
    expect(kindLabel.document).toBe('Dokument');
  });

  it('is editable and offers "Bearbeiten"', () => {
    const item = createDocumentItem('sp-dev', null);
    expect(isEditable(item)).toBe(true);
    expect(itemActions(item, { type: 'space', spaceId: 'sp-dev' }).map((a) => a.id)).toContain('open-composer');
  });
});

describe('Markdown renderer', () => {
  const html = (source: string) => renderToStaticMarkup(<MarkdownPreview source={source} />);

  it('renders inline formatting and safe links only', () => {
    const out = html('**fett** *kursiv* `code` ~~weg~~ [ok](https://a.example) [bad](javascript:alert(1)) https://auto.example/x.');
    expect(out).toContain('<strong>fett</strong>');
    expect(out).toContain('<em>kursiv</em>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<del>weg</del>');
    expect(out).toContain('<a href="https://a.example" target="_blank" rel="noopener noreferrer nofollow">ok</a>');
    expect(out).toContain('href="https://auto.example/x"');
    expect(out).not.toContain('javascript:alert(1)"');
    expect(out).not.toMatch(/href="javascript/);
  });

  it('never loads embeds or interprets raw HTML', () => {
    const out = html('![x](https://img.example/a.png)\n\n<script>alert(1)</script>\n\n<iframe src="https://evil"></iframe>\n\n![y](data:image/png;base64,AAAA)');
    expect(out).not.toMatch(/<img|<script|<iframe/);
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('src="');
  });

  it('renders nested and ordered lists, tasks, quotes, tables and rules', () => {
    const out = html('1. eins\n2. zwei\n   - sub\n\n- [ ] offen\n- [x] fertig\n\n> zitat\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---');
    expect(out).toContain('<ol>');
    expect(out).toContain('<ul><li>sub</li></ul>');
    expect(out).toContain('cb-md-task');
    expect(out).toContain('data-checked="true"');
    expect(out).toContain('<blockquote><p>zitat</p></blockquote>');
    expect(out).toContain('<th>A</th>');
    expect(out).toContain('<td>2</td>');
    expect(out).toContain('<hr/>');
  });

  it('keeps fenced code verbatim, including markdown-looking lines', () => {
    const out = html('```ts\n# not a heading\n**x**\n```');
    expect(out).toContain('<code data-lang="ts"># not a heading\n**x**</code>');
    expect(out).not.toContain('<h1>');
  });

  it('is deterministic and handles empty input', () => {
    expect(renderMarkdown('')).toEqual([]);
    expect(html('a\r\nb')).toBe(html('a\nb'));
  });

  it('keeps extra blank lines between blocks as gaps, never at the edges or inside code', () => {
    const gaps = (source: string) => [...html(source).matchAll(/class="cb-md-gap"[^>]*--cb-md-gap:(\d+)/g)].map((m) => Number(m[1]));
    expect(gaps('a\n\nb')).toEqual([]);
    expect(gaps('a\n\n\n\nb')).toEqual([2]);
    expect(gaps('- x\n- y\n\n\n\n\nSiehe hier\n```\nc\n\n\n\nd\n```')).toEqual([3]);
    expect(gaps('\n\n\n# A\n\n\n')).toEqual([]);
    expect(html('```\nc\n\n\nd\n```')).toContain('c\n\n\nd');
    expect(html('a\n\n\nb')).toContain('aria-hidden="true"');
  });

  it('outlines headings outside code blocks', () => {
    expect(markdownOutline('# A\n```\n# no\n```\n## B ##\n#### C')).toEqual([
      { level: 1, text: 'A' },
      { level: 2, text: 'B' },
      { level: 3, text: 'C' },
    ]);
  });
});
