import { describe, expect, it } from 'vitest';
import {
  buildLiblibImageRequest,
  buildLiblibVideoRequest,
  createLiblibSignature,
  createLiblibSignedUrl,
  getLiblibImageDimensions,
  LIBLIB_IMAGE_MODELS,
  LIBLIB_VIDEO_MODELS,
  normalizeLiblibTaskStatus,
} from './liblibai';

describe('LiblibAI signing', () => {
  it('creates the documented HMAC-SHA1 URL-safe signature', async () => {
    await expect(createLiblibSignature(
      '/api/generate/status',
      'KppKsn7ezZxhi6lIDjbo7YyVYzanSu2d',
      '1725458584000',
      'random1232',
    )).resolves.toBe('vNgErkUMaB_MCsZum7xMPH21BYQ');
  });

  it('adds all authentication query parameters', async () => {
    const url = await createLiblibSignedUrl(
      'https://openapi.liblibai.cloud/',
      '/api/generate/status',
      { accessKey: 'access', secretKey: 'secret' },
      { timestamp: '1000', nonce: 'nonce' },
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/generate/status');
    expect(parsed.searchParams.get('AccessKey')).toBe('access');
    expect(parsed.searchParams.get('Timestamp')).toBe('1000');
    expect(parsed.searchParams.get('SignatureNonce')).toBe('nonce');
    expect(parsed.searchParams.get('Signature')).toBeTruthy();
  });
});

describe('LiblibAI media helpers', () => {
  it('maps aspect ratios to Seedream 4.5 compatible dimensions', () => {
    expect(getLiblibImageDimensions('16:9', '2k')).toEqual({ width: 2560, height: 1440 });
    expect(getLiblibImageDimensions('9:16', '4k')).toEqual({ width: 2160, height: 3840 });
  });

  it('normalizes asynchronous task statuses', () => {
    expect(normalizeLiblibTaskStatus(1)).toBe('submitted');
    expect(normalizeLiblibTaskStatus(2)).toBe('processing');
    expect(normalizeLiblibTaskStatus(5)).toBe('completed');
    expect(normalizeLiblibTaskStatus(6)).toBe('failed');
  });

  it('builds the Seedream 4.5 request with the documented template', () => {
    expect(buildLiblibImageRequest({
      prompt: '产品海报',
      aspectRatio: '16:9',
      resolution: '2k',
      count: 2,
    })).toMatchObject({
      path: '/api/generate/seedreamV4',
      body: {
        templateUuid: '0b6bad2fd350433ebb5abc7eb91f2ec9',
        generateParams: {
          model: 'doubao-seedream-4-5-251128',
          width: 2560,
          height: 1440,
          imgCount: 2,
        },
      },
    });
  });

  it('routes every built-in image model family to its documented endpoint', () => {
    const common = { prompt: '产品海报', aspectRatio: '1:1', resolution: '2k', count: 1 };
    expect(buildLiblibImageRequest({ ...common, model: 'doubao-seedream-4-0-250828' }).path)
      .toBe('/api/generate/seedreamV4');
    expect(buildLiblibImageRequest({ ...common, model: 'kontext-pro' }).path)
      .toBe('/api/generate/kontext/text2img');
    expect(buildLiblibImageRequest({ ...common, model: 'kontext-max', referenceImages: ['https://example.com/a.jpg'] }).path)
      .toBe('/api/generate/kontext/img2img');
    expect(buildLiblibImageRequest({ ...common, model: 'smart-img1' }).path)
      .toBe('/api/generate/smart-img1/generate');
    expect(buildLiblibImageRequest({ ...common, model: 'libdream' }).path)
      .toBe('/api/generate/libDream');
    expect(buildLiblibImageRequest({ ...common, model: 'libedit', referenceImages: ['https://example.com/a.jpg'] }).path)
      .toBe('/api/generate/libEdit');
    expect(buildLiblibImageRequest({ ...common, model: 'libedit-v2', referenceImages: ['https://example.com/a.jpg'] }).path)
      .toBe('/api/generate/libEditV2');
    expect(buildLiblibImageRequest({ ...common, model: 'star-3-alpha' }).path)
      .toBe('/api/generate/webui/text2img/ultra');
    expect(buildLiblibImageRequest({ ...common, model: '21df5d84cca74f7a885ba672b5a80d19' })).toMatchObject({
      path: '/api/generate/webui/text2img',
      body: { generateParams: { checkPointId: '21df5d84cca74f7a885ba672b5a80d19' } },
    });
    expect(() => buildLiblibImageRequest({ ...common, model: 'libedit' }))
      .toThrow('需要至少一个参考图');
  });

  it('selects Kling text-to-video and image-to-video endpoints', () => {
    expect(buildLiblibVideoRequest({
      prompt: '镜头向前推进',
      model: 'kling-v2-6',
      aspectRatio: '9:16',
      duration: 10,
    })).toMatchObject({
      path: '/api/generate/video/kling/text2video',
      body: {
        templateUuid: '61cd8b60d340404394f2a545eeaf197a',
        generateParams: { aspectRatio: '9:16', duration: '10', mode: 'std', sound: 'on' },
      },
    });

    expect(buildLiblibVideoRequest({
      prompt: '人物转头',
      model: 'kling-v2-6',
      referenceImages: ['https://example.com/start.jpg'],
    })).toMatchObject({
      path: '/api/generate/video/kling/img2video',
      body: {
        templateUuid: '180f33c6748041b48593030156d2a71d',
        generateParams: { images: ['https://example.com/start.jpg'] },
      },
    });
  });

  it('routes Kling multi-image and O1 requests', () => {
    expect(buildLiblibVideoRequest({
      prompt: '角色互动',
      model: 'kling-v2-6',
      referenceImages: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    })).toMatchObject({
      path: '/api/generate/video/kling/multiImg2video',
      body: {
        templateUuid: 'ca01e798b4424587b0dfdb98b089da05',
        generateParams: {
          referenceImages: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
        },
      },
    });

    expect(buildLiblibVideoRequest({
      prompt: '替换画面主体',
      model: 'kling-video-o1',
      referenceImages: ['https://example.com/start.jpg'],
    })).toMatchObject({
      path: '/api/generate/video/kling/omni-video',
      body: {
        templateUuid: '9f3a7c4e8b2d4f1a9c6e5d7b0a2e4c81',
        generateParams: {
          model: 'kling-video-o1',
          images: [{ image_url: 'https://example.com/start.jpg', type: 'start_frame' }],
        },
      },
    });
  });

  it('exposes all documented built-in model choices', () => {
    expect(LIBLIB_IMAGE_MODELS.map(([value]) => value)).toEqual([
      'doubao-seedream-4-5-251128',
      'doubao-seedream-4-0-250828',
      'kontext-pro',
      'kontext-max',
      'smart-img1',
      'libdream',
      'libedit',
      'libedit-v2',
      'star-3-alpha',
    ]);
    expect(LIBLIB_VIDEO_MODELS.map(([value]) => value)).toEqual([
      'kling-video-o1',
      'kling-v2-6',
      'kling-v2-5-turbo',
      'kling-v2-1-master',
      'kling-v2-1',
      'kling-v2-master',
      'kling-v1-6',
    ]);
  });
});
