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
  minus: <path d="M6.5 12h11" />,
  expand: <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" />,
  shrink: <path d="M13.5 5.5v5h5M10.5 18.5v-5h-5M13.5 10.5l6-6M10.5 13.5l-6 6" />,
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
  // --- Workspace run: folders, selection, file management ---
  folderOpen: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V11M3.5 17V9.5l1.3 7.4A1.5 1.5 0 0 0 6.3 18h11.4a1.5 1.5 0 0 0 1.5-1.2L20.5 11H6.1" />,
  folderPlus: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2ZM12 10.5v5M9.5 13h5" />,
  folderInput: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-2M2 13h7M6.5 10.5 9 13l-2.5 2.5" />,
  checkSquare: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  square: <rect x="4" y="4" width="16" height="16" rx="4" />,
  squareDashed: <path d="M8 4h8M8 20h8M4 8v8M20 8v8M4 8a4 4 0 0 1 4-4M20 8a4 4 0 0 0-4-4M4 16a4 4 0 0 0 4 4M20 16a4 4 0 0 1-4 4" />,
  move: <path d="M12 3v18M3 12h18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  chevronUp: <path d="m6 14.5 6-6 6 6" />,
  copyPlus: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5M14.25 11.5v5M11.75 14h5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  sortAsc: <path d="M4 7h10M4 12h7M4 17h4M17 6v12M13.5 14.5 17 18l3.5-3.5" />,
  table: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18M9 10v9M15 10v9" />
    </>
  ),
  tag: <path d="M3.5 12.5V5.5a2 2 0 0 1 2-2h7l8 8-7 7Z M8 8h.01" />,
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2M9.5 9.5h.01M14.5 9.5h.01" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5h18" />
    </>
  ),
  rocket: <path d="M5 15.5c-1 1-1.5 3.5-1.5 3.5s2.5-.5 3.5-1.5M9.5 14.5 7 12c1-3 2.5-5.5 5-7.5 2.5-2 5.5-2 7-1.5.5 1.5.5 4.5-1.5 7-2 2.5-4.5 4-7.5 5l-.5-.5Z M9.5 14.5 7 17M15 7.5h.01" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4 4 0 0 1 12 7.5 4 4 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  book: <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5Zm0 0V21M7 18h12.5v3H7a2.5 2.5 0 0 1 0-3Z" />,
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" />
      <circle cx="12" cy="13" r="3.25" />
    </>
  ),
  music: <path d="M9 18.5V6l10-2v12.5M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />,
  home: <path d="M4 11 12 4l8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z" />
    </>
  ),
  flag: <path d="M5 21V4.5M5 4.5h12.5l-2.5 4 2.5 4H5" />,
  coffee: <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Zm11 1.5h1.5a2.25 2.25 0 0 1 0 4.5H16M8 5.5v-2M11.5 5.5v-2" />,
  leaf: <path d="M5 19c0-8 4.5-13 14-14-1 9.5-6 14-14 14Zm0 0c3-4 6-7 10-10" />,
  lightbulb: <path d="M9.5 18h5M10 21h4M8 11a4 4 0 1 1 7.2 2.4c-.8 1-1.2 1.8-1.2 2.6h-4c0-.8-.4-1.6-1.2-2.6A4 4 0 0 1 8 11Z" />,
  flask: <path d="M9.5 3.5h5M10.5 3.5v6L5.5 18a1.5 1.5 0 0 0 1.3 2.5h10.4a1.5 1.5 0 0 0 1.3-2.5l-5-8.5v-6M7.5 15h9" />,
  gamepad: <path d="M7 8.5h10a4.5 4.5 0 0 1 4.3 5.8l-.8 2.9a2.2 2.2 0 0 1-3.8.8L15 16H9l-1.7 2a2.2 2.2 0 0 1-3.8-.8l-.8-2.9A4.5 4.5 0 0 1 7 8.5ZM8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" />,
  gift: <path d="M4 11h16v9H4ZM12 8v12M3.5 8h17v3h-17ZM12 8c-3 0-4.5-1-4.5-2.5S9 3.5 12 8Zm0 0c3 0 4.5-1 4.5-2.5S15 3.5 12 8Z" />,
  graduation: <path d="M3 9.5 12 5l9 4.5-9 4.5Zm4 2v4.5c0 1.5 2.5 3 5 3s5-1.5 5-3V11.5M21 9.5v5" />,
  map: <path d="M9 4.5 3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7ZM9 4.5V17M15 7v12.5" />,
  package: <path d="M12 3.5 20 8v8l-8 4.5L4 16V8Zm0 0V21M4 8l8 4.5L20 8M8 5.75l8 4.5" />,
  cart: <path d="M3.5 4.5h2l2.2 10.3a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6.3M9.5 20h.01M17 20h.01" />,
  terminal: <path d="m5 7 5 5-5 5M12 18h7" />,
  users: (
    <>
      <circle cx="9.5" cy="8" r="3.25" />
      <path d="M3.5 20a6 6 0 0 1 12 0M16 11.25a3.25 3.25 0 1 0-1.5-6.1M20.5 19a5.5 5.5 0 0 0-4-5.3" />
    </>
  ),
  video: <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h9A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5Zm12 2.5 4.5-2.5v9L16 14" />,
  wallet: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V8M4 7.5V18a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5ZM16 14h.01" />,
  wrench: <path d="M14.5 6.5a4 4 0 0 0 4.8 4.8l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0 4.7-4.7L18 6.6l-2.6-.1Z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
    </>
  ),
  bookmark: <path d="M6.5 4.5h11V20L12 16.5 6.5 20Z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5Z" />
    </>
  ),
  database: <path d="M5 6c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5S5 7.4 5 6Zm0 0v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />,
  layout: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M3.5 10h17M10 10v10" />
    </>
  ),
  megaphone: <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l8 4V5l-8 4H5.5A1.5 1.5 0 0 0 4 10.5ZM8 15l1 5h3l-1-5M19 10v4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0ZM8 6H5.5a2.5 2.5 0 0 0 2.5 4M16 6h2.5A2.5 2.5 0 0 1 16 10M12 13v4M8.5 20h7M9.5 17h5v3h-5Z" />,
  puzzle: <path d="M10 4.5a1.75 1.75 0 1 1 3.5 0V6H16a1 1 0 0 1 1 1v2.5h1.5a1.75 1.75 0 1 1 0 3.5H17V17a1 1 0 0 1-1 1h-2.5v-1.5a1.75 1.75 0 1 0-3.5 0V18H7.5a1 1 0 0 1-1-1v-3H5a1.75 1.75 0 1 1 0-3.5h1.5V7a1 1 0 0 1 1-1H10Z" />,
  feather: <path d="M20 4c-5-1-10 2-12 7l-4 9M8 11l-2 9M8 11c3 1 6 0 8-2M20 4c1 5-2 10-7 12H8" />,
  anchor: <path d="M12 8v13M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 13H3c0 4.4 4 8 9 8s9-3.6 9-8h-2M9 13H5m10 0h4" />,
  pin: <path d="M12 21v-5M8 16h8l-1-5.5 1.5-2V5h-9v3.5l1.5 2Z" />,
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15ZM10 20a2 2 0 0 0 4 0" />,
  key: <path d="M14.5 14a4.5 4.5 0 1 0-3.9-2.3L4 18.3V20h1.7l.9-.9h1.6v-1.6h1.6v-1.6l1.6-1.6A4.4 4.4 0 0 0 14.5 14Zm1-5h.01" />,
  pencilRuler: <path d="M3.5 17.5 15 6l3 3L6.5 20.5h-3ZM13 8l3 3M18 3.5l2.5 2.5-1.5 1.5-2.5-2.5Z" />,
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.5 8 8.5 6 8.5-6" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  scissors: <path d="M6 15.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0-7a2.5 2.5 0 1 0 0 .01M8 12l12-7M8 12l12 7M8.5 10.5l3 1.5" />,
  stack: <path d="M4 7.5h16v3H4ZM4 13.5h16v3H4ZM7 4.5h10" />,
  sunrise: <path d="M12 3v3M4.5 11.5 6 13M19.5 11.5 18 13M3 17h18M7.5 17a4.5 4.5 0 0 1 9 0M9 6.5 12 3.5l3 3" />,
  plane: <path d="M20.5 15.5 13 11V5.5a1 1 0 0 0-2 0V11l-7.5 4.5v2l7.5-2.5v3.5l-2 1.5v1.5l3-1 3 1V20l-2-1.5V15l7.5 2.5Z" />,
  mountain: <path d="M3 19.5 9.2 8.8a1 1 0 0 1 1.7 0l2.6 4.5M8 19.5l5.6-8.3a1 1 0 0 1 1.7 0L21 19.5ZM3 19.5h18M7.6 12.2l1.4 1.3 1.6-1.6" />,
  droplet: <path d="M12 3.5c3.4 4 5.5 7.2 5.5 10a5.5 5.5 0 0 1-11 0c0-2.8 2.1-6 5.5-10ZM9.5 14.5a2.6 2.6 0 0 0 2.5 2.5" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `cb-icon ${className}` : 'cb-icon'}
      data-icon={name}
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
