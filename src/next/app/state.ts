import type { FolderId, ItemId, ItemKind, Location, Placement, SortMode, Space, SpaceId } from '../domain/types';
import { defaultPreferences, type Density, type Preferences, type ViewMode } from './preferences';

// Volatile UI state (navigation, selection, layers, preferences). Lives only in React memory.

/** Modal/global layers (IA-02 L4/L5). At most one is open at a time. */
export type Overlay = 'search' | 'settings' | 'spaces-drawer';

export type SettingsSection = 'general' | 'data' | 'security';

/** Board filter chips: everything, one content kind, or favourites. Belongs to the current location. */
export type BoardFilter = 'all' | 'favorites' | ItemKind;

/** Workspace dialogs (glass cards): one at a time, on top of the board or the folder window. */
export type WorkspaceModal =
  | { readonly kind: 'space-new' }
  | { readonly kind: 'space-edit'; readonly spaceId: SpaceId }
  | { readonly kind: 'space-delete'; readonly spaceId: SpaceId }
  | { readonly kind: 'folder-new'; readonly placement: Placement; readonly entryIds?: readonly string[] }
  | { readonly kind: 'folder-edit'; readonly folderId: FolderId }
  | { readonly kind: 'move'; readonly entryIds: readonly string[] }
  | { readonly kind: 'confirm-delete'; readonly entryIds: readonly string[] };

export interface UiState {
  readonly location: Location;
  /** Last visited space: target of captures made while a global collection is open. */
  readonly lastSpaceId: SpaceId | null;
  readonly filter: BoardFilter;
  /** Filter chips are collapsed by default; a space preference or the header toggle shows them. */
  readonly filtersVisible: boolean;
  /** Effective presentation of the current location: the space's own defaults, else the global preferences. */
  readonly view: ViewMode;
  readonly density: Density;
  readonly sort: SortMode;
  /** Item shown in the Inspector (detail context, D-004). */
  readonly inspectedItemId: ItemId | null;
  /** Item open in the Hybrid Composer; the Composer replaces the Inspector on the right (IA-02 §3.2). */
  readonly composerItemId: ItemId | null;
  /** Folder open in the folder window; captures land there while it is open. */
  readonly openFolderId: FolderId | null;
  /** Selected entries (item and folder ids) of the visible level; cleared on navigation. */
  readonly selectedIds: readonly string[];
  /** Anchor of the last plain/⌘ selection for Shift-ranges. */
  readonly selectionAnchor: string | null;
  readonly overlay: Overlay | null;
  readonly modal: WorkspaceModal | null;
  readonly settingsSection: SettingsSection;
  /** Floating Recorder shell (D-008) visible. Independent of space, inspector and overlays. */
  readonly recorderOpen: boolean;
  /** Global preferences (persisted). View, density and sort act as defaults for spaces without their own. */
  readonly prefs: Preferences;
}

export type UiAction =
  | { type: 'navigate'; location: Location; space?: Space }
  | { type: 'setFilter'; filter: BoardFilter }
  | { type: 'setFiltersVisible'; visible: boolean }
  | { type: 'setSort'; sort: SortMode }
  | { type: 'inspect'; itemId: ItemId }
  | { type: 'closeInspector' }
  | { type: 'openComposer'; itemId: ItemId }
  | { type: 'closeComposer' }
  | { type: 'openFolder'; folderId: FolderId | null }
  | { type: 'setSelection'; ids: readonly string[]; anchor?: string | null }
  | { type: 'toggleSelection'; id: string }
  | { type: 'clearSelection' }
  | { type: 'openOverlay'; overlay: Overlay }
  | { type: 'openSettings'; section?: SettingsSection }
  | { type: 'setSettingsSection'; section: SettingsSection }
  | { type: 'closeOverlay' }
  | { type: 'openModal'; modal: WorkspaceModal }
  | { type: 'closeModal' }
  | { type: 'setRecorderOpen'; open: boolean }
  | { type: 'setPreference'; patch: Partial<Preferences> };

/** View defaults of a space, applied when it is opened; global preferences fill what the space leaves open. */
const spaceDefaults = (space: Space | undefined, prefs: Preferences): Pick<UiState, 'filtersVisible' | 'view' | 'density' | 'sort'> => ({
  filtersVisible: space?.prefs?.filtersVisible ?? false,
  view: space?.prefs?.view ?? prefs.view,
  density: space?.prefs?.density ?? prefs.density,
  sort: space?.prefs?.sort ?? prefs.sort,
});

export const createInitialState = (location: Location, prefs: Preferences = defaultPreferences, space?: Space): UiState => ({
  location,
  lastSpaceId: location.type === 'space' ? location.spaceId : null,
  filter: 'all',
  ...spaceDefaults(space, prefs),
  inspectedItemId: null,
  composerItemId: null,
  openFolderId: null,
  selectedIds: [],
  selectionAnchor: null,
  overlay: null,
  modal: null,
  settingsSection: 'general',
  recorderOpen: false,
  prefs,
});

const sameLocation = (a: Location, b: Location): boolean =>
  a.type === 'space' ? b.type === 'space' && a.spaceId === b.spaceId : b.type === 'collection' && a.collectionId === b.collectionId;

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'navigate':
      // Navigation owns the collection; detail context, folder and selection belong to the old one and close. Recorder keeps running (D-008).
      if (sameLocation(state.location, action.location)) return state.overlay === 'spaces-drawer' ? { ...state, overlay: null } : state;
      return {
        ...state,
        location: action.location,
        lastSpaceId: action.location.type === 'space' ? action.location.spaceId : state.lastSpaceId,
        filter: 'all',
        ...spaceDefaults(action.space, state.prefs),
        inspectedItemId: null,
        composerItemId: null,
        openFolderId: null,
        selectedIds: [],
        selectionAnchor: null,
        overlay: null,
        modal: null,
      };
    case 'setFilter':
      return { ...state, filter: action.filter };
    case 'setFiltersVisible':
      return { ...state, filtersVisible: action.visible };
    case 'setSort':
      return { ...state, sort: action.sort };
    case 'inspect':
      return { ...state, inspectedItemId: action.itemId, composerItemId: null };
    case 'closeInspector':
      return { ...state, inspectedItemId: null };
    case 'openComposer':
      return { ...state, composerItemId: action.itemId, inspectedItemId: action.itemId };
    case 'closeComposer':
      // Back to the inspector of the same item (M-06 reverse).
      return { ...state, composerItemId: null };
    case 'openFolder':
      if (action.folderId === state.openFolderId) return state;
      return { ...state, openFolderId: action.folderId, selectedIds: [], selectionAnchor: null, inspectedItemId: null, composerItemId: null };
    case 'setSelection':
      return { ...state, selectedIds: action.ids, selectionAnchor: action.anchor === undefined ? (action.ids.at(-1) ?? null) : action.anchor };
    case 'toggleSelection': {
      const has = state.selectedIds.includes(action.id);
      return {
        ...state,
        selectedIds: has ? state.selectedIds.filter((id) => id !== action.id) : [...state.selectedIds, action.id],
        selectionAnchor: action.id,
      };
    }
    case 'clearSelection':
      return state.selectedIds.length ? { ...state, selectedIds: [], selectionAnchor: null } : state;
    case 'openOverlay':
      return { ...state, overlay: action.overlay };
    case 'openSettings':
      return { ...state, overlay: 'settings', settingsSection: action.section ?? state.settingsSection };
    case 'setSettingsSection':
      return { ...state, settingsSection: action.section };
    case 'closeOverlay':
      return { ...state, overlay: null };
    case 'openModal':
      return { ...state, modal: action.modal, overlay: null };
    case 'closeModal':
      return { ...state, modal: null };
    case 'setRecorderOpen':
      return { ...state, recorderOpen: action.open };
    case 'setPreference': {
      // An explicit choice applies to the current board at once and becomes the default for spaces without their own.
      const { view, density, sort } = action.patch;
      return {
        ...state,
        prefs: { ...state.prefs, ...action.patch },
        ...(view ? { view } : {}),
        ...(density ? { density } : {}),
        ...(sort ? { sort } : {}),
      };
    }
  }
}
