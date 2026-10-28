import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type RefObject } from 'react';
import { isEditableTarget, isPasteShortcut, useMediaQuery } from '../../app/hooks';
import { useInspectedItem, usePreview } from '../../app/context';
import { usePresence, useScrollFade } from '../../components/motion';
import { spaceColorVar } from '../../components/SpaceIcon';
import { readTransfer, transferHasFiles } from '../../data/clipboard';
import { isInternalDrag } from '../../data/dnd';
import { useCapture } from '../capture/useCapture';
import { ComposerDock } from '../capture/ComposerDock';
import { ContextMenu } from '../context-menu/ContextMenu';
import { Composer } from '../composer/Composer';
import { WorkspaceDialogs } from '../dialogs/WorkspaceDialogs';
import { useDragActive } from '../dnd/useDragDrop';
import { FolderLayer } from '../folders/FolderWindow';
import { Inspector, INSPECTOR_DEFAULT_WIDTH } from '../inspector/Inspector';
import { RecorderShell } from '../recorder/RecorderShell';
import { SearchPalette } from '../search/SearchPalette';
import { SettingsStudio } from '../settings/SettingsStudio';
import { AmbientScene, leaveCinema } from './AmbientScene';
import { Board } from './Board';
import { Dock } from './Dock';
import { MobileDock } from './MobileDock';
import { SpacesDrawer } from './SpacesDrawer';

/** Exit window of the inspector: matches `--cb-dur-exit` + a frame of slack. */
const INSPECTOR_EXIT_MS = 240;

/** A modal layer (search, settings, drawer, image mode) owns keyboard and drop while it is open. */
const modalOpen = () => !!document.querySelector('dialog[open], .cb-app[data-cinema]');
/** Dialogs own the clipboard too; image mode does not: a paste there is saved and brings the workspace back. */
const dialogOpen = () => !!document.querySelector('dialog[open]');
const cinemaOpen = () => !!document.querySelector('.cb-app[data-cinema]');

/**
 * Universal Paste (P0): ⌘V / Strg+V anywhere in the window creates a board item, unless an editable field has focus —
 * then the field receives the paste natively. Some browsers fire no paste event while nothing editable is focused, so the
 * shortcut briefly focuses an off-screen catcher field; the paste lands there and is handled once. Clipboard data is only
 * read inside the user's own paste event. In image mode the same pipeline saves to the active space or folder; only once
 * the store confirmed the save does image mode close, so the new card is what the workspace returns to. A failed save
 * keeps image mode and says so (the notice region stays visible there).
 */
function useUniversalPaste(catcherRef: RefObject<HTMLTextAreaElement | null>) {
  const { dispatch } = usePreview();
  const capture = useCapture();
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    let returnFocus: HTMLElement | null = null;
    const release = () => {
      const catcher = catcherRef.current;
      if (!catcher || document.activeElement !== catcher) return;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else catcher.blur();
      returnFocus = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const catcher = catcherRef.current;
      if (!catcher || !isPasteShortcut(event) || isEditableTarget(event.target) || dialogOpen()) return;
      returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      catcher.focus({ preventScroll: true });
    };
    const onPaste = (event: ClipboardEvent) => {
      const fromCatcher = event.target === catcherRef.current;
      if (event.defaultPrevented || !event.clipboardData) return;
      if (!fromCatcher && (isEditableTarget(event.target) || isEditableTarget(document.activeElement) || dialogOpen())) return;
      event.preventDefault();
      const raw = readTransfer(event.clipboardData);
      const fromCinema = cinemaOpen();
      if (fromCatcher) release();
      void captureRef.current(raw).then((saved) => {
        if (saved && fromCinema && cinemaOpen()) leaveCinema(dispatch);
      });
    };
    // Capture phase: the catcher must take focus before the browser resolves the paste target.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', release);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', release);
      document.removeEventListener('paste', onPaste);
    };
  }, [catcherRef, dispatch]);
}

/**
 * Hybrid Workspace shell (D-001): sidebar, header + workspace, contextual right area (Inspector or Composer), activity layer
 * (Recorder), modal layers (Search, Settings, Drawer), the context menu and the mobile dock. Layout state is exposed as data attributes so the
 * design run can style every state without touching component logic.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const { state, dispatch, library } = usePreview();
  const workspaceRef = useRef<HTMLElement>(null);
  const catcherRef = useRef<HTMLTextAreaElement>(null);
  const capture = useCapture();
  const [dropping, setDropping] = useState(false);
  useUniversalPaste(catcherRef);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = state.prefs.theme === 'system' ? (prefersDark ? 'dark' : 'light') : state.prefs.theme;
  const detail = state.composerItemId ? 'composer' : state.inspectedItemId ? 'inspector' : 'none';
  const inspected = useInspectedItem();
  // The inspector keeps its last item for a short exit transition; switching to the composer replaces it immediately.
  const inspector = usePresence(detail === 'inspector' ? inspected : undefined, INSPECTOR_EXIT_MS);
  // Session-only width of the floating inspector (resize handle); never persisted.
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const dragActive = useDragActive();
  const folderOpen = !!state.openFolderId && !state.composerItemId;
  // The bottom composer steps aside for the editor (its own writing surface), the selection bar (same spot) and image mode.
  const composerHidden = detail === 'composer' || state.selectedIds.length > 0 || state.cinema;
  useScrollFade(workspaceRef);
  // Identity hue: the active space's colour re-lights every accent; global collections keep the brand ember.
  const activeSpace = state.location.type === 'space' ? library.getSpace(state.location.spaceId) : undefined;
  const hue = activeSpace ? spaceColorVar(activeSpace.color) : undefined;

  useEffect(() => {
    // Global search shortcut (H-02: Cmd/Ctrl+K is only *proposed*). Editable fields keep their native shortcuts.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target) || state.overlay || state.cinema) return;
      event.preventDefault();
      dispatch({ type: 'openOverlay', overlay: 'search' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch, state.overlay, state.cinema]);

  // Dropping files (or dragged text) anywhere outside an editable field captures them, like a paste. Editable fields keep
  // their native drop; the tab never navigates to a dropped file. Internal drags (cards, folders) are handled by their
  // drop targets and never show the file veil.
  const onDragOver = (event: DragEvent) => {
    if (isEditableTarget(event.target) || isInternalDrag(event.dataTransfer)) return;
    event.preventDefault();
    if (!dropping && transferHasFiles(event.dataTransfer) && !modalOpen()) setDropping(true);
  };
  const onDragLeave = (event: DragEvent) => {
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    setDropping(false);
    if (isEditableTarget(event.target) || isInternalDrag(event.dataTransfer)) return;
    event.preventDefault();
    if (modalOpen()) return;
    void capture(readTransfer(event.dataTransfer));
  };

  return (
    <div
      className="cb-app"
      data-theme={theme}
      data-motion={state.prefs.motion === 'reduced' ? 'reduced' : undefined}
      style={hue ? ({ '--cb-hue': hue } as CSSProperties) : undefined}
      data-detail={detail}
      data-recorder={state.recorderOpen || undefined}
      data-dropping={dropping || undefined}
      data-dragging={dragActive || undefined}
      data-folder={folderOpen || undefined}
      data-selecting={state.selectedIds.length > 0 || undefined}
      data-composer-hidden={composerHidden || undefined}
      data-cinema={state.cinema || undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AmbientScene />
      <a className="cb-skip-link" href="#cb-main">
        Zum Inhalt springen
      </a>
      <textarea ref={catcherRef} className="cb-paste-catcher" tabIndex={-1} aria-hidden="true" />
      <Dock />
      <div className="cb-stage" style={{ '--cb-inspector-w': `${inspectorWidth}px` } as CSSProperties} inert={state.cinema}>
        <main id="cb-main" ref={workspaceRef} className="cb-workspace cb-scroll" tabIndex={-1} aria-labelledby="cb-workspace-title" data-cb-context="board" inert={folderOpen}>
          {state.composerItemId ? <Composer key={state.composerItemId} /> : <Board scrollRoot={workspaceRef} />}
        </main>
        <FolderLayer />
        <ComposerDock hidden={composerHidden} />
        {inspector.value && detail !== 'composer' && (
          <Inspector item={inspector.value} leaving={inspector.leaving} width={inspectorWidth} onWidthChange={setInspectorWidth} />
        )}
      </div>
      <div className="cb-drop-veil" aria-hidden="true">
        <span className="cb-drop-veil__card">Loslassen, um zu speichern</span>
      </div>
      <ContextMenu />
      {state.recorderOpen && <RecorderShell />}
      <MobileDock />
      <SearchPalette />
      <SettingsStudio />
      <SpacesDrawer />
      <WorkspaceDialogs />
      {children}
    </div>
  );
}
