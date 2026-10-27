import { useMemo, type PointerEvent } from 'react';
import { usePreview } from '../../app/context';
import type { BoardFilter } from '../../app/state';
import type { Folder, Item, Placement } from '../../domain/types';
import { FolderTile } from '../folders/FolderTile';
import type { Selection } from '../selection/useSelection';
import { FileList } from './FileList';
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

export interface BoardGridProps {
  folders: readonly Folder[];
  items: readonly Item[];
  filter: BoardFilter;
  label: string;
  /** Level shown (board of a space or a folder); absent for flat collections. */
  placement?: Placement;
  selection?: Selection;
  showSpace?: boolean;
}

/** Ordered ids of everything shown, folders first — the basis for Shift-ranges and "Alle auswählen". */
export const useOrderedIds = (folders: readonly Folder[], items: readonly Item[]) =>
  useMemo(() => [...folders.map((f) => f.id), ...items.map((i) => i.id)], [folders, items]);

/**
 * One level of content in three presentations: ordered card grid without masonry (D-005), card list (D-023) or the
 * Finder-style file list. Folders come first. The grid is keyed by view, density and filter so a presentation change
 * replays the "settle into the grid" reveal (M-12); ids, order and selection are untouched by that remount.
 */
export function BoardGrid({ folders, items, filter, label, placement, selection, showSpace = false }: BoardGridProps) {
  const { state } = usePreview();
  const { view, density } = state;
  if (view === 'files') return <FileList folders={folders} items={items} label={label} placement={placement} selection={selection} showSpace={showSpace} />;
  return (
    <ul
      key={`${view}-${density}-${filter}`}
      className="cb-grid"
      data-view={view}
      data-density={density}
      aria-label={label}
      onPointerMove={trackLight}
    >
      {placement && folders.map((folder, index) => <FolderTile key={folder.id} folder={folder} index={index} placement={placement} selection={selection} />)}
      {items.map((item, index) => (
        <ItemTile key={item.id} item={item} index={index + folders.length} showSpace={showSpace} placement={placement ?? (state.location.type === 'collection' ? { spaceId: item.spaceId, folderId: item.folderId ?? null } : undefined)} selection={selection} />
      ))}
    </ul>
  );
}
