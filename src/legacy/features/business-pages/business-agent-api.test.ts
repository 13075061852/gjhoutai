import { describe, expect, it } from 'vitest';
import { createBusinessAgentApi } from './business-agent-api';

const createContext = () => ({
  App: { constants: { PAGE_DEFS: { 'order-management': { title: '订单管理' } } } },
  authUsers: [],
  archiveStates: { customer: { rows: [] }, personnel: { rows: [] } },
  orderRows: [{ id: 'ORD-01', customer: '客户A', formula: '配方A', quantity: 10, status: '待处理', deliveryDate: '2026-07-13' }],
  inventoryRows: [],
  procurementRows: [],
  supplierRows: [],
  formulaRecipes: [],
  officeRecords: [],
  ashRecords: [],
  getUserDepartment: () => '',
  getPermissionDepartments: () => [],
  getPermissionPages: () => [],
  getPermissionDepartmentMemberCount: () => 0,
  getFormulaSummary: () => ({}),
  getProductionOrders: () => [],
  getInventoryCategories: () => [],
  getOfficeRecordLabel: () => '',
  getTodayCode: () => '2026-07-13',
});

describe('business agent API', () => {
  it('answers order count questions from current business state', () => {
    const api = createBusinessAgentApi(createContext());
    expect(api.answerQuestion('当前有多少订单')).toContain('系统当前共有 1 个订单');
  });

  it('keeps structured order queries synchronous after extraction', () => {
    const api = createBusinessAgentApi(createContext());
    const result = api.queryAgentData({ pageId: 'order-management', intent: 'count' });
    expect(result.ok).toBe(true);
    expect(result.rowCount).toBe(1);
  });
});
