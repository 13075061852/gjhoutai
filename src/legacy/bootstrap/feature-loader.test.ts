import { describe, expect, it } from 'vitest';
import { getLegacyPageFeature, ensureLegacyPageFeature, isLegacyPageFeatureReady } from './feature-loader';
describe('seven-page lazy feature boundary', () => {
  it('maps only the seven current pages', () => {
    expect(['property-analysis','spectrum-analysis','inspection-reports','ai-analysis','office-records','ai-config','theme-settings'].map(getLegacyPageFeature)).toEqual(['propertyAnalysis','spectrumAnalysis','inspectionReports','aiAnalysis','officeRecords','config','themeSettings']);
  });
  it('never routes retired pages into a generic ERP runtime', async () => {
    for (const page of ['dashboard','inventory-management','order-management','permission-management','personnel-archive','data-recognition','project-skills','apimart-media','image-cutout','ai-call-analysis','unknown']) {
      expect(getLegacyPageFeature(page)).toBeNull();
      expect(isLegacyPageFeatureReady(page)).toBe(false);
      await expect(ensureLegacyPageFeature(page)).rejects.toThrow('页面不在当前项目范围内');
    }
  });
});
