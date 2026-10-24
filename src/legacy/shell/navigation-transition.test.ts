// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), ready: vi.fn(), preload: vi.fn(), paint: vi.fn(),
}));
vi.mock('../bootstrap/feature-loader', () => ({
  ensureLegacyPageFeature: mocks.load,
  isLegacyPageFeatureReady: mocks.ready,
  getLegacyPageFeature: (id: string) => id === 'office-records' ? 'officeRecords' : id,
  preloadLegacyPageFeature: mocks.preload,
}));
vi.mock('../../services/cloud-sync', () => ({ setCloudBackedLocalStorageItem: vi.fn() }));
vi.mock('../../utils/pageLoading', async (original) => ({ ...await original<object>(), afterPagePaint: mocks.paint }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let app: any;
const pages = ['property-analysis', 'spectrum-analysis', 'inspection-reports', 'ai-analysis', 'ai-config', 'theme-settings', 'office-records'];
const titles = ['物性分析', '图谱分析', '检测报告', 'AI 分析', '配置中心', '主题设置', '办事记录'];
const section = (id: string) => document.querySelector(`[data-page-section="${id}"]`)!;
const content = () => document.querySelector<HTMLElement>('.content')!;
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = `<div class="app"><div class="shell"><nav>${pages.map((page, i) => `<button data-page="${page}"><span class="nav-text">${titles[i]}</span></button>`).join('')}</nav><header><strong id="workspaceBreadcrumb"></strong><div id="topVisitedPages"></div></header><div class="content">${pages.filter((id) => id !== 'office-records').map((id) => `<section class="page-section" data-page-section="${id}">页面</section>`).join('')}<section class="page-section" data-page-section="placeholder"><div id="businessPageContent"></div></section></div></div></div>`;
  const refs: any = {
    shell: document.querySelector('.shell'), topVisitedPages: document.getElementById('topVisitedPages'),
    navPageButtons: document.querySelectorAll('[data-page]'), placeholderPageSection: section('placeholder'),
    businessPageContent: document.getElementById('businessPageContent'),
  };
  for (const [key, id] of Object.entries({ aiPageSection: 'ai-config', aiAnalysisPageSection: 'ai-analysis', propertyAnalysisPageSection: 'property-analysis', spectrumAnalysisPageSection: 'spectrum-analysis', inspectionReportsPageSection: 'inspection-reports', themeSettingsPageSection: 'theme-settings' })) refs[key] = section(id);
  app = {
    refs, constants: { PAGE_DEFS: Object.fromEntries(pages.map((id, i) => [id, { title: titles[i] }])), NAV_PAGE_KEY: 'sidebar-active-page', NAV_RECENT_PAGES_KEY: 'sidebar-recent-pages' },
    propertyAnalysis: { ensureLoaded: vi.fn() },
    officeRecords: { render: vi.fn(() => { refs.businessPageContent.innerHTML = '<article>办事记录</article>'; }) },
  };
  window.GJHApp = app;
  (window as any).App = {};
  mocks.load.mockResolvedValue(undefined);
  mocks.ready.mockReturnValue(false);
  mocks.paint.mockResolvedValue(undefined);
  await import('./navigation');
});
afterEach(() => { app.navigation?.cleanup(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('responsive page navigation', () => {
  it('updates the destination immediately, paints loading before init, and waits for the actual data', async () => {
    const pending = deferred();
    mocks.load.mockReturnValue(pending.promise);
    section('ai-analysis').classList.add('active');
    content().scrollTop = 480;
    const navigating = app.navigation.showPage('spectrum-analysis');
    expect(document.title).toContain('图谱分析');
    expect(document.querySelector('[data-page="spectrum-analysis"]')?.getAttribute('aria-current')).toBe('page');
    expect(section('spectrum-analysis').classList.contains('active')).toBe(true);
    expect(section('ai-analysis').classList.contains('active')).toBe(false);
    expect(content().scrollTop).toBe(0);
    expect(content().getAttribute('aria-busy')).toBe('true');
    expect(content().querySelector('[role="status"]')?.textContent).toContain('正在加载图谱分析');
    expect(mocks.load).not.toHaveBeenCalled();
    await flush();
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(content().classList.contains('is-page-loading')).toBe(true);
    pending.resolve();
    await navigating;
    expect(content().querySelector('.page-transition-state')).toBeNull();
    expect(content().hasAttribute('aria-busy')).toBe(false);
    expect((section('spectrum-analysis') as HTMLElement).inert).toBe(false);
  });

  it('shows an already-ready page synchronously without a spinner or another init', async () => {
    mocks.ready.mockReturnValue(true);
    const navigating = app.navigation.showPage('ai-analysis');
    expect(section('ai-analysis').classList.contains('active')).toBe(true);
    expect(content().classList.contains('is-page-loading')).toBe(false);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.paint).not.toHaveBeenCalled();
    await navigating;
  });

  it('ignores a slower old page after a newer page is selected', async () => {
    const pending = deferred();
    mocks.load.mockReturnValue(pending.promise);
    const first = app.navigation.showPage('spectrum-analysis');
    await flush();
    mocks.ready.mockReturnValue(true);
    await app.navigation.showPage('ai-analysis');
    pending.resolve();
    await first;
    expect(section('ai-analysis').classList.contains('active')).toBe(true);
    expect(document.title).toContain('AI 分析');
    expect(content().classList.contains('is-page-loading')).toBe(false);
  });

  it('does not let an old completion dismiss the newer loading state', async () => {
    const old = deferred(), next = deferred();
    mocks.load.mockImplementation((id: string) => id === 'spectrum-analysis' ? old.promise : next.promise);
    const first = app.navigation.showPage('spectrum-analysis');
    await flush();
    const second = app.navigation.showPage('ai-config');
    await flush();
    old.resolve();
    await first;
    expect(content().querySelector('[role="status"]')?.textContent).toContain('正在加载配置中心');
    expect(content().getAttribute('aria-busy')).toBe('true');
    next.resolve();
    await second;
    expect(content().classList.contains('is-page-loading')).toBe(false);
  });

  it('shows a retryable error instead of a permanent spinner or unhandled rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.load.mockRejectedValueOnce(new Error('offline'));
    await app.navigation.showPage('spectrum-analysis');
    const error = content().querySelector('[role="alert"]')!;
    expect(error.textContent).toContain('图谱分析暂时无法加载');
    expect(content().getAttribute('aria-busy')).toBe('false');
    error.querySelector('button')!.click();
    await flush();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(content().querySelector('.page-transition-state')).toBeNull();
  });

  it('keeps warm office DOM and unsaved inputs rather than rendering it again on every visit', async () => {
    await app.navigation.showPage('office-records');
    const input = document.createElement('input');
    input.value = '未提交草稿';
    app.refs.businessPageContent.appendChild(input);
    mocks.ready.mockReturnValue(true);
    await app.navigation.showPage('ai-analysis');
    mocks.paint.mockClear();
    await app.navigation.showPage('office-records');
    expect(app.officeRecords.render).toHaveBeenCalledOnce();
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('未提交草稿');
    expect(mocks.paint).not.toHaveBeenCalled();
  });

  it('cancels pending navigation on shell cleanup without leaving inert pages', async () => {
    const pending = deferred();
    mocks.load.mockReturnValue(pending.promise);
    const navigating = app.navigation.showPage('spectrum-analysis');
    await flush();
    app.navigation.cleanup();
    pending.resolve();
    await navigating;
    expect(content().querySelector('.page-transition-state')).toBeNull();
    expect(content().hasAttribute('aria-busy')).toBe(false);
    expect([...content().querySelectorAll<HTMLElement>('.page-section')].every((page) => !page.inert)).toBe(true);
  });
});
