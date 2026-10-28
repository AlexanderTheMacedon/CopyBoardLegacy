import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { usePreview } from '../../app/context';
import { isEditableTarget, PHONE_QUERY, useMediaQuery } from '../../app/hooks';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { usePresence, useScrollFade } from '../../components/motion';
import { SpaceGlyph } from '../../components/SpaceIcon';
import type { DragPayload } from '../../data/dnd';
import { isFolderId, type Folder, type Placement } from '../../domain/types';
import { useDragAutoScroll, useDropTarget } from '../dnd/useDragDrop';
import { BoardGrid, useOrderedIds } from '../grid/BoardGrid';
import { SelectionBar } from '../selection/SelectionBar';
import { useSelection } from '../selection/useSelection';
import { filterOptions, useLevelEntries } from '../shell/Board';
import { SortMenu, ViewTools } from '../shell/WorkspaceHeader';
import { useEntryActions } from '../workspace/useEntryActions';
import { folderTileButtonId } from './FolderTile';
import { takeFolderOrigin } from './folder-motion';

const EXIT_MS = 220;
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** One breadcrumb step; dropping entries on it moves them to that level. */
function Crumb({ placement, label, icon, current, onClick, children }: { placement: Placement; label: string; icon?: ReactNode; current?: boolean; onClick?: () => void; children?: ReactNode }) {
  const entries = useEntryActions();
  const { library } = usePreview();
  const drop = useDropTarget({
    accepts: (payload: DragPayload) =>
      !(payload.from.spaceId === placement.spaceId && payload.from.folderId === placement.folderId) &&
      !payload.ids.some((id) => isFolderId(id) && (id === placement.folderId || library.descendantFolders(id).some((f) => f.id === placement.folderId))),
    onDrop: (payload) => void entries.move(payload.ids, placement),
    armDelay: 60,
  });
  return (
    <li className="cb-crumb" data-drop={drop.over || undefined} data-current={current || undefined} {...drop.props}>
      <button type="button" className="cb-crumb__button" onClick={onClick} aria-current={current ? 'location' : undefined} title={label}>
        {icon}
        <span className="cb-crumb__label">{label}</span>
        {children}
      </button>
    </li>
  );
}

/**
 * Folder window: a large glass surface over the board that grows out of the folder tile it was opened from. Breadcrumb,
 * search inside the folder, sort, view switch, sub-folders, selection, drag & drop and context menus all work as on the
 * board. ⌘V stores new content inside the open folder; the inspector and editor stay available.
 */
export function FolderWindow({ folder, leaving }: { folder: Folder; leaving: boolean }) {
  const { state, dispatch, library } = usePreview();
  const entries = useEntryActions();
  const phone = useMediaQuery(PHONE_QUERY);
  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  useScrollFade(scrollRef);
  useDragAutoScroll(scrollRef);

  const space = library.getSpace(folder.spaceId);
  const path = library.folderPath(folder.id);
  const placement: Placement = { spaceId: folder.spaceId, folderId: folder.id };
  const level = library.listChildren(placement);
  const deepItems = library.folderItems(folder.id);
  const options = filterOptions(deepItems, true);
  const filter = options.some((o) => o.value === state.filter) ? state.filter : 'all';
  // A search looks through the whole subtree; without a query only this level is shown.
  const entriesShown = useLevelEntries(level.folders, query.trim() ? deepItems : level.items, filter, query);
  const orderedIds = useOrderedIds(entriesShown.folders, entriesShown.items);
  const selection = useSelection(orderedIds, { active: !leaving });
  const color = folder.color ?? space?.color;

  // Open motion: grow out of the tile that was clicked (its centre becomes the transform origin).
  useLayoutEffect(() => {
    const el = rootRef.current;
    const origin = takeFolderOrigin();
    if (!el) return;
    if (origin) {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--cb-origin-x', `${Math.round(origin.x - rect.left)}px`);
      el.style.setProperty('--cb-origin-y', `${Math.round(origin.y - rect.top)}px`);
    }
  }, []);

  useEffect(() => {
    setQuery('');
    scrollRef.current?.scrollTo({ top: 0 });
    const frame = requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [folder.id]);

  const close = () => {
    dispatch({ type: 'openFolder', folderId: null });
    requestAnimationFrame(() => document.getElementById(folderTileButtonId(folder.id))?.focus({ preventScroll: true }));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (isEditableTarget(event.target) && query) {
      setQuery('');
      event.preventDefault();
      return;
    }
    if (selection.active) return; // the selection hook clears first
    event.preventDefault();
    close();
  };

  const crumbIcon = (f: Folder) => <SpaceGlyph icon={f.icon ?? 'lucide:folder'} name={f.name} color={f.color ?? space?.color} size={22} bare />;
  const countLabel = deepItems.length === 1 ? '1 Inhalt' : `${deepItems.length} Inhalte`;

  return (
    <section
      ref={rootRef}
      className="cb-folder-window"
      role="region"
      aria-labelledby="cb-folder-title"
      data-cb-context="folder"
      data-leaving={leaving || undefined}
      inert={leaving}
      style={{ '--cb-folder-tint': color ? `var(--cb-space-${color})` : undefined } as CSSProperties}
      onKeyDown={onKeyDown}
      onClick={selection.onSurfaceClick}
    >
      <header className="cb-folder-window__header">
        <nav className="cb-crumbs" aria-label="Pfad">
          <ol>
            {space && (
              <Crumb placement={{ spaceId: space.id, folderId: null }} label={space.name} icon={<SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={22} />} onClick={close} />
            )}
            {path.slice(0, -1).map((f) => (
              <Crumb key={f.id} placement={{ spaceId: f.spaceId, folderId: f.id }} label={f.name} icon={crumbIcon(f)} onClick={() => dispatch({ type: 'openFolder', folderId: f.id })} />
            ))}
            <Crumb placement={placement} label={folder.name} current onClick={() => entries.editFolder(folder.id)}>
              <Icon name="chevronDown" size={14} className="cb-crumb__caret" />
            </Crumb>
          </ol>
        </nav>
        <div className="cb-folder-window__tools">
          <label className="cb-folder-search">
            <Icon name="search" size={16} />
            <span className="cb-visually-hidden">Im Ordner suchen</span>
            <input type="search" value={query} placeholder="Im Ordner suchen …" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <SortMenu />
          <ViewTools compact={phone} />
          <IconButton icon="folderPlus" label="Neuer Unterordner" className="cb-tool cb-tool--accent" onClick={() => entries.openNewFolder(placement)} />
          <IconButton icon="x" label="Ordner schließen" className="cb-folder-window__close" onClick={close} />
        </div>
      </header>
      <div ref={scrollRef} className="cb-folder-window__body cb-scroll">
        <div key={folder.id} className="cb-folder-window__content">
          <div className="cb-folder-window__title">
            <SpaceGlyph icon={folder.icon ?? 'lucide:folder'} name={folder.name} color={color} size={54} className="cb-folder-window__big-glyph" />
            <div>
              <h2 id="cb-folder-title" ref={titleRef} tabIndex={-1}>
                {folder.name}
              </h2>
              <p className="cb-folder-window__meta">
                {countLabel}
                {level.folders.length ? ` · ${level.folders.length === 1 ? '1 Unterordner' : `${level.folders.length} Unterordner`}` : ''}
                <span className="cb-folder-window__paste" aria-hidden="true">
                  <kbd className="cb-kbd">{isMac() ? '⌘V' : 'Strg V'}</kbd> speichert hier
                </span>
              </p>
            </div>
          </div>
          {orderedIds.length ? (
            <BoardGrid folders={entriesShown.folders} items={entriesShown.items} label={`Inhalte in ${folder.name}`} placement={placement} selection={selection} />
          ) : (
            <div className="cb-empty cb-empty--folder" data-variant="folder-empty">
              <div className="cb-empty__art" aria-hidden="true">
                <Icon name={query ? 'search' : 'folderOpen'} size={30} />
              </div>
              <h3 className="cb-empty__title">{query ? `Nichts zu „${query}“` : 'Dieser Ordner ist noch leer'}</h3>
              <p className="cb-empty__text">
                {query ? 'Im Ordner und seinen Unterordnern gibt es keinen passenden Inhalt.' : 'Ziehe Karten hierher, wähle „Verschieben“ in einem Kartenmenü oder drücke ⌘V, um Inhalte direkt hier abzulegen.'}
              </p>
            </div>
          )}
        </div>
      </div>
      <SelectionBar selection={selection} orderedIds={orderedIds} placement={placement} />
    </section>
  );
}

/** Mounts the folder window with an exit transition; hidden while the editor owns the stage. */
export function FolderLayer() {
  const { state, library, dispatch } = usePreview();
  const folder = state.openFolderId && !state.composerItemId ? library.getFolder(state.openFolderId) : undefined;
  const shown = usePresence(folder, EXIT_MS);
  // A folder deleted elsewhere (or missing after reload) closes its window.
  useEffect(() => {
    if (state.openFolderId && !library.getFolder(state.openFolderId)) dispatch({ type: 'openFolder', folderId: null });
  }, [state.openFolderId, library, dispatch]);
  if (!shown.value) return null;
  return (
    <>
      <button type="button" className="cb-folder-veil" aria-label="Ordner schließen" tabIndex={-1} data-leaving={shown.leaving || undefined} onClick={() => dispatch({ type: 'openFolder', folderId: null })} />
      <FolderWindow folder={shown.value} leaving={shown.leaving} />
    </>
  );
}
