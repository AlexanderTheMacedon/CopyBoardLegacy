// React app suite: the app at /preview.html boots, its core interactions work on desktop and phone, Universal Paste captures
// real clipboard data into the local IndexedDB store (and survives a reload), and at runtime it touches no legacy storage, no
// network beyond its own static assets and no microphone. Clipboard and drag data are read only in the tests that paste/drop.
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
    permissions: opts.clipboard ? ['clipboard-read', 'clipboard-write'] : [],
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
  // indexedDB is the app's own store and always allowed; anything else must be allowed per test.
  const clean = async (allow = []) => {
    const hits = await page.evaluate(() => window.__cbHits);
    const problems = [
      ...hits.filter((h) => h !== 'indexedDB' && !allow.some((a) => h.startsWith(a))).map((h) => `api:${h}`),
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
// the departing board (board-departure.ts) is an inert copy for a moment after a change: never content
const LIVE_TILES = '.cb-grid .cb-tile:not(.cb-departure *)';
const tileIds = (page) => page.$$eval(LIVE_TILES, (els) => els.map((e) => e.dataset.itemId));
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// Dock navigation: spaces live in the flyout of the active-space switcher, collections and utilities in the folded section.
async function gotoSpace(page, name) {
  await page.hover('.cb-space-switch__trigger');
  await page.click(`.cb-spaces-flyout__item[title="${name}"]`);
  await page.mouse.move(900, 600);
}
async function dockItem(page, title) {
  await page.hover('.cb-navdock');
  await page.click(`.cb-navdock__item[title="${title}"]`);
  await page.mouse.move(900, 600);
}
const tileCount = (page) => page.$$eval(LIVE_TILES, (els) => els.length);

test('P1', 'preview boots as the React shell without errors, storage or network', async ({ page, clean }) => {
  const status = await page.$eval('#preview-root', (e) => e.dataset.previewStatus);
  const shell = await page.evaluate(() => ({
    dock: !!document.querySelector('aside.cb-navdock-rail'),
    main: !!document.querySelector('main#cb-main'),
    capture: !!document.querySelector('#cb-capture-input'),
    tiles: document.querySelectorAll('.cb-grid .cb-tile').length,
    theme: document.querySelector('.cb-app')?.dataset.theme,
  }));
  const problems = await clean();
  const storage = await page.$eval('#preview-root', (e) => e.dataset.storage);
  const ok = status === 'local-capture' && storage === 'local' && shell.dock && shell.main && shell.capture && shell.tiles === 6 && shell.theme === 'light' && !problems.length;
  return { ok, observed: `status=${status}, ${JSON.stringify(shell)}, problems=${problems.join(' | ') || '-'}` };
});

test('P2', 'spaces switch via the dock flyout; only the active space stays visible; content changes', async ({ page, clean }) => {
  const before = await tileIds(page);
  const restingFlyout = await page.$eval('.cb-spaces-flyout', (e) => getComputedStyle(e).visibility);
  await gotoSpace(page, 'Design');
  await page.waitForTimeout(450);
  const title = await h1(page);
  const after = await tileIds(page);
  const current = [await page.$eval('.cb-space-switch__trigger', (e) => e.title)];
  const closedAfter = await page.$eval('.cb-space-switch', (e) => !e.hasAttribute('data-open'));
  await dockItem(page, 'Favoriten');
  const favTitle = await h1(page);
  const chips = await page.$$eval('.cb-grid .cb-space-chip', (els) => els.length);
  const problems = await clean();
  const ok = restingFlyout === 'hidden' && closedAfter && title === 'Design' && after.length === 4 && !after.some((id) => before.includes(id)) && current.join() === 'Design' && favTitle === 'Favoriten' && chips > 0 && !problems.length;
  return { ok, observed: `flyout at rest=${restingFlyout}, closes after choice=${closedAfter}, title=${title}, tiles=${after.length}, current=${current}, favorites chips=${chips}, problems=${problems.join(' | ') || '-'}` };
});

test('P3', 'grid/list and density switch keep the order and share one preference state', async ({ page, clean }) => {
  const order = await tileIds(page);
  await page.click('[role="radio"][aria-label="Liste"]');
  const view = await page.$eval('.cb-grid', (e) => e.dataset.view);
  const listOrder = await tileIds(page);
  await page.click('.cb-view-controls [role="radio"]:has-text("Kompakt")');
  const density = await page.$eval('.cb-grid', (e) => e.dataset.density);
  await dockItem(page, 'Einstellungen');
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

test('P6', 'editor opens from the inspector: read-only example with an explicit local copy, source/preview/split, safe preview, one close control top right', async ({ page, clean }) => {
  await page.click('.cb-tile[data-item-id="it-prompt-review"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  await page.waitForSelector('.cb-md .cm-content');
  const mode = await page.$eval('.cb-composer', (e) => e.dataset.mode);
  const panes = await page.$$eval('.cb-composer__pane', (els) => els.length);
  const inspectorHidden = !(await page.$('.cb-inspector'));
  const previewH1 = await page.$eval('.cb-markdown h1', (e) => e.textContent);
  const readOnly = await page.evaluate(() => ({
    editable: document.querySelector('.cb-md .cm-content').getAttribute('contenteditable'),
    notice: !!document.querySelector('.cb-composer__notice'),
    status: document.querySelector('.cb-composer__status').textContent,
  }));
  // the example is never written: editing needs an explicit local copy
  await page.click('.cb-composer__notice button');
  await page.waitForFunction(() => document.querySelector('#cb-composer-title')?.value?.endsWith('(Kopie)'));
  await page.click('.cb-md .cm-content');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('# Neu\n\n<img src=x onerror="window.__xss=1">');
  await page.waitForFunction(() => /<img src=x/.test(document.querySelector('.cb-markdown').textContent));
  const injected = await page.evaluate(() => ({ img: !!document.querySelector('.cb-markdown img'), xss: !!window.__xss, text: document.querySelector('.cb-markdown').textContent }));
  await page.click('.cb-composer [role="radio"]:has-text("Vorschau")');
  // both surfaces stay mounted (Run D.1); the hidden one is inert
  const previewOnly = await page.evaluate(() => ({ panes: document.querySelectorAll('.cb-md > .cb-composer__pane[data-shown="true"]').length, sourceHidden: document.querySelector('.cb-md__source').inert }));
  const rail = !!(await page.$('.cb-rail'));
  // Header: no back arrow; while the rail is open only the rail's own ✕ controls it; close sits at the far right.
  const header = await page.$eval('.cb-composer__header', (h) => ({
    back: !!h.querySelector('[aria-label*="Zurück"]'),
    railToggle: !!h.querySelector('[aria-label*="Kontextleiste"]'),
    lastIsClose: h.lastElementChild?.getAttribute('aria-label') === 'Editor schließen',
  }));
  await page.click('[aria-label="Kontextleiste schließen"]');
  const reopen = await page.$$eval('.cb-composer__header [aria-label="Kontextleiste einblenden"]', (els) => els.length);
  await page.waitForFunction(() => /Gespeichert/.test(document.querySelector('.cb-composer__status').textContent));
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  const problems = await clean();
  const ok = mode === 'split' && panes === 2 && inspectorHidden && previewH1 === 'Code-Review' && readOnly.editable === 'false' && readOnly.notice && /schreibgeschützt/.test(readOnly.status) && !injected.img && !injected.xss && /<img src=x/.test(injected.text) && previewOnly.panes === 1 && previewOnly.sourceHidden && rail && !header.back && !header.railToggle && header.lastIsClose && reopen === 1 && !problems.length;
  return { ok, observed: `mode=${mode}, panes=${panes}->${JSON.stringify(previewOnly)}, readOnly=${JSON.stringify(readOnly)}, rail=${rail}, header=${JSON.stringify(header)}, reopen buttons=${reopen}, injected=${JSON.stringify({ img: injected.img, xss: injected.xss })}, problems=${problems.join(' | ') || '-'}` };
});

test('P7', 'recorder shell shows demo states and never requests the microphone', async ({ page, clean }) => {
  await page.click('[aria-label="Aufnahme öffnen"]');
  await page.waitForSelector('.cb-recorder');
  const start = await page.$eval('.cb-recorder button:has-text("Starten")', (e) => e.disabled);
  await page.click('[aria-label="Session-Panel ausklappen"]');
  await page.click('.cb-recorder__state:has-text("Unterbrochen")');
  const status = await page.$eval('.cb-recorder', (e) => e.dataset.status);
  const label = await page.$eval('.cb-recorder__status', (e) => e.textContent);
  // Recorder survives navigation (D-008).
  await gotoSpace(page, 'Kunden');
  const persists = !!(await page.$('.cb-recorder'));
  await page.click('[aria-label="Recorder schließen"]');
  const closed = !(await page.$('.cb-recorder'));
  const problems = await clean();
  const ok = start && status === 'interrupted' && /es wird nichts aufgenommen/.test(label) && persists && closed && !problems.length;
  return { ok, observed: `start disabled=${start}, status=${status}, label="${label}", persists across spaces=${persists}, problems=${problems.join(' | ') || '-'}` };
});

test('P8', 'Universal Paste: ⌘V on the board stores text, URL and a screenshot; all survive a reload', { clipboard: true }, async ({ page, clean }) => {
  const before = await tileCount(page);
  const paste = async (write) => {
    await page.evaluate(write);
    await page.evaluate(() => (window.__cbHits.length = 0)); // the test itself used the clipboard API to prepare data
    await page.mouse.click(720, 135); // free header area of the board (the bottom centre belongs to the composer): nothing editable has focus
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForSelector('.cb-notice[data-tone="success"]');
    const message = await page.$eval('.cb-notice p', (e) => e.textContent);
    await page.click('[aria-label="Hinweis schließen"]');
    return message;
  };
  const n1 = await paste(() => navigator.clipboard.writeText('Synthetischer Testtext aus der Zwischenablage'));
  const n2 = await paste(() => navigator.clipboard.writeText('https://example.org/copyboard'));
  const n3 = await paste(async () => {
    const canvas = new OffscreenCanvas(64, 40);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8590c';
    ctx.fillRect(0, 0, 64, 40);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await canvas.convertToBlob({ type: 'image/png' }) })]);
  });
  const kinds = await page.$$eval('.cb-grid .cb-tile', (els) => els.slice(0, 3).map((e) => e.dataset.kind));
  const problems = await clean(['DataTransfer.']);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await page.waitForFunction(() => document.querySelector('.cb-tile[data-kind="image"] img')?.naturalWidth > 0);
  const after = await tileCount(page);
  const kindsAfter = await page.$$eval('.cb-grid .cb-tile', (els) => els.slice(0, 3).map((e) => e.dataset.kind));
  const pixels = await page.$eval('.cb-tile[data-kind="image"] img', (e) => `${e.naturalWidth}x${e.naturalHeight}`);
  const ok = /Text gespeichert/.test(n1) && /Link gespeichert/.test(n2) && /Bild gespeichert/.test(n3) && kinds.join() === 'image,link,text' && after === before + 3 && kindsAfter.join() === kinds.join() && pixels === '64x40' && !problems.length;
  return { ok, observed: `notices="${n1}" / "${n2}" / "${n3}", top kinds=${kinds}, tiles ${before}->${after} after reload, image ${pixels}, problems=${problems.join(' | ') || '-'}` };
});

test('P9', 'paste keeps native behaviour in editable fields; capture bar, drop and context menu paste save locally', { clipboard: true }, async ({ page, clean }) => {
  const before = await tileCount(page);
  await page.evaluate(() => navigator.clipboard.writeText('nur ins Feld'));
  await page.click('#cb-capture-input');
  await page.keyboard.press('ControlOrMeta+V');
  await page.click('.cb-search-trigger');
  await page.waitForSelector('dialog[open] .cb-palette__input');
  await page.keyboard.press('ControlOrMeta+V');
  const searchValue = await page.$eval('.cb-palette__input', (e) => e.value);
  await page.keyboard.press('Escape');
  const captureValue = await page.$eval('#cb-capture-input', (e) => e.value);
  const unchanged = (await tileCount(page)) === before;
  // capture bar: explicit "Hinzufügen" saves what was typed/pasted
  await page.click('.cb-capture button:has-text("Hinzufügen")');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  // drop a file onto the board
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['synthetisch'], 'notiz.csv', { type: 'text/csv' }));
    const target = document.querySelector('.cb-grid');
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForSelector('.cb-tile[data-kind="file"] >> text=notiz.csv');
  // context menu → Einfügen (async Clipboard API with granted permission)
  await page.evaluate(() => navigator.clipboard.writeText('# Aus dem Kontextmenü\n\n- eins\n- zwei'));
  await page.mouse.click(720, 135, { button: 'right' });
  await page.waitForSelector('.cb-context-menu');
  const firstEntry = await page.$eval('.cb-context-menu [role="menuitem"]', (e) => e.textContent);
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Einfügen")');
  await page.waitForSelector('.cb-tile[data-kind="markdown"] >> text=Aus dem Kontextmenü');
  const after = await tileCount(page);
  const problems = await clean(['DataTransfer.', 'clipboard.']);
  const ok = searchValue === 'nur ins Feld' && captureValue === 'nur ins Feld' && unchanged && /Einfügen/.test(firstEntry) && after === before + 3 && !problems.length;
  return { ok, observed: `search="${searchValue}", capture="${captureValue}", no card from field paste=${unchanged}, menu first="${firstEntry}", tiles ${before}->${after}, problems=${problems.join(' | ') || '-'}` };
});

test('P14', 'context menus: board and card menus, keyboard, Escape; favourite and delete with undo work and persist', { clipboard: true }, async ({ page, clean }) => {
  await page.mouse.click(720, 135, { button: 'right' });
  await page.waitForSelector('.cb-context-menu');
  const inViewport = await page.$eval('.cb-context-menu', (e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; });
  await page.keyboard.press('ArrowDown');
  const active = await page.$eval('.cb-context-menu [data-active]', (e) => e.textContent);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cb-context-menu', { state: 'detached' });
  // favourite a fixture card via its menu
  await page.click('.cb-tile[data-item-id="it-note-standup"] .cb-tile__open', { button: 'right' });
  const entries = await page.$$eval('.cb-context-menu [role="menuitem"]', (els) => els.map((e) => e.textContent));
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Zu Favoriten")');
  await page.waitForSelector('.cb-tile[data-item-id="it-note-standup"] .cb-tile__favorite');
  // own item: paste, delete, undo
  await page.evaluate(() => navigator.clipboard.writeText('Wird gelöscht und wiederhergestellt'));
  await page.mouse.click(720, 135);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-tile[data-kind="text"] >> text=Wird gelöscht');
  const own = await page.$eval('.cb-grid .cb-tile', (e) => e.dataset.itemId);
  await page.click(`.cb-tile[data-item-id="${own}"] .cb-tile__open`, { button: 'right' });
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Löschen")');
  await page.waitForSelector(`.cb-tile[data-item-id="${own}"]`, { state: 'detached' });
  await page.click('.cb-notice__action:has-text("Rückgängig")');
  await page.waitForSelector(`.cb-tile[data-item-id="${own}"]`);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  const persisted = await page.evaluate((id) => ({ fav: !!document.querySelector('.cb-tile[data-item-id="it-note-standup"] .cb-tile__favorite'), own: !!document.querySelector(`.cb-tile[data-item-id="${id}"]`) }), own);
  // native menu stays in editable fields
  await page.click('#cb-capture-input', { button: 'right' });
  const customInField = !!(await page.$('.cb-context-menu'));
  const problems = await clean(['DataTransfer.', 'clipboard.']);
  const ok = inViewport && /Neuer Eintrag/.test(active) && entries[0] === 'Öffnen' && !entries.includes('Löschen') && persisted.fav && persisted.own && !customInField && !problems.length;
  return { ok, observed: `menu in viewport=${inViewport}, ArrowDown→"${active}", fixture entries=${entries.join('/')}, persisted=${JSON.stringify(persisted)}, custom menu in field=${customInField}, problems=${problems.join(' | ') || '-'}` };
});

test('P15', 'light by default even with a dark OS; an explicit theme choice persists', { colorScheme: 'dark' }, async ({ page, clean }) => {
  const initial = await page.$eval('.cb-app', (e) => e.dataset.theme);
  await dockItem(page, 'Dunkles Design');
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  const reloaded = await page.$eval('.cb-app', (e) => e.dataset.theme);
  const problems = await clean();
  const ok = initial === 'light' && reloaded === 'dark' && !problems.length;
  return { ok, observed: `dark OS first start=${initial}, after choosing dark + reload=${reloaded}` };
});

test('P10', 'dock is compact and its rest box is centred on the viewport (shared midpoint with the right dock); it grows up and down around the core as an overlay', async ({ page, clean }) => {
  const box = () => page.$eval('.cb-navdock', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, bottom: r.bottom }; });
  const core = () => page.$eval('.cb-navdock__core', (e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  const x0 = await page.$eval('#cb-main', (e) => e.getBoundingClientRect().left);
  const rest = await box();
  const coreRest = await core();
  await page.hover('.cb-space-switch__trigger');
  await page.waitForTimeout(800);
  const open = await box();
  const coreOpen = await core();
  const flyout = await page.$eval('.cb-space-switch', (e) => e.hasAttribute('data-open'));
  const x1 = await page.$eval('#cb-main', (e) => e.getBoundingClientRect().left);
  const problems = await clean();
  const ok = rest.h < 260 && rest.w <= 64 && open.w >= 220 && open.top < rest.top && open.bottom > rest.bottom && Math.abs((rest.top + rest.bottom) / 2 - 450) <= 1 && coreRest === coreOpen && flyout && x0 === x1 && !problems.length;
  return { ok, observed: `rest=${JSON.stringify(rest)}, open=${JSON.stringify(open)}, core centre ${coreRest} -> ${coreOpen}, flyout open=${flyout}, workspace left ${x0} -> ${x1}` };
});

test('P11', 'empty space shows the living empty state; sessions show "not available"', async ({ page, clean }) => {
  await gotoSpace(page, 'Ideen');
  const empty = await page.$eval('.cb-empty', (e) => e.dataset.variant + ':' + e.querySelector('h2').textContent);
  await dockItem(page, 'Sessions');
  const sessions = await page.$eval('.cb-empty', (e) => e.dataset.variant);
  const problems = await clean();
  const ok = empty === 'space-empty:Dieser Space ist noch leer' && sessions === 'unavailable' && !problems.length;
  return { ok, observed: `ideen=${empty}, sessions=${sessions}` };
});

test('P12', 'phone: dock, spaces drawer, full-screen search and inspector, no horizontal overflow', { viewport: PHONE, touch: true }, async ({ page, clean }) => {
  const layout = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('.cb-navdock-rail')).display,
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
  // "Neu" opens the one create sheet; its quick note focuses the capture bar
  await page.click('.cb-dock__button:has-text("Neu")');
  await page.waitForSelector('dialog[open] .cb-create');
  const sheet = await page.$eval('dialog[open] .cb-dialog__panel', (e) => ({ right: e.getBoundingClientRect().right, bottom: e.getBoundingClientRect().bottom }));
  await page.click('.cb-create__main:has-text("Schnellnotiz")');
  await settle(page);
  const captureFocused = await focusedId(page);
  await page.click('.cb-dock__button:has-text("Aufnahme")');
  const recorder = await page.$eval('.cb-recorder', (e) => e.getBoundingClientRect().bottom);
  const dockTop = await page.$eval('.cb-dock', (e) => e.getBoundingClientRect().top);
  const problems = await clean();
  const ok = layout.sidebar === 'none' && layout.dock.join() === 'Spaces,Suche,Neu,Aufnahme' && sheet.right <= 390 && sheet.bottom <= 844 && !layout.overflow && drawerClosed && title === 'Kunden' && paletteWidth === 390 && inspector.w === 390 && inspector.pos === 'fixed' && captureFocused === 'cb-capture-input' && recorder <= dockTop && !problems.length;
  return { ok, observed: `${JSON.stringify(layout)}, drawer->${title}, palette w=${paletteWidth}, inspector=${JSON.stringify(inspector)}, capture focus=${captureFocused}, recorder above dock=${recorder <= dockTop}` };
});

test('P13', 'reduced motion: no transitions; the photographic scene is static', { reducedMotion: 'reduce' }, async ({ page, clean }) => {
  const motion = await page.evaluate(() => {
    const photo = document.querySelector('.cb-scene__photo[data-front]');
    return {
      tile: getComputedStyle(document.querySelector('.cb-tile__open')).transitionDuration,
      scene: getComputedStyle(photo).animationName,
      fade: getComputedStyle(photo).transitionDuration,
      still: document.querySelector('.cb-scene').hasAttribute('data-still'),
      photo: /\.jpg/.test(getComputedStyle(photo).backgroundImage),
    };
  });
  const problems = await clean();
  const zero = (list) => list.split(',').every((d) => parseFloat(d) === 0);
  const ok = zero(motion.tile) && zero(motion.fade) && motion.scene === 'none' && motion.still && motion.photo && !problems.length;
  return { ok, observed: JSON.stringify(motion) };
});

// Workspace run (folders, selection, drag & drop, spaces): every change is written to the local store and survives a reload.
const dragTo = async (page, fromSel, toSel) => {
  const a = await (await page.$(fromSel)).boundingBox();
  const b = await (await page.$(toSel)).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 24, a.y + 24, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(380); // merge targets arm after a short dwell
  await page.mouse.up();
};

test('P16', 'card on card creates a folder; selection + drop on folder moves; folder window, undo and reload keep the data', async ({ page, clean }) => {
  await dragTo(page, '.cb-tile[data-item-id="it-note-standup"]', '.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open');
  await page.waitForSelector('.cb-tile--folder');
  const created = await page.$eval('.cb-notice p', (e) => e.textContent);
  const boardAfterMerge = await tileCount(page);
  // multi-select with the check and Shift, then drop the selection on the folder
  await page.hover('.cb-tile[data-item-id="it-shot-error"]');
  await page.click('.cb-tile[data-item-id="it-shot-error"] .cb-tile__check');
  await page.click('.cb-tile[data-item-id="it-log-build"] .cb-tile__open', { modifiers: ['Shift'] });
  const selCount = await page.$eval('.cb-selbar__num', (e) => e.textContent);
  await dragTo(page, '.cb-tile[data-item-id="it-shot-error"]', '.cb-tile--folder .cb-tile__open');
  await page.waitForFunction(() => !document.querySelector('.cb-selbar'));
  const boardAfterMove = await tileCount(page);
  // the folder window shows the four entries; a subfolder can be created inside; Escape closes it
  await page.click('.cb-tile--folder .cb-tile__open');
  await page.waitForSelector('.cb-folder-window');
  const inFolder = await page.$$eval('.cb-folder-window .cb-tile', (els) => els.length);
  const crumbs = await page.$$eval('.cb-crumb__label', (els) => els.map((e) => e.textContent));
  await page.click('.cb-folder-window [aria-label="Neuer Unterordner"]');
  await page.fill('#cb-folder-name', 'Unterordner');
  await page.click('dialog[open] button:has-text("Erstellen")');
  await page.waitForSelector('.cb-folder-window .cb-tile--folder');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cb-folder-window', { state: 'detached' });
  // delete the folder with its contents via its menu → confirmation → undo restores it
  await page.click('.cb-tile--folder .cb-tile__open', { button: 'right' });
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Ordner löschen")');
  await page.waitForSelector('dialog[open] button:has-text("Löschen")');
  const confirmText = await page.$eval('dialog[open] .cb-form__text', (e) => e.textContent);
  await page.click('dialog[open] .cb-button--danger-solid');
  await page.waitForSelector('.cb-tile--folder', { state: 'detached' });
  // the four entries are fixtures: they are never deleted and fall back to the board until undo re-creates the folder
  const afterDelete = await tileCount(page);
  await page.click('.cb-notice__action:has-text("Rückgängig")');
  await page.waitForSelector('.cb-tile--folder');
  const problems = await clean();
  await page.reload();
  await page.waitForSelector('.cb-tile');
  const reloaded = { tiles: await tileCount(page), folders: await page.$$eval('.cb-tile--folder .cb-tile__meta', (els) => els.map((e) => e.textContent)) };
  const ok =
    /Ordner mit 2 Einträgen/.test(created) &&
    boardAfterMerge === 5 &&
    selCount === '2' &&
    boardAfterMove === 3 &&
    inFolder === 4 &&
    crumbs.join('›') === 'Entwicklung›Neuer Ordner' &&
    /Der Ordner enthält 4 Inhalte/.test(confirmText) && /4 Beispielinhalte bleiben/.test(confirmText) &&
    afterDelete === 6 &&
    reloaded.tiles === 3 &&
    /4 Inhalte · 1 Ordner/.test(reloaded.folders.join()) &&
    !problems.length;
  return { ok, observed: `created="${created}", board 6->${boardAfterMerge}->${boardAfterMove}, selected=${selCount}, folder shows ${inFolder}, crumbs=${crumbs.join('›')}, confirm="${confirmText.trim()}", after delete=${afterDelete}, reload=${JSON.stringify(reloaded)}, problems=${problems.join(' | ') || '-'}` };
});

test('P17', 'spaces: create with icon and colour, rename, per-space view default, ⌘V into an open folder; everything persists', { clipboard: true }, async ({ page, clean }) => {
  await page.hover('.cb-space-switch__trigger');
  await page.click('.cb-spaces-flyout__item--new >> text=Neuer Space');
  await page.fill('#cb-space-name', 'Projekte');
  await page.fill('dialog[open] .cb-iconpicker__search input', 'rakete');
  await page.click('dialog[open] .cb-iconpicker__option[title="Rakete"]');
  await page.click('dialog[open] [aria-label="Türkis"]');
  await page.click('dialog[open] [role="radiogroup"][aria-label="Bevorzugte Ansicht"] [role="radio"]:has-text("Dateien")');
  await page.click('dialog[open] button:has-text("Erstellen")');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const title = await h1(page);
  const empty = await page.$eval('.cb-empty', (e) => e.dataset.variant);
  // the new space opens in its preferred view; the global preference stays grid
  const viewPref = await page.$eval('[role="radiogroup"][aria-label="Ansicht"] [aria-checked="true"]', (e) => e.getAttribute('aria-label'));
  await gotoSpace(page, 'Entwicklung');
  const viewBack = await page.$eval('[role="radiogroup"][aria-label="Ansicht"] [aria-checked="true"]', (e) => e.getAttribute('aria-label'));
  // rename + icon of a fixture space through the header identity
  await page.click('.cb-hero__identity');
  await page.fill('#cb-space-name', 'Dev');
  await page.click('dialog[open] .cb-iconpicker__tab:has-text("Emoji")');
  await page.click('dialog[open] .cb-iconpicker__option[title="Entwicklung"]');
  await page.click('dialog[open] button:has-text("Speichern")');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const renamed = await h1(page);
  const dockTitle = await page.$eval('.cb-space-switch__trigger', (e) => e.title);
  // a folder created from the header; ⌘V while it is open stores the text inside the folder
  await page.click('[aria-label="Neuer Ordner"]');
  await page.fill('#cb-folder-name', 'Eingang');
  await page.click('dialog[open] button:has-text("Erstellen")');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click('[aria-label="Hinweis schließen"]');
  await page.click('.cb-tile--folder .cb-tile__open');
  await page.waitForSelector('.cb-folder-window');
  await page.waitForTimeout(500); // the window grows out of the tile; a click during that motion would hit the veil
  await page.evaluate(() => navigator.clipboard.writeText('Notiz direkt in den Ordner'));
  await page.evaluate(() => (window.__cbHits.length = 0));
  await page.mouse.click(700, 600);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  const pasted = await page.$eval('.cb-notice p', (e) => e.textContent);
  await page.waitForSelector('.cb-folder-window .cb-tile[data-kind="text"]');
  const problems = await clean(['DataTransfer.']);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  const after = {
    title: await h1(page),
    folderMeta: await page.$eval('.cb-tile--folder .cb-tile__meta', (e) => e.textContent),
    spaces: await page.$$eval('.cb-spaces-flyout__item[title]', (els) => els.map((e) => e.title)),
    emoji: await page.$eval('.cb-space-switch__trigger .cb-glyph__emoji', (e) => e.textContent),
  };
  const ok =
    title === 'Projekte' &&
    empty === 'space-empty' &&
    viewPref === 'Dateien' &&
    viewBack === 'Raster' &&
    renamed === 'Dev' &&
    dockTitle === 'Dev' &&
    /Text gespeichert · Dev › Eingang/.test(pasted) &&
    after.title === 'Dev' &&
    /1 Inhalt/.test(after.folderMeta) &&
    after.spaces.join() === 'Dev,Design,Kunden,Ideen,Projekte' &&
    after.emoji === '🧑‍💻' &&
    !problems.length;
  return { ok, observed: `new space=${title}/${empty}/${viewPref} then ${viewBack}, renamed=${renamed}/${dockTitle}, paste="${pasted}", reload=${JSON.stringify(after)}, problems=${problems.join(' | ') || '-'}` };
});

// Experience & Motion Closure: select-all only acts on the visible rows, the composer floats at the bottom, image mode
// hides the workspace and Escape returns to it unchanged.
test('P18', 'file view select-all (mixed/all/none), bottom composer, image mode in and out with Escape', async ({ page, clean }) => {
  await page.click('.cb-view-controls [role="radio"] >> nth=-1');
  await page.waitForSelector('.cb-files');
  await page.click('.cb-files__row .cb-tile__check >> nth=0');
  const mixed = await page.$eval('.cb-files__check-all', (e) => e.getAttribute('aria-checked'));
  await page.click('.cb-files__check-all');
  const all = await page.evaluate(() => [document.querySelector('.cb-files__check-all').getAttribute('aria-checked'), document.querySelectorAll('.cb-files__row[data-checked]').length, document.querySelectorAll('.cb-files__row').length]);
  await page.click('.cb-files__check-all');
  const none = await page.evaluate(() => [document.querySelector('.cb-files__check-all').getAttribute('aria-checked'), document.querySelectorAll('.cb-files__row[data-checked]').length]);
  await settle(page);
  const composer = await page.$eval('.cb-composer-dock .cb-capture', (e) => Math.round(innerHeight - e.getBoundingClientRect().bottom));
  await page.hover('.cb-scene-credit');
  await page.click('.cb-scene-credit__cinema');
  await page.waitForSelector('.cb-cinema');
  const inCinema = await page.evaluate(() => ({ stage: document.querySelector('.cb-stage').inert, cinema: document.querySelector('.cb-app').hasAttribute('data-cinema') }));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cb-cinema', { state: 'detached' });
  const back = await page.evaluate(() => ({ stage: document.querySelector('.cb-stage').inert, files: !!document.querySelector('.cb-files') }));
  const problems = await clean();
  const ok =
    mixed === 'mixed' && all[0] === 'true' && all[1] === all[2] && all[2] > 1 && none[0] === 'false' && none[1] === 0 &&
    composer > 0 && composer < 48 && inCinema.stage && inCinema.cinema && !back.stage && back.files && !problems.length;
  return { ok, observed: `select-all ${mixed}→${all.join('/')}→${none.join('/')}, composer bottom gap=${composer}, cinema=${JSON.stringify(inCinema)}, back=${JSON.stringify(back)}` };
});

// Motion Masterpiece: the scrolled header becomes a vertical right dock (one morphing island), image mode accepts a real
// paste, the composer's blur aura is local and visual only, and the magnetic grid never interferes with drag & drop.
const SHORT = { width: 1280, height: 600 };
const morphsRunning = (page) =>
  page.evaluate(() => document.querySelector('.cb-toolbar__island').getAnimations({ subtree: true }).filter((a) => a.id === 'cb-morph' && a.playState === 'running').length);

test('P19', 'scrolled header morphs into a vertical right dock: search and new entry work, inspector-aware, back on scroll up', { viewport: SHORT }, async ({ page, clean }) => {
  const island = () =>
    page.$eval('.cb-toolbar__island', (e) => {
      const r = e.getBoundingClientRect();
      const slot = (sel) => Math.round(e.querySelector(sel).getBoundingClientRect().top);
      return {
        fixed: getComputedStyle(e).position === 'fixed',
        column: getComputedStyle(e).flexDirection === 'column',
        right: Math.round(innerWidth - r.right),
        centre: Math.round(r.top + r.height / 2 - innerHeight / 2),
        upright: r.height > r.width * 2,
        order: [slot('.cb-toolbar__identity'), slot('.cb-search-trigger'), slot('.cb-toolbar__capture'), slot('.cb-trust')],
        identityInert: e.querySelector('.cb-toolbar__identity').inert,
        captureInert: e.querySelector('.cb-toolbar__capture').inert,
      };
    });
  const rest = await island();
  await page.mouse.move(640, 300);
  await page.$eval('.cb-workspace', (e) => e.scrollTo({ top: 150 }));
  await page.waitForSelector('.cb-toolbar[data-collapsed]');
  // a quick direction change mid-morph settles in a stable state with nothing left running
  await page.$eval('.cb-workspace', (e) => e.scrollTo({ top: 0 }));
  await page.waitForTimeout(60);
  await page.$eval('.cb-workspace', (e) => e.scrollTo({ top: 150 }));
  await page.waitForTimeout(900);
  const dock = await island();
  const running = await morphsRunning(page);
  await page.click('.cb-search-trigger');
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click('.cb-toolbar__capture');
  const captureFocus = await focusedId(page);
  // the inspector arrives: the dock keeps to the board's side of it
  await page.keyboard.press('Escape');
  await page.$eval('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open', (e) => e.click());
  await page.waitForSelector('.cb-inspector');
  await page.$eval('.cb-workspace', (e) => e.scrollTo({ top: 150 }));
  await page.waitForTimeout(700);
  const beside = await page.evaluate(() => Math.round(document.querySelector('.cb-inspector').getBoundingClientRect().left - document.querySelector('.cb-toolbar__island').getBoundingClientRect().right));
  await page.keyboard.press('Escape');
  await page.$eval('.cb-workspace', (e) => e.scrollTo({ top: 0 }));
  await page.waitForSelector('.cb-toolbar:not([data-collapsed])');
  await page.waitForTimeout(800);
  const back = await island();
  const problems = await clean();
  const ok =
    !rest.fixed && rest.identityInert && rest.captureInert &&
    dock.fixed && dock.column && dock.upright && dock.right >= 12 && dock.right <= 40 && Math.abs(dock.centre) <= 2 &&
    dock.order.every((v, i, a) => i === 0 || v > a[i - 1]) && !dock.identityInert && !dock.captureInert && running === 0 &&
    captureFocus === 'cb-capture-input' && beside >= 12 &&
    !back.fixed && back.identityInert && !problems.length;
  return { ok, observed: `rest=${JSON.stringify(rest)}, dock=${JSON.stringify(dock)}, running=${running}, capture focus=${captureFocus}, gap to inspector=${beside}, back=${JSON.stringify(back)}, problems=${problems.join(' | ') || '-'}` };
});

test('P20', 'image mode: branded frame; ⌘V saves via Universal Paste and returns only after the save; a failed paste stays and says so', { clipboard: true }, async ({ page, clean }) => {
  const before = await tileCount(page);
  await page.hover('.cb-scene-credit');
  await page.click('.cb-scene-credit__cinema');
  await page.waitForSelector('.cb-cinema');
  await page.mouse.move(700, 400);
  const frame = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
    const exit = box('.cb-cinema__actions');
    return {
      logo: !!document.querySelector('.cb-cinema__brand .cb-logo'),
      hint: document.querySelector('.cb-cinema__hint')?.textContent,
      inset: [Math.round(innerWidth - exit.right), Math.round(exit.top)],
      free: apart(exit, box('.cb-cinema__brand')) && apart(exit, box('.cb-cinema__caption')),
    };
  });
  // nothing usable in the clipboard: image mode stays, the notice is visible above it
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-notice');
  const failed = await page.evaluate(() => ({
    cinema: !!document.querySelector('.cb-cinema'),
    notice: document.querySelector('.cb-notice p').textContent,
    visible: getComputedStyle(document.querySelector('.cb-notice-region')).visibility !== 'hidden',
  }));
  await page.evaluate(() => navigator.clipboard.writeText('Notiz aus dem Bildmodus'));
  await page.evaluate(() => (window.__cbHits.length = 0));
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-cinema', { state: 'detached' });
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  const saved = await page.evaluate(() => ({
    notice: document.querySelector('.cb-notice p').textContent,
    stageInert: document.querySelector('.cb-stage').inert,
    title: document.querySelector('.cb-grid .cb-tile .cb-tile__title')?.textContent,
  }));
  const after = await tileCount(page);
  const problems = await clean(['DataTransfer.']);
  const ok =
    frame.logo && /sichert in „Entwicklung“/.test(frame.hint) && frame.inset.every((v) => v >= 16) && frame.free &&
    failed.cinema && /leer/.test(failed.notice) && failed.visible &&
    after === before + 1 && /Text gespeichert · Entwicklung/.test(saved.notice) && !saved.stageInert && /Bildmodus/.test(saved.title) && !problems.length;
  return { ok, observed: `frame=${JSON.stringify(frame)}, failed=${JSON.stringify(failed)}, tiles ${before}→${after}, saved=${JSON.stringify(saved)}, problems=${problems.join(' | ') || '-'}` };
});

test('P21', 'composer blur aura: local around the surface, visual only, follows the focus expansion', async ({ page, clean }) => {
  const measure = () =>
    page.evaluate(() => {
      const halo = document.querySelector('.cb-composer-halo');
      const surface = document.querySelector('.cb-composer-dock .cb-capture').getBoundingClientRect();
      const r = halo.getBoundingClientRect();
      const style = getComputedStyle(halo);
      return {
        pointer: style.pointerEvents,
        blur: /blur/.test(style.backdropFilter),
        aura: Math.round(r.width - surface.width),
        share: Math.round((r.width / innerWidth) * 100),
        hit: document.elementFromPoint(r.left + 8, r.top + 8)?.closest('.cb-composer-halo, .cb-composer-dock .cb-capture') ? 'composer' : 'content',
        sharp: getComputedStyle(document.querySelector('.cb-composer-dock .cb-capture')).filter === 'none',
      };
    });
  const restState = await measure();
  await page.click('#cb-capture-input');
  await page.waitForTimeout(600);
  const focusState = await measure();
  const problems = await clean();
  const ok =
    restState.pointer === 'none' && restState.blur && restState.aura >= 40 && restState.aura <= 120 && restState.share < 70 &&
    restState.hit === 'content' && restState.sharp && focusState.aura >= restState.aura && !problems.length;
  return { ok, observed: `rest=${JSON.stringify(restState)}, focus=${JSON.stringify(focusState)}, problems=${problems.join(' | ') || '-'}` };
});

test('P22', 'magnetic grid: cards trail a scroll and settle; while dragging it rests, and card on card still makes a folder', { viewport: SHORT }, async ({ page, clean }) => {
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, 120);
  const drifting = await page.waitForFunction(() => document.querySelector('.cb-grid[data-drift]'), null, { timeout: 2000 }).then(() => true, () => false);
  await page.waitForFunction(() => !document.querySelector('.cb-grid[data-drift]'), null, { timeout: 3000 });
  const scrolled = await page.$eval('.cb-workspace', (e) => e.scrollTop);
  const a = await (await page.$('.cb-tile[data-item-id="it-note-standup"]')).boundingBox();
  const b = await (await page.$('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open')).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 24, a.y + 24, { steps: 4 });
  await page.$eval('.cb-workspace', (e) => e.scrollBy({ top: -30 }));
  await page.waitForTimeout(80);
  const duringDrag = await page.evaluate(() => ({ drift: !!document.querySelector('.cb-grid[data-drift]'), dragging: document.querySelector('.cb-app').hasAttribute('data-dragging') }));
  const b2 = await (await page.$('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open')).boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 12 });
  await page.waitForTimeout(380);
  await page.mouse.up();
  await page.waitForSelector('.cb-tile--folder');
  const created = await page.$eval('.cb-notice p', (e) => e.textContent);
  const problems = await clean();
  const ok = drifting && scrolled > 0 && b && duringDrag.dragging && !duringDrag.drift && /Ordner mit 2 Einträgen/.test(created) && !problems.length;
  return { ok, observed: `drift while scrolling=${drifting}, scrollTop=${scrolled}, during drag=${JSON.stringify(duringDrag)}, created="${created}", problems=${problems.join(' | ') || '-'}` };
});


// --- Editor foundation (Run A): Dokument, Code, Markdown, persistence, paste, failure handling ---------------------------------
const newDocument = async (page) => {
  await page.click('[aria-label="Neues Dokument"]', { force: true });
  await page.waitForSelector('.cb-doc__prose');
};
const reopenByTitle = async (page, title, kind = 'document') => {
  await page.click(`.cb-tile[data-kind="${kind}"]:has-text("${title}") .cb-tile__open`);
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
};
const savedStatus = (page) => page.waitForFunction(() => document.querySelector('.cb-composer__status')?.dataset.state === 'saved');

test('P23', 'Dokument: create in a nested folder, format (heading, bold, list, link, table), close, reload, reopen: structure kept', { clipboard: true }, async ({ page, clean }) => {
  // a folder to put the document in: card on card, then open it
  const a = await (await page.$('.cb-tile[data-item-id="it-note-standup"] .cb-tile__open')).boundingBox();
  const b = await (await page.$('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open')).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(380);
  await page.mouse.up();
  await page.waitForSelector('.cb-tile--folder');
  await page.click('.cb-tile--folder .cb-tile__open');
  await page.waitForSelector('.cb-folder-window, [data-cb-context="folder"]');
  await newDocument(page);
  const where = await page.$eval('.cb-composer__eyebrow', (e) => e.textContent);
  await page.keyboard.type('Quartalsbericht');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ergebnis mit ');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.type('Fettdruck');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.press('Enter');
  await page.click('[aria-label="Aufzählung"]');
  await page.keyboard.type('Punkt A');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Punkt B');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.click('[aria-label="Tabelle"]');
  await page.click('[aria-label="Tabelle 3 × 3 einfügen"]');
  await page.keyboard.type('H1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('H2');
  // heading on the first line, link on a word through the link panel
  await page.click('.cb-doc__prose > p:first-child');
  await page.waitForTimeout(150); // ProseMirror reads the new selection on the next selectionchange
  await page.click('[aria-label="Absatzformat"]');
  await page.click('.cb-doc-pop [role="menuitemradio"]:has-text("Titel")');
  await page.click('.cb-doc__prose strong', { clickCount: 2 });
  await page.waitForTimeout(150);
  await page.keyboard.press('ControlOrMeta+K');
  await page.fill('.cb-link-panel input', 'example.org/a');
  await page.keyboard.press('Enter');
  await savedStatus(page);
  const live = await page.$eval('.cb-doc__prose', (e) => e.innerHTML);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector, .cb-tile');
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await page.click('.cb-tile--folder .cb-tile__open');
  await page.waitForSelector('.cb-tile[data-kind="document"]');
  await reopenByTitle(page, 'Quartalsbericht');
  await page.waitForSelector('.cb-doc__prose h1');
  const html = await page.$eval('.cb-doc__prose', (e) => e.innerHTML);
  const info = await page.evaluate(() => ({
    h1: document.querySelector('.cb-doc__prose h1')?.textContent,
    strong: document.querySelector('.cb-doc__prose strong')?.textContent,
    link: document.querySelector('.cb-doc__prose a')?.getAttribute('href'),
    items: [...document.querySelectorAll('.cb-doc__prose ul li')].map((e) => e.textContent),
    cells: [...document.querySelectorAll('.cb-doc__prose table th, .cb-doc__prose table td')].length,
    th: document.querySelector('.cb-doc__prose table th')?.textContent,
    title: document.querySelector('#cb-composer-title').value,
    ariaLabel: document.querySelector('.cb-doc__prose').getAttribute('aria-label'),
  }));
  const problems = await clean(['DataTransfer.']);
  // the header names the studio only; the folder stays the item's place (context rail, store)
  const ok = /Schreibstudio/.test(where) && !/Ordner|›|Entwicklung/.test(where) && info.h1 === 'Quartalsbericht' && info.strong === 'Fettdruck' && info.link === 'https://example.org/a' && info.items.join('|') === 'Punkt A|Punkt B' && info.cells === 9 && info.th === 'H1' && info.title === 'Quartalsbericht' && /<table/.test(live) && /<table/.test(html) && !problems.length;
  return { ok, observed: `where="${where}", ${JSON.stringify(info)}, problems=${problems.join(' | ') || '-'}` };
});

test('P24', 'Dokument: pasted HTML keeps supported formatting and drops dangerous markup; ⌘V in the editor makes no card, ⌘V on the board does', { clipboard: true }, async ({ page, clean }) => {
  const before = await tileCount(page);
  await newDocument(page);
  await page.evaluate(() => {
    window.__xss = 0;
    const el = document.querySelector('.cb-doc__prose');
    el.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', '<h2 style="color:red">Titel</h2><p onclick="window.__xss=1">Hallo <b>fett</b> <a href="javascript:window.__xss=2">böse</a> <a href="https://ok.example/x">gut</a><img src=x onerror="window.__xss=3"><script>window.__xss=4<\/script></p><iframe src="https://evil.example"></iframe><ul><li>eins</li></ul>');
    dt.setData('text/plain', 'Titel Hallo');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  const pasted = await page.$eval('.cb-doc__prose', (e) => ({
    html: e.innerHTML,
    bad: !!e.querySelector('script, iframe, img, [onclick], [onerror], a[href^="javascript"]'),
    colour: !!e.querySelector('[style*="color"]'),
    h2: e.querySelector('h2')?.textContent,
    good: e.querySelector('a[href="https://ok.example/x"]')?.textContent,
  }));
  const xss = await page.evaluate(() => window.__xss);
  // plain text through the real clipboard + keyboard: lands in the editor, no card
  await page.evaluate(() => navigator.clipboard.writeText('Nur Text aus der Zwischenablage'));
  await page.evaluate(() => (window.__cbHits.length = 0));
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForTimeout(300);
  const plain = await page.$eval('.cb-doc__prose', (e) => e.textContent.includes('Nur Text aus der Zwischenablage'));
  await savedStatus(page);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-tile[data-kind="document"]');
  const afterEditor = await tileCount(page);
  // on the board the same shortcut still captures
  await page.mouse.click(720, 135);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  const afterBoard = await tileCount(page);
  const problems = await clean(['DataTransfer.']);
  const ok = !pasted.bad && !pasted.colour && pasted.h2 === 'Titel' && pasted.good === 'gut' && xss === 0 && plain && afterEditor === before + 1 && afterBoard === before + 2 && !problems.length;
  return { ok, observed: `bad=${pasted.bad}, colour=${pasted.colour}, h2=${pasted.h2}, link=${pasted.good}, xss=${xss}, plain paste=${plain}, tiles ${before}→${afterEditor} (document only)→${afterBoard} (board paste), problems=${problems.join(' | ') || '-'}` };
});

test('P25', 'Code: CodeMirror highlights, indents and pairs brackets, searches, undoes; source and language persist across a reload', { clipboard: true }, async ({ page, clean }) => {
  await page.evaluate(() => navigator.clipboard.writeText('function add(a: number, b: number) {\n  return a + b;\n}\nconst total = add(1, 2);'));
  await page.mouse.click(720, 135);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  await page.click('.cb-tile[data-kind="code"]:has-text("function add") .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  await page.waitForSelector('.cb-cm .cm-content');
  await page.waitForFunction(() => document.querySelector('.cb-cm .cm-line span[class]'), null, { timeout: 4000 }); // lazy language chunk highlighted something
  const gutter = await page.$$eval('.cm-lineNumbers .cm-gutterElement', (e) => e.length);
  await page.click('.cb-cm .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('if (total) {');
  await page.keyboard.press('Enter');
  await page.keyboard.type('log(total);');
  const typed = await page.evaluate(() => document.querySelector('.cb-cm .cm-content').innerText);
  await page.keyboard.press('ControlOrMeta+F');
  await page.waitForSelector('.cm-search');
  await page.keyboard.type('total');
  await page.keyboard.press('Enter');
  const search = await page.evaluate(() => ({ matches: document.querySelectorAll('.cm-searchMatch').length, labelled: !!document.querySelector('.cm-search [name="replace"]') }));
  await page.keyboard.press('Escape');
  const stillOpen = !!(await page.$('.cb-composer'));
  await page.click('.cb-cm .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nEND');
  await page.click('[aria-label="Rückgängig"]');
  await page.waitForTimeout(150);
  const afterUndo = await page.evaluate(() => document.querySelector('.cb-cm .cm-content').innerText.includes('END'));
  await page.click('[aria-label="Wiederholen"]');
  const afterRedo = await page.evaluate(() => document.querySelector('.cb-cm .cm-content').innerText.includes('END'));
  await page.selectOption('.cb-canvas-bar select >> nth=0', 'python');
  await savedStatus(page);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await page.click('.cb-tile[data-kind="code"]:has-text("function add") .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  await page.waitForSelector('.cb-cm .cm-content');
  const saved = await page.evaluate(() => ({ text: document.querySelector('.cb-cm .cm-content').innerText, lang: document.querySelector('.cb-canvas-bar select').value }));
  const problems = await clean(['DataTransfer.']);
  const ok = gutter >= 4 && /if \(total\) \{\n\s+log\(total\);\n\}/.test(typed) && search.matches >= 2 && search.labelled && stillOpen && !afterUndo && afterRedo && /END/.test(saved.text) && saved.lang === 'python' && !problems.length;
  return { ok, observed: `gutter=${gutter}, typed=${JSON.stringify(typed.slice(-40))}, search=${JSON.stringify(search)}, Esc closed search only=${stillOpen}, undo/redo=${!afterUndo}/${afterRedo}, saved lang=${saved.lang}, problems=${problems.join(' | ') || '-'}` };
});

test('P26', 'Markdown: source, preview and split correspond; an untouched card is never rewritten; edits persist byte for byte', async ({ page, clean }) => {
  // open + close without edits: nothing is written (the example stays an example; a local note keeps its timestamp)
  await page.evaluate(() => document.querySelector('[aria-label="Aufnahme öffnen"]'));
  await page.click('[aria-label="Neuer Eintrag"], .cb-capture__input', { force: true }).catch(() => {});
  await page.fill('#cb-capture-input', '# Notiz\n\n- eins\n- zwei\n\n**fett**');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  await page.click('.cb-tile[data-kind="markdown"]:has-text("Notiz") .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  await page.waitForSelector('.cb-md .cm-content');
  const before = await page.$eval('.cb-rail__facts', (e) => e.textContent);
  await page.waitForTimeout(900);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  await page.waitForSelector('.cb-md .cm-content');
  const after = await page.$eval('.cb-rail__facts', (e) => e.textContent);
  // edit through the toolbar and keyboard; the preview follows
  await page.click('.cb-md .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n\nSchluss mit ');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.type('Betonung');
  await page.waitForTimeout(400);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.click('[aria-label="Checkliste"]');
  await page.keyboard.type('Aufgabe');
  await page.waitForTimeout(400);
  const split = await page.evaluate(() => ({
    strong: [...document.querySelectorAll('.cb-markdown strong')].map((e) => e.textContent),
    task: document.querySelectorAll('.cb-markdown .cb-md-task').length,
    scrollSync: typeof document.querySelector('.cb-md .cm-scroller').scrollTop === 'number',
  }));
  await page.click('.cb-composer [role="radio"]:has-text("Quelltext")');
  const sourceOnly = await page.$$eval('.cb-md > .cb-composer__pane[data-shown="true"]', (e) => e.length);
  await savedStatus(page);
  const source = await page.evaluate(() => document.querySelector('.cb-md .cm-content').innerText);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await page.click('.cb-tile[data-kind="markdown"]:has-text("Notiz") .cb-tile__open');
  const inspector = await page.$eval('.cb-inspector__text', (e) => e.textContent);
  const problems = await clean();
  const ok = before === after && split.strong.includes('Betonung') && split.strong.includes('fett') && split.task === 1 && sourceOnly === 1 && /Schluss mit \*\*Betonung\*\*/.test(source) && /- \[ \] Aufgabe/.test(source) && /Schluss mit \*\*Betonung\*\*/.test(inspector) && !problems.length;
  return { ok, observed: `untouched facts equal=${before === after}, split=${JSON.stringify(split)}, source panes=${sourceOnly}, persisted=${/Betonung/.test(inspector)}, problems=${problems.join(' | ') || '-'}` };
});

test('P27', 'saving is truthful: rapid typing + immediate close loses nothing; a failing commit shows an error, keeps the edits and recovers on retry', async ({ page, clean }) => {
  await newDocument(page);
  await page.keyboard.type('Erste Zeile');
  await savedStatus(page);
  // 1) fail every commit
  await page.evaluate(() => {
    window.__fail = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__fail) throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.keyboard.type(' und mehr Text');
  await page.waitForFunction(() => document.querySelector('.cb-composer__status')?.dataset.state === 'error', null, { timeout: 4000 });
  const failed = await page.evaluate(() => ({ status: document.querySelector('.cb-composer__status').textContent, text: document.querySelector('.cb-doc__prose').textContent, saved: /Gespeichert/.test(document.querySelector('.cb-composer__status').textContent) }));
  // closing with unsaved edits asks; declining keeps the editor and the text
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForTimeout(400);
  const stillThere = await page.$eval('.cb-doc__prose', (e) => e.textContent.includes('und mehr Text'));
  // 2) recover: retry succeeds, status truthful, then type and close at once
  await page.evaluate(() => (window.__fail = false));
  await page.click('.cb-composer__retry');
  await savedStatus(page);
  await page.click('.cb-doc__prose');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' LETZTE');
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await page.click('.cb-tile[data-kind="document"] .cb-tile__open');
  const text = await page.$eval('.cb-inspector__text', (e) => e.textContent);
  const problems = (await clean()).filter((p) => !/QuotaExceeded|quota/i.test(p));
  const ok = /fehlgeschlagen/.test(failed.status) && !failed.saved && failed.text.includes('und mehr Text') && /nicht gespeichert|verwerfen/i.test(asked) && stillThere && text === 'Erste Zeile und mehr Text LETZTE' && !problems.length;
  return { ok, observed: `failed status="${failed.status}", draft kept=${stillThere}, asked="${asked.slice(0, 40)}…", persisted="${text}", problems=${problems.join(' | ') || '-'}` };
});

test('P28', 'editors on a phone in dark mode: no horizontal overflow, one close control, toolbar reachable', { viewport: PHONE, touch: true, colorScheme: 'dark' }, async ({ page, clean }) => {
  await page.click('.cb-tile[data-item-id="it-prompt-review"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  await page.waitForSelector('.cb-md .cm-content');
  const md = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, split: document.querySelector('.cb-segmented [aria-checked="true"]').textContent, close: document.querySelectorAll('[aria-label="Editor schließen"]').length, panes: document.querySelectorAll('.cb-md > .cb-composer__pane[data-shown="true"]').length }));
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  await page.click('[aria-label="Inspector schließen"]');
  await page.waitForTimeout(400);
  await page.click('#cb-capture-input');
  await page.click('[aria-label="Neues Dokument"]', { force: true });
  const doc = await page.waitForSelector('.cb-doc__prose', { timeout: 3000 }).then(() => page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, toolbar: document.querySelector('.cb-canvas-bar').scrollWidth <= innerWidth + 1 || getComputedStyle(document.querySelector('.cb-canvas-bar__specific')).overflowX === 'auto' })), () => null);
  const problems = await clean();
  const ok = !md.overflow && md.split === 'Quelltext' && md.close === 1 && md.panes === 1 && (!doc || (!doc.overflow && doc.toolbar)) && !problems.length;
  return { ok, observed: `markdown=${JSON.stringify(md)}, document=${JSON.stringify(doc)}, problems=${problems.join(' | ') || '-'}` };
});

// --- Image studio (Run B): non-destructive edits, persistence, original kept byte for byte, export, failure, phone ---------
// A 200×100 test picture: left half orange, right half blue (so crops and turns are visible in the pixels).
const pasteTestImage = async (page) => {
  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8590c';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(100, 0, 100, 100);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await canvas.convertToBlob({ type: 'image/png' }) })]);
  });
  await page.mouse.click(720, 135);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  await page.click('[aria-label="Hinweis schließen"]');
};
// the stored record of an image (read straight from the app's own IndexedDB) with a SHA-256 of its original asset
const storedImage = (page, match) =>
  page.evaluate(async (m) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('copyboard-next');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const items = await new Promise((res) => {
      const req = db.transaction('items').objectStore('items').getAll();
      req.onsuccess = () => res(req.result);
    });
    db.close();
    const img = items.find((i) => i.kind === 'image' && (m.id ? i.id === m.id : i.width === m.width && i.height === m.height));
    if (!img) return null;
    const hash = img.asset ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', await img.asset.blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('') : null;
    return { id: img.id, hash, mime: img.asset?.mimeType ?? null, edits: img.edits ?? null, title: img.title, origin: img.origin ?? null };
  }, match);
const studioReady = (page) => page.waitForFunction(() => (document.querySelector('.cb-studio__canvas')?.width ?? 0) > 1 && !document.querySelector('.cb-studio__frame[hidden]'));
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

test('P29', 'Bildstudio: opens from the context menu; crop 1:1, rotate, B&W, grouped slider undo/redo; persists across reload; original bytes unchanged; export + original download', { clipboard: true }, async ({ page, clean }) => {
  await pasteTestImage(page);
  const original = await storedImage(page, { width: 200, height: 100 });
  // context menu on the card → studio
  await page.click('.cb-tile[data-kind="image"] .cb-tile__open', { button: 'right' });
  await page.click('[role="menuitem"]:has-text("Im Bildstudio bearbeiten")');
  await studioReady(page);
  const opened = await page.evaluate(() => ({ kind: document.querySelector('.cb-composer')?.dataset.kind, close: document.querySelectorAll('[aria-label="Editor schließen"]').length, rail: !!document.querySelector('.cb-rail') }));
  // one keyboard gesture on the contrast slider = one undo step
  await page.focus('#cb-studio-contrast');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  const contrast = await page.$eval('#cb-studio-contrast', (e) => e.value);
  await page.click('[aria-label="Rückgängig"]');
  const undone = await page.$eval('#cb-studio-contrast', (e) => e.value);
  const canUndoAfter = await page.waitForFunction(() => document.querySelector('[aria-label="Rückgängig"]').disabled, null, { timeout: 1500 }).then(() => false, () => true);
  await page.click('[aria-label="Wiederholen"]');
  const redone = await page.$eval('#cb-studio-contrast', (e) => e.value);
  await page.click('.cb-studio-switch input');
  // crop to a square, then a quarter turn to the right
  await page.click('.cb-studio-bar [role="radio"]:has-text("Zuschneiden")');
  await page.waitForSelector('.cb-crop__rect');
  await page.click('.cb-studio-chip:has-text("1:1")');
  await page.click('[aria-label="90° nach rechts drehen"]');
  await savedStatus(page);
  const saved = await storedImage(page, { id: original.id });
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  const inspector = await page.$eval('.cb-inspector__figure figcaption', (e) => e.textContent);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await page.waitForFunction(() => document.querySelector('.cb-tile[data-kind="image"] img')?.naturalWidth > 0);
  const card = await page.evaluate(() => {
    const tile = document.querySelector('.cb-tile[data-kind="image"]');
    const img = tile.querySelector('img');
    return { chip: tile.querySelector('.cb-preview__chip').textContent, px: `${img.naturalWidth}x${img.naturalHeight}` };
  });
  const after = await storedImage(page, { id: original.id });
  // reopen from the inspector: state restored, fresh history
  await page.click('.cb-tile[data-kind="image"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Im Bildstudio bearbeiten")');
  await studioReady(page);
  const reopened = await page.evaluate(() => ({ contrast: document.querySelector('#cb-studio-contrast').value, mono: document.querySelector('.cb-studio-switch input').checked, undo: !document.querySelector('[aria-label="Rückgängig"]').disabled }));
  // export (PNG) and the untouched original
  const [exported] = await Promise.all([page.waitForEvent('download'), page.click('.cb-studio-panel button:has-text("Bild exportieren")')]);
  const exportedBuf = fs.readFileSync(await exported.path());
  const [orig] = await Promise.all([page.waitForEvent('download'), page.click('.cb-studio-panel button:has-text("Original")')]);
  const origHash = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(await orig.path())).digest('hex');
  const out = pngSize(exportedBuf);
  const problems = await clean(['DataTransfer.', 'clipboard.']);
  const e = saved?.edits;
  const ok =
    opened.kind === 'image' && opened.close === 1 && !opened.rail &&
    contrast === '10' && undone === '0' && !canUndoAfter && redone === '10' &&
    e && e.schema === 1 && e.turns === 1 && e.aspect === '1:1' && e.mono === true && e.adjust.contrast === 10 && Math.abs(e.crop.w * 100 - e.crop.h * 200) < 1 &&
    saved.hash === original.hash && after.hash === original.hash && after.mime === 'image/png' && JSON.stringify(after.edits) === JSON.stringify(e) &&
    /100 × 100 px/.test(inspector) && /bearbeitet/.test(inspector) && /100 × 100/.test(card.chip) && card.px === '100x100' &&
    reopened.contrast === '10' && reopened.mono && !reopened.undo &&
    out.width === 100 && out.height === 100 && /\.png$/.test(exported.suggestedFilename()) && origHash === original.hash && !problems.length;
  return { ok, observed: `opened=${JSON.stringify(opened)}, slider ${contrast}→undo ${undone} (more=${canUndoAfter})→redo ${redone}, edits=${JSON.stringify(e)}, hash kept=${saved?.hash === original.hash && after?.hash === original.hash}, inspector="${inspector}", card=${JSON.stringify(card)}, reopened=${JSON.stringify(reopened)}, export=${exported.suggestedFilename()} ${out.width}x${out.height}, original download identical=${origHash === original.hash}, problems=${problems.join(' | ') || '-'}` };
});

test('P30', 'Bildstudio: read-only example with explicit local copy; free crop by handle, straighten, compare, zoom; a failing save keeps the edits and recovers', async ({ page, clean }) => {
  await gotoSpace(page, 'Design');
  await page.click('.cb-tile[data-item-id="it-moodboard"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Im Bildstudio bearbeiten")');
  await studioReady(page);
  const example = await page.evaluate(() => ({ status: document.querySelector('.cb-composer__status').dataset.state, slider: document.querySelector('#cb-studio-contrast').disabled, rotate: document.querySelector('[aria-label="90° nach rechts drehen"]').disabled, notice: !!document.querySelector('.cb-composer__notice') }));
  globalThis.__step = 'local copy';
  await page.click('.cb-composer__notice button:has-text("Lokale Kopie bearbeiten")');
  await page.waitForFunction(() => document.querySelector('input#cb-composer-title')?.value.includes('(Kopie)'));
  await studioReady(page);
  // crop: drag the bottom-right handle inwards
  globalThis.__step = 'crop';
  await page.click('.cb-studio-bar [role="radio"]:has-text("Zuschneiden")');
  const handle = await (await page.waitForSelector('.cb-crop__handle[data-handle="se"]')).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y - 60, { steps: 8 });
  await page.mouse.up();
  const rect = await page.$eval('.cb-crop__rect', (e) => ({ w: parseFloat(e.style.width), h: parseFloat(e.style.height) }));
  await page.focus('#cb-studio-straighten');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const angle = await page.$eval('#cb-studio-straighten', (e) => e.value);
  // compare before/after, then zoom in the adjust tool
  globalThis.__step = 'compare/zoom';
  await page.click('[aria-label="Vorher/Nachher vergleichen"]');
  const badge = await page.$eval('.cb-studio__badge', (e) => e.textContent).catch(() => null);
  await page.click('[aria-label="Vorher/Nachher vergleichen"]');
  await page.click('.cb-studio-bar [role="radio"]:has-text("Anpassen")');
  const fitPct = await page.$eval('[aria-label="Einpassen"]', (e) => parseInt(e.textContent, 10));
  await page.click('[aria-label="Vergrößern"]');
  await page.click('[aria-label="Vergrößern"]');
  await settle(page);
  const zoomed = await page.evaluate(() => ({ pct: parseInt(document.querySelector('[aria-label="Einpassen"]').textContent, 10), scroll: document.querySelector('.cb-studio__stage').scrollWidth > document.querySelector('.cb-studio__stage').clientWidth }));
  await page.click('[aria-label="Einpassen"]');
  await savedStatus(page);
  // failing commits: the edit stays, the status says so, retry recovers
  globalThis.__step = 'failing save';
  await page.evaluate(() => {
    window.__fail = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__fail) throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.click('.cb-studio-bar [role="radio"]:has-text("Filter")');
  await page.click('.cb-studio-filter:has-text("Cinematic")');
  await page.waitForFunction(() => document.querySelector('.cb-composer__status')?.dataset.state === 'error', null, { timeout: 4000 });
  const failed = await page.$eval('.cb-composer__status', (e) => e.textContent);
  const kept = await page.$eval('.cb-studio-filter[aria-checked="true"]', (e) => e.textContent);
  await page.evaluate(() => (window.__fail = false));
  await page.click('.cb-composer__retry');
  await savedStatus(page);
  const title = await page.$eval('#cb-composer-title', (e) => e.value);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  await page.reload();
  await page.waitForSelector('.cb-tile');
  const copy = await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('copyboard-next');
      r.onsuccess = () => res(r.result);
    });
    const items = await new Promise((res) => {
      const req = db.transaction('items').objectStore('items').getAll();
      req.onsuccess = () => res(req.result);
    });
    db.close();
    const c = items.find((i) => i.derivedFrom === 'it-moodboard');
    return c ? { origin: c.origin, filter: c.edits?.filter, straighten: c.edits?.straighten, cropW: c.edits?.crop.w, hasExampleRecord: items.some((i) => i.id === 'it-moodboard' && i.edits) } : null;
  });
  const problems = (await clean()).filter((p) => !/QuotaExceeded|quota/i.test(p));
  const ok =
    example.status === 'example' && example.slider && example.rotate && example.notice &&
    rect.w < 100 && rect.h < 100 && angle === '0.5' && badge === 'Original' &&
    zoomed.pct > fitPct && zoomed.scroll &&
    /fehlgeschlagen/.test(failed) && kept === 'Cinematic' && /\(Kopie\)/.test(title) &&
    copy && copy.origin === 'local' && copy.filter === 'cinematic' && copy.straighten === 0.5 && copy.cropW < 1 && !copy.hasExampleRecord && !problems.length;
  return { ok, observed: `example=${JSON.stringify(example)}, crop=${JSON.stringify(rect)}, angle=${angle}, compare badge=${badge}, zoom ${fitPct}%→${zoomed.pct}% scroll=${zoomed.scroll}, failed="${failed}", kept=${kept}, copy=${JSON.stringify(copy)}, problems=${problems.join(' | ') || '-'}` };
});

test('P31', 'Bildstudio on a phone in dark mode: no horizontal overflow, one close control, stage and tool sheet visible, filters render', { viewport: PHONE, touch: true, colorScheme: 'dark' }, async ({ page, clean }) => {
  await gotoSpace(page, 'Design').catch(() => {});
  await page.waitForSelector('.cb-tile[data-kind="image"]');
  await page.click('.cb-tile[data-kind="image"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Im Bildstudio bearbeiten")');
  await studioReady(page);
  await page.click('.cb-studio-bar [role="radio"]:has-text("Filter")');
  await page.waitForSelector('.cb-studio-filter canvas');
  await settle(page);
  const info = await page.evaluate(() => {
    const stage = document.querySelector('.cb-studio__stage').getBoundingClientRect();
    const panel = document.querySelector('.cb-studio-panel').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      close: document.querySelectorAll('[aria-label="Editor schließen"]').length,
      stage: Math.round(stage.height),
      panelBelow: panel.top >= stage.bottom - 1 && panel.height > 60,
      thumbs: [...document.querySelectorAll('.cb-studio-filter canvas')].filter((c) => c.width > 1).length,
    };
  });
  const problems = await clean();
  const ok = !info.overflow && info.close === 1 && info.stage >= 200 && info.panelBelow && info.thumbs === 8 && !problems.length;
  return { ok, observed: `${JSON.stringify(info)}, problems=${problems.join(' | ') || '-'}` };
});

browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// --- Writing studio (Run C): typography, paragraph format, contextual bubble, status bar, schema 2, responsive ---------
const SHOTS = path.join(OUT, 'run-c');
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450); // popovers finish their entrance, counts their debounce
  await settle(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
/** Selects the first occurrence of `text` in the page as a real DOM selection (ProseMirror reads it on selectionchange). */
const selectText = async (page, text) => {
  const found = await page.evaluate((t) => {
    const root = document.querySelector('.cb-doc__prose');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const at = node.data.indexOf(t);
      if (at < 0 || node.parentElement.closest('[contenteditable="false"]')) continue;
      root.focus();
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + t.length);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
    return false;
  }, text);
  if (!found) throw new Error(`text "${text}" not found`);
  await page.waitForTimeout(120);
};
const caretInto = async (page, text) => {
  await selectText(page, text);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
};
const pick = async (page, trigger, item) => {
  await page.click(`[aria-label="${trigger}"]`);
  await page.click(`.cb-doc-pop [role="menuitemradio"]:has-text("${item}")`);
  await page.waitForTimeout(80);
};
const docState = (page) =>
  page.evaluate(() => {
    const q = (sel) => document.querySelector(`.cb-doc__prose ${sel}`);
    const second = [...document.querySelectorAll('.cb-doc__prose p')].find((p) => p.textContent.includes('Zweiter Absatz'));
    return {
      h2: q('h2')?.textContent,
      styled: q('span[data-font="serif"][data-size="25"][data-text-color="#2563eb"]')?.textContent,
      green: q('mark[data-color="green"]')?.textContent,
      yellow: q('mark[data-color="yellow"]')?.textContent,
      strike: q('s')?.textContent,
      bold: !!q('strong'),
      para: second ? { indent: second.dataset.indent, lh: second.dataset.lineHeight, spacing: second.dataset.spacing, align: second.style.textAlign } : null,
    };
  });

test('P32', 'Schreibstudio: Schrift, Größe, Farbe, Marker, Blocksatz, Einzug, Abstände, Formatierung entfernen; Shortcuts; Export, Zoom und Reload behalten alles', async ({ page, clean }) => {
  await newDocument(page);
  await page.keyboard.type('Studio');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Alpha Beta Gamma Delta Epsilon');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zweiter Absatz mit genug Text für den Blocksatz.');
  // typography on "Beta": typeface through the menu, size through the stepper (17 → 20 → 25), colour through the popover
  await selectText(page, 'Beta');
  await pick(page, 'Schriftart', 'Serif');
  await page.click('[aria-label="Schrift vergrößern"]');
  await page.click('[aria-label="Schrift vergrößern"]');
  await page.click('[aria-label="Textfarbe"]');
  await page.click('.cb-doc-pop [aria-label="Textfarbe Blau"]');
  const sizeShown = await page.$eval('.cb-doc-size .cb-doc-size__value', (e) => e.textContent.trim());
  // marker through the contextual bubble, a second one and strike through the keyboard
  await selectText(page, 'Gamma');
  await page.waitForSelector('.cb-bubble', { state: 'visible' });
  await page.click('.cb-bubble [aria-label="Farbe und Textmarker"]');
  await page.click('.cb-bubble [aria-label="Textmarker Grün"]');
  await selectText(page, 'Delta');
  await page.keyboard.press('ControlOrMeta+Shift+H');
  await selectText(page, 'Epsilon');
  await page.keyboard.press('ControlOrMeta+Shift+S');
  // clear formatting removes emphasis again
  await selectText(page, 'Alpha');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.press('ControlOrMeta+\\');
  // paragraph format on the second paragraph
  await caretInto(page, 'Zweiter');
  await page.click('[aria-label="Blocksatz"]');
  await page.keyboard.press('ControlOrMeta+]');
  await page.click('[aria-label="Einzug vergrößern"]');
  await pick(page, 'Zeilen- und Absatzabstand', 'Doppelt');
  await pick(page, 'Zeilen- und Absatzabstand', 'Groß');
  await caretInto(page, 'Studio');
  await pick(page, 'Absatzformat', 'Überschrift');
  await savedStatus(page);
  const live = await docState(page);
  const counts = await page.waitForFunction(() => /14 Wörter/.test(document.querySelector('.cb-doc__counts')?.textContent ?? '') && document.querySelector('.cb-doc__counts').textContent).then((h) => h.jsonValue());
  await shot(page, 'desktop-light-studio');
  // export: the file carries the formatting as inline styles
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[aria-label="Exportieren"]')]);
  const exported = fs.readFileSync(await download.path(), 'utf8');
  const exportChecks = { font: /data-font="serif"/, size: /font-size: 25px/, mark: /<mark[^>]*data-color="green"[^>]*background-color: (#bbf7d0|rgb\(187, 247, 208\))/, indent: /margin-left: 3em/, lh: /line-height: 2/, justify: /text-align: justify/ };
  const exportMiss = Object.keys(exportChecks).filter((k) => !exportChecks[k].test(exported));
  const exportOk = !exportMiss.length && !/<script/i.test(exported);
  // zoom is a view setting: text grows, the stored size stays 25
  await page.click('.cb-doc__zoom [aria-label="Vergrößern"]');
  const zoomed = await page.evaluate(() => ({ p: getComputedStyle(document.querySelector('.cb-doc__prose p')).fontSize, beta: getComputedStyle(document.querySelector('.cb-doc__prose [data-size="25"]')).fontSize, label: document.querySelector('.cb-doc__zoom-value').textContent }));
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-tile[data-kind="document"]');
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await reopenByTitle(page, 'Studio');
  await page.waitForSelector('.cb-doc__prose h2');
  const reloaded = await docState(page);
  const zoomAfter = await page.$eval('.cb-doc__zoom-value', (e) => e.textContent);
  const problems = await clean();
  const expected = { h2: 'Studio', styled: 'Beta', green: 'Gamma', yellow: 'Delta', strike: 'Epsilon', bold: false, para: { indent: '2', lh: '2', spacing: 'large', align: 'justify' } };
  const same = (x) => JSON.stringify(x) === JSON.stringify(expected);
  const ok = same(live) && same(reloaded) && sizeShown === '25' && exportOk && zoomed.p === '18.7px' && zoomed.beta === '27.5px' && zoomAfter.includes('110') && !problems.length;
  return { ok, observed: `live=${JSON.stringify(live)}, reloaded same=${same(reloaded)}, size=${sizeShown}, counts="${counts}", export=${exportOk}${exportMiss.length ? ` missing ${exportMiss} in ${exported.slice(exported.indexOf('<body>'), exported.indexOf('<body>') + 600)}` : ''}, zoom=${JSON.stringify(zoomed)} → after reload ${zoomAfter}, problems=${problems.join(' | ') || '-'}` };
});

test('P33', 'Schreibstudio: Auswahl bleibt über Menüs erhalten, aktive Zustände stimmen, Undo/Redo, Tabellen-Picker und -Werkzeuge, Link über die Bubble', async ({ page, clean }) => {
  await newDocument(page);
  await page.keyboard.type('Eins zwei drei');
  await selectText(page, 'zwei');
  await pick(page, 'Absatzformat', 'Titel');
  const afterMenu = await page.evaluate(() => ({ sel: getSelection().toString(), h1: document.querySelector('.cb-doc__prose h1')?.textContent, label: document.querySelector('[aria-label="Absatzformat"]').textContent }));
  await page.click('[aria-label="Textfarbe"]');
  await page.click('.cb-doc-pop [aria-label="Textfarbe Orange"]');
  await page.keyboard.press('ControlOrMeta+B');
  const coloured = await page.evaluate(() => ({
    span: [...document.querySelectorAll('.cb-doc__prose [data-text-color]')].map((e) => e.textContent).join('|'),
    active: document.querySelector('[aria-label="Textfarbe"]').hasAttribute('data-active'),
    bold: document.querySelector('.cb-canvas-bar [aria-label="Fett"]').getAttribute('aria-pressed'),
  }));
  await page.keyboard.press('ControlOrMeta+Z');
  await page.keyboard.press('ControlOrMeta+Z');
  const undone = await page.evaluate(() => document.querySelectorAll('.cb-doc__prose [data-text-color], .cb-doc__prose strong').length);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  const redone = await page.evaluate(() => document.querySelectorAll('.cb-doc__prose [data-text-color]').length);
  // link through the bubble on a fresh selection
  await selectText(page, 'Eins');
  await page.waitForSelector('.cb-bubble', { state: 'visible' });
  await page.click('.cb-bubble [aria-label="Link"]');
  await page.fill('.cb-link-panel input', 'example.org/eins');
  await page.keyboard.press('Enter');
  // table: size picker, then the contextual operations
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.click('[aria-label="Tabelle"]');
  await page.hover('[aria-label="Tabelle 2 × 4 einfügen"]');
  const pickLabel = await page.$eval('.cb-doc-table-pick__size', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  await page.click('[aria-label="Tabelle 2 × 4 einfügen"]');
  const cells = () => page.$$eval('.cb-doc__prose :is(td, th)', (els) => els.length);
  const c1 = await cells();
  await page.click('[aria-label="Tabelle bearbeiten"]');
  await page.click('.cb-doc-pop [role="menuitem"]:has-text("Zeile unterhalb einfügen")');
  const c2 = await cells();
  await page.click('[aria-label="Tabelle bearbeiten"]');
  await page.click('.cb-doc-pop [role="menuitem"]:has-text("Spalte löschen")');
  const c3 = await cells();
  await savedStatus(page);
  const link = await page.$eval('.cb-doc__prose a', (e) => e.getAttribute('href'));
  const problems = await clean();
  const ok = afterMenu.sel === 'zwei' && afterMenu.h1 === 'Eins zwei drei' && afterMenu.label.includes('Titel') && coloured.span === 'zwei' && coloured.active && coloured.bold === 'true' && undone === 0 && redone === 1 && link === 'https://example.org/eins' && pickLabel === '2 × 4' && c1 === 8 && c2 === 12 && c3 === 9 && !problems.length;
  return { ok, observed: `menu=${JSON.stringify(afterMenu)}, colour=${JSON.stringify(coloured)}, undo→${undone}, redo→${redone}, link=${link}, picker="${pickLabel}", cells ${c1}→${c2}→${c3}, problems=${problems.join(' | ') || '-'}` };
});

test('P34', 'Schreibstudio: ein gespeichertes Schema-1-Dokument öffnet unverändert, wird beim Öffnen nicht umgeschrieben und speichert nach einer Änderung verlustfrei als Schema 2', async ({ page, clean }) => {
  await newDocument(page);
  await page.keyboard.type('Altbestand');
  await savedStatus(page);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-tile[data-kind="document"]');
  const readItem = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('copyboard-next');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction('items').objectStore('items').getAll();
            req.onsuccess = () => {
              db.close();
              resolve(req.result.find((i) => i.kind === 'document' && i.title === 'Altbestand'));
            };
          };
        }),
    );
  const fresh = await readItem();
  const v1 = {
    schema: 1,
    doc: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Altbestand' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'rot', marks: [{ type: 'textStyle', attrs: { color: '#be123c' } }, { type: 'italic' }] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'erledigt' }] }] }] },
      ],
    },
  };
  await page.evaluate(
    ({ item }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('copyboard-next');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('items', 'readwrite');
          tx.objectStore('items').put(item);
          tx.oncomplete = () => (db.close(), resolve(true));
          tx.onerror = () => reject(tx.error);
        };
      }),
    { item: { ...fresh, content: v1, text: 'Altbestand\nrot\nerledigt' } },
  );
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await reopenByTitle(page, 'Altbestand');
  await page.waitForSelector('.cb-doc__prose h2');
  const shown = await page.evaluate(() => ({
    h2: document.querySelector('.cb-doc__prose h2')?.style.textAlign,
    red: document.querySelector('.cb-doc__prose em [data-text-color="#be123c"], .cb-doc__prose [data-text-color="#be123c"] em, .cb-doc__prose [data-text-color="#be123c"]')?.textContent,
    task: document.querySelector('.cb-doc__prose li[data-checked="true"] > div')?.textContent,
  }));
  await page.waitForTimeout(1200);
  const untouched = await readItem();
  await selectText(page, 'erledigt');
  await page.keyboard.type('erledigt!');
  await page.waitForFunction(() => document.querySelector('.cb-composer__status')?.dataset.state !== 'saved').catch(() => {});
  await savedStatus(page);
  const saved = await readItem();
  const problems = await clean();
  const expectDoc = JSON.parse(JSON.stringify(v1.doc));
  expectDoc.content[2].content[0].content[0].content[0].text = 'erledigt!';
  const ok = shown.h2 === 'center' && shown.red === 'rot' && shown.task === 'erledigt' && untouched.content.schema === 1 && saved.content.schema === 2 && JSON.stringify(saved.content.doc) === JSON.stringify(expectDoc) && !problems.length;
  return { ok, observed: `shown=${JSON.stringify(shown)}, after open schema=${untouched.content.schema}, after edit schema=${saved.content.schema}, lossless=${JSON.stringify(saved.content.doc) === JSON.stringify(expectDoc)}, problems=${problems.join(' | ') || '-'}` };
});

test('P35', 'Schreibstudio auf dem Phone im Dark Mode: Prioritätszeile passt, Mehr-Blatt im Viewport und funktional, Statusleiste sichtbar; Druckansicht nur Seite', { touch: true }, async ({ page, clean }) => {
  // the theme is chosen in the desktop dock, then the same touch device turns into a phone
  await dockItem(page, 'Dunkles Design');
  await page.waitForTimeout(150);
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(300);
  await page.click('#cb-capture-input');
  await page.click('[aria-label="Neues Dokument"]', { force: true });
  await page.waitForSelector('.cb-doc__prose');
  await page.keyboard.type('Unterwegs schreiben');
  const bar = await page.evaluate(() => {
    const tools = document.querySelector('.cb-doc-tools');
    const r = tools.getBoundingClientRect();
    return { layout: tools.dataset.layout, fits: tools.scrollWidth <= tools.clientWidth + 1 && r.right <= innerWidth + 0.5, overflow: document.documentElement.scrollWidth > innerWidth, status: !!document.querySelector('.cb-doc__status')?.getBoundingClientRect().height };
  });
  await page.click('[aria-label="Weitere Formatierung"]');
  await page.waitForSelector('.cb-doc-more');
  const sheet = await page.$eval('.cb-doc-more', (e) => {
    const r = e.getBoundingClientRect();
    return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, theme: document.querySelector('.cb-app').dataset.theme };
  });
  await shot(page, 'phone-dark-more-sheet');
  await page.click('.cb-doc-more [aria-label="Nummerierung"]');
  await page.click('.cb-doc-more .cb-doc-chip:has-text("Mono")');
  const applied = await page.evaluate(() => ({ ol: !!document.querySelector('.cb-doc__prose ol'), mono: document.querySelector('.cb-doc-more .cb-doc-chip[aria-pressed="true"]')?.textContent }));
  await page.keyboard.press('Escape');
  await shot(page, 'phone-dark-studio');
  await page.emulateMedia({ media: 'print' });
  const print = await page.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.cb-canvas-bar')).display, status: getComputedStyle(document.querySelector('.cb-doc__status')).display, prose: getComputedStyle(document.querySelector('.cb-doc__prose')).display }));
  await page.emulateMedia({ media: 'screen' });
  const problems = await clean();
  const ok = bar.layout === 'phone' && bar.fits && !bar.overflow && bar.status && sheet.inside && sheet.theme === 'dark' && applied.ol && print.bar === 'none' && print.status === 'none' && print.prose !== 'none' && !problems.length;
  return { ok, observed: `bar=${JSON.stringify(bar)}, sheet=${JSON.stringify(sheet)}, applied=${JSON.stringify(applied)}, print=${JSON.stringify(print)}, problems=${problems.join(' | ') || '-'}` };
});

test('P36', 'Schreibstudio auf Tablet und Desktop (dunkel): Werkzeugzeilen brechen kontrolliert um, kein Werkzeug außerhalb, keine Überbreite; Code/Markdown/Bild unverändert erreichbar', { viewport: { width: 820, height: 1180 } }, async ({ page, clean }) => {
  await newDocument(page);
  await page.keyboard.type('Tablet');
  const check = () =>
    page.evaluate(() => {
      const controls = [...document.querySelectorAll('.cb-canvas-bar button')].filter((b) => b.offsetParent);
      const out = controls.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.left < 0 || r.right > innerWidth + 0.5;
      });
      return { controls: controls.length, outside: out.map((b) => b.getAttribute('aria-label')), overflow: document.documentElement.scrollWidth > innerWidth, rows: document.querySelectorAll('.cb-doc-tools__row').length };
    });
  const tablet = await check();
  await shot(page, 'tablet-light-studio');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-tile[data-kind="document"]');
  await dockItem(page, 'Dunkles Design');
  await page.waitForTimeout(150);
  await reopenByTitle(page, 'Tablet');
  await page.waitForSelector('.cb-doc__prose');
  await selectText(page, 'Tablet');
  await page.waitForSelector('.cb-bubble', { state: 'visible' });
  await page.click('.cb-bubble [aria-label="Farbe und Textmarker"]');
  const desktop = await check();
  await shot(page, 'desktop-dark-bubble');
  await page.click('[aria-label="Textmarker"]');
  await shot(page, 'desktop-dark-marker-menu');
  await page.keyboard.press('Escape');
  await page.click('[aria-label="Editor schließen"]');
  // the other Canvas editors still open in their own surfaces
  await page.click('.cb-tile[data-item-id="it-prompt-review"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
  const md = await page.waitForSelector('.cb-md .cm-content').then(() => true, () => false);
  const problems = await clean();
  const ok = tablet.rows === 2 && !tablet.outside.length && !tablet.overflow && !desktop.outside.length && !desktop.overflow && md && !problems.length;
  return { ok, observed: `tablet=${JSON.stringify(tablet)}, desktop=${JSON.stringify(desktop)}, markdown=${md}, problems=${problems.join(' | ') || '-'}` };
});

// --- Text cards and the writing studio (Run C.1): explicit conversion, plain editing kept, nothing changes on cancel ----
const dbItems = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('copyboard-next');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('items').objectStore('items').getAll();
          req.onsuccess = () => (db.close(), resolve(req.result));
        };
      }),
  );
const dbPut = (page, item) =>
  page.evaluate(
    (record) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('copyboard-next');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('items', 'readwrite');
          tx.objectStore('items').put(record);
          tx.oncomplete = () => (db.close(), resolve(true));
          tx.onerror = () => reject(tx.error);
        };
      }),
    item,
  );
/** Universal Paste of plain text on the board; returns the stored text card. */
const pasteTextCard = async (page, text) => {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.mouse.click(720, 135);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  const items = await dbItems(page);
  const card = items.find((i) => i.kind === 'text' && i.origin === 'local' && i.body === text);
  if (!card) throw new Error('pasted text card not stored');
  return card;
};
const inspectorAction = async (page, id, label) => {
  if (!(await page.$('.cb-inspector'))) await page.click(`.cb-tile[data-item-id="${id}"] .cb-tile__open`);
  await page.click(`.cb-inspector .cb-inspector__actions button:has-text("${label}")`);
};

test('P37', 'Textkarte → Schreibstudio: Abbrechen ändert nichts; Umwandeln behält ID, Ort, Titel, Tags, Favorit, Erstelldatum; formatieren, Export, Schließen, Reload, erneut öffnen', { clipboard: true }, async ({ page, clean }) => {
  const pasted = await pasteTextCard(page, 'Einkaufsliste\nBrot und  Butter\nMilch');
  // metadata worth keeping: tags (no UI yet) and favourite, then a reload so the app reads them from the store
  const original = { ...pasted, tags: ['einkauf'], favorite: true };
  await dbPut(page, original);
  await page.reload();
  await page.waitForSelector(`.cb-tile[data-item-id="${original.id}"]`);
  await inspectorAction(page, original.id, 'Im Schreibstudio bearbeiten');
  await page.waitForSelector('.cb-card-dialog:has-text("Schreibstudio")');
  const dialogText = await page.$eval('.cb-card-dialog', (e) => e.textContent);
  await shot(page, 'text-card-convert-dialog');
  await page.click('.cb-card-dialog button:has-text("Abbrechen")');
  await page.waitForTimeout(300);
  const afterCancel = (await dbItems(page)).find((i) => i.id === original.id);
  const composerAfterCancel = !!(await page.$('.cb-composer'));
  // convert
  await inspectorAction(page, original.id, 'Im Schreibstudio bearbeiten');
  await page.click('.cb-card-dialog .cb-button--primary:has-text("Umwandeln")');
  await page.waitForSelector('.cb-doc__prose');
  const converted = (await dbItems(page)).find((i) => i.id === original.id);
  const paragraphs = await page.$$eval('.cb-doc__prose p', (els) => els.map((e) => e.textContent));
  // the writing studio works on it: toolbar, bubble, autosave, export
  await selectText(page, 'Brot');
  await page.waitForSelector('.cb-bubble', { state: 'visible' });
  await page.click('.cb-bubble [aria-label="Fett"]');
  await caretInto(page, 'Einkaufsliste');
  await pick(page, 'Absatzformat', 'Titel');
  await savedStatus(page);
  await shot(page, 'text-card-converted-studio');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[aria-label="Exportieren"]')]);
  const exported = fs.readFileSync(await download.path(), 'utf8');
  await page.click('[aria-label="Editor schließen"]');
  await page.reload();
  await page.waitForSelector(`.cb-tile[data-item-id="${original.id}"][data-kind="document"]`);
  await inspectorAction(page, original.id, 'Bearbeiten');
  await page.waitForSelector('.cb-doc__prose h1');
  const reopened = await page.evaluate(() => ({ h1: document.querySelector('.cb-doc__prose h1')?.textContent, strong: document.querySelector('.cb-doc__prose strong')?.textContent, tools: !!document.querySelector('.cb-doc-tools') }));
  const stored = (await dbItems(page)).find((i) => i.id === original.id);
  const problems = await clean(['DataTransfer.', 'clipboard']);
  const keep = (x) => ({ id: x.id, spaceId: x.spaceId, folderId: x.folderId ?? null, title: x.title, tags: x.tags, favorite: x.favorite, createdAt: x.createdAt, origin: x.origin });
  const ok =
    /einmalig/.test(dialogText) && JSON.stringify(afterCancel) === JSON.stringify(original) && !composerAfterCancel &&
    converted.kind === 'document' && !('body' in converted) && JSON.stringify(keep(converted)) === JSON.stringify(keep(original)) && converted.text === original.body && converted.updatedAt > original.updatedAt &&
    paragraphs.join('|') === 'Einkaufsliste|Brot und  Butter|Milch' &&
    /<strong>Brot<\/strong>/.test(exported) && reopened.h1 === 'Einkaufsliste' && reopened.strong === 'Brot' && reopened.tools &&
    stored.kind === 'document' && JSON.stringify(keep(stored)) === JSON.stringify(keep(original)) && !problems.length;
  return { ok, observed: `cancel unchanged=${JSON.stringify(afterCancel) === JSON.stringify(original)} composer=${composerAfterCancel}, converted kind=${converted.kind} keep=${JSON.stringify(keep(converted)) === JSON.stringify(keep(original))} text=${JSON.stringify(converted.text)}, paragraphs=${paragraphs.join('|')}, export bold=${/<strong>Brot<\/strong>/.test(exported)}, reopened=${JSON.stringify(reopened)}, problems=${problems.join(' | ') || '-'}` };
});

test('P38', 'Textkarte als Klartext: bleibt Text und kopiert unverändert; Schreibstudio aus dem Klartext-Editor speichert erst; ein fehlschlagendes Umwandeln lässt die Karte unverändert', { clipboard: true }, async ({ page, clean }) => {
  const card = await pasteTextCard(page, 'Klartext bleibt\nZeile  2');
  await inspectorAction(page, card.id, 'Als Klartext bearbeiten');
  await page.waitForSelector('.cb-composer .cm-content');
  const plainSurface = await page.evaluate(() => ({ cm: !!document.querySelector('.cb-composer .cm-content'), doc: !!document.querySelector('.cb-doc__prose'), studioButton: !!document.querySelector('.cb-canvas-bar [aria-label="Im Schreibstudio bearbeiten"]') }));
  await page.click('.cb-composer .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' ok');
  await savedStatus(page);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  const edited = (await dbItems(page)).find((i) => i.id === card.id);
  await page.click('.cb-inspector .cb-inspector__actions button:has-text("Kopieren")');
  await page.waitForSelector('.cb-notice[data-tone="success"]:has-text("kopiert")');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // from inside the plain editor: unsaved typing is stored first, then the dialog asks
  await inspectorAction(page, card.id, 'Als Klartext bearbeiten');
  await page.waitForSelector('.cb-composer .cm-content');
  await page.click('.cb-composer .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('!');
  await page.click('.cb-canvas-bar [aria-label="Im Schreibstudio bearbeiten"]');
  await page.waitForSelector('.cb-card-dialog:has-text("Schreibstudio")');
  const beforeConvert = (await dbItems(page)).find((i) => i.id === card.id);
  // a failing commit: error, the text card stays exactly as it was, the plain editor stays open
  await page.evaluate(() => {
    window.__fail = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__fail) throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.click('.cb-card-dialog .cb-button--primary:has-text("Umwandeln")');
  await page.waitForSelector('.cb-notice[data-tone="error"]:has-text("unverändert")');
  await page.evaluate(() => (window.__fail = false));
  const afterFailure = (await dbItems(page)).find((i) => i.id === card.id);
  const stillPlain = !!(await page.$('.cb-composer .cm-content'));
  await page.click('.cb-card-dialog .cb-button--primary:has-text("Umwandeln")');
  await page.waitForSelector('.cb-composer .cb-doc__prose');
  const converted = (await dbItems(page)).find((i) => i.id === card.id);
  const surface = await page.evaluate(() => ({ prose: document.querySelector('.cb-doc__prose').innerText.trim(), cm: !!document.querySelector('.cb-composer .cm-content'), closes: document.querySelectorAll('[aria-label="Editor schließen"]').length }));
  const problems = await clean(['DataTransfer.', 'clipboard']);
  const ok =
    plainSurface.cm && !plainSurface.doc && plainSurface.studioButton && edited.kind === 'text' && edited.body === 'Klartext bleibt\nZeile  2 ok' && copied === edited.body &&
    beforeConvert.kind === 'text' && beforeConvert.body === 'Klartext bleibt\nZeile  2 ok!' && JSON.stringify(afterFailure) === JSON.stringify(beforeConvert) && stillPlain &&
    converted.kind === 'document' && converted.text === beforeConvert.body && !surface.cm && surface.closes === 1 && !problems.length;
  return { ok, observed: `plain=${JSON.stringify(plainSurface)}, edited=${JSON.stringify(edited.body)} kind=${edited.kind}, copied=${JSON.stringify(copied)}, flushed=${JSON.stringify(beforeConvert.body)}, failure unchanged=${JSON.stringify(afterFailure) === JSON.stringify(beforeConvert)} plain still open=${stillPlain}, converted=${converted.kind} ${JSON.stringify(converted.text)}, surface=${JSON.stringify(surface)}, problems=${problems.join(' | ') || '-'}` };
});


// --- Editor workspace (Run D): floating surfaces, line band, completion, Explorer, Inspector hierarchy, "Neu erstellen" ----
/** "Neu erstellen" from the board's context menu (closes an open editor first). */
const createVia = async (page, label) => {
  if (await page.$('.cb-composer')) {
    await page.click('[aria-label="Editor schließen"]');
    await page.waitForSelector('.cb-composer', { state: 'detached' });
  }
  await page.mouse.click(720, 135, { button: 'right' });
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Neu erstellen")');
  await page.waitForSelector('dialog[open] .cb-create');
  await page.click(`.cb-create__main:has-text("${label}")`);
  // the editor chunk loads lazily: type only once the writing surface itself has focus
  await page.waitForFunction(() => document.activeElement?.closest('.cb-composer__body'));
};
/** Labels of the open completion list. */
const completionLabels = (page) => page.$$eval('.cm-tooltip-autocomplete li .cm-completionLabel', (els) => els.map((e) => e.textContent));
const failPuts = (page) =>
  page.evaluate(() => {
    window.__fail = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__fail) throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });

test('P39', 'Klartext: schwebende, zentrierte Schreibfläche, gerundete Zeilenhervorhebung statt Balken; Tabs, Leerzeichen, Schlusszeilenumbruch und CRLF bleiben bytegenau; Undo/Redo; Reload', async ({ page, clean }) => {
  await createVia(page, 'Klartext');
  await page.waitForSelector('.cb-sheet .cm-content');
  await page.keyboard.type('Erste Zeile');
  await page.keyboard.insertText('\t');
  await page.keyboard.type('mit Tab  ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zweite');
  await page.keyboard.press('Enter');
  await savedStatus(page);
  await page.waitForSelector('.cb-lineband');
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector('.cb-sheet').getBoundingClientRect();
    const panes = document.querySelector('.cb-composer__panes').getBoundingClientRect();
    const band = document.querySelector('.cb-lineband');
    const b = band.getBoundingClientRect();
    return {
      centred: Math.abs(sheet.left - panes.left - (panes.right - sheet.right)) < 2,
      bounded: sheet.width < panes.width - 40,
      floating: getComputedStyle(document.querySelector('.cb-sheet')).boxShadow !== 'none' && parseFloat(getComputedStyle(document.querySelector('.cb-sheet')).borderTopLeftRadius) > 8,
      band: { radius: parseFloat(getComputedStyle(band).borderTopLeftRadius), inside: b.left >= sheet.left && b.right <= sheet.right },
      oldBar: !!document.querySelector('.cm-activeLine'),
      status: document.querySelector('.cb-sheet__status')?.textContent,
      title: document.querySelector('#cb-composer-title').value,
    };
  });
  const own = (await dbItems(page)).find((i) => i.kind === 'text' && i.title === 'Erste Zeile mit Tab');
  await page.click('[aria-label="Rückgängig"]');
  await page.click('[aria-label="Rückgängig"]');
  const undone = await page.$eval('.cb-sheet .cm-content', (e) => e.textContent);
  await page.click('[aria-label="Wiederholen"]');
  await page.click('[aria-label="Wiederholen"]');
  await savedStatus(page);
  const redone = (await dbItems(page)).find((i) => i.id === own?.id);
  // a stored CRLF text keeps its line endings: edits continue them, nothing is rewritten on open
  const crlf = { ...own, id: 'it-local-crlf-e2e', title: 'CRLF-Text', body: 'A\r\nB\t \r\n', updatedAt: '2026-01-01T00:00:00.000Z' };
  await dbPut(page, crlf);
  await page.reload();
  await page.waitForSelector('.cb-tile');
  await inspectorAction(page, crlf.id, 'Als Klartext bearbeiten');
  await page.waitForSelector('.cb-sheet .cm-content');
  const crlfStatus = await page.$eval('.cb-sheet__status', (e) => e.textContent);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-composer', { state: 'detached' });
  const untouched = (await dbItems(page)).find((i) => i.id === crlf.id);
  await inspectorAction(page, crlf.id, 'Als Klartext bearbeiten');
  await page.waitForSelector('.cb-sheet .cm-content');
  await page.click('.cb-sheet .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('C');
  await page.keyboard.press('Enter');
  await page.keyboard.type('D');
  await savedStatus(page);
  const edited = (await dbItems(page)).find((i) => i.id === crlf.id);
  const problems = await clean();
  const ok =
    geometry.centred && geometry.bounded && geometry.floating && geometry.band.radius >= 6 && geometry.band.inside && !geometry.oldBar && /Wörter/.test(geometry.status) &&
    geometry.title === 'Erste Zeile mit Tab' && own?.body === 'Erste Zeile\tmit Tab  \nZweite\n' && undone !== 'Erste Zeile\tmit Tab  Zweite' && redone?.body === own?.body &&
    /CRLF/.test(crlfStatus) && untouched.body === crlf.body && untouched.updatedAt === crlf.updatedAt && edited.body === 'A\r\nB\t \r\nC\r\nD' && !problems.length;
  return { ok, observed: `geometry=${JSON.stringify(geometry)}, body=${JSON.stringify(own?.body)}, undo→${JSON.stringify(undone)}, redo=${JSON.stringify(redone?.body)}, crlf status=${crlfStatus}, untouched=${untouched.updatedAt === crlf.updatedAt}, edited=${JSON.stringify(edited.body)}, problems=${problems.join(' | ') || '-'}` };
});

test('P40', 'Dokument als schwebendes A4-Blatt (210:297) mit Abstand zur eigenen Glass-Kontextleiste; langer Text verlängert das Blatt statt abgeschnitten zu werden; Zoom skaliert; Druck ohne Radius und Schatten', async ({ page, clean }) => {
  await createVia(page, 'Dokument');
  await page.waitForSelector('.cb-doc__prose');
  await page.keyboard.type('Kurz');
  await savedStatus(page);
  const measure = () =>
    page.evaluate(() => {
      const el = document.querySelector('.cb-doc__page');
      const r = el.getBoundingClientRect();
      const rail = document.querySelector('.cb-rail');
      const railRect = rail?.getBoundingClientRect();
      const prose = document.querySelector('.cb-doc__prose').getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        w: Math.round(r.width),
        ratio: +(r.height / r.width).toFixed(3),
        radius: parseFloat(s.borderTopLeftRadius),
        shadow: s.boxShadow !== 'none',
        railGlass: rail ? getComputedStyle(rail).backgroundImage !== 'none' && parseFloat(getComputedStyle(rail).borderTopLeftRadius) > 8 : false,
        railGap: railRect ? Math.round(railRect.left - document.querySelector('.cb-composer__panes').getBoundingClientRect().right) : -1,
        proseInside: prose.bottom <= r.bottom + 1,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
  const short = await measure();
  const paragraph = 'Ein längerer Absatz, der die erste Seite füllt und darüber hinaus weiterfließt. '.repeat(14);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(paragraph);
  }
  await savedStatus(page);
  const long = await measure();
  await page.click('.cb-doc__zoom .cb-tool:last-child');
  const zoomed = await measure();
  await page.emulateMedia({ media: 'print' });
  const print = await page.$eval('.cb-doc__page', (e) => ({ radius: getComputedStyle(e).borderTopLeftRadius, shadow: getComputedStyle(e).boxShadow, ratio: getComputedStyle(e).aspectRatio }));
  await page.emulateMedia({ media: 'screen' });
  const problems = await clean();
  const a4 = 297 / 210;
  const ok =
    Math.abs(short.ratio - a4) < 0.01 && short.radius > 8 && short.shadow && short.railGlass && short.railGap >= 12 && long.ratio > a4 + 0.2 && long.proseInside && zoomed.w > long.w &&
    print.radius === '0px' && print.shadow === 'none' && print.ratio === 'auto' && !short.overflow && !problems.length;
  return { ok, observed: `short=${JSON.stringify(short)}, long=${JSON.stringify(long)}, zoomed w=${zoomed.w}, print=${JSON.stringify(print)}, problems=${problems.join(' | ') || '-'}` };
});

test('P41', 'Code: lokale Vorschläge (console.log, eigene Namen), Annahme per Enter, Klammerpaar bleibt, manuelles Öffnen über die Werkzeugleiste mit Tastaturnavigation, Go-Schlüsselwörter; alles gespeichert', async ({ page, clean }) => {
  await createVia(page, 'Code');
  await page.waitForSelector('.cb-composer .cm-content');
  await page.keyboard.type('const total = 1;');
  // completion sources arrive with the language chunk (highlighted tokens show it is there)
  await page.waitForSelector('.cb-composer .cm-line span');
  await page.keyboard.press('Enter');
  await page.keyboard.type('console.lo');
  await page.waitForSelector('.cm-tooltip-autocomplete li');
  const members = await completionLabels(page);
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type('(tot');
  await page.waitForFunction(() => [...document.querySelectorAll('.cm-tooltip-autocomplete li')].some((li) => li.textContent.includes('total')));
  const locals = await completionLabels(page);
  // CodeMirror ignores Enter for 75 ms after the list changed (no accidental accept while typing on)
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.click('[aria-label="Vorschläge anzeigen"]');
  await page.waitForSelector('.cm-tooltip-autocomplete li');
  const first = await page.$eval('.cm-tooltip-autocomplete li[aria-selected]', (e) => e.textContent);
  await page.keyboard.press('ArrowDown');
  const second = await page.$eval('.cm-tooltip-autocomplete li[aria-selected]', (e) => e.textContent);
  await page.keyboard.press('Escape');
  const closed = !(await page.$('.cm-tooltip-autocomplete'));
  await savedStatus(page);
  const ts = (await dbItems(page)).find((i) => i.kind === 'code' && i.body.includes('console.log'));
  await page.selectOption('.cb-canvas-bar select', 'go');
  await page.keyboard.type('fu');
  await page.waitForSelector('.cm-tooltip-autocomplete li');
  const go = await completionLabels(page);
  await page.keyboard.press('Escape');
  await savedStatus(page);
  const problems = await clean();
  const ok =
    members.includes('log') && locals.includes('total') && ts?.body === 'const total = 1;\nconsole.log(total)\n' && first !== second && closed && go.includes('func') && !problems.length;
  return { ok, observed: `members=${members.slice(0, 6).join(',')}, locals has total=${locals.includes('total')}, body=${JSON.stringify(ts?.body)}, manual ${JSON.stringify(first)}→${JSON.stringify(second)}, closed=${closed}, go=${go.slice(0, 6).join(',')}, problems=${problems.join(' | ') || '-'}` };
});

test('P42', 'Explorer: echte Ordner und Elemente des Space, aktive Datei markiert, Ordner aufklappbar; Wechsel speichert zuerst – keine ungesicherte Änderung geht verloren; kein Überlauf', async ({ page, clean }) => {
  // a folder with the stand-up note and the debounce snippet: card on card
  const a = await (await page.$('.cb-tile[data-item-id="it-note-standup"] .cb-tile__open')).boundingBox();
  const b = await (await page.$('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open')).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(380);
  await page.mouse.up();
  await page.waitForSelector('.cb-tile--folder');
  await createVia(page, 'Klartext');
  await page.keyboard.type('Explorer Notiz');
  await savedStatus(page);
  await page.click('.cb-tool[aria-label="Explorer"]');
  await page.waitForSelector('.cb-explorer');
  const tree = await page.evaluate(() => {
    const ex = document.querySelector('.cb-explorer').getBoundingClientRect();
    return {
      active: document.querySelector('.cb-explorer__file[aria-current="page"]')?.textContent,
      folders: [...document.querySelectorAll('.cb-explorer__folder')].map((f) => f.textContent),
      outside: [...document.querySelectorAll('.cb-explorer__row')].filter((r) => r.getBoundingClientRect().right > ex.right + 1).length,
    };
  });
  await page.click('.cb-explorer__folder');
  await page.waitForSelector('.cb-explorer__fold[data-open] .cb-explorer__file:has-text("debounce")');
  // unsaved keystrokes, then switch at once
  await page.click('.cb-sheet .cm-content');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' plus Eile');
  await page.click('.cb-explorer__fold[data-open] .cb-explorer__file:has-text("debounce")');
  await page.waitForSelector('.cb-composer[data-kind="code"]');
  const after = await page.evaluate(() => ({ title: document.querySelector('#cb-composer-title, .cb-composer__heading h2')?.value ?? document.querySelector('.cb-composer__heading h2')?.textContent, explorer: !!document.querySelector('.cb-explorer'), active: document.querySelector('.cb-explorer__file[aria-current="page"]')?.textContent }));
  const note = (await dbItems(page)).find((i) => i.kind === 'text' && i.body.startsWith('Explorer Notiz'));
  const problems = await clean();
  const ok = tree.active === 'Explorer Notiz' && tree.folders.length >= 1 && !tree.outside && after.explorer && /debounce/.test(after.active ?? '') && note?.body === 'Explorer Notiz plus Eile' && !problems.length;
  return { ok, observed: `tree=${JSON.stringify(tree)}, after=${JSON.stringify(after)}, saved=${JSON.stringify(note?.body)}, problems=${problems.join(' | ') || '-'}` };
});

test('P43', 'Inspector: eine Primäraktion (Schreibstudio bei eigener Textkarte), Kopieren sichtbar, Organisieren gruppiert, Löschen gekennzeichnet; dieselben Aktionen wie im Kontextmenü', { clipboard: true }, async ({ page, clean }) => {
  const card = await pasteTextCard(page, 'Inspector Hierarchie');
  await page.click(`.cb-tile[data-item-id="${card.id}"] .cb-tile__open`);
  await page.waitForSelector('.cb-inspector__primary');
  const inspector = await page.evaluate(() => ({
    primary: document.querySelector('.cb-inspector__primary').textContent,
    quick: [...document.querySelectorAll('.cb-inspector__quick button')].map((b) => b.textContent),
    organize: [...document.querySelectorAll('.cb-inspector__organize .cb-inspector__chip:not([data-danger])')].map((b) => b.textContent),
    danger: [...document.querySelectorAll('.cb-inspector__chip[data-danger]')].map((b) => b.textContent),
    primaries: document.querySelectorAll('.cb-inspector .cb-button--primary').length,
  }));
  await page.click(`.cb-tile[data-item-id="${card.id}"] .cb-tile__open`, { button: 'right' });
  const menu = (await page.$$eval('.cb-context-menu [role="menuitem"]', (els) => els.map((e) => e.textContent.trim()))).filter((l) => l !== 'Öffnen');
  await page.keyboard.press('Escape');
  const all = [inspector.primary, ...inspector.quick, ...inspector.organize, ...inspector.danger].map((l) => l.trim());
  const same = all.length === menu.length && menu.every((l) => all.includes(l));
  // the favourite toggle keeps working from its new place
  await page.click('.cb-inspector__quick button:has-text("Favoriten")');
  await page.waitForSelector('.cb-inspector__quick button[aria-pressed="true"]');
  const problems = await clean(['DataTransfer.', 'clipboard.']);
  const ok = /Schreibstudio/.test(inspector.primary) && inspector.primaries === 1 && inspector.quick.some((l) => /Kopieren/.test(l)) && inspector.organize.some((l) => /Verschieben/.test(l)) && inspector.danger.some((l) => /Löschen/.test(l)) && same && !problems.length;
  return { ok, observed: `inspector=${JSON.stringify(inspector)}, menu=${menu.join('/')}, same=${same}, problems=${problems.join(' | ') || '-'}` };
});

test('P44', 'Neu erstellen: im offenen Ordner angelegt, gespeichert und direkt im Markdown-Editor geöffnet (Titel aus der ersten Zeile); ein fehlschlagendes Speichern zeigt kein Element; Aufnahme nutzt den Recorder', async ({ page, clean }) => {
  const a = await (await page.$('.cb-tile[data-item-id="it-note-standup"] .cb-tile__open')).boundingBox();
  const b = await (await page.$('.cb-tile[data-item-id="it-snippet-debounce"] .cb-tile__open')).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(380);
  await page.mouse.up();
  await page.waitForSelector('.cb-tile--folder');
  const folderId = await page.$eval('.cb-tile--folder', (e) => e.closest('[data-folder-id]')?.dataset.folderId ?? e.dataset.folderId);
  await page.click('.cb-tile--folder .cb-tile__open');
  await page.waitForSelector('.cb-folder-window');
  await page.click('[aria-label="Neu in diesem Ordner erstellen"]');
  await page.waitForSelector('dialog[open] .cb-create');
  const eyebrow = await page.$eval('.cb-create .cb-card-dialog__eyebrow', (e) => e.textContent);
  await page.click('.cb-create__main:has-text("Markdown")');
  await page.waitForSelector('.cb-composer[data-kind="markdown"] .cm-content');
  await page.keyboard.type('# Plan Q4');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Text');
  await savedStatus(page);
  const title = await page.$eval('#cb-composer-title', (e) => e.value);
  const md = (await dbItems(page)).find((i) => i.kind === 'markdown' && i.body.startsWith('# Plan Q4'));
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-composer', { state: 'detached' });
  // a failing commit: nothing appears, nothing opens, the notice says so
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cb-folder-window', { state: 'detached' }).catch(() => {});
  const before = (await dbItems(page)).length;
  const tilesBefore = await tileCount(page);
  await failPuts(page);
  await page.mouse.click(720, 135, { button: 'right' });
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Neu erstellen")');
  await page.click('.cb-create__main:has-text("Klartext")');
  await page.waitForSelector('.cb-notice[data-tone="error"]');
  const notice = await page.$eval('.cb-notice[data-tone="error"]', (e) => e.textContent);
  const failed = { composer: !!(await page.$('.cb-composer')), tiles: await tileCount(page) };
  await page.evaluate(() => (window.__fail = false));
  const after = (await dbItems(page)).length;
  // voice recording hands over to the recorder (which never asks for the microphone by itself)
  await page.mouse.click(720, 135, { button: 'right' });
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Neu erstellen")');
  await page.click('.cb-create__main:has-text("Sprachaufnahme")');
  const recorder = await page.waitForSelector('.cb-recorder').then(() => true, () => false);
  const problems = (await clean()).filter((p) => !/QuotaExceeded|quota/i.test(p));
  const ok =
    /Snippets|Ordner|›/.test(eyebrow) && title === 'Plan Q4' && md?.folderId === folderId && md?.body === '# Plan Q4\n\nText' &&
    /kein Text angelegt/.test(notice) && !failed.composer && failed.tiles === tilesBefore && after === before && recorder && !problems.length;
  return { ok, observed: `eyebrow=${eyebrow}, title=${title}, md=${JSON.stringify({ folderId: md?.folderId === folderId, body: md?.body })}, notice=${notice}, failed=${JSON.stringify(failed)} tiles before=${tilesBefore}, db ${before}→${after}, recorder=${recorder}, problems=${problems.join(' | ') || '-'}` };
});

test('P45', 'Markdown: gesetzte Quelle (Überschrift, Codeblock, Code-Chip), Auswahl-Pille formatiert die Auswahl ohne Fokusverlust; Quelltext/Vorschau/Split bleiben; Phone ohne Überbreite', async ({ page, clean }) => {
  await createVia(page, 'Markdown');
  await page.waitForSelector('.cb-md__source .cm-content');
  await page.keyboard.type('# Titel');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ein Wort mit `code` hier.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```');
  await page.keyboard.press('Enter');
  await page.keyboard.type('x = 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```');
  await savedStatus(page);
  const typeset = await page.evaluate(() => ({
    heading: !!document.querySelector('.cb-md__source .cb-mdheading .cb-mdh1'),
    chip: !!document.querySelector('.cb-md__source .cb-mdchip'),
    fence: document.querySelectorAll('.cb-md__source .cb-mdfence').length,
  }));
  // select "Wort" with the mouse: the pill appears once the drag ends
  const word = await page.evaluate(() => {
    const line = [...document.querySelectorAll('.cb-md__source .cm-line')].find((l) => l.textContent.startsWith('Ein Wort'));
    const range = document.createRange();
    const text = line.firstChild;
    range.setStart(text, 4);
    range.setEnd(text, 8);
    const r = range.getBoundingClientRect();
    return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 };
  });
  await page.mouse.move(word.x1, word.y);
  await page.mouse.down();
  await page.mouse.move(word.x2, word.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForSelector('.cm-tooltip.cb-pill');
  await page.click('.cm-tooltip.cb-pill [aria-label="Fett"]');
  await savedStatus(page);
  const focus = await page.evaluate(() => document.activeElement?.classList.contains('cm-content'));
  const body = (await dbItems(page)).find((i) => i.kind === 'markdown' && i.body.startsWith('# Titel'))?.body;
  await page.click('.cb-segmented button:has-text("Vorschau")');
  const preview = await page.$eval('.cb-markdown', (e) => ({ strong: e.querySelector('strong')?.textContent, h1: e.querySelector('h1')?.textContent }));
  await page.click('.cb-segmented button:has-text("Split")');
  const split = await page.$$eval('.cb-md > .cb-composer__pane[data-shown="true"]', (els) => els.length);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const problems = await clean();
  const ok = typeset.heading && typeset.chip && typeset.fence === 3 && focus && body === '# Titel\n\nEin **Wort** mit `code` hier.\n\n```\nx = 1\n```' && preview.strong === 'Wort' && preview.h1 === 'Titel' && split === 2 && !overflow && !problems.length;
  return { ok, observed: `typeset=${JSON.stringify(typeset)}, focus=${focus}, body=${JSON.stringify(body)}, preview=${JSON.stringify(preview)}, split panes=${split}, phone overflow=${overflow}, problems=${problems.join(' | ') || '-'}` };
});

// --- Studio identity & interaction polish (Run D.1): app grid, tag pairs, fluid Markdown modes ---------------------------
test('P46', 'App-Grid: Plus im eingeklappten Capture-Dock öffnet das schwebende App-Grid (7 Apps, Pfeiltasten, Escape mit Fokus zurück, Außenklick); fehlschlagendes Speichern öffnet nichts; Code wird erst gespeichert, dann geöffnet', async ({ page, clean }) => {
  const rest = await page.$eval('.cb-capture', (e) => ({ state: e.dataset.state, plus: e.querySelector('.cb-capture__lead')?.tagName }));
  await page.click('.cb-capture__lead');
  await page.waitForSelector('.cb-launcher[role="dialog"]');
  const labels = await page.$$eval('.cb-launcher .cb-app-tile__label', (els) => els.map((e) => e.textContent));
  const studios = await page.$$eval('.cb-launcher .cb-app-tile', (els) => els.map((e) => getComputedStyle(e).getPropertyValue('--st').trim()).filter(Boolean).length);
  const first = await page.evaluate(() => document.activeElement?.querySelector('.cb-app-tile__label')?.textContent);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const moved = await page.evaluate(() => document.activeElement?.querySelector('.cb-app-tile__label')?.textContent);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cb-launcher', { state: 'detached' });
  const focusBack = await page.evaluate(() => document.activeElement?.classList.contains('cb-capture__lead'));
  await page.click('.cb-capture__lead');
  await page.waitForSelector('.cb-launcher');
  await page.mouse.click(720, 135);
  const outside = await page.waitForSelector('.cb-launcher', { state: 'detached' }).then(() => true, () => false);
  // a failing commit: error notice, the launcher stays, no editor, nothing stored
  const before = (await dbItems(page)).length;
  await failPuts(page);
  await page.click('.cb-capture__lead');
  await page.click('.cb-launcher .cb-app-tile__main:has-text("Dokument")');
  await page.waitForSelector('.cb-notice[data-tone="error"]');
  const failed = { launcher: !!(await page.$('.cb-launcher')), composer: !!(await page.$('.cb-composer')), db: (await dbItems(page)).length };
  await page.evaluate(() => (window.__fail = false));
  // success: the item is committed before the editor opens; the launcher is gone
  await page.click('.cb-launcher .cb-app-tile__main:has-text("Code")');
  await page.waitForSelector('.cb-composer[data-kind="code"] .cb-codecenter');
  const stored = (await dbItems(page)).filter((i) => i.kind === 'code' && i.title === 'Neuer Code').length;
  const launcherGone = !(await page.$('.cb-launcher'));
  const studio = await page.$eval('.cb-composer', (e) => ({ studio: e.dataset.studio, name: e.querySelector('.cb-composer__studio')?.textContent, tab: !!e.querySelector('.cb-codecenter__tab'), status: e.querySelector('.cb-codecenter__status')?.textContent }));
  const problems = (await clean()).filter((p) => !/QuotaExceeded|quota/i.test(p));
  const ok =
    rest.state === 'rest' && rest.plus === 'BUTTON' && labels.join('|') === 'Dokument|Klartext|Markdown|Code|Sprachaufnahme|Bild/Datei importieren|Schnellnotiz' && studios === 7 &&
    first === 'Dokument' && moved === 'Sprachaufnahme' && focusBack && outside && failed.launcher && !failed.composer && failed.db === before &&
    stored === 1 && launcherGone && studio.studio === 'code' && studio.name === 'CodeCenter' && studio.tab && /Zeile 1, Spalte 1/.test(studio.status ?? '') && !problems.length;
  return { ok, observed: `rest=${JSON.stringify(rest)}, labels=${labels.join('|')}, studios=${studios}, keys ${first}→${moved}, focusBack=${focusBack}, outside=${outside}, failed=${JSON.stringify(failed)} (db before ${before}), stored=${stored}, launcherGone=${launcherGone}, studio=${JSON.stringify(studio)}, problems=${problems.join(' | ') || '-'}` };
});

test('P47', 'CodeCenter: Tag-Vervollständigung mit Enter setzt ein Tag-Paar (TSX <Card></Card>, HTML <section></section>), Cursor dazwischen; ein Undo nimmt das ganze Paar zurück, Redo stellt es her; gespeichert', async ({ page, clean }) => {
  await createVia(page, 'Code');
  await page.waitForSelector('.cb-composer .cm-content');
  await page.keyboard.type('const n = 1;');
  await page.waitForSelector('.cb-composer .cm-line span');
  await page.keyboard.press('Enter');
  await page.keyboard.type('function Card() {}');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('const a = <Ca');
  await page.waitForFunction(() => [...document.querySelectorAll('.cm-tooltip-autocomplete li')].some((li) => li.textContent.includes('Card')));
  const tsx = await completionLabels(page);
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  const line = () => page.evaluate(() => [...document.querySelectorAll('.cb-composer .cm-line')].map((l) => l.textContent).find((t) => t.startsWith('const a')));
  const paired = await line();
  await page.waitForTimeout(600);
  await page.keyboard.type('Hi');
  const inside = await line();
  await page.waitForTimeout(600);
  await page.keyboard.press('ControlOrMeta+Z');
  await page.keyboard.press('ControlOrMeta+Z');
  const undone = await line();
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  const redone = await line();
  await savedStatus(page);
  const ts = (await dbItems(page)).find((i) => i.kind === 'code' && i.body.includes('function Card'))?.body;
  // HTML: same item switched to HTML, a fresh line
  await page.selectOption('.cb-canvas-bar select', 'html');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('<sec');
  await page.waitForFunction(() => [...document.querySelectorAll('.cm-tooltip-autocomplete li')].some((li) => li.textContent === 'section'));
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type('x');
  const html = await page.evaluate(() => [...document.querySelectorAll('.cb-composer .cm-line')].map((l) => l.textContent).find((t) => t.includes('section')));
  await savedStatus(page);
  const problems = await clean();
  const ok =
    tsx.includes('Card') && paired === 'const a = <Card></Card>' && inside === 'const a = <Card>Hi</Card>' && !/<\/Card>/.test(undone ?? '') && /<Card><\/Card>|<Card>Hi<\/Card>/.test(redone ?? '') &&
    /const a = <Card>/.test(ts ?? '') && html === '<section>x</section>' && !problems.length;
  return { ok, observed: `tsx labels=${tsx.slice(0, 5).join(',')}, paired=${JSON.stringify(paired)}, inside=${JSON.stringify(inside)}, undone=${JSON.stringify(undone)}, redone=${JSON.stringify(redone)}, html=${JSON.stringify(html)}, problems=${problems.join(' | ') || '-'}` };
});

test('P48', 'Markdown: fließende Moduswechsel – dieselbe CodeMirror-Instanz, Auswahl, Scrollposition und Verlauf bleiben; die Spalten gleiten (kein Sprung), Tippen direkt nach dem Wechsel geht nicht verloren; Reduced Motion schaltet sofort', async ({ page, clean }) => {
  await createVia(page, 'Markdown');
  await page.waitForSelector('.cb-md__source .cm-content');
  const lines = Array.from({ length: 45 }, (_, i) => `Zeile ${i + 1}`).join('\n');
  await page.keyboard.insertText(`# Motion\n\n${lines}`);
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+End');
  await page.evaluate(() => {
    window.__cmEditor = document.querySelector('.cb-md__source .cm-editor');
    document.querySelector('.cb-md__source .cm-scroller').scrollTop = 140;
  });
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => ({ sel: getSelection().toString(), scroll: Math.round(document.querySelector('.cb-md__source .cm-scroller').scrollTop) }));
  // every frame of the switch: the source column must pass through intermediate widths (a glide, not a jump)
  const frames = page.evaluate(
    () =>
      new Promise((resolve) => {
        const seen = [];
        const t0 = performance.now();
        const tick = () => {
          seen.push(parseFloat(getComputedStyle(document.querySelector('.cb-md')).gridTemplateColumns));
          if (performance.now() - t0 < 1400) requestAnimationFrame(tick);
          else resolve(seen);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.click('.cb-composer [role="radio"]:has-text("Vorschau")');
  const widths = await frames;
  const start = widths[0];
  const mid = widths.filter((w) => w > 1 && w < start - 1);
  await page.waitForTimeout(100);
  const done = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.cb-md')).gridTemplateColumns.split(' ').map(parseFloat), inert: document.querySelector('.cb-md__source').inert, preview: !!document.querySelector('.cb-markdown h1') }));
  // back to the source and type at once: nothing is swallowed by the animation
  await page.click('.cb-composer [role="radio"]:has-text("Quelltext")');
  await page.evaluate(() => document.querySelector('.cb-md__source .cm-content').focus());
  const back = await page.evaluate(() => ({ same: window.__cmEditor === document.querySelector('.cb-md__source .cm-editor'), sel: getSelection().toString(), scroll: Math.round(document.querySelector('.cb-md__source .cm-scroller').scrollTop) }));
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await savedStatus(page);
  const typed = (await dbItems(page)).find((i) => i.kind === 'markdown' && i.body.startsWith('# Motion'))?.body ?? '';
  await page.keyboard.press('ControlOrMeta+Z');
  await page.waitForTimeout(100);
  await savedStatus(page);
  const undone = (await dbItems(page)).find((i) => i.kind === 'markdown' && i.body.startsWith('# Motion'))?.body ?? '';
  // reduced motion: the layout is final within a frame
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('.cb-composer [role="radio"]:has-text("Split")');
  await settle(page);
  const reduced = await page.evaluate(() => getComputedStyle(document.querySelector('.cb-md')).gridTemplateColumns.split(' ').map(parseFloat));
  const problems = await clean();
  const ok =
    before.sel === 'Zeile 11' && mid.length >= 3 && done.cols[0] === 0 && done.inert && done.preview && back.same && back.sel === before.sel && Math.abs(back.scroll - before.scroll) <= 2 &&
    typed.includes('Zeile 11!') && !undone.includes('Zeile 11!') && undone.includes('Zeile 45') && Math.abs(reduced[0] - reduced[1]) < 2 && !problems.length;
  return { ok, observed: `before=${JSON.stringify(before)}, glide ${Math.round(start)}→${mid.slice(0, 4).map(Math.round).join('/')}… (${mid.length} frames), done=${JSON.stringify({ ...done, cols: done.cols.map(Math.round) })}, back=${JSON.stringify(back)}, typed=${typed.includes('Zeile 11!')}, undone=${!undone.includes('Zeile 11!')}, reduced=${reduced.map(Math.round)}, problems=${problems.join(' | ') || '-'}` };
});

// --- Final UX Closure (Run D.2.1): editor header, notices bottom left, leading copy, space reorder, standard Markdown ----
/** Rect of a selector, rounded. */
const rectOf = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; });
const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

test('P49', 'Closure: Editor-Header mit Studio-Glyph neben dem Namen und ohne Space-Pfad, Titel ohne Unterlinie; Kopieren als führende Kartenaktion mit Bestätigung, Vorschau frei; Hinweise unten links ohne Überdeckung, Undo mit Laufzeit; Markdown-Vorschau nach Standard', { clipboard: true }, async ({ page, clean }) => {
  // cards: copy leads (filled on hover), "…" stays quiet, nothing sits on the preview
  const tile = page.locator(`${LIVE_TILES}[data-kind="text"]`).first();
  await tile.hover();
  await page.waitForTimeout(400);
  const card = await tile.evaluate((el) => {
    const primary = el.querySelector('.cb-tile__primary');
    const more = el.querySelector('.cb-tile__actions .cb-icon-button:not(.cb-tile__primary)');
    const box = (e) => e.getBoundingClientRect();
    const p = box(el.querySelector('.cb-tile__preview'));
    const a = box(el.querySelector('.cb-tile__actions'));
    return { primaryBg: getComputedStyle(primary).backgroundImage, moreBg: getComputedStyle(more).backgroundColor, label: primary.getAttribute('aria-label'), clearOfPreview: a.top >= p.bottom - 1 };
  });
  await tile.locator('.cb-tile__primary').click();
  await page.waitForSelector(`${LIVE_TILES}[data-kind="text"] .cb-tile__primary[data-done]`);
  const copied = await page.evaluate(async () => ({ tag: getComputedStyle(document.querySelector('.cb-tile__primary[data-done]'), '::after').content, clip: await navigator.clipboard.readText() }));
  await page.waitForSelector('.cb-notice[data-tone="success"]');
  await page.waitForTimeout(450);
  const toast = await rectOf(page, '.cb-notice');
  const composer = await rectOf(page, '.cb-composer-dock > .cb-capture');
  const dock = await rectOf(page, '.cb-navdock-rail');
  await page.click('[aria-label="Hinweis schließen"]');
  // an undoable notice: its own glyph and a running time line
  const own = await pasteTextCard(page, 'Closure Undo');
  await page.click(`.cb-tile[data-item-id="${own.id}"] .cb-tile__open`, { button: 'right' });
  await page.click('.cb-context-menu [role="menuitem"]:has-text("Löschen")');
  await page.waitForSelector('.cb-notice[data-undo]');
  const undo = await page.$eval('.cb-notice[data-undo]', (e) => ({ icon: e.querySelector('.cb-notice__icon .cb-icon').dataset.icon, line: getComputedStyle(e, '::after').animationName, action: e.querySelector('.cb-notice__action')?.textContent }));
  await page.click('.cb-notice__action');
  // editor header: glyph beside the studio name, no space path; the title field has no underline
  await createVia(page, 'Markdown');
  await page.waitForSelector('.cb-md__source .cm-content');
  await page.keyboard.insertText('# Abstand\n\nOben\n\n\n\nUnten');
  await page.click('#cb-composer-title');
  await page.waitForTimeout(400);
  const header = await page.evaluate(() => {
    const glyph = document.querySelector('.cb-composer__eyebrow .cb-studio-glyph').getBoundingClientRect();
    const name = document.querySelector('.cb-composer__studio').getBoundingClientRect();
    const title = document.querySelector('#cb-composer-title');
    const s = getComputedStyle(title);
    return { eyebrow: document.querySelector('.cb-composer__eyebrow').textContent, glyph: Math.round(glyph.width), sideBySide: name.left > glyph.right && Math.abs((name.top + name.bottom) / 2 - (glyph.top + glyph.bottom) / 2) <= 2, underline: /0px 2px 0px -1px/.test(s.boxShadow) || s.textDecorationLine !== 'none' || parseFloat(s.borderBottomWidth) > 0, tinted: !/[ ,/] ?0\)$/.test(s.backgroundColor) };
  });
  // Markdown preview: blank-line runs follow the standard (no artificial gaps)
  await page.click('.cb-composer [role="radio"]:has-text("Split")');
  await page.waitForSelector('.cb-markdown p');
  const md = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.cb-markdown p')];
    const oben = ps.find((p) => p.textContent === 'Oben').getBoundingClientRect();
    const unten = ps.find((p) => p.textContent === 'Unten').getBoundingClientRect();
    return { gap: Math.round(unten.top - oben.bottom), rowGap: parseFloat(getComputedStyle(document.querySelector('.cb-markdown')).rowGap), gaps: document.querySelectorAll('.cb-md-gap').length };
  });
  const problems = await clean(['DataTransfer.', 'clipboard.']);
  const ok =
    /gradient/.test(card.primaryBg) && card.moreBg === 'rgba(0, 0, 0, 0)' && /Kopieren/.test(card.label) && card.clearOfPreview &&
    copied.tag === '"Kopiert"' && copied.clip.length > 0 &&
    toast.l <= 40 && !overlaps(toast, composer) && !overlaps(toast, dock) && toast.b <= 900 &&
    undo.icon === 'undo' && undo.line === 'cb-toast-time' && undo.action === 'Rückgängig' &&
    !/Entwicklung|·/.test(header.eyebrow) && header.glyph >= 26 && header.sideBySide && !header.underline && header.tinted &&
    md.gaps === 0 && Math.abs(md.gap - md.rowGap) <= 1 && !problems.length;
  return { ok, observed: `card=${JSON.stringify(card)}, copied=${JSON.stringify({ tag: copied.tag, clip: copied.clip.length })}, toast=${JSON.stringify(toast)} composer=${JSON.stringify(composer)}, undo=${JSON.stringify(undo)}, header=${JSON.stringify(header)}, md=${JSON.stringify(md)}, problems=${problems.join(' | ') || '-'}` };
});

test('P50', 'Notices stehen auf Desktop, Tablet und Phone unten links, frei von Composer, Dock, App-Grid und sicheren Rändern', { clipboard: true }, async ({ page, clean }) => {
  const seen = {};
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['laptop', { width: 1280, height: 800 }], ['tablet', { width: 834, height: 1112 }], ['phone', { width: 390, height: 844 }]]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(350);
    await page.evaluate(() => document.querySelector('.cb-tile[data-kind="text"]:not(.cb-departure *) .cb-tile__primary').click());
    await page.waitForSelector('.cb-notice');
    await page.waitForTimeout(450);
    const toast = await rectOf(page, '.cb-notice');
    const composer = await rectOf(page, '.cb-composer-dock > .cb-capture');
    const mobileDock = (await page.$('.cb-dock')) ? await rectOf(page, '.cb-dock') : null;
    seen[name] = { toast, ok: toast.l <= 40 && toast.r <= vp.width - 8 && toast.b <= vp.height - 8 && !overlaps(toast, composer) && !(mobileDock && mobileDock.b > 0 && overlaps(toast, mobileDock)) };
    await page.click('[aria-label="Hinweis schließen"]');
  }
  // the launcher's own error ("could not save") stays visible and clear of the launcher's tiles
  await failPuts(page);
  for (const [name, vp] of [['launcher-laptop', { width: 1280, height: 800 }], ['launcher-desktop', { width: 1440, height: 900 }]]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    await page.click('.cb-capture__lead');
    await page.click('.cb-launcher .cb-app-tile__main:has-text("Dokument")');
    await page.waitForSelector('.cb-notice[data-tone="error"]');
    await page.waitForTimeout(450);
    const toast = await rectOf(page, '.cb-notice');
    const launcher = await rectOf(page, '.cb-launcher');
    seen[name] = { toast, ok: toast.l <= 40 && toast.t >= 0 && !overlaps(toast, launcher) };
    await page.click('[aria-label="Hinweis schließen"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cb-launcher', { state: 'detached' });
  }
  const problems = (await clean(['clipboard.'])).filter((p) => !/QuotaExceeded|quota/i.test(p));
  const ok = Object.values(seen).every((v) => v.ok) && !problems.length;
  return { ok, observed: `${JSON.stringify(seen)}, problems=${problems.join(' | ') || '-'}` };
});

test('P51', 'Spaces sortieren: Griff pro Space, Ziehen mit Platzhalter, Tastatur (Pfeile am Griff), Reihenfolge bleibt nach Reload; Karten-Drop auf einen Space funktioniert weiter; Navigation unverändert', async ({ page, clean }) => {
  const names = () => page.$$eval('.cb-spaces-flyout__list > li .cb-spaces-flyout__item', (els) => els.map((e) => e.title));
  await page.hover('.cb-space-switch__trigger');
  await page.waitForSelector('.cb-space-switch[data-open]');
  await page.waitForTimeout(300);
  const before = await names();
  const grips = await page.$$eval('.cb-spaces-flyout__grip', (els) => els.map((e) => e.getAttribute('aria-label')));
  // drag the first space two rows down: the slot shows where it lands
  const g = await (await page.$('.cb-spaces-flyout__grip')).boundingBox();
  const pitch = await page.$$eval('.cb-spaces-flyout__list > li', (els) => els[1].offsetTop - els[0].offsetTop);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + pitch * 2, { steps: 10 });
  const during = await page.evaluate(() => ({ slot: !!document.querySelector('.cb-spaces-flyout__slot'), lifted: document.querySelector('li[data-lifted] .cb-spaces-flyout__item')?.title, open: document.querySelector('.cb-space-switch').hasAttribute('data-open') }));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await names();
  // keyboard: arrow up on the moved space's grip, focus stays on it, the list stays open
  await page.focus(`.cb-spaces-flyout__grip[data-reorder="${await page.$eval(`.cb-spaces-flyout__item[title="${before[0]}"]`, (e) => e.dataset.spaceId)}"]`);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  const keyed = await names();
  const keyFocus = await page.evaluate(() => ({ grip: document.activeElement?.classList.contains('cb-spaces-flyout__grip'), open: document.querySelector('.cb-space-switch').hasAttribute('data-open'), said: document.querySelector('.cb-spaces-flyout [role="status"]').textContent }));
  await page.keyboard.press('Escape');
  // persisted: the spaces' order field in IndexedDB, and the flyout after a reload
  await page.reload();
  await page.waitForSelector('.cb-tile');
  const reloaded = await names();
  // cards still drop onto a space in the flyout (moves the card), the order stays
  const card = await (await page.$(`${LIVE_TILES}[data-kind="text"] .cb-tile__open`)).boundingBox();
  const cardId = await page.$eval(`${LIVE_TILES}[data-kind="text"]`, (e) => e.dataset.itemId);
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + 40, card.y + 40, { steps: 4 });
  const trigger = await (await page.$('.cb-space-switch__trigger')).boundingBox();
  await page.mouse.move(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2, { steps: 10 });
  await page.waitForSelector('.cb-space-switch[data-open]');
  await page.waitForTimeout(250);
  const target = await (await page.$(`.cb-spaces-flyout__item[title="Ideen"]`)).boundingBox();
  await page.mouse.move(target.x + 60, target.y + target.height / 2, { steps: 8 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterDrop = await names();
  // navigation is unchanged; the dropped card now lives in "Ideen"
  await gotoSpace(page, 'Ideen');
  const title = await h1(page);
  const moved = { spaceId: (await page.$(`${LIVE_TILES}[data-item-id="${cardId}"]`)) ? 'sp-ideas' : null };
  const problems = await clean(['DataTransfer.']);
  const expectDrag = [before[1], before[2], before[0], ...before.slice(3)];
  const expectKey = [before[1], before[0], before[2], ...before.slice(3)];
  const ok =
    grips.length === before.length && grips.every((l) => /verschieben/.test(l)) && during.slot && during.lifted === before[0] && during.open &&
    JSON.stringify(dragged) === JSON.stringify(expectDrag) && JSON.stringify(keyed) === JSON.stringify(expectKey) && keyFocus.grip && keyFocus.open && /Position 2/.test(keyFocus.said) &&
    JSON.stringify(reloaded) === JSON.stringify(expectKey) && JSON.stringify(afterDrop) === JSON.stringify(expectKey) && moved?.spaceId === 'sp-ideas' && title === 'Ideen' && !problems.length;
  return { ok, observed: `before=${before}, during=${JSON.stringify(during)}, dragged=${dragged}, keyed=${keyed} ${JSON.stringify(keyFocus)}, reloaded=${reloaded}, moved=${moved?.spaceId}, afterDrop=${afterDrop}, title=${title}, problems=${problems.join(' | ') || '-'}` };
});

const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null; // e.g. E2E_ONLY='^(P6|P23)$' for a focused run
for (const t of tests) {
  if (ONLY && !ONLY.test(t.id)) continue;
  const t0 = Date.now();
  let r;
  let app;
  try {
    app = await openPreview(t.opts);
    globalThis.__step = '';
    r = await t.fn(app);
  } catch (e) {
    r = { ok: false, observed: 'Testfehler: ' + String(e.message || e).split('\n')[0] + (globalThis.__step ? ` @ ${globalThis.__step}` : '') };
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
