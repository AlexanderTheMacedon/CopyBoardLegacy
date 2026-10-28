import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  LanguageDescription,
  StreamLanguage,
  syntaxHighlighting,
  type LanguageSupport,
} from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// CodeMirror 6 configuration shared by the Code and the Markdown editor. Languages load lazily (own chunks); colours come
// from CSS variables, so the editor follows the app's light/dark theme without a second theme object.

export interface CodeLanguage {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly ext: string;
  readonly load: () => Promise<Extension>;
}

const legacy = (parser: () => Promise<Parameters<typeof StreamLanguage.define>[0]>) => async (): Promise<Extension> => StreamLanguage.define(await parser());

export const codeLanguages: readonly CodeLanguage[] = [
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx'], ext: 'ts', load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }) },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'jsx', 'mjs', 'node'], ext: 'js', load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }) },
  { id: 'json', label: 'JSON', aliases: ['jsonc'], ext: 'json', load: async () => (await import('@codemirror/lang-json')).json() },
  { id: 'html', label: 'HTML', aliases: ['xml', 'svg'], ext: 'html', load: async () => (await import('@codemirror/lang-html')).html() },
  { id: 'css', label: 'CSS', aliases: ['scss'], ext: 'css', load: async () => (await import('@codemirror/lang-css')).css() },
  { id: 'python', label: 'Python', aliases: ['py'], ext: 'py', load: async () => (await import('@codemirror/lang-python')).python() },
  { id: 'sql', label: 'SQL', aliases: ['mysql', 'postgres', 'postgresql', 'sqlite'], ext: 'sql', load: async () => (await import('@codemirror/lang-sql')).sql() },
  { id: 'bash', label: 'Shell', aliases: ['sh', 'shell', 'zsh'], ext: 'sh', load: legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell) },
  { id: 'markdown', label: 'Markdown', aliases: ['md'], ext: 'md', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  { id: 'go', label: 'Go', aliases: ['golang'], ext: 'go', load: legacy(async () => (await import('@codemirror/legacy-modes/mode/go')).go) },
  { id: 'rust', label: 'Rust', aliases: ['rs'], ext: 'rs', load: legacy(async () => (await import('@codemirror/legacy-modes/mode/rust')).rust) },
  { id: 'swift', label: 'Swift', aliases: [], ext: 'swift', load: legacy(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift) },
  { id: 'yaml', label: 'YAML', aliases: ['yml'], ext: 'yml', load: legacy(async () => (await import('@codemirror/legacy-modes/mode/yaml')).yaml) },
];

/** Unknown names fall back to plain text (`undefined`); matching ignores case. */
export function resolveLanguage(name: string): CodeLanguage | undefined {
  const key = name.trim().toLowerCase();
  return codeLanguages.find((l) => l.id === key || l.aliases.includes(key));
}

/** Markdown with fenced blocks highlighted in their own language, loaded on demand. */
export async function markdownExtension(): Promise<Extension> {
  const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown');
  const fences = codeLanguages
    .filter((l) => l.id !== 'markdown')
    .map((l) => LanguageDescription.of({ name: l.id, alias: [...l.aliases], load: async () => (await l.load()) as LanguageSupport }));
  return markdown({ base: markdownLanguage, codeLanguages: fences });
}

const german: Record<string, string> = {
  Find: 'Suchen',
  Replace: 'Ersetzen',
  next: 'Weiter',
  previous: 'Zurück',
  all: 'Alle',
  'match case': 'Groß-/Kleinschreibung',
  regexp: 'RegEx',
  'by word': 'Ganzes Wort',
  replace: 'Ersetzen',
  'replace all': 'Alle ersetzen',
  close: 'Schließen',
  'Go to line': 'Gehe zu Zeile',
  go: 'Los',
  'Folded lines': 'Eingeklappte Zeilen',
  'Unfolded lines': 'Aufgeklappte Zeilen',
  'to': 'bis',
  'folded code': 'eingeklappter Code',
  unfold: 'aufklappen',
  'Fold line': 'Zeile einklappen',
  'Unfold line': 'Zeile aufklappen',
  'Control character': 'Steuerzeichen',
};

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: 'var(--cb-syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--cb-syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cb-syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cb-syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: 'var(--cb-syn-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--cb-syn-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--cb-syn-property)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--cb-syn-punct)' },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: 'var(--cb-syn-keyword)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--cb-syn-function)', textDecoration: 'underline' },
  { tag: [t.monospace, t.processingInstruction, t.meta], color: 'var(--cb-syn-type)' },
  { tag: t.quote, color: 'var(--cb-syn-comment)' },
  { tag: t.invalid, color: 'var(--cb-status-error)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--cb-text-primary)', backgroundColor: 'transparent', fontSize: 'var(--cb-editor-font, 14px)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--cb-font-mono)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: 'var(--cb-space-4) 0 var(--cb-space-8)', caretColor: 'var(--cb-accent)' },
  '.cm-line': { padding: '0 var(--cb-space-6) 0 var(--cb-space-3)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cb-accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--cb-p-orange) 26%, transparent)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--cb-text-primary) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--cb-text-secondary)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--cb-text-tertiary)', border: 'none', paddingLeft: 'var(--cb-space-3)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px', minWidth: '28px' },
  '.cm-foldGutter .cm-gutterElement': { cursor: 'pointer', opacity: '0', transition: 'opacity 120ms' },
  '.cm-gutters:hover .cm-foldGutter .cm-gutterElement, .cm-foldGutter .cm-gutterElement:focus-visible': { opacity: '1' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--cb-surface-subtle)',
    border: '1px solid var(--cb-border-subtle)',
    color: 'var(--cb-text-secondary)',
    borderRadius: '6px',
    padding: '0 6px',
  },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--cb-p-orange) 22%, transparent)', outline: '1px solid color-mix(in srgb, var(--cb-p-orange) 45%, transparent)' },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'color-mix(in srgb, var(--cb-status-error) 22%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--cb-accent) 16%, transparent)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--cb-p-orange) 24%, transparent)', outline: '1px solid color-mix(in srgb, var(--cb-p-orange) 40%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--cb-p-orange) 46%, transparent)' },
  '.cm-tooltip': {
    border: '1px solid var(--cb-glass-rim)',
    borderRadius: 'var(--cb-radius-control)',
    backgroundColor: 'var(--cb-glass-solid)',
    boxShadow: 'var(--cb-shadow-3)',
    color: 'var(--cb-text-primary)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--cb-font-mono)', fontSize: '13px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--cb-surface-selected)', color: 'var(--cb-text-primary)' },
  '.cm-panels': { backgroundColor: 'transparent', color: 'var(--cb-text-primary)' },
});

export interface CodeFeatures {
  readonly readOnly: boolean;
  readonly wrap: boolean;
  readonly tabSize: number;
  readonly lineNumbers: boolean;
  /** Markdown source: no fold gutter, no autocomplete popups while writing prose. */
  readonly prose?: boolean;
}

/** Compartments let the React wrapper reconfigure one concern at a time without recreating the view or losing history. */
export interface Compartments {
  readonly language: Compartment;
  readonly wrap: Compartment;
  readonly tabs: Compartment;
  readonly gutter: Compartment;
  readonly readOnly: Compartment;
}

export const makeCompartments = (): Compartments => ({
  language: new Compartment(),
  wrap: new Compartment(),
  tabs: new Compartment(),
  gutter: new Compartment(),
  readOnly: new Compartment(),
});

export const wrapExt = (on: boolean): Extension => (on ? EditorView.lineWrapping : []);
export const tabsExt = (size: number): Extension => [EditorState.tabSize.of(size), indentUnit.of(' '.repeat(size))];
export const gutterExt = (on: boolean, prose: boolean): Extension => (on ? [lineNumbers(), highlightActiveLineGutter(), ...(prose ? [] : [foldGutter({ openText: '⌄', closedText: '›' })])] : []);
export const readOnlyExt = (on: boolean): Extension => [EditorState.readOnly.of(on), EditorView.editable.of(!on)];

export function baseExtensions(c: Compartments, features: CodeFeatures, ariaLabel: string): Extension[] {
  const prose = !!features.prose;
  return [
    c.gutter.of(gutterExt(features.lineNumbers, prose)),
    c.language.of([]),
    c.wrap.of(wrapExt(features.wrap)),
    c.tabs.of(tabsExt(features.tabSize)),
    c.readOnly.of(readOnlyExt(features.readOnly)),
    EditorState.phrases.of(german),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(highlight),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    ...(prose ? [] : [autocompletion()]),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...(prose ? [] : completionKeymap), indentWithTab]),
    theme,
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
  ];
}
