import { cloudStorage } from './cloud-storage';
import {
  CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS,
  CLOUD_LOCAL_STORAGE_KEYS,
  SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS,
} from './local-storage-keys';

const CLOUD_LOCAL_STORAGE_KEY_SET = new Set<string>(CLOUD_LOCAL_STORAGE_KEYS);
const SEED_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET = new Set<string>(SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS);
const CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET = new Set<string>(CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS);
const HYDRATION_CONCURRENCY = 6;

type CloudSyncOperation = 'put' | 'delete' | 'seed';

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

export async function hydrateCloudBackedLocalStorage(): Promise<void> {
  let nextKeyIndex = 0;
  const hydrateKey = async (key: string): Promise<void> => {
    let remoteValue: string | null = null;
    try {
      remoteValue = await cloudStorage.getJson<string>(key);
    } catch (error) {
      console.error(`Failed to hydrate cloud-backed localStorage key "${key}".`, error);
    }
    if (remoteValue != null) {
      localStorage.setItem(key, typeof remoteValue === 'string' ? remoteValue : JSON.stringify(remoteValue));
      return;
    }
    if (CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET.has(key)) {
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
  const hydrateNextKeys = async (): Promise<void> => {
    while (nextKeyIndex < CLOUD_LOCAL_STORAGE_KEYS.length) {
      const key = CLOUD_LOCAL_STORAGE_KEYS[nextKeyIndex];
      nextKeyIndex += 1;
      await hydrateKey(key);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(HYDRATION_CONCURRENCY, CLOUD_LOCAL_STORAGE_KEYS.length) },
      () => hydrateNextKeys(),
    ),
  );
}
