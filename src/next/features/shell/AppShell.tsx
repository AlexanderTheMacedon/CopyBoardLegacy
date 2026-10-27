import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { isEditableTarget, useMediaQuery } from '../../app/hooks';
import { useInspectedItem, usePreview } from '../../app/context';
import { usePresence, useScrollFade } from '../../components/motion';
import { Composer } from '../composer/Composer';
import { Inspector, INSPECTOR_DEFAULT_WIDTH } from '../inspector/Inspector';
import { RecorderShell } from '../recorder/RecorderShell';
import { SearchPalette } from '../search/SearchPalette';
import { SettingsStudio } from '../settings/SettingsStudio';
import { AmbientScene } from './AmbientScene';
import { Board } from './Board';
import { MobileDock } from './MobileDock';
import { Sidebar } from './Sidebar';
import { SpacesDrawer } from './SpacesDrawer';

/** Exit window of the inspector: matches `--cb-dur-exit` + a frame of slack. */
const INSPECTOR_EXIT_MS = 240;

/**
 * Hybrid Workspace shell (D-001): sidebar, header + workspace, contextual right area (Inspector or Composer), activity layer
 * (Recorder), modal layers (Search, Settings, Drawer) and the mobile dock. Layout state is exposed as data attributes so the
 * design run can style every state without touching component logic.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const { state, dispatch, notify } = usePreview();
  const workspaceRef = useRef<HTMLElement>(null);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = state.prefs.theme === 'system' ? (prefersDark ? 'dark' : 'light') : state.prefs.theme;
  const detail = state.composerItemId ? 'composer' : state.inspectedItemId ? 'inspector' : 'none';
  const inspected = useInspectedItem();
  // The inspector keeps its last item for a short exit transition; switching to the composer replaces it immediately.
  const inspector = usePresence(detail === 'inspector' ? inspected : undefined, INSPECTOR_EXIT_MS);
  // Session-only width of the floating inspector (resize handle); never persisted.
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
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

  // Drops outside Smart Capture must not navigate the tab to the file; nothing is read from the drag data.
  const swallowDrag = (event: DragEvent) => event.preventDefault();
  const swallowDrop = (event: DragEvent) => {
    event.preventDefault();
    notify('Demo: Abgelegte Dateien werden in der Vorschau nicht übernommen.');
  };

  return (
    <div
      className="cb-app"
      data-theme={theme}
      data-sidebar={state.prefs.sidebarMode}
      data-detail={detail}
      data-recorder={state.recorderOpen || undefined}
      onDragOver={swallowDrag}
      onDrop={swallowDrop}
    >
      <AmbientScene />
      <a className="cb-skip-link" href="#cb-main">
        Zum Inhalt springen
      </a>
      <Sidebar />
      <div className="cb-stage" style={{ '--cb-inspector-w': `${inspectorWidth}px` } as CSSProperties}>
        <main id="cb-main" ref={workspaceRef} className="cb-workspace cb-scroll" tabIndex={-1} aria-labelledby="cb-workspace-title">
          {state.composerItemId ? <Composer key={state.composerItemId} /> : <Board scrollRoot={workspaceRef} />}
        </main>
        {inspector.value && detail !== 'composer' && (
          <Inspector item={inspector.value} leaving={inspector.leaving} width={inspectorWidth} onWidthChange={setInspectorWidth} />
        )}
      </div>
      {state.recorderOpen && <RecorderShell />}
      <MobileDock />
      <SearchPalette />
      <SettingsStudio />
      <SpacesDrawer />
      {children}
    </div>
  );
}
