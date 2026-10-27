import { useCallback } from 'react';
import { usePreview } from '../../app/context';
import { ClipboardAccessError, writeItemToClipboard } from '../../data/clipboard';
import { isLocal, type Item } from '../../domain/types';
import { useEntryActions } from '../workspace/useEntryActions';
import type { ItemAction } from './item-actions';

/** Saves a captured binary through a temporary object URL; nothing leaves the device. */
function download(item: Item) {
  if (!(item.kind === 'image' || item.kind === 'file' || item.kind === 'audio') || !item.asset) return;
  const url = URL.createObjectURL(item.asset.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = item.kind === 'image' ? item.title : (item.fileName ?? item.title);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** User links open in a new tab without opener or referrer; only http(s) ever reaches this point (classify.isWebUrl). */
function openLink(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.click();
}

/**
 * Executes a registry action for one item. When the item is part of the current selection, organising actions apply to
 * the whole selection (like Finder). Writes resolve after the local commit; failures are reported, never hidden.
 */
export function useRunItemAction() {
  const { state, dispatch, notify } = usePreview();
  const entries = useEntryActions();
  return useCallback(
    (action: ItemAction, item: Item) => {
      const ids = state.selectedIds.includes(item.id) ? state.selectedIds : [item.id];
      switch (action.id) {
        case 'open':
          dispatch({ type: 'inspect', itemId: item.id });
          break;
        case 'open-link':
          if (item.kind === 'link') openLink(item.url);
          break;
        case 'copy':
          writeItemToClipboard(item).then(
            () => notify('In die Zwischenablage kopiert', { tone: 'success' }),
            (error: unknown) =>
              notify(
                error instanceof ClipboardAccessError && error.reason === 'denied'
                  ? 'Der Browser hat den Zugriff auf die Zwischenablage abgelehnt.'
                  : 'Kopieren wird von diesem Browser nicht unterstützt.',
                { tone: 'error' },
              ),
          );
          break;
        case 'download':
          download(item);
          break;
        case 'open-composer':
          dispatch({ type: 'openComposer', itemId: item.id });
          break;
        case 'favorite':
          void entries.favorite(ids, !item.favorite);
          break;
        case 'move':
          entries.openMove(ids);
          break;
        case 'new-folder':
          entries.openNewFolder({ spaceId: item.spaceId, folderId: item.folderId ?? null }, ids);
          break;
        case 'remove-from-folder':
          void entries.removeFromFolder(ids);
          break;
        case 'duplicate':
          void entries.duplicate(ids);
          break;
        case 'reveal-in-space':
          dispatch({ type: 'navigate', location: { type: 'space', spaceId: item.spaceId } });
          if (item.folderId) dispatch({ type: 'openFolder', folderId: item.folderId });
          dispatch({ type: 'inspect', itemId: item.id });
          break;
        case 'delete':
          if (!isLocal(item) && ids.length === 1) break;
          entries.requestDelete(ids);
          break;
      }
    },
    [state.selectedIds, dispatch, notify, entries],
  );
}
