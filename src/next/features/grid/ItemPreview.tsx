import type { CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { useObjectUrl } from '../../components/useObjectUrl';
import type { AudioItem, ImageItem, Item } from '../../domain/types';
import { excerpt, fileExtension, firstHeading, formatDuration, formatSize, kindIcon, linkParts } from '../items/item-meta';

// Type-specific semantic preview (D-005, DS-C11). Purely presentational; card vs. inspector scale is decided by CSS.
// In list mode CSS hides the rich preview and shows the kind glyph instead (same markup, no second component).

/** Captured images show their real pixels; synthetic fixtures render their palette as a gradient. */
export function ImageSwatch({ item, className = 'cb-preview cb-preview--image' }: { item: ImageItem; className?: string }) {
  const url = useObjectUrl(item.asset?.blob);
  const ratio = { '--cb-img-ratio': `${item.width} / ${item.height}` } as CSSProperties;
  if (item.asset) {
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
      return (
        <div className="cb-preview cb-preview--image-frame">
          <ImageSwatch item={item} />
          <span className="cb-preview__chip" aria-hidden="true">
            {item.width} × {item.height}
          </span>
        </div>
      );
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
