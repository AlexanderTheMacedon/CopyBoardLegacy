import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';

/** Shared toolbar parts for every Canvas editor: one button style, one grouping rhythm, one tooltip pattern. */

export interface ToolButtonProps {
  readonly icon: IconName;
  readonly label: string;
  /** Keyboard shortcut shown in the tooltip, e.g. "⌘B". */
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  /** Visible text next to the icon (rare: only where an icon alone is ambiguous). */
  readonly text?: string;
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
/** "⌘B" on macOS, "Strg+B" elsewhere. */
export const shortcutLabel = (shortcut: string): string => (isMac() ? shortcut : shortcut.replace('⌘', 'Strg+').replace('⇧', 'Umschalt+').replace('⌥', 'Alt+'));

export function ToolButton({ icon, label, shortcut, pressed, disabled, onClick, text }: ToolButtonProps) {
  const tip = shortcut ? `${label} (${shortcutLabel(shortcut)})` : label;
  return (
    <button
      type="button"
      className="cb-tool"
      aria-label={label}
      title={tip}
      aria-pressed={pressed}
      disabled={disabled}
      data-text={text ? '' : undefined}
      // the editor keeps its selection and focus: toolbar buttons never take focus from the writing surface on press
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
      {text && <span>{text}</span>}
    </button>
  );
}

export function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cb-tool-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export const ToolSeparator = () => <span className="cb-tool-sep" role="separator" aria-orientation="vertical" />;
