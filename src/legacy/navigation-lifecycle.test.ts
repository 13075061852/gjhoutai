import { describe, expect, it } from 'vitest';
import navigationSource from './shell/navigation.ts?raw';
import officeSource from './features/office-records/index.ts?raw';
import themeSettingsSource from './features/theme-settings.ts?raw';
import assistantStyles from '../styles/pages/config.css?inline';
import propertyAnalysisSource from './features/property-analysis.ts?raw';

describe('navigation lifecycle', () => {
  it('allows navigation to bind again after the shell is remounted', () => {
    const cleanup = navigationSource.match(/const cleanupNavigation = \(\) => \{[\s\S]*?\n  };/)?.[0] || '';
    expect(cleanup).toContain('navigationBound = false');
    expect(cleanup).toContain('pageRenderSeq += 1');
  });

  it('never binds or restores the removed assistant overlay', () => {
    expect(navigationSource).not.toContain('handleAssistantExpandClick');
    expect(navigationSource).not.toContain('handleAssistantCloseClick');
    expect(navigationSource).not.toContain('askAiToggle');
    expect(navigationSource).not.toContain('ASSISTANT_STATE_KEY');
    expect(navigationSource).not.toContain('App?.chat');
  });

  it('keeps assistant header controls out of fullscreen scale and slide transforms', () => {
    expect(assistantStyles).not.toMatch(/transform:\s*scale\(\.985\)/);
    expect(assistantStyles).not.toMatch(/transform:\s*translateX\(10px\)/);
  });

  it('rebinds business page events to the current DOM container', () => {
    expect(officeSource).toContain('init: initOffice');
    expect(officeSource).toContain("target.addEventListener('click', handleOfficeClick, options)");
    expect(officeSource).toContain('eventController?.abort();');
  });

  it('releases feature initialization locks and refreshes local refs', () => {
    expect(officeSource).toContain('officeSortCleanup = undefined');
    expect(officeSource).not.toContain('refreshAuthUsers');
    expect(themeSettingsSource).toContain('refreshRefs();');
  });

  it('finds the property action group independently of the current menu host', () => {
    expect(propertyAnalysisSource).toContain("document.querySelector('[data-page-section=\"property-analysis\"] .analysis-action-group')");
  });
});
