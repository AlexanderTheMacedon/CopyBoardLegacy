import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, layer, RectangleMarker, showTooltip, ViewPlugin, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// Writing-surface details shared by the CodeMirror editors, after MyTXT's editor (read-only reference): the current line as
// one soft band that glides with the caret, Markdown source typeset as blocks (fenced code, code chips, heading sizes,
// quiet marks), and a small selection pill for Markdown. Everything is decoration: the text itself is never touched.

/** Inset of the band from the content edges; it reads as a rounded highlight, never as a bar that stops mid-canvas. */
const BAND_INSET = 6;

/**
 * The current line, drawn as one rounded band behind the text. It is a single element that moves (and glides via CSS)
 * rather than a class that jumps from line to line; in wrapped prose it marks the visual row, not the whole paragraph.
 * Only while focused, with one empty selection: a selection or a blurred editor shows no band at all.
 */
export const lineBand: Extension = layer({
  above: false,
  class: 'cb-lineband-layer',
  update: (u) => u.selectionSet || u.docChanged || u.geometryChanged || u.focusChanged || u.viewportChanged,
  markers(view) {
    const sel = view.state.selection;
    if (!view.hasFocus || !sel.main.empty || sel.ranges.length > 1) return [];
    const head = sel.main.head;
    const caret = view.coordsAtPos(head, sel.main.assoc || 1) ?? view.coordsAtPos(head, -1);
    if (!caret) return [];
    const scroller = view.scrollDOM.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const baseLeft = scroller.left - view.scrollDOM.scrollLeft;
    const baseTop = scroller.top - view.scrollDOM.scrollTop;
    const block = view.lineBlockAt(head);
    const lh = view.defaultLineHeight;
    let top: number;
    let height: number;
    if (block.height < lh * 1.6) {
      top = view.documentTop + block.top;
      height = block.height;
    } else {
      // a wrapped paragraph: only the caret's visual row
      const glyph = caret.bottom - caret.top;
      const pad = Math.max(0, (lh - glyph) / 2);
      top = caret.top - pad;
      height = glyph + 2 * pad;
    }
    return [new RectangleMarker('cb-lineband', content.left - baseLeft + BAND_INSET, top - baseTop, Math.max(0, content.width - 2 * BAND_INSET), height)];
  },
});

// --- Markdown source typesetting -------------------------------------------------------------------------------------

/** Classes rather than colours: the stylesheet owns both themes. Applied in addition to the shared colour highlight. */
const markdownClasses = HighlightStyle.define([
  { tag: t.heading1, class: 'cb-mdh cb-mdh1' },
  { tag: t.heading2, class: 'cb-mdh cb-mdh2' },
  { tag: t.heading3, class: 'cb-mdh cb-mdh3' },
  { tag: [t.heading4, t.heading5, t.heading6], class: 'cb-mdh cb-mdh4' },
  { tag: t.processingInstruction, class: 'cb-mdmark' },
  { tag: t.quote, class: 'cb-mdquote' },
  { tag: t.url, class: 'cb-mdurl' },
]);

const fencedLine = Decoration.line({ class: 'cb-mdfence' });
const fencedFirst = Decoration.line({ class: 'cb-mdfence cb-mdfence--first' });
const fencedLast = Decoration.line({ class: 'cb-mdfence cb-mdfence--last' });
const fencedOnly = Decoration.line({ class: 'cb-mdfence cb-mdfence--first cb-mdfence--last' });
const headingLine = Decoration.line({ class: 'cb-mdheading' });
const codeChip = Decoration.mark({ class: 'cb-mdchip' });

/** Fenced code reads as one quiet block, inline code as one chip, heading lines get their own rhythm. Visible ranges only. */
const markdownBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const { doc } = view.state;
      let lastLine = 0;
      const line = (n: number, deco: Decoration) => {
        if (n <= lastLine) return;
        lastLine = n;
        builder.add(doc.line(n).from, doc.line(n).from, deco);
      };
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter(node) {
            if (node.name === 'FencedCode') {
              const first = doc.lineAt(node.from).number;
              const last = doc.lineAt(node.to).number;
              for (let n = Math.max(first, doc.lineAt(from).number); n <= Math.min(last, doc.lineAt(to).number); n++)
                line(n, first === last ? fencedOnly : n === first ? fencedFirst : n === last ? fencedLast : fencedLine);
              return false;
            }
            if (/^ATXHeading\d$/.test(node.name) && doc.lineAt(node.from).from === node.from) line(doc.lineAt(node.from).number, headingLine);
            else if (node.name === 'InlineCode') {
              builder.add(node.from, node.to, codeChip);
              return false;
            }
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

export const markdownTypesetting: Extension = [syntaxHighlighting(markdownClasses), markdownBlocks];

// --- Selection pill ----------------------------------------------------------------------------------------------------

/** Renders the pill's content into `dom`; returns a cleanup. Supplied by the React side, so the pill shares the toolbar's buttons. */
export type PillRenderer = (dom: HTMLElement, view: EditorView) => () => void;

/** Pointer selection in progress: the pill waits until the drag is finished, so it never chases the pointer. */
const holdPill = StateEffect.define<boolean>();

interface PillState {
  readonly hold: boolean;
  readonly tooltip: Tooltip | null;
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * A smaller sibling of the toolbar right above the selected words (Markdown source only): bold, italic, strike, code,
 * link. It never takes focus or the selection away from the text, waits for a pointer drag to finish, and stays away on
 * touch screens, where the system shows its own selection callout.
 */
export function selectionPill(render: PillRenderer): Extension {
  const make = (state: EditorState, fresh: boolean): Tooltip | null => {
    const sel = state.selection;
    if (state.readOnly || sel.main.empty || sel.ranges.length > 1) return null;
    return {
      pos: sel.main.from,
      end: sel.main.to,
      above: true,
      create: (view) => {
        const dom = document.createElement('div');
        dom.className = 'cb-pill';
        if (fresh) dom.setAttribute('data-fresh', '');
        // the editor keeps focus and selection: pressing a pill button never moves either
        dom.addEventListener('mousedown', (event) => event.preventDefault());
        const cleanup = render(dom, view);
        return { dom, destroy: cleanup };
      },
    };
  };

  const field = StateField.define<PillState>({
    create: () => ({ hold: false, tooltip: null }),
    update(value, tr) {
      let hold = value.hold;
      for (const effect of tr.effects) if (effect.is(holdPill)) hold = effect.value;
      if (hold) return value.tooltip || !value.hold ? { hold, tooltip: null } : value;
      if (!tr.selection && !tr.docChanged && hold === value.hold) return value;
      return { hold, tooltip: make(tr.state, !value.tooltip) };
    },
    provide: (f) => showTooltip.from(f, (v) => v.tooltip),
  });

  const pointer = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      view.dispatch({ effects: holdPill.of(true) });
      const release = () => {
        document.removeEventListener('mouseup', release, true);
        // after CodeMirror's own mouseup has settled the selection
        requestAnimationFrame(() => {
          if (view.dom.isConnected) view.dispatch({ effects: holdPill.of(false) });
        });
      };
      document.addEventListener('mouseup', release, true);
      return false;
    },
  });

  return coarse() ? [] : [field, pointer];
}
