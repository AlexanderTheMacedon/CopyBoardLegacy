import { useCallback } from 'react';
import { useCapturePlacement, usePreview } from '../../app/context';
import { createDocumentItem } from '../../data/capture';

/**
 * "Neues Dokument": creates an empty document where captures would land (open folder, else the capture space's board),
 * commits it, and only then opens it in the Canvas. A failed commit announces itself and opens nothing.
 */
export function useCreateDocument() {
  const { state, dispatch, workspace, notify, markFresh } = usePreview();
  const placement = useCapturePlacement();

  return useCallback(async () => {
    if (!placement || !workspace.persistent) {
      notify('Lokales Speichern ist in diesem Browser blockiert. Es wurde kein Dokument angelegt.', { tone: 'error' });
      return;
    }
    const item = createDocumentItem(placement.spaceId, placement.folderId);
    try {
      await workspace.add([item]);
    } catch (error) {
      notify(
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'Der lokale Speicher ist voll. Es wurde kein Dokument angelegt.'
          : 'Speichern ist fehlgeschlagen. Es wurde kein Dokument angelegt.',
        { tone: 'error' },
      );
      return;
    }
    if (state.filter !== 'all' && state.filter !== 'document') dispatch({ type: 'setFilter', filter: 'all' });
    markFresh([item.id]);
    dispatch({ type: 'openComposer', itemId: item.id });
  }, [placement, workspace, notify, markFresh, state.filter, dispatch]);
}
