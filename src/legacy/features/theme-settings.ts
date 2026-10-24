import { getLegacyApp } from '../core/app-context';
import { applyThemePreset, DEFAULT_THEME_ID, getThemePreset, THEME_PRESETS } from '../../utils/themePresets';
import '../../styles/pages/theme-settings.css';

(function () {
  'use strict';
  const App = getLegacyApp();
  if (!App) return;
  const THEME_ID_KEY = 'gjh-theme-id-v1';
  const THEME_VARS_KEY = 'gjh-theme-vars-v1';
  const THEME_MODE_KEY = 'gjh-theme-mode-v1';
  const FONT_VARS_KEY = 'gjh-font-vars-v1';
  const DEFAULT_FONT_ID = 'system';
  const themes = THEME_PRESETS;
  const fontPresets = [
    { id: 'system', name: '系统默认', tone: '均衡清晰', sample: '320G6-N11 数据分析', family: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
    { id: 'microsoft-yahei', name: '微软雅黑', tone: '稳重办公', sample: '图谱分析 · 批量标签', family: '"Microsoft YaHei", "Segoe UI", "PingFang SC", sans-serif' },
    { id: 'kaiti', name: '楷体', tone: '雅致文档', sample: '物性数据列表 361 条', family: '"KaiTi", "STKaiti", "Kaiti SC", "楷体", serif' },
    { id: 'source-han', name: '思源黑体', tone: '专业阅读', sample: '拉伸强度 冲击强度', family: '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif' },
    { id: 'serif', name: '宋体正文', tone: '传统文档', sample: '订单管理与客户档案', family: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif' },
    { id: 'mono', name: '等宽数据', tone: '数字对齐', sample: 'A506202 25.57 MPa', family: '"Cascadia Mono", "Consolas", "SFMono-Regular", "Microsoft YaHei", monospace' },
  ];
  const refs = {
    grid: document.getElementById('themePresetGrid'),
    fontGrid: document.getElementById('fontPresetGrid'),
    resetBtn: document.getElementById('themeResetBtn'),
  };
  let events: AbortController | null = null;
  const refreshRefs = () => {
    refs.grid = document.getElementById('themePresetGrid');
    refs.fontGrid = document.getElementById('fontPresetGrid');
    refs.resetBtn = document.getElementById('themeResetBtn');
  };
  const getFontPreset = (id) => fontPresets.find((font) => font.id === id) || fontPresets[0];
  const readSavedFont = () => {
    try { const saved = JSON.parse(localStorage.getItem(FONT_VARS_KEY) || 'null'); return saved && typeof saved === 'object' ? saved : null; }
    catch { return null; }
  };
  const saveTheme = (theme) => {
    try {
      localStorage.setItem(THEME_ID_KEY, theme.id);
      localStorage.setItem(THEME_VARS_KEY, JSON.stringify(theme.vars));
      localStorage.setItem(THEME_MODE_KEY, theme.mode);
    } catch (error) { console.warn('[theme-settings] Failed to save theme:', error); }
  };
  const applyFont = (font) => {
    document.documentElement.style.setProperty('--app-font-family', font.family);
    document.documentElement.dataset.fontPreset = font.id;
  };
  const saveFont = (font) => {
    try { localStorage.setItem(FONT_VARS_KEY, JSON.stringify({ id: font.id, family: font.family })); }
    catch (error) { console.warn('[theme-settings] Failed to save font:', error); }
  };
  const render = () => {
    const focused = document.activeElement as HTMLElement | null;
    const focusedTheme = focused?.dataset.themePreset;
    const focusedFont = focused?.dataset.fontPreset;
    if (refs.grid) {
      const activeId = document.documentElement.dataset.colorTheme || DEFAULT_THEME_ID;
      refs.grid.innerHTML = themes.map((theme) => {
        const isActive = theme.id === activeId;
        const v = theme.vars;
        const preview = `--preview-nav:${v['--sidebar-bg']};--preview-active:${v['--sidebar-active']};--preview-muted:${v['--sidebar-muted']};--preview-bg:${v['--bg']};--preview-surface:${v['--surface']};--preview-accent:${v['--accent']};--preview-border:${v['--border']}`;
        return `<button class="theme-card${isActive ? ' is-active' : ''}" type="button" data-theme-preset="${theme.id}" aria-pressed="${isActive}">
          <span class="theme-card-check"><i class="ti ti-check" aria-hidden="true"></i></span>
          <span class="theme-card-head"><span><strong>${theme.name}</strong><em>${theme.tone}</em></span></span>
          <span class="theme-card-swatches theme-preview" style="${preview}" aria-hidden="true">
            <span class="theme-preview-nav"><span class="theme-preview-brand"></span><span class="theme-preview-selected"></span><span class="theme-preview-line"></span><span class="theme-preview-line"></span></span>
            <span class="theme-preview-main"><span class="theme-preview-top"></span><span class="theme-preview-panel"><span></span><span></span><span></span></span><span class="theme-preview-action"></span></span>
          </span>
          <span class="theme-card-desc">${theme.desc}</span></button>`;
      }).join('');
    }
    if (refs.fontGrid) {
      const activeFontId = getFontPreset(readSavedFont()?.id).id;
      refs.fontGrid.innerHTML = fontPresets.map((font) => {
        const isActive = font.id === activeFontId;
        return `<button class="font-card${isActive ? ' is-active' : ''}" type="button" data-font-preset="${font.id}" aria-pressed="${isActive}" style='--font-preview:${font.family}'>
          <span class="font-card-check"><i class="ti ti-check" aria-hidden="true"></i></span>
          <span class="font-card-head"><strong>${font.name}</strong><em>${font.tone}</em></span>
          <span class="font-card-sample">${font.sample}</span></button>`;
      }).join('');
    }
    if (focusedTheme) refs.grid?.querySelector<HTMLElement>(`[data-theme-preset="${focusedTheme}"]`)?.focus({ preventScroll: true });
    if (focusedFont) refs.fontGrid?.querySelector<HTMLElement>(`[data-font-preset="${focusedFont}"]`)?.focus({ preventScroll: true });
  };
  const setTheme = (id) => {
    const theme = getThemePreset(id);
    applyThemePreset(theme);
    saveTheme(theme);
    render();
    window.dispatchEvent(new CustomEvent('gjh:theme-change', { detail: { id: theme.id, mode: theme.mode } }));
  };
  const setFont = (id) => { const font = getFontPreset(id); applyFont(font); saveFont(font); render(); };
  const bind = () => {
    events?.abort(); events = new AbortController();
    const options = { signal: events.signal };
    refs.grid?.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLElement>('[data-theme-preset]');
      if (button) setTheme(button.dataset.themePreset);
    }, options);
    refs.fontGrid?.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLElement>('[data-font-preset]');
      if (button) setFont(button.dataset.fontPreset);
    }, options);
    refs.resetBtn?.addEventListener('click', () => { setTheme(DEFAULT_THEME_ID); setFont(DEFAULT_FONT_ID); }, options);
  };
  const init = () => {
    refreshRefs();
    const theme = getThemePreset(localStorage.getItem(THEME_ID_KEY));
    const font = getFontPreset(readSavedFont()?.id);
    applyThemePreset(theme); applyFont(font); saveTheme(theme); saveFont(font); render(); bind();
  };
  App.themeSettings = { init, setTheme, setFont, themes, fontPresets, cleanup: () => { events?.abort(); events = null; } };
})();
