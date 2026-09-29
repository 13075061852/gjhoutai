import { describe, expect, it } from 'vitest';
import { apimartTaskIds, buildApimartImageRequest, buildApimartVideoRequest, normalizeApimartTaskStatus, unwrapApimartPayload } from './apimart';

describe('APIMart documented contracts', () => {
  it('submits native Seedream parameters without Liblib templates or credentials', () => {
    expect(buildApimartImageRequest({ prompt: '产品', resolution: '4k', count: 2, referenceImages: ['https://example.com/a.png'] })).toEqual({
      path: '/images/generations', body: { model: 'seedream-4.5', prompt: '产品', size: '1:1', resolution: '4K', n: 2, image_urls: ['https://example.com/a.png'] },
    });
  });
  it('validates limits instead of silently discarding images', () => {
    expect(() => buildApimartImageRequest({ prompt: 'test', count: 15, referenceImages: ['https://example.com/a.png'] })).toThrow('15');
    expect(() => buildApimartImageRequest({ prompt: 'test', model: 'doubao-seedream-4-5-251128' })).toThrow('模型');
    expect(() => buildApimartVideoRequest({ prompt: 'test', resolution: 'std', referenceImages: ['https://example.com/a.png', 'https://example.com/b.png'] })).toThrow('首帧');
    expect(() => buildApimartVideoRequest({ prompt: 'test', duration: 8 })).toThrow('5 秒');
    expect(() => buildApimartVideoRequest({ prompt: 'test', referenceImages: ['data:image/png;base64,YQ=='] })).toThrow('HTTP(S)');
  });
  it('supports pro first/last frames with numeric duration', () => {
    const result = buildApimartVideoRequest({ prompt: 'test', duration: '10', referenceImages: ['https://example.com/a.png', 'https://example.com/b.png'] });
    expect(result.path).toBe('/videos/generations');
    expect(result.body).toMatchObject({ mode: 'pro', duration: 10, image_urls: ['https://example.com/a.png', 'https://example.com/b.png'] });
    expect(result.body).not.toHaveProperty('audio');
  });
  it('reads array submissions, status objects and API errors', () => {
    expect(apimartTaskIds(unwrapApimartPayload({ code: 200, data: [{ task_id: 'task_1' }, { task_id: 'task_2' }] }))).toEqual(['task_1', 'task_2']);
    expect(unwrapApimartPayload({ code: 200, data: { id: 'task_1', status: 'completed' } })).toEqual({ id: 'task_1', status: 'completed' });
    expect(normalizeApimartTaskStatus('cancelled')).toBe('cancelled');
    expect(() => unwrapApimartPayload({ success: false, message: 'invalid token' })).toThrow('invalid token');
    expect(() => unwrapApimartPayload({ error: { message: '余额不足' } })).toThrow('余额不足');
  });
});
