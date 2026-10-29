import type { ReactNode } from 'react';
import { safeHref } from '../../domain/document';

/**
 * Safe Markdown preview: the source becomes React elements, never HTML. Raw HTML in the source is shown as literal text, links
 * must be http(s)/mailto/tel, images and other embeds are not loaded (shown as a link to their address). Supported: headings,
 * paragraphs, emphasis, inline code, links, fenced code, block quotes, nested lists, task lists, tables and rules.
 * Source and preview stay in sync because the preview is derived from the canonical Markdown string only.
 */

// --- inline ------------------------------------------------------------------------------------------------------------

const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([^*\n]+?)\*\*|(?<!\w)__([^_\n]+?)__(?!\w)|\*([^*\s][^*\n]*?)\*|(?<!\w)_([^_\s][^_\n]*?)_(?!\w)|~~([^~\n]+?)~~|(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function renderInline(text: string, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyBase}-${n++}`;
    if (m[2] !== undefined) out.push(<code key={key}>{m[2].replace(/^ (.*) $/, '$1')}</code>);
    else if (m[3] !== undefined || m[4] !== undefined) out.push(<strong key={key}>{renderInline(m[3] ?? m[4] ?? '', key)}</strong>);
    else if (m[5] !== undefined || m[6] !== undefined) out.push(<em key={key}>{renderInline(m[5] ?? m[6] ?? '', key)}</em>);
    else if (m[7] !== undefined) out.push(<del key={key}>{renderInline(m[7], key)}</del>);
    else if (m[10] !== undefined) {
      const href = safeHref(m[10]);
      const label = m[9] || m[10];
      if (m[8]) out.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{`Bild: ${label}`}</a> : `Bild: ${label}`);
      else if (href) out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{renderInline(label, key)}</a>);
      else out.push(m[0]); // unsafe target (javascript:, data:, …): plain text, no link
    } else if (m[11] !== undefined) {
      const href = safeHref(m[11]);
      out.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{m[11]}</a> : m[11]);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// --- blocks ------------------------------------------------------------------------------------------------------------

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const indentOf = (line: string) => line.length - line.trimStart().length;

const splitRow = (line: string): string[] => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'));
};

function parseList(lines: string[], start: number, key: string): { node: ReactNode; next: number } {
  const first = LIST_ITEM.exec(lines[start] ?? '');
  const base = first?.[1]?.length ?? 0;
  const ordered = /\d/.test(first?.[2] ?? '');
  const startNumber = ordered ? Number.parseInt(first?.[2] ?? '1', 10) : 1;
  const items: { text: string; children: string[] }[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = LIST_ITEM.exec(line);
    if (m && (m[1]?.length ?? 0) <= base + 1) {
      if ((m[1]?.length ?? 0) < base) break;
      if (/\d/.test(m[2] ?? '') !== ordered) break;
      items.push({ text: m[3] ?? '', children: [] });
    } else if (line.trim() && indentOf(line) > base && items.length) {
      items[items.length - 1]?.children.push(line);
    } else break;
  }
  const rendered = items.map((item, n) => {
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(item.text);
    const content = task ? (task[2] ?? '') : item.text;
    const nested = item.children.length ? renderBlocks(item.children, `${key}-${n}`) : null;
    return task ? (
      <li key={n} className="cb-md-task" data-checked={task[1] !== ' ' || undefined}>
        <span className="cb-md-task__box" aria-hidden="true" />
        <span className="cb-visually-hidden">{task[1] === ' ' ? 'Offen: ' : 'Erledigt: '}</span>
        {renderInline(content, `${key}-${n}`)}
        {nested}
      </li>
    ) : (
      <li key={n}>
        {renderInline(content, `${key}-${n}`)}
        {nested}
      </li>
    );
  });
  const node = ordered ? (
    <ol key={key} start={startNumber !== 1 ? startNumber : undefined}>
      {rendered}
    </ol>
  ) : (
    <ul key={key}>{rendered}</ul>
  );
  return { node, next: i };
}

export function renderBlocks(lines: string[], keyBase = 'b'): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  const key = () => `${keyBase}-${blocks.length}`;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={key()}>{renderInline(paragraph.join(' '), key())}</p>);
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const marker = fence[1] ?? '```';
      const code: string[] = [];
      for (i++; i < lines.length && !(lines[i] ?? '').trimStart().startsWith(marker); i++) code.push(lines[i] ?? '');
      blocks.push(
        <pre key={key()}>
          <code {...(fence[2] ? { 'data-lang': fence[2] } : {})}>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1]?.length ?? 1;
      const content = renderInline(heading[2] ?? '', key());
      const Tag = `h${level}` as 'h1';
      blocks.push(<Tag key={key()}>{content}</Tag>);
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push(<hr key={key()} />);
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      for (; i < lines.length && /^\s{0,3}>/.test(lines[i] ?? ''); i++) quote.push((lines[i] ?? '').replace(/^\s{0,3}>\s?/, ''));
      i--;
      blocks.push(<blockquote key={key()}>{renderBlocks(quote, key())}</blockquote>);
      continue;
    }
    if (LIST_ITEM.test(line)) {
      flushParagraph();
      const { node, next } = parseList(lines, i, key());
      blocks.push(node);
      i = next - 1;
      continue;
    }
    if (line.includes('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      flushParagraph();
      const head = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length && (lines[j] ?? '').includes('|') && (lines[j] ?? '').trim(); j++) rows.push(splitRow(lines[j] ?? ''));
      blocks.push(
        <div key={key()} className="cb-md-table">
          <table>
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c}>{renderInline(cell, `${key()}-h${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, c) => (
                    <td key={c}>{renderInline(row[c] ?? '', `${key()}-${r}-${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j - 1;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

/** Block elements for a Markdown string. */
export function renderMarkdown(source: string): ReactNode[] {
  return renderBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

export function MarkdownPreview({ source }: { source: string }) {
  return <div className="cb-markdown">{renderMarkdown(source)}</div>;
}
