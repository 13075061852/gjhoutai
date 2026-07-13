import { describe, expect, it } from 'vitest';
import { createArchiveRenderer } from './archive-page';

describe('createArchiveRenderer', () => {
  it('renders customer archives with shared table and dialog primitives', () => {
    const config = {
      title: '客户档案', icon: 'ti-users', columns: ['编号', '名称', '联系人', '电话', '邮箱', '分类', '状态', '操作'],
      statuses: ['正常'], categories: ['重点'], searchPlaceholder: '搜索客户', searchLabel: '搜索客户',
      filterLabel: '分类', filterAllLabel: '全部分类', addText: '新增客户', entityName: '客户', emptyText: '暂无客户',
      codeLabel: '客户编号', codePrefix: 'CUS-', nameLabel: '客户名称', namePlaceholder: '请输入客户名称', categoryLabel: '分类', statusLabel: '状态',
    };
    const state = { rows: [], filter: '全部', statusFilter: '全部', search: '', page: 1, pageSize: 10, editingCode: '', modalOpen: false, draftNote: '' };
    const renderArchive = createArchiveRenderer({
      archiveConfigs: { customer: config }, archiveStates: { customer: state },
      getArchiveCategories: () => ['重点'], getArchiveByCode: () => null, getAuthUserForRecord: () => null,
      normalizeArchiveRecord: (_config: unknown, value: unknown) => value, getNextArchiveCode: () => 'CUS-001',
      renderSearchBox: () => '<label></label>', renderOptions: () => '', getArchiveStatusClass: () => 'is-active',
      formulaPageSizeOptions: [10], esc: String,
    });
    const html = renderArchive('customer');
    expect(html).toContain('客户档案');
    expect(html).toContain('ui-table');
    expect(html).toContain('biz-archive-table-panel');
    expect(html).toContain('biz-archive-table is-empty');
  });
});
