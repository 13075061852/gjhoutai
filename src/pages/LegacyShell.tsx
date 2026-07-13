import { legacyMarkup } from '../legacy/legacyMarkup';
import { LOCAL_STORAGE_KEYS } from '../services/local-storage-keys';

const NAV_PAGE_KEY = 'sidebar-active-page';
const DEFAULT_PAGE_ID = 'dashboard';
const TRUSTED_LEGACY_MARKUP = assertTrustedLegacyMarkup(legacyMarkup);
const LEGACY_LOADING_MARKUP = `
  <div class="legacy-loading-state" role="status" aria-live="polite" aria-label="正在加载工作台">
    <span class="legacy-loading-spinner" aria-hidden="true"></span>
    <strong>正在加载工作台</strong>
    <span>正在同步数据与页面配置...</span>
  </div>
`;
const DIRECT_PAGE_SECTIONS = new Set([
  'ai-config',
  'property-analysis',
  'spectrum-analysis',
  'data-recognition',
  'image-cutout',
  'theme-settings',
  'project-skills',
  'ai-call-analysis',
]);

export function assertTrustedLegacyMarkup(markup: string) {
  if (/<script\b/i.test(markup) || /\son[a-z]+\s*=/i.test(markup) || /\bhref\s*=\s*["']?\s*javascript:/i.test(markup)) {
    throw new Error('Legacy shell markup contains executable HTML and cannot be injected.');
  }
  return markup;
}

function getInitialPageId() {
  try {
    return localStorage.getItem(NAV_PAGE_KEY) || DEFAULT_PAGE_ID;
  } catch {
    return DEFAULT_PAGE_ID;
  }
}

function getInitialSidebarCollapsed() {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEYS.sidebarCollapsed) === '1';
  } catch {
    return false;
  }
}

export function getInitialLegacyMarkup(booting = true) {
  const pageId = getInitialPageId();
  const sectionId = DIRECT_PAGE_SECTIONS.has(pageId) ? pageId : 'placeholder';
  const sectionPattern = new RegExp(`(<section class="[^"]*\\bpage-section)([^"]*" data-page-section="${sectionId}")`);
  const shellClasses = [
    'shell',
    booting ? 'legacy-shell-booting' : '',
    getInitialSidebarCollapsed() ? 'sidebar-collapsed' : '',
    pageId !== DEFAULT_PAGE_ID ? 'page-other' : '',
  ].filter(Boolean).join(' ');

  let markup = TRUSTED_LEGACY_MARKUP
    .replace(/\bpage-section active\b/g, 'page-section')
    .replace('class="shell"', `class="${shellClasses}"`)
    .replace(sectionPattern, '$1 active$2');

  if (booting) {
    markup = markup.replace('<div class="content">', `<div class="content">${LEGACY_LOADING_MARKUP}`);
  }

  return markup;
}

export function LegacyShell({ booting = true }: { booting?: boolean }) {
  return <div dangerouslySetInnerHTML={{ __html: getInitialLegacyMarkup(booting) }} />;
}
