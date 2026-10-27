import { usePreview } from '../../app/context';
import { densityPreference, viewPreference } from '../../app/preferences';
import { SegmentedControl } from '../../components/SegmentedControl';

const countLabel = (count: number, total: number) =>
  count === total ? (count === 1 ? '1 Inhalt' : `${count} Inhalte`) : `${count} von ${total} Inhalten`;

/** Board toolbar (DS-C18): grid/list and density are separate preferences from the shared preference state. */
export function ViewControls({ count, total }: { count: number; total: number }) {
  const { state, dispatch } = usePreview();
  return (
    <div className="cb-view-controls">
      <p className="cb-view-controls__count" aria-live="polite">
        {countLabel(count, total)}
      </p>
      <div className="cb-view-controls__group">
        <SegmentedControl
          label={densityPreference.label}
          size="sm"
          options={densityPreference.options}
          value={state.prefs.density}
          onChange={(density) => dispatch({ type: 'setPreference', patch: { density } })}
          className="cb-view-controls__density"
        />
        <SegmentedControl
          label={viewPreference.label}
          size="sm"
          iconOnly
          options={viewPreference.options}
          value={state.prefs.view}
          onChange={(view) => dispatch({ type: 'setPreference', patch: { view } })}
        />
      </div>
    </div>
  );
}
