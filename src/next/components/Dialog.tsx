import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePresence } from './motion';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  /** Layout variant; styling lives in components.css. */
  variant: 'palette' | 'sheet' | 'drawer' | 'card';
  className?: string;
  children: ReactNode;
}

/** Content stays mounted this long after closing so the panel can play its exit (`--cb-dur-exit`). */
const EXIT_MS = 200;

/**
 * Modal layer (IA-02 L4/L5) on the native <dialog>: top layer, focus containment, inert background and Escape come from the
 * platform. The dialog closes immediately (focus returns to the previously focused element at once); CSS keeps it rendered
 * for a short exit transition while the panel content stays mounted. Every opening mounts fresh content.
 */
export function Dialog({ open, onClose, labelledBy, variant, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  const content = usePresence(open ? session : undefined, EXIT_MS);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`cb-dialog cb-dialog--${variant}${className ? ` ${className}` : ''}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // Escape: let React state drive closing so the open prop never disagrees with the DOM.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself; clicks inside hit the panel.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {content.value !== undefined && (
        <div key={content.value} className="cb-dialog__panel" inert={content.leaving}>
          {children}
        </div>
      )}
    </dialog>
  );
}
