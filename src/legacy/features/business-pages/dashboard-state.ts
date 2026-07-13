export type DashboardStorageKeys = {
  orders: string;
  inventoryMaterials: string;
  procurements: string;
  suppliers: string;
  customers: string;
  orderLogs: string;
};

const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

export function createDashboardState(
  read: (key: string) => unknown,
  keys: DashboardStorageKeys,
) {
  return {
    orders: asArray(read(keys.orders)),
    inventoryRows: asArray(read(keys.inventoryMaterials)),
    procurements: asArray(read(keys.procurements)),
    suppliers: asArray(read(keys.suppliers)),
    customers: asArray(read(keys.customers)),
    orderLogs: asArray(read(keys.orderLogs)),
  };
}
