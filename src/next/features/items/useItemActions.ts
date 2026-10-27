import { useCallback } from 'react';
import { usePreview } from '../../app/context';
import { ClipboardAccessError, writeItemToClipboard } from '../../data/clipboard';
import { isLocal, type Item } from '../../domain/types';
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

/** Executes a registry action. Writes resolve after the local commit; failures are reported, never hidden. */
export function useRunItemAction() {
  const { state, dispatch, workspace, notify } = usePreview();
  return useCallback(
    (action: ItemAction, item: Item) => {
      const failed = (message: string) => () => notify(message, { tone: 'error' });
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
          workspace
            .setFavorite(item, !item.favorite)
            .then(() => notify(item.favorite ? 'Aus Favoriten entfernt' : 'Zu Favoriten hinzugefügt', { tone: 'success' }), failed('Favorit konnte nicht gespeichert werden.'));
          break;
        case 'reveal-in-space':
          dispatch({ type: 'navigate', location: { type: 'space', spaceId: item.spaceId } });
          dispatch({ type: 'inspect', itemId: item.id });
          break;
        case 'delete':
          if (!isLocal(item)) break;
          if (state.composerItemId === item.id) dispatch({ type: 'closeComposer' });
          if (state.inspectedItemId === item.id || state.composerItemId === item.id) dispatch({ type: 'closeInspector' });
          workspace.remove(item).then(
            () =>
              notify(`„${item.title}“ gelöscht`, {
                tone: 'success',
                action: { label: 'Rückgängig', run: () => void workspace.add([item]).catch(failed('Wiederherstellen ist fehlgeschlagen.')) },
              }),
            failed('Löschen ist fehlgeschlagen. Der Inhalt ist unverändert.'),
          );
          break;
      }
    },
    [state.composerItemId, state.inspectedItemId, dispatch, workspace, notify],
  );
}
