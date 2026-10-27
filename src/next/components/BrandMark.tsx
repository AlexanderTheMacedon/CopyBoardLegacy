import { BrandLogo } from './BrandLogo';

/** CopyBoard brand control: the logo on a lit glass puck. Decorative; the surrounding control carries the name. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="cb-brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <span className="cb-brand-mark__glow" />
      <BrandLogo width={Math.round(size * 0.66)} />
    </span>
  );
}
