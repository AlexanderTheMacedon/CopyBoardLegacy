/** Headings of a Markdown source (outside fenced code), for the context rail. */
export function markdownOutline(source: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  let fence: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (f) {
      fence = fence ? (line.trimStart().startsWith(fence) ? null : fence) : f;
      continue;
    }
    if (fence) continue;
    const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m?.[2]) out.push({ level: Math.min(3, m[1]?.length ?? 1), text: m[2] });
  }
  return out;
}
