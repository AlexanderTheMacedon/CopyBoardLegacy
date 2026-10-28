import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReadOnlyLibrary } from '../domain/library';
import type { ItemId, Location } from '../domain/types';
import type { UiAction } from './state';
import { AppShell } from '../features/shell/AppShell';
import { departBoard, replacesBoard } from '../features/shell/board-departure';
import { NoticeRegion, type Notice } from '../features/shell/NoticeRegion';
import { PreviewProvider, type NoticeOptions, type PreviewContextValue } from './context';
import { restorePreferences } from './preferences';
import { createInitialState, uiReducer } from './state';
import { useWorkspace, type WorkspaceSeed } from './workspace';

const NOTICE_MS = 6000;
const NOTICE_SUCCESS_MS = 4200;
const FRESH_MS = 2400;

interface AppProps {
  /** Synthetic base content (fixtures). */
  library: ReadOnlyLibrary;
  /** Local store + its loaded snapshot; without it nothing can be saved and captures say so. */
  seed?: WorkspaceSeed;
  initialLocation?: Location;
}

export function App({ library: base, seed = { store: null }, initialLocation }: AppProps) {
  const workspace = useWorkspace(base, seed);
  const { library } = workspace;
  const [state, rawDispatch] = useReducer(uiReducer, undefined, () => {
    const location = initialLocation ?? { type: 'space', spaceId: library.spaces[0]?.id ?? '' };
    return createInitialState(location, restorePreferences(workspace.savedPrefs), location.type === 'space' ? library.getSpace(location.spaceId) : undefined);
  });
  // Navigating into a space applies that space's own view defaults; callers never have to look the space up.
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatch = useCallback((action: UiAction) => {
    // a change of what the board shows lets the current board leave visibly before the new one settles in
    if (replacesBoard(action, stateRef.current)) departBoard();
    rawDispatch(action.type === 'navigate' && action.location.type === 'space' && !action.space ? { ...action, space: libraryRef.current.getSpace(action.location.spaceId) } : action);
  }, []);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<ItemId>>(() => new Set());

  const notify = useCallback(
    (message: string, options?: NoticeOptions) => setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, message, ...options })),
    [],
  );

  const markFresh = useCallback((ids: readonly ItemId[]) => {
    setFreshIds((prev) => new Set([...prev, ...ids]));
    setTimeout(() => setFreshIds((prev) => new Set([...prev].filter((id) => !ids.includes(id)))), FRESH_MS);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === 'success' && !notice.action ? NOTICE_SUCCESS_MS : NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Explicit preference changes persist; the first render (restored values) is not written back.
  const restored = useRef(state.prefs);
  const { savePrefs } = workspace;
  useEffect(() => {
    if (state.prefs === restored.current) return;
    savePrefs(state.prefs).catch(() => {});
  }, [state.prefs, savePrefs]);

  const value = useMemo<PreviewContextValue>(
    () => ({ state, dispatch, library, workspace, notify, freshIds, markFresh }),
    [state, library, workspace, notify, freshIds, markFresh],
  );

  return (
    <PreviewProvider value={value}>
      <AppShell>
        <NoticeRegion notice={notice} onDismiss={() => setNotice(null)} />
      </AppShell>
    </PreviewProvider>
  );
}
