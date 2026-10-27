// Verifies the Cloudflare Pages preview build in `dist-preview` (run after `npm run build:pages-preview`):
//   1. static: only the React app and its assets (incl. the ambient photo) are in the output; no legacy app, no CNAME, no
//      backend, no legacy storage; the only storage is the app's own IndexedDB database;
//   2. runtime: the app boots at "/" and passes the complete browser suite (tests/e2e/preview.mjs), including Universal Paste
//      with reload persistence and the zero-network / no-legacy-storage / no-microphone instrumentation.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { preview } from 'vite';

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'dist-preview');
const problems = [];
const check = (ok, message) => ok || problems.push(message);

if (!existsSync(join(outDir, 'index.html'))) {
  console.error('dist-preview/index.html is missing: run `npm run build:pages-preview` first.');
  process.exit(2);
}

// --- 1. Static output inventory -------------------------------------------------------------------------------------
const files = [];
const walk = (dir, rel = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), path);
    else files.push(path);
  }
};
walk(outDir);

check(!files.includes('CNAME'), 'CNAME must not be deployed with the preview');
check(!files.includes('preview.html'), 'preview.html must be renamed to index.html');
check(!files.some((f) => /^assets\/main-/.test(f)), 'legacy main-* bundle must not be part of the preview build');
check(files.every((f) => /^(index\.html|favicon\.svg|assets\/preview-[\w-]+\.(js|css)|assets\/modulepreload-polyfill-[\w-]+\.js|assets\/ambient-orange-[\w-]+\.jpg)$/.test(f)), `unexpected files in dist-preview: ${files.join(', ')}`);
check(files.some((f) => /^assets\/ambient-orange-[\w-]+\.jpg$/.test(f)), 'the ambient background photo must be part of the build');

const html = readFileSync(join(outDir, 'index.html'), 'utf8');
check(html.includes('id="preview-root"'), 'index.html must mount the React preview');
check(!/src\/js\/|src\/styles\/|supabase|tesseract|jszip/i.test(html), 'index.html must not reference legacy sources or CDN libraries');
check(!/https?:\/\//.test(html), 'index.html must not reference external URLs');
check(/<script type="module" crossorigin src="\.\/assets\/preview-[\w-]+\.js"><\/script>/.test(html), 'index.html must load the preview bundle via a relative ./assets path');
check(/<link rel="stylesheet" crossorigin href="\.\/assets\/preview-[\w-]+\.css">/.test(html), 'index.html must load the preview stylesheet via a relative ./assets path');

for (const asset of files.filter((f) => /^assets\/.*\.(js|css)$/.test(f))) {
  const text = readFileSync(join(outDir, asset), 'utf8');
  // IndexedDB (own database `copyboard-next`) and the Clipboard API (Universal Paste) are intended; legacy storage is not.
  const forbidden = /localStorage|sessionStorage|supabase|getUserMedia|copyboard_state|MediaRecorder|XMLHttpRequest|WebSocket/;
  const hit = forbidden.exec(text);
  check(!hit, `${asset} contains forbidden API or backend reference: ${hit?.[0]}`);
}

const js = files.filter((f) => /^assets\/preview-[\w-]+\.js$/.test(f)).map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n');
check(js.includes('copyboard-next'), 'the bundle must use its own IndexedDB database (copyboard-next)');

console.log(`static check: ${files.length} files in dist-preview (${files.join(', ')})`);
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}

// --- 2. Runtime: serve dist-preview and run the preview browser suite against "/" ------------------------------------
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port: p } = probe.address();
    probe.close(() => resolvePort(p));
  });
});
const server = await preview({ root, mode: 'pages-preview', logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
const outResults = join(root, 'test-results', 'pages-preview');
let status = 1;
try {
  status = await new Promise((done) => {
    spawn(process.execPath, [join(root, 'tests/e2e/preview.mjs')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CB_BASE: `http://127.0.0.1:${port}/`, CB_PREVIEW_PATH: '', R02_OUT_DIR: outResults, E2E_TARGET: 'pages-preview' },
    }).on('close', done);
  });
} finally {
  await server.close();
}
console.log(status === 0 ? '\nPAGES PREVIEW OK' : '\nPAGES PREVIEW FAILED');
process.exit(status === 0 ? 0 : 1);
