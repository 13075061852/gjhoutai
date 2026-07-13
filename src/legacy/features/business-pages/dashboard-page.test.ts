import { describe, expect, it } from 'vitest';
import { createDashboardState } from './dashboard-state';
import { renderDashboard } from './dashboard';

describe('createDashboardState', () => {
  it('reads dashboard datasets without loading the full business runtime', () => {
    const values: Record<string, unknown> = {
      orders: [{ id: 'ORD-01' }],
      inventory: [['原料A']],
      procurements: [{ id: 'PO-01' }],
      suppliers: [{ code: 'SUP-01' }],
      customers: [{ code: 'CUS-01' }],
      logs: [{ orderId: 'ORD-01' }],
    };
    const state = createDashboardState((key) => values[key], {
      orders: 'orders',
      inventoryMaterials: 'inventory',
      procurements: 'procurements',
      suppliers: 'suppliers',
      customers: 'customers',
      orderLogs: 'logs',
    });

    expect(state.orders).toHaveLength(1);
    expect(state.inventoryRows).toHaveLength(1);
    expect(state.procurements).toHaveLength(1);
    expect(state.suppliers).toHaveLength(1);
    expect(state.customers).toHaveLength(1);
    expect(state.orderLogs).toHaveLength(1);
  });

  it('uses shared cards, panels and buttons in dashboard markup', () => {
    const html = renderDashboard({});
    expect(html).toContain('ui-stat-card biz-dashboard-kpi');
    expect(html).toContain('ui-panel biz-dashboard-panel');
    expect(html).toContain('ui-button biz-qk-btn');
  });
});
