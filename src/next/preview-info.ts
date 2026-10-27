// Contract of the React app track: captured content is stored locally on this device (IndexedDB), never sent to a backend.
export const previewInfo = {
  name: 'CopyBoard Preview',
  status: 'local-capture',
  writesEnabled: true,
  storage: 'indexeddb-local',
  cloudEnabled: false,
} as const;

export type PreviewInfo = typeof previewInfo;
