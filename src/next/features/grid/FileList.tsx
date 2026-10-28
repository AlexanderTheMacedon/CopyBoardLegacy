import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { SpaceGlyph } from '../../components/SpaceIcon';
import type { DragPayload } from '../../data/dnd';
import { isFolderId, type Folder, type Item, type Placement, type SortMode } from '../../domain/types';
import { useDraggableEntry, useDropTarget } from '../dnd/useDragDrop';
import { useRunFolderAction } from '../folders/FolderTile';
import { fileExtension, formatDateTime, formatDuration, formatSize, kindIcon, kindLabel, linkParts, spaceColorVar } from '../items/item-meta';
import type { Selection } from '../selection/useSelection';
import { useEntryActions } from '../workspace/useEntryActions';
import { ImageSwatch } from './ItemPreview';
import { tileOpenButtonId } from './ItemTile';

/** Short, type-specific detail for the info column. */
function itemInfo(item: Item): string {
  switch (item.kind) {
    case 'image':
      return `${item.width} × ${item.height}${item.asset ? ` · ${formatSize(item.asset.blob.size)}` : ''}`;
    case 'file':
      return `${fileExtension(item.fileName)} · ${formatSize(item.sizeBytes)}`;
    case 'audio':
      return item.durationSec ? formatDuration(item.durationSec) : (item.fileName ?? 'Audio');
    case 'link':
      return linkParts(item.url).host;
    case 'code':
      return `${item.language} · ${item.body.split('\n').length} Zeilen`;
    case 'document':
      return `${item.text.length} Zeichen`;
    default:
      return `${item.body.length} Zeichen`;
  }
}

const columns: readonly { readonly id: 'name' | 'kind' | 'date'; readonly label: string; readonly sorts: readonly SortMode[] }[] = [
  { id: 'name', label: 'Name', sorts: ['name'] },
  { id: 'kind', label: 'Art', sorts: ['kind'] },
  { id: 'date', label: 'Geändert', sorts: ['newest', 'oldest'] },
];

function FolderRow({ folder, placement, selection, showSpace }: { folder: Folder; placement: Placement; selection?: Selection; showSpace: boolean }) {
  const { library, state } = usePreview();
  const entries = useEntryActions();
  const run = useRunFolderAction();
  const checked = selection?.selected.has(folder.id) ?? false;
  const total = library.folderItems(folder.id).length;
  const sub = library.listChildren({ spaceId: folder.spaceId, folderId: folder.id }).folders.length;
  const space = library.getSpace(folder.spaceId);
  const color = folder.color ?? space?.color;
  const drag = useDraggableEntry(folder.id, placement);
  const drop = useDropTarget({
    accepts: (payload: DragPayload) => !payload.ids.includes(folder.id) && !payload.ids.some((id) => isFolderId(id) && library.descendantFolders(id).some((f) => f.id === folder.id)),
    onDrop: (payload) => void entries.move(payload.ids, { spaceId: folder.spaceId, folderId: folder.id }),
    armDelay: 80,
  });
  const open = (event: MouseEvent<HTMLElement>) => {
    if (selection?.onEntryClick(folder.id, event)) return;
    run({ id: 'open', label: 'Öffnen', icon: 'folderOpen' }, folder, event.currentTarget.closest('tr'));
  };
  return (
    <tr
      className="cb-files__row cb-files__row--folder"
      data-folder-id={folder.id}
      data-checked={checked || undefined}
      data-dragging={drag.dragging || undefined}
      data-drop={drop.over ? 'into' : undefined}
      data-open={state.openFolderId === folder.id || undefined}
      draggable
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...drop.props}
    >
      <td className="cb-files__check-cell">
        {selection && (
          <button type="button" className="cb-tile__check" role="checkbox" aria-checked={checked} aria-label={`Ordner ${folder.name} auswählen`} onClick={(e) => (e.shiftKey ? selection.onEntryClick(folder.id, e) : selection.toggle(folder.id))}>
            <Icon name="check" size={14} />
          </button>
        )}
      </td>
      <td className="cb-files__name-cell">
        <button type="button" className="cb-files__name" onClick={open}>
          <SpaceGlyph icon={folder.icon ?? 'lucide:folder'} name={folder.name} color={color} size={28} />
          <span className="cb-files__title">{folder.name}</span>
          <Icon name="chevronRight" size={14} className="cb-files__chevron" />
        </button>
      </td>
      <td className="cb-files__kind">Ordner</td>
      <td className="cb-files__info">
        {total === 1 ? '1 Inhalt' : `${total} Inhalte`}
        {sub ? ` · ${sub === 1 ? '1 Ordner' : `${sub} Ordner`}` : ''}
      </td>
      <td className="cb-files__date">
        <time dateTime={folder.updatedAt}>{formatDateTime(folder.updatedAt)}</time>
      </td>
      {showSpace && (
        <td className="cb-files__space">
          {space && (
            <span className="cb-space-chip" style={{ '--cb-chip': spaceColorVar(space.color) } as CSSProperties}>
              {space.name}
            </span>
          )}
        </td>
      )}
    </tr>
  );
}

function ItemRow({ item, placement, selection, showSpace }: { item: Item; placement?: Placement; selection?: Selection; showSpace: boolean }) {
  const { state, dispatch, library, freshIds } = usePreview();
  const checked = selection?.selected.has(item.id) ?? false;
  const space = library.getSpace(item.spaceId);
  const drag = useDraggableEntry(item.id, placement);
  const open = (event: MouseEvent) => {
    if (selection?.onEntryClick(item.id, event)) return;
    dispatch({ type: 'inspect', itemId: item.id });
  };
  return (
    <tr
      className="cb-files__row"
      data-item-id={item.id}
      data-kind={item.kind}
      data-selected={state.inspectedItemId === item.id || undefined}
      data-checked={checked || undefined}
      data-fresh={freshIds.has(item.id) || undefined}
      data-dragging={drag.dragging || undefined}
      draggable={drag.draggable || undefined}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
    >
      <td className="cb-files__check-cell">
        {selection && (
          <button type="button" className="cb-tile__check" role="checkbox" aria-checked={checked} aria-label={`${item.title} auswählen`} onClick={(e) => (e.shiftKey ? selection.onEntryClick(item.id, e) : selection.toggle(item.id))}>
            <Icon name="check" size={14} />
          </button>
        )}
      </td>
      <td className="cb-files__name-cell">
        <button id={tileOpenButtonId(item.id)} type="button" className="cb-files__name" aria-current={state.inspectedItemId === item.id ? 'true' : undefined} onClick={open}>
          <span className="cb-files__thumb" data-kind={item.kind}>
            {item.kind === 'image' ? <ImageSwatch item={item} className="cb-files__image" /> : <Icon name={kindIcon[item.kind]} size={16} />}
          </span>
          <span className="cb-files__title">{item.title}</span>
          {item.favorite && (
            <span className="cb-tile__favorite" title="Favorit">
              <Icon name="star" size={13} />
            </span>
          )}
        </button>
      </td>
      <td className="cb-files__kind">{kindLabel[item.kind]}</td>
      <td className="cb-files__info">{itemInfo(item)}</td>
      <td className="cb-files__date">
        <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
      </td>
      {showSpace && (
        <td className="cb-files__space">
          {space && (
            <span className="cb-space-chip" style={{ '--cb-chip': spaceColorVar(space.color) } as CSSProperties}>
              {space.name}
            </span>
          )}
        </td>
      )}
    </tr>
  );
}

/**
 * Select-all for the rows shown right now (after filter and search): unchecked or mixed → all visible rows join the
 * selection; all checked → only they leave it. Selections outside the current view are kept either way.
 */
function SelectAllCheck({ ids, selection }: { ids: readonly string[]; selection: Selection }) {
  const { state, dispatch } = usePreview();
  const count = ids.filter((id) => selection.selected.has(id)).length;
  const all = ids.length > 0 && count === ids.length;
  const mixed = count > 0 && !all;
  const onClick = () => {
    const visible = new Set(ids);
    const next = all ? state.selectedIds.filter((id) => !visible.has(id)) : [...state.selectedIds, ...ids.filter((id) => !selection.selected.has(id))];
    dispatch({ type: 'setSelection', ids: next, anchor: null });
  };
  return (
    <button
      type="button"
      className="cb-tile__check cb-files__check-all"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : all}
      aria-label="Alle sichtbaren Einträge auswählen"
      title={all ? 'Auswahl aufheben' : 'Alle auswählen'}
      disabled={!ids.length}
      onClick={onClick}
    >
      <Icon name={mixed ? 'minus' : 'check'} size={14} />
    </button>
  );
}

interface FileListProps {
  folders: readonly Folder[];
  items: readonly Item[];
  label: string;
  placement?: Placement;
  selection?: Selection;
  showSpace: boolean;
}

/**
 * Finder-inspired file view: folders first, then items, with sortable columns. Rows share the tiles' data attributes,
 * so context menus, selection and drag & drop work identically in both presentations.
 */
export function FileList({ folders, items, label, placement, selection, showSpace }: FileListProps) {
  const { state, dispatch } = usePreview();
  const sortFor = (col: (typeof columns)[number]): SortMode => {
    const [primary, secondary] = col.sorts;
    return state.sort === primary && secondary ? secondary : primary!;
  };
  const onRowKey = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.cb-files__name')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div className="cb-files-wrap">
      <table className="cb-files" aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className="cb-files__check-cell">
              {selection ? (
                <SelectAllCheck ids={[...(placement ? folders.map((f) => f.id) : []), ...items.map((i) => i.id)]} selection={selection} />
              ) : (
                <span className="cb-visually-hidden">Auswahl</span>
              )}
            </th>
            {columns.map((col) => {
              const active = col.sorts.includes(state.sort);
              return (
                <th key={col.id} scope="col" aria-sort={active ? (state.sort === 'oldest' ? 'ascending' : 'descending') : undefined}>
                  <button type="button" className="cb-files__sort" data-active={active || undefined} onClick={() => dispatch({ type: 'setSort', sort: sortFor(col) })}>
                    {col.label}
                    {active && <Icon name={state.sort === 'oldest' ? 'chevronUp' : 'chevronDown'} size={13} />}
                  </button>
                </th>
              );
            })}
            <th scope="col" className="cb-files__info" aria-hidden="true" />
            {showSpace && <th scope="col">Space</th>}
          </tr>
        </thead>
        <tbody onKeyDown={onRowKey}>
          {placement && folders.map((folder) => <FolderRow key={folder.id} folder={folder} placement={placement} selection={selection} showSpace={showSpace} />)}
          {items.map((item) => (
            <ItemRow key={item.id} item={item} placement={placement ?? { spaceId: item.spaceId, folderId: item.folderId ?? null }} selection={selection} showSpace={showSpace} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
