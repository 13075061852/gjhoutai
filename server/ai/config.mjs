import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  host: process.env.AI_HOST || '127.0.0.1',
  port: positiveNumber(process.env.AI_PORT, 8790),
  /** 站点子路径，nginx 会把 /gjhoutai/api/ai/* 转给本服务。 */
  appBasePath: process.env.APP_BASE_PATH || '/gjhoutai',
  dataDir: process.env.DATA_DIR || '/var/lib/gjhoutai/data',
  /** pi 的 agent 目录（凭证、模型目录、会话、工作目录都在这里）。 */
  agentDir: process.env.AI_AGENT_DIR || '/var/lib/gjhoutai/pi',
  /** 自定义 OpenAI 兼容端点时的 provider id。 */
  providerId: process.env.AI_PROVIDER_ID || 'kingpolymer',
  /** 自定义端点地址，例如 https://api.apimart.ai/v1。留空则使用 pi 内置 provider。 */
  baseUrl: (process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
  /** 模型：`provider:model`（如 deepseek:deepseek-chat）或仅 model（配合 AI_PROVIDER_ID）。 */
  modelRef: (process.env.AI_MODEL || '').trim(),
  thinkingLevel: process.env.AI_THINKING_LEVEL || 'off',
  /** 模型支持的输入模态，逗号分隔（text,image）。 */
  modelInput: (process.env.AI_MODEL_INPUT || 'text,image')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item === 'text' || item === 'image'),
  maxConcurrentRuns: positiveNumber(process.env.AI_MAX_CONCURRENT_RUNS, 4),
  maxRunsPerUser: positiveNumber(process.env.AI_MAX_RUNS_PER_USER, 2),
  runTimeoutMs: positiveNumber(process.env.AI_RUN_TIMEOUT_MS, 300_000),
  runTtlMs: positiveNumber(process.env.AI_RUN_TTL_MS, 30 * 60_000),
  sseHeartbeatMs: positiveNumber(process.env.AI_SSE_HEARTBEAT_MS, 15_000),
  maxPromptChars: positiveNumber(process.env.AI_MAX_PROMPT_CHARS, 8000),
  /** 单次提问最多携带的附件数。 */
  maxAttachments: positiveNumber(process.env.AI_MAX_ATTACHMENTS, 4),
  /** 附件保留时长（上传目录定时清理）。 */
  attachmentTtlMs: positiveNumber(process.env.AI_ATTACHMENT_TTL_MS, 24 * 60 * 60_000),
  /** 允许跨域携带 Cookie 调用 AI 接口的来源（前端本地开发用）。 */
  corsOrigins: (process.env.CORS_ORIGINS
    || 'https://www.kingpolymer.com,https://kingpolymer.com,http://127.0.0.1:5001,http://localhost:5001')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};

// The plugin must use this service's agent directory, never a personal pi profile.
process.env.PI_WEB_SEARCH_CONFIG ||= path.join(config.agentDir, 'web-search.json');

export const databasePath = path.join(config.dataDir, 'gjhoutai.sqlite');
/** 附件上传目录（必须位于 systemd ReadWritePaths 允许的路径内）。 */
export const uploadsDir = (process.env.AI_UPLOAD_DIR || path.join(config.agentDir, 'uploads')).replace(/\/+$/, '');
export const workspaceDir = path.join(config.agentDir, 'workspace');
export const authPath = path.join(config.agentDir, 'auth.json');
export const modelsPath = path.join(config.agentDir, 'models.json');

/** 解析 `AI_MODEL`：`provider:model` 优先，其次用 `AI_PROVIDER_ID` 拼接。 */
export function resolveModelRef() {
  if (!config.modelRef) return null;
  const separator = config.modelRef.indexOf(':');
  if (separator < 0) return { providerId: config.providerId, modelId: config.modelRef };
  return {
    providerId: config.modelRef.slice(0, separator),
    modelId: config.modelRef.slice(separator + 1),
  };
}

export const usesCustomEndpoint = () => Boolean(config.baseUrl && resolveModelRef());

/**
 * 准备 pi 的 agent 目录。
 * 自定义端点（apimart 等 OpenAI 兼容服务）写 models.json；
 * apiKey 用 `${ENV}` 插值，密钥本身只存在于环境变量里，不落盘。
 */
export async function ensureAgentDir() {
  await mkdir(config.agentDir, { recursive: true });
  await mkdir(workspaceDir, { recursive: true });
  const ref = resolveModelRef();
  if (!config.baseUrl || !ref) return { modelsPath: null };
  const apiKeyEnv = process.env.AI_API_KEY_ENV || 'AI_API_KEY';
  const customModel = {
    id: ref.modelId,
    input: config.modelInput.length ? config.modelInput : ['text'],
    inputLimits: {
      images: {
        resize: { maxWidth: 1568, maxHeight: 1568, maxBytes: 4_500_000, jpegQuality: 80 },
      },
    },
  };
  const payload = {
    providers: {
      [ref.providerId]: {
        baseUrl: config.baseUrl,
        api: 'openai-completions',
        apiKey: `\${${apiKeyEnv}}`,
        models: [customModel],
      },
    },
  };
  await writeFile(modelsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { modelsPath };
}
