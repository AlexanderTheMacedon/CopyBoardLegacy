import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useCaptureSpace, usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { readTransfer } from '../../data/clipboard';
import { useCapture } from './useCapture';

export const CAPTURE_INPUT_ID = 'cb-capture-input';
const FILE_INPUT_ID = 'cb-capture-file';

/** Single capture entry for header toolbar, context menu and mobile dock (D-020/D-030: no second capture logic). */
export function focusCapture() {
  const input = document.getElementById(CAPTURE_INPUT_ID);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

/** Opens the system file picker of the capture bar. */
export const pickFiles = () => document.getElementById(FILE_INPUT_ID)?.click();

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Smart Capture Bar (D-003, DS-C07, M-03): optional. Universal Paste works without ever focusing it. Text typed here is
 * saved with "Hinzufügen" (or ⌘/Strg+Enter); pasted images and files go straight to the board, pasted text lands in the
 * field as usual. The action row stays mounted and only expands, so the input never remounts (SM-10).
 */
export function SmartCapture() {
  const { dispatch } = usePreview();
  const space = useCaptureSpace();
  const capture = useCapture();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = focused || !!text;

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    const saved = await capture({ files: [], text, html: '' });
    setSaving(false);
    if (saved) setText('');
  };

  // Binary clipboard content cannot live in a text field: capture it directly. Text keeps the native paste.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = readTransfer(event.clipboardData);
    if (!raw.files.length || raw.text.trim()) return;
    event.preventDefault();
    void capture(raw);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape' && !text) {
      event.currentTarget.blur();
    }
  };

  return (
    <section className="cb-capture" data-state={open ? 'focus' : 'rest'} aria-labelledby="cb-capture-title">
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
          placeholder={space ? `Notiz für „${space.name}“ schreiben …` : 'Notiz schreiben …'}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          aria-describedby="cb-capture-hint"
        />
        <div className="cb-capture__tools">
          <span className="cb-capture__kbd" aria-hidden="true">
            <kbd className="cb-kbd">{isMac() ? '⌘V' : 'Strg V'}</kbd> überall
          </span>
          <IconButton icon="paperclip" label="Dateien hinzufügen" onClick={() => fileRef.current?.click()} />
          <IconButton icon="mic" label="Aufnahme öffnen" onClick={() => dispatch({ type: 'setRecorderOpen', open: true })} />
        </div>
        <input
          ref={fileRef}
          id={FILE_INPUT_ID}
          className="cb-visually-hidden"
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length) void capture({ files, text: '', html: '' });
          }}
        />
      </div>
      <div className="cb-capture__reveal" data-open={open || undefined}>
        <div>
          <div className="cb-capture__actions">
            <p id="cb-capture-hint" className="cb-capture__hint">
              {space ? `Wird lokal in „${space.name}“ gespeichert` : 'Wird lokal gespeichert'}
              <span aria-hidden="true"> · {isMac() ? '⌘' : 'Strg'}↵</span>
            </p>
            <button type="button" className="cb-button cb-button--primary" disabled={!text.trim() || saving} onClick={() => void submit()}>
              Hinzufügen
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
