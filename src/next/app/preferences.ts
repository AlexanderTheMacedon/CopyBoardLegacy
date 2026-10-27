import type { IconName } from '../components/Icon';

// One preference model for Quick Preferences and Settings Studio (D-033). Explicit choices persist in the local store.

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfort' | 'standard' | 'compact';
export type ViewMode = 'grid' | 'list';

export interface Preferences {
  readonly theme: ThemeMode;
  readonly density: Density;
  readonly view: ViewMode;
}

/** Light is the primary design state: first start is always light, never derived from the OS theme. */
export const defaultPreferences: Preferences = {
  theme: 'light',
  density: 'standard',
  view: 'grid',
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
  };
}
