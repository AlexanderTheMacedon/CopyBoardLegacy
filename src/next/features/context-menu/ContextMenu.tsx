import { useEffect, useLayoutEffect, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePreview } from '../../app/context';
import { isEditableTarget } from '../../app/hooks';
import { Icon, type IconName } from '../../components/Icon';
import { useGlider, usePresence } from '../../components/motion';
import { ClipboardAccessError, readSystemClipboard } from '../../data/clipboard';
import type { Item } from '../../domain/types';
import { focusCapture } from '../capture/SmartCapture';
import { useCapture } from '../capture/useCapture';
import { itemActions } from '../items/item-actions';
import { useRunItemAction } from '../items/useItemActions';

interface Entry {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly shortcut?: string;
  readonly danger?: boolean;
  /** Starts a new group (hairline divider above). */
  readonly group?: boolean;
  readonly run: () => void;
}

interface MenuRequest {
  readonly x: number;
  readonly y: number;
  readonly itemId: string | null;
  readonly returnFocus: HTMLElement | null;
}

const EXIT_MS = 160;
const EDGE = 8;
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Board and card context menu (P0). Editable fields, the editor and selected text keep the browser's native menu. */
export function ContextMenu() {
  const { state, dispatch, library, notify } = usePreview();
  const capture = useCapture();
  const runAction = useRunItemAction();
  const [request, setRequest] = useState<MenuRequest | null>(null);
  const shown = usePresence(request ?? undefined, EXIT_MS);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; origin: string } | null>(null);
  const menuRef = useGlider<HTMLDivElement>('[data-active="true"]', [active, shown.value]);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('#cb-main') || target.closest('.cb-composer') || isEditableTarget(target)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return;
      event.preventDefault();
      const tile = target.closest<HTMLElement>('[data-item-id]');
      let { clientX: x, clientY: y } = event;
      // Keyboard (context-menu key, Shift+F10) reports no pointer position: anchor at the focused element.
      if (!x && !y) {
        const rect = (tile ?? target).getBoundingClientRect();
        x = rect.left + Math.min(32, rect.width / 2);
        y = rect.top + Math.min(32, rect.height / 2);
      }
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setActive(0);
      setPosition(null);
      setRequest({ x, y, itemId: tile?.dataset.itemId ?? null, returnFocus: focused });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  const close = (restoreFocus = true) => {
    if (restoreFocus) request?.returnFocus?.focus({ preventScroll: true });
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setRequest(null);
    };
    const dismiss = () => setRequest(null);
    // Escape closes even if focus never reached the menu (e.g. the window lost focus meanwhile).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      request.returnFocus?.focus({ preventScroll: true });
      setRequest(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, [request, menuRef]);

  // Clamp to the viewport once the menu has its real size; open towards the free side.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!request || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const flipX = request.x + width > innerWidth - EDGE;
    const flipY = request.y + height > innerHeight - EDGE;
    setPosition({
      left: Math.max(EDGE, flipX ? request.x - width : request.x),
      top: Math.max(EDGE, flipY ? Math.min(request.y - height, innerHeight - EDGE - height) : request.y),
      origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`,
    });
  }, [request, menuRef]);

  // Focus moves in only once the menu is placed and visible (a hidden element cannot take focus).
  useEffect(() => {
    if (request && position) menuRef.current?.querySelector<HTMLElement>('[data-active]')?.focus({ preventScroll: true });
  }, [request, position, menuRef]);

  const retained = shown.value;
  const item: Item | undefined = retained?.itemId ? library.getItem(retained.itemId) : undefined;

  const pasteFromMenu = async () => {
    try {
      await capture(await readSystemClipboard());
    } catch (error) {
      const key = isMac() ? '⌘V' : 'Strg+V';
      notify(
        error instanceof ClipboardAccessError && error.reason === 'denied'
          ? `Der Browser hat den Zugriff auf die Zwischenablage abgelehnt. Mit ${key} funktioniert Einfügen immer.`
          : `Dieser Browser erlaubt Einfügen nur per Tastatur: ${key} drücken.`,
      );
    }
  };

  const entries: Entry[] = item
    ? itemActions(item, state.location, { withOpen: true }).map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        danger: action.danger,
        group: action.danger || action.id === 'favorite',
        run: () => runAction(action, item),
      }))
    : [
        { id: 'paste', label: 'Einfügen', icon: 'clipboard', shortcut: isMac() ? '⌘V' : 'Strg V', run: () => void pasteFromMenu() },
        { id: 'new', label: 'Neuer Eintrag', icon: 'plus', run: () => requestAnimationFrame(focusCapture) },
        { id: 'search', label: 'Suchen', icon: 'search', shortcut: isMac() ? '⌘K' : 'Strg K', group: true, run: () => dispatch({ type: 'openOverlay', overlay: 'search' }) },
        state.prefs.view === 'grid'
          ? { id: 'view', label: 'Als Liste anzeigen', icon: 'list', run: () => dispatch({ type: 'setPreference', patch: { view: 'list' } }) }
          : { id: 'view', label: 'Als Raster anzeigen', icon: 'grid', run: () => dispatch({ type: 'setPreference', patch: { view: 'grid' } }) },
        { id: 'settings', label: 'Einstellungen', icon: 'sliders', run: () => dispatch({ type: 'openSettings' }) },
      ];

  if (!retained) return null;

  const activate = (entry: Entry) => {
    // Menu commands that move focus elsewhere (capture, dialogs) must not get it stolen back.
    close(entry.id === 'open' || entry.id === 'copy' || entry.id === 'favorite' || entry.id === 'download');
    entry.run();
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const move = (index: number) => {
      const next = (index + entries.length) % entries.length;
      setActive(next);
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[next]?.focus({ preventScroll: true });
    };
    if (event.key === 'ArrowDown') move(active + 1);
    else if (event.key === 'ArrowUp') move(active - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(entries.length - 1);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const style = {
    left: position?.left ?? retained.x,
    top: position?.top ?? retained.y,
    transformOrigin: position?.origin ?? 'top left',
    visibility: position ? undefined : 'hidden',
  } as CSSProperties;

  return (
    <div
      ref={menuRef}
      className="cb-context-menu"
      role="menu"
      aria-label={item ? `Aktionen für ${item.title}` : 'Board-Aktionen'}
      data-leaving={shown.leaving || undefined}
      inert={shown.leaving}
      style={style}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="cb-glider cb-context-menu__glider" data-danger={entries[active]?.danger || undefined} aria-hidden="true" />
      {item && <p className="cb-context-menu__title">{item.title}</p>}
      {entries.map((entry, index) => (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          tabIndex={index === active ? 0 : -1}
          className="cb-context-menu__item"
          data-active={index === active || undefined}
          data-danger={entry.danger || undefined}
          data-group={(entry.group && index > 0) || undefined}
          onPointerMove={() => index !== active && setActive(index)}
          onFocus={() => index !== active && setActive(index)}
          onClick={() => activate(entry)}
        >
          <Icon name={entry.icon} size={16} />
          <span>{entry.label}</span>
          {entry.shortcut && <kbd className="cb-context-menu__kbd">{entry.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
