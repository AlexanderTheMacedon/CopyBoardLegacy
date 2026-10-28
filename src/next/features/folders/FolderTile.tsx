import type { CSSProperties, MouseEvent } from 'react';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { Popover } from '../../components/Popover';
import { SpaceGlyph } from '../../components/SpaceIcon';
import type { DragPayload } from '../../data/dnd';
import { isFolderId, type Folder, type Item, type Placement } from '../../domain/types';
import { useDraggableEntry, useDropTarget } from '../dnd/useDragDrop';
import { ImageSwatch } from '../grid/ItemPreview';
import { excerpt, formatDate, kindIcon, linkParts } from '../items/item-meta';
import type { Selection } from '../selection/useSelection';
import { useEntryActions } from '../workspace/useEntryActions';
import { folderActions, type FolderAction } from './folder-actions';
import { rememberFolderOrigin } from './folder-motion';

export const folderTileButtonId = (id: string) => `cb-folder-open-${id}`;
const STAGGER_CAP = 11;
const PEEK_COUNT = 3;

/** Tiny content peek inside the folder preview: real pixels for images, a glyph with a text hint for the rest. */
function Peek({ item }: { item: Item }) {
  if (item.kind === 'image') return <ImageSwatch item={item} className="cb-folder-peek cb-folder-peek--image" />;
  const text = item.kind === 'text' || item.kind === 'markdown' || item.kind === 'document' ? excerpt(item, 60) : item.kind === 'code' ? item.body.split('\n')[0] : item.kind === 'link' ? linkParts(item.url).host : (item.kind === 'file' ? item.fileName : item.title);
  return (
    <span className="cb-folder-peek" data-kind={item.kind}>
      <Icon name={kindIcon[item.kind]} size={12} />
      <span>{text}</span>
    </span>
  );
}

/** Runs a folder action through the shared entry operations (same code paths as items and the selection bar). */
export function useRunFolderAction() {
  const entries = useEntryActions();
  const { state } = usePreview();
  return (action: FolderAction, folder: Folder, origin?: Element | null) => {
    const ids = state.selectedIds.includes(folder.id) ? state.selectedIds : [folder.id];
    switch (action.id) {
      case 'open':
        rememberFolderOrigin(origin ?? null);
        entries.openFolder(folder.id);
        break;
      case 'rename':
        entries.editFolder(folder.id);
        break;
      case 'new-subfolder':
        entries.openNewFolder({ spaceId: folder.spaceId, folderId: folder.id });
        break;
      case 'move':
        entries.openMove(ids);
        break;
      case 'remove-from-folder':
        void entries.removeFromFolder(ids);
        break;
      case 'duplicate':
        void entries.duplicate(ids);
        break;
      case 'delete':
        entries.requestDelete(ids);
        break;
    }
  };
}

interface FolderTileProps {
  folder: Folder;
  index: number;
  placement: Placement;
  selection?: Selection;
}

/**
 * Folder card: a glass sheet with a peek at up to three contents, the folder's glyph and its counts. Click opens the
 * folder window (growing out of the tile); dropping cards or folders on it moves them inside. Same action grammar as
 * item tiles: check for selection, "…" menu from the folder action registry.
 */
export function FolderTile({ folder, index, placement, selection }: FolderTileProps) {
  const { library, state } = usePreview();
  const entries = useEntryActions();
  const run = useRunFolderAction();
  const children = library.listChildren({ spaceId: folder.spaceId, folderId: folder.id });
  const total = library.folderItems(folder.id).length;
  const checked = selection?.selected.has(folder.id) ?? false;
  const color = folder.color ?? library.getSpace(folder.spaceId)?.color;
  const drag = useDraggableEntry(folder.id, placement);
  const drop = useDropTarget({
    accepts: (payload: DragPayload) => !payload.ids.includes(folder.id) && !payload.ids.some((id) => isFolderId(id) && library.descendantFolders(id).some((f) => f.id === folder.id)),
    onDrop: (payload) => void entries.move(payload.ids, { spaceId: folder.spaceId, folderId: folder.id }),
    armDelay: 80,
  });

  const onOpen = (event: MouseEvent<HTMLButtonElement>) => {
    if (selection?.onEntryClick(folder.id, event)) return;
    run({ id: 'open', label: 'Öffnen', icon: 'folderOpen' }, folder, event.currentTarget);
  };

  const countLabel = total === 1 ? '1 Inhalt' : `${total} Inhalte`;
  const subLabel = children.folders.length ? ` · ${children.folders.length === 1 ? '1 Ordner' : `${children.folders.length} Ordner`}` : '';

  return (
    <li
      className="cb-tile cb-tile--folder"
      data-folder-id={folder.id}
      data-checked={checked || undefined}
      data-dragging={drag.dragging || undefined}
      data-drop={drop.over ? 'into' : undefined}
      data-open={state.openFolderId === folder.id || undefined}
      style={{ '--i': Math.min(index, STAGGER_CAP), '--cb-folder-tint': color ? `var(--cb-space-${color})` : undefined } as CSSProperties}
      draggable
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...drop.props}
    >
      <button id={folderTileButtonId(folder.id)} type="button" className="cb-tile__open cb-folder" onClick={onOpen} aria-label={`Ordner ${folder.name} öffnen, ${countLabel}`}>
        <span className="cb-tile__preview cb-folder__preview">
          <span className="cb-folder__tab" />
          <span className="cb-folder__sheet">
            {children.items.slice(0, PEEK_COUNT).map((item) => (
              <Peek key={item.id} item={item} />
            ))}
            {!children.items.length && children.folders.length > 0 && (
              <span className="cb-folder-peek cb-folder-peek--folders">
                <Icon name="folder" size={12} />
                <span>{children.folders.map((f) => f.name).join(', ')}</span>
              </span>
            )}
            {!total && !children.folders.length && <span className="cb-folder__empty">Leer</span>}
          </span>
          <SpaceGlyph icon={folder.icon ?? 'lucide:folder'} name={folder.name} color={color} size={34} className="cb-folder__glyph" />
        </span>
        <span className="cb-tile__body">
          <span className="cb-tile__title">{folder.name}</span>
          <span className="cb-tile__meta">
            <Icon name="folder" size={14} />
            <span>
              {countLabel}
              {subLabel}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={folder.updatedAt}>{formatDate(folder.updatedAt)}</time>
          </span>
        </span>
      </button>
      {selection && (
        <button
          type="button"
          className="cb-tile__check"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Ordner ${folder.name} auswählen`}
          onClick={(event) => {
            event.stopPropagation();
            if (event.shiftKey) selection.onEntryClick(folder.id, event);
            else selection.toggle(folder.id);
          }}
        >
          <Icon name="check" size={14} />
        </button>
      )}
      <div className="cb-tile__actions">
        <Popover label={`Ordner ${folder.name}: Aktionen`} icon="more" iconSize={16} triggerClassName="cb-icon-button cb-icon-button--subtle cb-icon-button--sm" layer>
          {(close) => (
            <div className="cb-menu" role="menu" aria-label="Ordneraktionen">
              {folderActions(folder).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="cb-menu__item"
                  data-danger={action.danger || undefined}
                  onClick={(event) => {
                    close();
                    run(action, folder, event.currentTarget.closest('.cb-tile'));
                  }}
                >
                  <Icon name={action.icon} size={16} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>
      <span className="cb-tile__drop-hint" aria-hidden="true">
        <Icon name="folderInput" size={16} />
        Hierher verschieben
      </span>
    </li>
  );
}
