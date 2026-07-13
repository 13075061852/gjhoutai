import { describe, expect, it } from 'vitest';
import globalStyles from './styles.css?raw';
import chatSource from '../legacy/features/chat.ts?raw';
import imageCutoutSource from '../legacy/features/image-cutout.ts?raw';
import businessPagesSource from '../legacy/features/business-pages/index.ts?raw';
import propertyAnalysisSource from '../legacy/features/property-analysis.ts?raw';
import spectrumAnalysisSource from '../legacy/features/spectrum-analysis.ts?raw';
import dataRecognitionSource from '../legacy/features/data-recognition.ts?raw';
import inspectionReportsSource from '../legacy/features/inspection-reports.ts?raw';
import themeSettingsSource from '../legacy/features/theme-settings.ts?raw';
import projectSkillsSource from '../legacy/features/project-skills.ts?raw';
import apimartMediaSource from '../legacy/features/apimart-media.ts?raw';
import aiCallAnalysisSource from '../legacy/features/ai-call-analysis.ts?raw';
import legacyBootstrapSource from '../legacy/bootstrap.ts?raw';
import dashboardPageSource from '../legacy/features/business-pages/dashboard-page.ts?raw';
import mainSource from '../main.tsx?raw';

describe('page style loading', () => {
  it('keeps only application-shell styles in the global entry', () => {
    const deferredStyles = [
      'dashboard-chat.css',
      'image-cutout.css',
      'business-pages.css',
      'property-analysis.css',
      'spectrum-analysis.css',
      'data-recognition.css',
      'inspection-reports.css',
      'config.css',
      'theme-settings.css',
      'project-skills.css',
      'apimart-media.css',
      'ai-call-analysis.css',
      'theme-overrides.css',
    ];
    deferredStyles.forEach((stylesheet) => expect(globalStyles).not.toContain(stylesheet));
  });

  it('loads each deferred stylesheet from its feature module', () => {
    const mappings: Array<[string, string]> = [
      [chatSource, 'dashboard-chat.css'],
      [imageCutoutSource, 'image-cutout.css'],
      [businessPagesSource, 'business-pages.css'],
      [propertyAnalysisSource, 'property-analysis.css'],
      [spectrumAnalysisSource, 'spectrum-analysis.css'],
      [dataRecognitionSource, 'data-recognition.css'],
      [inspectionReportsSource, 'inspection-reports.css'],
      [themeSettingsSource, 'theme-settings.css'],
      [projectSkillsSource, 'project-skills.css'],
      [apimartMediaSource, 'apimart-media.css'],
      [aiCallAnalysisSource, 'ai-call-analysis.css'],
      [dashboardPageSource, 'dashboard.css'],
    ];
    mappings.forEach(([source, stylesheet]) => expect(source).toContain(stylesheet));
  });

  it('loads responsive shell styles synchronously and defers theme overrides', () => {
    expect(mainSource).toContain("import './styles/layout/responsive.css'");
    expect(legacyBootstrapSource).toContain('theme-overrides.css');
    expect(legacyBootstrapSource).not.toContain('responsive.css');
  });

  it('loads the resident assistant layout before deferred chat initialization', () => {
    expect(legacyBootstrapSource).toContain('config.css');
  });

});
