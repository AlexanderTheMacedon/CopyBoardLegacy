import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Extension, Mark, type CommandProps, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  BLOCK_FONT_SIZE,
  FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  MAX_INDENT,
  PARAGRAPH_SPACINGS,
  fontFamilyKey,
  fontSizeValue,
  highlightColor,
  indentValue,
  lineHeightValue,
  paletteColor,
  safeHref,
  spacingValue,
} from '../../domain/document';

// Document formatting (schema 2) as Tiptap extensions. Every attribute is parsed through the same validators the stored-tree
// sanitiser uses, so what the editor shows is exactly what gets saved: a value outside the curated sets never enters the
// editor, neither from a paste nor from an internal copy. Rendered HTML carries a data attribute (read back on paste) and
// a plain inline style, so exported files and print look right without the app's stylesheet.

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: {
      setHighlight: (color: string) => ReturnType;
      toggleHighlight: (color: string) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
    blockFormat: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setBlockLineHeight: (value: string | null) => ReturnType;
      setBlockSpacing: (value: string | null) => ReturnType;
      clearFormatting: () => ReturnType;
    };
  }
}

const BLOCK_TYPES = ['paragraph', 'heading'];
const fontStack = (key: string) => FONT_FAMILIES.find((f) => f.value === key)?.stack;
const highlightHex = (key: string) => HIGHLIGHT_COLORS.find((c) => c.value === key)?.hex;

/** `textStyle` spans are recognised by their curated data attributes as well as by an inline style. */
export const DocTextStyle = TextStyle.extend({
  parseHTML() {
    return [
      {
        tag: 'span',
        consuming: false,
        getAttrs: (element) => (['style', 'data-font', 'data-size', 'data-text-color'].some((a) => element.hasAttribute(a)) ? {} : false),
      },
    ];
  },
});

/** Palette colour, font family and font size on `textStyle`, plus their commands. */
export const Typography = Extension.create({
  name: 'typography',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => paletteColor(element.getAttribute('data-text-color') ?? element.style.color) ?? null,
            renderHTML: (attrs) => (attrs.color ? { 'data-text-color': attrs.color, style: `color: ${attrs.color}` } : {}),
          },
          fontFamily: {
            default: null,
            parseHTML: (element) => fontFamilyKey(element.getAttribute('data-font')) ?? null,
            renderHTML: (attrs) => (attrs.fontFamily && fontStack(attrs.fontFamily) ? { 'data-font': attrs.fontFamily, style: `font-family: ${fontStack(attrs.fontFamily)}` } : {}),
          },
          fontSize: {
            default: null,
            parseHTML: (element) => fontSizeValue(element.getAttribute('data-size')) ?? null,
            renderHTML: (attrs) => (attrs.fontSize ? { 'data-size': attrs.fontSize, style: `font-size: ${attrs.fontSize}px` } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setColor: (color) => ({ chain }) => chain().setMark('textStyle', { color: paletteColor(color) ?? null }).removeEmptyTextStyle().run(),
      unsetColor: () => ({ chain }) => chain().setMark('textStyle', { color: null }).removeEmptyTextStyle().run(),
      setFontFamily: (fontFamily) => ({ chain }) => chain().setMark('textStyle', { fontFamily: fontFamilyKey(fontFamily) ?? null }).removeEmptyTextStyle().run(),
      unsetFontFamily: () => ({ chain }) => chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
      setFontSize: (fontSize) => ({ chain }) => chain().setMark('textStyle', { fontSize: fontSizeValue(fontSize) ?? null }).removeEmptyTextStyle().run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** Text marker: a `<mark>` in one of the curated colours (stored as its key). */
export const Highlight = Mark.create({
  name: 'highlight',

  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: (element) => highlightColor(element.getAttribute('data-color')) ?? 'yellow',
        renderHTML: (attrs) => ({ 'data-color': attrs.color, style: `background-color: ${highlightHex(attrs.color) ?? highlightHex('yellow')}` }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setHighlight: (color) => ({ commands }) => commands.setMark(this.name, { color: highlightColor(color) ?? 'yellow' }),
      toggleHighlight: (color) => ({ commands }) => commands.toggleMark(this.name, { color: highlightColor(color) ?? 'yellow' }),
      unsetHighlight: () => ({ commands }) => commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleHighlight('yellow') };
  },
});

/** Marks "Formatierung entfernen" clears; links stay (they are content, not styling). */
const STYLE_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'highlight'];

/** Indent, line height and paragraph spacing on paragraphs and headings; indent/outdent nest list items instead. */
export const BlockFormat = Extension.create({
  name: 'blockFormat',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          indent: {
            default: null,
            parseHTML: (element) => indentValue(element.getAttribute('data-indent')) ?? null,
            renderHTML: (attrs) => (attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * 1.5}em` } : {}),
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => lineHeightValue(element.getAttribute('data-line-height')) ?? null,
            renderHTML: (attrs) => (attrs.lineHeight ? { 'data-line-height': attrs.lineHeight, style: `line-height: ${attrs.lineHeight}` } : {}),
          },
          spacing: {
            default: null,
            parseHTML: (element) => spacingValue(element.getAttribute('data-spacing')) ?? null,
            renderHTML: (attrs) => {
              const spacing = PARAGRAPH_SPACINGS.find((p) => p.value === attrs.spacing);
              return spacing ? { 'data-spacing': spacing.value, style: `margin-top: ${spacing.em}em` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const shift =
      (delta: 1 | -1) =>
      () =>
      ({ editor, tr, commands }: CommandProps) => {
        // inside a list the level is the list's own nesting, not a margin
        const item = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null;
        if (item) return delta > 0 ? commands.sinkListItem(item) : commands.liftListItem(item);
        const { from, to } = tr.selection;
        let changed = false;
        tr.doc.nodesBetween(from, to, (node, pos) => {
          if (!BLOCK_TYPES.includes(node.type.name)) return true;
          const next = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent ?? 0) + delta));
          if (next !== (node.attrs.indent ?? 0)) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next || null });
            changed = true;
          }
          return false;
        });
        return changed;
      };
    return {
      indent: shift(1),
      outdent: shift(-1),
      setBlockLineHeight:
        (value) =>
        ({ chain }) =>
          BLOCK_TYPES.reduce((c, type) => c.updateAttributes(type, { lineHeight: lineHeightValue(value) ?? null }), chain()).run(),
      setBlockSpacing:
        (value) =>
        ({ chain }) =>
          BLOCK_TYPES.reduce((c, type) => c.updateAttributes(type, { spacing: spacingValue(value) ?? null }), chain()).run(),
      clearFormatting:
        () =>
        ({ chain }) => {
          const c = STYLE_MARKS.reduce((acc, mark) => acc.unsetMark(mark, { extendEmptyMarkRange: true }), chain());
          return BLOCK_TYPES.reduce((acc, type) => acc.updateAttributes(type, { textAlign: null, indent: null, lineHeight: null, spacing: null }), c).run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => this.editor.commands.indent(),
      'Mod-[': () => this.editor.commands.outdent(),
      'Mod-\\': () => this.editor.commands.clearFormatting(),
    };
  },
});

/** Only these nodes, marks and attributes exist in a document. Everything pasted or loaded is mapped onto this schema or dropped by it. */
export const documentExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // no automatic trailing paragraph: it rewrote documents that end in a heading, list or table merely by opening them
    // (the gap cursor still lets the caret continue after a table)
    trailingNode: false,
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
  DocTextStyle,
  Typography,
  Highlight,
  BlockFormat,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node, checked) => `Aufgabe ${checked ? 'erledigt' : 'offen'}: ${node.textContent || 'leer'}` } }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: 'Schreibe etwas …' }),
];

/** The size the caret or selection shows: the stored mark, else the block's natural size. */
export function currentFontSize(editor: Editor): number {
  const stored = fontSizeValue(editor.getAttributes('textStyle').fontSize);
  if (stored) return Number(stored);
  for (const level of [1, 2, 3] as const) if (editor.isActive('heading', { level })) return BLOCK_FONT_SIZE[`h${level}`] ?? 17;
  return BLOCK_FONT_SIZE.paragraph ?? 17;
}

/** Next curated size up or down from the current one. */
export function steppedFontSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZES.find((s) => s > current) ?? FONT_SIZE_MAX;
  return [...FONT_SIZES].reverse().find((s) => s < current) ?? FONT_SIZE_MIN;
}
