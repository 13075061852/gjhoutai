// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { applyInitialThemeState } from './themeBootstrap';
import { LOCAL_STORAGE_KEYS } from '../services/local-storage-keys';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.body.dataset.theme;
  for (const key of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[key];
});

describe('workspace theme bootstrap', () => {
  it('starts a new workspace with the data area prioritized', () => {
    applyInitialThemeState();
    expect(document.documentElement.dataset.assistantCollapsed).toBeUndefined();
    expect(document.documentElement.dataset.colorTheme).toBe('workspace');
  });

  it('ignores the retired open-assistant state while preserving the chosen palette', () => {
    localStorage.setItem('assistant-collapsed', '0');
    localStorage.setItem('gjh-theme-id-v1', 'blue');
    localStorage.setItem('gjh-theme-vars-v1', JSON.stringify({'--accent': '#2f6fdd'}));
    applyInitialThemeState();
    expect(document.documentElement.dataset.assistantCollapsed).toBeUndefined();
    expect(document.documentElement.dataset.colorTheme).toBe('blue');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2f6fdd');
  });

  it('upgrades stale saved CSS and restores the sidebar before a theme page is visited', () => {
    localStorage.setItem('gjh-theme-id-v1', 'midnight');
    localStorage.setItem('gjh-theme-vars-v1', JSON.stringify({ '--accent': '#ff0000', '--sidebar-bg': '#ffffff' }));
    applyInitialThemeState();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#8ab8f2');
    expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe('#0c1422');
    expect(document.body.dataset.theme).toBe('dark');
    localStorage.setItem('gjh-theme-id-v1', 'white');
    applyInitialThemeState();
    expect(document.body.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe('#ffffff');
  });

  it('does not let malformed legacy variables prevent the selected palette loading', () => {
    localStorage.setItem('gjh-theme-id-v1', 'jade');
    localStorage.setItem('gjh-theme-vars-v1', '{broken');
    localStorage.setItem('gjh-font-vars-v1', '{broken');
    applyInitialThemeState();
    expect(document.documentElement.dataset.colorTheme).toBe('jade');
    expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe('#deece6');
  });

  it('keeps the user’s collapsed navigation preference', () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.sidebarCollapsed, '1');
    applyInitialThemeState();
    expect(document.documentElement.dataset.sidebarCollapsed).toBe('1');
  });
});
