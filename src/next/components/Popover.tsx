import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /** Custom trigger content drawn instead of icon and text (e.g. a live colour sample); `label` stays the accessible name. */
  face?: ReactNode;
  textClassName?: string;
  placement?: 'bottom-end' | 'bottom-start' | 'top-start' | 'right-end' | 'left-center';
  disabled?: boolean;
  triggerClassName?: string;
  /** Marks the trigger as carrying an active state (`data-active`), e.g. a filter that is applied. */
  active?: boolean;
  panelClassName?: string;
  /**
   * Render the panel in the app's floating layer (a portal into `.cb-app`, fixed at the trigger, kept inside the viewport)
   * instead of inside the trigger's box. Needed wherever the trigger lives in a stacking context of its own, such as a card
   * in the grid: there an in-place panel would paint below the next card.
   */
  layer?: boolean;
  /** `close(false)` leaves focus where the action put it (e.g. back in an editor) instead of returning it to the trigger. */
  children: (close: (returnFocus?: boolean) => void) => ReactNode;
}

const EDGE = 8;
const GAP = 8;

/** Fixed position of a layered panel next to its trigger: preferred placement first, flipped or clamped at the viewport. */
function layerPosition(trigger: DOMRect, panel: { width: number; height: number }, placement: NonNullable<PopoverProps['placement']>): CSSProperties {
  const maxLeft = window.innerWidth - panel.width - EDGE;
  const maxTop = window.innerHeight - panel.height - EDGE;
  if (placement === 'left-center') {
    // beside a vertical dock: the panel hangs off the trigger's left edge, centred on it, and grows out of that edge
    const left = Math.max(EDGE, trigger.left - GAP * 1.5 - panel.width);
    const top = Math.max(EDGE, Math.min(trigger.top + trigger.height / 2 - panel.height / 2, maxTop));
    const originY = Math.max(0, Math.min(panel.height, trigger.top + trigger.height / 2 - top));
    return { left, top, transformOrigin: `right ${originY}px` };
  }
  const below = placement === 'bottom-end' || placement === 'bottom-start';
  let left = placement === 'bottom-end' ? trigger.right - panel.width : placement === 'top-start' || placement === 'bottom-start' ? trigger.left : trigger.right + GAP;
  let top = below ? trigger.bottom + GAP : placement === 'top-start' ? trigger.top - GAP - panel.height : trigger.bottom - panel.height;
  let originY = below ? 'top' : 'bottom';
  if (below && top > maxTop && trigger.top - GAP - panel.height >= EDGE) {
    top = trigger.top - GAP - panel.height;
    originY = 'bottom';
  } else if (placement === 'top-start' && top < EDGE && trigger.bottom + GAP <= maxTop) {
    top = trigger.bottom + GAP;
    originY = 'top';
  }
  left = Math.max(EDGE, Math.min(left, maxLeft));
  top = Math.max(EDGE, Math.min(top, maxTop));
  const originX = Math.max(0, Math.min(panel.width, trigger.left + trigger.width / 2 - left));
  return { left, top, transformOrigin: `${originX}px ${originY}` };
}

/** Non-modal popover (IA-02 L3): expands from its trigger; Escape and outside click close it and return focus. */
export function Popover({
  label,
  tip,
  icon,
  iconSize = 20,
  text,
  textClassName,
  face,
  placement = 'bottom-end',
  disabled,
  triggerClassName,
  active,
  panelClassName,
  layer = false,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [layerStyle, setLayerStyle] = useState<CSSProperties | null>(null);
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
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    // A layered panel is pinned to the viewport: it leaves once its trigger really moved away under it (scrolling, resize).
    // Scroll events that leave the trigger in place (focus nudges, scrolls inside the panel) keep it open.
    const anchor = triggerRef.current?.getBoundingClientRect();
    const dismiss = () => {
      const now = triggerRef.current?.getBoundingClientRect();
      if (!anchor || !now || Math.abs(now.top - anchor.top) > 1 || Math.abs(now.left - anchor.left) > 1) setOpen(false);
    };
    if (layer) {
      document.addEventListener('scroll', dismiss, true);
      window.addEventListener('resize', dismiss);
    }
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
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open, layer]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!open || !layer || !panel || !trigger) {
      setLayerStyle(null);
      return;
    }
    setLayerStyle(layerPosition(trigger.getBoundingClientRect(), { width: panel.offsetWidth, height: panel.offsetHeight }, placement));
  }, [open, layer, placement]);

  const panel = open && (
    <div
      ref={panelRef}
      id={panelId}
      role="group"
      aria-label={label}
      className={`cb-popover__panel cb-popover__panel--${layer ? 'layer' : placement}${panelClassName ? ` ${panelClassName}` : ''}`}
      style={layer ? (layerStyle ?? { opacity: 0 }) : undefined}
    >
      {children((returnFocus = true) => close(returnFocus))}
    </div>
  );
  const host = layer && open ? (triggerRef.current?.closest('.cb-app') ?? document.body) : null;

  return (
    <div className="cb-popover" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? 'cb-icon-button cb-icon-button--ghost cb-icon-button--md'}
        aria-label={label}
        title={tip ? undefined : label}
        data-tip={tip}
        data-active={active || undefined}
        aria-expanded={open}
        disabled={disabled}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {face ?? (
          <>
            <Icon name={icon} size={iconSize} />
            {text && <span className={textClassName}>{text}</span>}
          </>
        )}
      </button>
      {host ? createPortal(panel, host) : panel}
    </div>
  );
}
