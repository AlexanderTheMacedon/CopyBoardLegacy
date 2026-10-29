import type { CSSProperties } from 'react';
import type { NoticeOptions } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';

export interface Notice extends NoticeOptions {
  readonly id: number;
  readonly message: string;
}

const toneIcon = { info: 'info', success: 'check', error: 'alert' } as const;

/**
 * Polite live region for status notices (DS-C32). A `success` notice only follows a confirmed local commit; errors and
 * unavailable features say so plainly (Truthful Status Contract, Blueprint 04 §5.2).
 */
export function NoticeRegion({ notice, duration, onDismiss }: { notice: Notice | null; duration: number; onDismiss: () => void }) {
  const tone = notice?.tone ?? 'info';
  return (
    <div className="cb-notice-region" role="status" aria-live="polite">
      {notice && (
        // Keyed by id so a repeated message is announced again. An undoable notice says so with its glyph and shows the
        // time left for its action (`--cb-notice-ms`, the same timeout that dismisses it).
        <div
          key={notice.id}
          className="cb-notice"
          data-tone={tone}
          data-undo={notice.action ? '' : undefined}
          style={{ '--cb-notice-ms': `${duration}ms` } as CSSProperties}
        >
          <span className="cb-notice__icon" aria-hidden="true">
            <Icon name={notice.action ? 'undo' : toneIcon[tone]} size={15} />
          </span>
          <p>{notice.message}</p>
          {notice.action && (
            <button
              type="button"
              className="cb-notice__action"
              onClick={() => {
                notice.action?.run();
                onDismiss();
              }}
            >
              {notice.action.label}
            </button>
          )}
          <IconButton icon="x" size="sm" label="Hinweis schließen" onClick={onDismiss} />
        </div>
      )}
    </div>
  );
}
