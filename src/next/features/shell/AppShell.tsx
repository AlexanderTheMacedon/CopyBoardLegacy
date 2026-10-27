import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type RefObject } from 'react';
import { isEditableTarget, useMediaQuery } from '../../app/hooks';
import { useInspectedItem, usePreview } from '../../app/context';
import { usePresence, useScrollFade } from '../../components/motion';
import { readTransfer, transferHasFiles } from '../../data/clipboard';
import { isInternalDrag } from '../../data/dnd';
import { useCapture } from '../capture/useCapture';
import { ContextMenu } from '../context-menu/ContextMenu';
import { Composer } from '../composer/Composer';
import { WorkspaceDialogs } from '../dialogs/WorkspaceDialogs';
import { useDragActive } from '../dnd/useDragDrop';
import { FolderLayer } from '../folders/FolderWindow';
import { Inspector, INSPECTOR_DEFAULT_WIDTH } from '../inspector/Inspector';
import { RecorderShell } from '../recorder/RecorderShell';
import { SearchPalette } from '../search/SearchPalette';
import { SettingsStudio } from '../settings/SettingsStudio';
import { AmbientScene } from './AmbientScene';
import { Board } from './Board';
import { Dock } from './Dock';
import { MobileDock } from './MobileDock';
import { SpacesDrawer } from './SpacesDrawer';

/** Exit window of the inspector: matches `--cb-dur-exit` + a frame of slack. */
const INSPECTOR_EXIT_MS = 240;

/** A modal layer (search, settings, drawer) owns keyboard and clipboard while it is open. */
const modalOpen = () => !!document.querySelector('dialog[open]');

const isPasteShortcut = (event: KeyboardEvent) =>
  event.key.toLowerCase() === 'v' && (event.metaKey || event.ctrlKey) && !event.altKey;

/**
 * Universal Paste (P0): ⌘V / Strg+V anywhere in the window creates a board item, unless an editable field has focus —
 * then the field receives the paste natively. Some browsers fire no paste event while nothing editable is focused, so the
 * shortcut briefly focuses an off-screen catcher field; the paste lands there and is handled once. Clipboard data is only
 * read inside the user's own paste event.
 */
function useUniversalPaste(catcherRef: RefObject<HTMLTextAreaElement | null>) {
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
      if (!catcher || !isPasteShortcut(event) || isEditableTarget(event.target) || modalOpen()) return;
      returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      catcher.focus({ preventScroll: true });
    };
    const onPaste = (event: ClipboardEvent) => {
      const fromCatcher = event.target === catcherRef.current;
      if (event.defaultPrevented || !event.clipboardData) return;
      if (!fromCatcher && (isEditableTarget(event.target) || isEditableTarget(document.activeElement) || modalOpen())) return;
      event.preventDefault();
      const raw = readTransfer(event.clipboardData);
      if (fromCatcher) release();
      void captureRef.current(raw);
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
  }, [catcherRef]);
}

/**
 * Hybrid Workspace shell (D-001): sidebar, header + workspace, contextual right area (Inspector or Composer), activity layer
 * (Recorder), modal layers (Search, Settings, Drawer), the context menu and the mobile dock. Layout state is exposed as data attributes so the
 * design run can style every state without touching component logic.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const { state, dispatch } = usePreview();
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
  useScrollFade(workspaceRef);

  useEffect(() => {
    // Global search shortcut (H-02: Cmd/Ctrl+K is only *proposed*). Editable fields keep their native shortcuts.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target) || state.overlay) return;
      event.preventDefault();
      dispatch({ type: 'openOverlay', overlay: 'search' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch, state.overlay]);

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
      data-detail={detail}
      data-recorder={state.recorderOpen || undefined}
      data-dropping={dropping || undefined}
      data-dragging={dragActive || undefined}
      data-folder={folderOpen || undefined}
      data-selecting={state.selectedIds.length > 0 || undefined}
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
      <div className="cb-stage" style={{ '--cb-inspector-w': `${inspectorWidth}px` } as CSSProperties}>
        <main id="cb-main" ref={workspaceRef} className="cb-workspace cb-scroll" tabIndex={-1} aria-labelledby="cb-workspace-title" data-cb-context="board" inert={folderOpen}>
          {state.composerItemId ? <Composer key={state.composerItemId} /> : <Board scrollRoot={workspaceRef} />}
        </main>
        <FolderLayer />
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
