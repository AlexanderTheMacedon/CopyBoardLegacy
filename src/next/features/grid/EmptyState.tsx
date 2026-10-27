import { usePreview } from '../../app/context';
import { Icon, type IconName } from '../../components/Icon';
import { focusCapture, pickFiles } from '../capture/SmartCapture';

type EmptyVariant = 'space-empty' | 'collection-empty' | 'unavailable';

const copy: Record<EmptyVariant, { icon: IconName; title: string; text: string }> = {
  // D-026 Living Empty State: only for a confirmed empty space. Capture above stays the single primary entry.
  'space-empty': {
    icon: 'inbox',
    title: 'Dieser Space ist noch leer',
    text: 'Kopiere etwas und drücke hier ⌘V – Text, Links, Screenshots und Dateien landen sofort als Karte in diesem Space.',
  },
  'collection-empty': {
    icon: 'layers',
    title: 'Noch keine Inhalte',
    text: 'In dieser Ansicht gibt es aktuell keine Einträge.',
  },
  unavailable: {
    icon: 'lock',
    title: 'Noch nicht verfügbar',
    text: 'Diese Ansicht folgt in einem späteren Run. Die Vorschau enthält dafür noch keine Daten.',
  },
};

/** Three optional quick starts (D-026): shortcuts into the existing capture / recorder flows, no separate system. */
function QuickStarts() {
  const { dispatch } = usePreview();
  return (
    <div className="cb-empty__starts" role="group" aria-label="Schnellstart">
      <button type="button" className="cb-empty__start" onClick={focusCapture}>
        <Icon name="pen" size={16} />
        Notiz erstellen
      </button>
      <button
        type="button"
        className="cb-empty__start"
        onClick={pickFiles}
      >
        <Icon name="paperclip" size={16} />
        Datei hinzufügen
      </button>
      <button type="button" className="cb-empty__start" onClick={() => dispatch({ type: 'setRecorderOpen', open: true })}>
        <Icon name="mic" size={16} />
        Session starten
      </button>
    </div>
  );
}

export function EmptyState({ variant }: { variant: EmptyVariant }) {
  const { icon, title, text } = copy[variant];
  const living = variant === 'space-empty';
  return (
    <div className="cb-empty" data-variant={variant}>
      {living ? (
        // Living composition: a motif study for the design run; the final illustration is not decided (D-026).
        <div className="cb-empty__stage" aria-hidden="true">
          <span className="cb-empty__glow" />
          <span className="cb-empty__sheet cb-empty__sheet--a" />
          <span className="cb-empty__sheet cb-empty__sheet--b" />
          <span className="cb-empty__sheet cb-empty__sheet--c" />
        </div>
      ) : (
        <div className="cb-empty__art" aria-hidden="true">
          <Icon name={icon} size={30} />
        </div>
      )}
      <h2 className="cb-empty__title">{title}</h2>
      <p className="cb-empty__text">{text}</p>
      {living && <QuickStarts />}
    </div>
  );
}
