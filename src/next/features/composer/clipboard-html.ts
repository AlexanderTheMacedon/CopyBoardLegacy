import { safeHref } from '../../domain/document';

const BLOCKED = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,video,audio,img,picture,source,template,noscript';
const STYLE_ALLOWED = new Set(['font-weight', 'font-style', 'text-decoration', 'text-align']);

/**
 * Clipboard HTML is parsed into an inert document (nothing loads or runs), stripped of active content, event handlers,
 * unsafe URLs and all styling except basic emphasis, and only then handed to ProseMirror, which keeps just what the
 * schema knows. Dangerous markup therefore cannot survive, and styles cannot smuggle in colours outside the palette.
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
          .filter((rule) => STYLE_ALLOWED.has(rule.split(':')[0]?.trim().toLowerCase() ?? ''));
        if (kept.length) el.setAttribute('style', kept.join(';'));
        else el.removeAttribute('style');
      } else if (!['colspan', 'rowspan', 'start', 'type', 'data-type', 'data-checked', 'align'].includes(name)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

