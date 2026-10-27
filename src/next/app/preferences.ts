import type { IconName } from '../components/Icon';
import type { SortMode } from '../domain/types';

// One preference model for Quick Preferences, the board header and the Settings Studio (D-033). Explicit choices persist
// in the local store; a space can override view, density and sort with its own defaults.

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfort' | 'standard' | 'compact';
/** `grid` = card grid, `list` = card rows, `files` = Finder-style file list. */
export type ViewMode = 'grid' | 'list' | 'files';
/** Background: curated national-park photography, the former orange line photo, or a calm gradient without a photo. */
export type SceneMode = 'nature' | 'ambient' | 'gradient';
export type SceneSlideshow = 'on' | 'off';
export type SceneBlur = 'clear' | 'soft' | 'deep';
/** `system` follows the OS setting; `reduced` collapses motion in the app regardless of it. */
export type MotionMode = 'system' | 'reduced';

export interface Preferences {
  readonly theme: ThemeMode;
  readonly density: Density;
  readonly view: ViewMode;
  readonly sort: SortMode;
  readonly scene: SceneMode;
  readonly slideshow: SceneSlideshow;
  readonly sceneBlur: SceneBlur;
  readonly motion: MotionMode;
}

/** Light is the primary design state: first start is always light, never derived from the OS theme. */
export const defaultPreferences: Preferences = {
  theme: 'light',
  density: 'standard',
  view: 'grid',
  sort: 'newest',
  scene: 'nature',
  slideshow: 'on',
  sceneBlur: 'soft',
  motion: 'system',
};

export interface PreferenceOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly icon?: IconName;
}

export interface PreferenceDefinition<K extends keyof Preferences> {
  readonly key: K;
  readonly label: string;
  readonly options: readonly PreferenceOption<Preferences[K]>[];
}

export const themePreference: PreferenceDefinition<'theme'> = {
  key: 'theme',
  label: 'Erscheinungsbild',
  options: [
    { value: 'light', label: 'Hell', icon: 'sun' },
    { value: 'dark', label: 'Dunkel', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ],
};

export const densityPreference: PreferenceDefinition<'density'> = {
  key: 'density',
  label: 'Dichte',
  options: [
    { value: 'comfort', label: 'Komfort' },
    { value: 'standard', label: 'Standard' },
    { value: 'compact', label: 'Kompakt' },
  ],
};

export const viewPreference: PreferenceDefinition<'view'> = {
  key: 'view',
  label: 'Ansicht',
  options: [
    { value: 'grid', label: 'Raster', icon: 'grid' },
    { value: 'list', label: 'Liste', icon: 'list' },
    { value: 'files', label: 'Dateien', icon: 'table' },
  ],
};

export const sortPreference: PreferenceDefinition<'sort'> = {
  key: 'sort',
  label: 'Sortierung',
  options: [
    { value: 'newest', label: 'Neueste zuerst' },
    { value: 'oldest', label: 'Älteste zuerst' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'kind', label: 'Nach Art' },
  ],
};

export const scenePreference: PreferenceDefinition<'scene'> = {
  key: 'scene',
  label: 'Hintergrund',
  options: [
    { value: 'nature', label: 'Natur', icon: 'mountain' },
    { value: 'ambient', label: 'Lichtlinien', icon: 'sparkles' },
    { value: 'gradient', label: 'Verlauf', icon: 'droplet' },
  ],
};

export const slideshowPreference: PreferenceDefinition<'slideshow'> = {
  key: 'slideshow',
  label: 'Bildwechsel',
  options: [
    { value: 'on', label: 'Wechselnd' },
    { value: 'off', label: 'Fest' },
  ],
};

export const sceneBlurPreference: PreferenceDefinition<'sceneBlur'> = {
  key: 'sceneBlur',
  label: 'Unschärfe',
  options: [
    { value: 'clear', label: 'Klar' },
    { value: 'soft', label: 'Weich' },
    { value: 'deep', label: 'Tief' },
  ],
};

export const motionPreference: PreferenceDefinition<'motion'> = {
  key: 'motion',
  label: 'Bewegung',
  options: [
    { value: 'system', label: 'Wie System' },
    { value: 'reduced', label: 'Reduziert' },
  ],
};

const pick = <V extends string>(value: unknown, options: readonly PreferenceOption<V>[]): V | undefined =>
  options.find((o) => o.value === value)?.value;

/** Restores stored preferences; unknown or outdated values fall back to the defaults. */
export function restorePreferences(saved: Partial<Record<keyof Preferences, unknown>> | undefined): Preferences {
  return {
    theme: pick(saved?.theme, themePreference.options) ?? defaultPreferences.theme,
    density: pick(saved?.density, densityPreference.options) ?? defaultPreferences.density,
    view: pick(saved?.view, viewPreference.options) ?? defaultPreferences.view,
    sort: pick(saved?.sort, sortPreference.options) ?? defaultPreferences.sort,
    scene: pick(saved?.scene, scenePreference.options) ?? defaultPreferences.scene,
    slideshow: pick(saved?.slideshow, slideshowPreference.options) ?? defaultPreferences.slideshow,
    sceneBlur: pick(saved?.sceneBlur, sceneBlurPreference.options) ?? defaultPreferences.sceneBlur,
    motion: pick(saved?.motion, motionPreference.options) ?? defaultPreferences.motion,
  };
}
