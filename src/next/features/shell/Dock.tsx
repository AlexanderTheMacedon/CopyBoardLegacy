import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { usePreview } from '../../app/context';
import { useMediaQuery } from '../../app/hooks';
import { BrandMark } from '../../components/BrandMark';
import { Icon, type IconName } from '../../components/Icon';
import { useGlider } from '../../components/motion';
import { SpaceGlyph, spaceColorVar } from '../../components/SpaceIcon';
import { currentDrag } from '../../data/dnd';
import type { CollectionId, Location, Space, SpaceId } from '../../domain/types';
import { focusCapture } from '../capture/SmartCapture';
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

/** One space in the flyout: navigation target, drop target for cards and folders (moves them to that space's board). */
function FlyoutSpace({ space, index, current, count, onChoose }: { space: Space; index: number; current: boolean; count: number; onChoose: () => void }) {
  const entries = useEntryActions();
  const drop = useDropTarget({
    accepts: (payload) => !(payload.from.spaceId === space.id && payload.from.folderId === null),
    onDrop: (payload) => void entries.move(payload.ids, { spaceId: space.id, folderId: null }),
    armDelay: 60,
  });
  return (
    <li style={{ '--i': index } as CSSProperties} data-drop={drop.over || undefined} {...drop.props}>
      <button
        type="button"
        className="cb-spaces-flyout__item"
        aria-current={current ? 'true' : undefined}
        title={space.name}
        data-space-id={space.id}
        style={{ '--cb-swatch': spaceColorVar(space.color) } as CSSProperties}
        onClick={onChoose}
      >
        <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={30} className="cb-space-switch__swatch" />
        <span className="cb-spaces-flyout__name">{space.name}</span>
        <span className="cb-spaces-flyout__count" aria-label={`${count} Inhalte`}>
          {count}
        </span>
      </button>
    </li>
  );
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
  const listRef = useGlider<HTMLUListElement>('[aria-current="true"]', [activeId, open]);

  const schedule = (next: boolean) => {
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
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
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
        <ul ref={listRef} className="cb-spaces-flyout__list">
          <span className="cb-glider cb-spaces-flyout__glider" aria-hidden="true" />
          {library.spaces.map((space, i) => (
            <FlyoutSpace
              key={space.id}
              space={space}
              index={i}
              current={space.id === active.id}
              count={library.listItems({ type: 'space', spaceId: space.id }).length}
              onChoose={() => choose(space.id)}
            />
          ))}
        </ul>
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
 * Keeps the dock's core (active space + board actions) at a fixed height on screen: the rail is placed so that the core's
 * centre sits on the viewport centre, and a ResizeObserver re-measures while the folds unfold. The dock therefore grows up
 * and down around the core, and whatever is under the pointer never slides away.
 */
function useCoreAnchor() {
  const railRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rail = railRef.current;
    const core = coreRef.current;
    if (!rail || !core) return;
    const update = () => rail.style.setProperty('--cb-dock-anchor', `${core.offsetTop + core.offsetHeight / 2}px`);
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
          <DockButton icon="plus" label="Neuer Eintrag" index={5} onClick={run(() => requestAnimationFrame(focusCapture))} />
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
