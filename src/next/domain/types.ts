// Domain model of the preview. Pure data, no behaviour: the same shapes are later produced by a typed legacy reader/adapter.

export type SpaceId = string;
export type ItemId = string;

/** Individual space identity colour (D-018/D-031). Independent of the Lavender brand palette and of status colours. */
export type SpaceColor = 'lavender' | 'sky' | 'sage' | 'peach' | 'rose';

export interface Space {
  readonly id: SpaceId;
  readonly name: string;
  readonly color: SpaceColor;
  readonly description: string;
}

export type ItemKind = 'text' | 'markdown' | 'code' | 'link' | 'image' | 'file' | 'audio';

interface ItemBase {
  readonly id: ItemId;
  readonly spaceId: SpaceId;
  readonly title: string;
  /** ISO 8601 timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
  readonly favorite: boolean;
  /** `local` = captured by the user and stored on this device; absent = synthetic fixture. */
  readonly origin?: 'local';
}

export interface TextItem extends ItemBase {
  readonly kind: 'text' | 'markdown';
  readonly body: string;
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

export type Item = TextItem | CodeItem | LinkItem | ImageItem | FileItem | AudioItem;

/** Global quick-access views (D-018), subordinate to the spaces. */
export type CollectionId = 'all' | 'favorites' | 'recent' | 'sessions';

export interface Collection {
  readonly id: CollectionId;
  readonly name: string;
  /** `false` = the view exists in the IA but has no data source in the preview yet. */
  readonly available: boolean;
}

export type Location =
  | { readonly type: 'space'; readonly spaceId: SpaceId }
  | { readonly type: 'collection'; readonly collectionId: CollectionId };

export const isTextual = (item: Item): item is TextItem | CodeItem =>
  item.kind === 'text' || item.kind === 'markdown' || item.kind === 'code';

export const isLocal = (item: Item): boolean => item.origin === 'local';
