import { useEffect, useState, type RefObject } from 'react';
import { usePreview } from '../../app/context';
import type { BoardFilter } from '../../app/state';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../components/Popover';
import { SegmentedControl, type SegmentOption } from '../../components/SegmentedControl';
import { focusCapture } from '../capture/SmartCapture';
import { spaceColorVar } from '../items/item-meta';
import { ThemeQuickPreference } from './QuickPreferences';

interface WorkspaceHeaderProps {
  title: string;
  /** Filter chips under the title, built from the real items of the location. */
  filters?: readonly SegmentOption<BoardFilter>[];
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  /** Short count label for the collapsed toolbar, e.g. "6 Inhalte". */
  countLabel?: string;
  /** Scroll container of the workspace; the toolbar collapses when the hero scrolls away. */
  scrollRoot: RefObject<HTMLElement | null>;
}

// Collapse thresholds with hysteresis (D-020: no flicker on short direction changes). Candidates, calibrated in Run C.
const COLLAPSE_AT = 128;
const EXPAND_AT = 44;

const shortcutHint = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Strg K');

/** D-028 trust indicator: where captured content lives. Says plainly when local storage is blocked. */
function TrustIndicator() {
  const { workspace } = usePreview();
  const local = workspace.persistent;
  return (
    <Popover label="Speicherstatus" icon={local ? 'shield' : 'info'} iconSize={18} text={local ? 'Lokal' : 'Nicht gespeichert'} triggerClassName="cb-trust">
      {() => (
        <div className="cb-quick-pref">
          <p className="cb-quick-pref__title">{local ? 'Lokal auf diesem Gerät' : 'Lokales Speichern blockiert'}</p>
          <p className="cb-quick-pref__note">
            {local
              ? 'Eingefügte Inhalte werden in diesem Browser gespeichert und bleiben nach dem Neuladen erhalten. Keine Cloud, kein Konto, keine Synchronisierung. Die Beispielinhalte sind synthetisch.'
              : 'Dieser Browser erlaubt keinen lokalen Speicher. Eingefügte Inhalte können nicht übernommen werden.'}
          </p>
        </div>
      )}
    </Popover>
  );
}

/**
 * Ambient Canvas header (D-019) with Collapsing Ambient (D-020): the sticky toolbar is always mounted and only changes its
 * presentation via `data-collapsed`, so Search/Capture/Trust never remount (SM-10). Collapse is scroll-driven with a
 * hysteresis band instead of a single threshold.
 */
export function WorkspaceHeader({ title, filters, filter, onFilterChange, countLabel, scrollRoot }: WorkspaceHeaderProps) {
  const { state, dispatch, library } = usePreview();
  const [collapsed, setCollapsed] = useState(false);
  const space = state.location.type === 'space' ? library.getSpace(state.location.spaceId) : undefined;
  const locationKey = state.location.type === 'space' ? state.location.spaceId : state.location.collectionId;

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;
    let frame = 0;
    let current = false;
    const update = () => {
      frame = 0;
      const y = root.scrollTop;
      const next = current ? y > EXPAND_AT : y > COLLAPSE_AT;
      if (next !== current) {
        current = next;
        setCollapsed(next);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRoot]);

  // A new collection starts at the top of its board; the toolbar expands with it.
  useEffect(() => {
    scrollRoot.current?.scrollTo({ top: 0 });
  }, [scrollRoot, locationKey]);

  const tint = space ? spaceColorVar(space.color) : 'var(--cb-accent)';

  return (
    <>
      {/* Direct child of the scroll container so `position: sticky` holds for the whole board. */}
      <div className="cb-toolbar" data-collapsed={collapsed || undefined}>
        <IconButton
          icon="menu"
          label="Spaces öffnen"
          className="cb-toolbar__menu"
          onClick={() => dispatch({ type: 'openOverlay', overlay: 'spaces-drawer' })}
        />
        <div className="cb-toolbar__context" aria-hidden={!collapsed}>
          <span className="cb-toolbar__dot" style={{ background: tint }} />
          <p className="cb-toolbar__title">{title}</p>
          {countLabel && <span className="cb-toolbar__count">{countLabel}</span>}
        </div>
        <button
          type="button"
          className="cb-search-trigger"
          onClick={() => dispatch({ type: 'openOverlay', overlay: 'search' })}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Icon name="search" size={18} />
          <span className="cb-search-trigger__label">Suchen</span>
          <kbd className="cb-search-trigger__kbd">{shortcutHint()}</kbd>
        </button>
        <IconButton icon="plus" label="Erfassen" className="cb-toolbar__capture" onClick={focusCapture} />
        <span className="cb-toolbar__theme">
          <ThemeQuickPreference />
        </span>
        <TrustIndicator />
      </div>

      {/* Radical header: only the board name and its filters (Glass WOW v2). */}
      <header className="cb-hero">
        <div className="cb-hero__heading">
          <h1 className="cb-hero__title" id="cb-workspace-title">
            {title}
          </h1>
        </div>
        {filters && (
          <SegmentedControl
            label="Inhalte filtern"
            variant="chips"
            options={filters}
            value={filter}
            onChange={onFilterChange}
            className="cb-hero__filters"
          />
        )}
      </header>
    </>
  );
}
