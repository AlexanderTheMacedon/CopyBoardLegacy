import type { ReactNode } from 'react';

// Lucide-like line icons (D-002/Blueprint 04 §3.2): 24 px grid, fine 1.5 px stroke, drawn in-house to avoid a dependency.
const paths = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  paperclip: <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M8.5 20h7M12 16v4" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M15 4v16" />
    </>
  ),
  star: <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  layers: <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8Zm-8.5 9 8.5 4.5 8.5-4.5" />,
  waveform: <path d="M3.5 12h1.5M7.5 8.5v7M11 5v14M14.5 8v8M18 10.5v3M20.5 12h0" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20.5 16-4.5-4.5L7.5 19" />
    </>
  ),
  code: <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" />,
  text: <path d="M5 6.5h14M5 10.5h14M5 14.5h9M5 18.5h11" />,
  hash: <path d="M5 9.5h14M5 14.5h14M10.5 4.5 9 19.5M15 4.5l-1.5 15" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  pen: <path d="m15.5 5.5 3 3L8 19l-4 1 1-4Z" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M12 4v16" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  shield: <path d="M12 3.5 19 6.5v5.5c0 4.3-2.9 7.3-7 8.6-4.1-1.3-7-4.3-7-8.6V6.5Z" />,
  inbox: (
    <>
      <path d="M4 13.5 6.5 6h11l2.5 7.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M4 13.5h4.5l1.5 2h4l1.5-2H20" />
    </>
  ),
  spaces: (
    <>
      <rect x="4" y="4" width="16" height="6.5" rx="2.5" />
      <rect x="4" y="13.5" width="16" height="6.5" rx="2.5" />
    </>
  ),
  pause: <path d="M9 6.5v11M15 6.5v11" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2.5" />,
  play: <path d="M8 5.5v13l10.5-6.5Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  arrowUpRight: <path d="M7 17 17 7M8.5 7H17v8.5" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  cornerDownLeft: <path d="M20 5v6a3 3 0 0 1-3 3H5M9 10l-4 4 4 4" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
  cloud: <path d="M7.5 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18.4 11a3.75 3.75 0 0 1-.9 7.5Z" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  sparkles: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9 5.6-1.9ZM19 3v3M20.5 4.5h-3M5 17v3M6.5 18.5h-3" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.5-1.7-.4-1.2.3-2.3 1.6-2.3h1.4a4 4 0 0 0 4-4C20.5 7.5 16.7 3.5 12 3.5Z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="14.5" cy="7.5" r="1" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6Z" />,
  link: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />,
  trash: <path d="M4.5 7h15M10 4h4M6.5 7l.9 11.2a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8L17.5 7M10.25 11v5M13.75 11v5" />,
  clipboard: (
    <>
      <rect x="8.5" y="3.5" width="7" height="3.5" rx="1.25" />
      <path d="M15.5 5.25h1.25a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7.25a2 2 0 0 1-2-2V7.25a2 2 0 0 1 2-2H8.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `cb-icon ${className}` : 'cb-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
