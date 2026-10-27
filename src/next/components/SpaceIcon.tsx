import type { CSSProperties } from 'react';
import { parseIcon, suggestIcon } from '../domain/icons';
import type { SpaceColor, SpaceIcon } from '../domain/types';
import { Icon } from './Icon';

/** CSS custom property holding a space identity colour (tokens.css). */
export const spaceColorVar = (color: SpaceColor): string => `var(--cb-space-${color})`;

interface SpaceGlyphProps {
  icon?: SpaceIcon;
  /** Fallback when there is no icon: an icon suggested by the name, else an editorial monogram. */
  name: string;
  color?: SpaceColor;
  /** Outer size of the tinted swatch in px. */
  size?: number;
  className?: string;
  /** Render the glyph only (no tinted swatch behind it). */
  bare?: boolean;
}

/**
 * Identity glyph of a space or folder: a line icon or an emoji on a small tinted squircle. Consistent across the dock,
 * the header, dialogs and the file views; size scales the swatch and the glyph together.
 */
export function SpaceGlyph({ icon, name, color, size = 30, className, bare = false }: SpaceGlyphProps) {
  const parsed = parseIcon(icon ?? suggestIcon(name));
  const style = { '--cb-swatch': color ? spaceColorVar(color) : undefined, '--cb-glyph-size': `${size}px` } as CSSProperties;
  const glyph =
    parsed?.kind === 'lucide' ? (
      <Icon name={parsed.name} size={Math.round(size * 0.56)} />
    ) : parsed?.kind === 'emoji' ? (
      <span className="cb-glyph__emoji" style={{ fontSize: Math.round(size * 0.58) }}>
        {parsed.char}
      </span>
    ) : (
      <span className="cb-glyph__initial" style={{ fontSize: Math.round(size * 0.62) }}>
        {name.trim().slice(0, 1).toUpperCase() || '·'}
      </span>
    );
  return (
    <span
      className={`cb-glyph${bare ? ' cb-glyph--bare' : ''}${parsed?.kind === 'emoji' ? ' cb-glyph--emoji' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}
