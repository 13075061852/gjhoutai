import { describe, expect, it } from 'vitest';
import { getLegacyPageFeature } from './feature-loader';

describe('getLegacyPageFeature', () => {
  it('maps dedicated pages to their lazy feature modules', () => {
    expect(getLegacyPageFeature('property-analysis')).toBe('propertyAnalysis');
    expect(getLegacyPageFeature('spectrum-analysis')).toBe('spectrumAnalysis');
    expect(getLegacyPageFeature('data-recognition')).toBe('dataRecognition');
    expect(getLegacyPageFeature('inspection-reports')).toBe('inspectionReports');
    expect(getLegacyPageFeature('image-cutout')).toBe('imageCutout');
    expect(getLegacyPageFeature('ai-config')).toBe('config');
    expect(getLegacyPageFeature('theme-settings')).toBe('themeSettings');
    expect(getLegacyPageFeature('project-skills')).toBe('projectSkills');
    expect(getLegacyPageFeature('apimart-media')).toBe('apimartMedia');
    expect(getLegacyPageFeature('ai-call-analysis')).toBe('aiCallAnalysis');
  });

  it('keeps the default dashboard separate from the full business module', () => {
    expect(getLegacyPageFeature('dashboard')).toBe('dashboard');
  });

  it('routes detailed business pages through the shared business module', () => {
    expect(getLegacyPageFeature('order-management')).toBe('businessPages');
    expect(getLegacyPageFeature('inventory-management')).toBe('businessPages');
  });
});
