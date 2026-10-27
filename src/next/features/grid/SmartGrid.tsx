import type { PointerEvent } from 'react';
import { usePreview } from '../../app/context';
import type { BoardFilter } from '../../app/state';
import type { Item } from '../../domain/types';
import { ItemTile } from './ItemTile';

/** Pointer light: the hovered card gets the pointer position, CSS paints a soft specular highlight and edge light there. */
function trackLight(event: PointerEvent<HTMLUListElement>) {
  if (event.pointerType !== 'mouse') return;
  const card = (event.target as Element).closest<HTMLElement>('.cb-tile__open');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--cb-light-x', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
  card.style.setProperty('--cb-light-y', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
}

/**
 * Ordered grid without masonry (D-005); list mode reuses the same tiles and order (D-023).
 * The list is keyed by view, density and filter so a presentation change replays the "settle into the grid" reveal (M-12);
 * item IDs and order are untouched by that remount.
 */
export function SmartGrid({ items, filter, label }: { items: readonly Item[]; filter: BoardFilter; label: string }) {
  const { state } = usePreview();
  const { view, density } = state.prefs;
  return (
    <ul
      key={`${view}-${density}-${filter}`}
      className="cb-grid"
      data-view={view}
      data-density={density}
      aria-label={label}
      onPointerMove={trackLight}
    >
      {items.map((item, index) => (
        <ItemTile key={item.id} item={item} index={index} showSpace={state.location.type === 'collection'} />
      ))}
    </ul>
  );
}
