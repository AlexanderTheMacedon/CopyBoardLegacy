import { paletteColor, safeHref } from '../../domain/document';

const BLOCKED = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,video,audio,img,picture,source,template,noscript';
const STYLE_ALLOWED = new Set(['font-weight', 'font-style', 'text-decoration', 'text-align']);
const ATTRS_ALLOWED = new Set(['colspan', 'rowspan', 'start', 'type', 'data-type', 'data-checked', 'align']);
// Curated document formatting (schema 2) travels as data attributes; the editor's parsers accept only palette/list values.
const FORMAT_ATTRS = new Set(['data-font', 'data-size', 'data-text-color', 'data-color', 'data-indent', 'data-line-height', 'data-spacing']);

/**
 * Clipboard HTML is parsed into an inert document (nothing loads or runs), stripped of active content, event handlers,
 * unsafe URLs and all styling except basic emphasis and palette colours, and only then handed to ProseMirror, which keeps
 * just what the schema knows. Dangerous markup therefore cannot survive, and styles cannot smuggle in colours, fonts or
 * sizes outside the curated sets: those come back only through data attributes the editor validates value by value.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(BLOCKED).forEach((el) => el.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name === 'href' && el.tagName === 'A') {
        if (!safeHref(attr.value)) el.removeAttribute(attr.name);
      } else if (name === 'style') {
        const kept = attr.value
          .split(';')
          .map((rule) => rule.trim())
          .filter((rule) => {
            const [prop = '', value = ''] = rule.split(':').map((part) => part.trim().toLowerCase());
            return STYLE_ALLOWED.has(prop) || (prop === 'color' && !!paletteColor(value));
          });
        if (kept.length) el.setAttribute('style', kept.join(';'));
        else el.removeAttribute('style');
      } else if (!ATTRS_ALLOWED.has(name) && !FORMAT_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

