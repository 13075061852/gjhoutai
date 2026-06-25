import { legacyMarkup } from '../legacy/legacyMarkup';

const NAV_PAGE_KEY = 'sidebar-active-page';
const DEFAULT_PAGE_ID = 'dashboard';
const TRUSTED_LEGACY_MARKUP = assertTrustedLegacyMarkup(legacyMarkup);
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

function getInitialLegacyMarkup(booting = true) {
  const pageId = getInitialPageId();
  const sectionId = DIRECT_PAGE_SECTIONS.has(pageId) ? pageId : 'placeholder';
  const sectionPattern = new RegExp(`(<section class="[^"]*\\bpage-section)([^"]*" data-page-section="${sectionId}")`);

  let markup = TRUSTED_LEGACY_MARKUP
    .replace(/\bpage-section active\b/g, 'page-section')
    .replace('class="shell"', booting ? 'class="shell legacy-shell-booting"' : 'class="shell"')
    .replace(sectionPattern, '$1 active$2');

  if (pageId !== DEFAULT_PAGE_ID) {
    markup = markup.replace(
      booting ? 'class="shell legacy-shell-booting"' : 'class="shell"',
      booting ? 'class="shell legacy-shell-booting page-other"' : 'class="shell page-other"',
    );
  }

  return markup;
}

export function LegacyShell({ booting = true }: { booting?: boolean }) {
  return <div dangerouslySetInnerHTML={{ __html: getInitialLegacyMarkup(booting) }} />;
}
