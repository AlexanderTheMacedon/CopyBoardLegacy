import { Color, TextStyle } from '@tiptap/extension-text-style';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorContent, getSchema, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { documentFromText, documentText, normalizeHref, safeHref, sanitizeDocument } from '../../domain/document';
import { cleanPastedHtml } from './clipboard-html';
import type { DocumentContent } from '../../domain/types';
import type { EditorHandle, HistoryState } from './editor-types';
import { safeFileName } from './editor-types';
import { ToolButton, ToolGroup } from './Toolbar';

export interface DocumentHandle extends EditorHandle {
  readonly editor: Editor;
  openLink(): void;
  print(): void;
}

/** Only these nodes and marks exist in a document. Everything pasted or loaded is mapped onto this schema or dropped by it. */
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      protocols: ['mailto', 'tel'],
      isAllowedUri: (url) => !!safeHref(url),
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  TextStyle,
  Color,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: 'Schreibe etwas …' }),
];

const schema = getSchema(extensions);

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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const EXPORT_CSS =
  'body{font:16px/1.65 -apple-system,system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1.25rem;color:#1c1a17}h1,h2,h3{line-height:1.25}blockquote{margin-left:0;padding-left:1rem;border-left:3px solid #e5d9cf;color:#5b544c}table{border-collapse:collapse}td,th{border:1px solid #d9cfc5;padding:.4rem .7rem;vertical-align:top}th{background:#f6f1ec}code{background:#f3eee8;padding:.1em .3em;border-radius:4px}pre{background:#f3eee8;padding:1rem;border-radius:8px;overflow:auto}ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:.5rem}';

interface DocumentEditorProps {
  readonly initial: DocumentContent;
  readonly title: string;
  readonly editable: boolean;
  readonly onChange: () => void;
  readonly onHistory: (state: HistoryState) => void;
  readonly onReady: (handle: DocumentHandle | null) => void;
}

/** Inline link field: one small glass panel over the page; Enter applies, Escape closes, empty removes the link. */
function LinkPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [value, setValue] = useState(() => (editor.getAttributes('link').href as string | undefined) ?? '');
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // the selection the link applies to is the one at the moment the panel opened, wherever focus wanders meanwhile
  const target = useRef(editor.state.selection);
  useEffect(() => input.current?.select(), []);

  const apply = () => {
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
          editor.commands.focus();
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
      {invalid && <span className="cb-link-panel__error">Nur http(s), mailto und tel sind erlaubt.</span>}
    </form>
  );
}

/** Bubble menu on selected text: the handful of actions people reach for first. */
function Bubble({ editor, openLink }: { editor: Editor; openLink: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), link: e.isActive('link'), h2: e.isActive('heading', { level: 2 }) }),
  });
  return (
    <BubbleMenu
      editor={editor}
      className="cb-bubble"
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && !e.isActive('codeBlock')}
    >
      <ToolButton icon="bold" label="Fett" shortcut="⌘B" pressed={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolButton icon="italic" label="Kursiv" shortcut="⌘I" pressed={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolButton icon="underline" label="Unterstrichen" shortcut="⌘U" pressed={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolButton icon="strikethrough" label="Durchgestrichen" pressed={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolGroup label="Struktur">
        <ToolButton icon="heading" label="Überschrift" shortcut="⌥⌘2" pressed={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolButton icon="link" label="Link" shortcut="⌘K" pressed={s.link} onClick={openLink} />
      </ToolGroup>
    </BubbleMenu>
  );
}

/**
 * Visual document editor (Tiptap/ProseMirror). The stored form is the sanitised JSON tree; the editor instance never leaves
 * this component. The surface is a calm paper page; toolbars live in the Canvas shell and drive it through the handle.
 */
export function DocumentEditor({ initial, title, editable, onChange, onHistory, onReady }: DocumentEditorProps) {
  const cb = useRef({ onChange, onHistory, title });
  cb.current = { onChange, onHistory, title };
  const [linkOpen, setLinkOpen] = useState(false);
  const content = useMemo(() => loadable(initial), [initial]);

  const editor = useEditor({
    extensions,
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
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <div className="cb-doc" data-readonly={!editable || undefined}>
      <div className="cb-doc__page">
        <h1 className="cb-doc__print-title">{title}</h1>
        <EditorContent editor={editor} />
      </div>
      {editable && <Bubble editor={editor} openLink={() => setLinkOpen(true)} />}
      {linkOpen && <LinkPanel editor={editor} onClose={() => setLinkOpen(false)} />}
    </div>
  );
}
