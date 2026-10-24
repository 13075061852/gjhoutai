/** Presentation only: page IDs and action IDs remain the legacy event contracts. */
const groups = [
  { label: '研究与检测', index: '01', pages: [
    ['property-analysis', '物性分析', 'flask'],
    ['spectrum-analysis', '图谱分析', 'chart-line'],
    ['inspection-reports', '检测报告', 'file-search'],
    ['ai-analysis', 'AI 分析', 'brain'],
  ] },
  { label: '业务协作', index: '02', pages: [['office-records', '办事记录', 'clipboard-list']] },
  { label: '工作区设置', index: '03', pages: [
    ['ai-config', '配置中心', 'settings'],
    ['theme-settings', '主题设置', 'palette'],
  ] },
];

export const workspaceSidebarMarkup = `
<aside class="sidebar" aria-label="主导航">
  <div class="sidebar-top">
    <div class="brand">
      <div class="brand-badge"><img src="${String(import.meta.env.BASE_URL || '/')}logo.webp" alt="广俊塑料科技"></div>
      <div class="brand-title">广俊塑料科技<small>GJUN · WORKSPACE</small></div>
    </div>
  </div>
  <nav class="sidebar-scroll" aria-label="工作区模块">
    ${groups.map((group) => `<div class="sidebar-section sidebar-section-flat">
      ${group.pages.map(([page, label, icon]) => `<button class="nav-item" type="button" ${page === 'ai-config' ? 'id="aiConfigNav"' : ''} data-page="${page}" data-label="${label}" aria-label="${label}" title="${label}">
        <span class="nav-main"><span class="nav-icon"><i class="ti ti-${icon}" aria-hidden="true"></i></span><span class="nav-text">${label}</span></span>
      </button>`).join('')}
    </div>`).join('')}
    <div class="sidebar-mobile-actions" data-sidebar-mobile-actions></div>
  </nav>
  <div class="sidebar-footer">
    <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-expanded="true" aria-label="收起侧边栏"><span class="toggle-icon"><i class="ti ti-chevron-left" aria-hidden="true"></i></span><span class="sidebar-toggle-label">收起导航</span></button>
  </div>
</aside>`;

export const workspaceTopbarMarkup = `
<header class="topbar">
  <button class="mobile-menu-btn" id="mobileMenuBtn" type="button" aria-label="打开导航菜单" aria-expanded="false"><i class="ti ti-menu-2" aria-hidden="true"></i></button>
  <div class="workspace-location"><span>工作空间</span><i class="ti ti-chevron-right" aria-hidden="true"></i><strong id="workspaceBreadcrumb">物性分析</strong></div>
  <div class="top-visited" id="topVisitedPages" aria-label="最近访问"></div>
  <div class="top-actions">
    <button class="icon-btn" type="button" aria-label="账户"><i class="ti ti-user" aria-hidden="true"></i></button>
  </div>
</header>`;
