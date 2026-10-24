import { describe, expect, it } from 'vitest';
import { legacyMarkup } from './legacyMarkup';

const KEPT_PAGES = [
  'property-analysis',
  'spectrum-analysis',
  'inspection-reports',
  'ai-analysis',
  'office-records',
  'ai-config',
  'theme-settings',
];

const REMOVED_PAGES = [
  'dashboard',
  'permission-management',
  'image-cutout',
  'project-skills',
  'apimart-media',
  'ai-call-analysis',
  'data-recognition',
  'order-management',
  'inventory-management',
  'customer-archive',
  'personnel-archive',
];

describe('legacy sidebar markup', () => {
  it('exposes the kept pages as a flat navigation list', () => {
    KEPT_PAGES.forEach((pageId) => {
      expect(legacyMarkup).toContain(`data-page="${pageId}"`);
    });
    expect(legacyMarkup).toContain('sidebar-section-flat');
  });

  it('no longer renders the removed modules', () => {
    REMOVED_PAGES.forEach((pageId) => {
      expect(legacyMarkup).not.toContain(`data-page="${pageId}"`);
    });
    expect(legacyMarkup).not.toContain('nav-group');
    expect(legacyMarkup).not.toContain('section-label');
  });
});
