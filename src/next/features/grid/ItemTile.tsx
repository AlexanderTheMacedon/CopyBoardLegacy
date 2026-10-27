import type { CSSProperties } from 'react';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../components/Popover';
import type { Item } from '../../domain/types';
import { itemActions, primaryQuickAction } from '../items/item-actions';
import { formatDate, kindIcon, kindLabel, spaceColorVar } from '../items/item-meta';
import { useRunItemAction } from '../items/useItemActions';
import { ItemPreview } from './ItemPreview';

export const tileOpenButtonId = (itemId: string) => `cb-tile-open-${itemId}`;

/** Stagger cap: only the first dozen cards animate with a delay (Blueprint 03 §4.4 rule 5). */
const STAGGER_CAP = 11;

/**
 * One item in the Smart Grid or List (DS-C09/C10): identical action grammar in both layouts, only CSS differs.
 * The main button opens the Inspector; quick actions (Copy + "…" menu from the shared action registry, D-006) are siblings,
 * so there are no nested interactive elements.
 */
export function ItemTile({ item, index, showSpace }: { item: Item; index: number; showSpace: boolean }) {
  const { state, dispatch, library, freshIds } = usePreview();
  const runAction = useRunItemAction();
  const selected = state.inspectedItemId === item.id;
  const quick = primaryQuickAction(item, state.location);
  const actions = itemActions(item, state.location);
  const space = library.getSpace(item.spaceId);

  return (
    <li
      className="cb-tile"
      data-kind={item.kind}
      data-selected={selected || undefined}
      data-fresh={freshIds.has(item.id) || undefined}
      data-item-id={item.id}
      style={{ '--i': Math.min(index, STAGGER_CAP) } as CSSProperties}
    >
      {selected && (
        <span className="cb-tile__marker" aria-hidden="true">
          <Icon name="panelRight" size={14} />
        </span>
      )}
      <button
        id={tileOpenButtonId(item.id)}
        type="button"
        className="cb-tile__open"
        aria-current={selected ? 'true' : undefined}
        onClick={() => dispatch({ type: 'inspect', itemId: item.id })}
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
      <div className="cb-tile__actions">
        {quick && (
          <IconButton
            icon={quick.icon}
            size="sm"
            variant="subtle"
            label={`${item.title}: ${quick.label}`}
            onClick={() => runAction(quick, item)}
          />
        )}
        <Popover
          label={`${item.title}: Weitere Aktionen`}
          icon="more"
          iconSize={16}
          triggerClassName="cb-icon-button cb-icon-button--subtle cb-icon-button--sm"
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
    </li>
  );
}
