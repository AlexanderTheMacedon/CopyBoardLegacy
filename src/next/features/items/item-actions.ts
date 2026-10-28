import type { IconName } from '../../components/Icon';
import { canCopy } from '../../data/clipboard';
import { isIdentityEdits, normalizeImageEdits } from '../../domain/image-edits';
import { isEditable, isLocal, isStudioImage, type Item, type Location } from '../../domain/types';

// One action registry for card quick actions, context menu and Inspector (D-006: same logical palette everywhere).
// Only actions that really work for the given item are listed.

export type ItemActionId =
  | 'open'
  | 'copy'
  | 'download'
  | 'download-original'
  | 'open-link'
  | 'open-composer'
  | 'favorite'
  | 'move'
  | 'new-folder'
  | 'remove-from-folder'
  | 'duplicate'
  | 'reveal-in-space'
  | 'delete';

export interface ItemAction {
  readonly id: ItemActionId;
  readonly label: string;
  readonly icon: IconName;
  /** Destructive actions are separated and tinted in menus. */
  readonly danger?: boolean;
  /** Starts a new visual group in menus. */
  readonly group?: boolean;
}

const hasAsset = (item: Item): boolean => (item.kind === 'image' || item.kind === 'file' || item.kind === 'audio') && !!item.asset;

/** An image whose studio edits change what it looks like (download/copy then deliver the edited version). */
export const isEditedImage = (item: Item): boolean => item.kind === 'image' && !!item.edits && !isIdentityEdits(normalizeImageEdits(item.edits));

export function itemActions(item: Item, location: Location, { withOpen = false, organize = true } = {}): ItemAction[] {
  const actions: ItemAction[] = [];
  if (withOpen) actions.push({ id: 'open', label: 'Öffnen', icon: 'panelRight' });
  if (item.kind === 'link') actions.push({ id: 'open-link', label: 'Link öffnen', icon: 'arrowUpRight' });
  // Copy stays a one-click core action for copyable content; binaries get a download (D-006).
  if (canCopy(item)) actions.push({ id: 'copy', label: 'Kopieren', icon: 'copy' });
  if (hasAsset(item)) actions.push({ id: 'download', label: 'Herunterladen', icon: 'download' });
  if (hasAsset(item) && isEditedImage(item)) actions.push({ id: 'download-original', label: 'Original herunterladen', icon: 'download' });
  if (isEditable(item)) actions.push({ id: 'open-composer', label: 'Bearbeiten', icon: 'pen' });
  if (isStudioImage(item)) actions.push({ id: 'open-composer', label: 'Im Bildstudio bearbeiten', icon: 'sliders' });
  actions.push(item.favorite ? { id: 'favorite', label: 'Aus Favoriten entfernen', icon: 'star', group: true } : { id: 'favorite', label: 'Zu Favoriten', icon: 'star', group: true });
  if (organize) {
    actions.push({ id: 'move', label: 'Verschieben …', icon: 'folderInput', group: true });
    actions.push({ id: 'new-folder', label: 'In neuen Ordner', icon: 'folderPlus' });
    if (item.folderId) actions.push({ id: 'remove-from-folder', label: 'Aus Ordner herausnehmen', icon: 'arrowUp' });
    actions.push({ id: 'duplicate', label: 'Duplizieren', icon: 'copyPlus' });
  }
  if (location.type !== 'space' || location.spaceId !== item.spaceId)
    actions.push({ id: 'reveal-in-space', label: 'Im Space anzeigen', icon: 'spaces' });
  if (isLocal(item)) actions.push({ id: 'delete', label: 'Löschen', icon: 'trash', danger: true, group: true });
  return actions;
}

/** The single quick action shown on a card (hover/focus on desktop, always visible on touch). */
export const primaryQuickAction = (item: Item, location: Location): ItemAction | undefined =>
  itemActions(item, location).find((a) => a.id === 'copy' || a.id === 'download');
