// React preview suite (Run B): the read-only preview at /preview.html boots, its core interactions work on desktop and phone,
// and at runtime it touches no storage, no network beyond its own static assets, no clipboard, no microphone and no drop data.
// Every test runs in a fresh Chromium context; all requests outside the app origin are aborted and recorded.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const BASE = process.env.CB_BASE || 'http://127.0.0.1:4173/';
// Path of the preview page: 'preview.html' in the regular multi-page build, '' (root) in the Cloudflare preview-only build.
const PAGE = BASE + (process.env.CB_PREVIEW_PATH ?? 'preview.html');
const ORIGIN = new URL(BASE).origin;
const OUT = process.env.R02_OUT_DIR || path.resolve('test-results');
const DEV = process.env.E2E_TARGET === 'dev';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

// Installed before any page script: counts every access to APIs the preview must never use.
function instrument() {
  const hits = (window.__cbHits = []);
  const hit = (name) => hits.push(name);
  const wrapGetter = (target, prop, name) => {
    const desc = Object.getOwnPropertyDescriptor(target, prop);
    if (!desc?.get) return;
    Object.defineProperty(target, prop, {
      configurable: true,
      get() {
        hit(name);
        return desc.get.call(this);
      },
      set: desc.set,
    });
  };
  const wrapMethod = (target, prop, name) => {
    const original = target?.[prop];
    if (typeof original !== 'function') return;
    target[prop] = function (...args) {
      hit(name);
      return original.apply(this, args);
    };
  };
  wrapGetter(Window.prototype, 'localStorage', 'localStorage');
  wrapGetter(Window.prototype, 'sessionStorage', 'sessionStorage');
  wrapGetter(Window.prototype, 'indexedDB', 'indexedDB');
  wrapGetter(Window.prototype, 'caches', 'caches');
  wrapGetter(Document.prototype, 'cookie', 'document.cookie');
  for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) wrapMethod(Storage.prototype, m, `Storage.${m}`);
  wrapMethod(window, 'fetch', 'fetch');
  wrapMethod(XMLHttpRequest.prototype, 'open', 'XMLHttpRequest');
  wrapMethod(Navigator.prototype, 'sendBeacon', 'sendBeacon');
  for (const m of ['readText', 'read', 'writeText', 'write']) wrapMethod(Clipboard.prototype, m, `clipboard.${m}`);
  wrapMethod(MediaDevices.prototype, 'getUserMedia', 'getUserMedia');
  wrapMethod(Permissions.prototype, 'query', 'permissions.query');
  for (const p of ['files', 'items']) wrapGetter(DataTransfer.prototype, p, `DataTransfer.${p}`);
  wrapMethod(DataTransfer.prototype, 'getData', 'DataTransfer.getData');
  wrapMethod(window, 'open', 'window.open');
}

let browser;
const tests = [];
const results = [];
// test(id, title, [contextOptions], fn)
const test = (id, title, a, b) => tests.push(typeof a === 'function' ? { id, title, opts: {}, fn: a } : { id, title, opts: a, fn: b });

async function openPreview(opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || DESKTOP,
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch,
    colorScheme: opts.colorScheme || 'light',
    reducedMotion: opts.reducedMotion || 'no-preference',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  });
  const foreign = [];
  const apiRequests = [];
  await context.route((url) => url.origin !== ORIGIN, (route) => {
    foreign.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('request', (r) => {
    if (['fetch', 'xhr', 'eventsource', 'websocket'].includes(r.resourceType())) apiRequests.push(r.url());
  });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForSelector('.cb-app .cb-tile');
  const clean = async () => {
    const hits = await page.evaluate(() => window.__cbHits);
    const problems = [
      ...hits.map((h) => `api:${h}`),
      ...foreign.map((u) => `foreign:${u}`),
      // The dev server's own HMR client is not preview code.
      ...apiRequests.filter((u) => !(DEV && /\/@vite\/|token=/.test(u))).map((u) => `request:${u}`),
      ...pageErrors.map((e) => `pageerror:${e}`),
      ...consoleErrors.map((e) => `console:${e}`),
    ];
    return problems;
  };
  return { context, page, clean };
}

const h1 = (page) => page.$eval('#cb-workspace-title', (e) => e.textContent);
const tileIds = (page) => page.$$eval('.cb-grid .cb-tile', (els) => els.map((e) => e.dataset.itemId));
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test('P1', 'preview boots as the React shell without errors, storage or network', async ({ page, clean }) => {
  const status = await page.$eval('#preview-root', (e) => e.dataset.previewStatus);
  const shell = await page.evaluate(() => ({
    sidebar: !!document.querySelector('aside.cb-sidebar'),
    main: !!document.querySelector('main#cb-main'),
    capture: !!document.querySelector('#cb-capture-input'),
    tiles: document.querySelectorAll('.cb-grid .cb-tile').length,
    theme: document.querySelector('.cb-app')?.dataset.theme,
  }));
  const problems = await clean();
  const ok = status === 'react-foundation' && shell.sidebar && shell.main && shell.capture && shell.tiles === 6 && shell.theme === 'light' && !problems.length;
  return { ok, observed: `status=${status}, ${JSON.stringify(shell)}, problems=${problems.join(' | ') || '-'}` };
});

test('P2', 'spaces switch via sidebar; active space is marked and content changes', async ({ page, clean }) => {
  const before = await tileIds(page);
  await page.click('.cb-sidebar .cb-nav__item[title="Design"]');
  const title = await h1(page);
  const after = await tileIds(page);
  const current = await page.$$eval('.cb-sidebar [aria-current="page"]', (els) => els.map((e) => e.title));
  await page.click('.cb-sidebar .cb-nav__item[title="Favoriten"]');
  const favTitle = await h1(page);
  const chips = await page.$$eval('.cb-grid .cb-space-chip', (els) => els.length);
  const problems = await clean();
  const ok = title === 'Design' && after.length === 4 && !after.some((id) => before.includes(id)) && current.join() === 'Design' && favTitle === 'Favoriten' && chips > 0 && !problems.length;
  return { ok, observed: `title=${title}, tiles=${after.length}, current=${current}, favorites chips=${chips}, problems=${problems.length}` };
});

test('P3', 'grid/list and density switch keep the order and share one preference state', async ({ page, clean }) => {
  const order = await tileIds(page);
  await page.click('[role="radio"][aria-label="Liste"]');
  const view = await page.$eval('.cb-grid', (e) => e.dataset.view);
  const listOrder = await tileIds(page);
  await page.click('.cb-view-controls [role="radio"]:has-text("Kompakt")');
  const density = await page.$eval('.cb-grid', (e) => e.dataset.density);
  await page.click('.cb-sidebar .cb-nav__item[title="Einstellungen"]');
  await page.waitForSelector('dialog[open] .cb-settings');
  const inStudio = await page.$$eval('dialog[open] [role="radio"][aria-checked="true"]', (els) => els.map((e) => e.textContent.trim() || e.getAttribute('aria-label')));
  await page.keyboard.press('Escape');
  await page.click('[role="radio"][aria-label="Raster"]');
  const back = await page.$eval('.cb-grid', (e) => e.dataset.view);
  const problems = await clean();
  const ok = view === 'list' && back === 'grid' && listOrder.join() === order.join() && density === 'compact' && inStudio.includes('Kompakt') && inStudio.includes('Liste') && !problems.length;
  return { ok, observed: `view=${view}->${back}, same order=${listOrder.join() === order.join()}, density=${density}, studio=${inStudio.join('/')}` };
});

test('P4', 'card opens the inspector, focus moves to it and Escape returns focus to the card', async ({ page, clean }) => {
  await page.click('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open');
  await page.waitForSelector('.cb-inspector');
  await settle(page);
  const title = await page.$eval('#cb-inspector-title', (e) => e.textContent);
  const focus1 = await focusedId(page);
  const current = await page.$eval('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open', (e) => e.getAttribute('aria-current'));
  const board = await page.$$eval('.cb-grid .cb-tile', (els) => els.length);
  await page.keyboard.press('Escape');
  // The inspector plays a short exit transition before it unmounts.
  await page.waitForSelector('.cb-inspector', { state: 'detached', timeout: 2000 }).catch(() => {});
  await settle(page);
  const open = await page.$('.cb-inspector');
  const focus2 = await focusedId(page);
  const problems = await clean();
  const ok = title === 'debounce.ts' && focus1 === 'cb-inspector-title' && current === 'true' && board === 6 && !open && focus2 === 'cb-tile-open-it-snippet-debounce' && !problems.length;
  return { ok, observed: `title=${title}, focus=${focus1}->${focus2}, board visible=${board}, closed=${!open}` };
});

test('P5', 'search palette finds fixtures, opens the inspector without switching space, runs commands', async ({ page, clean }) => {
  await page.click('.cb-search-trigger');
  await page.waitForSelector('dialog[open] .cb-palette__input');
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('cb-palette__input'));
  await page.keyboard.type('moodboard');
  const selected = await page.$eval('[role="option"][aria-selected="true"]', (e) => e.textContent);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cb-inspector');
  const paletteOpen = await page.$('dialog[open]');
  const inspected = await page.$eval('#cb-inspector-title', (e) => e.textContent);
  const space = await h1(page);
  await page.click('.cb-inspector button:has-text("Im Space anzeigen")');
  const revealed = await h1(page);
  // keyboard shortcut + command
  await page.click('#cb-main', { position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+k');
  await page.waitForSelector('dialog[open] .cb-palette__input');
  await page.keyboard.type('ansicht liste');
  await page.keyboard.press('Enter');
  const view = await page.$eval('.cb-grid', (e) => e.dataset.view);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('xyz-kein-treffer');
  const empty = await page.$eval('.cb-palette__empty', (e) => e.textContent);
  await page.keyboard.press('Escape');
  const closed = !(await page.$('dialog[open]'));
  const problems = await clean();
  const ok = focused && /Moodboard Lavender Bokeh/.test(selected) && !paletteOpen && inspected === 'Moodboard Lavender Bokeh' && space === 'Entwicklung' && revealed === 'Design' && view === 'list' && /Keine Treffer/.test(empty) && closed && !problems.length;
  return { ok, observed: `selected="${selected}", inspector=${inspected}, space stays=${space}, reveal=${revealed}, command view=${view}, empty="${empty}", problems=${problems.length}` };
});

test('P6', 'composer opens from the inspector with source/preview/split and safe Markdown preview', async ({ page, clean }) => {
  await page.click('.cb-tile[data-item-id="it-prompt-review"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Im Composer öffnen")');
  await page.waitForSelector('.cb-composer');
  const mode = await page.$eval('.cb-composer', (e) => e.dataset.mode);
  const panes = await page.$$eval('.cb-composer__pane', (els) => els.length);
  const inspectorHidden = !(await page.$('.cb-inspector'));
  const previewH1 = await page.$eval('.cb-markdown h1', (e) => e.textContent);
  await page.fill('#cb-composer-source', '# Neu\n\n<img src=x onerror="window.__xss=1">');
  const status = await page.$eval('.cb-composer__status', (e) => e.textContent);
  const injected = await page.evaluate(() => ({ img: !!document.querySelector('.cb-markdown img'), xss: !!window.__xss }));
  await page.click('.cb-composer [role="radio"]:has-text("Vorschau")');
  const previewOnly = await page.$$eval('.cb-composer__pane', (els) => els.length);
  const rail = !!(await page.$('.cb-rail'));
  await page.click('[aria-label="Zurück zum Inspector"]');
  await page.waitForSelector('.cb-inspector');
  const problems = await clean();
  const ok = mode === 'split' && panes === 2 && inspectorHidden && previewH1 === 'Code-Review' && /nicht gespeichert/.test(status) && !injected.img && !injected.xss && previewOnly === 1 && rail && !problems.length;
  return { ok, observed: `mode=${mode}, panes=${panes}->${previewOnly}, rail=${rail}, status="${status}", injected=${JSON.stringify(injected)}` };
});

test('P7', 'recorder shell shows demo states and never requests the microphone', async ({ page, clean }) => {
  await page.click('[aria-label="Aufnahme öffnen (Demo)"]');
  await page.waitForSelector('.cb-recorder');
  const start = await page.$eval('.cb-recorder button:has-text("Starten")', (e) => e.disabled);
  await page.click('[aria-label="Session-Panel ausklappen"]');
  await page.click('.cb-recorder__state:has-text("Unterbrochen")');
  const status = await page.$eval('.cb-recorder', (e) => e.dataset.status);
  const label = await page.$eval('.cb-recorder__status', (e) => e.textContent);
  // Recorder survives navigation (D-008).
  await page.click('.cb-sidebar .cb-nav__item[title="Kunden"]');
  const persists = !!(await page.$('.cb-recorder'));
  await page.click('[aria-label="Recorder schließen"]');
  const closed = !(await page.$('.cb-recorder'));
  const problems = await clean();
  const ok = start && status === 'interrupted' && /es wird nichts aufgenommen/.test(label) && persists && closed && !problems.length;
  return { ok, observed: `start disabled=${start}, status=${status}, label="${label}", persists across spaces=${persists}, problems=${problems.join(' | ') || '-'}` };
});

test('P8', 'capture, drop, attachments and copy are demo-only: no card, no clipboard, no file access', async ({ page, clean }) => {
  const before = await tileIds(page);
  await page.fill('#cb-capture-input', 'Synthetischer Testtext');
  await page.click('.cb-capture button:has-text("Hinzufügen")');
  const n1 = await page.$eval('.cb-notice p', (e) => e.textContent);
  await page.evaluate(() => {
    const zone = document.querySelector('.cb-capture');
    const dt = new DataTransfer();
    dt.items.add(new File(['geheim'], 'privat.txt', { type: 'text/plain' }));
    window.__cbHits.length = 0; // the test itself just used DataTransfer.items
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  const n2 = await page.$eval('.cb-notice p', (e) => e.textContent);
  await page.hover('.cb-tile[data-item-id="it-note-standup"]');
  await page.click('.cb-tile[data-item-id="it-note-standup"] .cb-tile__actions button');
  const n3 = await page.$eval('.cb-notice p', (e) => e.textContent);
  const after = await tileIds(page);
  const kept = await page.$eval('#cb-capture-input', (e) => e.value);
  const problems = await clean();
  const ok = /nichts gespeichert/.test(n1) && /nicht übernommen/.test(n2) && /Zwischenablage wurde nicht verändert/.test(n3) && after.join() === before.join() && kept === 'Synthetischer Testtext' && !problems.length;
  return { ok, observed: `notices="${n1}" / "${n2}" / "${n3}", tiles unchanged=${after.join() === before.join()}, problems=${problems.join(' | ') || '-'}` };
});

test('P9', 'theme light/dark/system and sidebar modes are session-only preferences', async ({ page, clean, context }) => {
  await page.click('[aria-label="Erscheinungsbild"]');
  await page.click('.cb-popover__panel [role="radio"]:has-text("Dunkel")');
  const dark = await page.$eval('.cb-app', (e) => e.dataset.theme);
  await page.keyboard.press('Escape');
  await page.click('.cb-sidebar [aria-label="Seitenleiste"][aria-expanded]');
  await page.click('.cb-popover__panel [role="radio"]:has-text("Immer ausgefahren")');
  await page.mouse.move(900, 500);
  await settle(page);
  await page.waitForTimeout(350);
  const expanded = await page.$eval('.cb-app', (e) => ({ mode: e.dataset.sidebar, width: document.querySelector('.cb-sidebar').getBoundingClientRect().width }));
  // System follows the OS preference.
  const sys = await context.newPage();
  await sys.emulateMedia({ colorScheme: 'dark' });
  await sys.goto(PAGE);
  await sys.waitForSelector('.cb-app');
  const systemDark = await sys.$eval('.cb-app', (e) => e.dataset.theme);
  const reloadDefaults = await sys.$eval('.cb-app', (e) => e.dataset.sidebar);
  await sys.close();
  const problems = await clean();
  const ok = dark === 'dark' && expanded.mode === 'expanded' && expanded.width >= 240 && systemDark === 'dark' && reloadDefaults === 'dynamic' && !problems.length;
  return { ok, observed: `theme=${dark}, sidebar=${JSON.stringify(expanded)}, system(dark OS)=${systemDark}, new page sidebar=${reloadDefaults} (no persistence)` };
});

test('P10', 'dynamic sidebar expands as overlay without moving the workspace', async ({ page, clean }) => {
  const x0 = await page.$eval('#cb-main', (e) => e.getBoundingClientRect().left);
  await page.hover('.cb-sidebar');
  await page.waitForTimeout(500);
  const panel = await page.$eval('.cb-sidebar__panel', (e) => e.getBoundingClientRect().width);
  const x1 = await page.$eval('#cb-main', (e) => e.getBoundingClientRect().left);
  const problems = await clean();
  const ok = panel >= 240 && x0 === x1 && !problems.length;
  return { ok, observed: `panel width on hover=${panel}, workspace left ${x0} -> ${x1}` };
});

test('P11', 'empty space shows the living empty state; sessions show "not available"', async ({ page, clean }) => {
  await page.click('.cb-sidebar .cb-nav__item[title="Ideen"]');
  const empty = await page.$eval('.cb-empty', (e) => e.dataset.variant + ':' + e.querySelector('h2').textContent);
  await page.click('.cb-sidebar .cb-nav__item[title="Sessions"]');
  const sessions = await page.$eval('.cb-empty', (e) => e.dataset.variant);
  const problems = await clean();
  const ok = empty === 'space-empty:Dieser Space ist noch leer' && sessions === 'unavailable' && !problems.length;
  return { ok, observed: `ideen=${empty}, sessions=${sessions}` };
});

test('P12', 'phone: dock, spaces drawer, full-screen search and inspector, no horizontal overflow', { viewport: PHONE, touch: true }, async ({ page, clean }) => {
  const layout = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('.cb-sidebar')).display,
    dock: [...document.querySelectorAll('.cb-dock__button')].map((b) => b.textContent),
    overflow: document.documentElement.scrollWidth > innerWidth || document.querySelector('#cb-main').scrollWidth > document.querySelector('#cb-main').clientWidth,
  }));
  await page.click('.cb-dock__button:has-text("Spaces")');
  await page.waitForSelector('dialog[open] .cb-drawer');
  await page.click('dialog[open] .cb-nav__item[title="Kunden"]');
  await settle(page);
  const drawerClosed = !(await page.$('dialog[open]'));
  const title = await h1(page);
  await page.click('.cb-dock__button:has-text("Suche")');
  // offsetWidth ignores the pop-in transform of the entry animation.
  const paletteWidth = await page.$eval('dialog[open] .cb-dialog__panel', (e) => e.offsetWidth);
  await page.keyboard.press('Escape');
  await page.click('.cb-tile[data-item-id="it-brief"] .cb-tile__open');
  const inspector = await page.$eval('.cb-inspector', (e) => ({ w: e.offsetWidth, pos: getComputedStyle(e).position }));
  await page.click('[aria-label="Inspector schließen"]');
  await page.click('.cb-dock__button:has-text("Erfassen")');
  await settle(page);
  const captureFocused = await focusedId(page);
  await page.click('.cb-dock__button:has-text("Aufnahme")');
  const recorder = await page.$eval('.cb-recorder', (e) => e.getBoundingClientRect().bottom);
  const dockTop = await page.$eval('.cb-dock', (e) => e.getBoundingClientRect().top);
  const problems = await clean();
  const ok = layout.sidebar === 'none' && layout.dock.join() === 'Spaces,Suche,Erfassen,Aufnahme' && !layout.overflow && drawerClosed && title === 'Kunden' && paletteWidth === 390 && inspector.w === 390 && inspector.pos === 'fixed' && captureFocused === 'cb-capture-input' && recorder <= dockTop && !problems.length;
  return { ok, observed: `${JSON.stringify(layout)}, drawer->${title}, palette w=${paletteWidth}, inspector=${JSON.stringify(inspector)}, capture focus=${captureFocused}, recorder above dock=${recorder <= dockTop}` };
});

test('P13', 'reduced motion: no transitions, no ambient drift', { reducedMotion: 'reduce' }, async ({ page, clean }) => {
  const motion = await page.evaluate(() => ({
    tile: getComputedStyle(document.querySelector('.cb-tile__open')).transitionDuration,
    orb: getComputedStyle(document.querySelector('.cb-ambient__orb')).animationName,
  }));
  const problems = await clean();
  const ok = motion.tile.split(',').every((d) => parseFloat(d) === 0) && motion.orb === 'none' && !problems.length;
  return { ok, observed: JSON.stringify(motion) };
});

browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const t of tests) {
  const t0 = Date.now();
  let r;
  let app;
  try {
    app = await openPreview(t.opts);
    r = await t.fn(app);
  } catch (e) {
    r = { ok: false, observed: 'Testfehler: ' + String(e.message || e).split('\n')[0] };
  }
  await app?.context.close().catch(() => {});
  results.push({ id: t.id, title: t.title, status: r.ok ? 'PASS' : 'FAIL', observed: r.observed, ms: Date.now() - t0 });
  console.log(`${t.id} [${r.ok ? 'PASS' : 'FAIL'}] ${t.title}\n    → ${r.observed}`);
}
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'preview-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results }, null, 2));
const failed = results.filter((r) => r.status !== 'PASS');
console.log(`summary: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
