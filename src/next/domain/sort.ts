import type { Folder, Item, SortMode } from './types';
import { kindOrder } from './kinds';

export const sortModes: readonly { readonly value: SortMode; readonly label: string }[] = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'oldest', label: 'Älteste zuerst' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'kind', label: 'Nach Art' },
];

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Stable sort of items for a board or folder level. `newest` keeps the library's own (newest-first) order. */
export function sortItems(items: readonly Item[], mode: SortMode): readonly Item[] {
  switch (mode) {
    case 'newest':
      return items;
    case 'oldest':
      return [...items].reverse();
    case 'name':
      return [...items].sort((a, b) => collator.compare(a.title, b.title));
    case 'kind':
      return [...items].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || collator.compare(a.title, b.title));
  }
}

export function sortFolders(folders: readonly Folder[], mode: SortMode): readonly Folder[] {
  switch (mode) {
    case 'newest':
      return [...folders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':
      return [...folders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    default:
      return [...folders].sort((a, b) => collator.compare(a.name, b.name));
  }
}
