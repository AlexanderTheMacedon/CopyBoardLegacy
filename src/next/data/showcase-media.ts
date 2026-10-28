import type { ItemAsset } from '../domain/types';
import type { ShowcaseMedia } from './showcase';

// Lightweight, real media for the showcase space, generated on the device when it is created: a few small PNGs (canvas),
// two short playable WAV tones and tiny text/PDF files. No binary test assets ship with the app, nothing is downloaded.

const asset = (blob: Blob): ItemAsset => ({ blob, mimeType: blob.type });

const IMAGE_SPECS: readonly { w: number; h: number; stops: [string, string, string]; lines: string }[] = [
  { w: 960, h: 600, stops: ['#FFE9D6', '#F59A5B', '#7A2E10'], lines: 'rgb(255 240 220 / 0.55)' },
  { w: 390, h: 844, stops: ['#E8F1FB', '#86A9D6', '#1F3A63'], lines: 'rgb(230 242 255 / 0.5)' },
  { w: 960, h: 600, stops: ['#EEF3F8', '#A9C4E2', '#2B4A75'], lines: 'rgb(255 255 255 / 0.45)' },
  { w: 640, h: 640, stops: ['#F4F4F6', '#C9CCD6', '#4A5060'], lines: 'rgb(90 96 112 / 0.35)' },
];

function drawImage(spec: (typeof IMAGE_SPECS)[number], index: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = spec.w;
  canvas.height = spec.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas unavailable'));
  const bg = ctx.createLinearGradient(0, 0, spec.w, spec.h);
  bg.addColorStop(0, spec.stops[0]);
  bg.addColorStop(0.55, spec.stops[1]);
  bg.addColorStop(1, spec.stops[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, spec.w, spec.h);
  // light arcs (or a grid for the last one), so previews show real structure
  ctx.strokeStyle = spec.lines;
  ctx.lineWidth = Math.max(2, spec.w / 240);
  if (index === 3) {
    for (let x = 0; x <= spec.w; x += spec.w / 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, spec.h);
      ctx.stroke();
    }
    for (let y = 0; y <= spec.h; y += spec.h / 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(spec.w, y);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(spec.w * (0.2 + i * 0.07), spec.h * 1.05, spec.w * (0.35 + i * 0.08), spec.h * (0.5 + i * 0.07), -0.35, Math.PI * 1.05, Math.PI * 1.85);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
  ctx.font = `600 ${Math.round(spec.w / 22)}px system-ui, sans-serif`;
  ctx.fillText(`Showcase ${index + 1}`, spec.w * 0.06, spec.h * 0.14);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

/** 16-bit mono PCM WAV of a soft chord with fade in/out. */
function tone(seconds: number, freqs: readonly number[]): Blob {
  const rate = 22050;
  const n = Math.round(seconds * rate);
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t / 0.08, (seconds - t) / 0.4);
    const v = freqs.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / freqs.length;
    view.setInt16(44 + i * 2, Math.round(v * env * 0.3 * 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** A minimal, valid one-page PDF with a line of text. */
function pdf(line: string): Blob {
  const content = `BT /F1 18 Tf 72 720 Td (${line}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: 'application/pdf' });
}

export async function createShowcaseMedia(): Promise<ShowcaseMedia> {
  const images = await Promise.all(IMAGE_SPECS.map(async (spec, i) => ({ asset: asset(await drawImage(spec, i)), width: spec.w, height: spec.h })));
  return {
    images,
    audio: [
      { asset: asset(tone(3, [261.63, 329.63, 392])), durationSec: 3 },
      { asset: asset(tone(2, [220, 277.18])), durationSec: 2 },
    ],
    files: {
      pdf: asset(pdf('CopyBoard Showcase - Testdokument (synthetisch)')),
      csv: asset(new Blob(['name,ort,rolle\nAda Beispiel,Berlin,Design\nBen Muster,Hamburg,Entwicklung\nCleo Test,Wien,Research\n'], { type: 'text/csv' })),
      json: asset(new Blob([JSON.stringify({ ember: '#f2622e', mist: '#a9c4e2', moss: '#9dbf8a', night: '#151c2e' }, null, 2)], { type: 'application/json' })),
      txt: asset(new Blob(['00:00:01 Willkommen im Showcase.\n00:00:04 Alles hier ist synthetisch.\n'], { type: 'text/plain' })),
      md: asset(new Blob(['# Anforderungen\n\n- Schnell\n- Lokal\n- Ruhig\n'], { type: 'text/markdown' })),
    },
  };
}
