type CloudEmptyRemotePolicy = 'keep-local' | 'clear-local' | 'seed-remote';

type LocalStorageKeyDefinition = {
  value: string;
  cloudEmptyRemotePolicy?: CloudEmptyRemotePolicy;
};

const defineKey = (
  value: string,
  cloudEmptyRemotePolicy?: CloudEmptyRemotePolicy,
): LocalStorageKeyDefinition => ({
  value,
  cloudEmptyRemotePolicy,
});

export const LOCAL_STORAGE_KEY_DEFINITIONS = {
  sidebarCollapsed: defineKey('sidebar-collapsed', 'keep-local'),
  assistantCollapsed: defineKey('assistant-collapsed', 'keep-local'),
  orders: defineKey('gjh-orders-v1', 'clear-local'),
  orderLogs: defineKey('gjh-order-logs-v1', 'clear-local'),
  inventoryMaterials: defineKey('gjh-inventory-materials-v1', 'clear-local'),
  inventoryCategories: defineKey('gjh-inventory-categories-v1', 'clear-local'),
  formulaRecipes: defineKey('gjh-formula-recipes-v1', 'clear-local'),
  officeRecords: defineKey('gjh-office-records-v1', 'clear-local'),
  ashRecords: defineKey('gjh-ash-records-v1', 'clear-local'),
  procurements: defineKey('gjh-procurements-v1', 'clear-local'),
  suppliers: defineKey('gjh-suppliers-v1', 'clear-local'),
  customers: defineKey('gjh-customers-v1', 'clear-local'),
  chat: defineKey('openrouter-ai-chat-v1', 'keep-local'),
  chatSessions: defineKey('openrouter-ai-chat-sessions-v1', 'keep-local'),
  chatActiveSession: defineKey('openrouter-ai-chat-active-session-v1', 'keep-local'),
  chatDataAttachment: defineKey('openrouter-ai-chat-data-attachment-v1', 'keep-local'),
  chatSearchEnabled: defineKey('openrouter-ai-chat-search-enabled-v1', 'keep-local'),
  aiCallLog: defineKey('openrouter-ai-call-log-v1', 'keep-local'),
  propertyReportRanges: defineKey('gjh-property-report-ranges-v1', 'keep-local'),
  propertyReportSealPosition: defineKey('gjh-property-report-seal-position-v1', 'keep-local'),
  rolePagePermissions: defineKey('gjh-role-page-permissions-v1', 'seed-remote'),
  spectrumFilterState: defineKey('gjh-spectrum-filter-state-v1', 'keep-local'),
  spectrumPreviewAiResults: defineKey('gjh-spectrum-preview-ai-results-v1', 'keep-local'),
  apimartMediaTasks: defineKey('apimart-media-tasks-v1', 'keep-local'),
} as const satisfies Record<string, LocalStorageKeyDefinition>;

type LocalStorageKeyName = keyof typeof LOCAL_STORAGE_KEY_DEFINITIONS;

const getLocalStorageValue = (name: LocalStorageKeyName) => LOCAL_STORAGE_KEY_DEFINITIONS[name].value;

export const LOCAL_STORAGE_KEYS = Object.fromEntries(
  (Object.keys(LOCAL_STORAGE_KEY_DEFINITIONS) as LocalStorageKeyName[])
    .map((name) => [name, getLocalStorageValue(name)]),
) as { readonly [Name in LocalStorageKeyName]: (typeof LOCAL_STORAGE_KEY_DEFINITIONS)[Name]['value'] };

const getCloudSyncedLocalStorageKeys = (policy?: CloudEmptyRemotePolicy) => (
  Object.values(LOCAL_STORAGE_KEY_DEFINITIONS)
    .filter((definition) => (
      definition.cloudEmptyRemotePolicy
      && (!policy || definition.cloudEmptyRemotePolicy === policy)
    ))
    .map((definition) => definition.value)
);

export const CLOUD_LOCAL_STORAGE_KEYS = getCloudSyncedLocalStorageKeys();
export const CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS = getCloudSyncedLocalStorageKeys('clear-local');
export const SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS = getCloudSyncedLocalStorageKeys('seed-remote');
