// API contract: https://docs.apib.ai/cn
export const APIMART_DEFAULT_BASE_URL = 'https://api.apimart.ai/v1';
export const APIMART_SEEDREAM_45_MODEL = 'seedream-4.5';
export const APIMART_IMAGE_MODELS: Array<[string, string]> = [['seedream-4.5', 'Seedream 4.5']];
export const APIMART_VIDEO_MODELS: Array<[string, string]> = [['kling-v2-6', '可灵 2.6']];

type GenerationParams = {
  prompt: string; model?: string; aspectRatio?: string; resolution?: string;
  count?: number; duration?: number | string; referenceImages?: string[];
};

const references = (images: string[] = [], allowData = false) => images.filter(Boolean).map(url => {
  if (!/^https?:\/\/\S+$/i.test(url) && !(allowData && /^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(url))) {
    throw new Error(allowData ? '参考图需要公网地址或 PNG/JPEG Data URI' : '视频参考图需要可公开访问的 HTTP(S) 地址');
  }
  return url;
});

export function buildApimartImageRequest(params: GenerationParams) {
  const model = params.model || APIMART_SEEDREAM_45_MODEL;
  if (!APIMART_IMAGE_MODELS.some(([id]) => id === model)) throw new Error('暂未适配该图片模型，请选择 Seedream 4.5');
  if (!params.prompt?.trim()) throw new Error('请填写提示词');
  const images = references(params.referenceImages, true);
  const n = Number(params.count ?? 1);
  if (!Number.isInteger(n) || n < 1 || n + images.length > 15) throw new Error('生成数量与参考图数量之和不能超过 15 张');
  const resolution = (params.resolution || '2K').toUpperCase();
  if (!['2K', '4K'].includes(resolution)) throw new Error('Seedream 4.5 支持 2K、4K 分辨率');
  const size = params.aspectRatio || '1:1';
  if (!['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '2:1', '1:2', '21:9', '9:21', 'auto'].includes(size) || (size === 'auto' && !images.length)) throw new Error('请选择有效的图片比例');
  return { path: '/images/generations', body: { model, prompt: params.prompt.trim(), size, resolution, n, ...(images.length ? { image_urls: images } : {}) } };
}

export function buildApimartVideoRequest(params: GenerationParams) {
  const model = params.model || 'kling-v2-6';
  if (!APIMART_VIDEO_MODELS.some(([id]) => id === model)) throw new Error('暂未适配该视频模型，请选择可灵 2.6');
  if (!params.prompt?.trim() || params.prompt.length > 2500) throw new Error('视频提示词需为 1–2500 个字符');
  const images = references(params.referenceImages);
  const mode = params.resolution || 'pro';
  if (!['std', 'pro'].includes(mode)) throw new Error('请选择标准或专业模式');
  if (images.length > 2 || (mode === 'std' && images.length > 1)) throw new Error('标准模式支持 1 张首帧，专业模式支持最多 2 张首尾帧');
  const duration = Number(params.duration ?? 5);
  if (![5, 10].includes(duration)) throw new Error('可灵 2.6 支持 5 秒或 10 秒视频');
  const aspect_ratio = params.aspectRatio || '16:9';
  if (!['16:9', '9:16', '1:1'].includes(aspect_ratio)) throw new Error('视频比例支持 16:9、9:16、1:1');
  return { path: '/videos/generations', body: { model, prompt: params.prompt.trim(), mode, duration, aspect_ratio, ...(images.length ? { image_urls: images } : {}) } };
}

export function unwrapApimartPayload(payload: any) {
  if (payload?.error || payload?.success === false || (payload?.code !== undefined && Number(payload.code) !== 200)) {
    throw new Error(payload?.error?.message || payload?.message || payload?.msg || 'APIMart 请求失败');
  }
  return payload?.data ?? payload;
}

export function apimartTaskIds(payload: any): string[] {
  return [...new Set((Array.isArray(payload) ? payload : [payload]).map(item => item?.task_id || item?.id).filter((id): id is string => typeof id === 'string' && !!id))];
}

export function normalizeApimartTaskStatus(value: unknown) {
  const status = String(value || '').toLowerCase();
  if (['completed', 'failed', 'cancelled'].includes(status)) return status;
  if (status === 'processing') return 'processing';
  return 'submitted';
}
