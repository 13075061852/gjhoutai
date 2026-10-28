// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderBusinessPreview } from './aiBusinessPreview';
import type { BusinessProposal } from '../services/business-actions';

const ash = { date: '2026-10-13', name: '道达尔余姚', batch: '', rows: [
  { index: '1', cupWeight: '30.681', materialWeight: '2.000', residueWeight: '31.181', residueMaterialWeight: '0.500', content: '25%' },
  { index: '2', cupWeight: '30', materialWeight: '2', residueWeight: '30', residueMaterialWeight: '0', content: '0%' },
], id: 'ASH-internal-id', updatedAt: 'INTERNAL_TIMESTAMP' };
function render(dataset = 'ash_records', operation: BusinessProposal['operation'] = 'create', before: unknown = null, after: unknown = ash) {
  const proposal: BusinessProposal = { id: 'p1', threadId: 't1', dataset, operation, label: '测试', count: 1, status: 'pending', pageId: 'office-records', expiresAt: '2030-01-01', changes: [{ id: 'internal-id', before, after }] };
  const root = document.createElement('div');
  root.innerHTML = renderBusinessPreview(proposal);
  return root;
}
describe('AI business confirmation tables', () => {
  it('灰份分为记录信息与逐坩埚表格，保持原始精度和零值，不暴露内部JSON', () => {
    const root = render();
    const tables = root.querySelectorAll('table');
    expect(tables).toHaveLength(2);
    expect(root.querySelector('caption')).toBeNull();
    expect(tables[0].getAttribute('aria-label')).toBe('记录信息');
    expect(tables[1].getAttribute('aria-label')).toBe('坩埚明细');
    expect([...tables[0].querySelectorAll('thead th')].map(x => x.textContent)).toEqual(['日期', '名称', '批号']);
    expect(tables[0].textContent).toContain('2026-10-13');
    expect(tables[0].textContent).toContain('道达尔余姚');
    expect([...tables[1].querySelectorAll('thead th')].map(x => x.textContent)).toEqual(['序号', '杯重', '料重', '剩余重量', '剩余料重', '灰份含量']);
    expect(tables[1].querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).toContain('2.000');
    expect(root.textContent).toContain('0.500');
    expect(root.textContent).toContain('0%');
    expect(root.textContent).not.toMatch(/ASH-internal-id|INTERNAL_TIMESTAMP|cupWeight|\{|\}/);
    expect(root.querySelector('pre')).toBeNull();
    expect(root.querySelector('.ai-business-table-scroll')?.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('th')?.getAttribute('scope')).toBe('col');
  });
  it('同批多记录单独分组，不混淆日期和明细', () => {
    const proposal = { dataset: 'ash_records', operation: 'create', changes: [
      { id: '1', before: null, after: ash }, { id: '2', before: null, after: { ...ash, date: '2026-10-10', name: '另一材料' } },
    ] } as BusinessProposal;
    const root = document.createElement('div'); root.innerHTML = renderBusinessPreview(proposal);
    expect(root.querySelectorAll('.ai-business-record')).toHaveLength(2);
    expect(root.querySelectorAll('.ai-business-record')[0].textContent).toContain('2026-10-13');
    expect(root.querySelectorAll('.ai-business-record')[1].textContent).toContain('2026-10-10');
  });
  it('修改灰份按字段和逐行前后对照，并标记变动值', () => {
    const next = { ...ash, name: '新名称', rows: [{ ...ash.rows[0], content: '26%' }, ash.rows[1]] };
    const root = render('ash_records', 'update', ash, next);
    expect(root.textContent).toContain('字段变更对照');
    expect(root.textContent).toContain('坩埚明细 · 前后对照');
    expect(root.textContent).toContain('未修改');
    expect(root.textContent).toContain('变更前');
    expect(root.textContent).toContain('变更后');
    expect([...root.querySelectorAll('.is-changed')].map(x => x.textContent)).toContain('26%');
    expect(root.textContent).toContain('25%');
  });
  it('增减明细行明确提示，不把删除后的空值误当成零', () => {
    const root = render('ash_records', 'update', ash, { ...ash, rows: [] });
    expect(root.textContent).toContain('删除此行');
    expect(root.querySelectorAll('.is-changed')).toHaveLength(12);
    const added = render('ash_records', 'update', { ...ash, rows: [] }, ash);
    expect(added.textContent).toContain('无此行');
  });
  it('删除使用变更前的完整业务明细，不能只展示null', () => {
    const root = render('ash_records', 'delete', ash, null);
    expect(root.textContent).toContain('待删除');
    expect(root.textContent).toContain('道达尔余姚');
    expect(root.textContent).toContain('30.681');
    expect(root.textContent).not.toContain('null');
  });
  it('送样配色使用原业务表头与列值，认可序号从1开始展示', () => {
    const data = { type: 'coloring', project: '客户A', date: '2026-10-13', tableColumns: ['编号', '型号', '重量'], tableRows: [['1', 'PBT', '0']], customerApprovedRows: [0], target: { 灰份: '25%' } };
    const root = render('office_records', 'create', null, data);
    expect(root.textContent).toContain('配色记录');
    expect(root.textContent).toContain('客户A');
    expect(root.textContent).toContain('客户认可的明细序号1');
    const table = [...root.querySelectorAll('table')].find(x => x.querySelector('caption')?.textContent === '业务明细')!;
    expect([...table.querySelectorAll('thead th')].map(x => x.textContent)).toEqual(data.tableColumns);
    expect([...table.querySelectorAll('tbody td')].map(x => x.textContent)).toEqual(data.tableRows[0]);
    const changed = render('office_records', 'update', data, { ...data, tableColumns: ['编号', '新列'], tableRows: [['1', '新值']] });
    expect(changed.textContent).toContain('变更前业务明细');
    expect(changed.textContent).toContain('变更后业务明细');
  });
  it.each([
    ['spectrum_records', { title: 'DSC谱图', code: 'D001', spectrumType: 'DSC', tags: ['PBT', '测试'], imageVersion: 'SECRET_VERSION', imageStored: true }, '图谱编号D001'],
    ['inspection_reports', { title: '报告A', file_name: '报告.pdf', fileName: '报告.pdf', file_size: 1024, file_key: 'PRIVATE_FILE_KEY', created_by: 'SECRET_OWNER' }, '文件名报告.pdf'],
    ['report_ranges', { model: 'PBT', metricKey: 'gray', item: '灰份', range: '23~27', unit: '%' }, '判定范围23~27'],
    ['property_rows', { 型号: 'PBT', 批次: 'B01', 灰份: [0, 25.5], '用户自定义列': '说明' }, '灰份0、25.5'],
  ])('%s 也使用表格，不泄漏存储/账户元数据', (dataset, data, expected) => {
    const root = render(dataset, 'create', null, data);
    expect(root.querySelector('table')).not.toBeNull();
    expect(root.textContent).toContain(expected);
    expect(root.textContent).not.toMatch(/SECRET_|PRIVATE_FILE_KEY|imageVersion|file_key/);
  });
  it('物性修改保留定位信息，仅变更项出现在前后对照中', () => {
    const root = render('property_rows', 'update', { 型号: 'PBT', 批号: 'B1', 灰份: 25 }, { 型号: 'PBT', 批号: 'B1', 灰份: 26 });
    const table = root.querySelector('table')!;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table.textContent).toContain('灰份2526');
    expect(root.textContent).toContain('批号B1');
    expect(root.textContent).toContain('型号PBT');
  });
  it('文本、动态表头、嵌套值均转义，不把业务内容解释为HTML', () => {
    const root = render('office_records', 'create', null, { project: '<img src=x onerror=alert(1)>', target: { '<script>': '<svg onload=alert(1)>' }, tableColumns: ['<img src=x>'], tableRows: [['<script>alert(1)</script>']] });
    expect(root.querySelector('img,script,svg')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.textContent).toContain('<script>alert(1)</script>');
  });
});
