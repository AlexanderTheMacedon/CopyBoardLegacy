import { IconButton } from '../../components/IconButton';
import { AppGrid, useCreateTarget } from './AppGrid';

/**
 * "Neu erstellen" sheet: one central entry for new content (dock, board and folder context menu, folder window, mobile
 * dock), showing the same app grid as the capture dock's launcher. Editable items are created in the current space or
 * open folder, saved, and opened in their editor; voice recording and file import hand over to the existing recorder and
 * capture flows. Nothing is shown as created before it is stored.
 */
export function CreateForm({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const target = useCreateTarget();
  return (
    <div className="cb-card-dialog cb-create">
      <header className="cb-card-dialog__header">
        <div>
          <p className="cb-card-dialog__eyebrow">{target ? `In „${target}“` : 'Neu'}</p>
          <h2 id={titleId}>Neu erstellen</h2>
        </div>
        <IconButton icon="x" label="Schließen" onClick={onClose} />
      </header>
      <div className="cb-card-dialog__body cb-scroll">
        <AppGrid host="sheet" labelledBy={titleId} onClose={onClose} />
      </div>
    </div>
  );
}
