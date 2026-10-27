import { useCallback, useMemo } from 'react';
import { usePreview } from '../../app/context';
import type { DeletedBundle } from '../../app/operations';
import { isFolderId, type FolderId, type Placement } from '../../domain/types';

/**
 * The one place that runs organising operations for single entries, context menus, the selection bar and drag & drop:
 * move, duplicate, delete (with confirmation and undo), favourites, folders. Every write resolves after the local commit;
 * failures are reported, never hidden.
 */
export function useEntryActions() {
  const { state, dispatch, library, workspace, notify } = usePreview();

  const failed = useCallback((message: string) => () => notify(message, { tone: 'error' }), [notify]);

  const describe = useCallback(
    (ids: readonly string[]): string => {
      const folders = ids.filter(isFolderId).length;
      const items = ids.length - folders;
      if (ids.length === 1) {
        const id = ids[0]!;
        const name = isFolderId(id) ? library.getFolder(id)?.name : library.getItem(id)?.title;
        return name ? `„${name}“` : '1 Eintrag';
      }
      const parts: string[] = [];
      if (items) parts.push(items === 1 ? '1 Inhalt' : `${items} Inhalte`);
      if (folders) parts.push(folders === 1 ? '1 Ordner' : `${folders} Ordner`);
      return parts.join(' und ');
    },
    [library],
  );

  const placementLabel = useCallback(
    (to: Placement): string => {
      const space = library.getSpace(to.spaceId)?.name ?? 'Space';
      const folder = to.folderId ? library.getFolder(to.folderId)?.name : undefined;
      return folder ? `${space} › ${folder}` : space;
    },
    [library],
  );

  /** Drops the selection entries that no longer exist (after a move away or a delete). */
  const pruneSelection = useCallback(
    (removed: readonly string[]) => {
      if (state.selectedIds.some((id) => removed.includes(id))) dispatch({ type: 'setSelection', ids: state.selectedIds.filter((id) => !removed.includes(id)), anchor: null });
    },
    [dispatch, state.selectedIds],
  );

  const move = useCallback(
    async (ids: readonly string[], to: Placement, { silent = false } = {}): Promise<boolean> => {
      try {
        const result = await workspace.moveEntries(ids, to);
        if (result.skipped.length && !result.moved) {
          notify(ids.some(isFolderId) ? 'Ein Ordner kann nicht in sich selbst oder einen seiner Unterordner verschoben werden.' : 'Verschieben ist hier nicht möglich.', { tone: 'error' });
          return false;
        }
        // Entries leave the visible level: they also leave the selection.
        const current = state.openFolderId ?? null;
        if (to.folderId !== current || (state.location.type === 'space' && to.spaceId !== state.location.spaceId)) dispatch({ type: 'clearSelection' });
        if (!silent) notify(`${describe(ids.slice(0, result.moved))} verschoben nach ${placementLabel(to)}`, { tone: 'success' });
        return true;
      } catch {
        notify('Verschieben ist fehlgeschlagen. Nichts wurde geändert.', { tone: 'error' });
        return false;
      }
    },
    [workspace, notify, describe, placementLabel, dispatch, state.openFolderId, state.location],
  );

  const duplicate = useCallback(
    async (ids: readonly string[]) => {
      try {
        const { items, folders } = await workspace.duplicateEntries(ids);
        const created = [...items.filter((i) => !i.folderId || i.folderId === state.openFolderId).map((i) => i.id), ...folders.filter((f) => f.parentId === (state.openFolderId ?? null)).map((f) => f.id)];
        dispatch({ type: 'setSelection', ids: created.length ? created : [], anchor: null });
        notify(`${describe(ids)} dupliziert`, { tone: 'success' });
      } catch {
        notify('Duplizieren ist fehlgeschlagen. Nichts wurde geändert.', { tone: 'error' });
      }
    },
    [workspace, notify, describe, dispatch, state.openFolderId],
  );

  const restore = useCallback(
    (bundle: DeletedBundle) => workspace.restore(bundle).catch(failed('Wiederherstellen ist fehlgeschlagen.')),
    [workspace, failed],
  );

  /** Executes a delete. Local items and folders go; fixture items stay and are reported. One undo restores everything. */
  const deleteNow = useCallback(
    async (ids: readonly string[]) => {
      const label = describe(ids);
      if (state.composerItemId && ids.includes(state.composerItemId)) dispatch({ type: 'closeComposer' });
      if (state.inspectedItemId && ids.includes(state.inspectedItemId)) dispatch({ type: 'closeInspector' });
      if (state.openFolderId && (ids.includes(state.openFolderId) || library.folderPath(state.openFolderId).some((f) => ids.includes(f.id)))) dispatch({ type: 'openFolder', folderId: null });
      try {
        const bundle = await workspace.deleteEntries(ids);
        pruneSelection(ids);
        const removed = bundle.items.length + bundle.folders.length;
        if (!removed) {
          notify('Beispielinhalte lassen sich nicht löschen. Sie bleiben erhalten.');
          return;
        }
        const kept = bundle.keptFixtures ? ` · ${bundle.keptFixtures} Beispielinhalte bleiben erhalten` : '';
        notify(`${label} gelöscht${kept}`, { tone: 'success', action: { label: 'Rückgängig', run: () => void restore(bundle) } });
      } catch {
        notify('Löschen ist fehlgeschlagen. Der Inhalt ist unverändert.', { tone: 'error' });
      }
    },
    [describe, state.composerItemId, state.inspectedItemId, state.openFolderId, dispatch, library, workspace, pruneSelection, notify, restore],
  );

  /** A single own item deletes at once (undo covers it); folders and multi-selections ask first. */
  const requestDelete = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 1 && !isFolderId(ids[0]!)) void deleteNow(ids);
      else dispatch({ type: 'openModal', modal: { kind: 'confirm-delete', entryIds: ids } });
    },
    [deleteNow, dispatch],
  );

  const favorite = useCallback(
    async (ids: readonly string[], value: boolean) => {
      const itemIds = ids.filter((id) => !isFolderId(id));
      try {
        await workspace.setFavorites(itemIds, value);
        notify(itemIds.length === 1 ? (value ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt') : value ? `${itemIds.length} Inhalte favorisiert` : `${itemIds.length} Inhalte aus Favoriten entfernt`, { tone: 'success' });
      } catch {
        notify('Favorit konnte nicht gespeichert werden.', { tone: 'error' });
      }
    },
    [workspace, notify],
  );

  const openFolder = useCallback((id: FolderId | null) => dispatch({ type: 'openFolder', folderId: id }), [dispatch]);

  /** Moves entries one level up: out of the open folder to its parent, or out of their own folder to the board. */
  const removeFromFolder = useCallback(
    (ids: readonly string[]) => {
      const first = ids[0];
      if (!first) return;
      const entry = isFolderId(first) ? library.getFolder(first) : library.getItem(first);
      if (!entry) return;
      const container = isFolderId(first) ? library.getFolder(first)?.parentId : library.getItem(first)?.folderId;
      const parent = container ? library.getFolder(container)?.parentId ?? null : null;
      return move(ids, { spaceId: entry.spaceId, folderId: parent });
    },
    [library, move],
  );

  const openMove = useCallback((ids: readonly string[]) => dispatch({ type: 'openModal', modal: { kind: 'move', entryIds: ids } }), [dispatch]);

  const openNewFolder = useCallback(
    (placement: Placement, entryIds?: readonly string[]) => dispatch({ type: 'openModal', modal: { kind: 'folder-new', placement, entryIds } }),
    [dispatch],
  );

  /** Creates a folder holding the given entries right away (drop card on card); it opens the rename dialog afterwards. */
  const createFolderWith = useCallback(
    async (ids: readonly string[], placement: Placement, name = 'Neuer Ordner') => {
      try {
        const { folder, moved } = await workspace.createFolder({ spaceId: placement.spaceId, parentId: placement.folderId, name }, ids);
        dispatch({ type: 'setSelection', ids: [], anchor: null });
        notify(`Ordner mit ${moved === 1 ? '1 Eintrag' : `${moved} Einträgen`} erstellt`, { tone: 'success', action: { label: 'Benennen', run: () => dispatch({ type: 'openModal', modal: { kind: 'folder-edit', folderId: folder.id } }) } });
        return folder;
      } catch {
        notify('Der Ordner konnte nicht erstellt werden. Nichts wurde geändert.', { tone: 'error' });
        return null;
      }
    },
    [workspace, dispatch, notify],
  );

  const editFolder = useCallback((id: FolderId) => dispatch({ type: 'openModal', modal: { kind: 'folder-edit', folderId: id } }), [dispatch]);

  return useMemo(
    () => ({ describe, placementLabel, move, duplicate, deleteNow, requestDelete, restore, favorite, openFolder, removeFromFolder, openMove, openNewFolder, createFolderWith, editFolder }),
    [describe, placementLabel, move, duplicate, deleteNow, requestDelete, restore, favorite, openFolder, removeFromFolder, openMove, openNewFolder, createFolderWith, editFolder],
  );
}

export type EntryActions = ReturnType<typeof useEntryActions>;
