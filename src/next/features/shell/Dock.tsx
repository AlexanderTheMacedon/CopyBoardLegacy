import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { usePreview } from '../../app/context';
import { useMediaQuery } from '../../app/hooks';
import { BrandMark } from '../../components/BrandMark';
import { Icon, type IconName } from '../../components/Icon';
import { useGlider } from '../../components/motion';
import { SpaceGlyph, spaceColorVar } from '../../components/SpaceIcon';
import { currentDrag } from '../../data/dnd';
import type { CollectionId, Location, Space, SpaceId } from '../../domain/types';
import { useDropTarget } from '../dnd/useDragDrop';
import { useEntryActions } from '../workspace/useEntryActions';

const collectionIcon: Record<CollectionId, IconName> = {
  all: 'layers',
  favorites: 'star',
  recent: 'clock',
  sessions: 'waveform',
};

/** Hover intent: open after a short dwell, close only after the pointer has really left. */
const OPEN_DELAY = 70;
const CLOSE_DELAY = 240;

const shortcut = (key: string) => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? `⌘${key}` : `Strg ${key}`);

function DockButton({
  icon,
  label,
  hint,
  current,
  index,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  current?: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cb-navdock__item"
      aria-current={current ? 'page' : undefined}
      title={label}
      style={{ '--i': index } as CSSProperties}
      onClick={onClick}
    >
      <span className="cb-navdock__icon" aria-hidden="true">
        <Icon name={icon} size={19} />
      </span>
      <span className="cb-navdock__label">{label}</span>
      {hint && <kbd className="cb-navdock__hint">{hint}</kbd>}
    </button>
  );
}

/** Pointer and keyboard handlers of a space's reorder grip (SpaceSwitcher owns the drag). */
interface ReorderGrip {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * One space in the flyout: navigation target, drop target for cards and folders (moves them to that space's board), and a
 * grip to reorder the spaces. The grip is pointer-driven, never an HTML drag source, so it cannot meet the cards' drag.
 */
function FlyoutSpace({
  space,
  index,
  current,
  count,
  onChoose,
  grip,
  offset,
  lifted,
}: {
  space: Space;
  index: number;
  current: boolean;
  count: number;
  onChoose: () => void;
  grip: ReorderGrip;
  offset: number;
  lifted: boolean;
}) {
  const entries = useEntryActions();
  const drop = useDropTarget({
    accepts: (payload) => !(payload.from.spaceId === space.id && payload.from.folderId === null),
    onDrop: (payload) => void entries.move(payload.ids, { spaceId: space.id, folderId: null }),
    armDelay: 60,
  });
  return (
    <li
      style={{ '--i': index, translate: offset ? `0 ${offset}px` : undefined } as CSSProperties}
      data-drop={drop.over || undefined}
      data-lifted={lifted || undefined}
      {...drop.props}
    >
      <button
        type="button"
        className="cb-spaces-flyout__item"
        aria-current={current ? 'true' : undefined}
        title={space.name}
        data-space-id={space.id}
        style={{ '--cb-swatch': spaceColorVar(space.color) } as CSSProperties}
        onClick={onChoose}
        onKeyDown={(event) => {
          // Alt + arrow on the space itself moves it as well (the grip's arrows without leaving the list)
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) grip.onKeyDown(event as unknown as KeyboardEvent<HTMLButtonElement>);
        }}
      >
        <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={30} className="cb-space-switch__swatch" />
        <span className="cb-spaces-flyout__name">{space.name}</span>
        <span className="cb-spaces-flyout__count" aria-label={`${count} Inhalte`}>
          {count}
        </span>
      </button>
      <button
        type="button"
        className="cb-spaces-flyout__grip"
        aria-label={`„${space.name}“ verschieben`}
        aria-describedby="cb-spaces-reorder-hint"
        title="Ziehen zum Sortieren"
        data-reorder={space.id}
        {...grip}
      >
        <Icon name="grip" size={16} />
      </button>
    </li>
  );
}

interface SpaceDrag {
  readonly id: SpaceId;
  readonly from: number;
  readonly to: number;
  /** pointer travel, clamped to the list */
  readonly dy: number;
  /** row pitch (height + gap), first row's top and row height, measured at the start */
  readonly pitch: number;
  readonly top: number;
  readonly height: number;
}

/**
 * Space order in the flyout: drag a grip (pointer capture: the row follows the pointer, the others make room, a slot marks
 * the drop place) or press its arrow keys. The new order is shown at once and written through `workspace.reorderSpaces`
 * (the spaces' `order` field, IndexedDB); the pending order holds until the library reports it, a failed write rolls back.
 */
function useSpaceReorder() {
  const { library, workspace, notify } = usePreview();
  const [pending, setPending] = useState<readonly SpaceId[] | null>(null);
  const [drag, setDrag] = useState<SpaceDrag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragRef = useRef<(SpaceDrag & { startY: number }) | null>(null);
  const busy = useRef(false);

  const libraryKey = library.spaces.map((s) => s.id).join();
  const spaces = pending
    ? [...pending.map((id) => library.getSpace(id)).filter((s): s is Space => !!s), ...library.spaces.filter((s) => !pending.includes(s.id))]
    : library.spaces;
  useEffect(() => {
    if (pending && pending.join() === libraryKey) setPending(null);
  }, [pending, libraryKey]);

  const commit = (space: Space, from: number, to: number) => {
    if (to === from) return;
    const ids = spaces.map((s) => s.id);
    ids.splice(from, 1);
    ids.splice(to, 0, space.id);
    setPending(ids);
    setAnnouncement(`„${space.name}“ an Position ${to + 1} von ${ids.length}`);
    workspace.reorderSpaces(ids).catch(() => {
      setPending(null);
      notify('Die Reihenfolge konnte nicht gespeichert werden.', { tone: 'error' });
    });
  };

  const end = (apply: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    busy.current = false;
    setDrag(null);
    const space = d && library.getSpace(d.id);
    if (apply && d && space) commit(space, d.from, d.to);
  };

  const grip = (space: Space, index: number, listRef: { current: HTMLUListElement | null }): ReorderGrip => ({
    onPointerDown: (event) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [])];
      const first = rows[0];
      if (event.button !== 0 || !first) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const pitch = rows[1] ? rows[1].offsetTop - first.offsetTop : first.offsetHeight;
      const next = { id: space.id, from: index, to: index, dy: 0, pitch, top: first.offsetTop, height: first.offsetHeight };
      dragRef.current = { ...next, startY: event.clientY };
      busy.current = true;
      setDrag(next);
    },
    onPointerMove: (event) => {
      const d = dragRef.current;
      if (!d) return;
      const last = spaces.length - 1;
      const dy = Math.max(-d.from * d.pitch, Math.min((last - d.from) * d.pitch, event.clientY - d.startY));
      const to = Math.max(0, Math.min(last, d.from + Math.round(dy / d.pitch)));
      dragRef.current = { ...d, dy, to };
      setDrag({ ...d, dy, to });
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onKeyDown: (event) => {
      if (event.key === 'Escape' && dragRef.current) end(false);
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const to = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (to >= 0 && to < spaces.length) {
          // React moves the focused row's node; keep the list open and the focus on the moved space's grip
          busy.current = true;
          commit(space, index, to);
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-reorder="${space.id}"]`)?.focus();
            busy.current = false;
          });
        }
      } else return;
      event.preventDefault();
      event.stopPropagation();
    },
  });

  /** Where row `i` is drawn while a row is dragged: the dragged row follows the pointer, the rows it passed make room. */
  const offset = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.pitch;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.pitch;
    return 0;
  };

  return { spaces, drag, grip, offset, busy, announcement };
}

/**
 * Space switcher of the dock: at rest only the active space is visible. Hover (with intent delay), keyboard focus or a tap
 * reveals all spaces in a floating glass list beside the dock; choosing one closes it again. The list is a child of the
 * switcher, so moving the pointer from trigger into the list never leaves the hover zone.
 */
function SpaceSwitcher() {
  const { state, dispatch, library } = usePreview();
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const skipFocusOpen = useRef(false);
  const activeId: SpaceId | null = state.location.type === 'space' ? state.location.spaceId : state.lastSpaceId;
  const active = (activeId ? library.getSpace(activeId) : undefined) ?? library.spaces[0];
  const inSpace = state.location.type === 'space';
  const reorder = useSpaceReorder();
  const spaces = reorder.spaces;
  const listRef = useGlider<HTMLUListElement>('[aria-current="true"]', [activeId, open, spaces.map((sp) => sp.id).join()]);

  const schedule = (next: boolean) => {
    // a reorder in progress keeps the list open, wherever the pointer or focus wanders meanwhile
    if (!next && reorder.busy.current) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), next ? OPEN_DELAY : CLOSE_DELAY);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.parentElement?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (id: SpaceId) => {
    clearTimeout(timer.current);
    setOpen(false);
    dispatch({ type: 'navigate', location: { type: 'space', spaceId: id } });
    skipFocusOpen.current = true;
    triggerRef.current?.focus({ preventScroll: true });
  };

  // Dragging a card over the switcher opens the list so every space becomes a drop target.
  const onDragEnter = () => {
    if (currentDrag()) {
      clearTimeout(timer.current);
      setOpen(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(event.currentTarget.querySelectorAll<HTMLButtonElement>('.cb-spaces-flyout__item'))];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' && open) {
      setOpen(false);
      skipFocusOpen.current = true;
      triggerRef.current?.focus({ preventScroll: true });
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && document.activeElement === triggerRef.current) {
      setOpen(true);
      requestAnimationFrame(() => event.currentTarget?.querySelector<HTMLButtonElement>('.cb-spaces-flyout__item')?.focus());
    } else if (event.key === 'ArrowDown' && index >= 0) items[(index + 1) % items.length]?.focus();
    else if (event.key === 'ArrowUp' && index >= 0) items[(index - 1 + items.length) % items.length]?.focus();
    else if (event.key === 'ArrowLeft' && index >= 0) triggerRef.current?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (!active) return null;

  return (
    <div
      className="cb-space-switch"
      data-open={open || undefined}
      onPointerEnter={(event) => event.pointerType === 'mouse' && schedule(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && schedule(false)}
      onDragEnter={onDragEnter}
      onDragLeave={(event) => {
        if (currentDrag() && !event.currentTarget.contains(event.relatedTarget as Node | null)) schedule(false);
      }}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!reorder.busy.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="cb-navdock__item cb-space-switch__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="cb-spaces-flyout"
        aria-current={inSpace ? 'page' : undefined}
        aria-label={`Space: ${active.name}. Space wechseln`}
        title={active.name}
        style={{ '--cb-swatch': spaceColorVar(active.color) } as CSSProperties}
        onFocus={(event) => {
          if (skipFocusOpen.current) skipFocusOpen.current = false;
          else if (event.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onClick={(event) => {
          clearTimeout(timer.current);
          // Mouse users already opened it by hovering; a click keeps it open. Touch and keyboard toggle.
          setOpen((v) => (event.detail > 0 && matchMedia('(hover: hover)').matches ? true : !v));
        }}
      >
        <SpaceGlyph icon={active.icon} name={active.name} color={active.color} size={30} className="cb-space-switch__swatch" />
        <span className="cb-navdock__label cb-space-switch__name">{active.name}</span>
        <Icon name="chevronRight" size={14} className="cb-space-switch__chevron" />
      </button>
      <div id="cb-spaces-flyout" className="cb-spaces-flyout" role="group" aria-label="Spaces" inert={!open} data-cb-context="spaces">
        <p className="cb-spaces-flyout__title">Spaces</p>
        <ul ref={listRef} className="cb-spaces-flyout__list" data-reordering={reorder.drag ? '' : undefined}>
          <span className="cb-glider cb-spaces-flyout__glider" aria-hidden="true" />
          {reorder.drag && <span className="cb-spaces-flyout__slot" aria-hidden="true" style={{ top: reorder.drag.top + reorder.drag.to * reorder.drag.pitch, height: reorder.drag.height }} />}
          {spaces.map((space, i) => (
            <FlyoutSpace
              key={space.id}
              space={space}
              index={i}
              current={space.id === active.id}
              count={library.listItems({ type: 'space', spaceId: space.id }).length}
              onChoose={() => choose(space.id)}
              grip={reorder.grip(space, i, listRef)}
              offset={reorder.offset(i)}
              lifted={reorder.drag?.id === space.id}
            />
          ))}
        </ul>
        <span id="cb-spaces-reorder-hint" hidden>
          Ziehen oder mit Pfeil nach oben und unten verschieben.
        </span>
        <span className="cb-visually-hidden" role="status">
          {reorder.announcement}
        </span>
        <div className="cb-spaces-flyout__foot">
          <button
            type="button"
            className="cb-spaces-flyout__item cb-spaces-flyout__item--new"
            onClick={() => {
              setOpen(false);
              dispatch({ type: 'openModal', modal: { kind: 'space-new' } });
            }}
          >
            <span className="cb-spaces-flyout__plus" aria-hidden="true">
              <Icon name="plus" size={16} />
            </span>
            <span className="cb-spaces-flyout__name">Neuer Space</span>
          </button>
          <button
            type="button"
            className="cb-spaces-flyout__item cb-spaces-flyout__item--new"
            onClick={() => {
              setOpen(false);
              dispatch({ type: 'openModal', modal: { kind: 'space-edit', spaceId: active.id } });
            }}
          >
            <span className="cb-spaces-flyout__plus" aria-hidden="true">
              <Icon name="sliders" size={16} />
            </span>
            <span className="cb-spaces-flyout__name">„{active.name}“ bearbeiten</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Keeps the dock on the viewport centre: at rest its whole box is centred (the same reference the right dock uses, so both
 * docks share one vertical midpoint). Unfolding, the core (active space + board actions) holds that position and the dock
 * grows up and down around it, so whatever is under the pointer never slides away. The offset between the rest box centre
 * and the core centre is measured whenever the dock is at rest; a ResizeObserver re-measures while the folds move.
 */
function useCoreAnchor() {
  const railRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rail = railRef.current;
    const core = coreRef.current;
    if (!rail || !core) return;
    let restOffset = 0;
    const update = () => {
      const dock = core.parentElement;
      const coreCentre = core.offsetTop + core.offsetHeight / 2;
      const folded = (dock?.querySelector<HTMLElement>('.cb-navdock__more--top')?.offsetHeight ?? 0) < 0.5;
      if (dock && folded && !rail.matches(':hover, :has(:focus-visible), [data-expanded]')) restOffset = dock.offsetHeight / 2 - coreCentre;
      rail.style.setProperty('--cb-dock-anchor', `${coreCentre + restOffset}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(core.parentElement ?? core);
    return () => observer.disconnect();
  }, []);
  return { railRef, coreRef };
}

/**
 * Floating Dock (Orange Squircle run): one compact squircle on the left edge. At rest it shows the brand, the active space
 * and the two most-used board actions. Hover or keyboard focus grows it around that core — quick access unfolds above,
 * utilities below — with labels, as an overlay that never moves the board. Hidden on phones, where the drawer and the
 * mobile dock take over (D-030).
 */
export function Dock() {
  const { state, dispatch, library } = usePreview();
  const { location } = state;
  const go = (next: Location) => dispatch({ type: 'navigate', location: next });
  const isCollection = (id: CollectionId) => location.type === 'collection' && location.collectionId === id;
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = state.prefs.theme === 'dark' || (state.prefs.theme === 'system' && prefersDark);
  const { railRef, coreRef } = useCoreAnchor();
  // Touch/keyboard fallback for the hover expansion: the brand toggles the dock open; any outside tap closes it.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded, railRef]);
  const run = (action: () => void) => () => {
    setExpanded(false);
    action();
  };

  return (
    <aside ref={railRef} className="cb-navdock-rail" aria-label="Navigation" data-expanded={expanded || undefined}>
      <div className="cb-navdock">
        <button
          type="button"
          className="cb-navdock__brand"
          aria-expanded={expanded}
          aria-label={expanded ? 'Navigation einklappen' : 'Navigation ausklappen'}
          title="CopyBoard"
          onClick={() => setExpanded((v) => !v)}
        >
          <BrandMark size={38} />
          <span className="cb-navdock__label cb-navdock__brand-name">CopyBoard</span>
        </button>
        {/* Folds unfold via grid rows 0fr → 1fr, so the height glides instead of jumping. */}
        <div className="cb-navdock__more cb-navdock__more--top">
          <div>
            <nav aria-label="Schnellzugriff" className="cb-navdock__group">
              {library.collections.map((collection, i) => (
                <DockButton
                  key={collection.id}
                  icon={collectionIcon[collection.id]}
                  label={collection.name}
                  index={i}
                  current={isCollection(collection.id)}
                  onClick={run(() => go({ type: 'collection', collectionId: collection.id }))}
                />
              ))}
            </nav>
            <span className="cb-navdock__divider" aria-hidden="true" />
          </div>
        </div>
        <div ref={coreRef} className="cb-navdock__core">
          <SpaceSwitcher />
          <DockButton icon="search" label="Suchen" hint={shortcut('K')} index={4} onClick={run(() => dispatch({ type: 'openOverlay', overlay: 'search' }))} />
          <DockButton icon="plus" label="Neu erstellen" index={5} onClick={run(() => dispatch({ type: 'openModal', modal: { kind: 'create' } }))} />
        </div>
        {/* The active collection stays visible at rest, so the current location is never hidden (outside the anchored core). */}
        {location.type === 'collection' && (
          <span className="cb-navdock__current" aria-hidden="true">
            <Icon name={collectionIcon[location.collectionId]} size={19} />
          </span>
        )}
        <div className="cb-navdock__more">
          <div>
            <span className="cb-navdock__divider" aria-hidden="true" />
            <DockButton
              icon={dark ? 'sun' : 'moon'}
              label={dark ? 'Helles Design' : 'Dunkles Design'}
              index={6}
              onClick={() => dispatch({ type: 'setPreference', patch: { theme: dark ? 'light' : 'dark' } })}
            />
            <DockButton icon="sliders" label="Einstellungen" index={7} onClick={run(() => dispatch({ type: 'openSettings' }))} />
          </div>
        </div>
      </div>
    </aside>
  );
}
