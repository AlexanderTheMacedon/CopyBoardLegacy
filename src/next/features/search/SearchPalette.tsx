import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { usePreview } from '../../app/context';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { useGlider, useScrollFade } from '../../components/motion';
import { searchItems } from '../../domain/search';
import type { Item } from '../../domain/types';
import { kindIcon, kindLabel } from '../items/item-meta';
import { filterCommands, paletteCommands, type PaletteCommand } from './commands';

type Entry = { kind: 'item'; id: string; item: Item } | { kind: 'command'; id: string; command: PaletteCommand };

const RECENT_COUNT = 5;
const optionId = (entry: Entry) => `cb-search-option-${entry.kind}-${entry.id}`;

function PaletteBody({ onClose }: { onClose: () => void }) {
  const { dispatch, library } = usePreview();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const commands = useMemo(() => paletteCommands(library), [library]);

  const itemEntries: Entry[] = (
    query.trim() ? searchItems(library.allItems(), query).map((h) => h.item) : library.listItems({ type: 'collection', collectionId: 'recent' }).slice(0, RECENT_COUNT)
  ).map((item) => ({ kind: 'item', id: item.id, item }));
  const commandEntries: Entry[] = filterCommands(commands, query).map((command) => ({ kind: 'command', id: command.id, command }));
  const entries = [...itemEntries, ...commandEntries];
  const activeIndex = Math.min(active, Math.max(entries.length - 1, 0));
  const activeEntry = entries[activeIndex];
  // One selection surface glides between results (keyboard and pointer alike); the list fades its scrollbar.
  const resultsRef = useGlider<HTMLDivElement>('[aria-selected="true"]', [activeEntry?.id, query]);
  useScrollFade(resultsRef);

  const activate = (entry: Entry) => {
    onClose();
    // Opening a hit never switches the active space silently (IA-02 §1); the Inspector offers "Im Space anzeigen".
    if (entry.kind === 'item') dispatch({ type: 'inspect', itemId: entry.item.id });
    else dispatch(entry.command.action);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!entries.length) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = entries[(activeIndex + delta + entries.length) % entries.length];
      setActive((activeIndex + delta + entries.length) % entries.length);
      if (next) requestAnimationFrame(() => document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter' && activeEntry) {
      event.preventDefault();
      activate(activeEntry);
    }
  };

  const renderGroup = (label: string, group: Entry[], offset: number) =>
    group.length > 0 && (
      <div role="group" aria-label={label} className="cb-palette__group">
        <p className="cb-palette__group-label" aria-hidden="true">
          {label}
        </p>
        {group.map((entry, i) => {
          const index = offset + i;
          const selected = index === activeIndex;
          return (
            <div
              key={entry.id}
              id={optionId(entry)}
              role="option"
              aria-selected={selected}
              className="cb-palette__option"
              style={{ '--i': Math.min(index, 10) } as CSSProperties}
              onMouseMove={(event) => {
                // Scrolling under a resting pointer fires moves without movement; they must not steal keyboard selection.
                if (!selected && (event.movementX || event.movementY)) setActive(index);
              }}
              onClick={() => activate(entry)}
            >
              {entry.kind === 'item' ? (
                <>
                  <span className="cb-palette__icon" data-kind={entry.item.kind} aria-hidden="true">
                    <Icon name={kindIcon[entry.item.kind]} size={17} />
                  </span>
                  <span className="cb-palette__option-label">{entry.item.title}</span>
                  <span className="cb-palette__option-meta">
                    {kindLabel[entry.item.kind]} · {library.getSpace(entry.item.spaceId)?.name}
                  </span>
                </>
              ) : (
                <>
                  <span className="cb-palette__icon" data-kind="command" aria-hidden="true">
                    <Icon name={entry.command.icon} size={17} />
                  </span>
                  <span className="cb-palette__option-label">{entry.command.label}</span>
                  <span className="cb-palette__option-meta">Befehl</span>
                </>
              )}
              <span className="cb-palette__option-enter" aria-hidden="true">
                <Icon name="cornerDownLeft" size={14} />
              </span>
            </div>
          );
        })}
      </div>
    );

  return (
    <>
      <h2 id="cb-search-title" className="cb-visually-hidden">
        Suche
      </h2>
      <div className="cb-palette__field">
        <Icon name="search" />
        <input
          className="cb-palette__input"
          type="text"
          role="combobox"
          aria-label="Inhalte und Befehle durchsuchen"
          aria-expanded="true"
          aria-controls="cb-search-results"
          aria-autocomplete="list"
          aria-activedescendant={activeEntry ? optionId(activeEntry) : undefined}
          placeholder="Inhalte und Befehle durchsuchen …"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="cb-kbd">Esc</kbd>
      </div>
      <div ref={resultsRef} id="cb-search-results" role="listbox" aria-label="Suchergebnisse" className="cb-palette__results cb-scroll">
        <span className="cb-glider cb-palette__glider" aria-hidden="true" />
        {renderGroup(query.trim() ? 'Inhalte' : 'Zuletzt', itemEntries, 0)}
        {renderGroup('Befehle', commandEntries, itemEntries.length)}
      </div>
      {!entries.length && (
        <p className="cb-palette__empty" role="status">
          Keine Treffer für „{query}“.
        </p>
      )}
      <p className="cb-palette__footer">
        <span>
          <kbd className="cb-kbd">↑</kbd>
          <kbd className="cb-kbd">↓</kbd> auswählen
        </span>
        <span>
          <kbd className="cb-kbd">↵</kbd> öffnen
        </span>
        <span className="cb-palette__scope">Lokale Suche in synthetischen Beispieldaten</span>
      </p>
    </>
  );
}

/** Smart Search palette (D-021, DS-C29, M-11): modal layer L5, full screen on phones via CSS. */
export function SearchPalette() {
  const { state, dispatch } = usePreview();
  const close = () => dispatch({ type: 'closeOverlay' });
  return (
    <Dialog open={state.overlay === 'search'} onClose={close} labelledBy="cb-search-title" variant="palette">
      <PaletteBody onClose={close} />
    </Dialog>
  );
}
