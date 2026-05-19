import { legacyMarkup } from '../legacy/legacyMarkup';

const NAV_PAGE_KEY = 'sidebar-active-page';
const DEFAULT_PAGE_ID = 'dashboard';
const DIRECT_PAGE_SECTIONS = new Set([
  'ai-config',
  'property-analysis',
  'spectrum-analysis',
  'image-cutout',
  'theme-settings',
  'project-skills',
  'ai-call-analysis',
]);

function getInitialPageId() {
  try {
    return localStorage.getItem(NAV_PAGE_KEY) || DEFAULT_PAGE_ID;
  } catch {
    return DEFAULT_PAGE_ID;
  }
}

function getInitialLegacyMarkup() {
  const pageId = getInitialPageId();
  const sectionId = DIRECT_PAGE_SECTIONS.has(pageId) ? pageId : 'placeholder';
  const sectionPattern = new RegExp(`(<section class="[^"]*\\bpage-section)([^"]*" data-page-section="${sectionId}")`);

  let markup = legacyMarkup
    .replace(/\bpage-section active\b/g, 'page-section')
    .replace('class="shell"', 'class="shell legacy-shell-booting"')
    .replace(sectionPattern, '$1 active$2');

  if (pageId !== DEFAULT_PAGE_ID) {
    markup = markup.replace('class="shell legacy-shell-booting"', 'class="shell legacy-shell-booting page-other"');
  }

  return markup;
}

export function LegacyShell() {
  return <div dangerouslySetInnerHTML={{ __html: getInitialLegacyMarkup() }} />;
}
