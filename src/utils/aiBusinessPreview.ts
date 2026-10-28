import type { BusinessProposal } from '../services/business-actions';

type RecordValue = Record<string, unknown>;
type Cell = { value: unknown; changed?: boolean };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const labels: Record<string, string> = {
  date: '日期', name: '名称', batch: '批号', index: '序号', cupWeight: '杯重', materialWeight: '料重', residueWeight: '剩余重量', residueMaterialWeight: '剩余料重', content: '灰份含量',
  project: '客户/项目', type: '类型', target: '目标', additives: '助剂', customerApprovedRows: '客户认可的明细序号', title: '标题', code: '图谱编号', spectrumType: '图谱类型', category: '分类', tags: '标签', note: '备注', notes: '备注',
  model: '型号', metricKey: '指标字段', item: '指标', unit: '单位', range: '判定范围', fileName: '文件名', file_name: '文件名', file_size: '文件大小（字节）',
};
const fields: Record<string, string[]> = {
  ash_records: ['date', 'name', 'batch'],
  office_records: ['type', 'project', 'date', 'target', 'additives', 'customerApprovedRows'],
  spectrum_records: ['title', 'code', 'spectrumType', 'category', 'date', 'tags', 'note'],
  report_ranges: ['model', 'item', 'metricKey', 'unit', 'range'],
  inspection_reports: ['title', 'category', 'notes', 'file_name', 'fileName', 'file_size'],
};
const ashColumns = ['index', 'cupWeight', 'materialWeight', 'residueWeight', 'residueMaterialWeight', 'content'];
const fieldLabel = (key: string) => Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : key;

function valueHtml(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === '') return '<span class="ai-business-empty">—</span>';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value !== 'object') return escape(value);
  if (depth >= 8) return '内容层级过深，请重新准备简化后的明细';
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="ai-business-empty">—</span>';
    if (value.every((item) => item === null || typeof item !== 'object')) return value.map((item) => valueHtml(item, depth + 1)).join('、');
    return `<div class="ai-business-nested">${value.map((item, index) => `<div><span class="ai-business-subtitle">第 ${index + 1} 项</span>${valueHtml(item, depth + 1)}</div>`).join('')}</div>`;
  }
  return `<table class="ai-business-table is-fields"><tbody>${Object.entries(record(value)).map(([key, item]) => `<tr><th scope="row">${escape(fieldLabel(key))}</th><td>${valueHtml(item, depth + 1)}</td></tr>`).join('')}</tbody></table>`;
}

function table(title: string, columns: string[], rows: Cell[][], rowHeaders = false): string {
  const caption = ['记录信息', '坩埚明细'].includes(title) ? '' : `<caption>${escape(title)}</caption>`;
  return `<div class="ai-business-table-scroll" role="region" aria-label="${escape(title)}" tabindex="0"><table class="ai-business-table${rowHeaders ? ' is-fields' : ''}" aria-label="${escape(title)}">${caption}<thead><tr>${columns.map((name) => `<th scope="col">${escape(name)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((_, index) => {
    const cell = row[index] || { value: undefined };
    const tag = rowHeaders && index === 0 ? 'th' : 'td';
    return `<${tag}${tag === 'th' ? ' scope="row"' : ''}${cell.changed ? ' class="is-changed"' : ''}>${valueHtml(cell.value)}</${tag}>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const cells = (values: unknown[]): Cell[] => values.map((value) => ({ value }));
function display(dataset: string, key: string, value: unknown): unknown {
  if (dataset === 'office_records' && key === 'type') return ({ sampling: '送样记录', coloring: '配色记录' })[String(value)] || value;
  // Stored approval indexes are zero-based; the business table displays rows starting at 1.
  if (dataset === 'office_records' && key === 'customerApprovedRows' && Array.isArray(value)) return value.map((index) => typeof index === 'number' ? index + 1 : index);
  return value;
}
function visibleKeys(dataset: string, before: RecordValue, after: RecordValue): string[] {
  if (dataset === 'property_rows') return [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return (fields[dataset] || [...new Set([...Object.keys(before), ...Object.keys(after)])]).filter((key) => {
    if (key === 'fileName' && ('file_name' in before || 'file_name' in after)) return false;
    return key in before || key in after;
  });
}

function matrix(dataset: string, value: RecordValue): { columns: string[]; rows: unknown[][] } {
  if (dataset === 'ash_records') return {
    columns: ashColumns.map((key) => labels[key]),
    rows: (Array.isArray(value.rows) ? value.rows : []).map((row, index) => ashColumns.map((key) => key === 'index' ? record(row)[key] ?? index + 1 : record(row)[key])),
  };
  const columns = Array.isArray(value.tableColumns) ? value.tableColumns.map(String) : [];
  return { columns, rows: (Array.isArray(value.tableRows) ? value.tableRows : []).map((row) => Array.isArray(row) ? row : []) };
}
function renderMatrix(dataset: string, before: RecordValue, after: RecordValue, update: boolean, deleting: boolean): string {
  const title = dataset === 'ash_records' ? '坩埚明细' : '业务明细';
  const previous = matrix(dataset, before);
  const next = matrix(dataset, after);
  if (!update || same(previous, next)) {
    const selected = deleting ? previous : next;
    return selected.rows.length ? table(title, selected.columns, selected.rows.map(cells)) : `<p class="ai-business-empty">暂无${title}</p>`;
  }
  if (!same(previous.columns, next.columns)) {
    return table(`变更前${title}`, previous.columns, previous.rows.map(cells)) + table(`变更后${title}`, next.columns, next.rows.map(cells));
  }
  const rows: Cell[][] = [];
  for (let index = 0; index < Math.max(previous.rows.length, next.rows.length); index += 1) {
    const oldRow = previous.rows[index];
    const newRow = next.rows[index];
    const changed = !same(oldRow, newRow);
    if (!changed) {
      rows.push(cells(['未修改', ...(newRow || [])]));
      continue;
    }
    rows.push(cells([oldRow ? '变更前' : '变更前（无此行）', ...(oldRow || [])]));
    rows.push([{ value: newRow ? '变更后' : '变更后（删除此行）' }, ...next.columns.map((_, col) => ({ value: newRow?.[col], changed: !same(oldRow?.[col], newRow?.[col]) }))]);
  }
  return table(`${title} · 前后对照`, ['阶段', ...next.columns], rows, true);
}

/** Render only business data, never the raw proposal JSON / internal storage keys. */
export function renderBusinessPreview(proposal: BusinessProposal): string {
  const updating = proposal.operation === 'update';
  const deleting = proposal.operation === 'delete';
  if (!proposal.changes.length) return '<p class="ai-business-empty">暂无可核对的记录明细，请重新准备。</p>';
  return proposal.changes.map((change, index) => {
    const before = record(change.before);
    const after = record(change.after);
    const selected = deleting ? before : after;
    const keys = visibleKeys(proposal.dataset, before, after);
    const label = (key: string) => proposal.dataset === 'property_rows' ? key : fieldLabel(key);
    const shown = (key: string, data: RecordValue) => display(proposal.dataset, key, data[key]);
    const structured = proposal.dataset === 'ash_records' || proposal.dataset === 'office_records';
    const summaryKeys = structured ? keys.filter((key) => ['date', 'name', 'batch', 'type', 'project'].includes(key)) : [];
    let html = summaryKeys.length ? table('记录信息', summaryKeys.map(label), [cells(summaryKeys.map((key) => shown(key, selected)))]) : '';
    if (updating) {
      const changed = keys.filter((key) => !same(before[key], after[key]));
      html += changed.length ? table('字段变更对照', ['字段', '变更前', '变更后'], changed.map((key) => [
        { value: label(key) }, { value: shown(key, before) }, { value: shown(key, after), changed: true },
      ]), true) : '';
      if (!structured) {
        // Keep enough unchanged context to identify the exact record, including property rows.
        const unchanged = keys.filter((key) => !changed.includes(key));
        if (unchanged.length) html += table('未修改的记录信息', ['字段', '内容'], unchanged.map((key) => cells([label(key), shown(key, selected)])), true);
      }
    } else {
      const remaining = keys.filter((key) => !summaryKeys.includes(key));
      if (remaining.length) html += table(deleting ? '待删除记录' : '待新增记录', ['字段', '内容'], remaining.map((key) => cells([label(key), shown(key, selected)])), true);
    }
    if (structured) html += renderMatrix(proposal.dataset, before, after, updating, deleting);
    return `<article class="ai-business-record" data-ui-key="record-${escape(change.id)}"><h5>记录 ${index + 1}${deleting ? ' · 待删除' : ''}</h5>${html}</article>`;
  }).join('');
}
