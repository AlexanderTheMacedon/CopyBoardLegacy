import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PHONE_QUERY, useMediaQuery } from '../../app/hooks';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl, type SegmentOption } from '../../components/SegmentedControl';
import { isLocal, isTextual, type Item } from '../../domain/types';
import { kindIcon, kindLabel } from '../items/item-meta';
import { MarkdownPreview } from './MarkdownPreview';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';
const AUTOSAVE_MS = 500;

/**
 * Autosave for the user's own items: debounced, flushed on close, and the status only says "Gespeichert" after the local
 * commit. Synthetic fixtures are never written; their status says so.
 */
function useAutosave(item: Item | undefined, draft: string) {
  const { workspace } = usePreview();
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const latest = useRef({ item, draft, saved: item && isTextual(item) ? item.body : '' });
  latest.current.item = item;
  latest.current.draft = draft;
  const writable = !!item && isLocal(item) && isTextual(item);

  const flush = useRef(async () => {
    const { item: current, draft: body, saved } = latest.current;
    if (!current || !isTextual(current) || !isLocal(current) || body === saved) return;
    setSaveState('saving');
    try {
      await workspace.update({ ...current, body, updatedAt: new Date().toISOString() });
      latest.current.saved = body;
      setSaveState(latest.current.draft === body ? 'saved' : 'pending');
    } catch {
      setSaveState('error');
    }
  });

  useEffect(() => {
    if (!writable || draft === latest.current.saved) return;
    setSaveState('pending');
    const timer = setTimeout(() => void flush.current(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, writable]);

  // Closing the editor never drops the last keystrokes.
  useEffect(() => () => void flush.current(), []);

  return { writable, saveState };
}

const saveLabel: Record<SaveState, string> = {
  saved: 'Gespeichert',
  pending: 'Ungespeicherte Änderungen',
  saving: 'Speichert …',
  error: 'Speichern fehlgeschlagen',
};

export type ComposerMode = 'source' | 'preview' | 'split';

const modeOptions = (phone: boolean): SegmentOption<ComposerMode>[] => [
  { value: 'source', label: 'Quelltext', icon: 'code' },
  { value: 'preview', label: 'Vorschau', icon: 'eye' },
  // D-007: Split View on desktop; on phones only one editor surface at a time.
  { value: 'split', label: 'Split', icon: 'columns', disabled: phone },
];

const step = (i: number) => ({ '--i': i }) as CSSProperties;

/** Context Rail (D-010): belongs to the editor, not a second inspector. Its own ✕ is the only close control while open. */
function ContextRail({ onClose }: { onClose: () => void }) {
  return (
    <aside className="cb-rail" aria-labelledby="cb-rail-title">
      <div className="cb-rail__header" style={step(0)}>
        <h3 id="cb-rail-title">Kontext</h3>
        <IconButton icon="x" size="sm" label="Kontextleiste schließen" onClick={onClose} />
      </div>
      <section className="cb-rail__section" aria-labelledby="cb-rail-assets" style={step(1)}>
        <h4 id="cb-rail-assets">
          <Icon name="image" size={14} />
          Materialien
        </h4>
        <div className="cb-rail__slots" aria-hidden="true">
          <span className="cb-rail__slot">
            <Icon name="image" size={16} />
          </span>
          <span className="cb-rail__slot">
            <Icon name="file" size={16} />
          </span>
          <span className="cb-rail__slot">
            <Icon name="waveform" size={16} />
          </span>
        </div>
        <p className="cb-rail__empty">Screenshots, Dateien und Audio erscheinen hier in einem späteren Run.</p>
      </section>
      <section className="cb-rail__section" aria-labelledby="cb-rail-timeline" style={step(2)}>
        <h4 id="cb-rail-timeline">
          <Icon name="clock" size={14} />
          Timeline
        </h4>
        <div className="cb-rail__timeline" aria-hidden="true">
          <p className="cb-rail__moment">
            <time>00:00</time>
            <span />
          </p>
          <p className="cb-rail__moment">
            <time>--:--</time>
            <span />
          </p>
          <p className="cb-rail__moment">
            <time>--:--</time>
            <span />
          </p>
        </div>
        <p className="cb-rail__empty">Zeitmarken einer Sprach-Session folgen mit dem Recorder.</p>
      </section>
    </aside>
  );
}

/**
 * Hybrid editor (D-007, DS-C21, M-06): one document, three modes, own Context Rail. Closed only via ✕ in the top-right
 * corner. The user's own items autosave; synthetic examples stay a local draft and say so (D-028).
 */
export function Composer() {
  const { state, dispatch, library } = usePreview();
  const item = state.composerItemId ? library.getItem(state.composerItemId) : undefined;
  const phone = useMediaQuery(PHONE_QUERY);
  const initial = item && isTextual(item) ? item.body : '';
  const [draft, setDraft] = useState(initial);
  const [mode, setMode] = useState<ComposerMode>('split');
  const [railOpen, setRailOpen] = useState(!phone);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { writable, saveState } = useAutosave(item, draft);

  useEffect(() => titleRef.current?.focus(), []);

  if (!item) return null;
  const effectiveMode: ComposerMode = phone && mode === 'split' ? 'source' : mode;
  const dirty = draft !== initial;
  const showSource = effectiveMode !== 'preview';
  const showPreview = effectiveMode !== 'source';
  const status = writable ? saveLabel[saveState] : dirty ? 'Beispielinhalt – Änderungen werden nicht gespeichert' : 'Beispielinhalt';

  return (
    <section className="cb-composer" aria-labelledby="cb-composer-title" data-mode={effectiveMode} data-rail={railOpen || undefined}>
      <header className="cb-composer__header">
        <div className="cb-composer__heading">
          <p className="cb-composer__eyebrow">
            <Icon name={kindIcon[item.kind]} size={13} />
            {kindLabel[item.kind]}
          </p>
          <h2 id="cb-composer-title" ref={titleRef} tabIndex={-1}>
            {item.title}
          </h2>
        </div>
        <p className="cb-composer__status" role="status" data-state={writable ? saveState : 'example'}>
          <span className="cb-composer__status-dot" aria-hidden="true" />
          {status}
        </p>
        <SegmentedControl label="Editor-Modus" size="sm" options={modeOptions(phone)} value={effectiveMode} onChange={setMode} />
        {!railOpen && <IconButton icon="panelRight" label="Kontextleiste einblenden" className="cb-composer__rail-toggle" onClick={() => setRailOpen(true)} />}
        <IconButton icon="x" label="Editor schließen" className="cb-composer__close" onClick={() => dispatch({ type: 'closeComposer' })} />
      </header>
      <div className="cb-composer__body">
        <div className="cb-composer__panes">
          {showSource && (
            <div className="cb-composer__pane">
              <span className="cb-composer__pane-label" aria-hidden="true">
                <Icon name="code" size={12} />
                {kindLabel[item.kind]}
              </span>
              <label htmlFor="cb-composer-source" className="cb-visually-hidden">
                {kindLabel[item.kind]}-Quelltext
              </label>
              <textarea
                id="cb-composer-source"
                className="cb-composer__source"
                spellCheck={false}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
          )}
          {showPreview && (
            <div className="cb-composer__pane cb-composer__pane--preview" aria-label="Markdown-Vorschau" role="region">
              <span className="cb-composer__pane-label" aria-hidden="true">
                <Icon name="eye" size={12} />
                Vorschau
              </span>
              <MarkdownPreview source={draft} />
            </div>
          )}
        </div>
        {railOpen && <ContextRail onClose={() => setRailOpen(false)} />}
      </div>
    </section>
  );
}
