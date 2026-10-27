import { useId, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { SpaceGlyph } from '../../components/SpaceIcon';
import { emojiIcons, lucideIcons, searchIcons, spaceColorLabel } from '../../domain/icons';
import { spaceColors, type SpaceColor, type SpaceIcon } from '../../domain/types';

/** Searchable icon chooser: curated line icons and emojis in one grid, the current choice first. */
export function IconPicker({ value, onChange, color, name, compact = false }: { value: SpaceIcon | undefined; onChange: (icon: SpaceIcon | undefined) => void; color?: SpaceColor; name: string; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'icons' | 'emoji'>(value?.startsWith('emoji:') ? 'emoji' : 'icons');
  const id = useId();
  const source = query.trim() ? [...lucideIcons, ...emojiIcons] : tab === 'icons' ? lucideIcons : emojiIcons;
  const results = useMemo(() => searchIcons(query, source), [query, source]);
  return (
    <div className="cb-iconpicker" data-compact={compact || undefined}>
      <div className="cb-iconpicker__head">
        <SpaceGlyph icon={value} name={name} color={color} size={44} className="cb-iconpicker__preview" />
        <label className="cb-iconpicker__search">
          <Icon name="search" size={16} />
          <span className="cb-visually-hidden">Icons durchsuchen</span>
          <input type="search" value={query} placeholder="Icon suchen …" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="cb-iconpicker__tabs" role="tablist" aria-label="Icon-Art">
          <button type="button" role="tab" aria-selected={tab === 'icons' && !query} className="cb-iconpicker__tab" onClick={() => { setTab('icons'); setQuery(''); }}>
            Icons
          </button>
          <button type="button" role="tab" aria-selected={tab === 'emoji' && !query} className="cb-iconpicker__tab" onClick={() => { setTab('emoji'); setQuery(''); }}>
            Emoji
          </button>
        </div>
      </div>
      <div className="cb-iconpicker__grid cb-scroll" role="listbox" aria-label="Icons" id={id}>
        <button type="button" role="option" aria-selected={!value} className="cb-iconpicker__option cb-iconpicker__option--initial" title="Anfangsbuchstabe" onClick={() => onChange(undefined)}>
          <SpaceGlyph name={name} color={color} size={30} />
        </button>
        {results.map((entry) => (
          <button key={entry.icon} type="button" role="option" aria-selected={entry.icon === value} className="cb-iconpicker__option" title={entry.label} onClick={() => onChange(entry.icon)}>
            <SpaceGlyph icon={entry.icon} name={entry.label} color={color} size={30} />
          </button>
        ))}
        {!results.length && <p className="cb-iconpicker__empty">Kein Icon zu „{query}“.</p>}
      </div>
    </div>
  );
}

/** Space colour swatches (identity colours, tokens.css). */
export function ColorPicker({ value, onChange, allowNone = false }: { value: SpaceColor | undefined; onChange: (color: SpaceColor | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="cb-colorpicker" role="radiogroup" aria-label="Farbe">
      {allowNone && (
        <button type="button" role="radio" aria-checked={!value} className="cb-colorpicker__swatch cb-colorpicker__swatch--none" title="Farbe des Spaces" onClick={() => onChange(undefined)}>
          <Icon name="x" size={12} />
        </button>
      )}
      {spaceColors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={spaceColorLabel[color]}
          title={spaceColorLabel[color]}
          className="cb-colorpicker__swatch"
          style={{ '--cb-swatch': `var(--cb-space-${color})` } as CSSProperties}
          onClick={() => onChange(color)}
        >
          {value === color && <Icon name="check" size={13} />}
        </button>
      ))}
    </div>
  );
}
