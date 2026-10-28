import { Icon, type IconName } from '../../components/Icon';

type EmptyVariant = 'space-empty' | 'collection-empty' | 'unavailable';

const copy: Record<EmptyVariant, { icon: IconName; title: string; text: string }> = {
  // D-026 Living Empty State: only for a confirmed empty space. The composer below stays the single entry (no second one here).
  'space-empty': {
    icon: 'inbox',
    title: 'Dieser Space ist noch leer',
    text: 'Kopiere etwas und drücke hier ⌘V – oder schreib unten eine Notiz. Text, Links, Screenshots und Dateien landen sofort als Karte in diesem Space.',
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
    </div>
  );
}
