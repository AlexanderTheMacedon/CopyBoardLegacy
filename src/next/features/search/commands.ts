import type { IconName } from '../../components/Icon';
import type { ReadOnlyLibrary } from '../../domain/library';
import { tokenize, normalize } from '../../domain/search';
import type { UiAction } from '../../app/state';

/** Non-destructive palette commands (SM-07). Each maps to exactly one UI action; nothing here mutates data. */
export interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly action: UiAction;
}

export function paletteCommands(library: ReadOnlyLibrary): PaletteCommand[] {
  return [
    ...library.spaces.map((space) => ({
      id: `go-${space.id}`,
      label: `Gehe zu Space: ${space.name}`,
      icon: 'spaces' as const,
      action: { type: 'navigate', location: { type: 'space', spaceId: space.id } } as const,
    })),
    { id: 'new-space', label: 'Neuer Space', icon: 'plus', action: { type: 'openModal', modal: { kind: 'space-new' } } },
    { id: 'view-grid', label: 'Ansicht: Raster', icon: 'grid', action: { type: 'setPreference', patch: { view: 'grid' } } },
    { id: 'view-list', label: 'Ansicht: Liste', icon: 'list', action: { type: 'setPreference', patch: { view: 'list' } } },
    { id: 'view-files', label: 'Ansicht: Dateien', icon: 'table', action: { type: 'setPreference', patch: { view: 'files' } } },
    { id: 'theme-light', label: 'Erscheinungsbild: Hell', icon: 'sun', action: { type: 'setPreference', patch: { theme: 'light' } } },
    { id: 'theme-dark', label: 'Erscheinungsbild: Dunkel', icon: 'moon', action: { type: 'setPreference', patch: { theme: 'dark' } } },
    { id: 'theme-system', label: 'Erscheinungsbild: System', icon: 'monitor', action: { type: 'setPreference', patch: { theme: 'system' } } },
    { id: 'settings', label: 'Einstellungen öffnen', icon: 'sliders', action: { type: 'openSettings' } },
  ];
}

export function filterCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [...commands];
  return commands.filter((c) => {
    const label = normalize(c.label);
    return tokens.every((t) => label.includes(t));
  });
}
