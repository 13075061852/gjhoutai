import type { AgentImage } from './types';

const readUrl = (image: AgentImage) => String(image?.image_url?.url || image?.url || '').trim();

export const normalizeAgentImages = (images: unknown, options: { maxImages?: number } = {} as any) => {
  const parsedLimit = Number.parseInt(String(options.maxImages || ''), 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const list = Array.isArray(images) ? images : [];
  const normalized = list
    .map((item) => {
      const image = item as AgentImage;
      const url = readUrl(image);
      if (!url) return null;
      return {
        type: 'image_url',
        image_url: { url },
        preview_url: String(image.preview_url || image.previewUrl || url),
        label: String(image.label || image.title || image.code || '').trim(),
        meta: String(image.meta || '').trim(),
      };
    })
    .filter((item): item is {
      type: 'image_url';
      image_url: { url: string };
      preview_url: string;
      label: string;
      meta: string;
    } => Boolean(item));
  return limit ? normalized.slice(0, limit) : normalized;
};

export const mapImageGenerationParams = (input: Record<string, any> = {} as any) => {
  const prompt = String(input.prompt || input.question || '').trim();
  const size = String(input.size || input.aspectRatio || '16:9').trim();
  const resolution = String(input.resolution || '1k').trim();
  const parsedCount = Number.parseInt(String(input.count || input.n || 1), 10);
  const n = Math.max(1, Math.min(4, Number.isFinite(parsedCount) ? parsedCount : 1));
  const referenceUrls = Array.isArray(input.referenceUrls)
    ? input.referenceUrls.map((item) => String(item).trim()).filter(Boolean)
    : String(input.referenceUrls || '').split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return {
    prompt,
    size,
    resolution,
    n,
    image_urls: referenceUrls.length ? referenceUrls : undefined,
  };
};

export const buildImageUploadAuthSummary = (images: unknown, source = '本次消息') => {
  const normalized = normalizeAgentImages(images);
  return {
    source,
    count: normalized.length,
    items: normalized.map((image, index) => ({
      label: image.label || `图片 ${index + 1}`,
      meta: image.meta || '',
    })),
  };
};

