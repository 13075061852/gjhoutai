import { describe, expect, it } from 'vitest';
import businessSource from '../legacy/features/business-pages/index.ts?raw';
import globalResponsiveStyles from './layout/responsive.css?raw';

describe('order management layout contract', () => {
  it('uses shared toolbar, field, button, pagination and dialog primitives', () => {
    expect(businessSource).toContain('ui-toolbar biz-formula-table-head biz-order-table-head');
    expect(businessSource).toContain('ui-toolbar__actions biz-formula-table-actions biz-order-table-actions');
    expect(businessSource).toContain('class="ui-field" data-order-status-filter');
    expect(businessSource).toContain('class="ui-button ui-button--primary biz-formula-new-btn"');
    expect(businessSource).toContain('ui-pagination biz-formula-pagination biz-order-pagination');
    expect(businessSource).toContain('ui-dialog-overlay biz-order-modal dialog-overlay');
    expect(businessSource).toContain('ui-dialog-card ui-dialog-card--md biz-inventory-material-dialog biz-order-dialog dialog-card');
  });

  it('keeps order responsive rules in the order page stylesheet', () => {
    expect(globalResponsiveStyles).not.toMatch(/\.biz-order-/);
  });
});
