import type { Item } from './types';

// Local, synchronous search over the read-only library (D-021). No index, no network.

export interface SearchHit {
  readonly item: Item;
  readonly score: number;
}

export const normalize = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const tokenize = (query: string): string[] => normalize(query).split(/\s+/).filter(Boolean);

function secondaryText(item: Item): string {
  switch (item.kind) {
    case 'document':
      return item.text;
    case 'text':
    case 'markdown':
      return item.body;
    case 'code':
      return `${item.language} ${item.body}`;
    case 'link':
      return item.url;
    case 'image':
      return item.alt;
    case 'file':
      return item.fileName;
    case 'audio':
      return item.fileName ?? '';
  }
}

/** Every token must match somewhere (AND). Title prefix > title > tag > content. Ties keep library order. */
export function searchItems(items: readonly Item[], query: string, limit = 20): SearchHit[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const hits: SearchHit[] = [];
  for (const item of items) {
    const title = normalize(item.title);
    const tags = item.tags.map(normalize);
    const body = normalize(secondaryText(item));
    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const tokenScore = title.startsWith(token) || title.includes(` ${token}`)
        ? 4
        : title.includes(token)
          ? 3
          : tags.some((t) => t.includes(token))
            ? 2
            : body.includes(token)
              ? 1
              : 0;
      if (!tokenScore) {
        matchedAll = false;
        break;
      }
      score += tokenScore;
    }
    if (matchedAll) hits.push({ item, score });
  }
  // Array.prototype.sort is stable, so equal scores keep the library order.
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
