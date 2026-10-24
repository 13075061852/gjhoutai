/**
 * 附件处理（纯函数为主，便于测试）。
 *
 * 浏览器上传的附件存在服务端私有目录：
 * - 图片：转成 pi 的 ImageContent 直接交给模型（当前端点 deepseek-flash 支持 image 输入）；
 * - 文本类（txt/csv/json/md/log/tsv/xml）：按上限读取内容，拼进提问正文；
 * - 其它二进制（xlsx/pdf/docx…）：不能直接解析，只保留文件本身并明确告知模型/用户。
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const IMAGE_MIME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/bmp', 'bmp'],
  ['image/avif', 'avif'],
]);

export const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv', 'json', 'md', 'markdown', 'log', 'yml', 'yaml', 'xml', 'html', 'htm', 'ini', 'conf']);
export const TEXT_MIME_PREFIXES = ['text/'];
export const TEXT_MIME_TYPES = new Set(['application/json', 'application/xml', 'application/x-ndjson']);

export const ATTACHMENT_KINDS = ['image', 'text', 'binary'];

/** 只保留文件名，去掉路径与危险字符。 */
export const safeAttachmentName = (value, fallback = '附件') => {
  const raw = String(value ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = raw.replace(/[\u0000-\u001f\u007f"'<>|*?]/g, '').trim();
  return cleaned.slice(0, 160) || fallback;
};

export const attachmentExtension = (name) => {
  const base = String(name ?? '').toLowerCase();
  const index = base.lastIndexOf('.');
  return index > 0 && index < base.length - 1 ? base.slice(index + 1).replace(/[^a-z0-9]/g, '') : '';
};

/** 图片 → image；文本类 → text；其它 → binary。 */
export const classifyAttachment = ({ name, type } = {}) => {
  const mime = String(type ?? '').toLowerCase().split(';')[0].trim();
  if (IMAGE_MIME_TYPES.has(mime)) return 'image';
  if (TEXT_MIME_TYPES.has(mime)) return 'text';
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return 'text';
  const ext = attachmentExtension(name);
  if (ext && TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'binary';
};

export const limits = {
  maxAttachments: 4,
  maxBytes: 8 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxTextChars: 60_000,
  maxImageBytes: 6 * 1024 * 1024,
};

export const validateAttachment = ({ name, type, size }) => {
  const kind = classifyAttachment({ name, type });
  const bytes = Number(size) || 0;
  if (!bytes) return { ok: false, error: '附件为空' };
  if (bytes > limits.maxBytes) return { ok: false, error: `单个附件不能超过 ${Math.round(limits.maxBytes / 1024 / 1024)} MB` };
  if (kind === 'image' && bytes > limits.maxImageBytes) return { ok: false, error: '图片不能超过 6 MB' };
  return { ok: true, kind };
};

/** 图片 → pi ImageContent；读不到或类型不符返回 null。 */
export async function toImageContent(filePath, { name, type } = {}) {
  if (classifyAttachment({ name, type }) !== 'image') return null;
  const mime = String(type ?? '').toLowerCase().split(';')[0].trim();
  const data = await readFile(filePath);
  if (!data.length) return null;
  return { type: 'image', data: data.toString('base64'), mimeType: IMAGE_MIME_TYPES.has(mime) ? mime : 'image/png' };
}

/** 文本类附件 → 限长文本；其它类型返回空串。 */
export async function readTextAttachment(filePath, { name, type } = {}) {
  if (classifyAttachment({ name, type }) !== 'text') return '';
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return '';
  const raw = await readFile(filePath, 'utf8').catch(() => '');
  const text = raw.replace(/^\uFEFF/, '');
  if (text.length <= limits.maxTextChars) return text;
  return `${text.slice(0, limits.maxTextChars)}\n…（附件过长已截断）`;
}

/**
 * 把附件拼进提问：图片交给模型视觉输入，文本类拼成引用区块，
 * 二进制只登记名称与大小，让模型知道“有这个文件但读不到内容”。
 */
export const buildPromptWithAttachments = ({ prompt, texts = [], binaries = [] } = {}) => {
  const sections = [String(prompt ?? '').trim()];
  for (const item of texts) {
    const body = String(item.text ?? '').trim();
    if (!body) continue;
    sections.push(`【附件 ${safeAttachmentName(item.name)} 的完整内容（服务器已读出，直接使用，不要说读不到）】\n\`\`\`\n${body}\n\`\`\``);
  }
  if (binaries.length) {
    const lines = binaries.map((item) => `- ${safeAttachmentName(item.name)}（${Math.max(1, Math.round((Number(item.size) || 0) / 1024))} KB，${String(item.type || '未知类型')}）`);
    sections.push(`【以下文件只有文件名，服务器无法解析其内容】\n${lines.join('\n')}`);
  }
  return sections.filter(Boolean).join('\n\n');
};

export const attachmentStoragePath = (rootDir, userId, id, name) => {
  const safeUser = String(userId ?? '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeId = String(id ?? '').replace(/[^a-zA-Z0-9-]/g, '');
  const ext = attachmentExtension(name);
  return path.join(rootDir, safeUser, `${safeId}${ext ? `.${ext}` : ''}`);
};

export const isSafeUploadId = (value) => /^[a-zA-Z0-9-]{8,64}$/.test(String(value ?? ''));
