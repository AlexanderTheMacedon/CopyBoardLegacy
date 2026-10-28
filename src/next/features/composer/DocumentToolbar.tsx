import { useEditorState } from '@tiptap/react';
import { Popover } from '../../components/Popover';
import { TEXT_COLORS } from '../../domain/document';
import type { DocumentHandle } from './DocumentEditor';
import { ToolButton, ToolGroup, ToolSeparator } from './Toolbar';

type Block = 'p' | '1' | '2' | '3';

/** Rich Text toolbar: compact, grouped, every control keyboard reachable; table tools appear only inside a table. */
export function DocumentToolbar({ handle, disabled }: { handle: DocumentHandle; disabled: boolean }) {
  const { editor } = handle;
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 1 }) ? '1' : e.isActive('heading', { level: 2 }) ? '2' : e.isActive('heading', { level: 3 }) ? '3' : 'p') as Block,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }) || (!e.isActive({ textAlign: 'center' }) && !e.isActive({ textAlign: 'right' })),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      table: e.isActive('table'),
    }),
  });
  const run = () => editor.chain().focus();

  const setBlock = (value: Block) => {
    if (value === 'p') run().setParagraph().run();
    else run().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
  };

  return (
    <div className="cb-canvas-bar__set" role="toolbar" aria-label="Textformatierung" aria-disabled={disabled || undefined} data-disabled={disabled || undefined}>
      <label className="cb-select">
        <span className="cb-visually-hidden">Absatzformat</span>
        <select value={s.block} disabled={disabled} onChange={(event) => setBlock(event.target.value as Block)}>
          <option value="p">Absatz</option>
          <option value="1">Titel</option>
          <option value="2">Überschrift</option>
          <option value="3">Zwischenüberschrift</option>
        </select>
      </label>
      <ToolSeparator />
      <ToolGroup label="Zeichen">
        <ToolButton icon="bold" label="Fett" shortcut="⌘B" pressed={s.bold} disabled={disabled} onClick={() => run().toggleBold().run()} />
        <ToolButton icon="italic" label="Kursiv" shortcut="⌘I" pressed={s.italic} disabled={disabled} onClick={() => run().toggleItalic().run()} />
        <ToolButton icon="underline" label="Unterstrichen" shortcut="⌘U" pressed={s.underline} disabled={disabled} onClick={() => run().toggleUnderline().run()} />
        <ToolButton icon="strikethrough" label="Durchgestrichen" shortcut="⇧⌘X" pressed={s.strike} disabled={disabled} onClick={() => run().toggleStrike().run()} />
        <Popover label="Textfarbe" icon="palette" iconSize={17} layer placement="bottom-end" triggerClassName="cb-tool" active={!!s.color} panelClassName="cb-swatches">
          {(close) => (
            <div className="cb-swatches__grid" role="group" aria-label="Textfarbe">
              <button type="button" className="cb-swatch" data-default aria-label="Standardfarbe" aria-pressed={!s.color} onClick={() => (run().unsetColor().run(), close())} />
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="cb-swatch"
                  style={{ background: c.value }}
                  aria-label={c.label}
                  aria-pressed={s.color === c.value}
                  onClick={() => (run().setColor(c.value).run(), close())}
                />
              ))}
            </div>
          )}
        </Popover>
      </ToolGroup>
      <ToolSeparator />
      <ToolGroup label="Listen und Blöcke">
        <ToolButton icon="list" label="Aufzählung" shortcut="⇧⌘8" pressed={s.bullet} disabled={disabled} onClick={() => run().toggleBulletList().run()} />
        <ToolButton icon="listOrdered" label="Nummerierung" shortcut="⇧⌘7" pressed={s.ordered} disabled={disabled} onClick={() => run().toggleOrderedList().run()} />
        <ToolButton icon="listChecks" label="Aufgabenliste" shortcut="⇧⌘9" pressed={s.task} disabled={disabled} onClick={() => run().toggleTaskList().run()} />
        <ToolButton icon="quote" label="Zitat" shortcut="⇧⌘B" pressed={s.quote} disabled={disabled} onClick={() => run().toggleBlockquote().run()} />
        <ToolButton icon="link" label="Link" shortcut="⌘K" pressed={s.link} disabled={disabled} onClick={handle.openLink} />
      </ToolGroup>
      <ToolSeparator />
      <ToolGroup label="Ausrichtung">
        <ToolButton icon="alignLeft" label="Linksbündig" shortcut="⇧⌘L" pressed={s.left} disabled={disabled} onClick={() => run().setTextAlign('left').run()} />
        <ToolButton icon="alignCenter" label="Zentriert" shortcut="⇧⌘E" pressed={s.center} disabled={disabled} onClick={() => run().setTextAlign('center').run()} />
        <ToolButton icon="alignRight" label="Rechtsbündig" shortcut="⇧⌘R" pressed={s.right} disabled={disabled} onClick={() => run().setTextAlign('right').run()} />
      </ToolGroup>
      <ToolSeparator />
      <ToolGroup label="Tabelle">
        <ToolButton icon="table" label="Tabelle einfügen" disabled={disabled || s.table} onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        {s.table && !disabled && (
          <>
            <ToolButton icon="rowInsert" label="Zeile darunter einfügen" onClick={() => run().addRowAfter().run()} />
            <ToolButton icon="colInsert" label="Spalte rechts einfügen" onClick={() => run().addColumnAfter().run()} />
            <ToolButton icon="minus" label="Zeile löschen" onClick={() => run().deleteRow().run()} />
            <ToolButton icon="x" label="Spalte löschen" onClick={() => run().deleteColumn().run()} />
            <ToolButton icon="tableDelete" label="Tabelle löschen" onClick={() => run().deleteTable().run()} />
          </>
        )}
      </ToolGroup>
    </div>
  );
}
