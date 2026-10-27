import type { CSSProperties } from 'react';
import { usePreview } from '../../app/context';
import { Icon, type IconName } from '../../components/Icon';
import { useGlider } from '../../components/motion';
import { SpaceGlyph, spaceColorVar } from '../../components/SpaceIcon';
import type { CollectionId, Location } from '../../domain/types';

const collectionIcon: Record<CollectionId, IconName> = {
  all: 'layers',
  favorites: 'star',
  recent: 'clock',
  sessions: 'waveform',
};

/**
 * Spaces-first navigation (D-018): "Deine Spaces" on top, quick access below. Shared by the desktop sidebar and the mobile
 * drawer, so both always show the same entries and active state. `--i` drives the staggered label reveal (M-01); one glider
 * moves between the active entries of both lists and carries the active space colour as its glow.
 */
export function SpaceNav({ idPrefix }: { idPrefix: string }) {
  const { state, dispatch, library } = usePreview();
  const { location } = state;
  const go = (next: Location) => dispatch({ type: 'navigate', location: next });
  const indexStyle = (i: number) => ({ '--i': i }) as CSSProperties;
  let index = 0;
  const locationKey = location.type === 'space' ? location.spaceId : location.collectionId;
  const navRef = useGlider<HTMLElement>('[aria-current="page"]', [locationKey]);
  const activeSpace = location.type === 'space' ? library.getSpace(location.spaceId) : undefined;
  const activeTint = activeSpace ? spaceColorVar(activeSpace.color) : 'var(--cb-accent)';

  return (
    <nav ref={navRef} className="cb-nav" aria-label="Spaces und Schnellzugriff" data-cb-context="spaces" style={{ '--cb-active-tint': activeTint } as CSSProperties}>
      <span className="cb-glider cb-nav__glider" aria-hidden="true" />
      <h2 className="cb-nav__heading" id={`${idPrefix}-spaces`}>
        Deine Spaces
      </h2>
      <ul className="cb-nav__list" aria-labelledby={`${idPrefix}-spaces`}>
        {library.spaces.map((space) => {
          const active = location.type === 'space' && location.spaceId === space.id;
          const count = library.listItems({ type: 'space', spaceId: space.id }).length;
          const i = index++;
          return (
            <li key={space.id}>
              <button
                type="button"
                className="cb-nav__item"
                aria-current={active ? 'page' : undefined}
                title={space.name}
                data-space-id={space.id}
                style={{ ...indexStyle(i), '--cb-swatch': spaceColorVar(space.color) } as CSSProperties}
                onClick={() => go({ type: 'space', spaceId: space.id })}
              >
                <SpaceGlyph icon={space.icon} name={space.name} color={space.color} size={32} className="cb-nav__swatch" />
                <span className="cb-nav__label">{space.name}</span>
                <span className="cb-nav__count" aria-label={`${count} Inhalte`}>
                  {count}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="cb-nav__item cb-nav__item--muted"
            title="Neuer Space"
            style={indexStyle(index++)}
            onClick={() => dispatch({ type: 'openModal', modal: { kind: 'space-new' } })}
          >
            <span className="cb-nav__icon" aria-hidden="true">
              <Icon name="plus" />
            </span>
            <span className="cb-nav__label">Neuer Space</span>
          </button>
        </li>
      </ul>

      <h2 className="cb-nav__heading" id={`${idPrefix}-quick`}>
        Schnellzugriff
      </h2>
      <ul className="cb-nav__list" aria-labelledby={`${idPrefix}-quick`}>
        {library.collections.map((collection) => {
          const active = location.type === 'collection' && location.collectionId === collection.id;
          const i = index++;
          return (
            <li key={collection.id}>
              <button
                type="button"
                className="cb-nav__item"
                aria-current={active ? 'page' : undefined}
                title={collection.name}
                style={indexStyle(i)}
                onClick={() => go({ type: 'collection', collectionId: collection.id })}
              >
                <span className="cb-nav__icon" aria-hidden="true">
                  <Icon name={collectionIcon[collection.id]} />
                </span>
                <span className="cb-nav__label">{collection.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
