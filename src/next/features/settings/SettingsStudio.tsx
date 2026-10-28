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

const sections: readonly { id: SettingsSection; label: string; icon: IconName; summary: string; intro: string }[] = [
  {
    id: 'general',
    label: 'Allgemein & Darstellung',
    icon: 'palette',
    summary: 'Design, Hintergrund, Bewegung',
    intro: 'Wie CopyBoard aussieht und sich bewegt. Alles wird auf diesem Gerät gemerkt.',
  },
  {
    id: 'data',
    label: 'Daten & Synchronisierung',
    icon: 'cloud',
    summary: 'Speicher und Testdaten',
    intro: 'Wo deine Inhalte liegen und womit du die Oberfläche ausprobieren kannst.',
  },
  {
    id: 'security',
    label: 'Sicherheit & Datenschutz',
    icon: 'shield',
    summary: 'Datenschutz und Sperren',
    intro: 'Was CopyBoard liest, speichert und künftig schützen wird.',
  },
];

const step = (i: number) => ({ '--i': i }) as CSSProperties;

/** Icon and one short line of help per preference; the definitions (labels, options) stay in app/preferences.ts. */
const preferenceMeta: { readonly [K in keyof Preferences]: { icon: IconName; hint: string } } = {
  theme: { icon: 'sun', hint: 'Hell, dunkel oder wie das System.' },
  scene: { icon: 'image', hint: 'Naturfotografie, Lichtlinien oder ein ruhiger Verlauf.' },
  slideshow: { icon: 'play', hint: 'Motive wechseln langsam oder bleiben stehen.' },
  gradient: { icon: 'droplet', hint: 'Lichtstimmung des Verlaufs.' },
  sceneBlur: { icon: 'eye', hint: 'Wie weich das Motiv hinter dem Glas liegt.' },
  motion: { icon: 'move', hint: 'Reduziert schaltet räumliche Animationen ab.' },
  intro: { icon: 'sunrise', hint: 'Signatur-Animation beim Start.' },
  density: { icon: 'layout', hint: 'Abstände und Kartengröße im Board.' },
  view: { icon: 'grid', hint: 'Raster, Liste oder Dateiliste.' },
  sort: { icon: 'sortAsc', hint: 'Reihenfolge der Inhalte.' },
};

/** One setting: icon tile, label with a short hint, the control on the right (below it on narrow widths). */
function SettingRow({
  icon,
  label,
  hint,
  children,
  disabled = false,
  pending = false,
  className,
}: {
  icon: IconName;
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`cb-settings__row${pending ? ' cb-settings__row--pending' : ''}${className ? ` ${className}` : ''}`}
      data-disabled={disabled || undefined}
      inert={disabled}
    >
      <span className="cb-settings__icon" aria-hidden="true">
        <Icon name={pending ? 'lock' : icon} size={18} />
      </span>
      <div className="cb-settings__text">
        <p className="cb-settings__label">{label}</p>
        {hint && <p className="cb-settings__hint">{hint}</p>}
      </div>
      {children && <div className="cb-settings__control">{children}</div>}
    </div>
  );
}

/** A titled group of rows inside a section; it only exists where real settings stand behind it. */
function SettingGroup({ icon, title, index, children }: { icon: IconName; title: string; index: number; children: ReactNode }) {
  return (
    <section className="cb-settings__group" style={step(index)} aria-label={title}>
      <h4 className="cb-settings__group-title">
        <Icon name={icon} size={15} />
        {title}
      </h4>
      <div className="cb-settings__rows">{children}</div>
    </section>
  );
}

function PreferenceRow<K extends keyof Preferences>({ definition, disabled = false, hint }: { definition: PreferenceDefinition<K>; disabled?: boolean; hint?: string }) {
  const { state, dispatch } = usePreview();
  const meta = preferenceMeta[definition.key];
  return (
    <SettingRow icon={meta.icon} label={definition.label} hint={hint ?? meta.hint} disabled={disabled}>
      <SegmentedControl
        label={definition.label}
        size="sm"
        options={definition.options}
        value={state.prefs[definition.key]}
        onChange={(value) => dispatch({ type: 'setPreference', patch: { [definition.key]: value } as Partial<Preferences> })}
      />
    </SettingRow>
  );
}

/** Placeholder row for a setting whose real implementation needs a later, separately approved run. */
function PendingRow({ label, icon, children }: { label: string; icon: IconName; children: ReactNode }) {
  return (
    <SettingRow
      pending
      icon={icon}
      label={
        <>
          {label} <DemoBadge>Noch nicht verfügbar</DemoBadge>
        </>
      }
      hint={children}
    />
  );
}

/** Photographers of the photo backgrounds (nature or light), linked to their Unsplash pages. */
function SceneCredits({ set }: { set: readonly Scene[] }) {
  return (
    <SettingRow icon="camera" label="Fotografien" hint="Lokal mitgeliefert unter der Unsplash-Lizenz. Es werden keine Bilder aus dem Netz nachgeladen." className="cb-settings__credits">
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
    </SettingRow>
  );
}

/**
 * Explicit entry for the test space "Full" (data/showcase.ts): creates it once, or rebuilds the parts that are missing after
 * the user deleted them. Never overwrites or deletes anything; other spaces are not touched.
 */
function ShowcaseRow() {
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
    <SettingRow
      icon="flask"
      label={
        <>
          Test-Space „Full“ <DemoBadge>Testdaten</DemoBadge>
        </>
      }
      hint="Über 60 synthetische Einträge aller Arten mit Ordnern in bis zu vier Ebenen, zum Ausprobieren von Scrollen, Suche, Ziehen, Auswahl und Editor. Ergänzt nur, was fehlt; bestehende Inhalte und andere Spaces bleiben unverändert."
    >
      <button type="button" className="cb-button cb-button--sm" disabled={busy || !workspace.persistent} onClick={() => void run()}>
        {present ? 'Fehlende Einträge ergänzen' : seeded ? 'Neu aufbauen' : 'Erstellen'}
      </button>
    </SettingRow>
  );
}

/** Real status of the local store (IndexedDB available or blocked), not a setting. */
function StorageRow() {
  const { workspace } = usePreview();
  const local = workspace.persistent;
  return (
    <SettingRow
      icon="database"
      label="Speicherort"
      hint="Eingefügte Inhalte werden lokal in diesem Browser gespeichert (IndexedDB) und bleiben nach dem Neuladen erhalten. Die Beispielinhalte sind synthetisch. Die bisherige CopyBoard-App und ihre Daten bleiben unberührt."
    >
      <span className="cb-settings__status" data-tone={local ? 'ok' : 'warn'}>
        <Icon name={local ? 'check' : 'info'} size={14} />
        {local ? 'Lokal aktiv' : 'Blockiert'}
      </span>
    </SettingRow>
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
          <SettingGroup icon="palette" title="Design & Oberfläche" index={1}>
            <PreferenceRow definition={themePreference} />
            <PreferenceRow definition={densityPreference} />
            <PreferenceRow definition={viewPreference} />
            <PreferenceRow definition={sortPreference} />
            <PendingRow label="Sprache" icon="globe">
              Deutsch. Weitere Sprachen folgen.
            </PendingRow>
          </SettingGroup>
          <SettingGroup icon="mountain" title="Hintergrund & Atmosphäre" index={2}>
            <PreferenceRow definition={scenePreference} />
            {scene === 'gradient' ? <PreferenceRow definition={gradientPreference} /> : <PreferenceRow definition={slideshowPreference} />}
            <PreferenceRow definition={sceneBlurPreference} disabled={scene === 'gradient'} hint={scene === 'gradient' ? 'Nur bei Fotohintergründen.' : undefined} />
            {photoSet && <SceneCredits set={photoSet} />}
          </SettingGroup>
          <SettingGroup icon="sparkles" title="Bewegung & Interaktion" index={3}>
            <PreferenceRow definition={motionPreference} />
            <PreferenceRow definition={introPreference} />
          </SettingGroup>
          <p className="cb-settings__note" style={step(4)}>
            <Icon name="info" size={16} />
            Standard ist das helle Design mit wechselnden Naturmotiven. Bei reduzierter Bewegung bleibt das Hintergrundbild stehen und die Startanimation entfällt. Spaces können eigene Voreinstellungen haben.
          </p>
        </>
      );
    case 'data':
      return (
        <>
          <SettingGroup icon="database" title="Speicher & Testdaten" index={1}>
            <StorageRow />
            <ShowcaseRow />
          </SettingGroup>
          <SettingGroup icon="cloud" title="Konto & Sicherung" index={2}>
            <PendingRow label="Konto & Cloud" icon="cloud">
              Keine Anmeldung und keine Synchronisierung in der Vorschau.
            </PendingRow>
            <PendingRow label="Export & Backup" icon="download">
              Folgt mit dem Datenadapter eines späteren Runs.
            </PendingRow>
          </SettingGroup>
        </>
      );
    case 'security':
      return (
        <>
          <SettingGroup icon="shield" title="Datenschutz" index={1}>
            <SettingRow icon="shield" label="Lokal & ohne Netzwerk" hint="Keine Netzwerkverbindungen. Die Zwischenablage wird nur beim Einfügen durch dich gelesen.">
              <span className="cb-settings__status" data-tone="ok">
                <Icon name="check" size={14} />
                Aktiv
              </span>
            </SettingRow>
          </SettingGroup>
          <SettingGroup icon="lock" title="Berechtigungen & Sperre" index={2}>
            <PendingRow label="Mikrofon" icon="mic">
              Es wird keine Berechtigung angefragt; der Recorder ist eine reine Oberfläche.
            </PendingRow>
            <PendingRow label="PIN-Schutz" icon="key">
              Gesperrte Inhalte und PIN-Entsperrung folgen später.
            </PendingRow>
          </SettingGroup>
        </>
      );
  }
}

function SettingsPanel({ section }: { section: SettingsSection }) {
  const ref = useRef<HTMLDivElement>(null);
  const meta = sections.find((s) => s.id === section);
  useScrollFade(ref);
  return (
    <div ref={ref} role="tabpanel" id="cb-settings-panel" aria-labelledby={`cb-settings-tab-${section}`} className="cb-settings__panel cb-scroll">
      {/* Keyed content replays the section reveal; the scroller itself stays. */}
      <div key={section} className="cb-settings__section">
        <header className="cb-settings__intro" style={step(0)}>
          <h3>{meta?.label}</h3>
          <p>{meta?.intro}</p>
        </header>
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
                <span className="cb-settings__tab-icon" aria-hidden="true">
                  <Icon name={section.icon} size={18} />
                </span>
                <span className="cb-settings__tab-text">
                  <span>{section.label}</span>
                  <span className="cb-settings__tab-summary">{section.summary}</span>
                </span>
              </button>
            ))}
          </div>
          <SettingsPanel section={state.settingsSection} />
        </div>
      </div>
    </Dialog>
  );
}
