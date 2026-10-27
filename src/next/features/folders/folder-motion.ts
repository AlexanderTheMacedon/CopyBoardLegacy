/** Screen position a folder was opened from; the folder window grows out of it (Folder-Open-Motion). Session-only. */
let origin: { x: number; y: number } | null = null;

export const rememberFolderOrigin = (element: Element | null) => {
  if (!element) {
    origin = null;
    return;
  }
  const rect = element.getBoundingClientRect();
  origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

export const takeFolderOrigin = () => {
  const value = origin;
  origin = null;
  return value;
};
