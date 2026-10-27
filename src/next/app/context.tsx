import { createContext, useContext, type Dispatch, type ReactNode } from 'react';
import type { ReadOnlyLibrary } from '../domain/library';
import type { Folder, Item, ItemId, Placement, Space } from '../domain/types';
import type { UiAction, UiState } from './state';
import type { Workspace } from './workspace';

export type NoticeTone = 'info' | 'success' | 'error';

export interface NoticeOptions {
  readonly tone?: NoticeTone;
  /** One optional follow-up, e.g. "Rückgängig". */
  readonly action?: { readonly label: string; readonly run: () => void };
}

export interface PreviewContextValue {
  readonly state: UiState;
  readonly dispatch: Dispatch<UiAction>;
  /** Fixtures + the user's stored items (read side). */
  readonly library: ReadOnlyLibrary;
  /** Write side; every method resolves only after the local store committed. */
  readonly workspace: Workspace;
  /**
   * Polite status message. `success` is only ever used after a confirmed commit (Truthful Status Contract, Blueprint 04 §5.2).
   */
  readonly notify: (message: string, options?: NoticeOptions) => void;
  /** Items captured a moment ago; their cards play a short arrival highlight. */
  readonly freshIds: ReadonlySet<ItemId>;
  readonly markFresh: (ids: readonly ItemId[]) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ value, children }: { value: PreviewContextValue; children: ReactNode }) {
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewContextValue {
  const value = useContext(PreviewContext);
  if (!value) throw new Error('usePreview must be used inside <PreviewProvider>');
  return value;
}

/** The space of the current location, or `undefined` for global collections. */
export function useActiveSpace(): Space | undefined {
  const { state, library } = usePreview();
  return state.location.type === 'space' ? library.getSpace(state.location.spaceId) : undefined;
}

/** The folder open in the folder window, if any (and still existing). */
export function useOpenFolder(): Folder | undefined {
  const { state, library } = usePreview();
  return state.openFolderId ? library.getFolder(state.openFolderId) : undefined;
}

/** Space that receives new captures: the open folder's space, else the open space, else the last visited one, else the first. */
export function useCaptureSpace(): Space | undefined {
  const { state, library } = usePreview();
  const folder = useOpenFolder();
  const id = folder?.spaceId ?? (state.location.type === 'space' ? state.location.spaceId : state.lastSpaceId);
  return (id ? library.getSpace(id) : undefined) ?? library.spaces[0];
}

/** Where new captures and new folders land: inside the open folder, else on the capture space's board. */
export function useCapturePlacement(): Placement | undefined {
  const space = useCaptureSpace();
  const folder = useOpenFolder();
  if (!space) return undefined;
  return { spaceId: space.id, folderId: folder && folder.spaceId === space.id ? folder.id : null };
}

export function useInspectedItem(): Item | undefined {
  const { state, library } = usePreview();
  return state.inspectedItemId ? library.getItem(state.inspectedItemId) : undefined;
}
