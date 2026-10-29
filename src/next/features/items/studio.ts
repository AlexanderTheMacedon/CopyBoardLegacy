import type { IconName } from '../../components/Icon';

/**
 * Studio identities (Run D.1): every editor is one member of the app family with its own name, glyph and curated colour.
 * The colour lives in CSS (`data-studio` → `--st`, studio-identity.css), so cards, menus, the inspector, "Neu erstellen"
 * and the canvas read the same identity without a second source of truth.
 */
export type StudioId = 'document' | 'text' | 'markdown' | 'code' | 'image';

export interface Studio {
  readonly name: string;
  readonly icon: IconName;
}

export const studios: Record<StudioId, Studio> = {
  document: { name: 'Schreibstudio', icon: 'nib' },
  text: { name: 'Klartext', icon: 'text' },
  markdown: { name: 'Markdown Studio', icon: 'markdown' },
  code: { name: 'CodeCenter', icon: 'braces' },
  image: { name: 'Image Studio', icon: 'aperture' },
};
