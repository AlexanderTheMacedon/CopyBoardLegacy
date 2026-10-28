import { describe, expect, it } from 'vitest';
import { copyText } from '../../src/next/data/clipboard';
import { DOCUMENT_SCHEMA, documentText, sanitizeDocument, textItemToDocument } from '../../src/next/domain/document';
import type { TextItem } from '../../src/next/domain/types';
import { itemActions } from '../../src/next/features/items/item-actions';

// Run C.1: a plain text card reaches the writing studio only through an explicit conversion; plain editing stays.

const textCard = (patch: Partial<TextItem> = {}): TextItem => ({
  id: 'it-local-1',
  kind: 'text',
  spaceId: 'sp-dev',
  folderId: 'fd-notes',
  title: 'Notiz',
  body: 'Erste Zeile\n\n  eingerückt\tmit Tab  und  Lücken 😀\r\nLetzte',
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-02-03T04:05:06.000Z',
  tags: ['idee', 'q1'],
  favorite: true,
  origin: 'local',
  derivedFrom: 'it-example',
  ...patch,
});
const here = { type: 'space', spaceId: 'sp-dev' } as const;

describe('text card → Dokument', () => {
  it('keeps identity, place and metadata; only the format and updatedAt change', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const doc = textItemToDocument(textCard(), now);
    expect(doc).toMatchObject({ id: 'it-local-1', kind: 'document', spaceId: 'sp-dev', folderId: 'fd-notes', title: 'Notiz', createdAt: '2026-01-02T03:04:05.000Z', tags: ['idee', 'q1'], favorite: true, origin: 'local', derivedFrom: 'it-example' });
    expect(doc.updatedAt).toBe(now.toISOString());
    expect(doc).not.toHaveProperty('body');
    expect(doc.content.schema).toBe(DOCUMENT_SCHEMA);
  });

  it('keeps the text character for character, one paragraph per line', () => {
    const doc = textItemToDocument(textCard());
    expect(doc.text).toBe('Erste Zeile\n\n  eingerückt\tmit Tab  und  Lücken 😀\nLetzte');
    expect(doc.content.doc.content).toHaveLength(4);
    expect(documentText(doc.content.doc)).toBe(doc.text);
    expect(copyText(doc)).toBe(doc.text);
    // already in its stored, sanitised shape: opening it changes nothing
    expect(sanitizeDocument(doc.content)).toEqual(doc.content);
  });

  it('handles empty and board-level cards and never touches the input', () => {
    const input = textCard({ body: '', folderId: undefined });
    const frozen = JSON.stringify(input);
    const doc = textItemToDocument(input);
    expect(doc.text).toBe('');
    expect(doc.content.doc.content).toEqual([{ type: 'paragraph' }]);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('refuses Markdown (its source has its own meaning)', () => {
    expect(() => textItemToDocument(textCard({ kind: 'markdown' }))).toThrow();
  });
});

describe('edit actions', () => {
  it('a local text card offers the writing studio and the plain-text editor', () => {
    const ids = itemActions(textCard(), here).filter((a) => a.id === 'open-studio' || a.id === 'open-composer');
    expect(ids.map((a) => [a.id, a.label])).toEqual([
      ['open-studio', 'Im Schreibstudio bearbeiten'],
      ['open-composer', 'Als Klartext bearbeiten'],
    ]);
  });

  it('examples, Markdown and documents keep their single edit action', () => {
    const example = { ...textCard(), origin: undefined } as TextItem;
    for (const item of [example, textCard({ kind: 'markdown' }), textItemToDocument(textCard())]) {
      const edits = itemActions(item, here).filter((a) => a.id === 'open-studio' || a.id === 'open-composer');
      expect(edits.map((a) => a.label)).toEqual(['Bearbeiten']);
    }
  });
});
