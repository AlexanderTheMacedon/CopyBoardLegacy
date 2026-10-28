import { Node as PMNode } from '@tiptap/pm/model';
import { EditorContent, getSchema, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { documentFromText, documentText, HIGHLIGHT_COLORS, normalizeHref, safeHref, sanitizeDocument, TEXT_COLORS, wordCount } from '../../domain/document';
import { cleanPastedHtml } from './clipboard-html';
import { documentExtensions } from './doc-extensions';
import type { DocumentContent } from '../../domain/types';
import type { EditorHandle, HistoryState } from './editor-types';
import { DOC_ZOOM_STEPS, safeFileName } from './editor-types';
import { ToolButton, ToolSeparator } from './Toolbar';

export interface DocumentHandle extends EditorHandle {
  readonly editor: Editor;
  openLink(): void;
  print(): void;
}

const schema = getSchema(documentExtensions);

/** Content the editor can really build: sanitised, then checked against the schema; unreadable structure degrades to its text. */
function loadable(content: DocumentContent): DocumentContent {
  const clean = sanitizeDocument(content);
  try {
    PMNode.fromJSON(schema, clean.doc as unknown as JSONContent).check();
    return clean;
  } catch {
    return documentFromText(documentText(clean.doc));
  }
}

/** Puts the caret back into the page now; Tiptap's own focus command waits a frame, and keys typed meanwhile would be lost. */
const focusNow = (editor: Editor) => {
  if (!editor.isDestroyed && !editor.view.hasFocus()) editor.view.focus();
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

// The exported file mirrors the page: same block sizes (17 / 38 / 25 / 20 px) and spacing; inline styles carry the rest.
const EXPORT_CSS =
  'body{font:17px/1.7 -apple-system,system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1.25rem;color:#1c1a17}body>h1:first-child{font-size:38px}p,h1,h2,h3,ul,ol,blockquote,pre,table{margin:.7em 0 0}h1{font-size:38px;line-height:1.08}h2{font-size:25px;line-height:1.25}h3{font-size:20px;line-height:1.3}blockquote{margin-left:0;padding-left:1rem;border-left:3px solid #e5d9cf;color:#5b544c}hr{border:0;border-top:1px solid #d9cfc5;margin:1.4em 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d9cfc5;padding:.4rem .7rem;vertical-align:top;text-align:left}th{background:#f6f1ec}td>p,th>p,li>p{margin:0}code{background:#f3eee8;padding:.1em .3em;border-radius:4px}pre{background:#f3eee8;padding:1rem;border-radius:8px;overflow:auto}mark{color:inherit;padding:0 .08em;border-radius:3px}ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:.5rem}ul[data-type=taskList] li>label{flex:none}@media print{body{margin:0;max-width:none}mark{print-color-adjust:exact;-webkit-print-color-adjust:exact}}';

interface DocumentEditorProps {
  readonly initial: DocumentContent;
  readonly title: string;
  readonly editable: boolean;
  readonly onChange: () => void;
  readonly onHistory: (state: HistoryState) => void;
  readonly onReady: (handle: DocumentHandle | null) => void;
  /** Page zoom in percent (a view preference, see EditorPrefs.zoom). */
  readonly zoom: number;
  readonly onZoom: (zoom: number) => void;
}

/** Inline link field: one small glass panel over the page; Enter applies, Escape closes, empty removes the link. */
function LinkPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [value, setValue] = useState(() => (editor.getAttributes('link').href as string | undefined) ?? '');
  const current = useMemo(() => safeHref(editor.getAttributes('link').href), [editor]);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // the selection the link applies to is the one at the moment the panel opened, wherever focus wanders meanwhile
  const target = useRef(editor.state.selection);
  useEffect(() => input.current?.select(), []);

  const apply = () => {
    focusNow(editor);
    if (!value.trim()) {
      editor.chain().focus().setTextSelection({ from: target.current.from, to: target.current.to }).extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const href = normalizeHref(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    const { from, to, empty } = target.current;
    const chain = editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href });
    // a caret without selection: the address itself becomes the link text
    if (empty && !editor.isActive('link')) chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] });
    chain.run();
    // continue writing after the link: a still-selected link text would be replaced by the next keystroke
    editor.commands.setTextSelection(editor.state.selection.to);
    onClose();
  };

  return (
    <form
      className="cb-link-panel"
      role="dialog"
      aria-label="Link bearbeiten"
      data-nested
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          focusNow(editor);
        }
      }}
    >
      <input
        ref={input}
        type="text"
        inputMode="url"
        value={value}
        placeholder="https://…"
        aria-label="Adresse"
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
      />
      <button type="submit" className="cb-button cb-button--primary">
        {value.trim() ? 'Übernehmen' : 'Entfernen'}
      </button>
      {current && (
        <a className="cb-link-panel__open" href={current} target="_blank" rel="noopener noreferrer nofollow" aria-label="Link in neuem Tab öffnen" title="Link öffnen">
          <Icon name="arrowUpRight" size={16} />
        </a>
      )}
      {invalid && <span className="cb-link-panel__error">Nur http(s), mailto und tel sind erlaubt.</span>}
    </form>
  );
}

/**
 * Contextual bubble on selected text: emphasis, colour, link, clearing. The colour row unfolds inside the bubble itself, so
 * focus and selection never leave the editor (a separate popover would blur it and close the bubble).
 */
function Bubble({ editor, openLink }: { editor: Editor; openLink: () => void }) {
  const [inks, setInks] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      code: e.isActive('code'),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? 'yellow') : null,
    }),
  });
  // a new selection starts with the compact row
  useEffect(() => {
    const reset = () => setInks(false);
    editor.on('selectionUpdate', reset);
    return () => void editor.off('selectionUpdate', reset);
  }, [editor]);
  const run = () => editor.chain().focus();
  const keep = (event: { preventDefault: () => void }) => event.preventDefault();
  return (
    <BubbleMenu
      editor={editor}
      className="cb-bubble"
      data-inks={inks || undefined}
      options={{ placement: 'top', offset: 10, flip: { padding: 12 }, shift: { padding: 12 } }}
      shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && !e.isActive('codeBlock')}
    >
      <div className="cb-bubble__row" role="toolbar" aria-label="Auswahl formatieren">
        <ToolButton icon="bold" label="Fett" shortcut="⌘B" pressed={s.bold} onClick={() => run().toggleBold().run()} />
        <ToolButton icon="italic" label="Kursiv" shortcut="⌘I" pressed={s.italic} onClick={() => run().toggleItalic().run()} />
        <ToolButton icon="underline" label="Unterstrichen" shortcut="⌘U" pressed={s.underline} onClick={() => run().toggleUnderline().run()} />
        <ToolButton icon="strikethrough" label="Durchgestrichen" shortcut="⇧⌘S" pressed={s.strike} onClick={() => run().toggleStrike().run()} />
        <ToolButton icon="code" label="Code" shortcut="⌘E" pressed={s.code} onClick={() => run().toggleCode().run()} />
        <ToolSeparator />
        <button
          type="button"
          className="cb-tool cb-doc-ink"
          aria-label="Farbe und Textmarker"
          title="Farbe und Textmarker"
          aria-expanded={inks}
          data-active={s.color || s.highlight ? '' : undefined}
          onMouseDown={keep}
          onClick={() => setInks((v) => !v)}
        >
          <span className="cb-doc-ink__glyph" data-marker={s.highlight ?? undefined} style={{ '--ink': s.color ?? 'currentColor' } as CSSProperties}>
            A
          </span>
        </button>
        <ToolButton icon="link" label="Link" shortcut="⌘K" pressed={s.link} onClick={openLink} />
        <ToolButton icon="clearFormat" label="Formatierung entfernen" shortcut="⌘\" onClick={() => run().clearFormatting().run()} />
      </div>
      {inks && (
        <div className="cb-bubble__inks" role="group" aria-label="Farbe und Textmarker">
          <div className="cb-bubble__swatches" role="group" aria-label="Textfarbe">
            <button type="button" className="cb-swatch" data-default aria-label="Standardfarbe" aria-pressed={!s.color} onMouseDown={keep} onClick={() => run().unsetColor().run()} />
            {TEXT_COLORS.map((c) => (
              <button key={c.value} type="button" className="cb-swatch" style={{ background: c.value }} aria-label={`Textfarbe ${c.label}`} title={c.label} aria-pressed={s.color === c.value} onMouseDown={keep} onClick={() => run().setColor(c.value).run()} />
            ))}
          </div>
          <div className="cb-bubble__swatches" role="group" aria-label="Textmarker">
            <button type="button" className="cb-swatch" data-none aria-label="Kein Textmarker" aria-pressed={!s.highlight} onMouseDown={keep} onClick={() => run().unsetHighlight().run()} />
            {HIGHLIGHT_COLORS.map((c) => (
              <button key={c.value} type="button" className="cb-swatch cb-swatch--marker" data-marker={c.value} aria-label={`Textmarker ${c.label}`} title={c.label} aria-pressed={s.highlight === c.value} onMouseDown={keep} onClick={() => run().setHighlight(c.value).run()} />
            ))}
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}

interface Counts {
  readonly words: number;
  readonly chars: number;
  readonly selected: number;
}

// the same derived text as the stored `text` and the Context Rail, so both places always show the same numbers
const countOf = (editor: Editor): Counts => {
  const { doc, selection } = editor.state;
  const text = documentText(sanitizeDocument(editor.getJSON()).doc);
  const picked = selection.empty ? '' : doc.textBetween(selection.from, selection.to, '\n', ' ');
  return { words: wordCount(text), chars: text.length, selected: picked ? wordCount(picked) : 0 };
};

/** Footer of the page (reference kit): live counts and the page zoom. Counting is deferred off the typing path. */
function StatusBar({ editor, zoom, onZoom }: { editor: Editor; zoom: number; onZoom: (zoom: number) => void }) {
  const [counts, setCounts] = useState<Counts>(() => countOf(editor));
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => !editor.isDestroyed && setCounts(countOf(editor)), 150);
    };
    editor.on('update', schedule);
    editor.on('selectionUpdate', schedule);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', schedule);
      editor.off('selectionUpdate', schedule);
    };
  }, [editor]);
  const at = DOC_ZOOM_STEPS.indexOf(zoom);
  const fmt = (n: number) => n.toLocaleString('de-DE');
  return (
    <footer className="cb-doc__status" aria-label="Dokumentstatus">
      <p className="cb-doc__counts" aria-live="polite">
        <span>
          {fmt(counts.words)} {counts.words === 1 ? 'Wort' : 'Wörter'}
        </span>
        <span className="cb-doc__counts-extra">{fmt(counts.chars)} Zeichen</span>
        {counts.selected > 0 && <span className="cb-doc__counts-sel">{fmt(counts.selected)} markiert</span>}
      </p>
      <div className="cb-doc__zoom" role="group" aria-label="Anzeigegröße">
        <button type="button" className="cb-tool" aria-label="Verkleinern" title="Verkleinern" disabled={at <= 0} onMouseDown={(e) => e.preventDefault()} onClick={() => onZoom(DOC_ZOOM_STEPS[at - 1] ?? zoom)}>
          <Icon name="minus" size={15} />
        </button>
        <button type="button" className="cb-doc__zoom-value" aria-label={`Anzeigegröße ${zoom} %, auf 100 % zurücksetzen`} title="Auf 100 % zurücksetzen" onMouseDown={(e) => e.preventDefault()} onClick={() => onZoom(100)}>
          {zoom} %
        </button>
        <button type="button" className="cb-tool" aria-label="Vergrößern" title="Vergrößern" disabled={at >= DOC_ZOOM_STEPS.length - 1} onMouseDown={(e) => e.preventDefault()} onClick={() => onZoom(DOC_ZOOM_STEPS[at + 1] ?? zoom)}>
          <Icon name="plus" size={15} />
        </button>
      </div>
    </footer>
  );
}

/**
 * Visual document editor (Tiptap/ProseMirror). The stored form is the sanitised JSON tree; the editor instance never leaves
 * this component. The surface is a calm paper page; toolbars live in the Canvas shell and drive it through the handle.
 */
export function DocumentEditor({ initial, title, editable, onChange, onHistory, onReady, zoom, onZoom }: DocumentEditorProps) {
  const cb = useRef({ onChange, onHistory, title });
  cb.current = { onChange, onHistory, title };
  const [linkOpen, setLinkOpen] = useState(false);
  const content = useMemo(() => loadable(initial), [initial]);

  const editor = useEditor({
    extensions: documentExtensions,
    content: content.doc as unknown as JSONContent,
    editable,
    autofocus: editable ? 'end' : false,
    editorProps: {
      attributes: { class: 'cb-doc__prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Dokumentinhalt', spellcheck: 'true' },
      transformPastedHTML: cleanPastedHtml,
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      cb.current.onChange();
      cb.current.onHistory({ canUndo: e.can().undo(), canRedo: e.can().redo() });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const handle: DocumentHandle = {
      editor,
      undo: () => void (!editor.isDestroyed && editor.chain().focus().undo().run()),
      redo: () => void (!editor.isDestroyed && editor.chain().focus().redo().run()),
      focus: () => {
        if (!editor.isDestroyed) editor.commands.focus();
      },
      getText: () => documentText(sanitizeDocument(editor.getJSON()).doc),
      openLink: () => setLinkOpen(true),
      print: () => window.print(),
      exportFile: () => {
        const name = cb.current.title;
        const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>${EXPORT_CSS}</style></head><body><h1>${escapeHtml(name)}</h1>${editor.getHTML()}</body></html>`;
        return { name: safeFileName(name, 'html'), mime: 'text/html', data: html };
      },
    };
    onReady(handle);
    return () => onReady(null);
  }, [editor, onReady]);

  useEffect(() => {
    // no update event: switching modes is not an edit, and an untouched document must never be rewritten on open
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <div className="cb-doc" data-readonly={!editable || undefined} style={{ '--cb-doc-zoom': zoom / 100 } as CSSProperties}>
      <div className="cb-doc__scroll">
        <div className="cb-doc__page">
          <h1 className="cb-doc__print-title">{title}</h1>
          <EditorContent editor={editor} />
        </div>
      </div>
      <StatusBar editor={editor} zoom={zoom} onZoom={onZoom} />
      {editable && <Bubble editor={editor} openLink={() => setLinkOpen(true)} />}
      {linkOpen && <LinkPanel editor={editor} onClose={() => setLinkOpen(false)} />}
    </div>
  );
}
