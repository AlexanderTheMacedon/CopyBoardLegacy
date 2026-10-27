import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/next/app/App';
import { renderMarkdown } from '../../src/next/features/composer/MarkdownPreview';
import { fixtureLibrary } from '../../src/next/fixtures';

// Server-side render smoke: every component tree renders in Node without browser APIs or runtime errors.

describe('React preview renders', () => {
  it('renders the shell for the default space', () => {
    const html = renderToStaticMarkup(<App library={fixtureLibrary} />);
    expect(html).toContain('class="cb-app"');
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('aria-label="Navigation"');
    // Dock at rest: only the active space is the switcher; the others live in the (closed, inert) flyout.
    expect(html).toMatch(/aria-label="Space: Entwicklung\. Space wechseln"/);
    expect(html).toContain('class="cb-paste-catcher"');
    expect(html).toContain('id="cb-main"');
    expect(html).toMatch(/<h1[^>]*>Entwicklung<\/h1>/);
    expect(html).toContain('aria-label="Schnellzugriff"');
    for (const space of fixtureLibrary.spaces) expect(html).toContain(space.name);
    expect(html.match(/class="cb-tile"/g)).toHaveLength(6);
    // Modal layers (search, settings, drawer, workspace dialogs) exist but mount no content until opened.
    expect(html.match(/<dialog/g)).toHaveLength(4);
    // Header tools: filter toggle, sort, view + density, new folder; filter chips stay folded by default.
    expect(html).toContain('aria-label="Filter einblenden"');
    expect(html).toContain('aria-label="Neuer Ordner"');
    expect(html).toContain('class="cb-hero__filters-fold"');
    expect(html).not.toContain('cb-palette__input');
  });

  it('renders the living empty state for an empty space and the unavailable state for sessions', () => {
    expect(renderToStaticMarkup(<App library={fixtureLibrary} initialLocation={{ type: 'space', spaceId: 'sp-ideas' }} />)).toContain(
      'Dieser Space ist noch leer',
    );
    const sessions = renderToStaticMarkup(<App library={fixtureLibrary} initialLocation={{ type: 'collection', collectionId: 'sessions' }} />);
    expect(sessions).toContain('Noch nicht verfügbar');
    expect(sessions).not.toContain('Dieser Space ist noch leer');
  });

  it('shows the space of every item in global collections', () => {
    const html = renderToStaticMarkup(<App library={fixtureLibrary} initialLocation={{ type: 'collection', collectionId: 'all' }} />);
    expect(html.match(/class="cb-tile"/g)).toHaveLength(fixtureLibrary.allItems().length);
    expect(html).toContain('cb-space-chip');
  });
});

describe('Markdown preview is safe', () => {
  const render = (source: string) => renderToStaticMarkup(<>{renderMarkdown(source)}</>);

  it('renders headings, lists, code and paragraphs', () => {
    const html = render('# Titel\n\nText eins\nText zwei\n\n- a\n- b\n\n```\nconst x = 1;\n```\n### Klein');
    expect(html).toBe('<h1>Titel</h1><p>Text eins Text zwei</p><ul><li>a</li><li>b</li></ul><pre><code>const x = 1;</code></pre><h3>Klein</h3>');
  });

  it('never interprets user HTML', () => {
    const html = render('<img src=x onerror="alert(1)">\n\n# <script>alert(1)</script>');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});
