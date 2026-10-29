import { completeAnyWord, completeFromList, ifNotIn, snippetCompletion as snip, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { tagPairOnCompletion } from './tag-completion';

// Practical, local code completion (no language server): what the editor can honestly know from the text and the language.
// Measured before this run: TS/JS offered keywords, snippets and local declarations; Python builtins and locals; every other
// language nothing at all. This module adds, per language, curated keywords and snippets, the words already in the
// buffer, and for JS/TS the members of the standard globals (`console.` → log, error …). Nothing here claims type knowledge.

const kw = (words: string): Completion[] => words.split(' ').map((label) => ({ label, type: 'keyword' }));

/** Keywords plus snippets; a keyword that also has a snippet is offered once, as the snippet. */
const vocab = (words: string, snippets: Completion[]): Completion[] => {
  const labels = new Set(snippets.map((s) => s.label));
  return [...kw(words).filter((k) => !labels.has(k.label)), ...snippets];
};

/** JS/TS: frequent statements the language package does not ship as snippets. */
const jsSnippets: Completion[] = [
  snip('console.log(${value})', { label: 'log', detail: 'console.log(…)', type: 'function' }),
  snip('(${params}) => {\n\t${}\n}', { label: 'arrow', detail: 'Pfeilfunktion', type: 'keyword' }),
  snip('async function ${name}(${params}) {\n\t${}\n}', { label: 'async function', detail: 'Definition', type: 'keyword' }),
  snip('const ${name} = await ${value};', { label: 'await', detail: 'const … = await …', type: 'keyword' }),
  snip('export function ${name}(${params}) {\n\t${}\n}', { label: 'export function', detail: 'Definition', type: 'keyword' }),
];

/**
 * The standard globals offered after a dot. A curated, static set (never the live `window`): enumerating these objects
 * only reads property names, so suggestions cannot trigger getters with side effects.
 */
const jsGlobals: Record<string, unknown> = {
  console,
  Math,
  JSON,
  Object,
  Array,
  Promise,
  Number,
  String,
  Boolean,
  Date,
  Map,
  Set,
  WeakMap,
  Symbol,
  Reflect,
  Intl,
  Error,
  RegExp,
  URL,
  parseInt,
  parseFloat,
  isNaN,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  structuredClone,
  queueMicrotask,
};

const lists: Record<string, Completion[]> = {
  go: vocab(
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota append cap close copy delete len make new panic print println recover error string int int64 float64 bool byte rune any',
    [
      snip('func ${name}(${params}) ${result} {\n\t${}\n}', { label: 'func', detail: 'Funktion', type: 'keyword' }),
      snip('if err != nil {\n\treturn ${err}\n}', { label: 'iferr', detail: 'if err != nil', type: 'keyword' }),
      snip('for ${i} := 0; ${i} < ${n}; ${i}++ {\n\t${}\n}', { label: 'for', detail: 'Zählschleife', type: 'keyword' }),
      snip('for ${key}, ${value} := range ${items} {\n\t${}\n}', { label: 'range', detail: 'for … range', type: 'keyword' }),
      snip('type ${Name} struct {\n\t${}\n}', { label: 'struct', detail: 'Typdefinition', type: 'keyword' }),
    ],
  ),
  rust: vocab(
    'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Some None Ok Err Option Result Vec String Box println! format! vec! panic!',
    [
      snip('fn ${name}(${params}) -> ${Type} {\n\t${}\n}', { label: 'fn', detail: 'Funktion', type: 'keyword' }),
      snip('match ${value} {\n\t${pattern} => ${},\n\t_ => ${},\n}', { label: 'match', detail: 'Muster', type: 'keyword' }),
      snip('impl ${Type} {\n\t${}\n}', { label: 'impl', detail: 'Implementierung', type: 'keyword' }),
      snip('struct ${Name} {\n\t${}\n}', { label: 'struct', detail: 'Typdefinition', type: 'keyword' }),
      snip('for ${item} in ${items} {\n\t${}\n}', { label: 'for', detail: 'for … in', type: 'keyword' }),
    ],
  ),
  swift: vocab(
    'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as Any catch false is nil super self Self throw throws true try async await String Int Double Bool Array Dictionary Optional print',
    [
      snip('func ${name}(${params}) -> ${Type} {\n\t${}\n}', { label: 'func', detail: 'Funktion', type: 'keyword' }),
      snip('guard let ${value} = ${optional} else {\n\treturn\n}', { label: 'guard', detail: 'guard let … else', type: 'keyword' }),
      snip('if let ${value} = ${optional} {\n\t${}\n}', { label: 'iflet', detail: 'if let …', type: 'keyword' }),
      snip('struct ${Name} {\n\t${}\n}', { label: 'struct', detail: 'Typdefinition', type: 'keyword' }),
    ],
  ),
  bash: vocab(
    'if then else elif fi case esac for select while until do done in function time echo printf read local export return exit set unset shift source test cd pwd ls grep sed awk cat',
    [
      snip('if [ ${condition} ]; then\n\t${}\nfi', { label: 'if', detail: 'if … fi', type: 'keyword' }),
      snip('for ${item} in ${items}; do\n\t${}\ndone', { label: 'for', detail: 'for … done', type: 'keyword' }),
      snip('${name}() {\n\t${}\n}', { label: 'function', detail: 'Funktion', type: 'keyword' }),
      snip('#!/usr/bin/env bash\nset -euo pipefail\n${}', { label: 'shebang', detail: 'Skriptkopf', type: 'keyword' }),
    ],
  ),
  yaml: kw('true false null'),
  json: kw('true false null'),
};

/** Words already in the buffer, for languages without their own scope analysis; a word the list already offers appears once. */
const bufferWords =
  (known: readonly Completion[]): CompletionSource =>
  async (context) => {
    const result = await completeAnyWord(context);
    if (!result || !known.length) return result;
    const labels = new Set(known.map((c) => c.label));
    return { ...result, options: result.options.filter((o) => !labels.has(o.label)) };
  };

/** Languages whose package already analyses local declarations (adding buffer words there would only duplicate them). */
const scoped = new Set(['typescript', 'javascript', 'python']);

/** Where statement snippets make no sense: after a dot, inside strings, comments, names being declared, JSX text. */
const jsNoSnippets = ['PropertyName', 'PropertyDefinition', 'PrivatePropertyName', 'String', 'TemplateString', 'RegExp', 'LineComment', 'BlockComment', 'VariableDefinition', 'TypeDefinition', 'Label', 'JSXText', 'JSXAttributeValue', 'JSXOpenTag', 'JSXSelfClosingTag', 'JSXCloseTag'];

/** Members every object inherits (`toString`, `__proto__` …): noise in a suggestion list, so they are left out. */
const inherited = new Set(Object.getOwnPropertyNames(Object.prototype));

/** HTML elements offered as JSX tag names (the common ones; any other name can still be typed). */
const jsxElements = 'a article aside audio b blockquote br button canvas code details dialog div em fieldset figure footer form h1 h2 h3 h4 h5 h6 header hr i iframe img input label li main nav ol option p pre section select small span strong summary svg table tbody td textarea th thead tr ul video'
  .split(' ')
  .map((label): Completion => ({ label, type: 'type' }));

/**
 * JSX tag names after `<` (the JavaScript package completes none there): the capitalised names of this file — its
 * components, and the names it uses — plus the common HTML elements. Only where the tree reads JSX, never in type
 * arguments or comparisons. Choosing one closes the tag (tag-completion.ts).
 */
const jsxTagNames: CompletionSource = (context) => {
  const typed = context.matchBefore(/<[A-Za-z_$][\w$.]*$|<$/);
  if (!typed) return null;
  let jsx = false;
  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(context.state).resolveInner(context.pos, -1); node; node = node.parent) {
    if (node.name.startsWith('JSX')) {
      jsx = true;
      break;
    }
    if (node.name === 'TypeArgList' || node.name === 'TypeParamList' || node.name === 'BinaryExpression') break;
  }
  if (!jsx) return null;
  const own = typed.text.slice(1);
  const names = new Set<string>();
  // a long file is read up to a bound: suggestions stay instant
  for (const match of context.state.sliceDoc(0, 200_000).matchAll(/\b[A-Z][\w$]*\b/g)) if (match[0] !== own) names.add(match[0]);
  // no type of its own: a name the language package also offers (a local declaration) then merges into one option
  const components = [...names].map((label): Completion => ({ label }));
  return { from: typed.from + 1, options: [...components, ...jsxElements], validFor: /^[\w$.]*$/ };
};

async function jsExtras(): Promise<CompletionSource[]> {
  const { scopeCompletionSource } = await import('@codemirror/lang-javascript');
  const globals = scopeCompletionSource(jsGlobals);
  const members: CompletionSource = async (context) => {
    const result = await globals(context);
    return result && { ...result, options: result.options.filter((o) => !inherited.has(o.label)) };
  };
  // a JSX tag name is a tag, not an expression: there only the tag names are offered
  const jsxTags = ['JSXOpenTag', 'JSXSelfClosingTag', 'JSXCloseTag'];
  return [ifNotIn(jsxTags, members), ifNotIn(jsNoSnippets, completeFromList(jsSnippets)), jsxTagNames];
}

/** Sources added for one language id (`''` = plain text code). Registered as global language data next to the language's own. */
export async function completionSources(languageId: string): Promise<CompletionSource[]> {
  const sources: CompletionSource[] = [];
  if (languageId === 'typescript' || languageId === 'javascript') sources.push(...(await jsExtras()));
  const list = lists[languageId];
  if (list) sources.push(completeFromList(list));
  if (!scoped.has(languageId)) sources.push(bufferWords(list ?? []));
  return sources;
}

/** Languages with tags: a completed tag name also gets its closing tag (tag-completion.ts). */
const tagged = new Set(['html', 'typescript', 'javascript']);

/** The completion extension of one code language (empty array → nothing beyond what the language brings). */
export async function completionExtension(languageId: string): Promise<Extension> {
  const sources = await completionSources(languageId);
  return [
    sources.length ? EditorState.languageData.of(() => sources.map((autocomplete) => ({ autocomplete }))) : [],
    tagged.has(languageId) ? tagPairOnCompletion : [],
  ];
}
