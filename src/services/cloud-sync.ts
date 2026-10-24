import { cloudStorage } from './cloud-storage';
import {
  CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS,
  CLOUD_LOCAL_STORAGE_KEYS,
  SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS,
} from './local-storage-keys';

const CLOUD_LOCAL_STORAGE_KEY_SET = new Set<string>(CLOUD_LOCAL_STORAGE_KEYS);
const SEED_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET = new Set<string>(SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS);
const CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET = new Set<string>(CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS);

type CloudSyncOperation = 'put' | 'delete' | 'seed';
type CloudHydrationResult = {
  changedKeys: string[];
};

const reportCloudSyncFailure = (operation: CloudSyncOperation, key: string): void => {
  console.warn(`Failed to ${operation} cloud-backed localStorage key "${key}".`);
  window.dispatchEvent(new CustomEvent('gjh:cloud-sync-error', {
    detail: { operation, key },
  }));
};

export function isCloudBackedLocalStorageKey(key: string): boolean {
  return CLOUD_LOCAL_STORAGE_KEY_SET.has(key);
}

export function setCloudBackedLocalStorageItem(key: string, value: string): void {
  localStorage.setItem(key, value);
  if (isCloudBackedLocalStorageKey(key)) {
    void cloudStorage.putJson(key, value).then((saved) => {
      if (!saved) reportCloudSyncFailure('put', key);
    });
  }
}

export function removeCloudBackedLocalStorageItem(key: string): void {
  localStorage.removeItem(key);
  if (isCloudBackedLocalStorageKey(key)) {
    void cloudStorage.deleteJson(key).then((deleted) => {
      if (!deleted) reportCloudSyncFailure('delete', key);
    });
  }
}

export async function hydrateCloudBackedLocalStorage(signal?: AbortSignal): Promise<CloudHydrationResult> {
  const changedKeys = new Set<string>();
  if (signal?.aborted) return { changedKeys: [] };
  let values: Record<string, unknown>;
  try {
    values = await cloudStorage.getJsonBatch(CLOUD_LOCAL_STORAGE_KEYS, signal);
  } catch (error) {
    if (!signal?.aborted) console.error('Failed to hydrate cloud-backed localStorage.', error);
    // A failed read is not an empty remote record: never clear or seed on network errors.
    return { changedKeys: [] };
  }
  const hydrateKey = (key: string): void => {
    const remoteValue = values[key];
    if (signal?.aborted) return;
    if (remoteValue != null) {
      const nextValue = typeof remoteValue === 'string' ? remoteValue : JSON.stringify(remoteValue);
      if (localStorage.getItem(key) !== nextValue) changedKeys.add(key);
      localStorage.setItem(key, nextValue);
      return;
    }
    if (CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET.has(key)) {
      if (localStorage.getItem(key) != null) changedKeys.add(key);
      localStorage.removeItem(key);
      return;
    }
    if (SEED_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET.has(key)) {
      const localValue = localStorage.getItem(key);
      if (typeof localValue === 'string') {
        void cloudStorage.putJson(key, localValue).then((saved) => {
          if (!saved) reportCloudSyncFailure('seed', key);
        });
      }
    }
  };
  CLOUD_LOCAL_STORAGE_KEYS.forEach(hydrateKey);
  return { changedKeys: [...changedKeys] };
}
