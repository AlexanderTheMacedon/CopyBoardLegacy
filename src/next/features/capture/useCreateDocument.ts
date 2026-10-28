import { useCallback } from 'react';
import { useCapturePlacement, usePreview } from '../../app/context';
import { createBlankItem, createDocumentItem } from '../../data/capture';
import type { Item } from '../../domain/types';

/** What "Neu erstellen" can make as an editable item; the recorder and the file import reuse the capture flows instead. */
export type CreateSpec = { readonly kind: 'document' | 'text' | 'markdown' } | { readonly kind: 'code'; readonly language: string };

const nothingCreated: Record<CreateSpec['kind'], string> = {
  document: 'Es wurde kein Dokument angelegt.',
  text: 'Es wurde kein Text angelegt.',
  markdown: 'Es wurde kein Markdown angelegt.',
  code: 'Es wurde kein Code angelegt.',
};

/**
 * Creates an empty item where captures would land (open folder, else the capture space's board), commits it, and only
 * then opens it in its Canvas editor. A failed commit announces itself, shows no card and opens nothing. Resolves `true`
 * once the item is saved and open.
 */
export function useCreateItem() {
  const { state, dispatch, workspace, notify, markFresh } = usePreview();
  const placement = useCapturePlacement();

  return useCallback(
    async (spec: CreateSpec): Promise<boolean> => {
      if (!placement || !workspace.persistent) {
        notify(`Lokales Speichern ist in diesem Browser blockiert. ${nothingCreated[spec.kind]}`, { tone: 'error' });
        return false;
      }
      const { spaceId, folderId } = placement;
      const item: Item =
        spec.kind === 'document'
          ? createDocumentItem(spaceId, folderId)
          : spec.kind === 'code'
            ? createBlankItem('code', spaceId, folderId, new Date(), spec.language)
            : createBlankItem(spec.kind, spaceId, folderId);
      try {
        await workspace.add([item]);
      } catch (error) {
        notify(
          error instanceof DOMException && error.name === 'QuotaExceededError'
            ? `Der lokale Speicher ist voll. ${nothingCreated[spec.kind]}`
            : `Speichern ist fehlgeschlagen. ${nothingCreated[spec.kind]}`,
          { tone: 'error' },
        );
        return false;
      }
      if (state.filter !== 'all' && state.filter !== item.kind) dispatch({ type: 'setFilter', filter: 'all' });
      markFresh([item.id]);
      dispatch({ type: 'openComposer', itemId: item.id });
      return true;
    },
    [placement, workspace, notify, markFresh, state.filter, dispatch],
  );
}

/** "Neues Dokument": the writing studio's shortcut of `useCreateItem`. */
export function useCreateDocument() {
  const create = useCreateItem();
  return useCallback(async () => void (await create({ kind: 'document' })), [create]);
}
