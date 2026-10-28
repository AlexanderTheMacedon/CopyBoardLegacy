import { useEditorState, type ChainedCommands, type Editor } from '@tiptap/react';
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { PHONE_QUERY, useMediaQuery } from '../../app/hooks';
import { Icon } from '../../components/Icon';
import { Popover } from '../../components/Popover';
import { FONT_FAMILIES, FONT_SIZE_MAX, FONT_SIZE_MIN, FONT_SIZES, HIGHLIGHT_COLORS, LINE_HEIGHTS, PARAGRAPH_SPACINGS, TEXT_COLORS } from '../../domain/document';
import { currentFontSize, steppedFontSize } from './doc-extensions';
import type { DocumentHandle } from './DocumentEditor';
import { shortcutLabel, ToolButton, ToolGroup, ToolSeparator } from './Toolbar';

// Writing studio toolbar (Run C). Mirrors the reference kit's hierarchy: block style, typeface and size first, then
// emphasis, colour and inserts; paragraph tools on a second row. Two rows wrap on narrower canvases; on a phone a priority
// row stays and everything else lives in one "more" sheet. History, export and print are the Canvas shell's own commands.

type Block = 'p' | '1' | '2' | '3' | 'code';
type Align = 'left' | 'center' | 'right' | 'justify';

function selectState({ editor: e }: { editor: Editor }) {
  const style = e.getAttributes('textStyle');
  const block = (e.getAttributes('heading').level ? e.getAttributes('heading') : e.getAttributes('paragraph')) as Record<string, unknown>;
  return {
    block: (e.isActive('heading', { level: 1 }) ? '1' : e.isActive('heading', { level: 2 }) ? '2' : e.isActive('heading', { level: 3 }) ? '3' : e.isActive('codeBlock') ? 'code' : 'p') as Block,
    bold: e.isActive('bold'),
    italic: e.isActive('italic'),
    underline: e.isActive('underline'),
    strike: e.isActive('strike'),
    link: e.isActive('link'),
    bullet: e.isActive('bulletList'),
    ordered: e.isActive('orderedList'),
    task: e.isActive('taskList'),
    quote: e.isActive('blockquote'),
    align: ((['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left') as Align,
    color: (style.color as string | undefined) ?? null,
    font: (style.fontFamily as string | undefined) ?? null,
    size: currentFontSize(e),
    highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? 'yellow') : null,
    lineHeight: (block.lineHeight as string | undefined) ?? null,
    spacing: (block.spacing as string | undefined) ?? null,
    table: e.isActive('table'),
    canIndent: e.can().indent(),
    canOutdent: e.can().outdent(),
  };
}

type DocState = ReturnType<typeof selectState>;

interface ToolsProps {
  readonly editor: Editor;
  readonly s: DocState;
  readonly run: () => ChainedCommands;
  readonly disabled: boolean;
}

const BLOCKS: readonly { value: Block; label: string; shortcut: string }[] = [
  { value: 'p', label: 'Absatz', shortcut: '⌥⌘0' },
  { value: '1', label: 'Titel', shortcut: '⌥⌘1' },
  { value: '2', label: 'Überschrift', shortcut: '⌥⌘2' },
  { value: '3', label: 'Zwischenüberschrift', shortcut: '⌥⌘3' },
  { value: 'code', label: 'Codeblock', shortcut: '⌥⌘C' },
];

const ALIGNS: readonly { value: Align; icon: 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify'; label: string; shortcut: string }[] = [
  { value: 'left', icon: 'alignLeft', label: 'Linksbündig', shortcut: '⇧⌘L' },
  { value: 'center', icon: 'alignCenter', label: 'Zentriert', shortcut: '⇧⌘E' },
  { value: 'right', icon: 'alignRight', label: 'Rechtsbündig', shortcut: '⇧⌘R' },
  { value: 'justify', icon: 'alignJustify', label: 'Blocksatz', shortcut: '⇧⌘J' },
];

/** Arrow keys move between the items of an open menu panel (Tab still works); Home/End jump to the ends. */
function menuKeys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const grid = event.currentTarget.dataset.columns ? Number(event.currentTarget.dataset.columns) : 1;
  const step = event.key === 'ArrowDown' ? grid : event.key === 'ArrowUp' ? -grid : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (grid === 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, at + step));
  items[next]?.focus();
}

/** One radio entry of a dropdown menu; `preview` renders the label in the style it applies. */
function MenuItem({ checked, onPick, children, shortcut, style, kind }: { checked: boolean; onPick: () => void; children: ReactNode; shortcut?: string; style?: CSSProperties; kind?: string }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className="cb-menu__item cb-doc-menu__item" data-kind={kind} onClick={onPick}>
      <span className="cb-doc-menu__label" style={style}>
        {children}
      </span>
      {shortcut && <kbd className="cb-doc-menu__kbd">{shortcutLabel(shortcut)}</kbd>}
      <Icon name="check" size={15} className="cb-doc-menu__check" />
    </button>
  );
}

/** Dropdown trigger face: current value as text plus a chevron. */
const MenuFace = ({ text, style, wide }: { text: string; style?: CSSProperties; wide?: boolean }) => (
  <>
    <span className="cb-doc-menu__value" data-wide={wide || undefined} style={style}>
      {text}
    </span>
    <Icon name="chevronDown" size={13} className="cb-doc-menu__chevron" />
  </>
);

function applyBlock(run: ToolsProps['run'], value: Block) {
  if (value === 'p') run().setParagraph().run();
  else if (value === 'code') run().setCodeBlock().run();
  else run().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
}

function StyleMenu({ s, run, disabled }: ToolsProps) {
  const label = BLOCKS.find((b) => b.value === s.block)?.label ?? 'Absatz';
  return (
    <Popover label="Absatzformat" icon="heading" layer placement="bottom-start" disabled={disabled} triggerClassName="cb-tool cb-doc-menu" face={<MenuFace text={label} wide />} panelClassName="cb-doc-pop">
      {(close) => (
        <div className="cb-menu" role="menu" aria-label="Absatzformat" onKeyDown={menuKeys}>
          {BLOCKS.map((b) => (
            <MenuItem key={b.value} kind={`block-${b.value}`} checked={s.block === b.value} shortcut={b.shortcut} onPick={() => (close(false), applyBlock(run, b.value))}>
              {b.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

function FontMenu({ s, run, disabled }: ToolsProps) {
  const current = FONT_FAMILIES.find((f) => f.value === s.font);
  return (
    <Popover label="Schriftart" icon="typeface" layer placement="bottom-start" disabled={disabled} triggerClassName="cb-tool cb-doc-menu" face={<MenuFace text={current?.label ?? 'Standard'} style={current ? { fontFamily: current.stack } : undefined} />} panelClassName="cb-doc-pop">
      {(close) => (
        <div className="cb-menu" role="menu" aria-label="Schriftart" onKeyDown={menuKeys}>
          <MenuItem checked={!s.font} onPick={() => (close(false), run().unsetFontFamily().run())}>
            Standard
          </MenuItem>
          {FONT_FAMILIES.map((f) => (
            <MenuItem key={f.value} checked={s.font === f.value} style={{ fontFamily: f.stack }} onPick={() => (close(false), run().setFontFamily(f.value).run())}>
              {f.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** − size + : steps through the curated sizes; the middle opens the full list. */
function SizeStepper({ s, run, disabled, inline }: ToolsProps & { inline?: boolean }) {
  const step = (dir: 1 | -1) => run().setFontSize(String(steppedFontSize(s.size, dir))).run();
  return (
    <div className="cb-doc-size" role="group" aria-label="Schriftgröße">
      <ToolButton icon="minus" label="Schrift verkleinern" disabled={disabled || s.size <= FONT_SIZE_MIN} onClick={() => step(-1)} />
      {inline ? (
        <output className="cb-doc-size__value" aria-label="Aktuelle Schriftgröße">
          {s.size}
        </output>
      ) : (
        <Popover label={`Schriftgröße ${s.size}`} icon="typeface" layer placement="bottom-start" disabled={disabled} triggerClassName="cb-tool cb-doc-size__value" face={<span>{s.size}</span>} panelClassName="cb-doc-pop">
          {(close) => (
            <div className="cb-menu cb-doc-menu--sizes" role="menu" aria-label="Schriftgröße" onKeyDown={menuKeys}>
              {FONT_SIZES.map((size) => (
                <MenuItem key={size} checked={s.size === size} onPick={() => (close(false), run().setFontSize(String(size)).run())}>
                  {size}
                </MenuItem>
              ))}
              <MenuItem checked={false} onPick={() => (close(false), run().unsetFontSize().run())}>
                Standard
              </MenuItem>
            </div>
          )}
        </Popover>
      )}
      <ToolButton icon="plus" label="Schrift vergrößern" disabled={disabled || s.size >= FONT_SIZE_MAX} onClick={() => step(1)} />
    </div>
  );
}

/** Swatch grids for text colour and/or highlighter; buttons never steal the editor's focus. */
function ColorOptions({ s, run, close, text = true, marker = true }: ToolsProps & { close?: (returnFocus?: boolean) => void; text?: boolean; marker?: boolean }) {
  const pick = (apply: () => void) => () => {
    close?.(false);
    apply();
  };
  return (
    <div className="cb-doc-colors">
      {text && (
        <div className="cb-doc-colors__set">
          <p className="cb-doc-colors__title">Textfarbe</p>
          <div className="cb-swatches__grid" role="group" aria-label="Textfarbe" data-columns="7" onKeyDown={menuKeys}>
            <button type="button" className="cb-swatch" data-default aria-label="Standardfarbe" aria-pressed={!s.color} onMouseDown={(e) => e.preventDefault()} onClick={pick(() => run().unsetColor().run())} />
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="cb-swatch"
                style={{ background: c.value }}
                aria-label={`Textfarbe ${c.label}`}
                title={c.label}
                aria-pressed={s.color === c.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={pick(() => run().setColor(c.value).run())}
              />
            ))}
          </div>
        </div>
      )}
      {marker && (
        <div className="cb-doc-colors__set">
          <p className="cb-doc-colors__title">Textmarker</p>
          <div className="cb-swatches__grid" role="group" aria-label="Textmarker" data-columns="7" onKeyDown={menuKeys}>
            <button type="button" className="cb-swatch" data-none aria-label="Kein Textmarker" aria-pressed={!s.highlight} onMouseDown={(e) => e.preventDefault()} onClick={pick(() => run().unsetHighlight().run())} />
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="cb-swatch cb-swatch--marker"
                data-marker={c.value}
                aria-label={`Textmarker ${c.label}`}
                title={c.label}
                aria-pressed={s.highlight === c.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={pick(() => run().setHighlight(c.value).run())}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorMenu(props: ToolsProps & { marker?: boolean }) {
  const { s, disabled, marker = false } = props;
  return (
    <Popover
      label={marker ? 'Textfarbe und Textmarker' : 'Textfarbe'}
      icon="palette"
      layer
      placement="bottom-start"
      disabled={disabled}
      active={!!s.color || (marker && !!s.highlight)}
      triggerClassName="cb-tool cb-doc-ink"
      face={
        <>
          <span className="cb-doc-ink__glyph" style={{ '--ink': s.color ?? 'currentColor' } as CSSProperties}>
            A
          </span>
          <Icon name="chevronDown" size={12} className="cb-doc-menu__chevron" />
        </>
      }
      panelClassName="cb-doc-pop cb-swatches"
    >
      {(close) => <ColorOptions {...props} close={close} marker={marker} />}
    </Popover>
  );
}

function HighlightMenu(props: ToolsProps) {
  const { s, disabled } = props;
  return (
    <Popover
      label="Textmarker"
      icon="highlighter"
      layer
      placement="bottom-start"
      disabled={disabled}
      active={!!s.highlight}
      triggerClassName="cb-tool cb-doc-ink"
      face={
        <>
          <span className="cb-doc-ink__marker" data-marker={s.highlight ?? 'yellow'}>
            <Icon name="highlighter" size={17} />
          </span>
          <Icon name="chevronDown" size={12} className="cb-doc-menu__chevron" />
        </>
      }
      panelClassName="cb-doc-pop cb-swatches"
    >
      {(close) => <ColorOptions {...props} close={close} text={false} />}
    </Popover>
  );
}

function SpacingOptions({ s, run, close }: ToolsProps & { close?: (returnFocus?: boolean) => void }) {
  const pick = (apply: () => void) => () => {
    close?.(false);
    apply();
  };
  return (
    <div className="cb-doc-spacing" onKeyDown={menuKeys}>
      <p className="cb-doc-colors__title">Zeilenabstand</p>
      <div className="cb-menu" role="menu" aria-label="Zeilenabstand">
        <MenuItem checked={!s.lineHeight} onPick={pick(() => run().setBlockLineHeight(null).run())}>
          Standard
        </MenuItem>
        {LINE_HEIGHTS.map((l) => (
          <MenuItem key={l.value} checked={s.lineHeight === l.value} onPick={pick(() => run().setBlockLineHeight(l.value).run())}>
            {l.label}
          </MenuItem>
        ))}
      </div>
      <p className="cb-doc-colors__title">Absatzabstand</p>
      <div className="cb-menu" role="menu" aria-label="Absatzabstand">
        <MenuItem checked={!s.spacing} onPick={pick(() => run().setBlockSpacing(null).run())}>
          Standard
        </MenuItem>
        {PARAGRAPH_SPACINGS.map((p) => (
          <MenuItem key={p.value} checked={s.spacing === p.value} onPick={pick(() => run().setBlockSpacing(p.value).run())}>
            {p.label}
          </MenuItem>
        ))}
      </div>
    </div>
  );
}

const SpacingMenu = (props: ToolsProps) => (
  <Popover label="Zeilen- und Absatzabstand" icon="lineSpacing" iconSize={17} layer placement="bottom-start" disabled={props.disabled} active={!!props.s.lineHeight || !!props.s.spacing} triggerClassName="cb-tool" panelClassName="cb-doc-pop">
    {(close) => <SpacingOptions {...props} close={close} />}
  </Popover>
);

const GRID_COLS = 6;
const GRID_ROWS = 5;

/** Outside a table: a size picker. Inside one: rows, columns, header and cell operations. */
function TableOptions({ s, run, close }: ToolsProps & { close?: (returnFocus?: boolean) => void }) {
  const [hover, setHover] = useState({ rows: 3, cols: 3 });
  const act = (apply: (c: ChainedCommands) => ChainedCommands) => () => {
    close?.(false);
    apply(run()).run();
  };
  if (!s.table) {
    return (
      <div className="cb-doc-table-pick">
        <div className="cb-doc-table-pick__grid" role="group" aria-label="Tabellengröße" data-columns={GRID_COLS} onKeyDown={menuKeys} style={{ '--cols': GRID_COLS } as CSSProperties}>
          {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
            const rows = Math.floor(i / GRID_COLS) + 1;
            const cols = (i % GRID_COLS) + 1;
            return (
              <button
                key={i}
                type="button"
                className="cb-doc-table-pick__cell"
                aria-label={`Tabelle ${rows} × ${cols} einfügen`}
                data-on={(rows <= hover.rows && cols <= hover.cols) || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onPointerEnter={() => setHover({ rows, cols })}
                onFocus={() => setHover({ rows, cols })}
                onClick={act((c) => c.insertTable({ rows, cols, withHeaderRow: true }))}
              />
            );
          })}
        </div>
        <p className="cb-doc-table-pick__size" aria-hidden="true">
          {hover.rows} × {hover.cols}
        </p>
      </div>
    );
  }
  const ops: readonly { label: string; icon: 'rowInsert' | 'colInsert' | 'minus' | 'x' | 'table' | 'tableDelete' | 'columns'; apply: (c: ChainedCommands) => ChainedCommands; danger?: boolean }[] = [
    { label: 'Zeile oberhalb einfügen', icon: 'rowInsert', apply: (c) => c.addRowBefore() },
    { label: 'Zeile unterhalb einfügen', icon: 'rowInsert', apply: (c) => c.addRowAfter() },
    { label: 'Spalte links einfügen', icon: 'colInsert', apply: (c) => c.addColumnBefore() },
    { label: 'Spalte rechts einfügen', icon: 'colInsert', apply: (c) => c.addColumnAfter() },
    { label: 'Kopfzeile ein/aus', icon: 'table', apply: (c) => c.toggleHeaderRow() },
    { label: 'Zellen verbinden/teilen', icon: 'columns', apply: (c) => c.mergeOrSplit() },
    { label: 'Zeile löschen', icon: 'minus', apply: (c) => c.deleteRow(), danger: true },
    { label: 'Spalte löschen', icon: 'x', apply: (c) => c.deleteColumn(), danger: true },
    { label: 'Tabelle löschen', icon: 'tableDelete', apply: (c) => c.deleteTable(), danger: true },
  ];
  return (
    <div className="cb-menu" role="menu" aria-label="Tabelle bearbeiten" onKeyDown={menuKeys}>
      {ops.map((op) => (
        <button key={op.label} type="button" role="menuitem" className="cb-menu__item" data-danger={op.danger || undefined} onClick={act(op.apply)}>
          <Icon name={op.icon} size={16} />
          <span>{op.label}</span>
        </button>
      ))}
    </div>
  );
}

const TableMenu = (props: ToolsProps) => (
  <Popover label={props.s.table ? 'Tabelle bearbeiten' : 'Tabelle'} icon="table" iconSize={17} layer placement="bottom-start" disabled={props.disabled} active={props.s.table} triggerClassName="cb-tool" panelClassName="cb-doc-pop">
    {(close) => <TableOptions {...props} close={close} />}
  </Popover>
);

/** Phone: everything outside the priority row, flat (no nested popovers), grouped under small captions. */
function MoreSheet(props: ToolsProps & { openLink: () => void }) {
  const { s, run, disabled, openLink } = props;
  return (
    <div className="cb-doc-more__body">
      <section aria-label="Schrift">
        <p className="cb-doc-colors__title">Schrift</p>
        <div className="cb-doc-more__chips" role="group" aria-label="Schriftart">
          <button type="button" className="cb-doc-chip" aria-pressed={!s.font} onMouseDown={(e) => e.preventDefault()} onClick={() => run().unsetFontFamily().run()}>
            Standard
          </button>
          {FONT_FAMILIES.map((f) => (
            <button key={f.value} type="button" className="cb-doc-chip" style={{ fontFamily: f.stack }} aria-pressed={s.font === f.value} onMouseDown={(e) => e.preventDefault()} onClick={() => run().setFontFamily(f.value).run()}>
              {f.label}
            </button>
          ))}
        </div>
        <SizeStepper {...props} inline />
      </section>
      <section aria-label="Zeichen und Absatz">
        <div className="cb-doc-more__row">
          <ToolButton icon="strikethrough" label="Durchgestrichen" shortcut="⇧⌘S" pressed={s.strike} disabled={disabled} onClick={() => run().toggleStrike().run()} />
          <ToolButton icon="listOrdered" label="Nummerierung" shortcut="⇧⌘7" pressed={s.ordered} disabled={disabled} onClick={() => run().toggleOrderedList().run()} />
          <ToolButton icon="listChecks" label="Aufgabenliste" shortcut="⇧⌘9" pressed={s.task} disabled={disabled} onClick={() => run().toggleTaskList().run()} />
          <ToolButton icon="quote" label="Zitat" shortcut="⇧⌘B" pressed={s.quote} disabled={disabled} onClick={() => run().toggleBlockquote().run()} />
          <ToolButton icon="link" label="Link" shortcut="⌘K" pressed={s.link} disabled={disabled} onClick={openLink} />
          <ToolButton icon="separator" label="Trennlinie einfügen" disabled={disabled} onClick={() => run().setHorizontalRule().run()} />
        </div>
        <div className="cb-doc-more__row">
          {ALIGNS.map((a) => (
            <ToolButton key={a.value} icon={a.icon} label={a.label} shortcut={a.shortcut} pressed={s.align === a.value} disabled={disabled} onClick={() => run().setTextAlign(a.value).run()} />
          ))}
          <ToolButton icon="outdent" label="Einzug verkleinern" shortcut="⌘[" disabled={disabled || !s.canOutdent} onClick={() => run().outdent().run()} />
          <ToolButton icon="indent" label="Einzug vergrößern" shortcut="⌘]" disabled={disabled || !s.canIndent} onClick={() => run().indent().run()} />
          <ToolButton icon="clearFormat" label="Formatierung entfernen" shortcut="⌘\" disabled={disabled} onClick={() => run().clearFormatting().run()} />
        </div>
      </section>
      <ColorOptions {...props} text={false} />
      <SpacingOptions {...props} />
      <section aria-label="Tabelle">
        <p className="cb-doc-colors__title">{s.table ? 'Tabelle bearbeiten' : 'Tabelle einfügen'}</p>
        <TableOptions {...props} />
      </section>
    </div>
  );
}

/** Rich Text toolbar of the writing studio: grouped, every control keyboard reachable, states always truthful. */
export function DocumentToolbar({ handle, disabled }: { handle: DocumentHandle; disabled: boolean }) {
  const { editor } = handle;
  const s = useEditorState({ editor, selector: selectState });
  const phone = useMediaQuery(PHONE_QUERY);
  // focus the page synchronously (Tiptap's focus command waits a frame): typing right after a menu pick lands in the text
  const run = () => {
    if (!editor.view.hasFocus()) editor.view.focus();
    return editor.chain().focus();
  };
  const t: ToolsProps = { editor, s, run, disabled };

  const emphasis = (
    <>
      <ToolButton icon="bold" label="Fett" shortcut="⌘B" pressed={s.bold} disabled={disabled} onClick={() => run().toggleBold().run()} />
      <ToolButton icon="italic" label="Kursiv" shortcut="⌘I" pressed={s.italic} disabled={disabled} onClick={() => run().toggleItalic().run()} />
      <ToolButton icon="underline" label="Unterstrichen" shortcut="⌘U" pressed={s.underline} disabled={disabled} onClick={() => run().toggleUnderline().run()} />
    </>
  );
  const bar = (children: ReactNode, layout: 'phone' | 'studio') => (
    <div className="cb-canvas-bar__set cb-doc-tools" data-layout={layout} role="toolbar" aria-label="Textformatierung" aria-disabled={disabled || undefined} data-disabled={disabled || undefined}>
      {children}
    </div>
  );

  if (phone) {
    return bar(
      <>
        <StyleMenu {...t} />
        {emphasis}
        <ColorMenu {...t} marker />
        <ToolButton icon="list" label="Aufzählung" shortcut="⇧⌘8" pressed={s.bullet} disabled={disabled} onClick={() => run().toggleBulletList().run()} />
        <Popover label="Weitere Formatierung" icon="more" iconSize={18} layer placement="bottom-end" disabled={disabled} triggerClassName="cb-tool" panelClassName="cb-doc-pop cb-doc-more">
          {() => <MoreSheet {...t} openLink={handle.openLink} />}
        </Popover>
      </>,
      'phone',
    );
  }

  return bar(
    <>
      <div className="cb-doc-tools__row">
        <ToolGroup label="Absatzformat und Schrift">
          <StyleMenu {...t} />
          <FontMenu {...t} />
          <SizeStepper {...t} />
        </ToolGroup>
        <ToolSeparator />
        <ToolGroup label="Zeichen">
          {emphasis}
          <ToolButton icon="strikethrough" label="Durchgestrichen" shortcut="⇧⌘S" pressed={s.strike} disabled={disabled} onClick={() => run().toggleStrike().run()} />
        </ToolGroup>
        <ToolSeparator />
        <ToolGroup label="Farbe">
          <ColorMenu {...t} />
          <HighlightMenu {...t} />
        </ToolGroup>
        <ToolSeparator />
        <ToolGroup label="Einfügen">
          <ToolButton icon="link" label="Link" shortcut="⌘K" pressed={s.link} disabled={disabled} onClick={handle.openLink} />
          <TableMenu {...t} />
          <ToolButton icon="separator" label="Trennlinie einfügen" disabled={disabled} onClick={() => run().setHorizontalRule().run()} />
        </ToolGroup>
      </div>
      <div className="cb-doc-tools__row">
        <ToolGroup label="Listen und Zitat">
          <ToolButton icon="list" label="Aufzählung" shortcut="⇧⌘8" pressed={s.bullet} disabled={disabled} onClick={() => run().toggleBulletList().run()} />
          <ToolButton icon="listOrdered" label="Nummerierung" shortcut="⇧⌘7" pressed={s.ordered} disabled={disabled} onClick={() => run().toggleOrderedList().run()} />
          <ToolButton icon="listChecks" label="Aufgabenliste" shortcut="⇧⌘9" pressed={s.task} disabled={disabled} onClick={() => run().toggleTaskList().run()} />
          <ToolButton icon="quote" label="Zitat" shortcut="⇧⌘B" pressed={s.quote} disabled={disabled} onClick={() => run().toggleBlockquote().run()} />
        </ToolGroup>
        <ToolSeparator />
        <ToolGroup label="Ausrichtung">
          {ALIGNS.map((a) => (
            <ToolButton key={a.value} icon={a.icon} label={a.label} shortcut={a.shortcut} pressed={s.align === a.value} disabled={disabled} onClick={() => run().setTextAlign(a.value).run()} />
          ))}
        </ToolGroup>
        <ToolSeparator />
        <ToolGroup label="Absatz">
          <SpacingMenu {...t} />
          <ToolButton icon="outdent" label="Einzug verkleinern" shortcut="⌘[" disabled={disabled || !s.canOutdent} onClick={() => run().outdent().run()} />
          <ToolButton icon="indent" label="Einzug vergrößern" shortcut="⌘]" disabled={disabled || !s.canIndent} onClick={() => run().indent().run()} />
          <ToolButton icon="clearFormat" label="Formatierung entfernen" shortcut="⌘\" disabled={disabled} onClick={() => run().clearFormatting().run()} />
        </ToolGroup>
      </div>
    </>,
    'studio',
  );
}
