import { CompletionContext, completeFromList, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState, type Extension } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createBlankItem, NEW_ITEM_TITLES } from '../../src/next/data/capture';
import { createLibrary } from '../../src/next/domain/library';
import type { Folder, Item, TextItem } from '../../src/next/domain/types';
import { codeLanguages, lineSeparatorFor } from '../../src/next/features/composer/codemirror';
import { completionExtension } from '../../src/next/features/composer/completions';
import { explorerTree } from '../../src/next/features/composer/EditorExplorer';
import { inspectorLayout, itemActions } from '../../src/next/features/items/item-actions';
import { fixtureItems } from '../../src/next/fixtures/items';
import { fixtureSpaces } from '../../src/next/fixtures/spaces';

// Run D: practical code completion, byte-exact line endings, Explorer tree, Inspector hierarchy, "Neu erstellen".

/** Labels every completion source offers at the end of `doc` (explicit: as if opened via the toolbar). */
async function labelsAt(languageId: string, doc: string, explicit = false): Promise<string[]> {
  const language = codeLanguages.find((l) => l.id === languageId);
  const extensions: Extension[] = [language ? await language.load() : [], await completionExtension(languageId)];
  const state = EditorState.create({ doc, extensions });
  const labels: string[] = [];
  // like the autocompletion extension: a plain list is a source too
  for (const data of state.languageDataAt<CompletionSource | readonly Completion[]>('autocomplete', doc.length)) {
    const source = typeof data === 'function' ? data : completeFromList(data);
    const result = await source(new CompletionContext(state, doc.length, explicit));
    if (result) labels.push(...result.options.map((o) => o.label));
  }
  return labels;
}

describe('code completion (local, no language server)', () => {
  it('offers the members of standard globals after a dot in TypeScript and JavaScript', async () => {
    expect(await labelsAt('typescript', 'console.lo')).toContain('log');
    expect(await labelsAt('javascript', 'Math.fl')).toContain('floor');
    expect(await labelsAt('typescript', 'JSON.')).toEqual(expect.arrayContaining(['parse', 'stringify']));
    // inherited Object.prototype members are noise, not suggestions
    expect(await labelsAt('typescript', 'console.', true)).not.toEqual(expect.arrayContaining(['__lookupGetter__']));
    expect(await labelsAt('typescript', 'console.to', true)).not.toContain('toLocaleString');
  });

  it('keeps keywords, snippets and local names; statement snippets never fire after a dot', async () => {
    const labels = await labelsAt('typescript', 'const totalCount = 1;\ntot');
    expect(labels).toContain('totalCount');
    expect(await labelsAt('typescript', 'interf')).toContain('interface');
    expect(await labelsAt('typescript', 'lo')).toContain('log');
    const member = await labelsAt('typescript', 'console.lo');
    expect(member.filter((l) => l === 'log')).toHaveLength(1);
  });

  it('gives languages without completion keywords, snippets and the words already in the buffer', async () => {
    expect(await labelsAt('go', 'fu')).toContain('func');
    expect(await labelsAt('go', 'if er')).toContain('iferr');
    expect(await labelsAt('rust', 'mat')).toContain('match');
    expect(await labelsAt('bash', 'ec')).toContain('echo');
    expect(await labelsAt('json', '{"alphaBeta": 1, "alp')).toContain('alphaBeta');
    expect(await labelsAt('', 'meinWort und mei')).toContain('meinWort');
  });

  it('lists a buffer word that is also a keyword only once', async () => {
    const labels = await labelsAt('go', 'func main() {}\nfu');
    expect(labels.filter((l) => l === 'func')).toHaveLength(1);
  });
});

describe('line endings stay byte for byte', () => {
  const roundTrip = (text: string, insert?: { at: number; text: string }) => {
    let state = EditorState.create({ doc: text, extensions: [lineSeparatorFor(text)] });
    if (insert) state = state.update({ changes: { from: insert.at, insert: insert.text } }).state;
    // what the editor hands to autosave
    return state.sliceDoc();
  };

  it('keeps LF, CRLF, mixed endings, tabs, trailing spaces and the final newline', () => {
    for (const text of ['a\nb\n', 'a\r\nb\t \r\n', 'a\r\nb\nc\r', 'nur\r', '\t  eingerückt  \n\n', ''])
      expect(roundTrip(text)).toBe(text);
  });

  it('continues CRLF when the user adds a line', () => {
    const text = 'A\r\nB';
    const state = EditorState.create({ doc: text, extensions: [lineSeparatorFor(text)] });
    expect(state.lineBreak).toBe('\r\n');
    expect(roundTrip(text, { at: state.doc.length, text: state.lineBreak + 'C' })).toBe('A\r\nB\r\nC');
  });

  it('leaves texts without carriage returns to the default', () => {
    expect(lineSeparatorFor('a\nb')).toEqual([]);
  });
});

describe('Explorer tree', () => {
  const folder = (id: string, name: string, parentId: string | null = null): Folder =>
    ({ id, name, spaceId: 'sp-dev', parentId, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }) as Folder;
  const note = (id: string, title: string, folderId: string | null, kind: Item['kind'] = 'text'): Item =>
    ({ id, kind, title, spaceId: 'sp-dev', folderId, body: '', createdAt: '', updatedAt: '', tags: [], favorite: false, origin: 'local' }) as unknown as Item;

  it('shows folders with editable items (any depth), sorted, and leaves the rest out', () => {
    const folders = [folder('fd-a', 'Alpha'), folder('fd-b', 'Bilder'), folder('fd-c', 'Code', 'fd-a')];
    const items = [note('i1', 'Zeta', null), note('i2', 'beta', null, 'markdown'), note('i3', 'Foto', 'fd-b', 'image'), note('i4', 'util.ts', 'fd-c', 'code')];
    const tree = explorerTree(createLibrary(fixtureSpaces, items, [], folders), 'sp-dev');
    expect(tree.items.map((i) => i.title)).toEqual(['beta', 'Zeta']);
    expect(tree.folders.map((f) => f.folder.name)).toEqual(['Alpha']);
    expect(tree.folders[0]?.folders[0]?.items.map((i) => i.title)).toEqual(['util.ts']);
  });
});

describe('Inspector hierarchy', () => {
  const location = { type: 'space', spaceId: 'sp-dev' } as const;
  const own: TextItem = { ...(fixtureItems.find((i) => i.kind === 'text') as TextItem), origin: 'local', folderId: null };

  it('makes the writing studio the one primary action of an own text card and keeps copy at hand', () => {
    const layout = inspectorLayout(itemActions(own, location), own);
    expect(layout.primary?.id).toBe('open-studio');
    expect(layout.quick.map((a) => a.id)).toEqual(expect.arrayContaining(['copy', 'open-composer', 'favorite']));
    expect(layout.organize.map((a) => a.id)).toEqual(['move', 'new-folder', 'duplicate']);
    expect(layout.danger.map((a) => a.id)).toEqual(['delete']);
  });

  it('places every registry action exactly once, for every fixture kind', () => {
    for (const item of fixtureItems) {
      const actions = itemActions(item, location);
      const layout = inspectorLayout(actions, item);
      const placed = [layout.primary, ...layout.quick, ...layout.organize, ...layout.danger].filter(Boolean);
      expect(placed).toHaveLength(actions.length);
      expect(new Set(placed.map((a) => a?.id)).size).toBe(actions.length);
    }
  });

  it('keeps copy (or download) primary where there is no editor to prefer', () => {
    const code = fixtureItems.find((i) => i.kind === 'code');
    if (code) expect(inspectorLayout(itemActions(code, location), code).primary?.id).toBe('copy');
  });
});

describe('Neu erstellen', () => {
  it('creates empty, local, writable items at the placement', () => {
    const text = createBlankItem('text', 'sp-dev', 'fd-x');
    expect(text).toMatchObject({ kind: 'text', body: '', title: NEW_ITEM_TITLES.text, spaceId: 'sp-dev', folderId: 'fd-x', origin: 'local', favorite: false });
    const md = createBlankItem('markdown', 'sp-dev', null);
    expect(md).toMatchObject({ kind: 'markdown', body: '' });
    expect('folderId' in md).toBe(false);
    expect(createBlankItem('code', 'sp-dev', null, new Date(), 'go')).toMatchObject({ kind: 'code', language: 'go', body: '' });
  });
});
