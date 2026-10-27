import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { usePreview } from '../../app/context';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useScrollFade } from '../../components/motion';
import { useObjectUrl } from '../../components/useObjectUrl';
import type { AudioItem, Item } from '../../domain/types';
import { ImageSwatch, Waveform } from '../grid/ItemPreview';
import { tileOpenButtonId } from '../grid/ItemTile';
import { itemActions } from '../items/item-actions';
import { formatDateTime, formatDuration, formatSize, kindIcon, kindLabel, linkParts, spaceColorVar } from '../items/item-meta';
import { useRunItemAction } from '../items/useItemActions';

function AudioContent({ item }: { item: AudioItem }) {
  const url = useObjectUrl(item.asset?.blob);
  return (
    <div className="cb-inspector__audio">
      <Waveform item={item} className="cb-waveform cb-waveform--large" />
      {item.asset ? (
        url && <audio className="cb-inspector__player" controls preload="metadata" src={url} />
      ) : (
        <p>Dauer {formatDuration(item.durationSec)} · Beispielinhalt ohne Audiodaten</p>
      )}
    </div>
  );
}

function InspectorContent({ item }: { item: Item }) {
  switch (item.kind) {
    case 'text':
    case 'markdown':
      return <p className="cb-inspector__text">{item.body}</p>;
    case 'code':
      return (
        <pre className="cb-inspector__code">
          <code>{item.body}</code>
        </pre>
      );
    case 'link': {
      const { host, path } = linkParts(item.url);
      return (
        <p className="cb-inspector__link">
          <span className="cb-inspector__link-host">{host}</span>
          <span className="cb-inspector__link-url">{item.url}</span>
          {path && <span className="cb-visually-hidden">{path}</span>}
        </p>
      );
    }
    case 'image':
      return (
        <figure className="cb-inspector__figure">
          <ImageSwatch item={item} className="cb-inspector__image" />
          <figcaption>
            {item.width} × {item.height} px{item.asset ? ` · ${formatSize(item.asset.blob.size)}` : ' · synthetische Vorschau'}
          </figcaption>
        </figure>
      );
    case 'file':
      return (
        <dl className="cb-inspector__facts">
          <dt>Dateiname</dt>
          <dd>{item.fileName}</dd>
          <dt>Größe</dt>
          <dd>{formatSize(item.sizeBytes)}</dd>
          {item.asset && (
            <>
              <dt>Typ</dt>
              <dd>{item.asset.mimeType}</dd>
            </>
          )}
        </dl>
      );
    case 'audio':
      return <AudioContent item={item} />;
  }
}

/** Focus the tile that opened the inspector, or the workspace as a stable fallback (Blueprint 03 §3.2). */
function restoreBoardFocus(itemId: string) {
  requestAnimationFrame(() => {
    const target = document.getElementById(tileOpenButtonId(itemId)) ?? document.getElementById('cb-main');
    target?.focus();
  });
}

const step = (i: number) => ({ '--i': i }) as CSSProperties;

export const INSPECTOR_DEFAULT_WIDTH = 400;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
/** The board keeps at least this much room next to the inspector while resizing. */
const MIN_BOARD = 420;
const KEY_STEP = 24;

const clampWidth = (width: number, stage: HTMLElement | null) => {
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, (stage?.clientWidth ?? MAX_WIDTH + MIN_BOARD) - MIN_BOARD));
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, width)));
};

/**
 * Resize separator on the inspector's inner edge (pointer drag + arrow keys). While dragging, the width is written straight
 * to the stage's CSS variable (no React render per frame); the final width is committed once on release.
 */
function ResizeHandle({ width, onWidthChange }: { width: number; onWidthChange: (width: number) => void }) {
  const stageOf = (el: Element) => el.closest<HTMLElement>('.cb-stage');

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const stage = stageOf(handle);
    const app = handle.closest<HTMLElement>('.cb-app');
    const startX = event.clientX;
    let next = width;
    handle.setPointerCapture(event.pointerId);
    app?.setAttribute('data-resizing', '');

    const onMove = (move: globalThis.PointerEvent) => {
      // The handle sits on the left edge: dragging left widens the panel.
      next = clampWidth(width + (startX - move.clientX), stage);
      stage?.style.setProperty('--cb-inspector-w', `${next}px`);
      handle.setAttribute('aria-valuenow', String(next));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      app?.removeAttribute('data-resizing');
      onWidthChange(next);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowLeft: KEY_STEP, ArrowRight: -KEY_STEP }[event.key];
    const stage = stageOf(event.currentTarget);
    if (delta) onWidthChange(clampWidth(width + delta, stage));
    else if (event.key === 'Home') onWidthChange(MIN_WIDTH);
    else if (event.key === 'End') onWidthChange(clampWidth(MAX_WIDTH, stage));
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="cb-inspector__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Inspector-Breite ändern"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onWidthChange(INSPECTOR_DEFAULT_WIDTH)}
    >
      <span className="cb-inspector__grip" aria-hidden="true" />
    </div>
  );
}

interface InspectorProps {
  item: Item;
  /** Exit transition: the panel is inert and only plays its leave animation. */
  leaving: boolean;
  width: number;
  onWidthChange: (width: number) => void;
}

/**
 * Adaptive Item Inspector (D-004, DS-C20): floating, non-modal glass context rail; the board stays visible and makes room.
 * On narrow screens CSS turns it into a sheet. Initial focus goes to the title; closing returns focus to the card. Sections
 * reveal with a short stagger (M-05); the width is adjustable via the resize separator.
 */
export function Inspector({ item, leaving, width, onWidthChange }: InspectorProps) {
  const { state, dispatch, library } = usePreview();
  const runAction = useRunItemAction();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemId = item.id;
  useScrollFade(scrollRef);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    // Deferred so a closing dialog (e.g. the search palette) has restored its focus first.
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [itemId]);

  const space = library.getSpace(item.spaceId);

  const close = () => {
    dispatch({ type: 'closeInspector' });
    restoreBoardFocus(item.id);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  };

  return (
    <aside
      className="cb-inspector"
      aria-labelledby="cb-inspector-title"
      onKeyDown={onKeyDown}
      data-kind={item.kind}
      data-leaving={leaving || undefined}
      inert={leaving}
    >
      <ResizeHandle width={width} onWidthChange={onWidthChange} />
      <div ref={scrollRef} className="cb-inspector__scroll cb-scroll">
        <div key={item.id} className="cb-inspector__body">
          <div className="cb-inspector__header" style={step(0)}>
            <p className="cb-kind" data-kind={item.kind}>
              <Icon name={kindIcon[item.kind]} size={14} />
              {kindLabel[item.kind]}
            </p>
            <IconButton icon="x" label="Inspector schließen" onClick={close} />
          </div>
          <h2 id="cb-inspector-title" ref={headingRef} tabIndex={-1} className="cb-inspector__title" style={step(1)}>
            {item.title}
          </h2>
          {space && (
            <p className="cb-inspector__space" style={step(2)}>
              <span className="cb-space-chip" style={{ '--cb-chip': spaceColorVar(space.color) } as CSSProperties}>
                {space.name}
              </span>
              {item.favorite && (
                <span className="cb-inspector__favorite">
                  <Icon name="star" size={14} /> Favorit
                </span>
              )}
            </p>
          )}

          <div className="cb-inspector__actions" role="group" aria-label="Aktionen" style={step(3)}>
            {itemActions(item, state.location).map((action, i) => (
              <button
                key={action.id}
                type="button"
                className={`cb-button ${i === 0 ? 'cb-button--primary' : action.danger ? 'cb-button--danger' : 'cb-button--secondary'}`}
                aria-pressed={action.id === 'favorite' ? item.favorite : undefined}
                onClick={() => runAction(action, item)}
              >
                <Icon name={action.icon} size={16} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>

          <div className="cb-inspector__content" style={step(4)}>
            <InspectorContent item={item} />
          </div>

          <dl className="cb-inspector__facts cb-inspector__facts--meta" style={step(5)}>
            <dt>Erstellt</dt>
            <dd>
              <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
            </dd>
            <dt>Geändert</dt>
            <dd>
              <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
            </dd>
            {item.tags.length > 0 && (
              <>
                <dt>Tags</dt>
                <dd className="cb-inspector__tags">
                  {item.tags.map((tag) => (
                    <span key={tag} className="cb-tag">
                      {tag}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </aside>
  );
}
