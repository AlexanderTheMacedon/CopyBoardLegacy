import { pickedCompletion } from '@codemirror/autocomplete';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

// Tag pairs on completion (Run D.1). The language packages close a tag only when `>` or `/` is typed; choosing a tag name
// from the suggestion list after `<` left `<div|` behind. Here a picked completion that names an opening tag (HTML, or
// JSX in JS/TS) also gets its `>` and, unless the element is void or already closed, its closing tag, with the caret
// between the two. It is one transaction with the completion itself, so a single undo removes both. Decided on the syntax
// tree only: a `<` in a type argument, a comparison, a string or a comment stays untouched.

/** HTML void elements (the HTML package's own list): `<br>` in HTML, `<br />` in JSX. */
const voidElements = new Set('area base br col command embed frame hr img input keygen link meta param source track wbr menuitem'.split(' '));

/** Nodes that rule a tag pair out: closing tags, type syntax, literal text. */
const notATag = new Set(['CloseTag', 'JSXCloseTag', 'JSXSelfClosingTag', 'TypeArgList', 'TypeParamList', 'String', 'TemplateString', 'LineComment', 'BlockComment', 'Comment', 'JSXText', 'JSXEscape']);

const jsxNames = new Set(['JSXIdentifier', 'JSXBuiltin', 'JSXNamespacedName', 'JSXMemberExpression']);

function elementName(state: EditorState, element: SyntaxNode | null, jsx: boolean): string {
  const open = element?.firstChild;
  if (!open) return '';
  if (!jsx) {
    const name = open.getChild('TagName');
    return name ? state.sliceDoc(name.from, name.to) : '';
  }
  for (let child = open.firstChild; child; child = child.nextSibling) if (jsxNames.has(child.name)) return state.sliceDoc(child.from, child.to);
  return '';
}

/**
 * Whether the element already has its own closing tag. A closing tag of the same name further out may belong to an
 * enclosing element of that name (`<div><div|</div>`), so the chain of same-named parents must be closed as well — the
 * same rule the HTML package applies when `>` is typed.
 */
function isClosed(state: EditorState, element: SyntaxNode, name: string, jsx: boolean): boolean {
  const closeName = jsx ? 'JSXCloseTag' : 'CloseTag';
  for (let current: SyntaxNode = element; ; ) {
    const close = current.lastChild;
    // JSX accepts any closing tag while parsing (`<List></div>`): only one with the same name closes the element
    if (close?.name !== closeName || state.sliceDoc(close.from, close.to).replace(/^<\/\s*|\s*>$/g, '') !== name) return false;
    const next = current.parent;
    if (!next || elementName(state, next, jsx) !== name) return true;
    current = next;
  }
}

/**
 * What a tag name completed at `pos` still needs: `{ insert, caret }` (caret offset from `pos`), or `null` when the text
 * before `pos` is no opening tag name or the tag is already finished.
 */
export function tagPairAt(state: EditorState, pos: number): { insert: string; caret: number } | null {
  const line = state.doc.lineAt(pos);
  const name = /<([A-Za-z_$][\w$.:-]*)$/.exec(state.sliceDoc(line.from, pos))?.[1];
  if (!name) return null;
  // renaming inside an existing tag (`<di|v class="…">`, `<|>`) keeps the rest as it is
  const next = state.sliceDoc(pos, pos + 1);
  if (next && !/[\s<)}\],;]/.test(next)) return null;
  // read the tree as if the tag were finished: `<name>` parses as an opening tag only where one is grammatical
  const probe = state.update({ changes: { from: pos, insert: '>' } }).state;
  const tree = ensureSyntaxTree(probe, Math.min(probe.doc.length, pos + 20_000), 60) ?? syntaxTree(probe);
  let tag: SyntaxNode | null = null;
  for (let node: SyntaxNode | null = tree.resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'OpenTag' || node.name === 'JSXOpenTag') {
      tag = node;
      break;
    }
    // HTML parses a void element (`<br>`) as a self-closing tag: it only needs its `>`
    if (node.name === 'SelfClosingTag') return { insert: '>', caret: 1 };
    if (notATag.has(node.name)) return null;
  }
  const element = tag?.parent;
  if (!tag || !element) return null;
  const jsx = tag.name === 'JSXOpenTag';
  if (elementName(probe, element, jsx) !== name) return null;
  if (voidElements.has(jsx ? name : name.toLowerCase())) return jsx ? { insert: ' />', caret: 0 } : { insert: '>', caret: 1 };
  if (isClosed(probe, element, name, jsx)) return { insert: '>', caret: 1 };
  return { insert: `></${name}>`, caret: 1 };
}

/** Completes the tag pair in the same transaction as the picked completion (one undo step, no second history entry). */
export const tagPairOnCompletion: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.annotation(pickedCompletion)) return tr;
  const { state } = tr;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1) return tr;
  const pair = tagPairAt(state, range.head);
  if (!pair) return tr;
  return [tr, { changes: { from: range.head, insert: pair.insert }, selection: { anchor: range.head + pair.caret }, sequential: true }];
});
