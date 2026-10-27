import type { RefObject } from 'react';
import { usePreview } from '../../app/context';
import type { BoardFilter } from '../../app/state';
import type { SegmentOption } from '../../components/SegmentedControl';
import type { Item, ItemKind } from '../../domain/types';
import { SmartCapture } from '../capture/SmartCapture';
import { EmptyState } from '../grid/EmptyState';
import { SmartGrid } from '../grid/SmartGrid';
import { ViewControls } from '../grid/ViewControls';
import { kindIcon, kindLabel } from '../items/item-meta';
import { WorkspaceHeader } from './WorkspaceHeader';

const kindOrder: readonly ItemKind[] = ['text', 'markdown', 'code', 'link', 'image', 'file', 'audio'];

/** Filter chips from the real items of the location: "Alle", every kind that occurs, favourites if there are any. */
function filterOptions(items: readonly Item[], showFavorites: boolean): SegmentOption<BoardFilter>[] {
  const options: SegmentOption<BoardFilter>[] = [{ value: 'all', label: 'Alle', count: items.length }];
  for (const kind of kindOrder) {
    const count = items.filter((i) => i.kind === kind).length;
    if (count) options.push({ value: kind, label: kindLabel[kind], icon: kindIcon[kind], count });
  }
  const favorites = items.filter((i) => i.favorite).length;
  if (showFavorites && favorites) options.push({ value: 'favorites', label: 'Favoriten', icon: 'star', count: favorites });
  return options;
}

const applyFilter = (items: readonly Item[], filter: BoardFilter): readonly Item[] =>
  filter === 'all' ? items : items.filter((i) => (filter === 'favorites' ? i.favorite : i.kind === filter));

/** Space board / collection view (SC-02, SC-04..07): title + filter chips → Smart Capture → Smart Grid. */
export function Board({ scrollRoot }: { scrollRoot: RefObject<HTMLElement | null> }) {
  const { state, dispatch, library } = usePreview();
  const { location } = state;
  const items = library.listItems(location);

  const space = location.type === 'space' ? library.getSpace(location.spaceId) : undefined;
  const collection = location.type === 'collection' ? library.collections.find((c) => c.id === location.collectionId) : undefined;
  const title = space?.name ?? collection?.name ?? '';

  const options = filterOptions(items, !(location.type === 'collection' && location.collectionId === 'favorites'));
  // A filter whose chip does not exist here (e.g. after the data changed) falls back to everything.
  const filter = options.some((o) => o.value === state.filter) ? state.filter : 'all';
  const visible = applyFilter(items, filter);

  const emptyVariant = collection && !collection.available ? 'unavailable' : space ? 'space-empty' : 'collection-empty';
  const countLabel = items.length === 1 ? '1 Inhalt' : `${items.length} Inhalte`;

  return (
    <>
      <WorkspaceHeader
        title={title}
        filters={items.length > 1 ? options : undefined}
        filter={filter}
        onFilterChange={(next) => dispatch({ type: 'setFilter', filter: next })}
        countLabel={items.length ? countLabel : undefined}
        scrollRoot={scrollRoot}
      />
      <div className="cb-board">
        <SmartCapture />
        {items.length > 0 ? (
          <>
            <ViewControls count={visible.length} total={items.length} />
            <SmartGrid items={visible} filter={filter} label={`Inhalte in ${title}`} />
          </>
        ) : (
          <EmptyState variant={emptyVariant} />
        )}
      </div>
    </>
  );
}
