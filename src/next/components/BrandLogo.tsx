import { useId } from 'react';

// Geometry of the CopyBoard logo (docs/design/brand/copyboard-logo-original.svg, viewBox 72 × 41). Paths are unchanged; only the
// fill is themed. The aspect ratio is fixed by the viewBox, callers only choose the width.
const LOGO_PATHS = [
  'M37.5569 2.04585C38.4821 1.08338 39.7385 0.542663 41.0469 0.542664C46.9335 0.542664 52.4811 0.542667 57.9442 0.542678C68.932 0.542701 74.4342 14.3629 66.6646 22.4456L49.7407 40.0517C48.9637 40.86 47.6352 40.2875 47.6352 39.1444V23.6376L49.591 21.6029C51.145 19.9864 50.0444 17.2223 47.8468 17.2223H22.9684L37.5569 2.04585Z',
  'M33.0467 38.8142C32.1215 39.7767 30.8651 40.3174 29.5567 40.3174C23.6701 40.3174 18.1225 40.3174 12.6594 40.3174C1.67159 40.3173 -3.83061 26.4972 3.93897 18.4144L20.8629 0.808361C21.6399 8.48472e-05 22.9684 0.57254 22.9684 1.71562L22.9684 17.2223L21.0126 19.2571C19.4586 20.8737 20.5592 23.6377 22.7568 23.6377L47.6352 23.6376L33.0467 38.8142Z',
] as const;

const RATIO = 41 / 72;

/**
 * CopyBoard logo as inline SVG (no asset request). `tone="gradient"` paints both halves with the theme's brand gradient
 * (`--cb-logo-a` → `--cb-logo-b`); `tone="current"` uses `currentColor` for monochrome contexts.
 */
export function BrandLogo({ width = 32, tone = 'gradient', className }: { width?: number; tone?: 'gradient' | 'current'; className?: string }) {
  const gradientId = useId();
  const fill = tone === 'gradient' ? `url(#${gradientId})` : 'currentColor';
  return (
    <svg
      className={className ? `cb-logo ${className}` : 'cb-logo'}
      width={width}
      height={Math.round(width * RATIO * 100) / 100}
      viewBox="0 0 72 41"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {tone === 'gradient' && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="41" x2="72" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--cb-logo-a)" />
            <stop offset="1" stopColor="var(--cb-logo-b)" />
          </linearGradient>
        </defs>
      )}
      <path className="cb-logo__half cb-logo__half--a" d={LOGO_PATHS[0]} fill={fill} />
      <path className="cb-logo__half cb-logo__half--b" d={LOGO_PATHS[1]} fill={fill} />
    </svg>
  );
}
