/** Server-enforced scope for the seven current pages; no legacy ERP storage keys. */
export const BUSINESS_STATE_KEYS = new Set([
  'gjh-office-records-v1', 'gjh-ash-records-v1', 'gjh-property-report-ranges-v1',
  'gjh-spectrum-user-images-v2', 'gjh-spectrum-edits-v2',
]);
export const USER_STATE_KEYS = new Set([
  'sidebar-collapsed', 'sidebar-active-page', 'sidebar-recent-pages',
  'gjh-property-report-seal-position-v1', 'gjh-spectrum-filter-state-v1',
  'gjh-spectrum-preview-ai-results-v1', 'openrouter-ai-call-log-v1',
]);
export const isCurrentStateKey = (key: string) => BUSINESS_STATE_KEYS.has(key) || USER_STATE_KEYS.has(key);
export const canEditBusinessData = (user: { department: string }) => ['系统管理员','测试部'].includes(user.department);
export const canWriteCurrentState = (user: { department: string }, key: string) =>
  BUSINESS_STATE_KEYS.has(key) ? canEditBusinessData(user) : USER_STATE_KEYS.has(key);
export const currentStateStorageKey = (user: { id: string }, key: string) => USER_STATE_KEYS.has(key) ? `users/${user.id}/${key}` : key;
