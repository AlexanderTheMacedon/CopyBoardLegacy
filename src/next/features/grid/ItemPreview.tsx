import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { useObjectUrl } from '../../components/useObjectUrl';
import { editedPreview } from '../../data/image-render';
import { editedSize, isIdentityEdits, normalizeImageEdits, type Size } from '../../domain/image-edits';
import type { AudioItem, ImageItem, Item } from '../../domain/types';
import { excerpt, fileExtension, firstHeading, formatDuration, formatSize, kindIcon, linkParts } from '../items/item-meta';

// Type-specific semantic preview (D-005, DS-C11). Purely presentational; card vs. inspector scale is decided by CSS.
// In list mode CSS hides the rich preview and shows the kind glyph instead (same markup, no second component).

/**
 * What an image looks like now: the original, or (with studio edits) a downsized rendition of original + edits. The
 * rendition is shared through a cache, so many cards of one image render it once. A failed render falls back to the original.
 */
export function useImageView(item: ImageItem): { url: string | undefined; size: Size; edited: boolean } {
  const edits = useMemo(() => normalizeImageEdits(item.edits), [item.edits]);
  const edited = !isIdentityEdits(edits);
  const [rendition, setRendition] = useState<{ blob?: Blob; failed?: boolean }>({});
  useEffect(() => {
    if (!edited) return;
    let live = true;
    editedPreview(item, edits).then(
      (blob) => live && setRendition({ blob }),
      () => live && setRendition({ failed: true }),
    );
    return () => {
      live = false;
    };
  }, [edited, edits, item]);
  const url = useObjectUrl(edited && !rendition.failed ? rendition.blob : item.asset?.blob);
  return { url, size: edited ? editedSize(item.width, item.height, edits) : { width: item.width, height: item.height }, edited };
}

/** Captured images show their real pixels; synthetic fixtures render their palette as a gradient. Studio edits are shown applied. */
export function ImageSwatch({ item, className = 'cb-preview cb-preview--image' }: { item: ImageItem; className?: string }) {
  const { url, size, edited } = useImageView(item);
  const ratio = { '--cb-img-ratio': `${size.width} / ${size.height}` } as CSSProperties;
  if (item.asset || edited) {
    return (
      <div className={`${className} cb-image--real`} style={ratio} role="img" aria-label={item.alt}>
        {url && <img src={url} alt="" draggable={false} decoding="async" />}
      </div>
    );
  }
  const [a, b, c] = item.palette ?? ['#f3c09a', '#f08a4b', '#c2410c'];
  const style = { ...ratio, '--cb-img-a': a, '--cb-img-b': b, '--cb-img-c': c } as CSSProperties;
  return <div className={className} style={style} role="img" aria-label={item.alt} />;
}

/** Bars come from the decoded samples (captured audio) or the fixture; undecodable audio shows a flat line. */
export function Waveform({ item, className = 'cb-waveform' }: { item: AudioItem; className?: string }) {
  const bars = item.waveform.length ? item.waveform : Array.from({ length: 48 }, () => 0.06);
  const width = bars.length * 4;
  return (
    <svg className={className} viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {bars.map((h, i) => (
        <rect key={i} x={i * 4 + 0.75} y={20 - h * 18} width="2.5" height={h * 36} rx="1.25" />
      ))}
    </svg>
  );
}

function ImagePreview({ item }: { item: ImageItem }) {
  const edited = !!item.edits && !isIdentityEdits(normalizeImageEdits(item.edits));
  const size = edited ? editedSize(item.width, item.height, normalizeImageEdits(item.edits)) : item;
  return (
    <div className="cb-preview cb-preview--image-frame">
      <ImageSwatch item={item} />
      <span className="cb-preview__chip" aria-hidden="true">
        {edited && <Icon name="sliders" size={11} />}
        {size.width} × {size.height}
      </span>
    </div>
  );
}

const Glyph = ({ item }: { item: Item }) => (
  <span className="cb-preview__glyph" aria-hidden="true">
    <Icon name={kindIcon[item.kind]} size={20} />
  </span>
);

export function ItemPreview({ item }: { item: Item }) {
  switch (item.kind) {
    case 'document':
      return (
        <div className="cb-preview cb-preview--document">
          <p className="cb-preview__text">{excerpt(item) || 'Leeres Dokument'}</p>
          <Glyph item={item} />
        </div>
      );
    case 'text':
      return (
        <div className="cb-preview cb-preview--text">
          <p className="cb-preview__text">{excerpt(item)}</p>
          <Glyph item={item} />
        </div>
      );
    case 'markdown': {
      const heading = firstHeading(item.body);
      return (
        <div className="cb-preview cb-preview--markdown">
          <p className="cb-preview__text">
            {heading && <strong>{heading}</strong>}
            {excerpt(item, 180, true)}
          </p>
          <Glyph item={item} />
        </div>
      );
    }
    case 'code':
      return (
        <div className="cb-preview cb-preview--code">
          <span className="cb-code__chrome" aria-hidden="true">
            <i className="cb-code__dot" />
            <i className="cb-code__dot" />
            <i className="cb-code__dot" />
            <span className="cb-code__lang">{item.language}</span>
          </span>
          <pre className="cb-preview__code">
            <code>
              {item.body.split('\n').slice(0, 8).map((line, i) => (
                <span key={i} className="cb-code__line">
                  {line}
                </span>
              ))}
            </code>
          </pre>
          <Glyph item={item} />
        </div>
      );
    case 'link': {
      const { host, path } = linkParts(item.url);
      return (
        <div className="cb-preview cb-preview--link">
          <span className="cb-link__badge" aria-hidden="true">
            <Icon name="link" size={18} />
          </span>
          <span className="cb-link__host">{host}</span>
          {path && <span className="cb-link__path">{path}</span>}
          <Glyph item={item} />
        </div>
      );
    }
    case 'image':
      return <ImagePreview item={item} />;
    case 'file':
      return (
        <div className="cb-preview cb-preview--file">
          <span className="cb-file-sheet">{fileExtension(item.fileName)}</span>
          <span className="cb-preview__caption">{formatSize(item.sizeBytes)}</span>
          <Glyph item={item} />
        </div>
      );
    case 'audio':
      return (
        <div className="cb-preview cb-preview--audio">
          <Waveform item={item} />
          <span className="cb-preview__caption">{item.durationSec ? formatDuration(item.durationSec) : (item.fileName ?? 'Audio')}</span>
          <span className="cb-preview__play" aria-hidden="true">
            <Icon name="play" size={14} />
          </span>
        </div>
      );
  }
}
