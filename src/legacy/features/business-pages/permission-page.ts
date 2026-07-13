type PermissionPageItem = { id: string; title: string; eyebrow: string };

type PermissionPageContext = {
  esc: (value: unknown) => string;
  pages: PermissionPageItem[];
  departments: string[];
  activeDepartment: string;
  activePermissionKey: string;
  getMemberCount: (department: string) => number;
  canView: (pageId: string) => boolean;
  canEdit: (pageId: string) => boolean;
  apiPermissionCount: number;
};

export const renderPermissionPage = ({
  esc,
  pages,
  departments,
  activeDepartment,
  activePermissionKey,
  getMemberCount,
  canView,
  canEdit,
  apiPermissionCount,
}: PermissionPageContext) => {
  const visiblePageCount = pages.filter((page) => canView(page.id)).length;
  const editablePageCount = pages.filter((page) => canEdit(page.id)).length;
  const memberCount = getMemberCount(activeDepartment);
  const renderToggle = (pageId: string, field: string, enabled: boolean, label: string, mutedLabel = '关闭') => (
    `<button class="ui-button ui-button--sm biz-permission-toggle ${enabled ? 'on' : ''}" type="button" data-permission-toggle="${esc(field)}" data-permission-page="${esc(pageId)}" data-permission-enabled="${enabled ? 'true' : 'false'}" aria-pressed="${enabled ? 'true' : 'false'}">${esc(enabled ? label : mutedLabel)}</button>`
  );
  const getScope = (pageId: string) => {
    if (!canView(pageId)) return '不可见';
    if (activeDepartment === '系统管理员') return '全项目';
    if (/detail|archive|management|plan|procurement|stock|invoice/.test(pageId)) return '本角色业务域';
    return '当前页面数据';
  };

  return `
    <section class="biz-permission-layout">
      <aside class="ui-panel business-panel biz-role-list">
        <div class="ui-toolbar business-panel-head"><h2>部门</h2><span>${departments.length} 个</span></div>
        ${departments.map((department) => `
          <button class="ui-button biz-role-card ${department === activeDepartment ? 'is-active' : ''}" type="button" data-permission-department="${esc(department)}">
            <span><strong>${esc(department)}</strong><em>按部门授权</em></span>
            <b>${getMemberCount(department)}</b>
          </button>
        `).join('')}
      </aside>
      <article class="ui-panel business-panel biz-permission-matrix">
        <div class="ui-toolbar business-panel-head">
          <h2>${esc(activeDepartment)}</h2>
          <span>${visiblePageCount} / ${pages.length} 个页面可见</span>
          <button class="ui-button ui-button--sm biz-permission-reset-btn" type="button" data-permission-reset-key="${esc(activePermissionKey)}">恢复默认</button>
        </div>
        <div class="biz-permission-summary">
          <article><strong>${visiblePageCount}</strong><span>可见页面</span></article>
          <article><strong>${editablePageCount}</strong><span>可编辑页面</span></article>
          <article><strong>${apiPermissionCount}</strong><span>后端能力</span></article>
          <article><strong>${memberCount}</strong><span>关联人员</span></article>
        </div>
        <div class="biz-permission-table" role="table" aria-label="页面权限矩阵">
          <div class="biz-permission-row biz-permission-row-head" role="row">
            <strong>项目页面</strong><span>查看</span><span>编辑</span><span>数据范围</span>
          </div>
          ${pages.map((page) => {
            const viewEnabled = canView(page.id);
            return `
              <div class="biz-permission-row" role="row">
                <strong><small>${esc(page.eyebrow)}</small>${esc(page.title)}</strong>
                ${renderToggle(page.id, 'view', viewEnabled, '可见')}
                ${renderToggle(page.id, 'edit', canEdit(page.id), '可编辑', '只读')}
                <span class="${viewEnabled ? 'on' : ''}">${esc(getScope(page.id))}</span>
              </div>
            `;
          }).join('')}
        </div>
      </article>
    </section>
  `;
};
