import { describe, expect, it } from 'vitest';
import { createInitialState, uiReducer, type UiState } from '../../src/next/app/state';
import { searchItems } from '../../src/next/domain/search';
import { fixtureLibrary } from '../../src/next/fixtures';
import { fixtureItems } from '../../src/next/fixtures/items';
import { fixtureSpaces } from '../../src/next/fixtures/spaces';
import { itemActions, primaryQuickAction } from '../../src/next/features/items/item-actions';
import { excerpt } from '../../src/next/features/items/item-meta';
import { filterCommands, paletteCommands } from '../../src/next/features/search/commands';

const dev = { type: 'space', spaceId: 'sp-dev' } as const;
const design = { type: 'space', spaceId: 'sp-design' } as const;

describe('synthetic fixtures', () => {
  it('have unique ids and only reference existing spaces', () => {
    const ids = fixtureItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const spaceIds = new Set(fixtureSpaces.map((s) => s.id));
    for (const item of fixtureItems) expect(spaceIds.has(item.spaceId), item.id).toBe(true);
  });

  it('cover every item kind and one confirmed-empty space', () => {
    expect(new Set(fixtureItems.map((i) => i.kind))).toEqual(new Set(['text', 'markdown', 'code', 'image', 'file', 'audio']));
    expect(fixtureLibrary.listItems({ type: 'space', spaceId: 'sp-ideas' })).toHaveLength(0);
  });
});

describe('read-only library', () => {
  it('lists space items in stable fixture order', () => {
    expect(fixtureLibrary.listItems(dev).map((i) => i.id)).toEqual(fixtureItems.filter((i) => i.spaceId === 'sp-dev').map((i) => i.id));
  });

  it('derives collections without copying data', () => {
    expect(fixtureLibrary.listItems({ type: 'collection', collectionId: 'all' })).toHaveLength(fixtureItems.length);
    expect(fixtureLibrary.listItems({ type: 'collection', collectionId: 'favorites' }).every((i) => i.favorite)).toBe(true);
    const recent = fixtureLibrary.listItems({ type: 'collection', collectionId: 'recent' });
    expect(recent.length).toBeLessThanOrEqual(8);
    expect([...recent].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))).toEqual(recent);
    expect(fixtureLibrary.listItems({ type: 'collection', collectionId: 'sessions' })).toHaveLength(0);
  });

  it('exposes no write method', () => {
    const keys = Object.keys(fixtureLibrary);
    expect(keys.filter((k) => /^(set|add|create|update|delete|remove|save|put|write)/i.test(k))).toEqual([]);
  });
});

describe('local search', () => {
  const all = fixtureLibrary.allItems();

  it('matches case- and diacritic-insensitively across title, tags and content', () => {
    expect(searchItems(all, 'MOODBOARD').map((h) => h.item.id)).toEqual(['it-moodboard']);
    expect(searchItems(all, 'uberschreibungen').map((h) => h.item.id)).toContain('it-prompt-review');
    expect(searchItems(all, 'typescript').map((h) => h.item.id)).toContain('it-snippet-debounce');
    expect(searchItems(all, 'briefing-atelier').map((h) => h.item.id)).toEqual(['it-brief']);
  });

  it('requires every token and ranks title hits first', () => {
    expect(searchItems(all, 'prompt review').map((h) => h.item.id)).toEqual(['it-prompt-review']);
    expect(searchItems(all, 'prompt nichtvorhanden')).toEqual([]);
    const hits = searchItems(all, 'inspector');
    expect(hits[0]?.item.id).toBe('it-critique');
  });

  it('returns nothing for an empty query', () => {
    expect(searchItems(all, '   ')).toEqual([]);
  });
});

describe('palette commands', () => {
  it('are filtered by query and never destructive', () => {
    const commands = paletteCommands(fixtureLibrary);
    expect(filterCommands(commands, 'liste').map((c) => c.id)).toEqual(['view-list']);
    // Dialog-opening commands (new space) only open a form; nothing in the palette mutates data by itself.
    expect(commands.every((c) => ['navigate', 'setPreference', 'openSettings', 'openModal'].includes(c.action.type))).toBe(true);
  });
});

describe('UI reducer', () => {
  const start = createInitialState(dev);

  it('starts light by default and remembers the last space for captures in collections', () => {
    expect(start.prefs.theme).toBe('light');
    const all = uiReducer(uiReducer(start, { type: 'navigate', location: design }), { type: 'navigate', location: { type: 'collection', collectionId: 'all' } });
    expect(all.lastSpaceId).toBe('sp-design');
  });

  it('navigation closes detail context but keeps the recorder and preferences', () => {
    let state: UiState = uiReducer(start, { type: 'setRecorderOpen', open: true });
    state = uiReducer(state, { type: 'setPreference', patch: { view: 'list', density: 'compact' } });
    state = uiReducer(state, { type: 'inspect', itemId: 'it-note-standup' });
    state = uiReducer(state, { type: 'navigate', location: design });
    expect(state.location).toEqual(design);
    expect(state.inspectedItemId).toBeNull();
    expect(state.recorderOpen).toBe(true);
    expect(state.prefs).toMatchObject({ view: 'list', density: 'compact' });
  });

  it('composer replaces the inspector and returns to it', () => {
    let state = uiReducer(start, { type: 'inspect', itemId: 'it-prompt-review' });
    state = uiReducer(state, { type: 'openComposer', itemId: 'it-prompt-review' });
    expect(state.composerItemId).toBe('it-prompt-review');
    state = uiReducer(state, { type: 'closeComposer' });
    expect(state).toMatchObject({ composerItemId: null, inspectedItemId: 'it-prompt-review' });
  });

  it('keeps a single overlay and shares one preference state', () => {
    let state = uiReducer(start, { type: 'openOverlay', overlay: 'search' });
    state = uiReducer(state, { type: 'openSettings', section: 'data' });
    expect(state).toMatchObject({ overlay: 'settings', settingsSection: 'data' });
    state = uiReducer(state, { type: 'setPreference', patch: { theme: 'dark' } });
    expect(state.prefs.theme).toBe('dark');
    expect(uiReducer(state, { type: 'closeOverlay' }).overlay).toBeNull();
  });

  it('re-selecting the current space only closes the drawer', () => {
    const drawer = uiReducer(uiReducer(start, { type: 'inspect', itemId: 'it-note-standup' }), { type: 'openOverlay', overlay: 'spaces-drawer' });
    const next = uiReducer(drawer, { type: 'navigate', location: dev });
    expect(next).toMatchObject({ overlay: null, inspectedItemId: 'it-note-standup' });
  });
});

describe('item action registry', () => {
  const item = (id: string) => {
    const found = fixtureLibrary.getItem(id);
    if (!found) throw new Error(id);
    return found;
  };

  it('offers only working actions: copy for text, no copy/download for synthetic binaries', () => {
    expect(primaryQuickAction(item('it-note-standup'), dev)).toMatchObject({ id: 'copy' });
    // Fixture binaries carry no data, so neither copy nor download is offered.
    expect(primaryQuickAction(item('it-log-build'), dev)).toBeUndefined();
    expect(itemActions(item('it-voice-arch'), dev).map((a) => a.id)).not.toContain('copy');
    expect(itemActions(item('it-voice-arch'), dev).map((a) => a.id)).not.toContain('download');
  });

  it('offers the editor for textual items and the image studio for images, reveal outside the own space and delete for own items', () => {
    expect(itemActions(item('it-prompt-review'), dev).map((a) => a.id)).toContain('open-composer');
    // Run B: images open in the image studio (same Canvas action, own label)
    expect(itemActions(item('it-moodboard'), design).find((a) => a.id === 'open-composer')).toMatchObject({ label: 'Im Bildstudio bearbeiten' });
    expect(itemActions(item('it-moodboard'), design).map((a) => a.id)).not.toContain('download-original');
    expect(itemActions(item('it-moodboard'), dev).map((a) => a.id)).toContain('reveal-in-space');
    expect(itemActions(item('it-moodboard'), design).map((a) => a.id)).not.toContain('reveal-in-space');
    expect(itemActions(item('it-prompt-review'), dev).map((a) => a.id)).not.toContain('delete');
    const own = { ...item('it-note-standup'), id: 'it-local-1', origin: 'local' as const };
    expect(itemActions(own, dev).at(-1)).toMatchObject({ id: 'delete', danger: true });
  });

  it('favourite toggles its label', () => {
    expect(itemActions(item('it-prompt-review'), dev).find((a) => a.id === 'favorite')?.label).toBe('Aus Favoriten entfernen');
    expect(itemActions(item('it-note-standup'), dev).find((a) => a.id === 'favorite')?.label).toBe('Zu Favoriten');
  });

  it('builds plain-text excerpts from Markdown', () => {
    expect(excerpt(item('it-tokens'))).toMatch(/^Radius • control-sm/);
  });
});
