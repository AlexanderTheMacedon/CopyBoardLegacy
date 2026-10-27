import { useEffect, useState, type RefObject } from 'react';
import { usePreview } from '../../app/context';
import { densityPreference, viewPreference } from '../../app/preferences';
import type { BoardFilter } from '../../app/state';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../components/Popover';
import { SegmentedControl, type SegmentOption } from '../../components/SegmentedControl';
import { SpaceGlyph, spaceColorVar } from '../../components/SpaceIcon';
import { sortModes } from '../../domain/sort';
import type { CollectionId, Placement, Space } from '../../domain/types';
import { focusCapture } from '../capture/SmartCapture';
import { ThemeQuickPreference } from './QuickPreferences';

interface WorkspaceHeaderProps {
  title: string;
  space?: Space;
  collectionId?: CollectionId;
  /** Filter chips under the title, built from the real items of the location. */
  filters?: readonly SegmentOption<BoardFilter>[];
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  /** Short count label for the collapsed toolbar, e.g. "6 Inhalte". */
  countLabel?: string;
  /** Board level of the space (enables "Neuer Ordner"). */
  placement?: Placement;
  /** Scroll container of the workspace; the toolbar collapses when the hero scrolls away. */
  scrollRoot: RefObject<HTMLElement | null>;
}

// Collapse thresholds with hysteresis (D-020: no flicker on short direction changes). Candidates, calibrated in Run C.
const COLLAPSE_AT = 128;
const EXPAND_AT = 44;

const collectionIcon: Record<CollectionId, IconName> = { all: 'layers', favorites: 'star', recent: 'clock', sessions: 'waveform' };

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

/** Sort menu shared by the board header and the folder window. */
export function SortMenu() {
  const { state, dispatch } = usePreview();
  const current = sortModes.find((m) => m.value === state.sort);
  return (
    <Popover label={`Sortierung: ${current?.label ?? ''}`} icon="sortAsc" iconSize={18} triggerClassName="cb-icon-button cb-icon-button--ghost cb-icon-button--md cb-tool">
      {(close) => (
        <div className="cb-menu" role="menu" aria-label="Sortierung">
          {sortModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode.value === state.sort}
              className="cb-menu__item"
              onClick={() => {
                close();
                dispatch({ type: 'setSort', sort: mode.value });
              }}
            >
              <Icon name={mode.value === state.sort ? 'check' : 'sortAsc'} size={16} />
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** View + density switchers (one preference state with the Settings Studio, D-033). */
export function ViewTools({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = usePreview();
  return (
    <div className="cb-view-controls">
      {!compact && (
        <SegmentedControl
          label={densityPreference.label}
          size="sm"
          options={densityPreference.options}
          value={state.density}
          onChange={(density) => dispatch({ type: 'setPreference', patch: { density } })}
          className="cb-view-controls__density"
        />
      )}
      <SegmentedControl
        label={viewPreference.label}
        size="sm"
        iconOnly
        options={viewPreference.options}
        value={state.view}
        onChange={(view) => dispatch({ type: 'setPreference', patch: { view } })}
      />
    </div>
  );
}

/**
 * Ambient Canvas header (D-019) with Collapsing Ambient (D-020): the sticky toolbar is always mounted and only changes its
 * presentation via `data-collapsed`, so Search/Capture/Trust never remount (SM-10). The hero carries the board identity
 * (glyph + name, click = space settings) and a quiet tool cluster; filter chips stay folded until asked for.
 */
export function WorkspaceHeader({ title, space, collectionId, filters, filter, onFilterChange, countLabel, placement, scrollRoot }: WorkspaceHeaderProps) {
  const { state, dispatch } = usePreview();
  const [collapsed, setCollapsed] = useState(false);
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
  const filterActive = filter !== 'all';
  const showFilters = !!filters && state.filtersVisible;

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

      <header className="cb-hero" data-filters={showFilters || undefined}>
        <div className="cb-hero__row">
          {space ? (
            <button
              type="button"
              className="cb-hero__identity"
              title="Space-Einstellungen"
              aria-label={`${space.name}: Space-Einstellungen öffnen`}
              onClick={() => dispatch({ type: 'openModal', modal: { kind: 'space-edit', spaceId: space.id } })}
            >
              <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={44} className="cb-hero__glyph" />
              <h1 className="cb-hero__title" id="cb-workspace-title">
                {title}
              </h1>
              <Icon name="chevronDown" size={18} className="cb-hero__caret" />
            </button>
          ) : (
            <div className="cb-hero__identity cb-hero__identity--static">
              {collectionId && (
                <span className="cb-hero__glyph cb-glyph cb-glyph--collection" aria-hidden="true">
                  <Icon name={collectionIcon[collectionId]} size={22} />
                </span>
              )}
              <h1 className="cb-hero__title" id="cb-workspace-title">
                {title}
              </h1>
            </div>
          )}
          <div className="cb-hero__tools" role="group" aria-label="Ansicht und Filter">
            {filters && (
              <IconButton
                icon="filter"
                label={showFilters ? 'Filter ausblenden' : 'Filter einblenden'}
                className="cb-tool cb-tool--filter"
                aria-pressed={showFilters}
                data-active={filterActive || undefined}
                onClick={() => dispatch({ type: 'setFiltersVisible', visible: !showFilters })}
              />
            )}
            <SortMenu />
            <ViewTools />
            {placement && (
              <IconButton
                icon="folderPlus"
                label="Neuer Ordner"
                className="cb-tool cb-tool--accent"
                onClick={() => dispatch({ type: 'openModal', modal: { kind: 'folder-new', placement } })}
              />
            )}
          </div>
        </div>
        {filters && (
          <div className="cb-hero__filters-fold" data-open={showFilters || undefined}>
            <div>
              <SegmentedControl
                label="Inhalte filtern"
                variant="chips"
                options={filters}
                value={filter}
                onChange={onFilterChange}
                className="cb-hero__filters"
              />
            </div>
          </div>
        )}
      </header>
    </>
  );
}
