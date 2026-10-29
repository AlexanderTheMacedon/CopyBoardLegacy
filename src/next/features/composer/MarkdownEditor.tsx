import { useCallback, useDeferredValue, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { CodeEditor, type CodeHandle } from './CodeEditor';
import type { EditorPrefs, HistoryState } from './editor-types';
import { markdownCommands, markdownKeymap } from './markdown-commands';
import { MarkdownPreview } from './MarkdownPreview';
import { shortcutLabel, ToolButton, ToolGroup, ToolSeparator } from './Toolbar';
import { markdownTypesetting, selectionPill, type PillRenderer } from './writing-surface';

export type MarkdownMode = 'source' | 'preview' | 'split';

interface MarkdownEditorProps {
  readonly initial: string;
  readonly mode: MarkdownMode;
  readonly readOnly: boolean;
  readonly prefs: EditorPrefs;
  readonly title: string;
  readonly onChange: (text: string) => void;
  readonly onHistory: (state: HistoryState) => void;
  readonly onReady: (handle: CodeHandle | null) => void;
}

/** Icon paths of the pill (same drawings as the toolbar's icons); the pill lives in CodeMirror's tooltip layer, outside React. */
const pillTools: { label: string; shortcut: string; d: string; run: (view: CodeHandle['view']) => boolean }[] = [
  { label: 'Fett', shortcut: '⌘B', d: 'M7 4.5h6a3.5 3.5 0 0 1 0 7H7Zm0 7h7a3.75 3.75 0 0 1 0 7.5H7Z', run: markdownCommands.bold },
  { label: 'Kursiv', shortcut: '⌘I', d: 'M10 4.5h7M7 19.5h7M14.5 4.5 9.5 19.5', run: markdownCommands.italic },
  {
    label: 'Durchgestrichen',
    shortcut: '⇧⌘X',
    d: 'M5 12h14M16.5 7.5c-.5-1.6-2.2-2.5-4.5-2.5-2.6 0-4.3 1.2-4.3 3 0 1.4 1 2.2 3 2.8M7.5 16.5c.6 1.6 2.3 2.5 4.6 2.5 2.7 0 4.4-1.2 4.4-3 0-.9-.4-1.5-1.1-2',
    run: markdownCommands.strike,
  },
  { label: 'Inline-Code', shortcut: '⌘E', d: 'm8.5 8-4 4 4 4M15.5 8l4 4-4 4', run: markdownCommands.code },
  {
    label: 'Link',
    shortcut: '⌘K',
    d: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
    run: markdownCommands.link,
  },
];

const SVG = 'http://www.w3.org/2000/svg';

const renderPill: PillRenderer = (dom, view) => {
  dom.setAttribute('role', 'toolbar');
  dom.setAttribute('aria-label', 'Auswahl formatieren');
  for (const tool of pillTools) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cb-tool cb-pill__tool';
    button.setAttribute('aria-label', tool.label);
    button.title = `${tool.label} (${shortcutLabel(tool.shortcut)})`;
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }))
      svg.setAttribute(k, v);
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', tool.d);
    svg.append(path);
    button.append(svg);
    button.addEventListener('click', () => tool.run(view));
    dom.append(button);
  }
  return () => dom.replaceChildren();
};

const extensions = [markdownKeymap, markdownTypesetting, selectionPill(renderPill)];

/**
 * Markdown writing: CodeMirror source (canonical string, edited as text only) + safe live preview. Both surfaces stay
 * mounted in every mode, so the source keeps its history, selection and scroll position, and a mode switch never
 * re-creates anything: the two grid columns glide between their widths (Run D.1). A leaving surface keeps the width it
 * had while its column closes (no re-wrapping during the glide) and fades towards its own side; a hidden surface is inert.
 * Split scrolls the preview with the source.
 */
export function MarkdownEditor({ initial, mode, readOnly, prefs, title, onChange, onHistory, onReady }: MarkdownEditorProps) {
  const [text, setText] = useState(initial);
  const deferred = useDeferredValue(text);
  const preview = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLDivElement>(null);
  const showSource = mode !== 'preview';
  const showPreview = mode !== 'source';
  // a hidden preview keeps its last render instead of re-rendering on every keystroke; showing it renders the current text
  const shownText = useRef(initial);
  if (showPreview) shownText.current = deferred;

  // Freeze a leaving surface at the width it had (read before the glide moves anything: transitions start from the old
  // layout), release it once it shows again so it grows with its column. Without motion there is nothing to freeze.
  const lastMode = useRef(mode);
  useLayoutEffect(() => {
    const was = lastMode.current;
    lastMode.current = mode;
    for (const [pane, shown, wasShown] of [
      [source.current, showSource, was !== 'preview'],
      [preview.current, showPreview, was !== 'source'],
    ] as const) {
      if (!pane) continue;
      if (shown) pane.style.removeProperty('--cb-md-frozen');
      else if (wasShown && pane.offsetWidth > 0) pane.style.setProperty('--cb-md-frozen', `${pane.offsetWidth}px`);
    }
  }, [mode, showSource, showPreview]);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);
      onChange(value);
    },
    [onChange],
  );
  const sync = useCallback((ratio: number) => {
    const el = preview.current;
    if (el) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  }, []);

  return (
    <div className="cb-md" data-mode={mode} data-width={prefs.width}>
      <div ref={source} className="cb-composer__pane cb-md__source" data-shown={showSource} inert={!showSource}>
        <span className="cb-composer__pane-label" aria-hidden="true">
          <Icon name="code" size={12} />
          Markdown
        </span>
        <CodeEditor
          initial={initial}
          language="markdown"
          prose
          readOnly={readOnly}
          wrap={prefs.wrap}
          tabSize={prefs.tabSize}
          lineNumbers={prefs.lineNumbers}
          ariaLabel="Markdown-Quelltext"
          placeholder={readOnly ? undefined : 'Schreib los … # Überschrift, **fett**, - Liste'}
          title={title}
          extensions={extensions}
          onChange={handleChange}
          onHistory={onHistory}
          onReady={onReady}
          onScroll={mode === 'split' ? sync : undefined}
        />
      </div>
      <div
        ref={preview}
        className="cb-composer__pane cb-composer__pane--preview"
        aria-label="Markdown-Vorschau"
        role="region"
        data-shown={showPreview}
        inert={!showPreview}
      >
        <span className="cb-composer__pane-label" aria-hidden="true">
          <Icon name="eye" size={12} />
          Vorschau
        </span>
        <MarkdownPreview source={shownText.current} />
      </div>
    </div>
  );
}

/** Formatting toolbar: edits the Markdown source only. Disabled while only the preview is shown. */
export function MarkdownToolbar({ handle, disabled }: { handle: CodeHandle | null; disabled: boolean }) {
  const off = disabled || !handle;
  const run = (fn: (view: CodeHandle['view']) => boolean) => () => handle && fn(handle.view);
  return (
    <div className="cb-canvas-bar__set" role="toolbar" aria-label="Markdown-Formatierung" data-disabled={off || undefined}>
      <ToolGroup label="Überschriften">
        <ToolButton icon="heading" text="1" label="Überschrift 1" shortcut="⌥⌘1" disabled={off} onClick={run((v) => markdownCommands.heading(v, 1))} />
        <ToolButton icon="heading" text="2" label="Überschrift 2" shortcut="⌥⌘2" disabled={off} onClick={run((v) => markdownCommands.heading(v, 2))} />
        <ToolButton icon="heading" text="3" label="Überschrift 3" shortcut="⌥⌘3" disabled={off} onClick={run((v) => markdownCommands.heading(v, 3))} />
      </ToolGroup>
      <ToolSeparator />
      <ToolGroup label="Zeichen">
        <ToolButton icon="bold" label="Fett" shortcut="⌘B" disabled={off} onClick={run(markdownCommands.bold)} />
        <ToolButton icon="italic" label="Kursiv" shortcut="⌘I" disabled={off} onClick={run(markdownCommands.italic)} />
        <ToolButton icon="strikethrough" label="Durchgestrichen" shortcut="⇧⌘X" disabled={off} onClick={run(markdownCommands.strike)} />
        <ToolButton icon="code" label="Inline-Code" shortcut="⌘E" disabled={off} onClick={run(markdownCommands.code)} />
        <ToolButton icon="link" label="Link" shortcut="⌘K" disabled={off} onClick={run(markdownCommands.link)} />
      </ToolGroup>
      <ToolSeparator />
      <ToolGroup label="Blöcke">
        <ToolButton icon="list" label="Aufzählung" shortcut="⇧⌘8" disabled={off} onClick={run(markdownCommands.bullet)} />
        <ToolButton icon="listOrdered" label="Nummerierung" shortcut="⇧⌘7" disabled={off} onClick={run(markdownCommands.ordered)} />
        <ToolButton icon="listChecks" label="Checkliste" shortcut="⇧⌘9" disabled={off} onClick={run(markdownCommands.task)} />
        <ToolButton icon="quote" label="Zitat" disabled={off} onClick={run(markdownCommands.quote)} />
        <ToolButton icon="terminal" label="Codeblock" disabled={off} onClick={run(markdownCommands.codeBlock)} />
      </ToolGroup>
    </div>
  );
}
