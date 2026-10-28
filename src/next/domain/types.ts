// Domain model of the app. Pure data, no behaviour: the same shapes are produced by the local store and the fixtures.

import type { ImageEdits } from './image-edits';

export type SpaceId = string;
export type ItemId = string;
export type FolderId = string;

/** Individual space identity colour (D-018/D-031). Independent of the brand palette and of status colours. */
export type SpaceColor = 'lavender' | 'sky' | 'sage' | 'peach' | 'rose' | 'amber' | 'mint' | 'slate' | 'coral' | 'plum';

export const spaceColors: readonly SpaceColor[] = ['peach', 'amber', 'coral', 'rose', 'plum', 'lavender', 'sky', 'mint', 'sage', 'slate'];

/**
 * Icon of a space or folder: `lucide:<name>` for one of the in-house line icons (components/Icon.tsx), `emoji:<char>` for an
 * emoji. An unknown or missing icon falls back to the initial of the name.
 */
export type SpaceIcon = `lucide:${string}` | `emoji:${string}`;

export type SortMode = 'newest' | 'oldest' | 'name' | 'kind';

/** Per-space presentation defaults; the board applies them when the space is opened. */
export interface SpacePrefs {
  readonly view?: 'grid' | 'list' | 'files';
  readonly density?: 'comfort' | 'standard' | 'compact';
  readonly sort?: SortMode;
  readonly filtersVisible?: boolean;
}

export interface Space {
  readonly id: SpaceId;
  readonly name: string;
  readonly color: SpaceColor;
  readonly description: string;
  readonly icon?: SpaceIcon;
  /** Display order among the spaces (ascending). Fixtures without an order keep their fixture position. */
  readonly order?: number;
  readonly prefs?: SpacePrefs;
  /** `local` = created by the user on this device; absent = synthetic fixture (possibly with stored overrides). */
  readonly origin?: 'local';
}

/** Virtual folder inside a space. Always user data (there are no fixture folders). */
export interface Folder {
  readonly id: FolderId;
  readonly spaceId: SpaceId;
  readonly parentId: FolderId | null;
  readonly name: string;
  readonly icon?: SpaceIcon;
  readonly color?: SpaceColor;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ItemKind = 'document' | 'text' | 'markdown' | 'code' | 'link' | 'image' | 'file' | 'audio';

interface ItemBase {
  readonly id: ItemId;
  readonly spaceId: SpaceId;
  /** Folder inside the space; `null`/absent = board level. */
  readonly folderId?: FolderId | null;
  readonly title: string;
  /** ISO 8601 timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
  readonly favorite: boolean;
  /** `local` = captured by the user and stored on this device; absent = synthetic fixture. */
  readonly origin?: 'local';
  /** Set on a local copy made from an example item, so its provenance stays visible. */
  readonly derivedFrom?: ItemId;
}

export interface TextItem extends ItemBase {
  readonly kind: 'text' | 'markdown';
  readonly body: string;
}

/** One node of the stored document tree (ProseMirror JSON subset). Plain, structured-cloneable data; see domain/document.ts. */
export interface DocNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean | null | readonly (number | null)[]>>;
  readonly content?: readonly DocNode[];
  readonly marks?: readonly { readonly type: string; readonly attrs?: Readonly<Record<string, string>> }[];
  readonly text?: string;
}

/** Versioned, validated document content. `schema` is bumped only together with a migration in domain/document.ts. */
export interface DocumentContent {
  readonly schema: 1;
  readonly doc: DocNode;
}

/** Visual Rich Text document ("Dokument"): structured JSON is the source of truth, `text` its derived plain text for search and previews. */
export interface DocumentItem extends ItemBase {
  readonly kind: 'document';
  readonly content: DocumentContent;
  readonly text: string;
}

export interface CodeItem extends ItemBase {
  readonly kind: 'code';
  readonly language: string;
  readonly body: string;
}

export interface LinkItem extends ItemBase {
  readonly kind: 'link';
  readonly url: string;
}

/** Binary content captured on this device (paste, drop, file picker). Never fetched from anywhere. */
export interface ItemAsset {
  readonly blob: Blob;
  readonly mimeType: string;
}

/** Captured images carry their real pixels as `asset`; synthetic fixtures render `palette` as a gradient. */
export interface ImageItem extends ItemBase {
  readonly kind: 'image';
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly palette?: readonly [string, string, string];
  readonly asset?: ItemAsset;
  /** Non-destructive image studio edits (domain/image-edits.ts). `asset` stays the untouched original; absent = unedited. */
  readonly edits?: ImageEdits;
}

export interface FileItem extends ItemBase {
  readonly kind: 'file';
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly asset?: ItemAsset;
}

export interface AudioItem extends ItemBase {
  readonly kind: 'audio';
  readonly durationSec: number;
  /** Normalised bar heights 0..1 for a static waveform preview. */
  readonly waveform: readonly number[];
  readonly fileName?: string;
  readonly asset?: ItemAsset;
}

export type Item = DocumentItem | TextItem | CodeItem | LinkItem | ImageItem | FileItem | AudioItem;

/** Global quick-access views (D-018), subordinate to the spaces. */
export type CollectionId = 'all' | 'favorites' | 'recent' | 'sessions';

export interface Collection {
  readonly id: CollectionId;
  readonly name: string;
  /** `false` = the view exists in the IA but has no data source yet. */
  readonly available: boolean;
}

export type Location =
  | { readonly type: 'space'; readonly spaceId: SpaceId }
  | { readonly type: 'collection'; readonly collectionId: CollectionId };

/** Where content lives: a space's board level (`folderId: null`) or one of its folders. */
export interface Placement {
  readonly spaceId: SpaceId;
  readonly folderId: FolderId | null;
}

export const isTextual = (item: Item): item is TextItem | CodeItem =>
  item.kind === 'text' || item.kind === 'markdown' || item.kind === 'code';

/** Items the Canvas can edit as text: body-bearing kinds and documents. Images open in the image studio (`isStudioImage`). */
export const isEditable = (item: Item): item is TextItem | CodeItem | DocumentItem => isTextual(item) || item.kind === 'document';

/** Images the Canvas opens in the image studio. */
export const isStudioImage = (item: Item): item is ImageItem => item.kind === 'image';

export const isLocal = (item: Item): boolean => item.origin === 'local';

export const isLocalSpace = (space: Space): boolean => space.origin === 'local';

/** Ids of items and folders share one selection; folders are told apart by their prefix. */
export const FOLDER_PREFIX = 'fd-';
export const isFolderId = (id: string): boolean => id.startsWith(FOLDER_PREFIX);
