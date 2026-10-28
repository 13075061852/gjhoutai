import type { BusinessProposal } from '../services/business-actions';
import { renderBusinessPreview } from './aiBusinessPreview';

const datasets: Record<string, [string, string]> = { ash_records: ['灰份记录', 'office-records'], office_records: ['办事记录', 'office-records'], spectrum_records: ['图谱记录', 'spectrum-analysis'], property_rows: ['物性记录', 'property-analysis'], report_ranges: ['报告判定范围', 'property-analysis'], inspection_reports: ['检测报告', 'inspection-reports'] };
export function parseBusinessProposal(value: unknown): BusinessProposal | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(v.id) || typeof v.threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v.threadId)) return null;
  if (typeof v.dataset !== 'string' || !Object.hasOwn(datasets, v.dataset) || !['create','update','delete'].includes(String(v.operation)) || !['pending','committed','cancelled','expired'].includes(String(v.status))) return null;
  if (typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt)) || !Array.isArray(v.changes) || !v.changes.length || v.changes.length > 50 || v.changes.some(c => !c || typeof c !== 'object' || typeof c.id !== 'string')) return null;
  const [label, pageId] = datasets[v.dataset];
  return { id: v.id, threadId: v.threadId, dataset: v.dataset, operation: v.operation as BusinessProposal['operation'], label, pageId, count: v.changes.length, expiresAt: v.expiresAt, status: v.status as BusinessProposal['status'], changes: v.changes as BusinessProposal['changes'] };
}
export function renderBusinessActions(proposals: BusinessProposal[], streaming: boolean): string {
  return proposals.map(p => {
    const expired = p.status === 'expired' || p.status === 'pending' && Date.parse(p.expiresAt) <= Date.now();
    const op = {create:'新增',update:'修改',delete:'删除'}[p.operation];
    const status = expired ? '已过期，请重新准备' : p.submitting ? '正在提交，请勿重复操作' : ({pending:'待确认，尚未写入',committed:'已提交',cancelled:'已取消',expired:'已过期'} as const)[p.status];
    return `<section class="ai-business-change" data-ui-key="business-${p.id}" aria-label="${op}${p.label}"><div class="ai-business-change-head"><strong>${op} ${p.label} · ${p.count} 条</strong><span role="status">${status}</span></div><details open><summary>核对变更明细</summary><div class="ai-business-preview">${renderBusinessPreview(p)}</div></details>${p.error ? `<p class="ai-business-change-error" role="alert">${p.status === 'committed' ? '数据已提交，但页面刷新失败，请重新加载页面。' : '提交未确认，请检查操作状态或重新准备。'}</p>` : ''}${p.status === 'pending' && !expired ? `<div class="ai-business-change-buttons"><button type="button" class="${p.operation === 'delete' ? 'is-danger' : 'is-primary'}" data-business-action="commit" data-business-id="${p.id}" ${streaming || p.submitting ? 'disabled' : ''}>确认${op}</button><button type="button" data-business-action="cancel" data-business-id="${p.id}" ${streaming || p.submitting ? 'disabled' : ''}>取消</button></div>` : ''}</section>`;
  }).join('');
}
