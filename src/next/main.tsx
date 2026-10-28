import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import type { WorkspaceSeed } from './app/workspace';
import { openLocalStore } from './data/store';
import { fixtureLibrary } from './fixtures';
import { previewInfo } from './preview-info';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/board.css';
import './styles/panels.css';
import './styles/workspace.css';
import './styles/studio.css';
import './styles/editor-workspace.css';

const root = document.getElementById('preview-root');
if (!root) throw new Error('#preview-root is missing');

root.dataset.previewStatus = previewInfo.status;

/** Loads the local store before the first render, so stored items and preferences never flash in after the fixtures. */
async function loadSeed(): Promise<WorkspaceSeed> {
  try {
    const store = await openLocalStore();
    return { store, snapshot: await store.load() };
  } catch {
    // Blocked or unavailable storage: the app still runs, captures report that nothing can be saved.
    return { store: null };
  }
}

void loadSeed().then((seed) => {
  root.dataset.storage = seed.store ? 'local' : 'unavailable';
  createRoot(root).render(
    <StrictMode>
      <App library={fixtureLibrary} seed={seed} />
    </StrictMode>,
  );
});
