import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoticeRegion, type Notice } from '../../src/next/features/shell/NoticeRegion';

// Run D.2.1: one notice system; tone and undo are told apart by glyph and state, the undo window by its own timeout.

const render = (notice: Notice | null, duration = 6000) => renderToStaticMarkup(<NoticeRegion notice={notice} duration={duration} onDismiss={() => {}} />);

describe('notices', () => {
  it('tells success, error and undoable actions apart', () => {
    const success = render({ id: 1, message: 'Kopiert', tone: 'success' }, 4200);
    expect(success).toContain('data-tone="success"');
    expect(success).toContain('data-icon="check"');
    expect(success).not.toContain('data-undo');
    expect(success).toContain('--cb-notice-ms:4200ms');

    const error = render({ id: 2, message: 'Fehlgeschlagen', tone: 'error' });
    expect(error).toContain('data-tone="error"');
    expect(error).toContain('data-icon="alert"');

    const undo = render({ id: 3, message: 'Gelöscht', tone: 'success', action: { label: 'Rückgängig', run: () => {} } });
    expect(undo).toContain('data-undo=""');
    expect(undo).toContain('data-icon="undo"');
    expect(undo).toContain('>Rückgängig</button>');
  });

  it('keeps the live region mounted without a notice', () => {
    expect(render(null)).toBe('<div class="cb-notice-region" role="status" aria-live="polite"></div>');
  });
});
