import { getLegacyApp } from '../core/app-context';

export type LegacyPageFeature =
  | 'officeRecords'
  | 'propertyAnalysis'
  | 'spectrumAnalysis'
  | 'inspectionReports'
  | 'aiAnalysis'
  | 'config'
  | 'themeSettings';

const dedicatedPageFeatures: Record<string, LegacyPageFeature> = {
  'property-analysis': 'propertyAnalysis',
  'spectrum-analysis': 'spectrumAnalysis',
  'office-records': 'officeRecords',
  'inspection-reports': 'inspectionReports',
  'ai-analysis': 'aiAnalysis',
  'ai-config': 'config',
  'theme-settings': 'themeSettings',
};

const featureImports: Record<LegacyPageFeature, () => Promise<unknown>> = {
  officeRecords: () => import('../features/office-records'),
  propertyAnalysis: () => import('../features/property-analysis'),
  spectrumAnalysis: () => import('../features/spectrum-analysis'),
  inspectionReports: () => import('../features/inspection-reports'),
  aiAnalysis: () => import('../features/ai-analysis'),
  config: () => import('../features/config'),
  themeSettings: () => import('../features/theme-settings'),
};

const featurePromises = new Map<LegacyPageFeature, Promise<void>>();
const modulePromises = new Map<LegacyPageFeature, Promise<unknown>>();
const readyFeatures = new Set<LegacyPageFeature>();
let featureGeneration = 0;

export function isLegacyPageFeatureReady(pageId: string): boolean {
  const feature = getLegacyPageFeature(pageId);
  return feature !== null && readyFeatures.has(feature);
}

function loadFeatureModule(feature: LegacyPageFeature): Promise<unknown> {
  const existing = modulePromises.get(feature);
  if (existing) return existing;
  const loading = featureImports[feature]().catch((error) => {
    modulePromises.delete(feature);
    throw error;
  });
  modulePromises.set(feature, loading);
  return loading;
}

/** Download only on navigation intent, never initialise or fetch another page's business data. */
export function preloadLegacyPageFeature(pageId: string): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
  const feature = getLegacyPageFeature(pageId);
  if (!feature || feature === 'officeRecords') return;
  void loadFeatureModule(feature).catch(() => {});
}

export function resetLegacyPageFeatures(): void {
  featureGeneration += 1;
  featurePromises.clear();
  readyFeatures.clear();
}

export function getLegacyPageFeature(pageId: string): LegacyPageFeature | null {
  return dedicatedPageFeatures[pageId] || null;
}

async function initializeFeature(feature: LegacyPageFeature): Promise<void> {
  const App = getLegacyApp();
  switch (feature) {
    case 'officeRecords': await App?.officeRecords?.init?.(); break;
    case 'propertyAnalysis': await App?.propertyAnalysis?.init?.(); break;
    case 'spectrumAnalysis': await App?.spectrumAnalysis?.init?.(); break;
    case 'inspectionReports': await App?.inspectionReports?.init?.(); break;
    case 'aiAnalysis': await App?.aiAnalysis?.init?.(); break;
    case 'config': await App?.config?.init?.(); break;
    case 'themeSettings': await App?.themeSettings?.init?.(); break;
  }
}

export function ensureLegacyPageFeature(pageId: string): Promise<void> {
  const feature = getLegacyPageFeature(pageId);
  if (!feature) return Promise.reject(new Error('页面不在当前项目范围内'));
  const existing = featurePromises.get(feature);
  if (existing) return existing;

  const generation = featureGeneration;
  const loading = loadFeatureModule(feature)
    .then(() => generation === featureGeneration ? initializeFeature(feature) : undefined)
    .then(() => {
      if (generation === featureGeneration) readyFeatures.add(feature);
    })
    .catch((error) => {
      if (generation === featureGeneration) featurePromises.delete(feature);
      throw error;
    });
  featurePromises.set(feature, loading);
  return loading;
}
