import { describe, expect, it } from 'vitest';
import { buildImageUploadAuthSummary, mapImageGenerationParams, normalizeAgentImages } from './media';

describe('agent runtime media', () => {
  it('normalizes and limits images', () => {
    const images = normalizeAgentImages([
      { image_url: { url: 'data:image/png;base64,a' }, label: 'A' },
      { url: 'data:image/jpeg;base64,b', title: 'B' },
      { url: '' },
    ], { maxImages: 1 });
    expect(images).toHaveLength(1);
    expect(images[0]?.image_url.url).toContain('data:image/png');
    expect(images[0]?.label).toBe('A');
  });

  it('maps image generation params with safe defaults', () => {
    const params = mapImageGenerationParams({ prompt: '产品海报', count: 9, referenceUrls: ['https://example.com/a.png'] });
    expect(params.prompt).toBe('产品海报');
    expect(params.size).toBe('16:9');
    expect(params.resolution).toBe('1k');
    expect(params.n).toBe(4);
    expect(params.image_urls).toEqual(['https://example.com/a.png']);
  });

  it('builds authorization summaries', () => {
    const summary = buildImageUploadAuthSummary([{ url: 'data:image/webp;base64,c', title: '图谱 1' }], '图谱检索结果');
    expect(summary.source).toBe('图谱检索结果');
    expect(summary.count).toBe(1);
    expect(summary.items[0]?.label).toBe('图谱 1');
  });
});
