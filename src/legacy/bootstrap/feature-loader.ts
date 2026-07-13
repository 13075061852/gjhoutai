import { getLegacyApp } from '../core/app-context';

export type LegacyPageFeature =
  | 'dashboard'
  | 'businessPages'
  | 'propertyAnalysis'
  | 'spectrumAnalysis'
  | 'dataRecognition'
  | 'inspectionReports'
  | 'imageCutout'
  | 'config'
  | 'themeSettings'
  | 'projectSkills'
  | 'apimartMedia'
  | 'aiCallAnalysis';

const dedicatedPageFeatures: Record<string, LegacyPageFeature> = {
  dashboard: 'dashboard',
  'property-analysis': 'propertyAnalysis',
  'spectrum-analysis': 'spectrumAnalysis',
  'data-recognition': 'dataRecognition',
  'inspection-reports': 'inspectionReports',
  'image-cutout': 'imageCutout',
  'ai-config': 'config',
  'theme-settings': 'themeSettings',
  'project-skills': 'projectSkills',
  'apimart-media': 'apimartMedia',
  'ai-call-analysis': 'aiCallAnalysis',
};

const featureImports: Record<LegacyPageFeature, () => Promise<unknown>> = {
  dashboard: () => import('../features/business-pages/dashboard-page'),
  businessPages: async () => {
    const dashboardApi = getLegacyApp()?.businessPages as (LegacyLifecycleModule & { dashboardOnly?: boolean }) | undefined;
    if (dashboardApi?.dashboardOnly) dashboardApi.cleanup?.();
    await import('../features/business-pages');
  },
  propertyAnalysis: () => import('../features/property-analysis'),
  spectrumAnalysis: () => import('../features/spectrum-analysis'),
  dataRecognition: () => import('../features/data-recognition'),
  inspectionReports: () => import('../features/inspection-reports'),
  imageCutout: () => import('../features/image-cutout'),
  config: () => import('../features/config'),
  themeSettings: () => import('../features/theme-settings'),
  projectSkills: () => import('../features/project-skills'),
  apimartMedia: () => import('../features/apimart-media'),
  aiCallAnalysis: () => import('../features/ai-call-analysis'),
};

const featurePromises = new Map<LegacyPageFeature, Promise<void>>();

export function resetLegacyPageFeatures(): void {
  featurePromises.clear();
}

export function getLegacyPageFeature(pageId: string): LegacyPageFeature {
  return dedicatedPageFeatures[pageId] || 'businessPages';
}

async function initializeFeature(feature: LegacyPageFeature): Promise<void> {
  const App = getLegacyApp();
  switch (feature) {
    case 'dashboard': break;
    case 'propertyAnalysis': await App?.propertyAnalysis?.init?.(); break;
    case 'spectrumAnalysis': await App?.spectrumAnalysis?.init?.(); break;
    case 'dataRecognition': await App?.dataRecognition?.init?.(); break;
    case 'inspectionReports': await App?.inspectionReports?.init?.(); break;
    case 'imageCutout': await App?.imageCutout?.init?.(); break;
    case 'config': await App?.config?.init?.(); break;
    case 'themeSettings': await App?.themeSettings?.init?.(); break;
    case 'projectSkills': await App?.projectSkills?.init?.(); break;
    case 'apimartMedia': await App?.apimartMedia?.init?.(); break;
    case 'aiCallAnalysis': await App?.aiCallAnalysis?.init?.(); break;
    case 'businessPages': await App?.businessPages?.init?.(); break;
  }
}

export function ensureLegacyPageFeature(pageId: string): Promise<void> {
  const feature = getLegacyPageFeature(pageId);
  const existing = featurePromises.get(feature);
  if (existing) return existing;

  const loading = featureImports[feature]()
    .then(() => initializeFeature(feature))
    .catch((error) => {
      featurePromises.delete(feature);
      throw error;
    });
  featurePromises.set(feature, loading);
  return loading;
}
