import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { baseExtensions, gutterExt, makeCompartments, markdownExtension, readOnlyExt, resolveLanguage, tabsExt, wrapExt, type Compartments } from './codemirror';
import type { EditorHandle, HistoryState } from './editor-types';
import { safeFileName } from './editor-types';

export interface CodeHandle extends EditorHandle {
  readonly view: EditorView;
}

interface CodeEditorProps {
  /** Initial text. The editor owns the text afterwards (the item cannot change underneath it: the Canvas is keyed by item). */
  readonly initial: string;
  /** Language id/alias of a code item, or `markdown` for the Markdown source. Unknown → plain text. */
  readonly language: string;
  readonly readOnly: boolean;
  readonly wrap: boolean;
  readonly tabSize: number;
  readonly lineNumbers: boolean;
  readonly ariaLabel: string;
  readonly title: string;
  /** Markdown source: prose behaviour (no autocomplete popups, no fold gutter). */
  readonly prose?: boolean;
  readonly onChange: (text: string) => void;
  readonly onHistory: (state: HistoryState) => void;
  readonly onReady: (handle: CodeHandle | null) => void;
  readonly onScroll?: (ratio: number) => void;
  /** Extra extensions applied at creation (e.g. Markdown formatting shortcuts). */
  readonly extensions?: readonly Extension[];
}

/**
 * CodeMirror 6 as a React-owned, uncontrolled view: created once, reconfigured through compartments (language, wrap, tab
 * size, gutters, read-only), so typing never re-creates it and the caret, selection and undo history stay untouched.
 */
export function CodeEditor(props: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const comps = useRef<Compartments>(makeCompartments());
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const c = comps.current;
    const p = cb.current;
    const reportHistory = (state: EditorState) => cb.current.onHistory({ canUndo: undoDepth(state) > 0, canRedo: redoDepth(state) > 0 });
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: p.initial,
        extensions: [
          ...(p.extensions ?? []),
          ...baseExtensions(c, { readOnly: p.readOnly, wrap: p.wrap, tabSize: p.tabSize, lineNumbers: p.lineNumbers, prose: p.prose }, p.ariaLabel),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) cb.current.onChange(update.state.doc.toString());
            if (update.docChanged || update.transactions.length) reportHistory(update.state);
          }),
        ],
      }),
    });
    viewRef.current = view;
    const onScroll = () => {
      const max = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      cb.current.onScroll?.(max > 0 ? view.scrollDOM.scrollTop / max : 0);
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    const handle: CodeHandle = {
      view,
      undo: () => void undo(view),
      redo: () => void redo(view),
      focus: () => view.focus(),
      find: () => {
        openSearchPanel(view);
      },
      getText: () => view.state.doc.toString(),
      exportFile: () => {
        const text = view.state.doc.toString();
        const lang = resolveLanguage(cb.current.language);
        return { name: safeFileName(cb.current.title, lang?.ext ?? 'txt'), mime: lang?.id === 'markdown' ? 'text/markdown' : 'text/plain', data: text };
      },
    };
    cb.current.onReady(handle);
    return () => {
      cb.current.onReady(null);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  const lang = props.language;
  const asMarkdown = !!props.prose && lang === 'markdown';
  useEffect(() => {
    let cancelled = false;
    const resolved = resolveLanguage(lang);
    const load: Promise<Extension> = asMarkdown ? markdownExtension() : resolved ? resolved.load() : Promise.resolve([]);
    load.then(
      (ext) => {
        if (!cancelled) viewRef.current?.dispatch({ effects: comps.current.language.reconfigure(ext) });
      },
      () => {
        // a language chunk that cannot load degrades to plain text; editing is unaffected
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lang, asMarkdown]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.wrap.reconfigure(wrapExt(props.wrap)) });
  }, [props.wrap]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.tabs.reconfigure(tabsExt(props.tabSize)) });
  }, [props.tabSize]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.gutter.reconfigure(gutterExt(props.lineNumbers, !!props.prose)) });
  }, [props.lineNumbers, props.prose]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.readOnly.reconfigure(readOnlyExt(props.readOnly)) });
  }, [props.readOnly]);

  return <div ref={host} className="cb-cm" data-readonly={props.readOnly || undefined} />;
}
