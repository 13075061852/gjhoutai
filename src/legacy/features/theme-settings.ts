// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const THEME_ID_KEY = 'gjh-theme-id-v1';
  const THEME_VARS_KEY = 'gjh-theme-vars-v1';
  const THEME_MODE_KEY = 'gjh-theme-mode-v1';
  const FONT_VARS_KEY = 'gjh-font-vars-v1';
  const DEFAULT_THEME_ID = 'white';
  const DEFAULT_FONT_ID = 'system';

  const themes = [
    {
      id: 'green',
      name: '护眼绿',
      tone: '默认办公',
      desc: '柔和低饱和，适合长时间录入和数据浏览。',
      swatches: ['#3f8f72', '#eef3ed', '#fbfcf7'],
      vars: {
        '--bg': '#eef3ed',
        '--surface': '#fbfcf7',
        '--surface-2': '#f4f8ef',
        '--surface-3': '#eaf2e7',
        '--border': '#d6e1d2',
        '--border-2': '#c3d3bf',
        '--text': '#1f2a24',
        '--text-2': '#435349',
        '--muted': '#68776d',
        '--muted-2': '#8a998f',
        '--accent': '#3f8f72',
        '--accent-soft': 'rgba(63,143,114,.12)',
        '--control-border-focus': 'rgba(63,143,114,.58)',
        '--control-ring': 'rgba(63,143,114,.14)',
        '--scrollbar-thumb': 'rgba(174,193,180,.9)',
      },
    },
    {
      id: 'teal',
      name: '深海青',
      tone: '清爽冷静',
      desc: '青绿色强调更清爽，适合图谱、质检和审核场景。',
      swatches: ['#0f8b8d', '#edf6f5', '#fbfefe'],
      vars: {
        '--bg': '#edf6f5',
        '--surface': '#fbfefe',
        '--surface-2': '#f1f9f8',
        '--surface-3': '#e4f2f1',
        '--border': '#cfe3e0',
        '--border-2': '#b8d3cf',
        '--text': '#183235',
        '--text-2': '#3d585b',
        '--muted': '#657c7f',
        '--muted-2': '#8aa0a2',
        '--accent': '#0f8b8d',
        '--accent-soft': 'rgba(15,139,141,.12)',
        '--control-border-focus': 'rgba(15,139,141,.58)',
        '--control-ring': 'rgba(15,139,141,.14)',
        '--scrollbar-thumb': 'rgba(161,190,188,.9)',
      },
    },
    {
      id: 'blue',
      name: '智能蓝',
      tone: '效率科技',
      desc: '蓝色对比更直接，适合管理看板和高频操作。',
      swatches: ['#2f6fdd', '#eef4ff', '#fbfdff'],
      vars: {
        '--bg': '#eef4ff',
        '--surface': '#fbfdff',
        '--surface-2': '#f3f7ff',
        '--surface-3': '#e7eefc',
        '--border': '#d5e0f3',
        '--border-2': '#bfcee6',
        '--text': '#1d2c44',
        '--text-2': '#40516b',
        '--muted': '#68788f',
        '--muted-2': '#8c9bb0',
        '--accent': '#2f6fdd',
        '--accent-soft': 'rgba(47,111,221,.12)',
        '--control-border-focus': 'rgba(47,111,221,.58)',
        '--control-ring': 'rgba(47,111,221,.14)',
        '--scrollbar-thumb': 'rgba(169,185,211,.9)',
      },
    },
    {
      id: 'graphite',
      name: '石墨青',
      tone: '克制专业',
      desc: '灰白层次配青色强调，适合更安静的后台界面。',
      swatches: ['#256d78', '#f1f4f4', '#ffffff'],
      vars: {
        '--bg': '#f1f4f4',
        '--surface': '#ffffff',
        '--surface-2': '#f6f8f8',
        '--surface-3': '#e9eeee',
        '--border': '#d6dddd',
        '--border-2': '#c2cbcc',
        '--text': '#202b2d',
        '--text-2': '#445154',
        '--muted': '#6a7679',
        '--muted-2': '#8d999b',
        '--accent': '#256d78',
        '--accent-soft': 'rgba(37,109,120,.12)',
        '--control-border-focus': 'rgba(37,109,120,.58)',
        '--control-ring': 'rgba(37,109,120,.14)',
        '--scrollbar-thumb': 'rgba(174,185,186,.9)',
      },
    },
    {
      id: 'white',
      name: '纯净白',
      tone: '白灰蓝',
      desc: '纯白卡片、浅灰背景和蓝色强调，适合标准后台办公界面。',
      swatches: ['#2563eb', '#f3f4f6', '#ffffff'],
      vars: {
        '--bg': '#f3f4f6',
        '--surface': '#ffffff',
        '--surface-2': '#f9fafb',
        '--surface-3': '#eef2f7',
        '--border': '#e5e7eb',
        '--border-2': '#cbd5e1',
        '--text': '#111827',
        '--text-2': '#374151',
        '--muted': '#6b7280',
        '--muted-2': '#9ca3af',
        '--accent': '#2563eb',
        '--accent-soft': 'rgba(37,99,235,.12)',
        '--control-border-focus': 'rgba(37,99,235,.58)',
        '--control-ring': 'rgba(37,99,235,.14)',
        '--scrollbar-thumb': 'rgba(156,163,175,.9)',
      },
    },
    {
      id: 'jade',
      name: '玉石青',
      tone: '高级温润',
      desc: '灰白底配玉石青强调，适合长时间办公和客户资料管理。',
      swatches: ['#2f7d6d', '#f3f7f5', '#ffffff'],
      vars: {
        '--bg': '#f3f7f5',
        '--surface': '#ffffff',
        '--surface-2': '#f7faf8',
        '--surface-3': '#e8f0ec',
        '--border': '#d7e1dc',
        '--border-2': '#bfcec7',
        '--text': '#17231f',
        '--text-2': '#3c4d47',
        '--muted': '#667670',
        '--muted-2': '#8a9892',
        '--accent': '#2f7d6d',
        '--accent-soft': 'rgba(47,125,109,.13)',
        '--control-border-focus': 'rgba(47,125,109,.58)',
        '--control-ring': 'rgba(47,125,109,.14)',
        '--scrollbar-thumb': 'rgba(169,188,179,.9)',
      },
    },
    {
      id: 'indigo',
      name: '曜石靛',
      tone: '科技克制',
      desc: '冷白背景搭配深靛蓝，适合 AI、分析和管理看板。',
      swatches: ['#3d5afe', '#f4f6fb', '#ffffff'],
      vars: {
        '--bg': '#f4f6fb',
        '--surface': '#ffffff',
        '--surface-2': '#f8f9fd',
        '--surface-3': '#e9edf7',
        '--border': '#d9dfed',
        '--border-2': '#c3ccdf',
        '--text': '#172033',
        '--text-2': '#3f4b63',
        '--muted': '#68748a',
        '--muted-2': '#8c96a8',
        '--accent': '#3d5afe',
        '--accent-soft': 'rgba(61,90,254,.12)',
        '--control-border-focus': 'rgba(61,90,254,.56)',
        '--control-ring': 'rgba(61,90,254,.14)',
        '--scrollbar-thumb': 'rgba(170,179,202,.9)',
      },
    },
    {
      id: 'rosewood',
      name: '檀木红',
      tone: '沉稳商务',
      desc: '低饱和红棕强调，适合审批、财务和经营管理界面。',
      swatches: ['#9f3f46', '#f7f4f3', '#ffffff'],
      vars: {
        '--bg': '#f7f4f3',
        '--surface': '#ffffff',
        '--surface-2': '#faf7f6',
        '--surface-3': '#efe6e5',
        '--border': '#e2d6d4',
        '--border-2': '#cfbebb',
        '--text': '#2a1f1f',
        '--text-2': '#584748',
        '--muted': '#7b6b6b',
        '--muted-2': '#9c8f8f',
        '--accent': '#9f3f46',
        '--accent-soft': 'rgba(159,63,70,.12)',
        '--control-border-focus': 'rgba(159,63,70,.56)',
        '--control-ring': 'rgba(159,63,70,.14)',
        '--scrollbar-thumb': 'rgba(190,174,171,.9)',
      },
    },
    {
      id: 'slate-gold',
      name: '岩灰金',
      tone: '精英质感',
      desc: '冷灰基底配金橄榄强调，适合更稳重的企业后台。',
      swatches: ['#8a6f2a', '#f5f5f2', '#ffffff'],
      vars: {
        '--bg': '#f5f5f2',
        '--surface': '#ffffff',
        '--surface-2': '#f9f9f6',
        '--surface-3': '#eaeae3',
        '--border': '#deded4',
        '--border-2': '#cacaBC',
        '--text': '#242521',
        '--text-2': '#4f5049',
        '--muted': '#72736b',
        '--muted-2': '#94958c',
        '--accent': '#8a6f2a',
        '--accent-soft': 'rgba(138,111,42,.13)',
        '--control-border-focus': 'rgba(138,111,42,.56)',
        '--control-ring': 'rgba(138,111,42,.14)',
        '--scrollbar-thumb': 'rgba(184,184,173,.9)',
      },
    },
    {
      id: 'midnight',
      name: '午夜蓝',
      tone: '深色高级',
      desc: '深蓝黑底和冰蓝强调，适合夜间监控、图谱和大屏场景。',
      mode: 'dark',
      swatches: ['#60a5fa', '#08111f', '#111827'],
      vars: {
        '--bg': '#08111f',
        '--surface': '#111827',
        '--surface-2': '#172235',
        '--surface-3': '#203047',
        '--border': '#27364f',
        '--border-2': '#3a4d69',
        '--text': '#edf5ff',
        '--text-2': '#c7d5e8',
        '--muted': '#95a7bd',
        '--muted-2': '#73849a',
        '--accent': '#60a5fa',
        '--accent-soft': 'rgba(96,165,250,.16)',
        '--control-bg': '#111827',
        '--control-bg-hover': '#172235',
        '--control-border': '#27364f',
        '--control-border-hover': '#3a4d69',
        '--control-border-focus': 'rgba(96,165,250,.62)',
        '--control-ring': 'rgba(96,165,250,.16)',
        '--control-text': '#edf5ff',
        '--control-muted': '#95a7bd',
        '--control-shadow': 'none',
        '--control-shadow-hover': 'none',
        '--shadow': 'none',
        '--scrollbar-thumb': 'rgba(84,105,135,.9)',
      },
    },
    {
      id: 'emerald-night',
      name: '墨森绿',
      tone: '深色护眼',
      desc: '深墨绿底和翡翠强调，适合夜间长时间录入和巡检。',
      mode: 'dark',
      swatches: ['#34d399', '#071a17', '#10231f'],
      vars: {
        '--bg': '#071a17',
        '--surface': '#10231f',
        '--surface-2': '#16312b',
        '--surface-3': '#1e3d36',
        '--border': '#24483f',
        '--border-2': '#356256',
        '--text': '#ecfdf7',
        '--text-2': '#c6e3d9',
        '--muted': '#92b2a7',
        '--muted-2': '#6f9186',
        '--accent': '#34d399',
        '--accent-soft': 'rgba(52,211,153,.16)',
        '--control-bg': '#10231f',
        '--control-bg-hover': '#16312b',
        '--control-border': '#24483f',
        '--control-border-hover': '#356256',
        '--control-border-focus': 'rgba(52,211,153,.62)',
        '--control-ring': 'rgba(52,211,153,.16)',
        '--control-text': '#ecfdf7',
        '--control-muted': '#92b2a7',
        '--control-shadow': 'none',
        '--control-shadow-hover': 'none',
        '--shadow': 'none',
        '--scrollbar-thumb': 'rgba(73,111,98,.9)',
      },
    },
    {
      id: 'dark',
      name: '暗色',
      tone: '夜间专注',
      desc: '深色背景降低眩光，适合夜间值守和大屏监控。',
      mode: 'dark',
      swatches: ['#22c7b8', '#0b1120', '#111827'],
      vars: {
        '--bg': '#0b1120',
        '--surface': '#111827',
        '--surface-2': '#162033',
        '--surface-3': '#1d2940',
        '--border': '#26344d',
        '--border-2': '#354762',
        '--text': '#edf4fb',
        '--text-2': '#c6d3e2',
        '--muted': '#94a3b8',
        '--muted-2': '#718096',
        '--accent': '#22c7b8',
        '--accent-soft': 'rgba(34,199,184,.16)',
        '--control-bg': '#111827',
        '--control-bg-hover': '#162033',
        '--control-border': '#26344d',
        '--control-border-hover': '#354762',
        '--control-border-focus': 'rgba(34,199,184,.62)',
        '--control-ring': 'rgba(34,199,184,.16)',
        '--control-text': '#edf4fb',
        '--control-muted': '#94a3b8',
        '--control-shadow': 'none',
        '--control-shadow-hover': 'none',
        '--shadow': 'none',
        '--scrollbar-thumb': 'rgba(79,96,124,.9)',
      },
    },
  ];

  const themeVarNames = [...new Set(themes.flatMap((theme) => Object.keys(theme.vars)))];
  const fontPresets = [
    {
      id: 'system',
      name: '系统默认',
      tone: '均衡清晰',
      sample: '320G6-N11 数据分析',
      family: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      id: 'microsoft-yahei',
      name: '微软雅黑',
      tone: '稳重办公',
      sample: '图谱分析 · 批量标签',
      family: '"Microsoft YaHei", "Segoe UI", "PingFang SC", sans-serif',
    },
    {
      id: 'kaiti',
      name: '楷体',
      tone: '雅致文档',
      sample: '物性数据列表 361 条',
      family: '"KaiTi", "STKaiti", "Kaiti SC", "楷体", serif',
    },
    {
      id: 'source-han',
      name: '思源黑体',
      tone: '专业阅读',
      sample: '拉伸强度 冲击强度',
      family: '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
    },
    {
      id: 'serif',
      name: '宋体正文',
      tone: '传统文档',
      sample: '订单管理与客户档案',
      family: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif',
    },
    {
      id: 'mono',
      name: '等宽数据',
      tone: '数字对齐',
      sample: 'A506202 25.57 MPa',
      family: '"Cascadia Mono", "Consolas", "SFMono-Regular", "Microsoft YaHei", monospace',
    },
  ];

  const refs = {
    grid: document.getElementById('themePresetGrid'),
    fontGrid: document.getElementById('fontPresetGrid'),
    resetBtn: document.getElementById('themeResetBtn'),
  };

  const getTheme = (id) => themes.find((theme) => theme.id === id) || themes.find((theme) => theme.id === DEFAULT_THEME_ID) || themes[0];
  const getFontPreset = (id) => fontPresets.find((font) => font.id === id) || fontPresets.find((font) => font.id === DEFAULT_FONT_ID) || fontPresets[0];

  const readSavedFont = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(FONT_VARS_KEY) || 'null');
      return saved && typeof saved === 'object' ? saved : null;
    } catch {
      return null;
    }
  };

  const applyTheme = (theme) => {
    themeVarNames.forEach((key) => {
      document.documentElement.style.removeProperty(key);
    });
    Object.entries(theme.vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    document.documentElement.dataset.colorTheme = theme.id;
    document.documentElement.dataset.colorMode = theme.mode || 'light';
    if (document.body) {
      if (theme.mode === 'dark') {
        document.body.dataset.theme = 'dark';
      } else {
        document.body.removeAttribute('data-theme');
      }
    }
  };

  const saveTheme = (theme) => {
    try {
      localStorage.setItem(THEME_ID_KEY, theme.id);
      localStorage.setItem(THEME_VARS_KEY, JSON.stringify(theme.vars));
      localStorage.setItem(THEME_MODE_KEY, theme.mode || 'light');
    } catch (error) {
      console.warn('[theme-settings] Failed to save theme:', error);
    }
  };

  const applyFont = (font) => {
    document.documentElement.style.setProperty('--app-font-family', font.family);
    document.documentElement.dataset.fontPreset = font.id;
  };

  const saveFont = (font) => {
    try {
      localStorage.setItem(FONT_VARS_KEY, JSON.stringify({
        id: font.id,
        family: font.family,
      }));
    } catch (error) {
      console.warn('[theme-settings] Failed to save font:', error);
    }
  };

  const render = () => {
    if (refs.grid) {
      const activeId = getTheme(localStorage.getItem(THEME_ID_KEY)).id;
      refs.grid.innerHTML = themes.map((theme) => {
        const isActive = theme.id === activeId;
        return `
          <button class="theme-card${isActive ? ' is-active' : ''}" type="button" data-theme-preset="${theme.id}">
            <span class="theme-card-check"><i class="ti ti-check" aria-hidden="true"></i></span>
            <span class="theme-card-head">
              <span>
                <strong>${theme.name}</strong>
                <em>${theme.tone}</em>
              </span>
            </span>
            <span class="theme-card-swatches" aria-hidden="true">
              ${theme.swatches.map((color) => `<span style="background:${color}"></span>`).join('')}
            </span>
            <span class="theme-card-desc">${theme.desc}</span>
          </button>
        `;
      }).join('');
    }

    if (refs.fontGrid) {
      const savedFont = readSavedFont();
      const activeFontId = getFontPreset(savedFont?.id).id;
      refs.fontGrid.innerHTML = fontPresets.map((font) => {
        const isActive = font.id === activeFontId;
        return `
          <button class="font-card${isActive ? ' is-active' : ''}" type="button" data-font-preset="${font.id}" style='--font-preview:${font.family}'>
            <span class="font-card-check"><i class="ti ti-check" aria-hidden="true"></i></span>
            <span class="font-card-head">
              <strong>${font.name}</strong>
              <em>${font.tone}</em>
            </span>
            <span class="font-card-sample">${font.sample}</span>
          </button>
        `;
      }).join('');
    }
  };

  const setTheme = (id) => {
    const theme = getTheme(id);
    applyTheme(theme);
    saveTheme(theme);
    render();
  };

  const setFont = (id) => {
    const font = getFontPreset(id);
    applyFont(font);
    saveFont(font);
    render();
  };

  const bind = () => {
    refs.grid?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme-preset]');
      if (!button) return;
      setTheme(button.getAttribute('data-theme-preset'));
    });

    refs.fontGrid?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-font-preset]');
      if (!button) return;
      setFont(button.getAttribute('data-font-preset'));
    });

    refs.resetBtn?.addEventListener('click', () => {
      setTheme(DEFAULT_THEME_ID);
      setFont(DEFAULT_FONT_ID);
    });
  };

  const init = () => {
    const savedId = localStorage.getItem(THEME_ID_KEY);
    const theme = getTheme(savedId);
    const savedFont = readSavedFont();
    const font = getFontPreset(savedFont?.id);
    applyTheme(theme);
    applyFont(font);
    saveTheme(theme);
    saveFont(font);
    render();
    bind();
  };

  App.themeSettings = {
    init,
    setTheme,
    setFont,
    themes,
    fontPresets,
  };
})();
