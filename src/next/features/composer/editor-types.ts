/** What the shared Canvas shell can ask of whichever editor is mounted. Each editor keeps its own native history. */
export interface EditorHandle {
  undo(): void;
  redo(): void;
  focus(): void;
  /** Opens the editor's own find (and replace) UI; absent where the editor has none. */
  find?(): void;
  /** Whole content as plain text, for "copy everything". */
  getText(): string;
  /** A text file the user can save: name without path, MIME type, content. Absent for binary editors. */
  exportFile?(): { readonly name: string; readonly mime: string; readonly data: string };
  /** A binary file the user can save (the image studio's rendition), in the requested type where supported. */
  exportBinary?(type?: string): Promise<{ readonly name: string; readonly mime: string; readonly blob: Blob; readonly note?: string }>;
  /** Puts the editor's result on the clipboard itself (binary editors); text editors are copied via `getText()`. */
  copy?(): Promise<void>;
}

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** Per-viewer editor preferences (never part of an item). */
export interface EditorPrefs {
  readonly wrap: boolean;
  readonly tabSize: 2 | 4 | 8;
  readonly fontSize: 13 | 14 | 16;
  readonly width: 'narrow' | 'normal' | 'wide';
  readonly lineNumbers: boolean;
  readonly focus: boolean;
  /** Display zoom of the document page in percent: a view setting, never part of the document's formatting. */
  readonly zoom: number;
}

/** Zoom steps of the document page (status bar). */
export const DOC_ZOOM_STEPS: readonly number[] = [75, 90, 100, 110, 125, 150, 175, 200];

export const defaultEditorPrefs: EditorPrefs = { wrap: true, tabSize: 2, fontSize: 14, width: 'normal', lineNumbers: true, focus: false, zoom: 100 };

/** Validates stored preferences (kept in the app's own IndexedDB meta; the app uses no other browser storage). */
export function normalizeEditorPrefs(raw: unknown): EditorPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EditorPrefs>;
  return {
    wrap: typeof r.wrap === 'boolean' ? r.wrap : defaultEditorPrefs.wrap,
    tabSize: r.tabSize === 4 || r.tabSize === 8 ? r.tabSize : 2,
    fontSize: r.fontSize === 13 || r.fontSize === 16 ? r.fontSize : 14,
    width: r.width === 'narrow' || r.width === 'wide' ? r.width : 'normal',
    lineNumbers: typeof r.lineNumbers === 'boolean' ? r.lineNumbers : true,
    focus: false,
    zoom: typeof r.zoom === 'number' && DOC_ZOOM_STEPS.includes(r.zoom) ? r.zoom : 100,
  };
}

/** Triggers a browser download of generated content; nothing leaves the device. */
export function downloadText(name: string, mime: string, data: string): void {
  downloadBlob(name, new Blob([data], { type: `${mime};charset=utf-8` }));
}

/** Saves a blob through a temporary object URL. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (title: string, ext: string): string => `${title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'Unbenannt'}.${ext}`;
