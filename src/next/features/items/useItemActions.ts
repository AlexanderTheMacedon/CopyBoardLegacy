import { useCallback } from 'react';
import { usePreview } from '../../app/context';
import { ClipboardAccessError, writeItemToClipboard } from '../../data/clipboard';
import { extensionOf, nativeExportType, renderImageFile } from '../../data/image-render';
import { isLocal, type ImageItem, type Item } from '../../domain/types';
import { downloadBlob, safeFileName } from '../composer/editor-types';
import { useEntryActions } from '../workspace/useEntryActions';
import { isEditedImage, type ItemAction } from './item-actions';

/** Saves a captured binary through a temporary object URL; nothing leaves the device. */
function download(item: Item) {
  if (!(item.kind === 'image' || item.kind === 'file' || item.kind === 'audio') || !item.asset) return;
  downloadBlob(item.kind === 'image' ? item.title : (item.fileName ?? item.title), item.asset.blob);
}

/** An edited image downloads as a fresh rendition in the original's format (where writable); the original stays as it is. */
async function downloadEdited(item: ImageItem): Promise<void> {
  const type = nativeExportType(item);
  const file = await renderImageFile(item, type);
  downloadBlob(safeFileName(item.title.replace(/\.(png|jpe?g|webp|gif|avif|heic)$/i, ''), extensionOf(type)), file.blob);
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
/** Short success state on a control (`data-done`, CSS plays the icon's confirmation); a no-op for a detached element. */
function markDone(el: HTMLElement | null) {
  if (!el?.isConnected) return;
  el.setAttribute('data-done', '');
  window.setTimeout(() => el.removeAttribute('data-done'), 1400);
}

export function useRunItemAction() {
  const { state, dispatch, notify } = usePreview();
  const entries = useEntryActions();
  return useCallback(
    (action: ItemAction, item: Item, source?: HTMLElement | null) => {
      const ids = state.selectedIds.includes(item.id) ? state.selectedIds : [item.id];
      switch (action.id) {
        case 'open':
          dispatch({ type: 'inspect', itemId: item.id });
          break;
        case 'open-link':
          if (item.kind === 'link') openLink(item.url);
          break;
        case 'copy': {
          // the control that asked for the copy confirms it with its own icon, once the clipboard took it
          // (passed in where known: Safari does not focus a clicked button)
          const trigger = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
          writeItemToClipboard(item).then(
            () => {
              markDone(trigger);
              notify('In die Zwischenablage kopiert', { tone: 'success' });
            },
            (error: unknown) =>
              notify(
                error instanceof ClipboardAccessError && error.reason === 'denied'
                  ? 'Der Browser hat den Zugriff auf die Zwischenablage abgelehnt.'
                  : 'Kopieren wird von diesem Browser nicht unterstützt.',
                { tone: 'error' },
              ),
          );
          break;
        }
        case 'download':
          if (item.kind === 'image' && isEditedImage(item))
            downloadEdited(item).catch(() => notify('Das bearbeitete Bild konnte nicht erzeugt werden. Das Original ist unverändert.', { tone: 'error' }));
          else download(item);
          break;
        case 'download-original':
          download(item);
          break;
        case 'open-composer':
          dispatch({ type: 'openComposer', itemId: item.id });
          break;
        case 'open-studio':
          // never converted silently: the dialog explains the change and asks first
          dispatch({ type: 'openModal', modal: { kind: 'convert-to-document', itemId: item.id } });
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
