import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { PHONE_QUERY, useMediaQuery } from '../../app/hooks';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl, type SegmentOption } from '../../components/SegmentedControl';
import { newItemId } from '../../data/capture';
import { ClipboardAccessError, writeTextToClipboard } from '../../data/clipboard';
import { DEFAULT_DOCUMENT_TITLE, documentOutline, documentText, sanitizeDocument, titleFromText, wordCount } from '../../domain/document';
import { isEditable, isLocal, type Item } from '../../domain/types';
import { tileOpenButtonId } from '../grid/ItemTile';
import { formatDateTime, kindIcon, kindLabel } from '../items/item-meta';
import type { CodeHandle } from './CodeEditor';
import { CodeEditor } from './CodeEditor';
import { CodeToolbar } from './CodeToolbar';
import { DocumentEditor, type DocumentHandle } from './DocumentEditor';
import { DocumentToolbar } from './DocumentToolbar';
import { downloadText, normalizeEditorPrefs, type EditorHandle, type EditorPrefs, type HistoryState } from './editor-types';
import { MarkdownEditor, MarkdownToolbar, type MarkdownMode } from './MarkdownEditor';
import { markdownOutline } from './markdown-outline';
import { ToolButton, ToolGroup, ToolSeparator } from './Toolbar';
import { useAutosave, type ItemPatch, type SaveState } from './useAutosave';

const saveLabel: Record<SaveState, string> = {
  saved: 'Gespeichert',
  pending: 'Ungespeicherte Änderungen',
  saving: 'Speichert …',
  error: 'Speichern fehlgeschlagen',
};

const modeOptions = (phone: boolean): SegmentOption<MarkdownMode>[] => [
  { value: 'source', label: 'Quelltext', icon: 'code' },
  { value: 'preview', label: 'Vorschau', icon: 'eye' },
  // D-007: Split View on desktop; on phones only one editor surface at a time.
  { value: 'split', label: 'Split', icon: 'columns', disabled: phone },
];

const step = (i: number) => ({ '--i': i }) as CSSProperties;

/** "Space › Ordner › Unterordner" of an item's place, from the live library. */
function useBreadcrumb(item: Item): string {
  const { library } = usePreview();
  const parts: string[] = [];
  const space = library.getSpace(item.spaceId);
  if (space) parts.push(space.name);
  const chain: string[] = [];
  for (let id = item.folderId ?? null, guard = 0; id && guard < 32; guard++) {
    const folder = library.getFolder(id);
    if (!folder) break;
    chain.unshift(folder.name);
    id = folder.parentId;
  }
  return [...parts, ...chain].join(' › ');
}

interface RailProps {
  readonly item: Item;
  readonly place: string;
  readonly stats: { readonly primary: string; readonly secondary: string };
  readonly outline: readonly { level: number; text: string }[];
  readonly prefs: EditorPrefs;
  readonly onPrefs: (patch: Partial<EditorPrefs>) => void;
  readonly onClose: () => void;
}

/** Context Rail (D-010): belongs to the editor, not a second inspector. Its own ✕ is the only close control while open. */
function ContextRail({ item, place, stats, outline, prefs, onPrefs, onClose }: RailProps) {
  const hasWidth = item.kind === 'document' || item.kind === 'markdown' || item.kind === 'text';
  return (
    <aside className="cb-rail" aria-labelledby="cb-rail-title">
      <div className="cb-rail__header" style={step(0)}>
        <h3 id="cb-rail-title">Kontext</h3>
        <IconButton icon="x" size="sm" label="Kontextleiste schließen" onClick={onClose} />
      </div>
      <section className="cb-rail__section" aria-labelledby="cb-rail-details" style={step(1)}>
        <h4 id="cb-rail-details">
          <Icon name="info" size={14} />
          Details
        </h4>
        <dl className="cb-rail__facts">
          <dt>Typ</dt>
          <dd>{kindLabel[item.kind]}</dd>
          <dt>Ort</dt>
          <dd>{place}</dd>
          <dt>{stats.primary.split(' ')[1]}</dt>
          <dd>{stats.primary.split(' ')[0]}</dd>
          <dt>{stats.secondary.split(' ')[1]}</dt>
          <dd>{stats.secondary.split(' ')[0]}</dd>
          <dt>Erstellt</dt>
          <dd>{formatDateTime(item.createdAt)}</dd>
          <dt>Geändert</dt>
          <dd>{formatDateTime(item.updatedAt)}</dd>
        </dl>
      </section>
      {outline.length > 0 && (
        <section className="cb-rail__section" aria-labelledby="cb-rail-outline" style={step(2)}>
          <h4 id="cb-rail-outline">
            <Icon name="list" size={14} />
            Gliederung
          </h4>
          <ol className="cb-rail__outline">
            {outline.map((h, i) => (
              <li key={i} style={{ '--lvl': h.level - 1 } as CSSProperties}>
                {h.text}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="cb-rail__section" aria-labelledby="cb-rail-view" style={step(3)}>
        <h4 id="cb-rail-view">
          <Icon name="sliders" size={14} />
          Ansicht
        </h4>
        <div className="cb-rail__field">
          <span id="cb-rail-font">Schriftgröße</span>
          <SegmentedControl
            label="Schriftgröße"
            size="sm"
            options={[
              { value: '13', label: 'S' },
              { value: '14', label: 'M' },
              { value: '16', label: 'L' },
            ]}
            value={String(prefs.fontSize) as '13' | '14' | '16'}
            onChange={(v) => onPrefs({ fontSize: Number(v) as EditorPrefs['fontSize'] })}
          />
        </div>
        {hasWidth && (
          <div className="cb-rail__field">
            <span>Lesebreite</span>
            <SegmentedControl
              label="Lesebreite"
              size="sm"
              options={[
                { value: 'narrow', label: 'Schmal' },
                { value: 'normal', label: 'Normal' },
                { value: 'wide', label: 'Breit' },
              ]}
              value={prefs.width}
              onChange={(v) => onPrefs({ width: v })}
            />
          </div>
        )}
      </section>
    </aside>
  );
}

/**
 * Canvas shell shared by every editor (D-007, DS-C21, M-06): identity, save status, specialised toolbar, shared commands,
 * own Context Rail. Closed only via ✕ in the top-right corner (or Escape). The user's own items autosave through one
 * persistence hook; synthetic examples are read-only and offer an explicit local copy (D-028).
 */
export function Composer() {
  const { state, library } = usePreview();
  const item = state.composerItemId ? library.getItem(state.composerItemId) : undefined;
  if (!item || !isEditable(item)) return null;
  return <Canvas key={item.id} item={item} />;
}

function Canvas({ item }: { item: Extract<Item, { kind: 'document' | 'text' | 'markdown' | 'code' }> }) {
  const { dispatch, library, workspace, notify, markFresh } = usePreview();
  const phone = useMediaQuery(PHONE_QUERY);
  const writable = isLocal(item);
  const place = useBreadcrumb(item);

  const [title, setTitle] = useState(item.title);
  const titleAuto = useRef(item.kind === 'document' && item.title === DEFAULT_DOCUMENT_TITLE);
  const [language, setLanguage] = useState(item.kind === 'code' ? item.language : '');
  const [mode, setMode] = useState<MarkdownMode>('split');
  const [prefs, setPrefs] = useState<EditorPrefs>(() => normalizeEditorPrefs(workspace.savedEditorPrefs));
  const [railOpen, setRailOpen] = useState(!phone);
  const [handle, setHandle] = useState<EditorHandle | null>(null);
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false });
  const [rev, setRev] = useState(0);
  const deferredRev = useDeferredValue(rev);

  const body = useRef(item.kind === 'document' ? '' : item.body);
  const live = useRef({ title, language, handle });
  live.current = { title, language, handle };
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const closing = useRef(false);

  const collect = useCallback((): ItemPatch => {
    const { title: t, language: l, handle: h } = live.current;
    const patch: ItemPatch = { title: t.trim() || 'Ohne Titel' };
    if (item.kind === 'document') {
      const editor = (h as DocumentHandle | null)?.editor;
      if (editor) {
        const content = sanitizeDocument(editor.getJSON());
        patch.content = content;
        patch.text = documentText(content.doc);
      }
    } else {
      patch.body = body.current;
      if (item.kind === 'code') patch.language = l || 'text';
    }
    return patch;
  }, [item.kind]);

  const autosave = useAutosave(item.id, writable, collect);
  const { touch } = autosave;

  const effectiveMode: MarkdownMode = phone && mode === 'split' ? 'source' : mode;

  // --- editor callbacks ---
  const onHandle = useCallback((h: EditorHandle | null) => {
    setHandle(h);
    if (h && writable) h.focus();
  }, [writable]);
  const onText = useCallback(
    (text: string) => {
      body.current = text;
      setRev((r) => r + 1);
      touch();
    },
    [touch],
  );
  const onDocChange = useCallback(() => {
    setRev((r) => r + 1);
    if (titleAuto.current) {
      const editor = (live.current.handle as DocumentHandle | null)?.editor;
      if (editor) {
        // only the first non-empty block names the document: no need to walk a long text on every keystroke
        let first = '';
        editor.state.doc.forEach((node) => {
          if (!first.trim()) first = node.textContent;
        });
        setTitle(titleFromText(first));
      }
    }
    touch();
  }, [touch]);

  const changePrefs = (patch: Partial<EditorPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (!('focus' in patch) || Object.keys(patch).length > 1) workspace.saveEditorPrefs({ ...next, focus: false });
  };

  // --- close: flush first; a failed save keeps the editor open unless the user explicitly gives the edits up ---
  const requestClose = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const ok = await autosave.flush();
    if (!ok) {
      if (!window.confirm('Die Änderungen konnten nicht gespeichert werden. Trotzdem schließen und verwerfen?')) {
        closing.current = false;
        return;
      }
      autosave.discard();
    }
    dispatch({ type: 'closeComposer' });
  }, [autosave, dispatch]);

  // explicit focus restoration after an intentional close
  useEffect(
    () => () => {
      if (!closing.current) return;
      const target = opener.current;
      requestAnimationFrame(() => {
        const back = target instanceof HTMLElement && target.isConnected && target !== document.body ? target : document.getElementById(tileOpenButtonId(item.id));
        back?.focus({ preventScroll: true });
      });
    },
    [item.id],
  );

  useEffect(() => {
    if (!writable) titleRef.current?.focus();
  }, [writable]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    // nested layers (dialogs, the link panel, an open popover such as the colour picker) take Escape first
    if (document.querySelector('dialog[open]') || (event.target as HTMLElement).closest('[data-nested]') || sectionRef.current?.querySelector('[aria-expanded="true"]')) return;
    event.preventDefault();
    if (prefs.focus) changePrefs({ focus: false });
    else void requestClose();
  };

  // --- shared commands ---
  const copyAll = async () => {
    try {
      await writeTextToClipboard(handle?.getText() ?? '');
      notify('In die Zwischenablage kopiert', { tone: 'success' });
    } catch (error) {
      notify(
        error instanceof ClipboardAccessError && error.reason === 'denied'
          ? 'Der Browser hat den Zugriff auf die Zwischenablage abgelehnt.'
          : 'Kopieren wird von diesem Browser nicht unterstützt.',
        { tone: 'error' },
      );
    }
  };
  const exportFile = () => {
    const file = handle?.exportFile();
    if (file) downloadText(file.name, file.mime, file.data);
  };

  // explicit local copy of an example item: the example itself is never written
  const makeLocalCopy = async () => {
    const now = new Date().toISOString();
    const copy = { ...item, id: newItemId(), title: `${item.title} (Kopie)`, createdAt: now, updatedAt: now, favorite: false, origin: 'local', derivedFrom: item.id } as Item;
    try {
      await workspace.add([copy]);
    } catch {
      notify('Speichern ist fehlgeschlagen. Es wurde keine Kopie angelegt.', { tone: 'error' });
      return;
    }
    markFresh([copy.id]);
    notify('Lokale Kopie angelegt', { tone: 'success' });
    dispatch({ type: 'openComposer', itemId: copy.id });
  };

  // --- derived info for the rail (only while it is open) ---
  const stats = useMemo(() => {
    void deferredRev;
    if (!railOpen) return { primary: '0 Wörter', secondary: '0 Zeichen', outline: [] as { level: number; text: string }[] };
    if (item.kind === 'document') {
      const editor = (handle as DocumentHandle | null)?.editor;
      const doc = editor ? sanitizeDocument(editor.getJSON()).doc : item.content.doc;
      const text = documentText(doc);
      return { primary: `${wordCount(text)} Wörter`, secondary: `${text.length} Zeichen`, outline: documentOutline(doc) };
    }
    const text = body.current;
    if (item.kind === 'code') return { primary: `${text.split('\n').length} Zeilen`, secondary: `${text.length} Zeichen`, outline: [] };
    return { primary: `${wordCount(text)} Wörter`, secondary: `${text.length} Zeichen`, outline: item.kind === 'markdown' ? markdownOutline(text) : [] };
  }, [deferredRev, railOpen, item, handle]);

  const status = writable ? saveLabel[autosave.state] : 'Beispielinhalt – schreibgeschützt';
  const hasModes = item.kind === 'markdown';
  const toolbarDisabled = !writable || (hasModes && effectiveMode === 'preview');

  return (
    <section
      ref={sectionRef}
      className="cb-composer"
      aria-labelledby="cb-composer-title"
      data-kind={item.kind}
      data-mode={hasModes ? effectiveMode : undefined}
      data-rail={railOpen || undefined}
      data-focus={prefs.focus || undefined}
      style={{ '--cb-editor-font': `${prefs.fontSize}px` } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <header className="cb-composer__header">
        <div className="cb-composer__heading">
          <p className="cb-composer__eyebrow">
            <Icon name={kindIcon[item.kind]} size={13} />
            {kindLabel[item.kind]}
            {place && <span className="cb-composer__place"> · {place}</span>}
          </p>
          {writable ? (
            <>
              <label htmlFor="cb-composer-title" className="cb-visually-hidden">
                Titel
              </label>
              <input
                id="cb-composer-title"
                className="cb-composer__title"
                value={title}
                maxLength={160}
                placeholder="Titel"
                onChange={(event) => {
                  titleAuto.current = false;
                  setTitle(event.target.value);
                  touch();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    handle?.focus();
                  }
                }}
              />
            </>
          ) : (
            <h2 id="cb-composer-title" ref={titleRef} tabIndex={-1}>
              {item.title}
            </h2>
          )}
        </div>
        <p className="cb-composer__status" role="status" data-state={writable ? autosave.state : 'example'}>
          <span className="cb-composer__status-dot" aria-hidden="true" />
          {status}
          {writable && autosave.state === 'error' && (
            <button type="button" className="cb-composer__retry" onClick={() => void autosave.flush()}>
              Erneut versuchen
            </button>
          )}
        </p>
        {hasModes && <SegmentedControl label="Editor-Modus" size="sm" options={modeOptions(phone)} value={effectiveMode} onChange={setMode} />}
        {!railOpen && <IconButton icon="panelRight" label="Kontextleiste einblenden" className="cb-composer__rail-toggle" onClick={() => setRailOpen(true)} />}
        {prefs.focus && <IconButton icon="focus" label="Fokusmodus beenden" className="cb-composer__focus-exit" onClick={() => changePrefs({ focus: false })} />}
        <IconButton icon="x" label="Editor schließen" className="cb-composer__close" onClick={() => void requestClose()} />
      </header>

      <div className="cb-canvas-bar" aria-label="Werkzeuge">
        <div className="cb-canvas-bar__specific">
          {item.kind === 'document' && handle && <DocumentToolbar handle={handle as DocumentHandle} disabled={!writable} />}
          {item.kind === 'markdown' && <MarkdownToolbar handle={handle as CodeHandle | null} disabled={toolbarDisabled} />}
          {item.kind === 'code' && (
            <CodeToolbar
              language={language}
              readOnly={!writable}
              prefs={prefs}
              onLanguage={(l) => {
                setLanguage(l);
                touch();
              }}
              onPrefs={changePrefs}
            />
          )}
        </div>
        <div className="cb-canvas-bar__shared" role="toolbar" aria-label="Allgemeine Werkzeuge">
          <ToolGroup label="Verlauf">
            <ToolButton icon="undo" label="Rückgängig" shortcut="⌘Z" disabled={!writable || !history.canUndo || (hasModes && effectiveMode === 'preview')} onClick={() => handle?.undo()} />
            <ToolButton icon="redo" label="Wiederholen" shortcut="⇧⌘Z" disabled={!writable || !history.canRedo || (hasModes && effectiveMode === 'preview')} onClick={() => handle?.redo()} />
          </ToolGroup>
          <ToolSeparator />
          <ToolGroup label="Aktionen">
            {handle?.find && <ToolButton icon="search" label="Suchen und Ersetzen" shortcut="⌘F" disabled={hasModes && effectiveMode === 'preview'} onClick={() => handle.find?.()} />}
            <ToolButton icon="copy" label="Alles kopieren" onClick={() => void copyAll()} />
            <ToolButton icon="download" label="Exportieren" onClick={exportFile} />
            {item.kind === 'document' && <ToolButton icon="printer" label="Drucken / als PDF sichern" onClick={() => (handle as DocumentHandle | null)?.print()} />}
            <ToolButton icon="focus" label="Fokusmodus" pressed={prefs.focus} onClick={() => changePrefs({ focus: !prefs.focus })} />
          </ToolGroup>
        </div>
      </div>

      {!writable && (
        <div className="cb-composer__notice" role="note">
          <Icon name="lock" size={15} />
          <p>Dies ist ein Beispielinhalt und bleibt unverändert. Zum Bearbeiten legst du eine eigene Kopie an.</p>
          <button type="button" className="cb-button cb-button--primary" onClick={() => void makeLocalCopy()}>
            Lokale Kopie bearbeiten
          </button>
        </div>
      )}

      <div className="cb-composer__body">
        <div className="cb-composer__panes" data-width={prefs.width}>
          {item.kind === 'document' && <DocumentEditor initial={item.content} title={title} editable={writable} onChange={onDocChange} onHistory={setHistory} onReady={onHandle} />}
          {item.kind === 'markdown' && (
            <MarkdownEditor initial={item.body} mode={effectiveMode} readOnly={!writable} prefs={prefs} title={title} onChange={onText} onHistory={setHistory} onReady={onHandle} />
          )}
          {item.kind === 'code' && (
            <div className="cb-composer__pane">
              <CodeEditor
                initial={item.body}
                language={language}
                readOnly={!writable}
                wrap={prefs.wrap}
                tabSize={prefs.tabSize}
                lineNumbers={prefs.lineNumbers}
                ariaLabel={`${kindLabel.code}-Quelltext`}
                title={title}
                onChange={onText}
                onHistory={setHistory}
                onReady={onHandle}
              />
            </div>
          )}
          {item.kind === 'text' && (
            <div className="cb-composer__pane" data-width={prefs.width}>
              <CodeEditor
                initial={item.body}
                language="text"
                prose
                readOnly={!writable}
                wrap
                tabSize={2}
                lineNumbers={false}
                ariaLabel="Text"
                title={title}
                onChange={onText}
                onHistory={setHistory}
                onReady={onHandle}
              />
            </div>
          )}
        </div>
        {railOpen && (
          <ContextRail
            item={item}
            place={place || '—'}
            stats={stats}
            outline={stats.outline}
            prefs={prefs}
            onPrefs={changePrefs}
            onClose={() => setRailOpen(false)}
          />
        )}
      </div>
    </section>
  );
}
