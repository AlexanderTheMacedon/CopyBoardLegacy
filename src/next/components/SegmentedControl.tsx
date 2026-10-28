import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { useGlider } from './motion';

export interface SegmentOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  /** Optional count shown after the label (filter chips). */
  readonly count?: number;
}

interface SegmentedControlProps<V extends string> {
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Show icons only; labels stay as accessible names and tooltips. */
  iconOnly?: boolean;
  size?: 'sm' | 'md';
  /** `segmented` = one glass track with a sliding thumb; `chips` = separate glass chips with a sliding accent pill. */
  variant?: 'segmented' | 'chips';
  className?: string;
}

/** Single choice as an ARIA radio group with roving tabindex, arrow-key navigation and a gliding selection thumb. */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  iconOnly = false,
  size = 'md',
  variant = 'segmented',
  className,
}: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const groupRef = useGlider<HTMLDivElement>('[aria-checked="true"]', [value, options.length]);
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = enabled.findIndex((o) => o.value === value);
    const nextIndex =
      event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (step ?? 0) + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    onChange(next.value);
    const button = refs.current[options.indexOf(next)];
    button?.focus();
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className={`cb-segmented cb-segmented--${size} cb-segmented--${variant}${className ? ` ${className}` : ''}`}
      onKeyDown={onKeyDown}
    >
      <span className="cb-glider" aria-hidden="true" />
      {options.map((option, index) => {
        const checked = option.value === value;
        const name = iconOnly ? option.label : option.count !== undefined ? `${option.label}, ${option.count}` : undefined;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={name}
            title={iconOnly ? option.label : undefined}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled}
            className="cb-segmented__option"
            style={{ '--i': index } as CSSProperties}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} size={size === 'sm' ? 16 : 18} />}
            {!iconOnly && <span>{option.label}</span>}
            {option.count !== undefined && (
              <span className="cb-segmented__count" aria-hidden="true">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
