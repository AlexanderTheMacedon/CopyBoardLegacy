import { usePreview } from '../../app/context';
import { Icon, type IconName } from '../../components/Icon';
import { usePresence } from '../../components/motion';
import { isFolderId, type Placement } from '../../domain/types';
import { useEntryActions } from '../workspace/useEntryActions';
import type { Selection } from './useSelection';

const EXIT_MS = 200;

interface SelectionBarProps {
  selection: Selection;
  /** Everything currently shown; "Alle auswählen" takes this list. */
  orderedIds: readonly string[];
  /** Level the selection belongs to (new folders are created here). Collections pass none. */
  placement?: Placement;
}

function BarButton({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="cb-selbar__button" data-danger={danger || undefined} onClick={onClick} title={label}>
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </button>
  );
}

/**
 * Floating selection toolbar: appears as soon as one entry is selected, counts the selection and offers the batch actions
 * that make sense here. Every action runs through the shared entry operations, so undo and notices are identical to the
 * single-item paths.
 */
export function SelectionBar({ selection, orderedIds, placement }: SelectionBarProps) {
  const { state, library } = usePreview();
  const entries = useEntryActions();
  // The reducer's array is referentially stable per selection, so the presence hook never loops.
  const ids = state.selectedIds;
  const shown = usePresence(ids.length ? ids : undefined, EXIT_MS);
  const current = shown.value ?? [];
  if (!current.length) return null;

  const items = current.filter((id) => !isFolderId(id));
  const allFavorite = items.length > 0 && items.every((id) => library.getItem(id)?.favorite);
  const allSelected = orderedIds.length > 0 && orderedIds.every((id) => selection.selected.has(id));
  // A folder from a selection needs one level to live on: the current level, or the first selected item's level.
  const first = items[0] ? library.getItem(items[0]) : undefined;
  const folderHome: Placement | undefined = placement ?? (first ? { spaceId: first.spaceId, folderId: first.folderId ?? null } : undefined);
  const canMakeFolder = !!folderHome && current.length >= 1;
  const deletable = current.some((id) => isFolderId(id) || library.getItem(id)?.origin === 'local');

  return (
    <div className="cb-selbar" role="toolbar" aria-label="Auswahl" data-leaving={shown.leaving || undefined} inert={shown.leaving}>
      <p className="cb-selbar__count" aria-live="polite">
        <span className="cb-selbar__num">{current.length}</span> ausgewählt
      </p>
      {!allSelected && <BarButton icon="checkSquare" label="Alle auswählen" onClick={selection.selectAll} />}
      <span className="cb-selbar__divider" aria-hidden="true" />
      <BarButton icon="folderInput" label="Verschieben" onClick={() => entries.openMove(current)} />
      {canMakeFolder && folderHome && <BarButton icon="folderPlus" label="Neuer Ordner" onClick={() => entries.openNewFolder(folderHome, current)} />}
      <BarButton icon="copyPlus" label="Duplizieren" onClick={() => void entries.duplicate(current)} />
      {items.length > 0 && <BarButton icon="star" label={allFavorite ? 'Favorit entfernen' : 'Favorisieren'} onClick={() => void entries.favorite(items, !allFavorite)} />}
      {deletable && <BarButton icon="trash" label="Löschen" danger onClick={() => entries.requestDelete(current)} />}
      <span className="cb-selbar__divider" aria-hidden="true" />
      <button type="button" className="cb-selbar__close" aria-label="Auswahl aufheben" title="Auswahl aufheben (Esc)" onClick={selection.clear}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
