import { CompletionContext, completeFromList, pickedCompletion, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { conversionNotes } from '../../src/next/domain/document';
import { codeLanguages } from '../../src/next/features/composer/codemirror';
import { completionExtension } from '../../src/next/features/composer/completions';
import { tagPairAt } from '../../src/next/features/composer/tag-completion';

// Run D.1: tag pairs on completion (HTML, JSX/TSX), and the honest notes of the text → document conversion.

/** Simulates picking `label` from the suggestion list at `|` in `doc`; returns the text with `|` at the caret. */
async function pick(languageId: string, doc: string, label: string): Promise<{ text: string; undone: string }> {
  const at = doc.indexOf('|');
  const language = codeLanguages.find((l) => l.id === languageId);
  let state = EditorState.create({
    doc: doc.replace('|', ''),
    selection: { anchor: at },
    extensions: [language ? await language.load() : [], await completionExtension(languageId), history()],
  });
  // like the autocompletion extension: replace the typed prefix, annotate the transaction as a picked completion
  const prefix = /[\w$.:-]*$/.exec(state.sliceDoc(0, at))?.[0] ?? '';
  const tr = state.update({
    changes: { from: at - prefix.length, to: at, insert: label },
    selection: { anchor: at - prefix.length + label.length },
    annotations: pickedCompletion.of({ label }),
    userEvent: 'input.complete',
  });
  state = tr.state;
  const head = state.selection.main.head;
  const text = `${state.sliceDoc(0, head)}|${state.sliceDoc(head)}`;
  let undone = '';
  undo({ state, dispatch: (t: Transaction) => void (undone = t.state.sliceDoc()) });
  return { text, undone };
}

/** Labels every completion source offers at the end of `doc`. */
async function labelsAt(languageId: string, doc: string): Promise<string[]> {
  const language = codeLanguages.find((l) => l.id === languageId);
  const state = EditorState.create({ doc, extensions: [language ? await language.load() : [], await completionExtension(languageId)] });
  const labels: string[] = [];
  for (const data of state.languageDataAt<CompletionSource | readonly Completion[]>('autocomplete', doc.length)) {
    const source = typeof data === 'function' ? data : completeFromList(data);
    const result = await source(new CompletionContext(state, doc.length, false));
    if (result) labels.push(...result.options.map((o) => o.label));
  }
  return labels;
}

describe('JSX tag names', () => {
  it('offers the capitalised names of the file and HTML elements after `<` in JSX', async () => {
    const labels = await labelsAt('typescript', 'function Card() {}\nconst list = Array.from(x);\nconst a = <Ca');
    expect(labels).toEqual(expect.arrayContaining(['Card', 'Array', 'div', 'section']));
    expect(await labelsAt('javascript', 'const a = (\n  <')).toContain('div');
  });

  it('offers no tags in type arguments or comparisons', async () => {
    expect(await labelsAt('typescript', 'let a: Promise<')).not.toContain('div');
    expect(await labelsAt('typescript', 'if (a < b')).not.toContain('div');
  });
});

describe('tag pairs on completion', () => {
  it('HTML: a picked tag name becomes an open/close pair with the caret between, as one undo step', async () => {
    const r = await pick('html', '<body>\n  <|\n</body>', 'section');
    expect(r.text).toBe('<body>\n  <section>|</section>\n</body>');
    expect(r.undone).toBe('<body>\n  <\n</body>');
    expect((await pick('html', '<ar|', 'article')).text).toBe('<article>|</article>');
  });

  it('HTML: void elements get no closing tag; an already closed element only its `>`', async () => {
    expect((await pick('html', '<p>a <|</p>', 'br')).text).toBe('<p>a <br>|</p>');
    expect((await pick('html', '<|\n</section>', 'section')).text).toBe('<section>|\n</section>');
    // the closing tag belongs to the enclosing div: the new one still needs its own
    expect((await pick('html', '<div>\n  <|\n</div>', 'div')).text).toBe('<div>\n  <div>|</div>\n</div>');
  });

  it('JSX/TSX: components and elements pair up; intrinsic void elements self-close', async () => {
    expect((await pick('typescript', 'const a = <|', 'Array')).text).toBe('const a = <Array>|</Array>');
    expect((await pick('typescript', 'return (\n  <div>\n    <Li|\n  </div>\n);', 'List')).text).toBe('return (\n  <div>\n    <List>|</List>\n  </div>\n);');
    expect((await pick('javascript', 'const x = <|', 'img')).text).toBe('const x = <img| />');
    expect((await pick('typescript', 'const a = <|', 'Array')).undone).toBe('const a = <');
  });

  it('leaves type arguments, comparisons, strings, comments and renames alone', async () => {
    expect((await pick('typescript', 'let a: Promise<Arr|', 'Array')).text).toBe('let a: Promise<Array|');
    expect((await pick('typescript', 'const m = new Map<|', 'string')).text).toBe('const m = new Map<string|');
    expect((await pick('typescript', 'const s = "<|', 'div')).text).toBe('const s = "<div|');
    expect((await pick('typescript', '// <|', 'div')).text).toBe('// <div|');
    expect((await pick('html', '<|>text</div>', 'div')).text).toBe('<div|>text</div>');
    expect((await pick('typescript', 'if (a <b|', 'bar')).text).toBe('if (a <bar|');
  });

  it('works on the state alone (no view): a plain name without `<` is never a tag', async () => {
    const html = await codeLanguages.find((l) => l.id === 'html')!.load();
    const state = EditorState.create({ doc: 'section', extensions: [html] });
    expect(tagPairAt(state, 7)).toBeNull();
  });
});

describe('text → document conversion notes', () => {
  it('names exactly what the document form will not keep', () => {
    expect(conversionNotes('a\nb')).toEqual({ paragraphs: 2, crlf: false, loneCr: false, trailingBlank: 0 });
    expect(conversionNotes('a\r\nb\r\n\r\n')).toEqual({ paragraphs: 4, crlf: true, loneCr: false, trailingBlank: 2 });
    expect(conversionNotes('a\rb\n')).toEqual({ paragraphs: 2, crlf: false, loneCr: true, trailingBlank: 1 });
    expect(conversionNotes('')).toEqual({ paragraphs: 1, crlf: false, loneCr: false, trailingBlank: 0 });
  });
});
