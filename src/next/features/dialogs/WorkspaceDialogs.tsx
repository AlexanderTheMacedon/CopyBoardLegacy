import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { usePreview } from '../../app/context';
import { densityPreference, sortPreference, viewPreference } from '../../app/preferences';
import type { WorkspaceModal } from '../../app/state';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SpaceGlyph } from '../../components/SpaceIcon';
import { textItemToDocument } from '../../domain/document';
import { suggestIcon } from '../../domain/icons';
import { wouldCycle } from '../../app/operations';
import { isFolderId, isLocal, isLocalSpace, type Folder, type ItemId, type Placement, type Space, type SpaceColor, type SpaceIcon, type SpaceId, type SpacePrefs } from '../../domain/types';
import { useEntryActions } from '../workspace/useEntryActions';
import { ColorPicker, IconPicker } from './pickers';

const TITLE_ID = 'cb-modal-title';

function DialogFrame({ title, eyebrow, onClose, children, footer, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="cb-card-dialog" data-wide={wide || undefined}>
      <header className="cb-card-dialog__header">
        <div>
          {eyebrow && <p className="cb-card-dialog__eyebrow">{eyebrow}</p>}
          <h2 id={TITLE_ID}>{title}</h2>
        </div>
        <IconButton icon="x" label="Schließen" onClick={onClose} />
      </header>
      <div className="cb-card-dialog__body cb-scroll">{children}</div>
      {footer && <footer className="cb-card-dialog__footer">{footer}</footer>}
    </div>
  );
}

const useAutoFocus = () => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.select());
    return () => cancelAnimationFrame(frame);
  }, []);
  return ref;
};

// ---------------------------------------------------------------------------------------------------------------------
// Spaces

function SpaceForm({ space, onClose }: { space?: Space; onClose: () => void }) {
  const { library, workspace, notify, dispatch } = usePreview();
  const [name, setName] = useState(space?.name ?? '');
  const [icon, setIcon] = useState<SpaceIcon | undefined>(space?.icon);
  const [color, setColor] = useState<SpaceColor>(space?.color ?? 'peach');
  const [prefs, setPrefs] = useState<SpacePrefs>(space?.prefs ?? {});
  const [busy, setBusy] = useState(false);
  const nameRef = useAutoFocus();
  const index = space ? library.spaces.findIndex((s) => s.id === space.id) : -1;
  const pref = <K extends keyof SpacePrefs>(key: K, value: SpacePrefs[K] | undefined) => setPrefs((p) => ({ ...p, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (space) {
        await workspace.updateSpace(space.id, { name, icon, color, prefs });
        notify(`„${name.trim()}“ gespeichert`, { tone: 'success' });
      } else {
        const created = await workspace.createSpace({ name, icon, color, prefs });
        notify(`Space „${created.name}“ erstellt`, { tone: 'success' });
        dispatch({ type: 'navigate', location: { type: 'space', spaceId: created.id }, space: created });
      }
      onClose();
    } catch {
      notify('Der Space konnte nicht gespeichert werden.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (delta: number) => {
    if (!space) return;
    const ids = library.spaces.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(target, 0, space.id);
    try {
      await workspace.reorderSpaces(ids);
    } catch {
      notify('Die Reihenfolge konnte nicht gespeichert werden.', { tone: 'error' });
    }
  };

  const toggle = (key: keyof SpacePrefs, on: boolean) => (
    <button type="button" role="switch" aria-checked={on} className="cb-switch" onClick={() => pref(key, (on ? false : true) as never)}>
      <span className="cb-switch__thumb" />
    </button>
  );

  return (
    <form onSubmit={(e) => void submit(e)}>
      <DialogFrame
        title={space ? 'Space bearbeiten' : 'Neuer Space'}
        eyebrow={space ? (isLocalSpace(space) ? 'Eigener Space' : 'Beispiel-Space') : undefined}
        onClose={onClose}
        wide
        footer={
          <>
            {space && (
              <button type="button" className="cb-button cb-button--danger" disabled={library.spaces.length <= 1} onClick={() => dispatch({ type: 'openModal', modal: { kind: 'space-delete', spaceId: space.id } })}>
                <Icon name="trash" size={16} />
                Löschen
              </button>
            )}
            <span className="cb-card-dialog__spacer" />
            <button type="button" className="cb-button cb-button--ghost" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="cb-button cb-button--primary" disabled={!name.trim() || busy}>
              {space ? 'Speichern' : 'Erstellen'}
            </button>
          </>
        }
      >
        <div className="cb-form__hero">
          <SpaceGlyph icon={icon} name={name || 'Space'} color={color} size={64} className="cb-form__hero-glyph" />
          <div className="cb-field">
            <label htmlFor="cb-space-name">Name</label>
            <input ref={nameRef} id="cb-space-name" className="cb-input" value={name} maxLength={48} placeholder="z. B. Projekte" onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <section className="cb-form__section">
          <h3>Farbe</h3>
          <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
        </section>
        <section className="cb-form__section">
          <h3>Icon</h3>
          <IconPicker value={icon} onChange={setIcon} color={color} name={name || 'S'} />
        </section>
        <section className="cb-form__section">
          <h3>Voreinstellungen</h3>
          <div className="cb-form__rows">
            <div className="cb-form__row">
              <span>Bevorzugte Ansicht</span>
              <SegmentedControl label="Bevorzugte Ansicht" size="sm" options={[{ value: 'inherit', label: 'Wie global' }, ...viewPreference.options]} value={prefs.view ?? 'inherit'} onChange={(v) => pref('view', v === 'inherit' ? undefined : v)} />
            </div>
            <div className="cb-form__row">
              <span>Kartendichte</span>
              <SegmentedControl label="Kartendichte" size="sm" options={[{ value: 'inherit', label: 'Wie global' }, ...densityPreference.options]} value={prefs.density ?? 'inherit'} onChange={(v) => pref('density', v === 'inherit' ? undefined : v)} />
            </div>
            <div className="cb-form__row">
              <span>Standardsortierung</span>
              <SegmentedControl label="Standardsortierung" size="sm" options={[{ value: 'inherit', label: 'Wie global' }, ...sortPreference.options]} value={prefs.sort ?? 'inherit'} onChange={(v) => pref('sort', v === 'inherit' ? undefined : v)} />
            </div>
            <div className="cb-form__row">
              <span>Filterleiste beim Öffnen zeigen</span>
              {toggle('filtersVisible', !!prefs.filtersVisible)}
            </div>
          </div>
        </section>
        {space && library.spaces.length > 1 && (
          <section className="cb-form__section">
            <h3>Reihenfolge im Dock</h3>
            <div className="cb-form__row">
              <span>
                Position {index + 1} von {library.spaces.length}
              </span>
              <span className="cb-form__inline">
                <IconButton icon="arrowUp" size="sm" variant="subtle" label="Nach oben" disabled={index <= 0} onClick={() => void reorder(-1)} />
                <IconButton icon="arrowLeft" size="sm" variant="subtle" label="Nach unten" className="cb-rotate-down" disabled={index >= library.spaces.length - 1} onClick={() => void reorder(1)} />
              </span>
            </div>
          </section>
        )}
      </DialogFrame>
    </form>
  );
}

function SpaceDeleteForm({ spaceId, onClose }: { spaceId: SpaceId; onClose: () => void }) {
  const { library, workspace, notify, dispatch, state } = usePreview();
  const entries = useEntryActions();
  const space = library.getSpace(spaceId);
  const others = library.spaces.filter((s) => s.id !== spaceId);
  const [mode, setMode] = useState<'move' | 'delete'>('move');
  const [target, setTarget] = useState<SpaceId>(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  if (!space) return null;
  const items = library.listItems({ type: 'space', spaceId });
  const folders = library.folders.filter((f) => f.spaceId === spaceId).length;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bundle = await workspace.deleteSpace(spaceId, mode === 'move' ? { moveTo: target } : { deleteContents: true });
      if (state.location.type === 'space' && state.location.spaceId === spaceId) {
        const next = library.getSpace(target) ?? others[0];
        if (next) dispatch({ type: 'navigate', location: { type: 'space', spaceId: next.id }, space: next });
      }
      onClose();
      const removed = bundle.items.length + bundle.folders.length;
      notify(`Space „${space.name}“ gelöscht${mode === 'move' ? ` · Inhalte sind jetzt in „${library.getSpace(target)?.name}“` : ''}`, {
        tone: 'success',
        ...(removed ? { action: { label: 'Inhalte wiederherstellen', run: () => void entries.restore(bundle) } } : {}),
      });
    } catch {
      notify('Der Space konnte nicht gelöscht werden.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogFrame
      title={`„${space.name}“ löschen?`}
      eyebrow="Space"
      onClose={onClose}
      footer={
        <>
          <span className="cb-card-dialog__spacer" />
          <button type="button" className="cb-button cb-button--ghost" onClick={() => dispatch({ type: 'openModal', modal: { kind: 'space-edit', spaceId } })}>
            Zurück
          </button>
          <button type="button" className="cb-button cb-button--danger-solid" disabled={busy || (mode === 'move' && !target)} onClick={() => void run()}>
            <Icon name="trash" size={16} />
            Space löschen
          </button>
        </>
      }
    >
      <p className="cb-form__text">
        Der Space enthält {items.length === 1 ? '1 Inhalt' : `${items.length} Inhalte`}
        {folders ? ` und ${folders === 1 ? '1 Ordner' : `${folders} Ordner`}` : ''}.
      </p>
      <div className="cb-choice" role="radiogroup" aria-label="Was passiert mit den Inhalten?">
        <label className="cb-choice__option" data-checked={mode === 'move' || undefined}>
          <input type="radio" name="cb-space-delete" checked={mode === 'move'} onChange={() => setMode('move')} />
          <span className="cb-choice__body">
            <span className="cb-choice__title">Inhalte verschieben nach</span>
            <select className="cb-input cb-input--select" value={target} disabled={mode !== 'move'} onChange={(e) => setTarget(e.target.value)}>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="cb-choice__option cb-choice__option--danger" data-checked={mode === 'delete' || undefined}>
          <input type="radio" name="cb-space-delete" checked={mode === 'delete'} onChange={() => setMode('delete')} />
          <span className="cb-choice__body">
            <span className="cb-choice__title">Inhalte endgültig löschen</span>
            <span className="cb-choice__hint">Eigene Inhalte und Ordner werden entfernt; „Rückgängig“ ist danach nur kurz möglich.</span>
          </span>
        </label>
      </div>
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Folders

function FolderForm({ folder, placement, entryIds, onClose }: { folder?: Folder; placement: Placement; entryIds?: readonly string[]; onClose: () => void }) {
  const { library, workspace, notify, dispatch } = usePreview();
  const entries = useEntryActions();
  const [name, setName] = useState(folder?.name ?? '');
  const [icon, setIcon] = useState<SpaceIcon | undefined>(folder?.icon);
  const [touchedIcon, setTouchedIcon] = useState(!!folder);
  const [color, setColor] = useState<SpaceColor | undefined>(folder?.color);
  const [busy, setBusy] = useState(false);
  const nameRef = useAutoFocus();
  const space = library.getSpace(placement.spaceId);
  const parent = placement.folderId ? library.getFolder(placement.folderId) : undefined;
  const tint = color ?? space?.color;

  const onName = (value: string) => {
    setName(value);
    if (!touchedIcon) setIcon(suggestIcon(value));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (folder) {
        await workspace.updateFolder(folder.id, { name, icon, color });
        notify(`Ordner „${name.trim() || folder.name}“ gespeichert`, { tone: 'success' });
      } else {
        const { folder: created, moved } = await workspace.createFolder({ ...placement, parentId: placement.folderId, name, icon, color }, entryIds ?? []);
        // The moved entries left this level; the selection goes with them.
        if (entryIds?.length) dispatch({ type: 'clearSelection' });
        notify(entryIds?.length ? `Ordner „${created.name}“ mit ${moved === 1 ? '1 Eintrag' : `${moved} Einträgen`} erstellt` : `Ordner „${created.name}“ erstellt`, {
          tone: 'success',
          action: { label: 'Öffnen', run: () => entries.openFolder(created.id) },
        });
      }
      onClose();
    } catch {
      notify('Der Ordner konnte nicht gespeichert werden.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const where = parent ? `${space?.name} › ${parent.name}` : space?.name;
  return (
    <form onSubmit={(e) => void submit(e)}>
      <DialogFrame
        title={folder ? 'Ordner bearbeiten' : 'Neuer Ordner'}
        eyebrow={folder ? `in ${where}` : entryIds?.length ? `${entryIds.length === 1 ? '1 Eintrag wird' : `${entryIds.length} Einträge werden`} hinein verschoben · ${where}` : `in ${where}`}
        onClose={onClose}
        footer={
          <>
            <span className="cb-card-dialog__spacer" />
            <button type="button" className="cb-button cb-button--ghost" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="cb-button cb-button--primary" disabled={busy}>
              {folder ? 'Speichern' : 'Erstellen'}
            </button>
          </>
        }
      >
        <div className="cb-form__hero">
          <SpaceGlyph icon={icon ?? 'lucide:folder'} name={name || 'Ordner'} color={tint} size={64} className="cb-form__hero-glyph" />
          <div className="cb-field">
            <label htmlFor="cb-folder-name">Name</label>
            <input ref={nameRef} id="cb-folder-name" className="cb-input" value={name} maxLength={64} placeholder="Neuer Ordner" onChange={(e) => onName(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <section className="cb-form__section">
          <h3>Farbe</h3>
          <ColorPicker value={color} onChange={setColor} allowNone />
        </section>
        <section className="cb-form__section">
          <h3>Icon</h3>
          <IconPicker
            value={icon}
            onChange={(next) => {
              setTouchedIcon(true);
              setIcon(next);
            }}
            color={tint}
            name={name || 'O'}
            compact
          />
        </section>
      </DialogFrame>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Move

function MoveForm({ entryIds, onClose }: { entryIds: readonly string[]; onClose: () => void }) {
  const { library } = usePreview();
  const entries = useEntryActions();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(library.spaces.map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const movingFolders = entryIds.filter(isFolderId);
  const first = entryIds[0];
  const from: Placement | undefined = first ? (isFolderId(first) ? (() => { const f = library.getFolder(first); return f ? { spaceId: f.spaceId, folderId: f.parentId } : undefined; })() : (() => { const i = library.getItem(first); return i ? { spaceId: i.spaceId, folderId: i.folderId ?? null } : undefined; })()) : undefined;

  const disabledFor = (placement: Placement) =>
    (from?.spaceId === placement.spaceId && from.folderId === placement.folderId) || movingFolders.some((id) => wouldCycle(library, id, placement.folderId));

  const choose = async (placement: Placement) => {
    if (busy) return;
    setBusy(true);
    const ok = await entries.move(entryIds, placement);
    setBusy(false);
    if (ok) onClose();
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderFolders = (spaceId: SpaceId, parentId: string | null, depth: number): ReactNode =>
    library.listChildren({ spaceId, folderId: parentId }).folders.map((folder) => {
      const children = library.listChildren({ spaceId, folderId: folder.id }).folders;
      const open = expanded.has(folder.id);
      const disabled = disabledFor({ spaceId, folderId: folder.id });
      return (
        <li key={folder.id}>
          <div className="cb-tree__row" style={{ '--depth': depth } as CSSProperties} data-disabled={disabled || undefined}>
            {children.length ? (
              <button type="button" className="cb-tree__twisty" aria-expanded={open} aria-label={open ? 'Zuklappen' : 'Aufklappen'} onClick={() => toggleExpanded(folder.id)}>
                <Icon name="chevronRight" size={14} />
              </button>
            ) : (
              <span className="cb-tree__twisty" />
            )}
            <button type="button" className="cb-tree__target" disabled={disabled} onClick={() => void choose({ spaceId, folderId: folder.id })}>
              <SpaceGlyph icon={folder.icon ?? 'lucide:folder'} name={folder.name} color={folder.color ?? library.getSpace(spaceId)?.color} size={24} />
              <span>{folder.name}</span>
            </button>
          </div>
          {open && children.length > 0 && <ul>{renderFolders(spaceId, folder.id, depth + 1)}</ul>}
        </li>
      );
    });

  return (
    <DialogFrame title="Verschieben nach" eyebrow={entries.describe(entryIds)} onClose={onClose}>
      <ul className="cb-tree" role="tree" aria-label="Ziele">
        {library.spaces.map((space) => {
          const open = expanded.has(space.id);
          const root: Placement = { spaceId: space.id, folderId: null };
          const hasFolders = library.listChildren(root).folders.length > 0;
          return (
            <li key={space.id} className="cb-tree__space">
              <div className="cb-tree__row cb-tree__row--space" data-disabled={disabledFor(root) || undefined}>
                {hasFolders ? (
                  <button type="button" className="cb-tree__twisty" aria-expanded={open} aria-label={open ? 'Zuklappen' : 'Aufklappen'} onClick={() => toggleExpanded(space.id)}>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ) : (
                  <span className="cb-tree__twisty" />
                )}
                <button type="button" className="cb-tree__target" disabled={disabledFor(root)} onClick={() => void choose(root)}>
                  <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={26} />
                  <span>{space.name}</span>
                  <span className="cb-tree__hint">Board-Ebene</span>
                </button>
              </div>
              {open && hasFolders && <ul>{renderFolders(space.id, null, 1)}</ul>}
            </li>
          );
        })}
      </ul>
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Delete confirmation

function ConfirmDeleteForm({ entryIds, onClose }: { entryIds: readonly string[]; onClose: () => void }) {
  const { library } = usePreview();
  const entries = useEntryActions();
  const folders = entryIds.filter(isFolderId);
  const nested = folders.reduce((sum, id) => sum + library.folderItems(id).length, 0);
  const fixtures = entryIds.filter((id) => !isFolderId(id) && library.getItem(id) && library.getItem(id)?.origin !== 'local').length + folders.reduce((sum, id) => sum + library.folderItems(id).filter((i) => i.origin !== 'local').length, 0);
  const label = entries.describe(entryIds);
  return (
    <DialogFrame
      title={`${label} löschen?`}
      eyebrow="Löschen"
      onClose={onClose}
      footer={
        <>
          <span className="cb-card-dialog__spacer" />
          <button type="button" className="cb-button cb-button--ghost" onClick={onClose} autoFocus>
            Abbrechen
          </button>
          <button
            type="button"
            className="cb-button cb-button--danger-solid"
            onClick={() => {
              onClose();
              void entries.deleteNow(entryIds);
            }}
          >
            <Icon name="trash" size={16} />
            Löschen
          </button>
        </>
      }
    >
      <p className="cb-form__text">
        {folders.length > 0 && nested > 0 && `${folders.length === 1 ? 'Der Ordner enthält' : 'Die Ordner enthalten'} ${nested === 1 ? '1 Inhalt' : `${nested} Inhalte`}, die mit gelöscht werden. `}
        Danach kannst du den Vorgang kurz rückgängig machen.
        {fixtures > 0 && ` ${fixtures === 1 ? '1 Beispielinhalt bleibt' : `${fixtures} Beispielinhalte bleiben`} erhalten.`}
      </p>
    </DialogFrame>
  );
}

/**
 * Text card → Dokument, only after this explicit confirmation. Cancelling writes nothing. The conversion is one commit of
 * the same record (same id, place and metadata); the editor opens only once it is stored, a failure leaves the text card.
 */
function ConvertToDocumentForm({ itemId, onClose }: { itemId: ItemId; onClose: () => void }) {
  const { library, workspace, dispatch, notify } = usePreview();
  const [busy, setBusy] = useState(false);
  const item = library.getItem(itemId);
  if (!item || item.kind !== 'text' || !isLocal(item)) return null;
  const convert = async () => {
    // the latest committed record, not the one this dialog was opened with
    const fresh = library.getItem(itemId);
    if (!fresh || fresh.kind !== 'text' || !isLocal(fresh)) return onClose();
    setBusy(true);
    try {
      await workspace.update(textItemToDocument(fresh));
    } catch {
      setBusy(false);
      notify('Umwandeln ist fehlgeschlagen. Die Textkarte ist unverändert.', { tone: 'error' });
      return;
    }
    onClose();
    notify('In ein Dokument umgewandelt', { tone: 'success' });
    dispatch({ type: 'openComposer', itemId });
  };
  return (
    <DialogFrame
      title={`„${item.title}“ im Schreibstudio bearbeiten?`}
      eyebrow="Schreibstudio"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="cb-button cb-button--ghost"
            disabled={busy}
            onClick={() => {
              onClose();
              dispatch({ type: 'openComposer', itemId });
            }}
          >
            Als Klartext bearbeiten
          </button>
          <span className="cb-card-dialog__spacer" />
          <button type="button" className="cb-button cb-button--ghost" disabled={busy} onClick={onClose} autoFocus>
            Abbrechen
          </button>
          <button type="button" className="cb-button cb-button--primary" disabled={busy} onClick={() => void convert()}>
            <Icon name="fileText" size={16} />
            Umwandeln
          </button>
        </>
      }
    >
      <p className="cb-form__text">
        Die Textkarte wird dafür einmalig zu einem Dokument mit Formatierung. Text, Titel, Ort, Tags, Favorit und Erstelldatum
        bleiben erhalten; jede Zeile wird ein Absatz. Kopieren liefert danach den reinen Text des Dokuments.
      </p>
      <p className="cb-form__text">Soll die Karte reiner Text bleiben, bearbeite sie als Klartext.</p>
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function ModalContent({ modal, onClose }: { modal: WorkspaceModal; onClose: () => void }) {
  const { library } = usePreview();
  switch (modal.kind) {
    case 'space-new':
      return <SpaceForm onClose={onClose} />;
    case 'space-edit': {
      const space = library.getSpace(modal.spaceId);
      return space ? <SpaceForm key={space.id} space={space} onClose={onClose} /> : null;
    }
    case 'space-delete':
      return <SpaceDeleteForm spaceId={modal.spaceId} onClose={onClose} />;
    case 'folder-new':
      return <FolderForm placement={modal.placement} entryIds={modal.entryIds} onClose={onClose} />;
    case 'folder-edit': {
      const folder = library.getFolder(modal.folderId);
      return folder ? <FolderForm key={folder.id} folder={folder} placement={{ spaceId: folder.spaceId, folderId: folder.parentId }} onClose={onClose} /> : null;
    }
    case 'move':
      return <MoveForm entryIds={modal.entryIds} onClose={onClose} />;
    case 'confirm-delete':
      return <ConfirmDeleteForm entryIds={modal.entryIds} onClose={onClose} />;
    case 'convert-to-document':
      return <ConvertToDocumentForm itemId={modal.itemId} onClose={onClose} />;
  }
}

const modalKey = (modal: WorkspaceModal | null): string => {
  if (!modal) return '';
  switch (modal.kind) {
    case 'space-edit':
    case 'space-delete':
      return `${modal.kind}:${modal.spaceId}`;
    case 'folder-edit':
      return `${modal.kind}:${modal.folderId}`;
    default:
      return modal.kind;
  }
};

/** Workspace dialogs (new/edit space, folder, move, delete) on the shared glass card dialog. */
export function WorkspaceDialogs() {
  const { state, dispatch } = usePreview();
  const close = () => dispatch({ type: 'closeModal' });
  return (
    <Dialog open={!!state.modal} onClose={close} labelledBy={TITLE_ID} variant="card">
      {state.modal && (
        <div key={modalKey(state.modal)} className="cb-card-dialog__switch">
          <ModalContent modal={state.modal} onClose={close} />
        </div>
      )}
    </Dialog>
  );
}
