import { useRef, type CSSProperties, type MouseEvent } from 'react';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../components/Popover';
import type { DragPayload } from '../../data/dnd';
import { isFolderId, type Item, type Placement } from '../../domain/types';
import { setSpawnOrigin } from '../dnd/drag-ghost';
import { useDraggableEntry, useDropTarget } from '../dnd/useDragDrop';
import { itemActions, primaryQuickAction } from '../items/item-actions';
import { formatDate, kindIcon, kindLabel, spaceColorVar } from '../items/item-meta';
import { useRunItemAction } from '../items/useItemActions';
import type { Selection } from '../selection/useSelection';
import { useEntryActions } from '../workspace/useEntryActions';
import { ItemPreview } from './ItemPreview';

export const tileOpenButtonId = (itemId: string) => `cb-tile-open-${itemId}`;

/** Stagger cap: only the first dozen cards animate with a delay (Blueprint 03 §4.4 rule 5). */
const STAGGER_CAP = 11;
/** Dwell before a card accepts a merge drop (card on card → new folder): a quick pass never creates a folder by accident. */
const MERGE_ARM_MS = 260;

interface ItemTileProps {
  item: Item;
  index: number;
  showSpace: boolean;
  /** Level the card sits on; enables drag & drop. Collections (flat views) pass none. */
  placement?: Placement;
  selection?: Selection;
}

/**
 * One item in the Smart Grid or List (DS-C09/C10): identical action grammar in both layouts, only CSS differs.
 * The main button opens the Inspector; quick actions (Copy + "…" menu from the shared action registry, D-006) are siblings,
 * so there are no nested interactive elements. A check toggles the card into the selection; ⌘/Shift-clicks on the card
 * do the same. Dragging a card onto another card creates a folder of both (after a short dwell).
 */
export function ItemTile({ item, index, showSpace, placement, selection }: ItemTileProps) {
  const { state, dispatch, library, freshIds } = usePreview();
  const runAction = useRunItemAction();
  const entries = useEntryActions();
  const inspected = state.inspectedItemId === item.id;
  const checked = selection?.selected.has(item.id) ?? false;
  const quick = primaryQuickAction(item, state.location);
  const actions = itemActions(item, state.location, { organize: !!placement || state.location.type === 'collection' });
  const space = library.getSpace(item.spaceId);
  const tileRef = useRef<HTMLLIElement>(null);
  const drag = useDraggableEntry(item.id, placement);
  const drop = useDropTarget({
    accepts: (payload: DragPayload) => !!placement && !payload.ids.includes(item.id) && payload.ids.every((id) => !isFolderId(id)),
    onDrop: (payload) => {
      if (!placement) return;
      // the new folder grows out of this card's place (BoardGrid layout motion)
      setSpawnOrigin(tileRef.current?.getBoundingClientRect() ?? null);
      void entries.createFolderWith([...payload.ids, item.id], placement);
    },
    armDelay: MERGE_ARM_MS,
    effect: 'merge',
  });

  const onOpen = (event: MouseEvent) => {
    if (selection?.onEntryClick(item.id, event)) return;
    dispatch({ type: 'inspect', itemId: item.id });
  };

  return (
    <li
      ref={tileRef}
      className="cb-tile"
      data-kind={item.kind}
      data-favorite={item.favorite || undefined}
      data-selected={inspected || undefined}
      data-checked={checked || undefined}
      data-fresh={freshIds.has(item.id) || undefined}
      data-dragging={drag.dragging || undefined}
      data-drop={drop.over ? (drop.armed ? 'merge' : 'near') : undefined}
      data-item-id={item.id}
      style={{ '--i': Math.min(index, STAGGER_CAP) } as CSSProperties}
      draggable={drag.draggable || undefined}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...drop.props}
    >
      {inspected && (
        <span className="cb-tile__marker" aria-hidden="true">
          <Icon name="panelRight" size={14} />
        </span>
      )}
      <button
        id={tileOpenButtonId(item.id)}
        type="button"
        className="cb-tile__open"
        aria-current={inspected ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className="cb-tile__preview">
          <ItemPreview item={item} />
        </span>
        <span className="cb-tile__body">
          <span className="cb-tile__title">{item.title}</span>
          <span className="cb-tile__meta">
            <Icon name={kindIcon[item.kind]} size={14} />
            <span>{kindLabel[item.kind]}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
            {showSpace && space && (
              <span className="cb-space-chip" style={{ '--cb-chip': spaceColorVar(space.color) } as CSSProperties}>
                {space.name}
              </span>
            )}
            {item.favorite && (
              <span className="cb-tile__favorite" title="Favorit">
                <Icon name="star" size={14} />
                <span className="cb-visually-hidden">Favorit</span>
              </span>
            )}
          </span>
        </span>
      </button>
      {selection && (
        <button
          type="button"
          className="cb-tile__check"
          role="checkbox"
          aria-checked={checked}
          aria-label={`${item.title} auswählen`}
          onClick={(event) => {
            event.stopPropagation();
            if (event.shiftKey) selection.onEntryClick(item.id, event);
            else selection.toggle(item.id);
          }}
        >
          <Icon name="check" size={14} />
        </button>
      )}
      <div className="cb-tile__actions">
        {/* the primary quick action (copy, else download) leads: filled in the space colour, confirms in place */}
        {quick && (
          <IconButton
            icon={quick.icon}
            size="sm"
            className="cb-tile__primary"
            label={`${item.title}: ${quick.label}`}
            onClick={(event) => runAction(quick, item, event.currentTarget)}
          />
        )}
        <Popover
          label={`${item.title}: Weitere Aktionen`}
          icon="more"
          iconSize={16}
          triggerClassName="cb-icon-button cb-icon-button--subtle cb-icon-button--sm"
          layer
        >
          {(close) => (
            <div className="cb-menu" role="menu" aria-label="Aktionen">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="cb-menu__item"
                  data-danger={action.danger || undefined}
                  onClick={() => {
                    close();
                    runAction(action, item);
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
        <Icon name="folderPlus" size={16} />
        Ordner erstellen
      </span>
    </li>
  );
}
