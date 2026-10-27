import type { ItemKind } from './types';

/** Canonical order of content kinds for filters, sorting and the file view. */
export const kindOrder: readonly ItemKind[] = ['text', 'markdown', 'code', 'link', 'image', 'file', 'audio'];
