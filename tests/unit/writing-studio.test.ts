import { Node as PMNode } from '@tiptap/pm/model';
import { getSchema, type JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_SCHEMA,
  documentText,
  fontSizeValue,
  HIGHLIGHT_COLORS,
  paletteColor,
  sanitizeDocument,
} from '../../src/next/domain/document';
import { documentExtensions, steppedFontSize } from '../../src/next/features/composer/doc-extensions';
import { DOC_ZOOM_STEPS, normalizeEditorPrefs } from '../../src/next/features/composer/editor-types';

// Run C: the writing studio's document formatting (schema 2): curated typography, highlighter and paragraph format.

const schema = getSchema(documentExtensions);
const para = (attrs: Record<string, unknown>, text = 'x', marks?: unknown[]) => ({ type: 'paragraph', attrs, content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });

describe('document schema 2', () => {
  it('keeps curated typography, highlighter and paragraph format exactly', () => {
    const doc = {
      schema: 2,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2, textAlign: 'justify', indent: 2, lineHeight: '1.5', spacing: 'large' }, content: [{ type: 'text', text: 'Titel' }] },
          {
            type: 'paragraph',
            attrs: { indent: 1, spacing: 'none' },
            content: [
              { type: 'text', text: 'groß', marks: [{ type: 'textStyle', attrs: { color: '#2563eb', fontFamily: 'serif', fontSize: '25' } }] },
              { type: 'text', text: ' markiert', marks: [{ type: 'bold' }, { type: 'highlight', attrs: { color: 'green' } }] },
            ],
          },
        ],
      },
    };
    expect(sanitizeDocument(doc)).toEqual(doc);
    expect(documentText(sanitizeDocument(doc).doc)).toBe('Titel\ngroß markiert');
  });

  it('migrates a schema-1 document losslessly and always writes the current schema', () => {
    const v1 = { schema: 1, doc: { type: 'doc', content: [para({ textAlign: 'center' }, 'alt', [{ type: 'textStyle', attrs: { color: '#c2410c' } }, { type: 'italic' }])] } };
    const migrated = sanitizeDocument(v1);
    expect(DOCUMENT_SCHEMA).toBe(2);
    expect(migrated.schema).toBe(2);
    expect(migrated.doc).toEqual(v1.doc);
  });

  it('drops values outside the curated sets, attribute by attribute', () => {
    const clean = sanitizeDocument({
      type: 'doc',
      content: [
        para({ indent: 99, lineHeight: '9', spacing: 'huge', textAlign: 'left' }, 'a', [
          { type: 'textStyle', attrs: { color: 'red', fontFamily: 'Comic Sans MS', fontSize: '13', background: 'url(https://evil)' } },
          { type: 'highlight', attrs: { color: 'url(javascript:alert(1))' } },
        ]),
        para({ indent: '3', lineHeight: 2 }, 'b', [{ type: 'textStyle', attrs: { color: 'RGB(37, 99, 235)', fontSize: '20px', fontFamily: 'mono; color: red' } }]),
      ],
    });
    const [a, b] = clean.doc.content ?? [];
    expect(a?.attrs).toEqual({ textAlign: 'left' });
    expect(a?.content?.[0]?.marks).toBeUndefined();
    expect(b?.attrs).toEqual({ indent: 3, lineHeight: '2' });
    expect(b?.content?.[0]?.marks).toEqual([{ type: 'textStyle', attrs: { color: '#2563eb', fontSize: '20' } }]);
    expect(JSON.stringify(clean)).not.toMatch(/evil|javascript|Comic|huge/);
  });

  it('normalises colours and sizes the browser hands back', () => {
    expect(paletteColor('rgb(194, 65, 12)')).toBe('#c2410c');
    expect(paletteColor('#C2410C')).toBe('#c2410c');
    expect(paletteColor('#ff0000')).toBeUndefined();
    expect(paletteColor('rgb(1,2,3); background:url(x)')).toBeUndefined();
    expect(fontSizeValue('17px')).toBe('17');
    expect(fontSizeValue(64)).toBe('64');
    expect(fontSizeValue('1e2')).toBeUndefined();
  });

  it('every sanitised tree is buildable by the editor schema', () => {
    const clean = sanitizeDocument({
      type: 'doc',
      content: [
        para({ indent: 2, lineHeight: '1.2', spacing: 'small', textAlign: 'right' }, 'p', [{ type: 'highlight', attrs: { color: 'violet' } }, { type: 'textStyle', attrs: { fontFamily: 'display', fontSize: '48' } }]),
        { type: 'heading', attrs: { level: 1, indent: 1 }, content: [{ type: 'text', text: 'h' }] },
      ],
    });
    expect(() => PMNode.fromJSON(schema, clean.doc as unknown as JSONContent).check()).not.toThrow();
  });
});

describe('document rendering (export and print)', () => {
  const toDOM = (json: unknown) => {
    const node = PMNode.fromJSON(schema, json as JSONContent);
    return JSON.stringify(node.type.spec.toDOM?.(node));
  };

  it('renders data attributes for the editor and inline styles for exported files', () => {
    const text = PMNode.fromJSON(schema, { type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: '#15803d', fontFamily: 'serif', fontSize: '25' } }, { type: 'highlight', attrs: { color: 'blue' } }] });
    const [style, mark] = text.marks.map((m) => JSON.stringify(m.type.spec.toDOM?.(m, true)));
    expect(style).toContain('"data-text-color":"#15803d"');
    expect(style).toContain('"data-font":"serif"');
    expect(style).toContain('"data-size":"25"');
    expect(style).toMatch(/color: #15803d;\s*font-family: 'Iowan Old Style'.*font-size: 25px/);
    expect(mark).toContain('"data-color":"blue"');
    expect(mark).toContain(`background-color: ${HIGHLIGHT_COLORS.find((c) => c.value === 'blue')?.hex}`);
    const block = toDOM({ type: 'paragraph', attrs: { indent: 2, lineHeight: '1.5', spacing: 'none', textAlign: 'justify' } });
    expect(block).toContain('"data-indent":2');
    expect(block).toMatch(/margin-left: 3em/);
    expect(block).toMatch(/line-height: 1.5/);
    expect(block).toMatch(/margin-top: 0em/);
    expect(block).toMatch(/text-align: justify/);
  });

  it('a plain paragraph renders without any formatting attributes', () => {
    expect(toDOM({ type: 'paragraph' })).toBe('["p",{},0]');
  });
});

describe('view preferences are not document formatting', () => {
  it('steps font sizes through the curated list and clamps at its ends', () => {
    expect(steppedFontSize(17, 1)).toBe(20);
    expect(steppedFontSize(17, -1)).toBe(15);
    expect(steppedFontSize(18, -1)).toBe(17);
    expect(steppedFontSize(64, 1)).toBe(64);
    expect(steppedFontSize(12, -1)).toBe(12);
  });

  it('page zoom is a validated per-viewer preference', () => {
    expect(normalizeEditorPrefs({}).zoom).toBe(100);
    expect(normalizeEditorPrefs({ zoom: 150 }).zoom).toBe(150);
    expect(normalizeEditorPrefs({ zoom: 133 }).zoom).toBe(100);
    expect(DOC_ZOOM_STEPS).toContain(100);
  });
});
