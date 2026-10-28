import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { usePreview } from '../../app/context';
import {
  densityPreference,
  gradientPreference,
  introPreference,
  motionPreference,
  sceneBlurPreference,
  scenePreference,
  slideshowPreference,
  sortPreference,
  themePreference,
  viewPreference,
  type PreferenceDefinition,
  type Preferences,
} from '../../app/preferences';
import type { SettingsSection } from '../../app/state';
import { DemoBadge } from '../../components/DemoBadge';
import { Dialog } from '../../components/Dialog';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useGlider, useScrollFade } from '../../components/motion';
import { SegmentedControl } from '../../components/SegmentedControl';
import { lightScenes, scenes, type Scene } from '../shell/scenes';
import { SHOWCASE_SPACE_ID } from '../../data/showcase';

const sections: readonly { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: 'general', label: 'Allgemein & Darstellung', icon: 'palette' },
  { id: 'data', label: 'Daten & Synchronisierung', icon: 'cloud' },
  { id: 'security', label: 'Sicherheit & Datenschutz', icon: 'shield' },
];

const step = (i: number) => ({ '--i': i }) as CSSProperties;

function PreferenceRow<K extends keyof Preferences>({ definition, index, disabled = false }: { definition: PreferenceDefinition<K>; index: number; disabled?: boolean }) {
  const { state, dispatch } = usePreview();
  return (
    <div className="cb-settings__row" style={step(index)} data-disabled={disabled || undefined} inert={disabled}>
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

/** Photographers of the photo backgrounds (nature or light), linked to their Unsplash pages. */
function SceneCredits({ index, set }: { index: number; set: readonly Scene[] }) {
  return (
    <div className="cb-settings__row cb-settings__credits" style={step(index)}>
      <p className="cb-settings__label">Fotografien</p>
      <ul className="cb-credits">
        {set.map((scene) => (
          <li key={scene.id}>
            <span className="cb-credits__thumb" style={{ backgroundImage: `url(${scene.src})` }} aria-hidden="true" />
            <span className="cb-credits__text">
              <span className="cb-credits__place">
                {scene.place} · {scene.park}
              </span>
              <a href={scene.url} target="_blank" rel="noreferrer noopener">
                {scene.photographer} auf Unsplash
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p className="cb-settings__hint">Lokal mitgeliefert unter der Unsplash-Lizenz. Es werden keine Bilder aus dem Netz nachgeladen.</p>
    </div>
  );
}

/**
 * Explicit entry for the test space "Full" (data/showcase.ts): creates it once, or rebuilds the parts that are missing after
 * the user deleted them. Never overwrites or deletes anything; other spaces are not touched.
 */
function ShowcaseRow({ index }: { index: number }) {
  const { workspace, dispatch, notify } = usePreview();
  const [busy, setBusy] = useState(false);
  const { seeded, present } = workspace.showcase;
  const run = async () => {
    setBusy(true);
    try {
      const added = await workspace.seedShowcase('explicit');
      notify(added ? 'Test-Space „Full“ ist bereit.' : 'Test-Space „Full“ ist bereits vollständig.', { tone: 'success' });
      dispatch({ type: 'navigate', location: { type: 'space', spaceId: SHOWCASE_SPACE_ID } });
      dispatch({ type: 'closeOverlay' });
    } catch {
      notify('Der Test-Space „Full“ konnte nicht angelegt werden. Bestehende Inhalte sind unverändert.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cb-settings__row" style={step(index)}>
      <p className="cb-settings__label">
        Test-Space „Full“ <DemoBadge>Testdaten</DemoBadge>
      </p>
      <button type="button" className="cb-button cb-button--sm" disabled={busy || !workspace.persistent} onClick={() => void run()}>
        {present ? 'Fehlende Einträge ergänzen' : seeded ? 'Neu aufbauen' : 'Erstellen'}
      </button>
      <p className="cb-settings__hint">
        Über 60 synthetische Einträge aller Arten mit Ordnern in bis zu vier Ebenen, zum Ausprobieren von Scrollen, Suche, Ziehen,
        Auswahl und Editor. Ergänzt nur, was fehlt; bestehende Inhalte und andere Spaces bleiben unverändert.
      </p>
    </div>
  );
}

function SectionContent({ section }: { section: SettingsSection }) {
  const { state } = usePreview();
  const { scene } = state.prefs;
  const photoSet = scene === 'nature' ? scenes : scene === 'ambient' ? lightScenes : null;
  switch (section) {
    case 'general':
      return (
        <>
          <PreferenceRow definition={themePreference} index={0} />
          <PreferenceRow definition={scenePreference} index={1} />
          {scene === 'gradient' ? (
            <PreferenceRow definition={gradientPreference} index={2} />
          ) : (
            <PreferenceRow definition={slideshowPreference} index={2} />
          )}
          <PreferenceRow definition={sceneBlurPreference} index={3} disabled={scene === 'gradient'} />
          <PreferenceRow definition={motionPreference} index={4} />
          <PreferenceRow definition={introPreference} index={5} />
          <PreferenceRow definition={densityPreference} index={6} />
          <PreferenceRow definition={viewPreference} index={7} />
          <PreferenceRow definition={sortPreference} index={8} />
          <PendingRow label="Sprache" index={9}>
            Deutsch. Weitere Sprachen folgen.
          </PendingRow>
          {photoSet && <SceneCredits index={10} set={photoSet} />}
          <p className="cb-settings__note" style={step(11)}>
            <Icon name="info" size={16} />
            Darstellung wird auf diesem Gerät gemerkt. Standard ist das helle Design mit wechselnden Naturmotiven. Bei reduzierter Bewegung bleibt das Hintergrundbild stehen und die Startanimation entfällt. Spaces können eigene Voreinstellungen haben.
          </p>
        </>
      );
    case 'data':
      return (
        <>
          <div className="cb-settings__row" style={step(0)}>
            <p className="cb-settings__label">Speicherort</p>
            <p className="cb-settings__hint">
              Eingefügte Inhalte werden lokal in diesem Browser gespeichert (IndexedDB) und bleiben nach dem Neuladen erhalten.
              Die Beispielinhalte sind synthetisch. Die bisherige CopyBoard-App und ihre Daten bleiben unberührt.
            </p>
          </div>
          <ShowcaseRow index={1} />
          <PendingRow label="Konto & Cloud" index={2}>
            Keine Anmeldung und keine Synchronisierung in der Vorschau.
          </PendingRow>
          <PendingRow label="Export & Backup" index={3}>
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
            Keine Netzwerkverbindungen. Die Zwischenablage wird nur beim Einfügen durch dich gelesen.
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
