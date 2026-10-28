import { useMemo, useState } from 'react';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import type { ReadOnlyLibrary } from '../../domain/library';
import { isEditable, type Folder, type Item, type SpaceId } from '../../domain/types';
import { kindIcon, kindLabel } from '../items/item-meta';

/** One folder of the tree with only what the editors can open below it. */
interface FolderNode {
  readonly folder: Folder;
  readonly folders: readonly FolderNode[];
  readonly items: readonly Item[];
}

const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' });

/** The space's folders and editable items (document, text, Markdown, code); folders without any are left out. */
export function explorerTree(library: ReadOnlyLibrary, spaceId: SpaceId, folderId: Folder['id'] | null = null, depth = 0): { folders: FolderNode[]; items: Item[] } {
  const children = library.listChildren({ spaceId, folderId });
  const folders: FolderNode[] = [];
  // a corrupted parent chain must never recurse forever
  if (depth < 32)
    for (const folder of children.folders) {
      const sub = explorerTree(library, spaceId, folder.id, depth + 1);
      if (sub.items.length || sub.folders.length) folders.push({ folder, ...sub });
    }
  return { folders, items: children.items.filter(isEditable).sort(byTitle) };
}

interface ExplorerProps {
  readonly item: Item;
  /** Opens another item in the Canvas; resolves after the current edits are saved (or refuses to switch). */
  readonly onOpen: (id: string) => void;
  readonly onClose: () => void;
}

/**
 * Explorer: the real spaces, folders and editable items of CopyBoard as a slim, collapsible tree next to the editor. No
 * file system and no second storage — it reads the library and switches the Canvas, which saves the current edits first.
 */
export function EditorExplorer({ item, onOpen, onClose }: ExplorerProps) {
  const { library } = usePreview();
  const [spaceId, setSpaceId] = useState<SpaceId>(item.spaceId);
  const tree = useMemo(() => explorerTree(library, spaceId), [library, spaceId]);
  // the active file's folders start open; everything else is a click away
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(item.folderId ? library.folderPath(item.folderId).map((f) => f.id) : []));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const renderItems = (items: readonly Item[]) =>
    items.map((entry) => {
      const active = entry.id === item.id;
      return (
        <li key={entry.id}>
          <button
            type="button"
            className="cb-explorer__row cb-explorer__file"
            data-kind={entry.kind}
            aria-current={active ? 'page' : undefined}
            title={`${entry.title} · ${kindLabel[entry.kind]}`}
            onClick={() => !active && onOpen(entry.id)}
          >
            <Icon name={kindIcon[entry.kind]} size={15} />
            <span className="cb-explorer__name">{entry.title}</span>
          </button>
        </li>
      );
    });

  const renderFolders = (nodes: readonly FolderNode[]) =>
    nodes.map((node) => {
      const expanded = open.has(node.folder.id);
      return (
        <li key={node.folder.id}>
          <button type="button" className="cb-explorer__row cb-explorer__folder" aria-expanded={expanded} onClick={() => toggle(node.folder.id)}>
            <Icon name="chevronRight" size={13} className="cb-explorer__chevron" />
            <Icon name={expanded ? 'folderOpen' : 'folder'} size={15} />
            <span className="cb-explorer__name">{node.folder.name}</span>
          </button>
          <div className="cb-explorer__fold" data-open={expanded || undefined} inert={!expanded}>
            <ul className="cb-explorer__list">
              {renderFolders(node.folders)}
              {renderItems(node.items)}
            </ul>
          </div>
        </li>
      );
    });

  const empty = !tree.folders.length && !tree.items.length;
  return (
    <nav className="cb-explorer" aria-labelledby="cb-explorer-title">
      <div className="cb-explorer__header">
        <h3 id="cb-explorer-title">Explorer</h3>
        <IconButton icon="x" size="sm" label="Explorer schließen" onClick={onClose} />
      </div>
      <label className="cb-select cb-explorer__space">
        <span className="cb-visually-hidden">Space</span>
        <select value={spaceId} onChange={(event) => setSpaceId(event.target.value as SpaceId)}>
          {library.spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      <div className="cb-explorer__scroll cb-scroll">
        {empty ? (
          <p className="cb-explorer__empty">Keine Texte, Dokumente oder Code in diesem Space.</p>
        ) : (
          <ul className="cb-explorer__list">
            {renderFolders(tree.folders)}
            {renderItems(tree.items)}
          </ul>
        )}
      </div>
    </nav>
  );
}
