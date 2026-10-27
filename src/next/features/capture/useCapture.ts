import { useCallback } from 'react';
import { useCapturePlacement, useOpenFolder, usePreview } from '../../app/context';
import { buildItems, CaptureTooLargeError } from '../../data/capture';
import { pickSources, referencesImageOnly, type RawClipboard } from '../../data/classify';
import type { Item } from '../../domain/types';
import { tileOpenButtonId } from '../grid/ItemTile';
import { kindLabel } from '../items/item-meta';

const failureMessage = (error: unknown): string => {
  if (error instanceof CaptureTooLargeError) return `„${error.fileName}“ ist größer als 64 MB und wurde nicht übernommen.`;
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return 'Der lokale Speicher ist voll. Es wurde nichts übernommen.';
  return 'Speichern ist fehlgeschlagen. Es wurde nichts übernommen.';
};

const savedLabel = (items: readonly Item[]): string => {
  const first = items[0];
  return items.length === 1 && first ? `${kindLabel[first.kind]} gespeichert` : `${items.length} Inhalte gespeichert`;
};

/**
 * The single capture pipeline behind Universal Paste, drop, the file picker, the capture bar and the context menu:
 * detect → build → commit to the local store → show the card. Success is announced only after the commit.
 * While a folder window is open, captures land in that folder; otherwise on the board of the capture space.
 * Resolves to `true` when something was saved.
 */
export function useCapture() {
  const { state, dispatch, workspace, library, notify, markFresh } = usePreview();
  const placement = useCapturePlacement();
  const folder = useOpenFolder();

  return useCallback(
    async (raw: RawClipboard): Promise<boolean> => {
      const sources = pickSources(raw);
      if (!sources.length) {
        notify(
          referencesImageOnly(raw)
            ? 'Die Zwischenablage enthält nur einen Verweis auf ein Bild, keine Bilddaten. Kopiere das Bild selbst und füge es erneut ein.'
            : 'Die Zwischenablage ist leer oder enthält kein unterstütztes Format.',
        );
        return false;
      }
      const space = placement ? library.getSpace(placement.spaceId) : undefined;
      if (!space || !placement || !workspace.persistent) {
        notify('Lokales Speichern ist in diesem Browser blockiert. Es wurde nichts übernommen.', { tone: 'error' });
        return false;
      }
      try {
        const favorite = state.location.type === 'collection' && state.location.collectionId === 'favorites';
        const built = await buildItems(sources, space.id, favorite);
        const items = placement.folderId ? built.map((item) => ({ ...item, folderId: placement.folderId })) : built;
        await workspace.add(items);
        // A kind filter that would hide the new card steps back to "Alle".
        if (state.filter !== 'all' && !items.every((i) => (state.filter === 'favorites' ? i.favorite : i.kind === state.filter)))
          dispatch({ type: 'setFilter', filter: 'all' });
        markFresh(items.map((i) => i.id));
        requestAnimationFrame(() => {
          const first = items[0];
          if (first) document.getElementById(tileOpenButtonId(first.id))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        const target = placement.folderId && folder ? `${space.name} › ${folder.name}` : space.name;
        notify(`${savedLabel(items)} · ${target}`, {
          tone: 'success',
          action: {
            label: 'Rückgängig',
            run: () => {
              Promise.all(items.map((i) => workspace.remove(i))).catch(() =>
                notify('Rückgängig ist fehlgeschlagen. Die Inhalte sind weiterhin gespeichert.', { tone: 'error' }),
              );
            },
          },
        });
        return true;
      } catch (error) {
        notify(failureMessage(error), { tone: 'error' });
        return false;
      }
    },
    [state.location, state.filter, dispatch, placement, folder, library, workspace, notify, markFresh],
  );
}
