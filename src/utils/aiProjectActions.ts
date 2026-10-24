export type AiProjectAction = {
  id: string; threadId: string; project: 'kingpolymer' | 'guangjun'; name: string; path: string;
  operation: 'start' | 'stop'; status: 'pending' | 'executing' | 'completed' | 'cancelled' | 'expired' | 'conflict' | 'unknown'; expiresAt: string;
  submitting?: boolean; error?: string;
};
export function parseAiProjectAction(value: unknown): AiProjectAction | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !/^[a-f0-9-]{36}$/.test(v.id) || typeof v.threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v.threadId)) return null;
  if (!['kingpolymer','guangjun'].includes(String(v.project)) || !['start','stop'].includes(String(v.operation)) || !['pending','executing','completed','cancelled','expired','conflict','unknown'].includes(String(v.status))) return null;
  if (typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt))) return null;
  return { id: v.id, threadId: v.threadId, project: v.project as AiProjectAction['project'], operation: v.operation as AiProjectAction['operation'], status: v.status as AiProjectAction['status'], expiresAt: v.expiresAt, name: v.project === 'kingpolymer' ? '双螺杆配置系统' : '广俊官网及管理后台', path: v.project === 'kingpolymer' ? '/' : '/web/' };
}
export function renderAiProjectActions(actions: AiProjectAction[], streaming: boolean): string {
  return actions.map(a => {
    const expired = a.status === 'expired' || a.status === 'pending' && Date.parse(a.expiresAt) <= Date.now();
    const label = a.operation === 'stop' ? '关闭' : '启动';
    const status = expired ? '已过期，请重新准备' : a.submitting ? '正在提交，请勿重复操作' : ({pending:'待确认，尚未执行', executing:'正在执行，请查询状态', completed:'服务操作已完成',cancelled:'已取消',conflict:'服务状态已变化，请重新查询并准备',unknown:'执行结果未确认，请先查询实际状态'} as Record<string,string>)[a.status];
    // Every non-label field used in markup has been strictly validated by parseAiProjectAction.
    return `<section class="ai-business-change" data-ui-key="${a.id}" aria-label="${label}${a.name}"><div class="ai-business-change-head"><strong>${label} ${a.name}（${a.path}）</strong><span role="status">${status}</span></div><p>仅改变此项目的服务运行状态，不编辑代码、配置或数据。${a.operation === 'stop' ? '关闭后该站点将暂时无法访问。' : ''}</p>${a.error ? '<p role="alert">提交失败或确认已失效，请查询实际状态后重新准备。</p>' : ''}${a.status === 'pending' && !expired ? `<div class="ai-business-change-buttons"><button type="button" data-project-action="confirm" data-project-action-id="${a.id}" class="${a.operation === 'stop' ? 'is-danger' : 'is-primary'}" ${streaming || a.submitting ? 'disabled' : ''}>确认${label}</button><button type="button" data-project-action="cancel" data-project-action-id="${a.id}" ${streaming || a.submitting ? 'disabled' : ''}>取消</button></div>` : ''}</section>`;
  }).join('');
}
