import { EditorSelection, type ChangeSpec } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';

// Markdown formatting acts on the source text only: the string stays the single source of truth, nothing is converted.

/** Toggles an inline marker (`**`, `*`, `` ` ``, `~~`) around every selection; an empty selection inserts a pair and puts the caret between. */
export function toggleWrap(view: EditorView, marker: string, placeholder = ''): boolean {
  const { state } = view;
  const m = marker.length;
  const spec = state.changeByRange((range) => {
    const before = state.sliceDoc(Math.max(0, range.from - m), range.from);
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + m));
    if (before === marker && after === marker) {
      // already wrapped: remove the markers
      return {
        changes: [
          { from: range.from - m, to: range.from },
          { from: range.to, to: range.to + m },
        ],
        range: EditorSelection.range(range.from - m, range.to - m),
      };
    }
    const text = range.empty ? placeholder : state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: `${marker}${text}${marker}` },
      range: EditorSelection.range(range.from + m, range.from + m + text.length),
    };
  });
  view.dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }));
  view.focus();
  return true;
}

const HEADING = /^#{1,6}\s+/;
const LIST = /^(\s*)([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/;

/** Toggles a line prefix on every selected line. Headings replace each other; the same heading again removes it. */
export function toggleLinePrefix(view: EditorView, prefix: string, kind: 'heading' | 'list' | 'quote'): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  const lines = [];
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        lines.push(line);
      }
      pos = line.to + 1;
    }
  }
  const strip = kind === 'heading' ? HEADING : kind === 'quote' ? /^>\s?/ : LIST;
  const allHave = lines.every((line) => line.text.startsWith(prefix) || (kind === 'list' && prefix.startsWith('1.') && /^\d+[.)]\s/.test(line.text)));
  let n = 1;
  for (const line of lines) {
    const existing = strip.exec(line.text)?.[0] ?? '';
    const marker = kind === 'list' && prefix.startsWith('1.') ? `${n++}. ` : prefix;
    changes.push({ from: line.from, to: line.from + existing.length, insert: allHave ? '' : marker });
  }
  // assoc 1: a caret at the start of a line moves behind the marker that was inserted there
  const set = state.changes(changes);
  view.dispatch({ changes: set, selection: state.selection.map(set, 1), scrollIntoView: true, userEvent: 'input.format' });
  view.focus();
  return true;
}

export function insertLink(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const text = range.empty ? 'Linktext' : state.sliceDoc(range.from, range.to);
  const insert = `[${text}](https://)`;
  const urlStart = range.from + text.length + 3;
  view.dispatch(
    state.update({ changes: { from: range.from, to: range.to, insert }, selection: EditorSelection.range(urlStart, urlStart + 8), scrollIntoView: true, userEvent: 'input.format' }),
  );
  view.focus();
  return true;
}

export function insertCodeBlock(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  const startOfLine = range.from === state.doc.lineAt(range.from).from;
  const lead = startOfLine ? '' : '\n';
  const insert = `${lead}\`\`\`\n${text}\n\`\`\`\n`;
  const caret = range.from + lead.length + 4 + (range.empty ? 0 : text.length);
  view.dispatch(state.update({ changes: { from: range.from, to: range.to, insert }, selection: EditorSelection.cursor(caret), scrollIntoView: true, userEvent: 'input.format' }));
  view.focus();
  return true;
}

export const markdownCommands = {
  heading: (view: EditorView, level: 1 | 2 | 3) => toggleLinePrefix(view, `${'#'.repeat(level)} `, 'heading'),
  bold: (view: EditorView) => toggleWrap(view, '**', 'fett'),
  italic: (view: EditorView) => toggleWrap(view, '*', 'kursiv'),
  strike: (view: EditorView) => toggleWrap(view, '~~', 'durchgestrichen'),
  code: (view: EditorView) => toggleWrap(view, '`', 'code'),
  link: insertLink,
  bullet: (view: EditorView) => toggleLinePrefix(view, '- ', 'list'),
  ordered: (view: EditorView) => toggleLinePrefix(view, '1. ', 'list'),
  task: (view: EditorView) => toggleLinePrefix(view, '- [ ] ', 'list'),
  quote: (view: EditorView) => toggleLinePrefix(view, '> ', 'quote'),
  codeBlock: insertCodeBlock,
};

/** Shortcuts for the Markdown source; they replace nothing the browser or the global app uses while an editor has focus. */
export const markdownKeymap = keymap.of([
  { key: 'Mod-b', run: markdownCommands.bold },
  { key: 'Mod-i', run: markdownCommands.italic },
  { key: 'Mod-k', run: markdownCommands.link },
  { key: 'Mod-e', run: markdownCommands.code },
  { key: 'Mod-Shift-x', run: markdownCommands.strike },
  { key: 'Mod-Alt-1', run: (v) => markdownCommands.heading(v, 1) },
  { key: 'Mod-Alt-2', run: (v) => markdownCommands.heading(v, 2) },
  { key: 'Mod-Alt-3', run: (v) => markdownCommands.heading(v, 3) },
  { key: 'Mod-Shift-8', run: markdownCommands.bullet },
  { key: 'Mod-Shift-7', run: markdownCommands.ordered },
  { key: 'Mod-Shift-9', run: markdownCommands.task },
]);
