import { cloudStorage } from './cloud-storage';
import {
  CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS,
  CLOUD_LOCAL_STORAGE_KEYS,
  SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS,
} from './local-storage-keys';

const CLOUD_LOCAL_STORAGE_KEY_SET = new Set<string>(CLOUD_LOCAL_STORAGE_KEYS);
const SEED_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET = new Set<string>(SEED_LOCAL_WHEN_REMOTE_EMPTY_KEYS);
const CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEY_SET = new Set<string>(CLEAR_LOCAL_WHEN_REMOTE_EMPTY_KEYS);

export function isCloudBackedLocalStorageKey(key: string): boolean {
  return CLOUD_LOCAL_STORAGE_KEY_SET.has(key);
}

export function setCloudBackedLocalStorageItem(key: string, value: string): void {
  localStorage.setItem(key, value);
  if (isCloudBackedLocalStorageKey(key)) {
    void cloudStorage.putJson(key, value);
  }
}

export function removeCloudBackedLocalStorageItem(key: string): void {
  localStorage.removeItem(key);
  if (isCloudBackedLocalStorageKey(key)) {
    void cloudStorage.deleteJson(key);
  }
}

export async function hydrateCloudBackedLocalStorage(): Promise<void> {
  await Promise.all(CLOUD_LOCAL_STORAGE_KEYS.map(async (key) => {
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
        void cloudStorage.putJson(key, localValue);
      }
    }
  }));
}
