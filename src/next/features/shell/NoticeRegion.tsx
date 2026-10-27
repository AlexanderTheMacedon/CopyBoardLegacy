import type { NoticeOptions } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';

export interface Notice extends NoticeOptions {
  readonly id: number;
  readonly message: string;
}

const toneIcon = { info: 'info', success: 'check', error: 'info' } as const;

/**
 * Polite live region for status notices (DS-C32). A `success` notice only follows a confirmed local commit; errors and
 * unavailable features say so plainly (Truthful Status Contract, Blueprint 04 §5.2).
 */
export function NoticeRegion({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  const tone = notice?.tone ?? 'info';
  return (
    <div className="cb-notice-region" role="status" aria-live="polite">
      {notice && (
        // Keyed by id so a repeated message is announced again.
        <div key={notice.id} className="cb-notice" data-tone={tone}>
          <span className="cb-notice__icon" aria-hidden="true">
            <Icon name={toneIcon[tone]} size={16} />
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
