/** Fixed-project broker client and separate browser-confirmed lifecycle operations. */
import net from 'node:net';
import { randomUUID } from 'node:crypto';
export const PROJECTS = Object.freeze({ kingpolymer: { name: '双螺杆配置系统', path: '/', lifecycle: true }, guangjun: { name: '广俊官网及管理后台', path: '/web/', lifecycle: true }, gjhoutai: { name: '塑料粒子测试分析平台', path: '/gjhoutai/', lifecycle: false } });
export const isProjectAdmin = user => {
  // Some historical research accounts used role=system_admin; an explicit
  // department is authoritative and must not inherit those old privileges.
  const department = typeof user?.department === 'string' ? user.department.trim() : '';
  return department ? department === '系统管理员' : user?.role === 'system_admin';
};
const fail = (status, message) => Object.assign(new Error(message), { status });
export function callProjectBroker(request, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(fail(499, '操作已停止'));
    const socket = net.createConnection({ path: '/run/gjhoutai-projects/control.sock' });
    const chunks = []; let length = 0, settled = false;
    const cleanup = () => { signal?.removeEventListener('abort', abort); socket.destroy(); };
    const finish = (error, value) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(value); };
    const abort = () => finish(fail(499, '操作已停止'));
    signal?.addEventListener('abort', abort, { once: true });
    socket.setTimeout(45_000, () => finish(fail(504, '项目工具超时，请先查询实际状态，不要重复操作')));
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', chunk => { length += chunk.length; if (length > 512 * 1024) return finish(fail(502, '项目结果超过大小限制')); chunks.push(chunk); });
    socket.on('error', () => finish(fail(503, '项目只读/启停代理不可用，不能推测服务器状态')));
    socket.on('end', () => {
      try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result.ok) return finish(fail(403, '项目操作被拒绝：' + String(result.error).slice(0, 120))); finish(null, result.result); }
      catch { finish(fail(502, '项目代理响应无效')); }
    });
  });
}
export function createProjectAccess({ broker = callProjectBroker, now = Date.now } = {}) {
  const actions = new Map(), busy = new Set();
  const requireAdmin = user => { if (!isProjectAdmin(user)) throw fail(403, '仅系统管理员可查询服务器项目和确认启停'); };
  const requireProject = id => { if (!Object.hasOwn(PROJECTS, id)) throw fail(403, '不在三个项目白名单内'); return PROJECTS[id]; };
  const publicAction = a => ({ id: a.id, threadId: a.threadId, project: a.project, name: PROJECTS[a.project].name, path: PROJECTS[a.project].path, operation: a.operation, status: a.status, expiresAt: a.expiresAt, result: a.result });
  const prune = () => { for (const [id, a] of actions) if (now() - a.createdAt > 60 * 60_000) actions.delete(id); };
  return {
    async read(user, request, signal) {
      requireAdmin(user);
      if (!['inventory', 'status', 'tree', 'read'].includes(request.operation)) throw fail(403, '只允许读取');
      if (request.operation !== 'inventory') requireProject(request.project);
      return broker(request, { signal });
    },
    async prepare(user, threadId, project, operation) {
      requireAdmin(user); const p = requireProject(project);
      if (!p.lifecycle || !['start','stop'].includes(operation)) throw fail(403, '此项目/操作无启停权限；不允许重启或关闭后台');
      if (typeof threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(threadId)) throw fail(400, '无效会话标识');
      prune();
      for (const a of actions.values()) if (a.userId === user.id && a.threadId === threadId && a.project === project && a.operation === operation && a.status === 'pending' && Date.parse(a.expiresAt) > now()) return publicAction(a);
      if (actions.size >= 500) throw fail(429, '待确认操作过多');
      const before = await broker({ operation: 'status', project });
      const a = { id: randomUUID(), userId: user.id, threadId, project, operation, status: 'pending', createdAt: now(), expiresAt: new Date(now() + 5 * 60_000).toISOString(), before };
      actions.set(a.id, a); return publicAction(a);
    },
    async submit(user, id, threadId, operation) {
      requireAdmin(user); const a = actions.get(id);
      if (!a || a.userId !== user.id || a.threadId !== threadId) throw fail(404, '确认操作不存在或代理重启后已失效，请重新准备');
      if (!['confirm','cancel'].includes(operation)) throw fail(400, '无效确认操作');
      if (a.status !== 'pending') return publicAction(a);
      if (Date.parse(a.expiresAt) <= now()) { a.status = 'expired'; return publicAction(a); }
      if (operation === 'cancel') { a.status = 'cancelled'; return publicAction(a); }
      if (busy.has(a.project)) throw fail(409, '同项目正在启停，请稍后先查状态');
      a.status = 'executing'; busy.add(a.project);
      try {
        const current = await broker({ operation: 'status', project: a.project });
        if (current.status?.ActiveState !== a.before.status?.ActiveState || current.status?.MainPID !== a.before.status?.MainPID) { a.status = 'conflict'; return publicAction(a); }
        a.result = await broker({ operation: a.operation, project: a.project, actor: String(user.id), actionId: a.id });
        a.status = 'completed';
      } catch { a.status = 'unknown'; /* Never retry an ambiguous lifecycle operation automatically. */ }
      finally { busy.delete(a.project); }
      return publicAction(a);
    },
  };
}
export const projectAccess = createProjectAccess();
