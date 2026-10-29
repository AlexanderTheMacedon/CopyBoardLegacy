import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useCaptureSpace, useOpenFolder, usePreview } from '../../app/context';
import { Icon, type IconName } from '../../components/Icon';
import { codeLanguages } from '../composer/codemirror';
import { studios } from '../items/studio';
import { focusCapture, pickCaptureFiles } from './SmartCapture';
import { useCapture } from './useCapture';
import { useCreateItem, type CreateSpec } from './useCreateDocument';

// "Neu erstellen" as an app grid (Run D.1): one squircle tile per studio and capture flow, in the studio's own colour.
// The same grid fills the floating launcher of the capture dock's plus and the "Neu erstellen" sheet (dock, context menu,
// folder window, mobile dock), so every entry point offers the same apps in the same places.

type AppId = 'document' | 'text' | 'markdown' | 'code' | 'recording' | 'import' | 'note';

interface App {
  readonly id: AppId;
  readonly label: string;
  readonly hint: string;
  readonly icon: IconName;
  /** Wide tiles span the whole row (a quieter, horizontal tile). */
  readonly wide?: boolean;
}

const apps: readonly App[] = [
  { id: 'document', label: 'Dokument', hint: studios.document.name, icon: studios.document.icon },
  { id: 'text', label: 'Klartext', hint: 'Reiner Text', icon: studios.text.icon },
  { id: 'markdown', label: 'Markdown', hint: 'Mit Live-Vorschau', icon: studios.markdown.icon },
  { id: 'code', label: 'Code', hint: studios.code.name, icon: studios.code.icon },
  { id: 'recording', label: 'Sprachaufnahme', hint: 'Recorder', icon: 'mic' },
  { id: 'import', label: 'Bild/Datei importieren', hint: 'Vom Gerät', icon: 'tray' },
  { id: 'note', label: 'Schnellnotiz', hint: 'In der Eingabeleiste schreiben', icon: 'note', wide: true },
];

/** "In „Space › Ordner“": where "Neu erstellen" stores what it makes (open folder, else the capture space's board). */
export function useCreateTarget(): string {
  const space = useCaptureSpace();
  const folder = useOpenFolder();
  return space ? (folder && folder.spaceId === space.id ? `${space.name} › ${folder.name}` : space.name) : '';
}

/** The language last picked for new code in this session. */
let lastLanguage = 'typescript';

/**
 * How the grid's container closes: the sheet closes before an editor opens (a closing modal returns focus to its opener
 * first); the launcher stays open while the new item is being stored and closes only once it is saved.
 */
export type AppGridHost = 'sheet' | 'launcher';

interface AppGridProps {
  readonly host: AppGridHost;
  /** `returnFocus: false` when the chosen app takes focus itself (editor, capture field, file picker, recorder). */
  readonly onClose: (returnFocus: boolean) => void;
  readonly labelledBy?: string;
}

/** Arrow keys move through the tiles row by row, like a launcher; Home/End jump to the first and last app. */
function onGridKeys(event: KeyboardEvent<HTMLUListElement>) {
  const tiles = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.cb-app-tile__main:not(:disabled)')];
  const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
  let next = index;
  if (event.key in step) next = Math.max(0, Math.min(tiles.length - 1, index + (step[event.key] ?? 0)));
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tiles.length - 1;
  else return;
  event.preventDefault();
  tiles[next]?.focus();
}

export function AppGrid({ host, onClose, labelledBy }: AppGridProps) {
  const { dispatch } = usePreview();
  const create = useCreateItem();
  const capture = useCapture();
  const [busy, setBusy] = useState<AppId | null>(null);
  const [language, setLanguage] = useState(lastLanguage);

  // an editor app: stored first, opened only once the commit succeeded; a failed save announces itself and opens nothing
  const make = async (id: AppId, spec: CreateSpec) => {
    if (busy) return;
    setBusy(id);
    if (host === 'sheet') {
      onClose(false);
      void create(spec);
      return;
    }
    const ok = await create(spec);
    setBusy(null);
    if (ok) onClose(false);
  };

  const pick = (app: App) => {
    switch (app.id) {
      case 'document':
      case 'text':
      case 'markdown':
        return void make(app.id, { kind: app.id });
      case 'code':
        lastLanguage = language;
        return void make('code', { kind: 'code', language });
      case 'recording':
        onClose(false);
        return dispatch({ type: 'setRecorderOpen', open: true });
      case 'import':
        return pickCaptureFiles((files) => {
          onClose(false);
          void capture({ files, text: '', html: '' });
        });
      case 'note':
        onClose(false);
        return void requestAnimationFrame(focusCapture);
    }
  };

  return (
    <ul className="cb-app-grid" aria-labelledby={labelledBy} onKeyDown={onGridKeys}>
      {apps.map((app, i) => (
        <li
          key={app.id}
          className="cb-app-tile cb-create__tile"
          data-kind={app.id}
          data-studio={app.id}
          data-wide={app.wide || undefined}
          data-busy={busy === app.id || undefined}
          style={{ '--i': i } as CSSProperties}
        >
          <button type="button" className="cb-app-tile__main cb-create__main" disabled={!!busy} aria-busy={busy === app.id || undefined} onClick={() => pick(app)}>
            <span className="cb-studio-glyph cb-studio-glyph--lg cb-app-tile__glyph" aria-hidden="true">
              <Icon name={app.icon} size={app.wide ? 18 : 24} />
            </span>
            <span className="cb-app-tile__text">
              <span className="cb-app-tile__label">{app.label}</span>
              {app.id !== 'code' && <span className="cb-app-tile__hint">{app.hint}</span>}
            </span>
          </button>
          {app.id === 'code' && (
            <label className="cb-app-tile__language">
              <span className="cb-visually-hidden">Sprache für neuen Code</span>
              <select value={language} disabled={!!busy} onChange={(event) => setLanguage(event.target.value)}>
                {codeLanguages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={11} />
            </label>
          )}
        </li>
      ))}
    </ul>
  );
}

interface LauncherProps {
  /** Horizontal centre of the plus, relative to the composer dock: the launcher grows out of it. */
  readonly x: number;
  readonly closing: boolean;
  readonly onClose: (returnFocus: boolean) => void;
  /** The closing animation has ended: unmount. */
  readonly onExited: () => void;
  /** The plus that opened it (its own click toggles; it is not an "outside" press). */
  readonly trigger: () => HTMLElement | null;
}

/**
 * Floating app launcher above the capture dock: a non-modal glass panel with the app grid. Escape closes it and returns
 * focus to the plus; a press outside or focus moving elsewhere closes it quietly. It animates out before unmounting.
 */
export function AppLauncher({ x, closing, onClose, onExited, trigger }: LauncherProps) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useCreateTarget();

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.cb-app-tile__main')?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (closing) {
      // the animation's end unmounts it; the timer covers a browser that never reports it
      const timer = window.setTimeout(onExited, 400);
      return () => clearTimeout(timer);
    }
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!ref.current?.contains(node) && !trigger()?.contains(node)) onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [closing, onClose, onExited, trigger]);

  return (
    <div
      ref={ref}
      className="cb-launcher"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cb-launcher-title"
      data-state={closing ? 'closing' : 'open'}
      inert={closing}
      style={{ '--cb-launch-x': `${Math.round(x)}px` } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        // focus to nowhere (a file picker, the window) keeps it; focus moving to another control closes it
        if (!closing && next && !event.currentTarget.contains(next) && !trigger()?.contains(next)) onClose(false);
      }}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onExited();
      }}
    >
      <header className="cb-launcher__head">
        <h2 id="cb-launcher-title">Neu erstellen</h2>
        {target && <p className="cb-launcher__target">In „{target}“</p>}
      </header>
      <AppGrid host="launcher" labelledBy="cb-launcher-title" onClose={onClose} />
    </div>
  );
}
