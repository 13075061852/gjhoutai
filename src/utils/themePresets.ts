export type ThemePreset = {
  id: string;
  name: string;
  tone: string;
  desc: string;
  mode: 'light' | 'dark';
  swatches: string[];
  vars: Record<string, string>;
};

type Palette = {
  id: string; name: string; tone: string; desc: string;
  accent: string; bg: string; sidebar: string; navText: string; navMuted: string;
  active?: string; activeText?: string; surface?: string; dark?: boolean;
};

const mix = (base: string, tint: string, weight: number): string => {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = channels(base), b = channels(tint);
  return '#' + a.map((v, i) => Math.round(v * (1 - weight) + b[i] * weight).toString(16).padStart(2, '0')).join('');
};

const palettes: Palette[] = [
  { id: 'workspace', name: '实验室青', tone: '清透 · 默认', desc: '雾青导航与清白工作区，同色强调，专注材料与数据。', accent: '#176d70', bg: '#f2f6f5', sidebar: '#e5eeec', navText: '#244441', navMuted: '#526e69' },
  { id: 'green', name: '护眼绿', tone: '柔和 · 长时办公', desc: '鼠尾草绿导航搭配暖白卡片，低饱和而不失清晰。', accent: '#3c694b', bg: '#f2f5ee', sidebar: '#e5ebdf', navText: '#344936', navMuted: '#566b54' },
  { id: 'teal', name: '深海青', tone: '深导航 · 清爽', desc: '深海蓝青导航配浅冷色画布，强化工作区边界。', accent: '#126c80', bg: '#f1f6f8', sidebar: '#16343f', navText: '#d2e4e9', navMuted: '#a0bac2', active: '#285968' },
  { id: 'blue', name: '智能蓝', tone: '理性 · 明快', desc: '雾蓝导航、洁白卡片与清晰蓝色操作，适合高频检索。', accent: '#2f6fdd', bg: '#f2f5fa', sidebar: '#e6edf7', navText: '#2b4468', navMuted: '#536b8d' },
  { id: 'graphite', name: '石墨青', tone: '深导航 · 克制', desc: '石墨色导航与灰白表面，用低饱和青色突出关键操作。', accent: '#46666b', bg: '#f3f5f5', sidebar: '#303d43', navText: '#e1e8e9', navMuted: '#a9bbc0', active: '#486168' },
  { id: 'white', name: '纯净白', tone: '通透 · 极简', desc: '白色导航融入浅灰工作区，以柔和蓝色标明当前位置。', accent: '#365d8d', bg: '#f5f6f8', sidebar: '#ffffff', navText: '#39485e', navMuted: '#626e80', active: '#edf2f8', activeText: '#284f80' },
  { id: 'jade', name: '玉石青', tone: '温润 · 自然', desc: '玉石色导航与微暖白表面，兼顾层次和长时间阅读。', accent: '#267463', bg: '#f2f7f4', sidebar: '#deece6', navText: '#284a40', navMuted: '#516d62' },
  { id: 'indigo', name: '曜石靛', tone: '雅致 · 分析', desc: '淡靛导航与冷白卡片，深紫蓝强调让分析界面更沉静。', accent: '#5755a3', bg: '#f5f5fa', sidebar: '#eae9f5', navText: '#423c6c', navMuted: '#6d6588' },
  { id: 'rosewood', name: '檀木红', tone: '柔暖 · 商务', desc: '浅檀红导航与暖白底，红棕强调沉稳而不刺眼。', accent: '#a04b58', bg: '#faf5f5', sidebar: '#f0e4e5', navText: '#68414a', navMuted: '#7b5963' },
  { id: 'slate-gold', name: '岩灰金', tone: '砂岩 · 温暖', desc: '砂岩色导航与米白画布，古铜金强调带来稳重质感。', accent: '#84662e', bg: '#f7f5ef', sidebar: '#ece6d7', navText: '#5f5136', navMuted: '#6d6045' },
  { id: 'midnight', name: '午夜蓝', tone: '深色 · 静谧', desc: '深蓝导航、分层蓝灰卡片与冰蓝强调，夜间也保持可读。', accent: '#8ab8f2', bg: '#101825', surface: '#182437', sidebar: '#0c1422', navText: '#d1deef', navMuted: '#9aaecb', active: '#284464', dark: true },
  { id: 'emerald-night', name: '墨森绿', tone: '深色 · 护眼', desc: '墨绿导航与层次分明的深绿表面，柔和翡翠色指引操作。', accent: '#75cdb1', bg: '#10211c', surface: '#182d25', sidebar: '#0b1914', navText: '#cce3d8', navMuted: '#9dbbae', active: '#244f40', dark: true },
  { id: 'dark', name: '暗色', tone: '深色 · 石墨', desc: '中性石墨表面搭配青灰强调，减少眩光并保留信息层级。', accent: '#81c9c2', bg: '#181d20', surface: '#232b30', sidebar: '#12191c', navText: '#d7e4e7', navMuted: '#a3bac0', active: '#2c4c50', dark: true },
];

export const THEME_PRESETS: ThemePreset[] = palettes.map((p) => {
  const dark = Boolean(p.dark);
  const surface = p.surface || '#ffffff';
  const text = dark ? '#edf3f5' : mix('#182128', p.accent, .12);
  const onAccent = dark ? '#102329' : '#ffffff';
  const active = p.active || p.accent;
  const activeText = p.activeText || '#ffffff';
  const vars: Record<string, string> = {
    '--bg': p.bg, '--surface': surface,
    '--surface-2': mix(surface, p.accent, dark ? .07 : .035),
    '--surface-3': mix(surface, p.accent, dark ? .13 : .075),
    '--border': mix(surface, p.accent, dark ? .21 : .18),
    '--border-2': mix(surface, p.accent, dark ? .34 : .30),
    '--text': text, '--text-2': mix(text, surface, .18),
    '--muted': mix(text, surface, dark ? .29 : .36),
    '--muted-2': mix(text, surface, dark ? .43 : .49),
    '--accent': p.accent, '--on-accent': onAccent,
    '--accent-soft': mix(surface, p.accent, dark ? .17 : .085),
    '--accent-hover': mix(p.accent, dark ? '#ffffff' : '#000000', .10),
    '--success': dark ? '#8ad3a1' : '#2e7d48',
    '--warn': dark ? '#e4bf73' : '#95651c',
    '--danger': dark ? '#f0a4a9' : '#b7434b',
    '--sidebar-bg': p.sidebar, '--sidebar-text': p.navText, '--sidebar-muted': p.navMuted,
    '--sidebar-title': p.navText, '--sidebar-border': mix(p.sidebar, p.navText, .14),
    '--sidebar-hover': mix(p.sidebar, p.navText, .07),
    '--sidebar-hover-text': p.navText,
    '--sidebar-active': active, '--sidebar-active-text': activeText,
    '--sidebar-active-icon': activeText,
    '--sidebar-marker': p.activeText ? p.accent : mix(active, '#ffffff', .72),
    '--sidebar-focus': dark || (p.active && !p.activeText) ? mix(p.accent, '#ffffff', .50) : p.accent,
    '--control-bg': 'var(--surface)', '--control-bg-hover': 'var(--surface-2)',
    '--control-border': 'var(--border)', '--control-border-hover': 'var(--border-2)',
    '--control-border-focus': p.accent,
    '--control-ring': `color-mix(in srgb, ${p.accent} 18%, transparent)`,
    '--control-text': 'var(--text)', '--control-muted': 'var(--muted)',
    '--control-shadow': 'none', '--control-shadow-hover': 'none', '--shadow': 'none',
    '--scrollbar-thumb': mix(surface, p.accent, .45),
    '--ui-dialog-backdrop': dark ? 'rgba(0,0,0,.58)' : 'rgba(20,30,38,.32)',
  };
  return { id: p.id, name: p.name, tone: p.tone, desc: p.desc, mode: dark ? 'dark' : 'light', swatches: [p.sidebar, p.bg, p.accent], vars };
});

export const DEFAULT_THEME_ID = 'workspace';
export const THEME_VAR_NAMES = Object.keys(THEME_PRESETS[0].vars);
export const getThemePreset = (id?: string | null): ThemePreset => THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];

/** One source of truth for first paint, persisted themes and live switching. */
export function applyThemePreset(theme: ThemePreset): void {
  const root = document.documentElement;
  THEME_VAR_NAMES.forEach((key) => root.style.removeProperty(key));
  Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.colorTheme = theme.id;
  root.dataset.colorMode = theme.mode;
  root.style.colorScheme = theme.mode;
  if (document.body) {
    if (theme.mode === 'dark') document.body.dataset.theme = 'dark';
    else document.body.removeAttribute('data-theme');
  }
}
