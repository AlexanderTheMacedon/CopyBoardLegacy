import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { IndexHtmlTransformHook } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';

const root = import.meta.dirname;

// GitHub Pages reads CNAME from the published root. The file stays in the repo root, the build copies it unchanged.
function emitCname(): Plugin {
  return {
    name: 'copyboard-emit-cname',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'CNAME', source: readFileSync(resolve(root, 'CNAME')) });
    },
  };
}

// React (JSX + Fast Refresh) for the preview only. The legacy ESM sources under src/js are never transformed, and the dev-only
// Fast Refresh preamble is injected into preview.html only, so the legacy page "/" is served exactly as before.
function reactPreviewOnly(): Plugin[] {
  return react({ include: /\/src\/next\/.*\.tsx?$/ }).map((plugin) => {
    const hook = plugin.transformIndexHtml;
    if (!hook) return plugin;
    const handler: IndexHtmlTransformHook = typeof hook === 'function' ? hook : hook.handler;
    const scoped: IndexHtmlTransformHook = function (this: unknown, html, ctx) {
      return ctx.filename.endsWith('preview.html') ? handler.call(this as never, html, ctx) : undefined;
    };
    return { ...plugin, transformIndexHtml: typeof hook === 'function' ? scoped : { ...hook, handler: scoped } };
  });
}

// Favicon of the Cloudflare preview deployment (inline SVG, no binary asset, no external request).
const PREVIEW_FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">' +
  '<stop offset="0" stop-color="#6e5fcb"/><stop offset="1" stop-color="#a99bff"/></linearGradient></defs>' +
  '<rect width="64" height="64" rx="18" fill="#f4f1fb"/><g transform="translate(8 18.33) scale(0.6667)" fill="url(#g)">' +
  '<path d="M37.5569 2.04585C38.4821 1.08338 39.7385 0.542663 41.0469 0.542664C46.9335 0.542664 52.4811 0.542667 57.9442 0.542678C68.932 0.542701 74.4342 14.3629 66.6646 22.4456L49.7407 40.0517C48.9637 40.86 47.6352 40.2875 47.6352 39.1444V23.6376L49.591 21.6029C51.145 19.9864 50.0444 17.2223 47.8468 17.2223H22.9684L37.5569 2.04585Z"/>' +
  '<path d="M33.0467 38.8142C32.1215 39.7767 30.8651 40.3174 29.5567 40.3174C23.6701 40.3174 18.1225 40.3174 12.6594 40.3174C1.67159 40.3173 -3.83061 26.4972 3.93897 18.4144L20.8629 0.808361C21.6399 8.48472e-05 22.9684 0.57254 22.9684 1.71562L22.9684 17.2223L21.0126 19.2571C19.4586 20.8737 20.5592 23.6377 22.7568 23.6377L47.6352 23.6376L33.0467 38.8142Z"/></g></svg>\n';

/**
 * Cloudflare Pages preview build (`npm run build:pages-preview`, output `dist-preview`): only the synthetic React preview and
 * its own assets. The emitted preview.html becomes index.html so the React app starts at "/". No legacy entry, no legacy
 * bundles, no CNAME, no Supabase configuration: the legacy input is simply not part of this build.
 */
function pagesPreviewEntry(outDir: string): Plugin {
  return {
    name: 'copyboard-pages-preview-entry',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('preview.html')) return;
        return html.replace('<title>CopyBoard Preview</title>', '<title>CopyBoard 2 · Preview</title>\n<link rel="icon" type="image/svg+xml" href="./favicon.svg">');
      },
    },
    closeBundle() {
      const dir = resolve(root, outDir);
      renameSync(resolve(dir, 'preview.html'), resolve(dir, 'index.html'));
      writeFileSync(resolve(dir, 'favicon.svg'), PREVIEW_FAVICON);
    },
  };
}

export default defineConfig(({ mode }) => {
  const pagesPreview = mode === 'pages-preview';
  const previewOutDir = 'dist-preview';
  // "/" is the unchanged legacy app. "/preview.html" is the isolated entry for the React/TypeScript preview track.
  // The Cloudflare preview build has only the preview entry, so no legacy chunk can even be generated.
  const input: Record<string, string> = pagesPreview
    ? { preview: resolve(root, 'preview.html') }
    : { main: resolve(root, 'index.html'), preview: resolve(root, 'preview.html') };
  return {
    // Relative base keeps asset URLs valid under any origin or sub-path, like the unbundled legacy app.
    base: './',
    // Multi-page app without SPA fallback: unknown paths 404 like on static hosting.
    appType: 'mpa',
    plugins: [reactPreviewOnly(), pagesPreview ? pagesPreviewEntry(previewOutDir) : emitCname()],
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1', port: 4173 },
    build: {
      outDir: pagesPreview ? previewOutDir : 'dist',
      emptyOutDir: true,
      rollupOptions: { input },
    },
    test: {
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      environment: 'node',
    },
  };
});
