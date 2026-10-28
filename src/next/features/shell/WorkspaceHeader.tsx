import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { usePreview } from '../../app/context';
import { PHONE_QUERY, useMediaQuery } from '../../app/hooks';
import { densityPreference, viewPreference } from '../../app/preferences';
import type { BoardFilter } from '../../app/state';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { playMorph, snapshotMorph, useGlider, type MorphParts } from '../../components/motion';
import { Popover } from '../../components/Popover';
import { SegmentedControl, type SegmentOption } from '../../components/SegmentedControl';
import { SpaceGlyph } from '../../components/SpaceIcon';
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

/** The parts of the header island that travel between the resting cluster and the right dock (motion.ts playMorph). */
const ISLAND_PARTS: MorphParts = {
  plate: '.cb-toolbar__plate',
  glyph: '.cb-toolbar__glyph',
  title: '.cb-toolbar__title',
  count: '.cb-toolbar__count',
  rule: '.cb-toolbar__sep',
  searchIcon: '.cb-search-trigger > .cb-icon',
  searchLabel: '.cb-search-trigger__label',
  searchKbd: '.cb-search-trigger__kbd',
  capture: '.cb-toolbar__capture',
  toolsRule: '.cb-toolbar__tools-sep',
  filterTool: '.cb-toolbar__tool--filter',
  viewTool: '.cb-toolbar__tool--view',
  trustIcon: '.cb-trust > .cb-icon',
  trustLabel: '.cb-trust > span',
};

const collectionIcon: Record<CollectionId, IconName> = { all: 'layers', favorites: 'star', recent: 'clock', sessions: 'waveform' };

const shortcutHint = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Strg K');

/** D-028 trust indicator: where captured content lives. Says plainly when local storage is blocked. */
function TrustIndicator() {
  const { workspace } = usePreview();
  const local = workspace.persistent;
  return (
    <Popover label="Speicherstatus" tip={local ? 'Lokal gespeichert' : 'Nicht gespeichert'} icon={local ? 'shield' : 'info'} iconSize={18} text={local ? 'Lokal' : 'Nicht gespeichert'} triggerClassName="cb-trust">
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

/** The sort modes as a menu of radio items; `onChoose` runs after the choice (e.g. closing the popover). */
function SortOptions({ onChoose }: { onChoose?: () => void }) {
  const { state, dispatch } = usePreview();
  return (
    <div className="cb-menu" role="menu" aria-label="Sortierung">
      {sortModes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          role="menuitemradio"
          aria-checked={mode.value === state.sort}
          className="cb-menu__item"
          onClick={() => {
            onChoose?.();
            dispatch({ type: 'setSort', sort: mode.value });
          }}
        >
          <Icon name={mode.value === state.sort ? 'check' : 'sortAsc'} size={16} />
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Sort menu shared by the board header and the folder window. */
export function SortMenu() {
  const { state } = usePreview();
  const current = sortModes.find((m) => m.value === state.sort);
  return (
    <Popover label={`Sortierung: ${current?.label ?? ''}`} icon="sortAsc" iconSize={18} triggerClassName="cb-icon-button cb-icon-button--ghost cb-icon-button--md cb-tool">
      {(close) => <SortOptions onChoose={close} />}
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

type FlyoutPlacement = 'left-center' | 'bottom-end';

/**
 * Filter of the docked island: the hero's chips as one list beside the dock (same options, counts and state), the hero row
 * toggle below. An applied filter shows on the trigger itself (its kind icon, accent) and carries a one-click reset badge,
 * so a closed flyout never hides that the board is filtered.
 */
function DockFilter({
  filters,
  filter,
  onFilterChange,
  placement,
}: {
  filters: readonly SegmentOption<BoardFilter>[];
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  placement: FlyoutPlacement;
}) {
  const { state, dispatch } = usePreview();
  const current = filters.find((o) => o.value === filter);
  const applied = filter !== 'all' && !!current;
  const label = applied ? `Filter: ${current.label}` : 'Filter';
  return (
    <span className="cb-toolbar__filter">
      <Popover
        layer
        placement={placement}
        label={label}
        tip={label}
        icon={applied ? (current.icon ?? 'filter') : 'filter'}
        iconSize={18}
        active={applied}
        triggerClassName="cb-toolbar__tool cb-toolbar__tool--filter"
        panelClassName="cb-dock-flyout"
      >
        {(close) => (
          <DockFilterList
            filters={filters}
            filter={filter}
            onChoose={(next) => {
              close();
              onFilterChange(next);
            }}
            rowVisible={state.filtersVisible}
            onToggleRow={() => dispatch({ type: 'setFiltersVisible', visible: !state.filtersVisible })}
          />
        )}
      </Popover>
      {applied && (
        <button type="button" className="cb-toolbar__reset" aria-label="Filter zurücksetzen" data-tip="Filter zurücksetzen" onClick={() => onFilterChange('all')}>
          <Icon name="x" size={11} />
        </button>
      )}
    </span>
  );
}

function DockFilterList({
  filters,
  filter,
  onChoose,
  rowVisible,
  onToggleRow,
}: {
  filters: readonly SegmentOption<BoardFilter>[];
  filter: BoardFilter;
  onChoose: (filter: BoardFilter) => void;
  rowVisible: boolean;
  onToggleRow: () => void;
}) {
  const listRef = useGlider<HTMLDivElement>('[aria-checked="true"]', [filter]);
  return (
    <>
      <p className="cb-dock-flyout__title">Inhalte filtern</p>
      <div ref={listRef} className="cb-menu cb-dock-flyout__list" role="menu" aria-label="Inhalte filtern">
        <span className="cb-glider cb-dock-flyout__glider" aria-hidden="true" />
        {filters.map((option, i) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === filter}
            className="cb-menu__item"
            style={{ '--i': i } as CSSProperties}
            onClick={() => onChoose(option.value)}
          >
            <Icon name={option.icon ?? 'layers'} size={16} />
            <span>{option.label}</span>
            {option.count !== undefined && <span className="cb-dock-flyout__count">{option.count}</span>}
          </button>
        ))}
      </div>
      <div className="cb-dock-flyout__foot">
        <button type="button" role="switch" aria-checked={rowVisible} className="cb-menu__item" onClick={onToggleRow}>
          <Icon name={rowVisible ? 'eye' : 'filter'} size={16} />
          <span>Filterleiste im Board</span>
          <span className="cb-dock-flyout__switch" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

/** Presentation of the docked island: view, density, sort and (on a space board) a new folder, one click away. */
function DockView({ placement, boardPlacement }: { placement: FlyoutPlacement; boardPlacement?: Placement }) {
  const { state, dispatch } = usePreview();
  const view = viewPreference.options.find((o) => o.value === state.view);
  return (
    <Popover
      layer
      placement={placement}
      label={`Darstellung: ${view?.label ?? ''}`}
      tip="Darstellung & Sortierung"
      icon={view?.icon ?? 'grid'}
      iconSize={18}
      triggerClassName="cb-toolbar__tool cb-toolbar__tool--view"
      panelClassName="cb-dock-flyout cb-dock-flyout--view"
    >
      {(close) => (
        <>
          <p className="cb-dock-flyout__title">{viewPreference.label}</p>
          <SegmentedControl
            label={viewPreference.label}
            size="sm"
            options={viewPreference.options}
            value={state.view}
            onChange={(next) => dispatch({ type: 'setPreference', patch: { view: next } })}
            className="cb-dock-flyout__segmented"
          />
          <p className="cb-dock-flyout__title">{densityPreference.label}</p>
          <SegmentedControl
            label={densityPreference.label}
            size="sm"
            options={densityPreference.options}
            value={state.density}
            onChange={(next) => dispatch({ type: 'setPreference', patch: { density: next } })}
            className="cb-dock-flyout__segmented"
          />
          <p className="cb-dock-flyout__title">Sortierung</p>
          <SortOptions />
          {boardPlacement && (
            <div className="cb-dock-flyout__foot">
              <button
                type="button"
                className="cb-menu__item"
                onClick={() => {
                  close();
                  dispatch({ type: 'openModal', modal: { kind: 'folder-new', placement: boardPlacement } });
                }}
              >
                <Icon name="folderPlus" size={16} />
                <span>Neuer Ordner</span>
              </button>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}

/** Where the focus goes when the control it sits on folds away: its counterpart in the other layout. */
function counterpart(active: HTMLElement, island: HTMLElement, docked: boolean): HTMLElement | null | undefined {
  const root = island.closest('.cb-board-root');
  if (docked) {
    if (active.closest('.cb-tool--filter, .cb-hero__filters')) return island.querySelector<HTMLElement>('.cb-toolbar__tool--filter');
    if (active.closest('.cb-hero__tools')) return island.querySelector<HTMLElement>('.cb-toolbar__tool--view');
    return null;
  }
  if (active.closest('.cb-toolbar__identity')) return root?.querySelector<HTMLElement>('.cb-hero__identity');
  if (active.closest('.cb-toolbar__filter')) return root?.querySelector<HTMLElement>('.cb-hero__tools .cb-tool--filter');
  if (active.closest('.cb-toolbar__tools')) return root?.querySelector<HTMLElement>('.cb-hero__tools [aria-checked="true"]');
  return island.querySelector<HTMLElement>('.cb-search-trigger');
}

/**
 * Ambient Canvas header (D-019) with Collapsing Ambient (D-020): the toolbar island is always mounted and only changes its
 * presentation via `data-collapsed`, so Search/Capture/Trust never remount (SM-10). At rest it is the quiet search cluster
 * above the hero. Scrolled, the same island morphs into a vertical glass dock at the right edge (desktop) or a compact top
 * bar (phone): the plate reshapes, every icon travels to its new slot and the hero's glyph flies in as the board identity —
 * one continuous object in both directions, interruptible at any point (motion.ts playMorph). The hero's board tools travel
 * with it: filter and presentation fly from the hero row into the dock (and back), where secondary choices open as flyouts
 * beside it; the hero row is inert while docked, so every control exists exactly once.
 */
export function WorkspaceHeader({ title, space, collectionId, filters, filter, onFilterChange, countLabel, placement, scrollRoot }: WorkspaceHeaderProps) {
  const { state, dispatch } = usePreview();
  const [compact, setCompact] = useState(false);
  const phone = useMediaQuery(PHONE_QUERY);
  const flyout: FlyoutPlacement = phone ? 'bottom-end' : 'left-center';
  const islandRef = useRef<HTMLDivElement>(null);
  const morphFrom = useRef<ReturnType<typeof snapshotMorph> | null>(null);
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
      if (next === current) return;
      current = next;
      // snapshot the island as it is drawn now; it holds still until the commit (sticky at rest, fixed when docked)
      if (islandRef.current) morphFrom.current = snapshotMorph(islandRef.current, ISLAND_PARTS);
      setCompact(next);
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

  useLayoutEffect(() => {
    const island = islandRef.current;
    const first = morphFrom.current;
    morphFrom.current = null;
    if (!island || !first) return;
    // the identity flies between the hero glyph and its slot in the dock, while the hero glyph is on screen
    // the identity and the board tools fly between their hero counterparts and their dock slots, while those are on screen
    const fromHero = (selector: string) => () => {
      const rect = island.closest('.cb-board-root')?.querySelector(selector)?.getBoundingClientRect();
      return rect && rect.bottom > 0 && rect.width > 0 ? rect : null;
    };
    playMorph(island, ISLAND_PARTS, first, {
      hidden: {
        glyph: fromHero('.cb-hero__glyph'),
        filterTool: fromHero('.cb-hero__tools .cb-tool--filter'),
        viewTool: fromHero('.cb-hero__tools .cb-view-controls'),
        title: 'other',
        count: 'other',
        searchLabel: 'other',
        searchKbd: 'other',
        trustLabel: 'other',
      },
      resize: ['plate'],
      late: ['plate', 'glyph'],
    });
    // focus never stays on a control that just folded away: it moves to its counterpart
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[inert]') && (island.contains(active) || active.closest('.cb-hero'))) {
      counterpart(active, island, compact)?.focus({ preventScroll: true });
    }
  }, [compact]);

  // A new collection starts at the top of its board; the toolbar expands with it.
  useEffect(() => {
    scrollRoot.current?.scrollTo({ top: 0 });
  }, [scrollRoot, locationKey]);

  const filterActive = filter !== 'all';
  const showFilters = !!filters && state.filtersVisible;
  const identityLabel = countLabel ? `${title} · ${countLabel}` : title;

  return (
    <>
      {/* Direct child of the scroll container so `position: sticky` holds for the whole board. The row itself is click-through;
          only the island is a surface. */}
      <div className="cb-toolbar" data-collapsed={compact || undefined}>
        <IconButton
          icon="menu"
          label="Spaces öffnen"
          className="cb-toolbar__menu"
          onClick={() => dispatch({ type: 'openOverlay', overlay: 'spaces-drawer' })}
        />
        <div ref={islandRef} className="cb-toolbar__island" role="group" aria-label="Schnellzugriff" data-identity={space ? 'space' : 'collection'}>
          <span className="cb-toolbar__plate" aria-hidden="true" />
          <button
            type="button"
            className="cb-toolbar__identity"
            aria-label={`${identityLabel} – nach oben`}
            data-tip={identityLabel}
            aria-hidden={!compact}
            inert={!compact}
            onClick={() => scrollRoot.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            {space ? (
              <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={30} className="cb-toolbar__glyph" />
            ) : (
              <span className="cb-toolbar__glyph cb-glyph cb-glyph--collection" style={{ '--cb-glyph-size': '30px' } as CSSProperties}>
                <Icon name={collectionId ? collectionIcon[collectionId] : 'layers'} size={15} />
              </span>
            )}
            <span className="cb-toolbar__title">{title}</span>
            {countLabel && <span className="cb-toolbar__count">{countLabel}</span>}
          </button>
          <span className="cb-toolbar__sep" aria-hidden="true" />
          <button
            type="button"
            className="cb-search-trigger"
            aria-label="Suchen"
            data-tip={`Suchen  ${shortcutHint()}`}
            onClick={() => dispatch({ type: 'openOverlay', overlay: 'search' })}
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Icon name="search" size={18} />
            <span className="cb-search-trigger__label">Suchen</span>
            <kbd className="cb-search-trigger__kbd">{shortcutHint()}</kbd>
          </button>
          <IconButton
            icon="plus"
            label="Neuer Inhalt"
            title={undefined}
            data-tip="Neuer Inhalt"
            className="cb-toolbar__capture"
            aria-hidden={!compact}
            inert={!compact}
            onClick={focusCapture}
          />
          {/* always mounted (measurable for the morph); interactive only while docked */}
          <div className="cb-toolbar__tools" role="group" aria-label="Filter und Darstellung" aria-hidden={!compact} inert={!compact}>
            <span className="cb-toolbar__tools-sep" aria-hidden="true" />
            {filters && <DockFilter filters={filters} filter={filter} onFilterChange={onFilterChange} placement={flyout} />}
            <DockView placement={flyout} boardPlacement={placement} />
          </div>
          <span className="cb-toolbar__theme">
            <ThemeQuickPreference />
          </span>
          <TrustIndicator />
        </div>
      </div>

      <header className="cb-hero" data-filters={showFilters || undefined}>
        <div className="cb-hero__row">
          {space ? (
            <button
              key={locationKey}
              type="button"
              className="cb-hero__identity"
              title="Space-Einstellungen"
              aria-label={`${space.name}: Space-Einstellungen öffnen`}
              onClick={() => dispatch({ type: 'openModal', modal: { kind: 'space-edit', spaceId: space.id } })}
            >
              <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={52} className="cb-hero__glyph" />
              <h1 className="cb-hero__title" id="cb-workspace-title">
                {title}
              </h1>
              <Icon name="chevronDown" size={18} className="cb-hero__caret" />
            </button>
          ) : (
            <div key={locationKey} className="cb-hero__identity cb-hero__identity--static">
              {collectionId && (
                <span className="cb-hero__glyph cb-glyph cb-glyph--collection" aria-hidden="true">
                  <Icon name={collectionIcon[collectionId]} size={26} />
                </span>
              )}
              <h1 className="cb-hero__title" id="cb-workspace-title">
                {title}
              </h1>
            </div>
          )}
          <div className="cb-hero__tools" role="group" aria-label="Ansicht und Filter" aria-hidden={compact || undefined} inert={compact}>
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
