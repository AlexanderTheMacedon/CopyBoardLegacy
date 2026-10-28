import { startCompletion } from '@codemirror/autocomplete';
import type { CodeHandle } from './CodeEditor';
import { codeLanguages, resolveLanguage } from './codemirror';
import type { EditorPrefs } from './editor-types';
import { ToolButton, ToolGroup, ToolSeparator } from './Toolbar';

interface CodeToolbarProps {
  readonly language: string;
  readonly readOnly: boolean;
  readonly prefs: EditorPrefs;
  readonly handle: CodeHandle | null;
  readonly onLanguage: (language: string) => void;
  readonly onPrefs: (patch: Partial<EditorPrefs>) => void;
}

/** Code settings: language of the snippet (stored with the item), tab width, wrapping, line numbers (per viewer). */
export function CodeToolbar({ language, readOnly, prefs, handle, onLanguage, onPrefs }: CodeToolbarProps) {
  const known = resolveLanguage(language);
  return (
    <div className="cb-canvas-bar__set" role="toolbar" aria-label="Code-Einstellungen">
      <label className="cb-select">
        <span className="cb-visually-hidden">Sprache</span>
        <select value={known?.id ?? '__custom'} disabled={readOnly} onChange={(event) => onLanguage(event.target.value === '__custom' ? language : event.target.value)}>
          {!known && <option value="__custom">{language || 'Text'}</option>}
          {codeLanguages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <ToolSeparator />
      <label className="cb-select cb-select--narrow">
        <span className="cb-visually-hidden">Tabbreite</span>
        <select value={prefs.tabSize} onChange={(event) => onPrefs({ tabSize: Number(event.target.value) as EditorPrefs['tabSize'] })}>
          <option value={2}>Tab: 2</option>
          <option value={4}>Tab: 4</option>
          <option value={8}>Tab: 8</option>
        </select>
      </label>
      <ToolGroup label="Anzeige">
        <ToolButton icon="wrap" label="Zeilenumbruch" pressed={prefs.wrap} onClick={() => onPrefs({ wrap: !prefs.wrap })} />
        <ToolButton icon="hash" label="Zeilennummern" pressed={prefs.lineNumbers} onClick={() => onPrefs({ lineNumbers: !prefs.lineNumbers })} />
      </ToolGroup>
      <ToolSeparator />
      {/* local suggestions (keywords, snippets, names in this file); also ⌃Leertaste or ⌘I while typing */}
      <ToolButton
        icon="sparkles"
        label="Vorschläge anzeigen"
        shortcut="⌘I"
        text="Vorschläge"
        disabled={readOnly || !handle}
        onClick={() => {
          if (!handle) return;
          handle.view.focus();
          startCompletion(handle.view);
        }}
      />
    </div>
  );
}
