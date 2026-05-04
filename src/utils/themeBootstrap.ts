const THEME_KEYS = {
  sidebar: 'sidebar-collapsed',
  assistant: 'assistant-collapsed',
  mode: 'gjh-theme-mode-v1',
  vars: 'gjh-theme-vars-v1',
  font: 'gjh-font-vars-v1',
  themeId: 'gjh-theme-id-v1',
} as const;

export function applyInitialThemeState(): void {
  try {
    const root = document.documentElement;
    root.dataset.sidebarCollapsed = localStorage.getItem(THEME_KEYS.sidebar) === '1' ? '1' : '0';
    root.dataset.assistantCollapsed = localStorage.getItem(THEME_KEYS.assistant) === '1' ? '1' : '0';
    root.dataset.colorMode = localStorage.getItem(THEME_KEYS.mode) || 'light';

    const savedThemeVars = JSON.parse(localStorage.getItem(THEME_KEYS.vars) || 'null') as Record<string, string> | null;
    if (savedThemeVars && typeof savedThemeVars === 'object') {
      Object.entries(savedThemeVars).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }

    const savedFontVars = JSON.parse(localStorage.getItem(THEME_KEYS.font) || 'null') as { family?: string; id?: string } | null;
    if (savedFontVars?.family) {
      root.style.setProperty('--app-font-family', savedFontVars.family);
      root.dataset.fontPreset = savedFontVars.id || 'system';
    }

    root.dataset.colorTheme = localStorage.getItem(THEME_KEYS.themeId) || 'white';
  } catch {
    // Ignore storage access failures and keep default state.
  }
}
