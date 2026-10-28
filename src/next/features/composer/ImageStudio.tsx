import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { PHONE_QUERY, useMediaQuery } from '../../app/hooks';
import { Icon } from '../../components/Icon';
import { SegmentedControl, type SegmentOption } from '../../components/SegmentedControl';
import { writeImageToClipboard } from '../../data/clipboard';
import { canEncodeWebp, decodeImage, extensionOf, ImageRenderError, renderImageFile, renderInto, type ExportType, type ImageSource } from '../../data/image-render';
import {
  ADJUSTMENTS,
  aspectRatio,
  commitHistory,
  CROP_ASPECTS,
  dragCrop,
  FILTERS,
  fitCropToAspect,
  flipEdits,
  identityEdits,
  isGeometryIdentity,
  isIdentityEdits,
  normalizeImageEdits,
  orientedSize,
  redoHistory,
  rotateEdits,
  startHistory,
  STRAIGHTEN_LIMIT,
  undoHistory,
  type CropAspect,
  type CropHandle,
  type EditHistory,
  type FilterId,
  type ImageAdjust,
  type ImageEdits,
} from '../../domain/image-edits';
import type { ImageItem } from '../../domain/types';
import { downloadBlob, safeFileName, type EditorHandle, type HistoryState } from './editor-types';
import { ToolButton, ToolGroup, ToolSeparator } from './Toolbar';

// Image studio (Run B): the fourth Canvas editor. It edits parameters, never pixels: the original asset is decoded once into a
// working copy for the live view; every save stores validated `ImageEdits`, every export renders original + edits afresh.

export type StudioTool = 'crop' | 'adjust' | 'filter';
export type StudioSection = 'crop' | 'adjust' | 'filter';

export interface ImageHandle extends EditorHandle {
  getEdits(): ImageEdits;
  apply(change: (edits: ImageEdits) => ImageEdits, group?: string): void;
  reset(section?: StudioSection): void;
}

/** Longest edge of the live working copy (the export always uses the full original). */
const WORK_EDGE = 2048;
const PHONE_WORK_EDGE = 1400;
const THUMB_EDGE = 112;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;

const toolOptions: SegmentOption<StudioTool>[] = [
  { value: 'crop', label: 'Zuschneiden', icon: 'crop' },
  { value: 'adjust', label: 'Anpassen', icon: 'sliders' },
  { value: 'filter', label: 'Filter', icon: 'sparkles' },
];

const exportOptions = (): SegmentOption<ExportType>[] => [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WebP', disabled: !canEncodeWebp() },
];

const sectionReset: Record<StudioSection, (e: ImageEdits) => ImageEdits> = {
  crop: (e) => {
    const base = identityEdits();
    return { ...e, crop: base.crop, aspect: base.aspect, turns: 0, flipH: false, flipV: false, straighten: 0 };
  },
  adjust: (e) => ({ ...e, adjust: identityEdits().adjust, mono: false }),
  filter: (e) => ({ ...e, filter: 'none', filterStrength: 100 }),
};

const fileBase = (title: string): string => title.replace(/\.(png|jpe?g|webp|gif|avif|heic)$/i, '');

// --- toolbar (rendered by the Canvas shell in its specialised slot) ---------------------------------------------------

interface ToolbarProps {
  readonly handle: ImageHandle | null;
  readonly tool: StudioTool;
  readonly onTool: (tool: StudioTool) => void;
  readonly compare: boolean;
  readonly onCompare: (on: boolean) => void;
  readonly zoom: number;
  readonly zoomPercent: number;
  readonly onZoom: (zoom: number) => void;
  readonly disabled: boolean;
}

export function ImageToolbar({ handle, tool, onTool, compare, onCompare, zoom, zoomPercent, onZoom, disabled }: ToolbarProps) {
  const zoomLocked = tool === 'crop' && !compare;
  return (
    <div className="cb-canvas-bar__set cb-studio-bar" role="toolbar" aria-label="Bildwerkzeuge">
      <SegmentedControl label="Werkzeug" size="sm" options={toolOptions} value={tool} onChange={onTool} className="cb-studio-bar__tools" />
      <ToolSeparator />
      <ToolGroup label="Ausrichten">
        <ToolButton icon="rotateLeft" label="90° nach links drehen" disabled={disabled || !handle} onClick={() => handle?.apply((e) => rotateEdits(e, -1))} />
        <ToolButton icon="rotateRight" label="90° nach rechts drehen" disabled={disabled || !handle} onClick={() => handle?.apply((e) => rotateEdits(e, 1))} />
        <ToolButton icon="flipH" label="Horizontal spiegeln" disabled={disabled || !handle} onClick={() => handle?.apply((e) => flipEdits(e, 'h'))} />
        <ToolButton icon="flipV" label="Vertikal spiegeln" disabled={disabled || !handle} onClick={() => handle?.apply((e) => flipEdits(e, 'v'))} />
      </ToolGroup>
      <ToolSeparator />
      <ToolGroup label="Ansicht">
        <ToolButton icon="compare" label="Vorher/Nachher vergleichen" shortcut="\" pressed={compare} disabled={!handle} onClick={() => onCompare(!compare)} />
        <ToolButton icon="minus" label="Verkleinern" shortcut="⌘−" disabled={zoomLocked || zoom <= ZOOM_MIN} onClick={() => onZoom(zoom / 1.25)} />
        <ToolButton icon="expand" label="Einpassen" shortcut="⌘0" text={`${zoomPercent} %`} pressed={zoom === 1} disabled={zoomLocked} onClick={() => onZoom(1)} />
        <ToolButton icon="plus" label="Vergrößern" shortcut="⌘+" disabled={zoomLocked || zoom >= ZOOM_MAX} onClick={() => onZoom(zoom * 1.25)} />
      </ToolGroup>
    </div>
  );
}

// --- controls ---------------------------------------------------------------------------------------------------------

interface SliderProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  /** Where the fill starts (0 for bipolar sliders). */
  readonly origin?: number;
  readonly onChange: (value: number) => void;
  readonly onActive?: (active: boolean) => void;
}

/** Premium range slider: fill from its neutral point, live value, double-click (or Backspace) back to neutral. */
function StudioSlider({ id, label, value, min, max, step = 1, unit = '', disabled, origin = 0, onChange, onActive }: SliderProps) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const from = Math.min(pct(origin), pct(value));
  const to = Math.max(pct(origin), pct(value));
  const shown = step < 1 ? value.toFixed(1) : String(Math.round(value));
  const signed = value > 0 && origin === 0 ? `+${shown}` : shown;
  return (
    <div className="cb-studio-slider" data-changed={value !== origin || undefined} style={{ '--from': `${from}%`, '--to': `${to}%`, '--at': `${pct(value)}%` } as CSSProperties}>
      <div className="cb-studio-slider__head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {signed}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(origin)}
        onKeyDown={(event) => {
          if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            onChange(origin);
          }
        }}
        onPointerDown={() => onActive?.(true)}
        onPointerUp={() => onActive?.(false)}
        onPointerCancel={() => onActive?.(false)}
        onBlur={() => onActive?.(false)}
      />
    </div>
  );
}

function SectionHead({ icon, title, onReset, canReset, disabled }: { icon: Parameters<typeof Icon>[0]['name']; title: string; onReset: () => void; canReset: boolean; disabled: boolean }) {
  return (
    <div className="cb-studio-panel__head">
      <h4>
        <Icon name={icon} size={14} />
        {title}
      </h4>
      <button type="button" className="cb-studio-reset" disabled={disabled || !canReset} onClick={onReset}>
        <Icon name="reset" size={13} />
        Zurücksetzen
      </button>
    </div>
  );
}

/** One filter look on the current picture (tiny canvas, rendered from a small copy of the working image). */
const FilterThumb = memo(function FilterThumb({ source, edits, id, label, active, disabled, onPick }: { source: ImageSource | null; edits: ImageEdits; id: FilterId; label: string; active: boolean; disabled: boolean; onPick: (id: FilterId) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!source || !ref.current) return;
    try {
      renderInto(ref.current, source, { ...edits, filter: id, filterStrength: active ? edits.filterStrength : 100 }, { maxEdge: THUMB_EDGE });
    } catch {
      // a thumbnail that cannot render simply stays empty
    }
  }, [source, edits, id, active]);
  return (
    <button type="button" className="cb-studio-filter" role="radio" aria-checked={active} disabled={disabled} onClick={() => onPick(id)}>
      <span className="cb-studio-filter__frame">
        <canvas ref={ref} aria-hidden="true" />
      </span>
      <span className="cb-studio-filter__label">{label}</span>
    </button>
  );
});

// --- crop overlay -----------------------------------------------------------------------------------------------------

const HANDLES: readonly CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const handleLabel: Record<CropHandle, string> = {
  move: 'Zuschnitt verschieben',
  n: 'Oberkante',
  s: 'Unterkante',
  e: 'Rechte Kante',
  w: 'Linke Kante',
  ne: 'Ecke oben rechts',
  nw: 'Ecke oben links',
  se: 'Ecke unten rechts',
  sw: 'Ecke unten links',
};

function CropOverlay({ edits, frame, disabled, straightening, onCrop }: { edits: ImageEdits; frame: { width: number; height: number }; disabled: boolean; straightening: boolean; onCrop: (crop: ImageEdits['crop'], group: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const gesture = useRef(0);
  const [dragging, setDragging] = useState(false);
  const ratio = aspectRatio(edits.aspect, frame);
  const { x, y, w, h } = edits.crop;

  const start = (handle: CropHandle) => (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0 || !box.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = box.current.getBoundingClientRect();
    const target = event.currentTarget;
    const startCrop = edits.crop;
    const sx = event.clientX;
    const sy = event.clientY;
    const group = `crop#${++gesture.current}`;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (e: PointerEvent) => onCrop(dragCrop(startCrop, handle, (e.clientX - sx) / rect.width, (e.clientY - sy) / rect.height, ratio, frame), group);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setDragging(false);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const d = event.shiftKey ? 0.05 : 0.01;
    const delta = ({ ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as Record<string, [number, number]>)[event.key];
    if (!delta || disabled) return;
    event.preventDefault();
    // arrows move the crop; with ⌥ they resize it from the bottom-right corner
    onCrop(dragCrop(edits.crop, event.altKey ? 'se' : 'move', delta[0], delta[1], ratio, frame), 'crop-keys');
  };

  return (
    <div ref={box} className="cb-crop" data-active={dragging || straightening || undefined} data-straighten={straightening || undefined}>
      <div
        className="cb-crop__rect"
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
        tabIndex={disabled ? -1 : 0}
        role="group"
        aria-label={`Zuschnitt ${Math.round(w * frame.width)} × ${Math.round(h * frame.height)} px. Pfeiltasten verschieben, mit Wahltaste Größe ändern.`}
        onPointerDown={start('move')}
        onKeyDown={onKeyDown}
      >
        <span className="cb-crop__grid" aria-hidden="true" />
        {!disabled &&
          HANDLES.map((handle) => (
            <span key={handle} className="cb-crop__handle" data-handle={handle} aria-hidden="true" title={handleLabel[handle]} onPointerDown={start(handle)} />
          ))}
        <span className="cb-crop__size" aria-hidden="true">
          {Math.round(w * frame.width)} × {Math.round(h * frame.height)}
        </span>
      </div>
    </div>
  );
}

// --- the studio -------------------------------------------------------------------------------------------------------

interface StudioProps {
  readonly item: ImageItem;
  readonly title: string;
  readonly readOnly: boolean;
  readonly tool: StudioTool;
  readonly compare: boolean;
  readonly zoom: number;
  readonly onZoom: (zoom: number) => void;
  readonly onZoomPercent: (percent: number) => void;
  readonly onCompare: (on: boolean) => void;
  readonly onChange: () => void;
  readonly onHistory: (state: HistoryState) => void;
  readonly onReady: (handle: ImageHandle | null) => void;
  readonly onExport: () => void;
  readonly exportType: ExportType;
  readonly onExportType: (type: ExportType) => void;
}

type Load = { state: 'loading' } | { state: 'ready'; source: ImageSource; thumb: ImageSource } | { state: 'error'; reason: string };

export function ImageStudio({ item, title, readOnly, tool, compare, zoom, onZoom, onZoomPercent, onCompare, onChange, onHistory, onReady, onExport, exportType, onExportType }: StudioProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [history, setHistory] = useState<EditHistory>(() => startHistory(normalizeImageEdits(item.edits)));
  const edits = history.present;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [straightening, setStraightening] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const live = useRef({ edits, title, readOnly, exportType });
  live.current = { edits, title, readOnly, exportType };
  const reported = useRef(edits);

  // decode the original once into a working copy (and a tiny one for the filter previews); the blob itself is never changed
  const asset = item.asset?.blob;
  useEffect(() => {
    let alive = true;
    let made: ImageSource[] = [];
    setLoad({ state: 'loading' });
    decodeImage(item, phone ? PHONE_WORK_EDGE : WORK_EDGE).then(
      (source) => {
        const thumb = document.createElement('canvas');
        const k = Math.min(1, (THUMB_EDGE * 2) / Math.max(source.width, source.height));
        thumb.width = Math.max(1, Math.round(source.width * k));
        thumb.height = Math.max(1, Math.round(source.height * k));
        thumb.getContext('2d')?.drawImage(source, 0, 0, thumb.width, thumb.height);
        made = [source];
        if (alive) setLoad({ state: 'ready', source, thumb });
        else if ('close' in source) source.close();
      },
      (error: unknown) => {
        if (alive)
          setLoad({
            state: 'error',
            reason: error instanceof ImageRenderError && error.reason === 'decode' ? 'Dieses Bildformat kann der Browser nicht dekodieren.' : 'Für dieses Bild reicht der Arbeitsspeicher nicht.',
          });
      },
    );
    return () => {
      alive = false;
      for (const s of made) if ('close' in s) s.close();
    };
    // the working copy depends only on the pixels (and the device class), not on title, tags or edits
  }, [asset, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // history → shell: undo state, and "something changed" for autosave (not for the initial state)
  useEffect(() => {
    onHistory({ canUndo: history.past.length > 0, canRedo: history.future.length > 0 });
  }, [history.past.length, history.future.length, onHistory]);
  useEffect(() => {
    if (reported.current === edits) return;
    reported.current = edits;
    onChange();
  }, [edits, onChange]);

  const commit = useCallback((next: ImageEdits, group?: string) => {
    if (live.current.readOnly) return;
    setHistory((h) => commitHistory(h, normalizeImageEdits(next), group, performance.now()));
  }, []);

  const handle = useMemo<ImageHandle>(
    () => ({
      undo: () => setHistory(undoHistory),
      redo: () => setHistory(redoHistory),
      focus: () => stageRef.current?.focus({ preventScroll: true }),
      getText: () => '',
      getEdits: () => live.current.edits,
      apply: (change, group) => commit(change(live.current.edits), group),
      reset: (section) => commit(section ? sectionReset[section](live.current.edits) : identityEdits()),
      exportBinary: async (type) => {
        const t = (type as ExportType | undefined) ?? live.current.exportType;
        const file = await renderImageFile(item, t, { edits: live.current.edits });
        const note = file.reduced ? `auf ${file.width} × ${file.height} px verkleinert (Browser-Grenze)` : undefined;
        return { name: safeFileName(fileBase(live.current.title), extensionOf(t)), mime: t, blob: file.blob, note };
      },
      copy: () => writeImageToClipboard(renderImageFile(item, 'image/png', { edits: live.current.edits }).then((r) => r.blob)),
    }),
    [commit, item],
  );
  useEffect(() => {
    onReady(handle);
    return () => onReady(null);
  }, [handle, onReady]);

  // --- live view ---
  const cropping = tool === 'crop' && !compare;
  const shown = useMemo(() => (compare ? identityEdits() : edits), [compare, edits]);
  useLayoutEffect(() => {
    if (load.state !== 'ready' || !canvasRef.current) return;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        renderInto(canvas, load.source, shown, { crop: !cropping });
        setCanvasSize((s) => (s.width === canvas.width && s.height === canvas.height ? s : { width: canvas.width, height: canvas.height }));
      } catch {
        setLoad({ state: 'error', reason: 'Für dieses Bild reicht der Arbeitsspeicher nicht.' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [load, shown, cropping]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const effZoom = cropping ? 1 : zoom;
  const pad = phone ? 16 : 40;
  const fit = canvasSize.width && stageSize.width ? Math.min((stageSize.width - pad) / canvasSize.width, (stageSize.height - pad) / canvasSize.height) : 0;
  const display = { width: Math.max(1, Math.round(canvasSize.width * fit * effZoom)), height: Math.max(1, Math.round(canvasSize.height * fit * effZoom)) };
  // percentage relative to the original's real pixels (the working copy may be smaller)
  const originalFrame = orientedSize(item.width, item.height, shown.turns);
  const realWidth = (cropping ? 1 : shown.crop.w) * originalFrame.width;
  const percent = realWidth ? Math.max(1, Math.round((display.width / realWidth) * 100)) : 100;
  useEffect(() => onZoomPercent(percent), [percent, onZoomPercent]);

  // pinch / ⌘-wheel zoom, drag to pan when zoomed in
  const onWheel = useCallback(
    (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || cropping) return;
      event.preventDefault();
      onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * Math.exp(-event.deltaY * 0.01))));
    },
    [zoom, onZoom, cropping],
  );
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || cropping || event.button !== 0 || (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight)) return;
    const sx = event.clientX + stage.scrollLeft;
    const sy = event.clientY + stage.scrollTop;
    stage.setPointerCapture(event.pointerId);
    stage.setAttribute('data-panning', '');
    const move = (e: PointerEvent) => stage.scrollTo(sx - e.clientX, sy - e.clientY);
    const up = () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      stage.removeAttribute('data-panning');
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) handle.redo();
      else handle.undo();
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      handle.redo();
    } else if (mod && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      onZoom(Math.min(ZOOM_MAX, zoom * 1.25));
    } else if (mod && event.key === '-') {
      event.preventDefault();
      onZoom(Math.max(ZOOM_MIN, zoom / 1.25));
    } else if (mod && event.key === '0') {
      event.preventDefault();
      onZoom(1);
    } else if (event.key === '\\' && !mod && target.tagName !== 'INPUT') {
      event.preventDefault();
      onCompare(!compare);
    }
  };

  // --- panel ---
  const frame = orientedSize(item.width, item.height, edits.turns);
  const setAspect = (aspect: CropAspect) => commit({ ...edits, aspect, crop: fitCropToAspect(edits.crop, aspectRatio(aspect, frame), frame) });
  const setAdjust = (key: keyof ImageAdjust, value: number) => commit({ ...edits, adjust: { ...edits.adjust, [key]: value } }, `adjust:${key}`);
  const pickFilter = useCallback((id: FilterId) => commit({ ...live.current.edits, filter: id, filterStrength: id === live.current.edits.filter ? live.current.edits.filterStrength : 100 }), [commit]);
  const thumbEdits = useDeferredValue(edits);
  const thumbSource = load.state === 'ready' ? load.thumb : null;
  const geometryEdited = !isGeometryIdentity(edits);
  const adjustEdited = ADJUSTMENTS.some((s) => edits.adjust[s.key] !== 0) || edits.mono;
  const filterEdited = edits.filter !== 'none';
  const edited = !isIdentityEdits(edits);

  const downloadOriginal = () => {
    if (item.asset) downloadBlob(item.title, item.asset.blob);
  };

  return (
    <div className="cb-studio" data-tool={tool} data-compare={compare || undefined} onKeyDown={onKeyDown}>
      <div
        ref={stageRef}
        className="cb-studio__stage"
        tabIndex={-1}
        data-zoomed={effZoom > 1 || undefined}
        aria-label="Bildvorschau"
        onPointerDown={onStagePointerDown}
        onDoubleClick={() => !cropping && onZoom(zoom === 1 ? 2 : 1)}
      >
        {load.state === 'loading' && (
          <div className="cb-studio__status" role="status">
            <span className="cb-studio__spinner" aria-hidden="true" />
            Bild wird geladen …
          </div>
        )}
        {load.state === 'error' && (
          <div className="cb-studio__status cb-studio__status--error" role="alert">
            <Icon name="image" size={28} />
            <p>{load.reason}</p>
            <p className="cb-studio__hint">Das Original bleibt unverändert gespeichert{item.asset ? ' und lässt sich weiterhin herunterladen' : ''}.</p>
            {item.asset && (
              <button type="button" className="cb-button" onClick={downloadOriginal}>
                <Icon name="download" size={15} />
                Original herunterladen
              </button>
            )}
          </div>
        )}
        <div className="cb-studio__frame" hidden={load.state !== 'ready'} style={{ width: display.width, height: display.height }} data-cropping={cropping || undefined}>
          <canvas ref={canvasRef} className="cb-studio__canvas" role="img" aria-label={compare ? `Original: ${item.alt}` : `Bearbeitet: ${item.alt}`} />
          {cropping && load.state === 'ready' && (
            <CropOverlay edits={edits} frame={frame} disabled={readOnly} straightening={straightening} onCrop={(crop, group) => commit({ ...live.current.edits, crop }, group)} />
          )}
          {compare && (
            <span className="cb-studio__badge" aria-hidden="true">
              Original
            </span>
          )}
        </div>
      </div>

      <aside className="cb-studio-panel" aria-label="Bildeinstellungen" data-phone={phone || undefined}>
        {tool === 'crop' && (
          <section className="cb-studio-panel__section" key="crop" aria-label="Zuschneiden und Ausrichten">
            <SectionHead icon="crop" title="Zuschneiden" canReset={geometryEdited} disabled={readOnly} onReset={() => handle.reset('crop')} />
            <div className="cb-studio-chips" role="radiogroup" aria-label="Seitenverhältnis">
              {CROP_ASPECTS.map((a) => (
                <button key={a.value} type="button" role="radio" className="cb-studio-chip" aria-checked={edits.aspect === a.value} disabled={readOnly} onClick={() => setAspect(a.value)}>
                  {a.value !== 'free' && a.value !== 'original' && (
                    <i aria-hidden="true" style={{ '--ar': a.value.replace(':', ' / ') } as CSSProperties} />
                  )}
                  {a.label}
                </button>
              ))}
            </div>
            <StudioSlider
              id="cb-studio-straighten"
              label="Geradeziehen"
              value={edits.straighten}
              min={-STRAIGHTEN_LIMIT}
              max={STRAIGHTEN_LIMIT}
              step={0.1}
              unit="°"
              disabled={readOnly}
              onActive={setStraightening}
              onChange={(v) => commit({ ...edits, straighten: v }, 'straighten')}
            />
            <p className="cb-studio__hint">Griffe ziehen oder das Bild im Rahmen verschieben. Drehen und Spiegeln in der Werkzeugleiste.</p>
          </section>
        )}
        {tool === 'adjust' && (
          <section className="cb-studio-panel__section" key="adjust" aria-label="Anpassen">
            <SectionHead icon="sliders" title="Anpassen" canReset={adjustEdited} disabled={readOnly} onReset={() => handle.reset('adjust')} />
            {ADJUSTMENTS.map((spec) => (
              <StudioSlider
                key={spec.key}
                id={`cb-studio-${spec.key}`}
                label={spec.label}
                value={edits.adjust[spec.key]}
                min={spec.min}
                max={spec.max}
                unit={spec.key === 'hue' ? '°' : ''}
                disabled={readOnly}
                onChange={(v) => setAdjust(spec.key, v)}
              />
            ))}
            <label className="cb-studio-switch">
              <span>
                <Icon name="contrast" size={14} />
                Schwarz-Weiß
              </span>
              <input type="checkbox" role="switch" checked={edits.mono} disabled={readOnly} onChange={(event) => commit({ ...edits, mono: event.target.checked })} />
            </label>
          </section>
        )}
        {tool === 'filter' && (
          <section className="cb-studio-panel__section" key="filter" aria-label="Filter">
            <SectionHead icon="sparkles" title="Filter" canReset={filterEdited} disabled={readOnly} onReset={() => handle.reset('filter')} />
            <div className="cb-studio-filters" role="radiogroup" aria-label="Filter">
              {FILTERS.map((f) => (
                <FilterThumb key={f.id} source={thumbSource} edits={thumbEdits} id={f.id} label={f.label} active={edits.filter === f.id} disabled={readOnly} onPick={pickFilter} />
              ))}
            </div>
            {edits.filter !== 'none' && (
              <StudioSlider
                id="cb-studio-strength"
                label="Stärke"
                value={edits.filterStrength}
                min={0}
                max={100}
                origin={100}
                unit=" %"
                disabled={readOnly}
                onChange={(v) => commit({ ...edits, filterStrength: v }, 'filter-strength')}
              />
            )}
          </section>
        )}

        <section className="cb-studio-panel__section cb-studio-panel__export" aria-label="Export">
          <div className="cb-studio-panel__head">
            <h4>
              <Icon name="download" size={14} />
              Export
            </h4>
            <button type="button" className="cb-studio-reset" disabled={readOnly || !edited} onClick={() => handle.reset()}>
              <Icon name="reset" size={13} />
              Alles zurücksetzen
            </button>
          </div>
          <SegmentedControl label="Exportformat" size="sm" options={exportOptions()} value={exportType} onChange={onExportType} />
          <div className="cb-studio-panel__actions">
            <button type="button" className="cb-button cb-button--primary" disabled={load.state === 'error' && !item.asset} onClick={onExport}>
              <Icon name="download" size={15} />
              Bild exportieren
            </button>
            {item.asset && (
              <button type="button" className="cb-button" onClick={downloadOriginal}>
                Original
              </button>
            )}
          </div>
          <p className="cb-studio__hint">{edited ? 'Bearbeitet · das Original bleibt unverändert erhalten.' : 'Unbearbeitet.'}</p>
        </section>
      </aside>
    </div>
  );
}
