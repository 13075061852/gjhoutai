import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const failures = [];

async function collectFiles(directory, extension, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(target, extension, output);
    else if (entry.name.endsWith(extension)) output.push(target);
  }
  return output;
}

const cssFiles = await collectFiles(srcRoot, '.css');
for (const file of cssFiles) {
  const source = await readFile(file, 'utf8');
  if (/\b(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\s*\(/i.test(source)) {
    failures.push(`${path.relative(root, file)}: contains a forbidden gradient`);
  }
}

const responsivePath = path.join(srcRoot, 'styles', 'layout', 'responsive.css');
const responsiveSource = await readFile(responsivePath, 'utf8');
const allowedGlobalBreakpoints = new Set(['1200', '980', '720', '480']);
for (const match of responsiveSource.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)) {
  if (!allowedGlobalBreakpoints.has(match[1])) {
    failures.push(`src/styles/layout/responsive.css: non-standard global breakpoint ${match[1]}px`);
  }
}

const layoutSource = await readFile(path.join(srcRoot, 'styles', 'layout', 'layout.css'), 'utf8');
const bootingAssistantRule = layoutSource.match(/\.legacy-shell-booting \.assistant\s*\{[^}]*\}/)?.[0] || '';
if (!/display:\s*none/.test(bootingAssistantRule)) {
  failures.push('src/styles/layout/layout.css: resident assistant must leave layout until legacy styles finish booting');
}
const bootingPageRule = layoutSource.match(/\.legacy-shell-booting \.page-section\s*\{[^}]*\}/)?.[0] || '';
if (!/visibility:\s*hidden/.test(bootingPageRule) || !/pointer-events:\s*none/.test(bootingPageRule)) {
  failures.push('src/styles/layout/layout.css: deferred page sections must not flash above the boot loading state');
}

const businessStylesPath = path.join(srcRoot, 'styles', 'pages', 'business-pages.css');
const businessStylesSource = await readFile(businessStylesPath, 'utf8');
if (businessStylesSource.includes('NEW DASHBOARD')) {
  failures.push('src/styles/pages/business-pages.css: contains dashboard styles that belong in business/dashboard.css');
}
if (/\.biz-dashboard(?:-|\b)/.test(businessStylesSource)) {
  failures.push('src/styles/pages/business-pages.css: contains duplicated dashboard selectors');
}

const sharedComponentsSource = await readFile(path.join(srcRoot, 'styles', 'components', 'components.css'), 'utf8');
const propertyAnalysisSource = await readFile(path.join(srcRoot, 'styles', 'pages', 'property-analysis.css'), 'utf8');
const spectrumAnalysisSource = await readFile(path.join(srcRoot, 'styles', 'pages', 'spectrum-analysis.css'), 'utf8');
const themeOverridesSource = await readFile(path.join(srcRoot, 'styles', 'pages', 'theme-overrides.css'), 'utf8');
if (!sharedComponentsSource.includes('.analysis-toolbar-btn')) {
  failures.push('src/styles/components/components.css: missing shared analysis toolbar button styles');
}
if (propertyAnalysisSource.includes('/* ===== Unified button system ===== */')) {
  failures.push('src/styles/pages/property-analysis.css: cross-page button styles must live in components.css');
}
const analysisSearchRule = propertyAnalysisSource.match(/\.analysis-search-lg\s*\{[\s\S]*?\}/)?.[0] || '';
const actionGroupButtonRule = propertyAnalysisSource.match(/\.analysis-filter-card \.analysis-action-group \.analysis-toolbar-btn,[\s\S]*?\{[\s\S]*?\}/)?.[0] || '';
if (!/height:\s*40px/.test(analysisSearchRule) || !/height:\s*40px/.test(actionGroupButtonRule)) {
  failures.push('src/styles/pages/property-analysis.css: first-row search and action controls must share a 40px height');
}
const analysisModeSwitchRule = propertyAnalysisSource.match(/\.analysis-search-mode\s*\{[^}]*\}/)?.[0] || '';
if (!/grid-template-columns:\s*repeat\(2/.test(analysisModeSwitchRule)
  || !/\.analysis-search-mode::before\s*\{/.test(propertyAnalysisSource)
  || !/\.analysis-search-mode:has\(\[data-search-mode="exact"\]\.is-active\)::before\s*\{[^}]*translateX/.test(propertyAnalysisSource)) {
  failures.push('src/styles/pages/property-analysis.css: query mode must use the same sliding segmented-control pattern as spectrum mode');
}
const propertyMobileMenuRules = propertyAnalysisSource.match(/@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\.analysis-action-menu\.is-open\s*\{[^}]*display:\s*grid/)?.[0] || '';
if (!/\.analysis-action-menu-toggle\s*\{[^}]*display:\s*inline-flex/.test(propertyMobileMenuRules)
  || !/\.analysis-action-menu\s*\{[^}]*display:\s*none/.test(propertyMobileMenuRules)) {
  failures.push('src/styles/pages/property-analysis.css: narrow action menu must be closed by default and expose its toggle');
}
const propertyPhoneRules = propertyAnalysisSource.match(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\/\* phone property toolbar end \*\//)?.[0] || '';
if (!/\.analysis-search-lg\s*\{[^}]*display:\s*grid/.test(propertyPhoneRules)
  || !/\.analysis-search-mode\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(propertyPhoneRules)
  || !/\.analysis-sheet-tabs\s*\{[^}]*scroll-snap-type:\s*x/.test(propertyPhoneRules)) {
  failures.push('src/styles/pages/property-analysis.css: phone toolbar must prioritize input and horizontally scroll categories');
}
if (!/\.analysis-filter-card\s*\{[^}]*gap:\s*8px/.test(propertyPhoneRules)
  || !/\.analysis-filter-top,\s*\.analysis-filter-bottom\s*\{[^}]*gap:\s*6px/.test(propertyPhoneRules)) {
  failures.push('src/styles/pages/property-analysis.css: phone toolbar vertical spacing must stay compact');
}
const hasTranslucentSelectedTableCells = (source) => /\.analysis-table tbody tr\.is-selected td\s*\{[^}]*background:\s*var\(--accent-soft\)/.test(source);
if (hasTranslucentSelectedTableCells(propertyAnalysisSource) || hasTranslucentSelectedTableCells(themeOverridesSource)) {
  failures.push('property analysis: sticky selected cells require an opaque background to prevent scroll-through text');
}
const firstTableColumnRule = propertyAnalysisSource.match(/\.analysis-table th:first-child,\s*\.analysis-table td:first-child\s*\{[^}]*\}/)?.[0] || '';
if (!/border-left:\s*1px solid var\(--border\)/.test(firstTableColumnRule)) {
  failures.push('src/styles/pages/property-analysis.css: sticky first table column must retain its left border');
}
const tableScrollRule = propertyAnalysisSource.match(/\.analysis-table-scroll\s*\{[^}]*\}/)?.[0] || '';
const secondStickyColumnRule = propertyAnalysisSource.match(/\.analysis-table th:nth-child\(2\),\s*\.analysis-table td:nth-child\(2\)\s*\{[^}]*\}/)?.[0] || '';
if (/border-top:/.test(tableScrollRule) || /box-shadow:/.test(secondStickyColumnRule)) {
  failures.push('src/styles/pages/property-analysis.css: table separators must use one uniform 1px border without stacked top or sticky-column effects');
}
const spectrumNarrowRules = spectrumAnalysisSource.match(/@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*?\/\* spectrum narrow layout end \*\//)?.[0] || '';
if (!/\.spectrum-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/.test(spectrumNarrowRules)
  || !/\.spectrum-filter-panel\s*\{[^}]*grid-row:\s*1/.test(spectrumNarrowRules)
  || !/\.spectrum-gallery-panel\s*\{[^}]*grid-row:\s*2/.test(spectrumNarrowRules)) {
  failures.push('src/styles/pages/spectrum-analysis.css: narrow workbench must stack filters above the gallery');
}
const spectrumCompactRules = spectrumAnalysisSource.match(/@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\/\* spectrum compact spacing end \*\//)?.[0] || '';
if (!/\.spectrum-toolbar-main,\s*\.spectrum-toolbar-actions\s*\{[^}]*gap:\s*8px/.test(spectrumCompactRules)
  || !/\.spectrum-tag-cloud\s*\{[^}]*gap:\s*8px/.test(spectrumCompactRules)
  || !/\.spectrum-page \.spectrum-filter-list\s*\{[^}]*gap:\s*8px[^}]*padding:\s*6px 8px/.test(spectrumCompactRules)
  || !/\.spectrum-page \.spectrum-filter-btn\s*\{[^}]*min-height:\s*30px/.test(spectrumCompactRules)
  || !/\.spectrum-page \.spectrum-selected-block\s*\{[^}]*padding:\s*6px 8px/.test(spectrumCompactRules)
  || !/\.spectrum-selected-actions\s*\{[^}]*gap:\s*8px/.test(spectrumCompactRules)) {
  failures.push('src/styles/pages/spectrum-analysis.css: phone category and selected rows must match the toolbar vertical density');
}
if (!/\.spectrum-page \.spectrum-view-switch\s*\{[^}]*height:\s*40px[^}]*padding:\s*3px/.test(spectrumCompactRules)
  || !/\.spectrum-page \.spectrum-view-switch::before\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/.test(spectrumCompactRules)
  || !/\.spectrum-page \.spectrum-icon-btn\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/.test(spectrumCompactRules)) {
  failures.push('src/styles/pages/spectrum-analysis.css: phone view switch must match the 40px spectrum search control height');
}

const sizeLimits = new Map([
  ['src/legacy/features/business-pages/index.ts', 365 * 1024],
  ['src/styles/pages/business-pages.css', 190 * 1024],
]);
for (const [relativePath, limit] of sizeLimits) {
  const fileStat = await stat(path.join(root, relativePath));
  if (fileStat.size > limit) failures.push(`${relativePath}: ${fileStat.size} bytes exceeds ${limit}`);
}

if (failures.length) {
  console.error('UI consistency check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`UI consistency check passed (${cssFiles.length} CSS files).`);
