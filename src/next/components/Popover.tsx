import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface PopoverProps {
  /** Accessible name and tooltip of the trigger; must contain any visible trigger text. */
  label: string;
  /** Short custom tooltip (`data-tip`, styled by the surface that hosts the trigger); replaces the native title. */
  tip?: string;
  icon: IconName;
  iconSize?: number;
  /** Optional visible trigger text next to the icon. */
  text?: string;
  textClassName?: string;
  placement?: 'bottom-end' | 'top-start' | 'right-end';
  triggerClassName?: string;
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}

/** Non-modal popover (IA-02 L3): expands from its trigger; Escape and outside click close it and return focus. */
export function Popover({
  label,
  tip,
  icon,
  iconSize = 20,
  text,
  textClassName,
  placement = 'bottom-end',
  triggerClassName,
  panelClassName,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('[aria-checked="true"], button, [tabindex="0"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="cb-popover" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? 'cb-icon-button cb-icon-button--ghost cb-icon-button--md'}
        aria-label={label}
        title={tip ? undefined : label}
        data-tip={tip}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={icon} size={iconSize} />
        {text && <span className={textClassName}>{text}</span>}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={label}
          className={`cb-popover__panel cb-popover__panel--${placement}${panelClassName ? ` ${panelClassName}` : ''}`}
        >
          {children(() => close())}
        </div>
      )}
    </div>
  );
}
