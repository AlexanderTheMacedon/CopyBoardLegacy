import type { ItemId, ItemKind, Location } from '../domain/types';
import { defaultPreferences, type Preferences } from './preferences';

// Volatile UI state of the preview (navigation, selection, layers, preferences). Lives only in React memory.

/** Modal/global layers (IA-02 L4/L5). At most one is open at a time. */
export type Overlay = 'search' | 'settings' | 'spaces-drawer';

export type SettingsSection = 'general' | 'data' | 'security';

/** Board filter chips: everything, one content kind, or favourites. Belongs to the current location. */
export type BoardFilter = 'all' | 'favorites' | ItemKind;

export interface UiState {
  readonly location: Location;
  readonly filter: BoardFilter;
  /** Item shown in the Inspector (detail context, D-004). */
  readonly inspectedItemId: ItemId | null;
  /** Item open in the Hybrid Composer; the Composer replaces the Inspector on the right (IA-02 §3.2). */
  readonly composerItemId: ItemId | null;
  readonly overlay: Overlay | null;
  readonly settingsSection: SettingsSection;
  /** Floating Recorder shell (D-008) visible. Independent of space, inspector and overlays. */
  readonly recorderOpen: boolean;
  readonly prefs: Preferences;
}

export type UiAction =
  | { type: 'navigate'; location: Location }
  | { type: 'setFilter'; filter: BoardFilter }
  | { type: 'inspect'; itemId: ItemId }
  | { type: 'closeInspector' }
  | { type: 'openComposer'; itemId: ItemId }
  | { type: 'closeComposer' }
  | { type: 'openOverlay'; overlay: Overlay }
  | { type: 'openSettings'; section?: SettingsSection }
  | { type: 'setSettingsSection'; section: SettingsSection }
  | { type: 'closeOverlay' }
  | { type: 'setRecorderOpen'; open: boolean }
  | { type: 'setPreference'; patch: Partial<Preferences> };

export const createInitialState = (location: Location): UiState => ({
  location,
  filter: 'all',
  inspectedItemId: null,
  composerItemId: null,
  overlay: null,
  settingsSection: 'general',
  recorderOpen: false,
  prefs: defaultPreferences,
});

const sameLocation = (a: Location, b: Location): boolean =>
  a.type === 'space' ? b.type === 'space' && a.spaceId === b.spaceId : b.type === 'collection' && a.collectionId === b.collectionId;

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'navigate':
      // Navigation owns the collection; detail context belongs to the old collection and closes. Recorder keeps running (D-008).
      if (sameLocation(state.location, action.location)) return state.overlay === 'spaces-drawer' ? { ...state, overlay: null } : state;
      return { ...state, location: action.location, filter: 'all', inspectedItemId: null, composerItemId: null, overlay: null };
    case 'setFilter':
      return { ...state, filter: action.filter };
    case 'inspect':
      return { ...state, inspectedItemId: action.itemId, composerItemId: null };
    case 'closeInspector':
      return { ...state, inspectedItemId: null };
    case 'openComposer':
      return { ...state, composerItemId: action.itemId, inspectedItemId: action.itemId };
    case 'closeComposer':
      // Back to the inspector of the same item (M-06 reverse).
      return { ...state, composerItemId: null };
    case 'openOverlay':
      return { ...state, overlay: action.overlay };
    case 'openSettings':
      return { ...state, overlay: 'settings', settingsSection: action.section ?? state.settingsSection };
    case 'setSettingsSection':
      return { ...state, settingsSection: action.section };
    case 'closeOverlay':
      return { ...state, overlay: null };
    case 'setRecorderOpen':
      return { ...state, recorderOpen: action.open };
    case 'setPreference':
      return { ...state, prefs: { ...state.prefs, ...action.patch } };
  }
}
