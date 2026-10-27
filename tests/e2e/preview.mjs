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
const tileIds = (page) => page.$$eval('.cb-grid .cb-tile', (els) => els.map((e) => e.dataset.itemId));
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
const tileCount = (page) => page.$$eval('.cb-grid .cb-tile', (els) => els.length);

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

test('P6', 'editor opens from the inspector with source/preview/split, safe preview, one close control top right', async ({ page, clean }) => {
  await page.click('.cb-tile[data-item-id="it-prompt-review"] .cb-tile__open');
  await page.click('.cb-inspector button:has-text("Bearbeiten")');
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
  // Header: no back arrow; while the rail is open only the rail's own ✕ controls it; close sits at the far right.
  const header = await page.$eval('.cb-composer__header', (h) => ({
    back: !!h.querySelector('[aria-label*="Zurück"]'),
    railToggle: !!h.querySelector('[aria-label*="Kontextleiste"]'),
    lastIsClose: h.lastElementChild?.getAttribute('aria-label') === 'Editor schließen',
  }));
  await page.click('[aria-label="Kontextleiste schließen"]');
  const reopen = await page.$$eval('.cb-composer__header [aria-label="Kontextleiste einblenden"]', (els) => els.length);
  await page.click('[aria-label="Editor schließen"]');
  await page.waitForSelector('.cb-inspector');
  const problems = await clean();
  const ok = mode === 'split' && panes === 2 && inspectorHidden && previewH1 === 'Code-Review' && /nicht gespeichert/.test(status) && !injected.img && !injected.xss && previewOnly === 1 && rail && !header.back && !header.railToggle && header.lastIsClose && reopen === 1 && !problems.length;
  return { ok, observed: `mode=${mode}, panes=${panes}->${previewOnly}, rail=${rail}, header=${JSON.stringify(header)}, reopen buttons=${reopen}, status="${status}", injected=${JSON.stringify(injected)}` };
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
    await page.mouse.click(1100, 860); // empty board area: nothing editable has focus
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
  await page.mouse.click(1100, 860, { button: 'right' });
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
  await page.mouse.click(1100, 860, { button: 'right' });
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
  await page.mouse.click(1100, 860);
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

test('P10', 'dock is compact and centred on its core; it grows up and down around the core as an overlay', async ({ page, clean }) => {
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
  const ok = rest.h < 260 && rest.w <= 64 && open.w >= 220 && open.top < rest.top && open.bottom > rest.bottom && Math.abs(coreRest - 450) <= 1 && coreRest === coreOpen && flyout && x0 === x1 && !problems.length;
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

test('P13', 'reduced motion: no transitions; the photographic scene is static', { reducedMotion: 'reduce' }, async ({ page, clean }) => {
  const motion = await page.evaluate(() => ({
    tile: getComputedStyle(document.querySelector('.cb-tile__open')).transitionDuration,
    scene: getComputedStyle(document.querySelector('.cb-scene__photo')).animationName,
    photo: getComputedStyle(document.querySelector('.cb-scene__photo')).backgroundImage.includes('ambient-orange'),
  }));
  const problems = await clean();
  const ok = motion.tile.split(',').every((d) => parseFloat(d) === 0) && motion.scene === 'none' && motion.photo && !problems.length;
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
