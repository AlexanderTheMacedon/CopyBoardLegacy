import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useCaptureSpace, useOpenFolder, usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { readTransfer } from '../../data/clipboard';
import { useCapture } from './useCapture';
import { useCreateDocument } from './useCreateDocument';

export const CAPTURE_INPUT_ID = 'cb-capture-input';
const FILE_INPUT_ID = 'cb-capture-file';

/** Single capture entry for header toolbar, context menu and mobile dock (D-020/D-030: no second capture logic). The
 *  composer floats at the bottom of the viewport, so focusing it never scrolls the board. */
export function focusCapture() {
  document.getElementById(CAPTURE_INPUT_ID)?.focus({ preventScroll: true });
}

/** The system file picker for captures elsewhere (e.g. "Neu erstellen"): a transient input, so it works while the bar is hidden. */
export function pickCaptureFiles(onFiles: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    if (files.length) onFiles(files);
  });
  input.click();
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Smart Capture Bar (D-003, DS-C07, M-03), shown as the Bottom Floating Composer (ComposerDock): optional, Universal
 * Paste works without ever focusing it. While a folder window is open it names that folder as the target. Text typed here is
 * saved with "Hinzufügen" (or ⌘/Strg+Enter); pasted images and files go straight to the board, pasted text lands in the
 * field as usual. The action row stays mounted and only expands, so the input never remounts (SM-10).
 */
export function SmartCapture() {
  const { dispatch } = usePreview();
  const space = useCaptureSpace();
  const folder = useOpenFolder();
  const target = folder && space && folder.spaceId === space.id ? folder.name : space?.name;
  const capture = useCapture();
  const createDocument = useCreateDocument();
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
    <section className="cb-capture" data-state={open ? 'focus' : 'rest'} data-target={folder ? 'folder' : undefined} aria-labelledby="cb-capture-title">
      <h2 id="cb-capture-title" className="cb-visually-hidden">
        Smart Capture
      </h2>
      <div className="cb-capture__field">
        <span className="cb-capture__lead" aria-hidden="true">
          <Icon name={folder ? 'folderInput' : 'plus'} size={18} />
        </span>
        <label htmlFor={CAPTURE_INPUT_ID} className="cb-visually-hidden">
          {target ? `Inhalt für ${target} erfassen` : 'Inhalt erfassen'}
        </label>
        <textarea
          id={CAPTURE_INPUT_ID}
          className="cb-capture__input"
          // One row; height is driven by CSS (min-height transition + field-sizing), so expanding never jumps.
          rows={1}
          placeholder={target ? `Notiz für „${target}“ schreiben …` : 'Notiz schreiben …'}
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
          <IconButton icon="fileText" label="Neues Dokument" onClick={() => void createDocument()} />
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
              {space ? `Wird lokal in „${folder && folder.spaceId === space.id ? `${space.name} › ${folder.name}` : space.name}“ gespeichert` : 'Wird lokal gespeichert'}
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
