import { LOCAL_STORAGE_KEYS } from '../services/local-storage-keys';
import { applyThemePreset, getThemePreset } from './themePresets';

/** Apply canonical palette tokens before React mounts, including the sidebar. */
export function applyInitialThemeState(): void {
  const root = document.documentElement;
  let themeId: string | null = null;
  let font: { family?: string; id?: string } | null = null;
  try {
    root.dataset.sidebarCollapsed = localStorage.getItem(LOCAL_STORAGE_KEYS.sidebarCollapsed) === '1' ? '1' : '0';
    themeId = localStorage.getItem('gjh-theme-id-v1');
  } catch { root.dataset.sidebarCollapsed = '0'; }
  delete root.dataset.assistantCollapsed;
  delete root.dataset.assistantFullscreen;
  // Legacy stored CSS variables are intentionally not replayed: a saved ID adopts the
  // current coordinated palette instead of reviving stale sidebar/control colours.
  applyThemePreset(getThemePreset(themeId));
  try { font = JSON.parse(localStorage.getItem('gjh-font-vars-v1') || 'null'); } catch { /* Keep system font. */ }
  if (font?.family && typeof font.family === 'string') {
    root.style.setProperty('--app-font-family', font.family);
    root.dataset.fontPreset = font.id || 'system';
  }
}
