import { useCallback, useDeferredValue, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { CodeEditor, type CodeHandle } from './CodeEditor';
import type { EditorPrefs, HistoryState } from './editor-types';
import { markdownCommands, markdownKeymap } from './markdown-commands';
import { MarkdownPreview } from './MarkdownPreview';
import { ToolButton, ToolGroup, ToolSeparator } from './Toolbar';

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

const extensions = [markdownKeymap];

/**
 * Markdown writing: CodeMirror source (canonical string, edited as text only) + safe live preview. The source view stays
 * mounted in preview mode, so its history and selection survive mode switches. Split scrolls the preview with the source.
 */
export function MarkdownEditor({ initial, mode, readOnly, prefs, title, onChange, onHistory, onReady }: MarkdownEditorProps) {
  const [text, setText] = useState(initial);
  const deferred = useDeferredValue(text);
  const preview = useRef<HTMLDivElement>(null);
  const showSource = mode !== 'preview';
  const showPreview = mode !== 'source';

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
      <div className="cb-composer__pane cb-md__source" hidden={!showSource}>
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
          title={title}
          extensions={extensions}
          onChange={handleChange}
          onHistory={onHistory}
          onReady={onReady}
          onScroll={mode === 'split' ? sync : undefined}
        />
      </div>
      {showPreview && (
        <div ref={preview} className="cb-composer__pane cb-composer__pane--preview" aria-label="Markdown-Vorschau" role="region">
          <span className="cb-composer__pane-label" aria-hidden="true">
            <Icon name="eye" size={12} />
            Vorschau
          </span>
          <MarkdownPreview source={deferred} />
        </div>
      )}
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
