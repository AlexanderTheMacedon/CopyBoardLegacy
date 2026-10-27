import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  buildLibrary,
  emptyData,
  mergeSpaces,
  planCreateFolder,
  planCreateSpace,
  planDelete,
  planDeleteSpace,
  planDuplicate,
  planFavorites,
  planMove,
  planReorderSpaces,
  planRestore,
  planUpdateSpace,
  restoreOverrides,
  wouldCycle,
  type PlanContext,
  type WorkspaceData,
} from '../../src/next/app/operations';
import { createInitialState, uiReducer } from '../../src/next/app/state';
import type { WriteBatch } from '../../src/next/data/store';
import { createLibrary } from '../../src/next/domain/library';
import { searchIcons, suggestIcon } from '../../src/next/domain/icons';
import { sortItems } from '../../src/next/domain/sort';
import type { Item } from '../../src/next/domain/types';
import { fixtureLibrary } from '../../src/next/fixtures';
import { fixtureCollections } from '../../src/next/fixtures/spaces';

// The whole workspace as pure functions: plan → batch → apply → library. No IndexedDB, no React.

const own = (id: string, spaceId = 'sp-dev', extra: { folderId?: string | null } = {}): Item => ({
  id,
  spaceId,
  kind: 'text',
  title: id,
  body: id,
  createdAt: `2026-10-27T10:00:0${id.length % 10}Z`,
  updatedAt: '2026-10-27T10:00:00Z',
  tags: [],
  favorite: false,
  origin: 'local',
  ...extra,
});

const ctx = (data: WorkspaceData): PlanContext => ({ data, library: buildLibrary(fixtureLibrary, data, fixtureCollections) });
const commit = (data: WorkspaceData, batch: WriteBatch) => ctx(applyBatch(data, batch));

const start = (): PlanContext => ctx({ ...emptyData, local: [own('it-local-a'), own('it-local-b'), own('it-local-c', 'sp-design')] });

describe('migration of stored data', () => {
  it('folds legacy favourites into item overrides without losing newer overrides', () => {
    const meta = new Map<string, unknown>([
      ['favorites', { 'it-note-standup': true }],
      ['itemOverrides', { 'it-note-standup': { folderId: 'fd-x' }, 'it-tokens': { favorite: true } }],
    ]);
    expect(restoreOverrides(meta)).toEqual({ 'it-note-standup': { favorite: true, folderId: 'fd-x' }, 'it-tokens': { favorite: true } });
  });

  it('keeps every fixture item and user item visible on an untouched v1 database', () => {
    const { library } = start();
    expect(library.allItems()).toHaveLength(fixtureLibrary.allItems().length + 3);
    expect(library.listChildren({ spaceId: 'sp-dev', folderId: null }).items.map((i) => i.id)).toContain('it-local-a');
    expect(library.folders).toEqual([]);
  });
});

describe('folders', () => {
  it('creates a folder and moves user and fixture items into it in one batch', () => {
    const c = start();
    const plan = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: '  Review  ' }, ['it-local-a', 'it-note-standup']);
    expect(plan.folder.name).toBe('Review');
    expect(plan.moved).toBe(2);
    const next = commit(c.data, plan.batch);
    const level = next.library.listChildren({ spaceId: 'sp-dev', folderId: plan.folder.id });
    expect(level.items.map((i) => i.id).sort()).toEqual(['it-local-a', 'it-note-standup']);
    // The fixture item was not rewritten: it moved through an override.
    expect(next.data.local.find((i) => i.id === 'it-note-standup')).toBeUndefined();
    expect(next.data.overrides['it-note-standup']).toEqual({ spaceId: 'sp-dev', folderId: plan.folder.id });
    expect(next.library.listChildren({ spaceId: 'sp-dev', folderId: null }).items.map((i) => i.id)).not.toContain('it-local-a');
    expect(next.library.listItems({ type: 'space', spaceId: 'sp-dev' }).map((i) => i.id)).toContain('it-local-a');
  });

  it('nests folders, refuses cycles and carries subtrees across spaces', () => {
    let c = start();
    const a = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: 'A' });
    c = commit(c.data, a.batch);
    const b = planCreateFolder(c, { spaceId: 'sp-dev', parentId: a.folder.id, name: 'B' }, ['it-local-a']);
    c = commit(c.data, b.batch);
    expect(c.library.folderPath(b.folder.id).map((f) => f.name)).toEqual(['A', 'B']);
    expect(wouldCycle(c.library, a.folder.id, b.folder.id)).toBe(true);
    expect(wouldCycle(c.library, b.folder.id, null)).toBe(false);
    const cyclic = planMove(c, [a.folder.id], { spaceId: 'sp-dev', folderId: b.folder.id });
    expect(cyclic.moved).toBe(0);
    expect(cyclic.skipped).toEqual([a.folder.id]);
    // Move A (with B and its item) to the design space.
    const across = planMove(c, [a.folder.id], { spaceId: 'sp-design', folderId: null });
    c = commit(c.data, across.batch);
    expect(c.library.getFolder(b.folder.id)?.spaceId).toBe('sp-design');
    expect(c.library.getItem('it-local-a')).toMatchObject({ spaceId: 'sp-design', folderId: b.folder.id });
    expect(c.library.listItems({ type: 'space', spaceId: 'sp-design' }).map((i) => i.id)).toContain('it-local-a');
  });

  it('moving a folder together with its own content does not re-place that content', () => {
    let c = start();
    const a = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: 'A' }, ['it-local-a']);
    c = commit(c.data, a.batch);
    const target = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: 'Target' });
    c = commit(c.data, target.batch);
    const plan = planMove(c, [a.folder.id, 'it-local-a'], { spaceId: 'sp-dev', folderId: target.folder.id });
    c = commit(c.data, plan.batch);
    expect(c.library.getItem('it-local-a')?.folderId).toBe(a.folder.id);
    expect(c.library.getFolder(a.folder.id)?.parentId).toBe(target.folder.id);
  });

  it('deletes a folder with its subtree, keeps fixtures on the board and restores everything on undo', () => {
    let c = start();
    const a = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: 'A' }, ['it-local-a', 'it-note-standup']);
    c = commit(c.data, a.batch);
    const sub = planCreateFolder(c, { spaceId: 'sp-dev', parentId: a.folder.id, name: 'Sub' }, ['it-local-b']);
    c = commit(c.data, sub.batch);
    const before = c.data;
    const del = planDelete(c, [a.folder.id]);
    expect(del.bundle.items.map((i) => i.id).sort()).toEqual(['it-local-a', 'it-local-b']);
    expect(del.bundle.folders.map((f) => f.id).sort()).toEqual([a.folder.id, sub.folder.id].sort());
    expect(del.bundle.keptFixtures).toBe(1);
    c = commit(c.data, del.batch);
    expect(c.library.getItem('it-local-a')).toBeUndefined();
    expect(c.library.getItem('it-note-standup')).toMatchObject({ spaceId: 'sp-dev', folderId: null });
    expect(c.library.folders).toHaveLength(0);
    c = commit(c.data, planRestore(del.bundle));
    expect(c.library.getItem('it-local-b')?.folderId).toBe(sub.folder.id);
    expect(c.library.getItem('it-note-standup')?.folderId).toBe(a.folder.id);
    expect(c.data.overrides).toEqual(before.overrides);
  });

  it('never deletes fixture items on their own', () => {
    const c = start();
    const del = planDelete(c, ['it-note-standup', 'it-local-a']);
    expect(del.batch.items?.delete).toEqual(['it-local-a']);
    expect(del.bundle.keptFixtures).toBe(1);
  });

  it('duplicates items as user data and folders with their subtree', () => {
    let c = start();
    const a = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: 'A' }, ['it-local-a', 'it-moodboard']);
    c = commit(c.data, a.batch);
    const dup = planDuplicate(c, [a.folder.id, 'it-note-standup']);
    expect(dup.folders).toHaveLength(1);
    expect(dup.folders[0]?.name).toBe('A Kopie');
    expect(dup.items).toHaveLength(3);
    expect(dup.items.every((i) => i.origin === 'local' && i.id.startsWith('it-local-'))).toBe(true);
    const copyOfFixture = dup.items.find((i) => i.title === 'Stand-up Notizen Kopie');
    expect(copyOfFixture).toMatchObject({ spaceId: 'sp-dev', folderId: null });
    c = commit(c.data, dup.batch);
    expect(c.library.listChildren({ spaceId: 'sp-dev', folderId: dup.folders[0]!.id }).items).toHaveLength(2);
  });

  it('batch favourites write user items and override fixtures', () => {
    const c = start();
    const batch = planFavorites(c, ['it-local-a', 'it-note-standup', 'it-prompt-review'], true);
    expect(batch.items?.put?.map((i) => i.id)).toEqual(['it-local-a']);
    expect(batch.meta?.itemOverrides).toEqual({ 'it-note-standup': { favorite: true } });
  });
});

describe('spaces', () => {
  it('creates, edits, reorders and keeps fixture spaces as overrides', () => {
    let c = start();
    const created = planCreateSpace(c, { name: ' Projekte ', color: 'mint', icon: 'lucide:rocket', prefs: { view: 'files' } });
    expect(created.space).toMatchObject({ name: 'Projekte', origin: 'local', order: 4 });
    c = commit(c.data, created.batch);
    expect(c.library.spaces.map((s) => s.name)).toEqual(['Entwicklung', 'Design', 'Kunden', 'Ideen', 'Projekte']);
    c = commit(c.data, planUpdateSpace(c, 'sp-dev', { name: 'Dev', icon: 'emoji:🧑‍💻', prefs: { sort: 'name' } }));
    const dev = c.library.getSpace('sp-dev');
    expect(dev).toMatchObject({ name: 'Dev', icon: 'emoji:🧑‍💻', description: fixtureLibrary.getSpace('sp-dev')?.description });
    expect(dev?.origin).toBeUndefined();
    expect(c.data.spaceRecords.find((s) => s.id === 'sp-dev')?.hidden).toBeUndefined();
    c = commit(c.data, planReorderSpaces(c, [created.space.id, 'sp-dev']));
    expect(c.library.spaces.map((s) => s.id).slice(0, 2)).toEqual([created.space.id, 'sp-dev']);
    expect(mergeSpaces(fixtureLibrary.spaces, c.data.spaceRecords).map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('deletes a fixture space with a tombstone and moves its content, including folders, to another space', () => {
    let c = start();
    const folder = planCreateFolder(c, { spaceId: 'sp-dev', parentId: null, name: 'A' }, ['it-local-a']);
    c = commit(c.data, folder.batch);
    const plan = planDeleteSpace(c, 'sp-dev', { moveTo: 'sp-design' });
    expect(plan).not.toBeNull();
    c = commit(c.data, plan!.batch);
    expect(c.library.getSpace('sp-dev')).toBeUndefined();
    expect(c.data.spaceRecords.find((s) => s.id === 'sp-dev')?.hidden).toBe(true);
    expect(c.library.getItem('it-note-standup')?.spaceId).toBe('sp-design');
    expect(c.library.getItem('it-local-a')).toMatchObject({ spaceId: 'sp-design', folderId: folder.folder.id });
    expect(c.library.getFolder(folder.folder.id)?.spaceId).toBe('sp-design');
  });

  it('deleting content with the space removes user items and hides fixtures; the last space is protected', () => {
    let c = start();
    const plan = planDeleteSpace(c, 'sp-dev', { deleteContents: true })!;
    expect(plan.bundle.items.map((i) => i.id)).toEqual(['it-local-a', 'it-local-b']);
    expect(plan.bundle.keptFixtures).toBe(6);
    c = commit(c.data, plan.batch);
    expect(c.library.allItems().some((i) => i.spaceId === 'sp-dev')).toBe(false);
    const onlyOne = ctx({ ...emptyData, spaceRecords: fixtureLibrary.spaces.slice(1).map((s) => ({ ...s, hidden: true })) });
    expect(onlyOne.library.spaces).toHaveLength(1);
    expect(planDeleteSpace(onlyOne, 'sp-dev', { deleteContents: true })).toBeNull();
  });
});

describe('library helpers', () => {
  it('sorts items by mode and keeps the newest-first order stable', () => {
    const items = fixtureLibrary.listItems({ type: 'space', spaceId: 'sp-dev' });
    expect(sortItems(items, 'newest')).toBe(items);
    expect(sortItems(items, 'name').map((i) => i.title)[0]).toBe('Build-Protokoll');
    expect(sortItems(items, 'kind').map((i) => i.kind)).toEqual(['text', 'markdown', 'code', 'image', 'file', 'audio']);
  });

  it('builds a library with children and paths from raw folders', () => {
    const folders = [
      { id: 'fd-1', spaceId: 'sp-dev', parentId: null, name: 'B', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'fd-2', spaceId: 'sp-dev', parentId: null, name: 'A', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'fd-3', spaceId: 'sp-dev', parentId: 'fd-1', name: 'B/1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ];
    const lib = createLibrary(fixtureLibrary.spaces, [own('x', 'sp-dev', { folderId: 'fd-3' })], fixtureCollections, folders);
    expect(lib.listChildren({ spaceId: 'sp-dev', folderId: null }).folders.map((f) => f.name)).toEqual(['A', 'B']);
    expect(lib.descendantFolders('fd-1').map((f) => f.id)).toEqual(['fd-3']);
    expect(lib.folderItems('fd-1').map((i) => i.id)).toEqual(['x']);
    expect(lib.folderPath('fd-3').map((f) => f.id)).toEqual(['fd-1', 'fd-3']);
  });

  it('finds icons by German keywords and suggests one for a folder name', () => {
    expect(searchIcons('rakete').map((e) => e.icon)).toContain('lucide:rocket');
    expect(searchIcons('kunden').map((e) => e.icon)).toContain('lucide:briefcase');
    expect(suggestIcon('Screenshots')).toBe('lucide:image');
    expect(searchIcons('zzzz')).toEqual([]);
  });
});

describe('UI reducer: selection, folders and space defaults', () => {
  const dev = { type: 'space', spaceId: 'sp-dev' } as const;

  it('toggles, ranges and clears the selection; navigation and folder changes reset it', () => {
    let state = createInitialState(dev);
    state = uiReducer(state, { type: 'toggleSelection', id: 'a' });
    state = uiReducer(state, { type: 'toggleSelection', id: 'b' });
    expect(state.selectedIds).toEqual(['a', 'b']);
    expect(state.selectionAnchor).toBe('b');
    state = uiReducer(state, { type: 'toggleSelection', id: 'a' });
    expect(state.selectedIds).toEqual(['b']);
    state = uiReducer(state, { type: 'openFolder', folderId: 'fd-1' });
    expect(state).toMatchObject({ openFolderId: 'fd-1', selectedIds: [] });
    state = uiReducer(state, { type: 'setSelection', ids: ['x', 'y'] });
    state = uiReducer(state, { type: 'navigate', location: { type: 'space', spaceId: 'sp-design' } });
    expect(state).toMatchObject({ openFolderId: null, selectedIds: [], selectionAnchor: null });
  });

  it('applies a space\'s own view defaults on entry without overwriting the global preference', () => {
    const space = { ...fixtureLibrary.getSpace('sp-design')!, prefs: { view: 'files' as const, sort: 'name' as const, filtersVisible: true } };
    let state = createInitialState(dev);
    expect(state.view).toBe('grid');
    state = uiReducer(state, { type: 'navigate', location: { type: 'space', spaceId: 'sp-design' }, space });
    expect(state).toMatchObject({ view: 'files', sort: 'name', filtersVisible: true });
    expect(state.prefs.view).toBe('grid');
    state = uiReducer(state, { type: 'navigate', location: dev, space: fixtureLibrary.getSpace('sp-dev') });
    expect(state).toMatchObject({ view: 'grid', sort: 'newest', filtersVisible: false });
    state = uiReducer(state, { type: 'setPreference', patch: { view: 'list' } });
    expect(state.view).toBe('list');
    expect(state.prefs.view).toBe('list');
  });

  it('keeps one modal and closes it on navigation', () => {
    let state = uiReducer(createInitialState(dev), { type: 'openModal', modal: { kind: 'space-new' } });
    expect(state.modal).toEqual({ kind: 'space-new' });
    state = uiReducer(state, { type: 'navigate', location: { type: 'collection', collectionId: 'all' } });
    expect(state.modal).toBeNull();
  });
});
