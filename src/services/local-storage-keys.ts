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
  officeRecords: defineKey('gjh-office-records-v1', 'clear-local'),
  ashRecords: defineKey('gjh-ash-records-v1', 'clear-local'),
  aiCallLog: defineKey('openrouter-ai-call-log-v1', 'keep-local'),
  propertyReportRanges: defineKey('gjh-property-report-ranges-v1', 'keep-local'),
  propertyReportSealPosition: defineKey('gjh-property-report-seal-position-v1', 'keep-local'),
  spectrumFilterState: defineKey('gjh-spectrum-filter-state-v1', 'keep-local'),
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
