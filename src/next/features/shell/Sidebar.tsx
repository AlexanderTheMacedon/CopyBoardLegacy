import { useRef } from 'react';
import { usePreview } from '../../app/context';
import { BrandMark } from '../../components/BrandMark';
import { Icon } from '../../components/Icon';
import { useScrollFade } from '../../components/motion';
import { SpaceNav } from '../spaces/SpaceNav';
import { SidebarModeQuickPreference } from './QuickPreferences';

/**
 * Floating pill sidebar (D-002, DS-C02, Glass WOW v2). Two glass pills float in a column beside the canvas: the main pill
 * (brand, spaces, quick access) and the utility pill (settings, sidebar mode). Modes via `data-sidebar` on the app root:
 * compact = pills stay narrow, expanded = pinned and labelled, dynamic = the pills widen as an overlay on hover or keyboard
 * focus without moving the workspace (M-01). The whole column is the hover target, so crossing the gap between the pills
 * never collapses them. Hidden on phones, where the drawer and dock take over (D-030).
 */
export function Sidebar() {
  const { dispatch } = usePreview();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollFade(scrollRef);
  return (
    <aside className="cb-sidebar" aria-label="Seitenleiste">
      <div className="cb-sidebar__panel">
        <div className="cb-sidebar__pill">
          <div className="cb-sidebar__brand">
            <BrandMark />
            <span className="cb-nav__label cb-sidebar__brand-name">
              CopyBoard <span className="cb-sidebar__badge">Preview</span>
            </span>
          </div>
          <div ref={scrollRef} className="cb-sidebar__scroll cb-scroll">
            <SpaceNav idPrefix="cb-sidebar" />
          </div>
        </div>
        <div className="cb-sidebar__footer">
          <button type="button" className="cb-nav__item" title="Einstellungen" onClick={() => dispatch({ type: 'openSettings' })}>
            <span className="cb-nav__icon" aria-hidden="true">
              <Icon name="sliders" />
            </span>
            <span className="cb-nav__label">Einstellungen</span>
          </button>
          <SidebarModeQuickPreference />
        </div>
      </div>
    </aside>
  );
}
