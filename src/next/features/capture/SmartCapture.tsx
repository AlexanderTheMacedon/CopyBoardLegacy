import { useState, type DragEvent } from 'react';
import { useActiveSpace, usePreview } from '../../app/context';
import { DemoBadge } from '../../components/DemoBadge';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';

export const CAPTURE_INPUT_ID = 'cb-capture-input';

/** Single capture entry for header toolbar and mobile dock (D-020/D-030: no second capture logic). */
export function focusCapture() {
  const input = document.getElementById(CAPTURE_INPUT_ID);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

type CaptureState = 'rest' | 'focus' | 'drag';

const pasteHint = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Strg V');

/**
 * Smart Capture Bar (D-003, DS-C07, M-03). Demo: text stays in this component only, nothing is saved, dropped files are
 * never read. `data-state` exposes rest/focus/drag; the drop zone and the action row stay mounted and only expand, so the
 * input never remounts and the caret never jumps (SM-10).
 */
export function SmartCapture() {
  const { dispatch, notify } = usePreview();
  const space = useActiveSpace();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const captureState: CaptureState = dragging ? 'drag' : focused || text ? 'focus' : 'rest';

  const onDragOver = (event: DragEvent) => {
    // Accept the gesture visually; preventDefault also stops the browser from opening dropped files.
    event.preventDefault();
    if (!dragging) setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    // Intentionally no access to event.dataTransfer: the preview never reads dropped content.
    notify('Demo: Abgelegte Dateien werden in der Vorschau nicht übernommen.');
  };

  return (
    <section
      className="cb-capture"
      data-state={captureState}
      aria-labelledby="cb-capture-title"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <h2 id="cb-capture-title" className="cb-visually-hidden">
        Smart Capture
      </h2>
      <div className="cb-capture__field">
        <span className="cb-capture__lead" aria-hidden="true">
          <Icon name="plus" size={18} />
        </span>
        <label htmlFor={CAPTURE_INPUT_ID} className="cb-visually-hidden">
          {space ? `Inhalt für ${space.name} erfassen` : 'Inhalt erfassen'}
        </label>
        <textarea
          id={CAPTURE_INPUT_ID}
          className="cb-capture__input"
          // One row; height is driven by CSS (min-height transition + field-sizing), so expanding never jumps.
          rows={1}
          placeholder={space ? `In „${space.name}“ schreiben, einfügen oder ablegen …` : 'Schreiben, einfügen oder ablegen …'}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-describedby="cb-capture-hint"
        />
        <div className="cb-capture__tools">
          <span className="cb-capture__kbd" aria-hidden="true">
            <kbd className="cb-kbd">{pasteHint()}</kbd> einfügen
          </span>
          <IconButton icon="paperclip" label="Anhang hinzufügen (Demo)" onClick={() => notify('Demo: Anhänge sind in der Vorschau nicht verfügbar.')} />
          <IconButton icon="mic" label="Aufnahme öffnen (Demo)" onClick={() => dispatch({ type: 'setRecorderOpen', open: true })} />
        </div>
      </div>
      <div className="cb-capture__reveal" data-open={dragging || undefined}>
        <div>
          <div className="cb-capture__dropzone" aria-hidden={!dragging}>
            <Icon name="inbox" size={22} />
            <span>Hier ablegen – in der Vorschau werden keine Dateien übernommen</span>
          </div>
        </div>
      </div>
      <div className="cb-capture__reveal" data-open={captureState === 'focus' || undefined}>
        <div>
          <div className="cb-capture__actions">
            <p id="cb-capture-hint" className="cb-capture__hint">
              <DemoBadge /> Wird nicht gespeichert
            </p>
            <button
              type="button"
              className="cb-button cb-button--primary"
              disabled={!text.trim()}
              onClick={() => notify('Demo: Erfassen ist in der Vorschau nicht verfügbar. Es wurde nichts gespeichert.')}
            >
              Hinzufügen
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
