import type { IconName } from '../../components/Icon';
import type { Folder } from '../../domain/types';

/** Folder actions share the entry operations (move, duplicate, delete) with items; only open/rename/new-subfolder are folder-specific. */
export type FolderActionId = 'open' | 'rename' | 'new-subfolder' | 'move' | 'remove-from-folder' | 'duplicate' | 'delete';

export interface FolderAction {
  readonly id: FolderActionId;
  readonly label: string;
  readonly icon: IconName;
  readonly danger?: boolean;
  readonly group?: boolean;
}

export function folderActions(folder: Folder, { withOpen = true } = {}): FolderAction[] {
  const actions: FolderAction[] = [];
  if (withOpen) actions.push({ id: 'open', label: 'Öffnen', icon: 'folderOpen' });
  actions.push({ id: 'rename', label: 'Umbenennen & Icon', icon: 'pen' });
  actions.push({ id: 'new-subfolder', label: 'Neuer Unterordner', icon: 'folderPlus' });
  actions.push({ id: 'move', label: 'Verschieben …', icon: 'folderInput', group: true });
  if (folder.parentId) actions.push({ id: 'remove-from-folder', label: 'Eine Ebene nach oben', icon: 'arrowUp' });
  actions.push({ id: 'duplicate', label: 'Duplizieren', icon: 'copyPlus' });
  actions.push({ id: 'delete', label: 'Ordner löschen', icon: 'trash', danger: true, group: true });
  return actions;
}
