import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { usePreview } from '../../app/context';
import { densityPreference, sidebarPreference, themePreference, viewPreference, type PreferenceDefinition, type Preferences } from '../../app/preferences';
import type { SettingsSection } from '../../app/state';
import { DemoBadge } from '../../components/DemoBadge';
import { Dialog } from '../../components/Dialog';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useGlider, useScrollFade } from '../../components/motion';
import { SegmentedControl } from '../../components/SegmentedControl';

const sections: readonly { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: 'general', label: 'Allgemein & Darstellung', icon: 'palette' },
  { id: 'data', label: 'Daten & Synchronisierung', icon: 'cloud' },
  { id: 'security', label: 'Sicherheit & Datenschutz', icon: 'shield' },
];

const step = (i: number) => ({ '--i': i }) as CSSProperties;

function PreferenceRow<K extends keyof Preferences>({ definition, index }: { definition: PreferenceDefinition<K>; index: number }) {
  const { state, dispatch } = usePreview();
  return (
    <div className="cb-settings__row" style={step(index)}>
      <p className="cb-settings__label">{definition.label}</p>
      <SegmentedControl
        label={definition.label}
        size="sm"
        options={definition.options}
        value={state.prefs[definition.key]}
        onChange={(value) => dispatch({ type: 'setPreference', patch: { [definition.key]: value } as Partial<Preferences> })}
      />
    </div>
  );
}

/** Placeholder row for a setting whose real implementation needs a later, separately approved run. */
function PendingRow({ label, index, children }: { label: string; index: number; children: ReactNode }) {
  return (
    <div className="cb-settings__row cb-settings__row--pending" style={step(index)}>
      <span className="cb-settings__lock" aria-hidden="true">
        <Icon name="lock" size={16} />
      </span>
      <p className="cb-settings__label">
        {label} <DemoBadge>Noch nicht verfügbar</DemoBadge>
      </p>
      <p className="cb-settings__hint">{children}</p>
    </div>
  );
}

function SectionContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case 'general':
      return (
        <>
          <PreferenceRow definition={themePreference} index={0} />
          <PreferenceRow definition={sidebarPreference} index={1} />
          <PreferenceRow definition={densityPreference} index={2} />
          <PreferenceRow definition={viewPreference} index={3} />
          <PendingRow label="Sprache" index={4}>
            Deutsch. Weitere Sprachen folgen.
          </PendingRow>
          <p className="cb-settings__note" style={step(5)}>
            <Icon name="info" size={16} />
            Änderungen gelten nur für diese Sitzung und werden nicht gespeichert.
          </p>
        </>
      );
    case 'data':
      return (
        <>
          <PendingRow label="Speicherort" index={0}>
            Die Vorschau zeigt synthetische Beispieldaten und speichert nichts.
          </PendingRow>
          <PendingRow label="Konto & Cloud" index={1}>
            Keine Anmeldung und keine Synchronisierung in der Vorschau.
          </PendingRow>
          <PendingRow label="Export & Backup" index={2}>
            Folgt mit dem Datenadapter eines späteren Runs.
          </PendingRow>
        </>
      );
    case 'security':
      return (
        <>
          <PendingRow label="Mikrofon" index={0}>
            Es wird keine Berechtigung angefragt; der Recorder ist eine reine Oberfläche.
          </PendingRow>
          <PendingRow label="PIN-Schutz" index={1}>
            Gesperrte Inhalte und PIN-Entsperrung folgen später.
          </PendingRow>
          <PendingRow label="Datenschutz" index={2}>
            Keine Netzwerkverbindungen, keine Zwischenablage, keine Dateien.
          </PendingRow>
        </>
      );
  }
}

function SettingsPanel({ section }: { section: SettingsSection }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFade(ref);
  return (
    <div ref={ref} role="tabpanel" id="cb-settings-panel" aria-labelledby={`cb-settings-tab-${section}`} className="cb-settings__panel cb-scroll">
      {/* Keyed content replays the section reveal; the scroller itself stays. */}
      <div key={section} className="cb-settings__section">
        <SectionContent section={section} />
      </div>
    </div>
  );
}

/** Settings Studio (D-033, DS-C37): same preference state as the Quick Preferences; data/security areas are prepared only. */
export function SettingsStudio() {
  const { state, dispatch } = usePreview();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabListRef = useGlider<HTMLDivElement>('[aria-selected="true"]', [state.settingsSection]);
  const close = () => dispatch({ type: 'closeOverlay' });
  const current = sections.findIndex((s) => s.id === state.settingsSection);

  const onTabKeyDown = (event: KeyboardEvent) => {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = (current + delta + sections.length) % sections.length;
    const section = sections[next];
    if (!section) return;
    dispatch({ type: 'setSettingsSection', section: section.id });
    tabRefs.current[next]?.focus();
  };

  return (
    <Dialog open={state.overlay === 'settings'} onClose={close} labelledBy="cb-settings-title" variant="sheet">
      <div className="cb-settings">
        <header className="cb-settings__header">
          <h2 id="cb-settings-title">Einstellungen</h2>
          <IconButton icon="x" label="Einstellungen schließen" onClick={close} />
        </header>
        <div className="cb-settings__layout">
          <div ref={tabListRef} role="tablist" aria-label="Bereiche" aria-orientation="vertical" className="cb-settings__tabs" onKeyDown={onTabKeyDown}>
            <span className="cb-glider cb-settings__glider" aria-hidden="true" />
            {sections.map((section, index) => (
              <button
                key={section.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`cb-settings-tab-${section.id}`}
                aria-selected={section.id === state.settingsSection}
                aria-controls="cb-settings-panel"
                tabIndex={section.id === state.settingsSection ? 0 : -1}
                className="cb-settings__tab"
                onClick={() => dispatch({ type: 'setSettingsSection', section: section.id })}
              >
                <Icon name={section.icon} size={18} />
                {section.label}
              </button>
            ))}
          </div>
          <SettingsPanel section={state.settingsSection} />
        </div>
      </div>
    </Dialog>
  );
}
