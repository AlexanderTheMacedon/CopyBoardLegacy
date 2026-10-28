import { useMemo, type RefObject } from 'react';
import { usePreview } from '../../app/context';
import type { BoardFilter } from '../../app/state';
import { Icon } from '../../components/Icon';
import { useScrollInertia } from '../../components/motion';
import type { SegmentOption } from '../../components/SegmentedControl';
import { kindOrder } from '../../domain/kinds';
import { searchItems } from '../../domain/search';
import { sortFolders, sortItems } from '../../domain/sort';
import type { Folder, Item, Placement } from '../../domain/types';
import { useDragAutoScroll } from '../dnd/useDragDrop';
import { BoardGrid, useOrderedIds } from '../grid/BoardGrid';
import { EmptyState } from '../grid/EmptyState';
import { kindIcon, kindLabel } from '../items/item-meta';
import { SelectionBar } from '../selection/SelectionBar';
import { useSelection } from '../selection/useSelection';
import { WorkspaceHeader } from './WorkspaceHeader';

/** Filter chips from the real items of the location: "Alle", every kind that occurs, favourites if there are any. */
export function filterOptions(items: readonly Item[], showFavorites: boolean): SegmentOption<BoardFilter>[] {
  const options: SegmentOption<BoardFilter>[] = [{ value: 'all', label: 'Alle', count: items.length }];
  for (const kind of kindOrder) {
    const count = items.filter((i) => i.kind === kind).length;
    if (count) options.push({ value: kind, label: kindLabel[kind], icon: kindIcon[kind], count });
  }
  const favorites = items.filter((i) => i.favorite).length;
  if (showFavorites && favorites) options.push({ value: 'favorites', label: 'Favoriten', icon: 'star', count: favorites });
  return options;
}

export const applyFilter = (items: readonly Item[], filter: BoardFilter): readonly Item[] =>
  filter === 'all' ? items : items.filter((i) => (filter === 'favorites' ? i.favorite : i.kind === filter));

/** The entries one level shows: filtered, searched and sorted. Shared by the board and the folder window. */
export function useLevelEntries(folders: readonly Folder[], items: readonly Item[], filter: BoardFilter, query = '') {
  const { state } = usePreview();
  return useMemo(() => {
    const filtered = applyFilter(items, filter);
    const searched = query.trim() ? searchItems(filtered, query, 500).map((h) => h.item) : filtered;
    const visibleFolders = query.trim() ? folders.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase())) : folders;
    return { folders: sortFolders(visibleFolders, state.sort), items: sortItems(searched, state.sort) };
  }, [folders, items, filter, query, state.sort]);
}

/** Space board / collection view (SC-02, SC-04..07): header → folders and cards of the board level. Capture is the Bottom
 *  Floating Composer of the shell (ComposerDock), shared with the folder window. */
export function Board({ scrollRoot }: { scrollRoot: RefObject<HTMLElement | null> }) {
  const { state, dispatch, library } = usePreview();
  const { location } = state;
  const space = location.type === 'space' ? library.getSpace(location.spaceId) : undefined;
  const collection = location.type === 'collection' ? library.collections.find((c) => c.id === location.collectionId) : undefined;
  const title = space?.name ?? collection?.name ?? '';
  const placement: Placement | undefined = space ? { spaceId: space.id, folderId: null } : undefined;

  // Counts and filter chips cover the whole space (all folder levels); the grid shows the board level only.
  const allItems = library.listItems(location);
  const level = placement ? library.listChildren(placement) : { folders: [] as readonly Folder[], items: allItems };
  const options = filterOptions(allItems, !(location.type === 'collection' && location.collectionId === 'favorites'));
  // A filter whose chip does not exist here (e.g. after the data changed) falls back to everything.
  const filter = options.some((o) => o.value === state.filter) ? state.filter : 'all';
  const entries = useLevelEntries(level.folders, level.items, filter);
  const orderedIds = useOrderedIds(entries.folders, entries.items);
  const selection = useSelection(orderedIds, { active: !state.openFolderId && !state.composerItemId });
  useDragAutoScroll(scrollRoot);
  useScrollInertia(scrollRoot);

  const emptyVariant = collection && !collection.available ? 'unavailable' : space ? 'space-empty' : 'collection-empty';
  const hasContent = level.folders.length > 0 || level.items.length > 0;
  const countLabel = allItems.length === 1 ? '1 Inhalt' : `${allItems.length} Inhalte`;
  const visibleCount = entries.items.length + entries.folders.length;

  return (
    <div className="cb-board-root" onClick={selection.onSurfaceClick}>
      <WorkspaceHeader
        title={title}
        space={space}
        collectionId={collection?.id}
        filters={allItems.length > 1 ? options : undefined}
        filter={filter}
        onFilterChange={(next) => dispatch({ type: 'setFilter', filter: next })}
        countLabel={allItems.length ? countLabel : undefined}
        placement={placement}
        scrollRoot={scrollRoot}
      />
      <div className="cb-board" data-empty={!hasContent || undefined}>
        {hasContent ? (
          <>
            {filter !== 'all' && (
              <div className="cb-board__filter-note">
                <p role="status">
                  {visibleCount === 1 ? '1 Eintrag' : `${visibleCount} Einträge`} · gefiltert nach {options.find((o) => o.value === filter)?.label}
                </p>
                <button type="button" className="cb-board__filter-reset" onClick={() => dispatch({ type: 'setFilter', filter: 'all' })}>
                  <Icon name="x" size={12} />
                  Alle zeigen
                </button>
              </div>
            )}
            <BoardGrid
              folders={entries.folders}
              items={entries.items}
              label={`Inhalte in ${title}`}
              placement={placement}
              selection={selection}
              showSpace={location.type === 'collection'}
            />
          </>
        ) : (
          <EmptyState variant={emptyVariant} />
        )}
      </div>
      {!state.openFolderId && <SelectionBar selection={selection} orderedIds={orderedIds} placement={placement} />}
    </div>
  );
}
