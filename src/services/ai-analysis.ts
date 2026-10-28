/**
 * AI 分析（服务端 pi 内核）客户端。
 *
 * 浏览器只负责「发问题 + 订阅事件流 + 渲染」：
 * 模型密钥、系统提示、数据取数全部在服务端完成，
 * 这里通过 SSE（fetch 流式读取）拿到增量事件。
 */
import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../utils/fetch';
import { parseAiProjectAction, type AiProjectAction } from '../utils/aiProjectActions';
import type { BusinessProposal } from './business-actions';

const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');
const buildUrl = (path: string) => `${API_BASE}${path}`;

/**
 * 把服务端返回的「站点根相对路径」（`/gjhoutai/api/...`）解析成当前环境真实可访问的地址。
 * 生产环境 API 基址就是 `/gjhoutai`（同源），保持原样；
 * 本地开发时 API 基址是绝对地址，需把 `/gjhoutai` 前缀换成该基址，否则图片/文件会打到开发服务器。
 */
export const createPlatformUrlResolver = (apiBase: string) => (value: string): string => {
  const url = String(value ?? '').trim();
  if (!url || !url.startsWith('/')) return url;
  const base = String(apiBase || '').replace(/\/+$/, '');
  if (!base || base.startsWith('/')) return url;
  let prefix = '';
  try { prefix = new URL(base).pathname.replace(/\/+$/, ''); } catch { return url; }
  if (!prefix) return url;
  return url === prefix || url.startsWith(`${prefix}/`) ? `${base}${url.slice(prefix.length)}` : url;
};

/** 当前环境的解析器：AI 回答里的图片、文件、附件地址都用它。 */
export const resolveAiAssetUrl = createPlatformUrlResolver(API_BASE);

export type AiUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  totalTokens?: number;
  cost?: { input?: number; output?: number; total?: number };
};

export type AiSpectrumType = 'DSC' | 'TGA' | 'FTIR';
export type AiSpectrumGallery = {
  mode: 'one_per_type';
  scopeKey: string;
  query: { keyword: string; category: string; tag: string };
  entries: Array<{ id: string; title: string; date: string; registeredType: AiSpectrumType; typeVerified: false; imageUrl: string }>;
  requestedTypes: AiSpectrumType[];
  missingTypes: AiSpectrumType[];
};

export type AiRunEvent =
  | { seq: number; at: number; type: 'start'; runId: string; threadKey: string }
  | { seq: number; at: number; type: 'text'; delta: string; flush?: boolean }
  | { seq: number; at: number; type: 'thinking'; delta: string }
  | { seq: number; at: number; type: 'tool_start'; toolCallId: string; name: string; args: unknown }
  | { seq: number; at: number; type: 'tool_end'; toolCallId: string; name: string; isError: boolean; result?: string; spectrumGallery?: AiSpectrumGallery; projectAction?: AiProjectAction; proposal?: BusinessProposal }
  | { seq: number; at: number; type: 'usage'; usage: AiUsage }
  | { seq: number; at: number; type: 'status'; status: string; attempt?: number; message?: string; images?: number; files?: number }
  | { seq: number; at: number; type: 'done'; status: 'completed' | 'failed' | 'aborted'; error?: string; usage?: AiUsage };

export type AiRunInfo = {
  id: string;
  threadKey: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  error?: string;
  usage?: AiUsage | null;
};

export type AiAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: 'image' | 'text' | 'binary';
  url: string;
};

/** 工具名 → 中文说明，用于界面展示「正在读取…」。 */
export const AI_TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  url_context: '读取网页内容',
  data_overview: '读取数据概况',
  query_property_rows: '查询物性打版记录',
  query_sheet_rows: '查询分表数据',
  query_report_ranges: '查询报告判定范围',
  list_spectrum_records: '查询图谱记录',
  read_spectrum_image: '读取图谱图片',
  list_server_projects: '查询服务器项目',
  read_server_project: '读取项目资料',
  prepare_project_lifecycle: '准备项目启停',
  prepare_business_change: '准备业务数据变更',
  list_inspection_reports: '查询检测报告',
  list_office_records: '查询办事记录',
  list_ash_records: '查询灰份记录',
};

export const aiToolLabel = (name: string): string => AI_TOOL_LABELS[name] ?? '读取平台数据';

const parseFrame = (frame: string): AiRunEvent | null => {
  const data = frame
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!data) return null;
  try {
    const payload = JSON.parse(data);
    return payload && typeof payload === 'object' && typeof payload.type === 'string' ? (payload as AiRunEvent) : null;
  } catch {
    return null;
  }
};

/** 发起一次分析运行，返回 runId；随后用 streamAiRun 订阅事件。 */
export const startAiRun = async (
  prompt: string,
  { threadId, signal, attachments }: { threadId?: string; signal?: AbortSignal; attachments?: Array<{ id: string }> } = {},
): Promise<AiRunInfo> => {
  const response = await fetchWithTimeout(buildUrl('/api/ai/runs'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...(threadId ? { threadId } : {}),
      ...(attachments?.length ? { attachments: attachments.map((item) => ({ id: item.id })) } : {}),
    }),
    signal,
  });
  if (response.status === 401) throw new Error('登录状态已失效，请重新登录。');
  if (response.status === 429) throw new Error('当前分析任务较多，请稍后重试。');
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `发起分析失败（${response.status}）。`);
  }
  const payload = await response.json() as { run?: AiRunInfo };
  if (!payload?.run?.id) throw new Error('服务端未返回运行标识。');
  return payload.run;
};

/** 上传单个附件（图片/文本/其它文件），返回服务端元信息。 */
export const uploadAiAttachment = async (
  file: File,
  { signal }: { signal?: AbortSignal } = {},
): Promise<AiAttachment> => {
  let response: Response;
  try {
    response = await fetchWithTimeout(buildUrl('/api/ai/uploads'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name || 'attachment'),
      },
      body: file,
      signal,
    }, DEFAULT_FETCH_TIMEOUT_MS * 4);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('附件上传超时，请检查网络后重试。');
    }
    if (error instanceof TypeError) {
      throw new Error('附件上传连接失败，可能是网络中断或浏览器跨域限制，请重试。');
    }
    throw error;
  }
  if (response.status === 401) throw new Error('登录状态已失效，请重新登录。');
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `附件上传失败（${response.status}）。`);
  }
  const payload = await response.json() as { attachment?: AiAttachment };
  if (!payload?.attachment?.id) throw new Error('服务端未返回附件标识。');
  return payload.attachment;
};

export const abortAiRun = async (
  runId: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<boolean> => {
  const response = await fetch(buildUrl(`/api/ai/runs/${encodeURIComponent(runId)}/abort`), {
    method: 'POST',
    credentials: 'include',
    signal,
  });
  return response.ok;
};

/** 订阅运行事件流；收到 done 事件或流结束时 resolve。 */
export const streamAiRun = async (
  runId: string,
  onEvent: (event: AiRunEvent) => void,
  { signal, from = 0 }: { signal?: AbortSignal; from?: number } = {},
): Promise<void> => {
  const response = await fetch(buildUrl(`/api/ai/runs/${encodeURIComponent(runId)}/events?from=${from}`), {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'text/event-stream' },
    signal,
  });
  if (response.status === 401) throw new Error('登录状态已失效，请重新登录。');
  if (response.status === 404) throw new Error('分析任务不存在或已过期。');
  if (!response.ok) throw new Error(`分析事件流连接失败（${response.status}）。`);
  if (!response.body) throw new Error('当前浏览器不支持流式响应。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = () => {
    let index = buffer.indexOf('\n\n');
    while (index >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = parseFrame(frame);
      if (event) onEvent(event);
      index = buffer.indexOf('\n\n');
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) buffer += decoder.decode();
      dispatch();
      if (done) break;
    }
    const tail = parseFrame(buffer);
    if (tail) onEvent(tail);
  } finally {
    try { await reader.cancel(); } catch { reader.releaseLock(); }
  }
};

export const fetchAiHealth = async (signal?: AbortSignal) => {
  const response = await fetchWithTimeout(buildUrl('/api/ai/health'), { credentials: 'include', signal }, DEFAULT_FETCH_TIMEOUT_MS);
  if (!response.ok) return null;
  return response.json() as Promise<{ ok: boolean; model: { ready: boolean; providerId: string; modelId: string; reason?: string } }>;
};

export async function submitAiProjectAction(id: string, threadId: string, operation: 'confirm' | 'cancel'): Promise<AiProjectAction> {
  const response = await fetchWithTimeout(buildUrl(`/api/ai/project-actions/${encodeURIComponent(id)}/${operation}`), {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId }),
  }, 60_000);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || '项目确认失败，请查询实际状态');
  const action = parseAiProjectAction(payload.action);
  if (!action) throw new Error('项目确认回执无效');
  return action;
}

export type AiHistorySession = { id: string; title: string; turns: Array<{ role: 'user' | 'assistant'; text: string }>; updatedAt: number };
export async function fetchAiHistory(ownerId: string): Promise<AiHistorySession[]> {
  const response = await fetchWithTimeout(buildUrl(`/api/ai/history?ownerId=${encodeURIComponent(ownerId)}`), { credentials: 'include' });
  if (!response.ok) throw new Error('读取云端历史失败，请稍后重试。');
  const payload = await response.json();
  if (!Array.isArray(payload.sessions)) throw new Error('云端历史格式无效。');
  return payload.sessions;
}
export async function saveAiHistory(ownerId: string, sessions: AiHistorySession[], deletedIds: string[] = [], migrate = false): Promise<void> {
  const response = await fetchWithTimeout(buildUrl('/api/ai/history'), {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ownerId, sessions, deletedIds, migrate }),
  });
  if (!response.ok) throw new Error('云端历史保存失败，请稍后重试。');
}

export const aiAnalysis = {
  history: fetchAiHistory,
  saveHistory: saveAiHistory,
  start: startAiRun,
  submitProjectAction: submitAiProjectAction,
  abort: abortAiRun,
  stream: streamAiRun,
  health: fetchAiHealth,
  upload: uploadAiAttachment,
  resolveAssetUrl: resolveAiAssetUrl,
  toolLabel: aiToolLabel,
};
