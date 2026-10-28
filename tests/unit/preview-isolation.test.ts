import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewInfo } from '../../src/next/preview-info';

const root = resolve(import.meta.dirname, '../..');
const nextDir = join(root, 'src/next');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('React app is isolated from the legacy data path and the network', () => {
  it('writes only to its own local store and stays offline', () => {
    expect(previewInfo.writesEnabled).toBe(true);
    expect(previewInfo.storage).toBe('indexeddb-local');
    expect(previewInfo.cloudEnabled).toBe(false);
  });

  // Device and storage access is confined to named modules (Orange Squircle run: Universal Paste + local persistence).
  // Everything else keeps the Run A/B guarantees: no legacy storage, no network, no microphone, no HTML injection.
  const confined: { pattern: RegExp; files: string[] }[] = [
    { pattern: /\bindexedDB\b/, files: ['src/next/data/store.ts'] },
    { pattern: /navigator\.clipboard|\bClipboardItem\b/, files: ['src/next/data/clipboard.ts'] },
    // Paste/drop events hand their data straight to data/clipboard.ts#readTransfer.
    { pattern: /\bclipboardData\b/, files: ['src/next/features/shell/AppShell.tsx', 'src/next/features/capture/SmartCapture.tsx'] },
    { pattern: /type=["']file["']/, files: ['src/next/features/capture/SmartCapture.tsx'] },
    // Photo credits of the bundled nature backgrounds: attribution links only (user-clicked, never fetched by the app).
    { pattern: /https:\/\/unsplash\.com\/photos\//, files: ['src/next/features/shell/scenes.ts'] },
    // Link cards of the synthetic test space "Full": inert item data (shown and user-clicked like any link card, never fetched).
    { pattern: /https?:\/\/(?!unsplash\.com\/photos\/)/, files: ['src/next/data/showcase.ts'] },
  ];

  const forbidden = [
    // storage outside the own IndexedDB store; never the legacy keys
    /localStorage/,
    /sessionStorage/,
    /document\.cookie/,
    /caches\./,
    /copyboard_/,
    // network / backend
    /supabase/i,
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /EventSource/,
    /sendBeacon/,
    // device access that stays out of scope (microphone, file system handles)
    /getUserMedia|mediaDevices|MediaRecorder/,
    /\bFileReader\b/,
    /dataTransfer\.(files|items|getData)/,
    /showOpenFilePicker|showSaveFilePicker/,
    // HTML injection
    /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/,
    // legacy app modules
    /js\/app\.js/,
    /js\/config\/constants/,
    /['"](\.\.\/)+js\//,
  ];

  const files = sourceFiles(nextDir);

  it('covers the React sources', () => {
    expect(files.some((f) => f.endsWith('.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('.css'))).toBe(true);
  });

  for (const file of files) {
    const rel = file.slice(root.length + 1);
    it(`${rel} has no legacy storage, network or out-of-scope device access`, () => {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden) expect(text, String(pattern)).not.toMatch(pattern);
      for (const { pattern, files: allowed } of confined) if (!allowed.includes(rel)) expect(text, `${pattern} outside ${allowed.join(', ')}`).not.toMatch(pattern);
    });
  }

  it('the local store uses its own database, never the legacy state', () => {
    const store = readFileSync(join(nextDir, 'data/store.ts'), 'utf8');
    expect(store).toMatch(/DB_NAME = 'copyboard-next'/);
    expect(store).not.toMatch(/copyboard_state|STORAGE_KEY/);
  });

  it('imports stay inside src/next, React or CSS', () => {
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      const specifiers = [...readFileSync(file, 'utf8').matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '');
      for (const spec of specifiers) {
        const external = !spec.startsWith('.');
        // react-dom: createPortal for the floating layer of card menus (components/Popover.tsx)
        if (external) expect(['react', 'react-dom', 'react-dom/client'], `${file}: ${spec}`).toContain(spec);
        else expect(resolve(file, '..', spec).startsWith(nextDir), `${file}: ${spec}`).toBe(true);
      }
    }
  });

  it('preview.html loads only the preview entry', () => {
    const html = readFileSync(join(root, 'preview.html'), 'utf8');
    expect(html).toContain('src="./src/next/main.tsx"');
    expect(html).not.toMatch(/src\/js\/|https?:\/\//);
  });
});
