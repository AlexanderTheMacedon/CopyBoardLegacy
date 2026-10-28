import { useCallback, useSyncExternalStore } from 'react';

/** Subscribes to a media query. Server/test render assumes "no match". */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Small-phone layout (Blueprint 04 §4.2 candidate: < 600 CSS px). Keep in sync with `--bp-phone` usages in CSS. */
export const PHONE_QUERY = '(max-width: 599.98px)';

export const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** ⌘V / Strg+V (not the "paste and match style" variants with Alt). */
export const isPasteShortcut = (event: KeyboardEvent): boolean =>
  event.key.toLowerCase() === 'v' && (event.metaKey || event.ctrlKey) && !event.altKey;
