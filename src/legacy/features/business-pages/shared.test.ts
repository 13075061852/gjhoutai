import { describe, expect, it } from 'vitest';
import { createBusinessPageShared, decorateBusinessUiMarkup } from './shared';

const shared = createBusinessPageShared({
  App: {},
  refs: {},
  utils: { escapeHtml: (value: unknown) => String(value) },
  render: () => undefined,
});

describe('business page shared UI', () => {
  it('renders stat cards with shared layout primitives', () => {
    const html = shared.renderStatStrip([['订单总数', '12 单', '今日 +2']]);
    expect(html).toContain('ui-stat-grid biz-stat-strip');
    expect(html).toContain('ui-stat-card');
  });

  it('renders tables with shared panel and toolbar primitives', () => {
    const html = shared.renderTable('订单', ['编号'], [['ORD-01']]);
    expect(html).toContain('ui-panel business-panel biz-table-panel');
    expect(html).toContain('ui-toolbar business-panel-head');
    expect(html).toContain('ui-table-wrap');
    expect(html).toContain('ui-table');
  });

  it('decorates repeated business button families with shared variants', () => {
    const html = decorateBusinessUiMarkup(`
      <button class="biz-inventory-primary-btn">保存</button>
      <button class="biz-inventory-ghost-btn">取消</button>
      <button class="biz-formula-page-btn">下一页</button>
      <button class="is-danger">删除</button>
      <button class="biz-order-code">ORD-01</button>
    `);
    expect(html).toContain('ui-button ui-button--primary biz-inventory-primary-btn');
    expect(html).toContain('ui-button biz-inventory-ghost-btn');
    expect(html).toContain('ui-button ui-button--sm biz-formula-page-btn');
    expect(html).toContain('ui-button ui-button--danger is-danger');
    expect(html).toContain('class="biz-order-code"');
  });
});
