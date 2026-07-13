import { describe, expect, it } from 'vitest';
import navigationSource from './shell/navigation.ts?raw';
import businessSource from './features/business-pages/index.ts?raw';
import dataRecognitionSource from './features/data-recognition.ts?raw';
import apimartSource from './features/apimart-media.ts?raw';
import themeSettingsSource from './features/theme-settings.ts?raw';
import assistantStyles from '../styles/pages/config.css?inline';
import propertyAnalysisSource from './features/property-analysis.ts?raw';

describe('navigation lifecycle', () => {
  it('allows navigation to bind again after the shell is remounted', () => {
    const cleanup = navigationSource.match(/const cleanupNavigation = \(\) => \{[\s\S]*?\n  };/)?.[0] || '';
    expect(cleanup).toContain('navigationBound = false');
    expect(cleanup).toContain('pageRenderSeq += 1');
  });

  it('removes assistant action listeners before navigation is rebound', () => {
    const cleanup = navigationSource.match(/const cleanupNavigation = \(\) => \{[\s\S]*?\n  };/)?.[0] || '';
    expect(cleanup).toContain("removeEventListener('click', handleAssistantExpandClick)");
    expect(cleanup).toContain("removeEventListener('click', handleAssistantCloseClick)");
    expect(navigationSource).toContain("addEventListener('click', handleAssistantExpandClick)");
    expect(navigationSource).toContain("addEventListener('click', handleAssistantCloseClick)");
  });

  it('keeps assistant header controls out of fullscreen scale and slide transforms', () => {
    expect(assistantStyles).not.toMatch(/transform:\s*scale\(\.985\)/);
    expect(assistantStyles).not.toMatch(/transform:\s*translateX\(10px\)/);
  });

  it('rebinds business page events to the current DOM container', () => {
    expect(businessSource).toContain('init: initializeBusinessPages');
    expect(businessSource).toContain("target.addEventListener('click', handleBusinessClick)");
    expect(businessSource).toContain("businessEventsTarget?.removeEventListener('click', handleBusinessClick)");
  });

  it('releases feature initialization locks and refreshes local refs', () => {
    expect(dataRecognitionSource).toContain('initialized = false');
    expect(apimartSource).toContain('boundPanel = null');
    expect(apimartSource).toContain('documentEventsBound');
    expect(themeSettingsSource).toContain('refreshRefs();');
  });

  it('finds the property action group independently of the current menu host', () => {
    expect(propertyAnalysisSource).toContain("document.querySelector('[data-page-section=\"property-analysis\"] .analysis-action-group')");
  });
});
