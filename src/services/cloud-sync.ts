import { cloudStorage } from './cloud-storage';

const CLOUD_LOCAL_STORAGE_KEYS = [
  'sidebar-collapsed',
  'assistant-collapsed',
  'openrouter-ai-chat-v1',
  'openrouter-ai-chat-sessions-v1',
  'openrouter-ai-chat-active-session-v1',
  'openrouter-ai-chat-data-attachment-v1',
  'openrouter-ai-chat-search-enabled-v1',
  'openrouter-ai-call-log-v1',
  'gjh-property-report-ranges-v1',
  'gjh-property-report-seal-position-v1',
  'gjh-role-page-permissions-v1',
  'gjh-spectrum-filter-state-v1',
  'gjh-spectrum-preview-ai-results-v1',
] as const;

const CLOUD_LOCAL_STORAGE_KEY_SET = new Set<string>(CLOUD_LOCAL_STORAGE_KEYS);
const SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS = new Set<string>([
  'gjh-role-page-permissions-v1',
]);
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
let syncInstalled = false;

export async function hydrateCloudBackedLocalStorage(): Promise<void> {
  await Promise.all(CLOUD_LOCAL_STORAGE_KEYS.map(async (key) => {
    const remoteValue = await cloudStorage.getJson<string>(key);
    if (typeof remoteValue === 'string') {
      originalSetItem.call(localStorage, key, remoteValue);
      return;
    }
    if (SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS.has(key)) {
      const localValue = localStorage.getItem(key);
      if (typeof localValue === 'string') {
        void cloudStorage.putJson(key, localValue);
      }
    }
  }));
}

export function installCloudBackedLocalStorageSync(): void {
  if (syncInstalled) return;
  syncInstalled = true;

  Storage.prototype.setItem = function setItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && CLOUD_LOCAL_STORAGE_KEY_SET.has(key)) {
      void cloudStorage.putJson(key, value);
    }
  };

  Storage.prototype.removeItem = function removeItem(key: string) {
    originalRemoveItem.call(this, key);
    if (this === localStorage && CLOUD_LOCAL_STORAGE_KEY_SET.has(key)) {
      void cloudStorage.putJson(key, null);
    }
  };
}
