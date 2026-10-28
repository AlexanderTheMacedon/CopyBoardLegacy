import { useState, type CSSProperties, type ReactNode } from 'react';
import { useCaptureSpace, useOpenFolder, usePreview } from '../../app/context';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { codeLanguages } from '../composer/codemirror';
import { focusCapture, pickCaptureFiles } from './SmartCapture';
import { useCapture } from './useCapture';
import { useCreateItem, type CreateSpec } from './useCreateDocument';

interface Choice {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: IconName;
  /** Tile tint (a palette colour token), so the kinds read apart at a glance. */
  readonly tint: string;
}

const editors: (Choice & { readonly spec: Exclude<CreateSpec, { kind: 'code' }> })[] = [
  { id: 'document', label: 'Dokument', hint: 'Formatierter Text im Schreibstudio', icon: 'fileText', tint: 'var(--cb-p-iris)', spec: { kind: 'document' } },
  { id: 'text', label: 'Klartext', hint: 'Reiner Text, Zeichen für Zeichen gespeichert', icon: 'text', tint: 'var(--cb-p-periwinkle)', spec: { kind: 'text' } },
  { id: 'markdown', label: 'Markdown', hint: 'Quelltext mit Live-Vorschau', icon: 'hash', tint: 'var(--cb-p-lilac)', spec: { kind: 'markdown' } },
];

/** The language last picked for new code in this session. */
let lastLanguage = 'typescript';

const tint = (c: string) => ({ '--tile': c }) as CSSProperties;

/**
 * "Neu erstellen": one central entry for new content (dock plus, board and folder context menu, folder window). Editable
 * items are created in the current space or open folder, saved, and opened in their editor; voice recording and file
 * import hand over to the existing recorder and capture flows. Nothing is shown as created before it is stored.
 */
export function CreateForm({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const { dispatch } = usePreview();
  const space = useCaptureSpace();
  const folder = useOpenFolder();
  const create = useCreateItem();
  const capture = useCapture();
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState(lastLanguage);
  const target = space ? (folder && folder.spaceId === space.id ? `${space.name} › ${folder.name}` : space.name) : '';

  // The sheet closes first: closing a modal returns focus to its opener, which must happen before the new editor takes
  // focus. A failed save announces itself and opens nothing.
  const make = (spec: CreateSpec) => {
    if (busy) return;
    setBusy(true);
    onClose();
    void create(spec);
  };

  const tile = (choice: Choice, onClick: () => void, extra?: ReactNode) => (
    <li key={choice.id} className="cb-create__tile" data-kind={choice.id} style={tint(choice.tint)}>
      <button type="button" className="cb-create__main" disabled={busy} onClick={onClick}>
        <span className="cb-create__glyph" aria-hidden="true">
          <Icon name={choice.icon} size={20} />
        </span>
        <span className="cb-create__text">
          <span className="cb-create__label">{choice.label}</span>
          <span className="cb-create__hint">{choice.hint}</span>
        </span>
      </button>
      {extra}
    </li>
  );

  return (
    <div className="cb-card-dialog cb-create" data-wide="">
      <header className="cb-card-dialog__header">
        <div>
          <p className="cb-card-dialog__eyebrow">{target ? `In „${target}“` : 'Neu'}</p>
          <h2 id={titleId}>Neu erstellen</h2>
        </div>
        <IconButton icon="x" label="Schließen" onClick={onClose} />
      </header>
      <div className="cb-card-dialog__body cb-scroll">
        <h3 className="cb-create__group">Schreiben</h3>
        <ul className="cb-create__grid">
          {editors.map((choice) => tile(choice, () => void make(choice.spec)))}
          {tile(
            { id: 'code', label: 'Code', hint: 'Mit Hervorhebung und Vorschlägen', icon: 'code', tint: 'var(--cb-p-orange)' },
            () => {
              lastLanguage = language;
              void make({ kind: 'code', language });
            },
            <label className="cb-select cb-create__language">
              <span className="cb-visually-hidden">Sprache für neuen Code</span>
              <select value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value)}>
                {codeLanguages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>,
          )}
        </ul>
        <h3 className="cb-create__group">Erfassen</h3>
        <ul className="cb-create__grid">
          {tile({ id: 'note', label: 'Schnellnotiz', hint: 'In der Eingabeleiste, oder überall einfügen', icon: 'plus', tint: 'var(--cb-p-amber)' }, () => {
            onClose();
            requestAnimationFrame(focusCapture);
          })}
          {tile({ id: 'recording', label: 'Sprachaufnahme', hint: 'Öffnet den Recorder', icon: 'mic', tint: 'var(--cb-p-rust)' }, () => {
            onClose();
            dispatch({ type: 'setRecorderOpen', open: true });
          })}
          {tile({ id: 'import', label: 'Datei importieren', hint: 'Bilder, Audio und Dateien vom Gerät', icon: 'paperclip', tint: 'var(--cb-p-orchid)' }, () =>
            pickCaptureFiles((files) => {
              onClose();
              void capture({ files, text: '', html: '' });
            }),
          )}
        </ul>
      </div>
    </div>
  );
}
