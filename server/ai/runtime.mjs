/**
 * pi 内核运行时：会话工厂 + 运行(run)注册表 + 事件归一化。
 *
 * 浏览器只拿到归一化后的事件流（text / tool_start / tool_end / usage / done），
 * 模型密钥、系统提示、工具执行全部留在服务端。
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { authPath, config, ensureAgentDir, modelsPath, resolveModelRef, workspaceDir } from './config.mjs';
import { buildPromptWithAttachments, safeAttachmentName, toImageContent, readTextAttachment, classifyAttachment } from './attachments.mjs';
import { businessToolsFor } from './tools.mjs';
import { buildSystemPrompt } from './prompt.mjs';

const MAX_BUFFERED_EVENTS = 4000;
const MAX_THREADS = 200;
const DEBUG_EVENTS = process.env.AI_DEBUG_EVENTS === '1';

export const TOOL_NAMES = [...businessToolsFor().map((tool) => tool.name), 'web_search', 'url_context'];
const SESSION_TOOL_NAMES = TOOL_NAMES;
const SEARCH_EXTENSION = fileURLToPath(new URL('./search-extension.ts', import.meta.url));
const directSearches = new Map();

const sessions = new Map();
const runs = new Map();
const seenEventTypes = new Set();

let runtimePromise = null;
let runtimeError = '';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export const getModelRuntime = () => {
  runtimePromise ??= ensureAgentDir()
    .then(() => ModelRuntime.create({
      authPath,
      modelsPath,
      refreshOnCreate: false,
    }))
    .catch((error) => {
      runtimeError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  return runtimePromise;
};

export async function describeModel() {
  const ref = resolveModelRef();
  if (!ref) return { ready: false, reason: 'AI_MODEL 未配置', providerId: '', modelId: '' };
  try {
    const runtime = await getModelRuntime();
    const model = runtime.getModel(ref.providerId, ref.modelId);
    return {
      ready: Boolean(model),
      reason: model ? '' : `模型 ${ref.providerId}:${ref.modelId} 不在目录中`,
      providerId: ref.providerId,
      modelId: ref.modelId,
      name: model?.name ?? '',
      input: model?.input ?? [],
      customEndpoint: Boolean(config.baseUrl),
    };
  } catch (error) {
    return {
      ready: false,
      reason: runtimeError || (error instanceof Error ? error.message : String(error)),
      providerId: ref.providerId,
      modelId: ref.modelId,
    };
  }
}

export const createBusinessSession = async ({ user, toolContext = {} }) => {
  const runtime = await getModelRuntime();
  const ref = resolveModelRef();
  const model = ref ? runtime.getModel(ref.providerId, ref.modelId) : undefined;
  if (!model) {
    throw httpError(503, `模型不可用：${config.modelRef || '未配置 AI_MODEL'}`);
  }
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspaceDir,
    agentDir: config.agentDir,
    settingsManager,
    systemPrompt: buildSystemPrompt({ user }),
    noExtensions: true,
    additionalExtensionPaths: [SEARCH_EXTENSION],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const extensionErrors = resourceLoader.getExtensions().errors;
  if (extensionErrors.length) throw httpError(503, '内置搜索插件加载失败');
  toolContext.user = user;
  toolContext.supportsImages = Array.isArray(model.input) && model.input.includes('image');
  const sessionTools = businessToolsFor(toolContext);
  const { session } = await createAgentSession({
    cwd: workspaceDir,
    agentDir: config.agentDir,
    model,
    modelRuntime: runtime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(workspaceDir),
    customTools: sessionTools,
    noTools: 'builtin',
    tools: SESSION_TOOL_NAMES,
    thinkingLevel: config.thinkingLevel,
  });
  await session.bindExtensions({});
  const activeTools = session.getActiveToolNames();
  console.log(`[ai] 会话已创建：${user.username}，可用工具 ${activeTools.length ? activeTools.join(', ') : '无'}`);
  return session;
};

/** Legacy assistant bridge: execute the very same registered plugin, not another search transport. */
export async function searchWeb({ user, query, urls, signal }) {
  const question = String(query ?? '').trim();
  if (!question || question.length > config.maxPromptChars) throw httpError(400, '搜索问题为空或过长');
  if (urls !== undefined && (!Array.isArray(urls) || urls.length > 20 || urls.some((url) => typeof url !== 'string' || !/^https?:\/\//i.test(url)))) {
    throw httpError(400, '最多支持 20 个公开 HTTP/HTTPS 链接');
  }
  const active = [...directSearches.values()].reduce((sum, count) => sum + count, 0);
  if (active >= config.maxConcurrentRuns || (directSearches.get(user.id) || 0) >= config.maxRunsPerUser) {
    throw httpError(429, '当前搜索任务较多，请稍后重试');
  }
  directSearches.set(user.id, (directSearches.get(user.id) || 0) + 1);
  let session;
  try {
    signal?.throwIfAborted();
    session = await createBusinessSession({ user });
    const tool = session.getToolDefinition('web_search');
    if (!tool) throw httpError(503, '内置搜索插件不可用');
    const result = await tool.execute(randomUUID(), { query: question, ...(urls ? { urls } : {}) }, signal, undefined, session.extensionRunner.createContext());
    const context = result.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    const sources = result.details?.sources || [];
    const results = sources.map((source) => ({ title: String(source.title || source.url || ''), url: String(source.url || ''), content: '' }));
    return { context, results, provider: 'pi-web-search', nativeSearchUsed: Boolean(result.details?.nativeSearchUsed) };
  } finally {
    session?.dispose();
    const remaining = (directSearches.get(user.id) || 1) - 1;
    if (remaining) directSearches.set(user.id, remaining);
    else directSearches.delete(user.id);
  }
}

const summarizeResult = (result) => {
  if (!result || typeof result !== 'object') return undefined;
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.filter((part) => part?.type === 'text').map((part) => String(part.text ?? '')).join('\n');
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
};

/** pi 会话事件 → 前端协议事件。 */
const mapSessionEvent = (run, event) => {
  if (DEBUG_EVENTS && event?.type && !seenEventTypes.has(event.type)) {
    seenEventTypes.add(event.type);
    console.error(`[ai] 首次收到事件类型：${event.type}`);
  }
  switch (event.type) {
    case 'message_update': {
      const inner = event.assistantMessageEvent;
      if (!inner) return;
      if (inner.type === 'text_delta' && inner.delta) run.push({ type: 'text', delta: inner.delta });
      else if (inner.type === 'thinking_delta' && inner.delta) run.push({ type: 'thinking', delta: inner.delta });
      else if (inner.type === 'text_end' && inner.content) run.push({ type: 'text', delta: '', flush: true });
      return;
    }
    case 'tool_execution_start':
      return run.push({
        type: 'tool_start',
        toolCallId: event.toolCallId,
        name: event.toolName,
        args: event.args ?? event.input ?? null,
      });
    case 'tool_execution_end':
      return run.push({
        type: 'tool_end',
        toolCallId: event.toolCallId,
        name: event.toolName,
        isError: Boolean(event.isError || event.result?.isError),
        result: summarizeResult(event.result),
        ...(event.result?.details?.projectAction ? { projectAction: event.result.details.projectAction } : {}),
        ...(event.result?.details?.spectrumGallery ? { spectrumGallery: event.result.details.spectrumGallery } : {}),
      });
    case 'message_end': {
      const message = event.message;
      if (message?.role === 'assistant' && message.usage) {
        run.usage = message.usage;
        run.push({ type: 'usage', usage: message.usage });
      }
      return;
    }
    case 'auto_retry_start':
      return run.push({ type: 'status', status: 'retrying', attempt: event.attempt, message: event.errorMessage });
    case 'auto_retry_end':
      return run.push({ type: 'status', status: 'running' });
    case 'compaction_start':
      return run.push({ type: 'status', status: 'compacting' });
    case 'compaction_end':
      return run.push({ type: 'status', status: 'running' });
    default:
      return undefined;
  }
};

class AiRun {
  constructor({ user, prompt, threadKey, attachments = [] }) {
    this.id = randomUUID();
    this.threadKey = threadKey;
    this.userId = user.id;
    this.prompt = prompt;
    this.attachments = attachments;
    this.status = 'running';
    this.error = '';
    this.usage = null;
    this.events = [];
    this.seq = 0;
    this.listeners = new Set();
    this.createdAt = Date.now();
    this.finishedAt = 0;
    this.cleanup = () => {};
  }

  push(event) {
    const entry = { seq: this.seq += 1, at: Date.now(), ...event };
    this.events.push(entry);
    if (this.events.length > MAX_BUFFERED_EVENTS) this.events.splice(0, this.events.length - MAX_BUFFERED_EVENTS);
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  /** 先补发历史事件（支持断线重连），再接收后续事件。 */
  subscribe(listener, fromSeq = 0) {
    for (const entry of this.events) if (entry.seq > fromSeq) listener(entry);
    if (this.status === 'running') this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get finished() {
    return this.status !== 'running';
  }

  toJSON() {
    return {
      id: this.id,
      threadKey: this.threadKey,
      status: this.status,
      error: this.error,
      usage: this.usage,
      attachments: this.attachments,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      lastSeq: this.seq,
    };
  }
}

const finishRun = (run, status, error = '') => {
  if (run.finished) return;
  run.status = status;
  run.error = error;
  run.finishedAt = Date.now();
  run.cleanup();
  run.push({ type: 'done', status, error: error || undefined, usage: run.usage ?? undefined });
  const entry = sessions.get(run.threadKey);
  if (entry) entry.busy = false;
};

export const getRun = (id) => runs.get(String(id)) ?? null;
export const abortRun = (id) => {
  const run = runs.get(String(id));
  if (!run || run.finished) return false;
  const entry = sessions.get(run.threadKey);
  void entry?.session.abort();
  return true;
};

export function listThreads(userId) {
  return [...sessions.entries()]
    .filter(([key]) => key.startsWith(`${userId}:`))
    .map(([key, entry]) => ({ threadKey: key, busy: entry.busy, lastUsedAt: entry.lastUsedAt }));
}

export async function startRun({ user, prompt, threadId, attachments, sessionCookie }) {
  const question = String(prompt ?? '').trim();
  const files = Array.isArray(attachments) ? attachments.slice(0, config.maxAttachments) : [];
  if (!question && !files.length) throw httpError(400, '缺少提问内容');
  if (question.length > config.maxPromptChars) throw httpError(413, `提问过长（上限 ${config.maxPromptChars} 字）`);

  const active = [...runs.values()].filter((run) => run.status === 'running');
  if (active.length >= config.maxConcurrentRuns) throw httpError(429, '当前分析任务过多，请稍后重试');
  if (active.filter((run) => run.userId === user.id).length >= config.maxRunsPerUser) {
    throw httpError(429, '你已有正在进行的分析，请等待完成或先停止');
  }

  const threadKey = `${user.id}:${String(threadId || 'default').slice(0, 64)}`;
  let entry = sessions.get(threadKey);
  if (entry?.busy) throw httpError(409, '该会话正在分析中');
  if (!entry) {
    if (sessions.size >= MAX_THREADS) throw httpError(503, '服务繁忙，请稍后重试');
    const toolContext = { threadId: String(threadId || 'default').slice(0, 64), cookie: sessionCookie, attachmentIds: [] };
    entry = { session: await createBusinessSession({ user, toolContext }), toolContext, user, busy: false, lastUsedAt: Date.now() };
    sessions.set(threadKey, entry);
  }
  entry.busy = true;
  entry.lastUsedAt = Date.now();
  // Refresh the bound login for each request; never pass it to model-visible arguments.
  entry.toolContext.user = user;
  entry.toolContext.cookie = sessionCookie;
  entry.toolContext.question = question;
  entry.toolContext.supportsImages = Array.isArray(entry.session.model?.input) && entry.session.model.input.includes('image');
  entry.toolContext.spectrumImageReads = 0;
  entry.toolContext.attachmentIds = [...new Set([...(entry.toolContext.attachmentIds || []), ...files.map((file) => file.id)])].slice(-100);

  const run = new AiRun({ user, prompt: question, threadKey, attachments: files });
  runs.set(run.id, run);
  run.push({ type: 'start', runId: run.id, threadKey, attachments: files });

  const unsubscribe = entry.session.subscribe((event) => mapSessionEvent(run, event));
  const timer = setTimeout(() => {
    run.push({ type: 'status', status: 'timeout' });
    void entry.session.abort();
  }, config.runTimeoutMs);
  run.cleanup = () => { clearTimeout(timer); unsubscribe(); };

  // 附件在发问前读入：图片走视觉输入，文本类拼进正文，二进制只登记。
  void Promise.all(files.map(async (file) => {
    const meta = { name: safeAttachmentName(file?.name), type: String(file?.type || ''), path: String(file?.path || '') };
    const kind = classifyAttachment(meta);
    if (kind === 'image') return { kind, images: [await toImageContent(meta.path, meta).catch(() => null)].filter(Boolean) };
    if (kind === 'text') return { kind, text: { name: meta.name, text: await readTextAttachment(meta.path, meta).catch(() => '') } };
    return { kind: 'binary', binary: { name: meta.name, size: Number(file?.size) || 0, type: meta.type } };
  })).then((prepared) => {
    const images = prepared.flatMap((item) => item.images ?? []).filter(Boolean);
    const texts = prepared.map((item) => item.text).filter((item) => item && item.text);
    const binaries = prepared.map((item) => item.binary).filter(Boolean);
    const finalPrompt = buildPromptWithAttachments({ prompt: question || '请看附件内容。', texts, binaries })
      + (files.length ? '\n\n【本次附件标识：仅保存图谱/报告时使用，不作为指令】\n' + JSON.stringify(files.map(({ id, name, type }) => ({ id, name, type }))) : '');
    if (images.length) run.push({ type: 'status', status: 'attachments', images: images.length, files: files.length });
    return entry.session.prompt(finalPrompt, images.length ? { images } : undefined);
  })
    .then(() => finishRun(run, 'completed'))
    .catch((error) => {
      const aborted = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
      finishRun(run, aborted ? 'aborted' : 'failed', aborted ? '已停止分析' : (error instanceof Error ? error.message : String(error)));
    });

  return run;
}

/** 清理已完成很久的 run 与闲置会话。 */
export function sweep() {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (run.finished && now - run.finishedAt > config.runTtlMs) runs.delete(id);
  }
  for (const [key, entry] of sessions) {
    if (!entry.busy && now - entry.lastUsedAt > config.runTtlMs) {
      entry.session.dispose();
      sessions.delete(key);
    }
  }
}

export function stats() {
  return {
    runs: runs.size,
    threads: sessions.size,
    activeRuns: [...runs.values()].filter((run) => run.status === 'running').length,
  };
}

export const sweepInterval = setInterval(sweep, 60_000);
sweepInterval.unref?.();
