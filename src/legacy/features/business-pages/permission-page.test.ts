import { describe, expect, it } from 'vitest';
import { renderPermissionPage } from './permission-page';

describe('renderPermissionPage', () => {
  it('renders a department permission matrix from a state snapshot', () => {
    const html = renderPermissionPage({
      esc: String,
      pages: [{ id: 'order-management', title: '订单管理', eyebrow: '业务模块' }],
      departments: ['销售部'],
      activeDepartment: '销售部',
      activePermissionKey: 'department:销售部',
      getMemberCount: () => 2,
      canView: () => true,
      canEdit: () => false,
      apiPermissionCount: 1,
    });

    expect(html).toContain('销售部');
    expect(html).toContain('订单管理');
    expect(html).toContain('可见');
    expect(html).toContain('只读');
    expect(html).toContain('ui-panel business-panel biz-permission-matrix');
  });
});
