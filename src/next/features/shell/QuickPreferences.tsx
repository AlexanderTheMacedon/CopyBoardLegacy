import { usePreview } from '../../app/context';
import { themePreference } from '../../app/preferences';
import { Popover } from '../../components/Popover';
import { SegmentedControl } from '../../components/SegmentedControl';

// Contextual Quick Preferences (D-033). They write the same preference state as the Settings Studio.

export function ThemeQuickPreference() {
  const { state, dispatch } = usePreview();
  return (
    <Popover label="Erscheinungsbild" icon={state.prefs.theme === 'dark' ? 'moon' : state.prefs.theme === 'light' ? 'sun' : 'monitor'}>
      {() => (
        <div className="cb-quick-pref">
          <p className="cb-quick-pref__title">Erscheinungsbild</p>
          <SegmentedControl
            label={themePreference.label}
            options={themePreference.options}
            value={state.prefs.theme}
            onChange={(theme) => dispatch({ type: 'setPreference', patch: { theme } })}
          />
          <p className="cb-quick-pref__note">Wird auf diesem Gerät gemerkt.</p>
        </div>
      )}
    </Popover>
  );
}
