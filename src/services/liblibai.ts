export const LIBLIB_DEFAULT_BASE_URL = 'https://openapi.liblibai.cloud';
export const LIBLIB_STATUS_PATH = '/api/generate/status';
export const LIBLIB_IMAGE_PATH = '/api/generate/seedreamV4';
export const LIBLIB_KONTEXT_TEXT_PATH = '/api/generate/kontext/text2img';
export const LIBLIB_KONTEXT_IMAGE_PATH = '/api/generate/kontext/img2img';
export const LIBLIB_IMG1_PATH = '/api/generate/smart-img1/generate';
export const LIBLIB_LIBDREAM_PATH = '/api/generate/libDream';
export const LIBLIB_LIBEDIT_PATH = '/api/generate/libEdit';
export const LIBLIB_LIBEDIT_V2_PATH = '/api/generate/libEditV2';
export const LIBLIB_STAR_TEXT_PATH = '/api/generate/webui/text2img/ultra';
export const LIBLIB_STAR_IMAGE_PATH = '/api/generate/webui/img2img/ultra';
export const LIBLIB_CUSTOM_TEXT_PATH = '/api/generate/webui/text2img';
export const LIBLIB_TEXT_VIDEO_PATH = '/api/generate/video/kling/text2video';
export const LIBLIB_IMAGE_VIDEO_PATH = '/api/generate/video/kling/img2video';
export const LIBLIB_MULTI_IMAGE_VIDEO_PATH = '/api/generate/video/kling/multiImg2video';
export const LIBLIB_OMNI_VIDEO_PATH = '/api/generate/video/kling/omni-video';

export const LIBLIB_SEEDREAM_45_MODEL = 'doubao-seedream-4-5-251128';
export const LIBLIB_SEEDREAM_45_TEMPLATE = '0b6bad2fd350433ebb5abc7eb91f2ec9';
export const LIBLIB_KONTEXT_TEXT_TEMPLATE = 'fe9928fde1b4491c9b360dd24aa2b115';
export const LIBLIB_KONTEXT_IMAGE_TEMPLATE = '1c0a9712b3d84e1b8a9f49514a46d88c';
export const LIBLIB_IMG1_TEMPLATE = '86c58ea26e9a45bd9f562c6306c17c0f';
export const LIBLIB_LIBDREAM_TEMPLATE = 'aa835a39c1a14cfca47c6fc941137c51';
export const LIBLIB_LIBEDIT_TEMPLATE = 'cd3a6751086b4483ba5f0523aef53a79';
export const LIBLIB_LIBEDIT_V2_TEMPLATE = 'c92f91c771db42e2b5dbff66e2e4f7a2';
export const LIBLIB_STAR_TEXT_TEMPLATE = '5d7e67009b344550bc1aa6ccbfa1d7f4';
export const LIBLIB_STAR_IMAGE_TEMPLATE = '07e00af4fc464c7ab55ff906f8acf1b7';
export const LIBLIB_CUSTOM_TEXT_TEMPLATE = 'e10adc3949ba59abbe56e057f20f883e';
export const LIBLIB_KLING_TEXT_TEMPLATE = '61cd8b60d340404394f2a545eeaf197a';
export const LIBLIB_KLING_IMAGE_TEMPLATE = '180f33c6748041b48593030156d2a71d';
export const LIBLIB_KLING_MULTI_IMAGE_TEMPLATE = 'ca01e798b4424587b0dfdb98b089da05';
export const LIBLIB_KLING_OMNI_TEMPLATE = '9f3a7c4e8b2d4f1a9c6e5d7b0a2e4c81';

export const LIBLIB_IMAGE_MODELS: Array<[string, string]> = [
  [LIBLIB_SEEDREAM_45_MODEL, 'Seedream 4.5'],
  ['doubao-seedream-4-0-250828', 'Seedream 4.0'],
  ['kontext-pro', 'F.1 Kontext Pro'],
  ['kontext-max', 'F.1 Kontext Max'],
  ['smart-img1', '智能算法 IMG1'],
  ['libdream', 'LibDream'],
  ['libedit', 'LibEdit'],
  ['libedit-v2', 'LibEdit V2'],
  ['star-3-alpha', '星流 Star-3 Alpha'],
];

export const LIBLIB_VIDEO_MODELS: Array<[string, string]> = [
  ['kling-video-o1', '可灵 O1'],
  ['kling-v2-6', '可灵 2.6'],
  ['kling-v2-5-turbo', '可灵 2.5 Turbo'],
  ['kling-v2-1-master', '可灵 2.1 Master'],
  ['kling-v2-1', '可灵 2.1'],
  ['kling-v2-master', '可灵 2.0 Master'],
  ['kling-v1-6', '可灵 1.6'],
];

export type LiblibCredentials = {
  accessKey: string;
  secretKey: string;
};

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

export const createLiblibSignature = async (
  path: string,
  secretKey: string,
  timestamp: string,
  nonce: string,
) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${path}&${timestamp}&${nonce}`),
  );
  return bytesToBase64Url(new Uint8Array(signature));
};

const createNonce = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  const values = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

export const createLiblibSignedUrl = async (
  baseUrl: string,
  path: string,
  credentials: LiblibCredentials,
  options: { timestamp?: string; nonce?: string } = {},
) => {
  const timestamp = options.timestamp || String(Date.now());
  const nonce = options.nonce || createNonce();
  const signature = await createLiblibSignature(path, credentials.secretKey, timestamp, nonce);
  const query = new URLSearchParams({
    AccessKey: credentials.accessKey,
    Signature: signature,
    Timestamp: timestamp,
    SignatureNonce: nonce,
  });
  return `${String(baseUrl || LIBLIB_DEFAULT_BASE_URL).replace(/\/+$/, '')}${path}?${query}`;
};

const IMAGE_DIMENSIONS: Record<string, Record<string, [number, number]>> = {
  '2k': {
    '16:9': [2560, 1440],
    '4:3': [2304, 1728],
    '1:1': [2048, 2048],
    '3:4': [1728, 2304],
    '9:16': [1440, 2560],
  },
  '4k': {
    '16:9': [3840, 2160],
    '4:3': [3072, 2304],
    '1:1': [2880, 2880],
    '3:4': [2304, 3072],
    '9:16': [2160, 3840],
  },
};

export const getLiblibImageDimensions = (aspectRatio = '1:1', resolution = '2k') => {
  const group = IMAGE_DIMENSIONS[String(resolution).toLowerCase()] || IMAGE_DIMENSIONS['2k'];
  const [width, height] = group[aspectRatio] || group['1:1'];
  return { width, height };
};

export const buildLiblibImageRequest = (params: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  count?: number;
  referenceImages?: string[];
}) => {
  const dimensions = getLiblibImageDimensions(params.aspectRatio, params.resolution);
  const model = params.model || LIBLIB_SEEDREAM_45_MODEL;
  const referenceImages = params.referenceImages?.filter(Boolean) || [];
  const baseParams = {
    prompt: params.prompt,
    imgCount: Number(params.count || 1),
  };

  if (model === 'kontext-pro' || model === 'kontext-max') {
    const hasReference = referenceImages.length > 0;
    return {
      path: hasReference ? LIBLIB_KONTEXT_IMAGE_PATH : LIBLIB_KONTEXT_TEXT_PATH,
      body: {
        templateUuid: hasReference ? LIBLIB_KONTEXT_IMAGE_TEMPLATE : LIBLIB_KONTEXT_TEXT_TEMPLATE,
        generateParams: {
          ...baseParams,
          prompt: params.prompt,
          aspectRatio: params.aspectRatio || '1:1',
          guidance_scale: 3.5,
          ...(hasReference
            ? { image_list: referenceImages.slice(0, 4) }
            : { model: model === 'kontext-max' ? 'max' : 'pro' }),
        },
      },
    };
  }

  if (model === 'smart-img1') {
    return {
      path: LIBLIB_IMG1_PATH,
      body: {
        templateUuid: LIBLIB_IMG1_TEMPLATE,
        generateParams: {
          ...baseParams,
          aspectRatio: params.aspectRatio || 'auto',
          quality: 'normal',
          image_list: referenceImages.length ? referenceImages.slice(0, 4) : undefined,
        },
      },
    };
  }

  if (model === 'libdream') {
    return {
      path: LIBLIB_LIBDREAM_PATH,
      body: {
        templateUuid: LIBLIB_LIBDREAM_TEMPLATE,
        generateParams: {
          ...baseParams,
          usePreLlm: false,
          width: dimensions.width,
          height: dimensions.height,
          scale: 2.5,
          seed: -1,
        },
      },
    };
  }

  if (model === 'libedit' || model === 'libedit-v2') {
    if (!referenceImages.length) {
      throw new Error(`${model === 'libedit-v2' ? 'LibEdit V2' : 'LibEdit'} 需要至少一个参考图公网地址`);
    }
    const isV2 = model === 'libedit-v2';
    return {
      path: isV2 ? LIBLIB_LIBEDIT_V2_PATH : LIBLIB_LIBEDIT_PATH,
      body: {
        templateUuid: isV2 ? LIBLIB_LIBEDIT_V2_TEMPLATE : LIBLIB_LIBEDIT_TEMPLATE,
        generateParams: {
          ...baseParams,
          promptMagic: 0,
          scale: 0.5,
          seed: -1,
          ...(isV2 ? dimensions : {}),
          image_urls: referenceImages.slice(0, 4),
        },
      },
    };
  }

  if (model === 'star-3-alpha') {
    const hasReference = referenceImages.length > 0;
    return {
      path: hasReference ? LIBLIB_STAR_IMAGE_PATH : LIBLIB_STAR_TEXT_PATH,
      body: {
        templateUuid: hasReference ? LIBLIB_STAR_IMAGE_TEMPLATE : LIBLIB_STAR_TEXT_TEMPLATE,
        generateParams: hasReference
          ? {
            ...baseParams,
            width: dimensions.width,
            height: dimensions.height,
            cfgScale: 3.5,
            randnSource: 0,
            seed: -1,
            clipSkip: 2,
            sampler: 1,
            steps: 30,
            restoreFaces: 0,
            controlNet: [{
              unitOrder: 0,
              sourceImage: referenceImages[0],
              width: dimensions.width,
              height: dimensions.height,
              preprocessor: 68,
              annotationParameters: { entityControl: {} },
              model: '6f1767b5f9eb47289525d06ae882a0e5',
              controlWeight: 0.9,
              startingControlStep: 0,
              endingControlStep: 1,
              pixelPerfect: 1,
              controlMode: 0,
              resizeMode: 1,
            }],
          }
          : {
            ...baseParams,
            imageSize: dimensions,
            steps: 30,
          },
      },
    };
  }

  const isSeedream = model === LIBLIB_SEEDREAM_45_MODEL || model === 'doubao-seedream-4-0-250828';
  if (!isSeedream) {
    return {
      path: LIBLIB_CUSTOM_TEXT_PATH,
      body: {
        templateUuid: LIBLIB_CUSTOM_TEXT_TEMPLATE,
        generateParams: {
          ...baseParams,
          checkPointId: model,
          negativePrompt: '',
          sampler: 15,
          steps: 20,
          cfgScale: 7,
          width: dimensions.width,
          height: dimensions.height,
          randnSource: 0,
          seed: -1,
          restoreFaces: 0,
        },
      },
    };
  }

  return {
    path: LIBLIB_IMAGE_PATH,
    body: {
      templateUuid: LIBLIB_SEEDREAM_45_TEMPLATE,
      generateParams: {
        ...baseParams,
        width: dimensions.width,
        height: dimensions.height,
        model,
        sequentialImageGeneration: 'disabled',
        referenceImages: referenceImages.length ? referenceImages.slice(0, 14) : undefined,
      },
    },
  };
};

export const buildLiblibVideoRequest = (params: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: number | string;
  referenceImages?: string[];
}) => {
  const model = params.model || 'kling-v2-6';
  const referenceImages = params.referenceImages?.filter(Boolean) || [];
  const hasReference = referenceImages.length > 0;
  if (model === 'kling-video-o1') {
    return {
      path: LIBLIB_OMNI_VIDEO_PATH,
      body: {
        templateUuid: LIBLIB_KLING_OMNI_TEMPLATE,
        generateParams: {
          prompt: params.prompt,
          model,
          duration: String(params.duration || 5),
          aspectRatio: params.aspectRatio || '16:9',
          images: referenceImages.length
            ? referenceImages.slice(0, 2).map((url, index) => ({
              image_url: url,
              type: index === 0 ? 'start_frame' : 'end_frame',
            }))
            : undefined,
        },
      },
    };
  }

  if (referenceImages.length > 1) {
    return {
      path: LIBLIB_MULTI_IMAGE_VIDEO_PATH,
      body: {
        templateUuid: LIBLIB_KLING_MULTI_IMAGE_TEMPLATE,
        generateParams: {
          prompt: params.prompt,
          model,
          promptMagic: 1,
          mode: 'pro',
          referenceImages: referenceImages.slice(0, 7),
          aspectRatio: params.aspectRatio || '16:9',
          duration: String(params.duration || 5),
        },
      },
    };
  }

  return {
    path: hasReference ? LIBLIB_IMAGE_VIDEO_PATH : LIBLIB_TEXT_VIDEO_PATH,
    body: {
      templateUuid: hasReference ? LIBLIB_KLING_IMAGE_TEMPLATE : LIBLIB_KLING_TEXT_TEMPLATE,
      generateParams: {
        prompt: params.prompt,
        model,
        duration: String(params.duration || 5),
        mode: model === 'kling-v2-5-turbo' ? 'pro' : 'std',
        sound: model === 'kling-v2-6' ? 'on' : undefined,
        ...(hasReference
          ? (model === 'kling-v2-6'
            ? { images: referenceImages.slice(0, 1) }
            : { startFrame: referenceImages[0] })
          : { aspectRatio: params.aspectRatio || '16:9' }),
      },
    },
  };
};

export const normalizeLiblibTaskStatus = (value: unknown) => {
  const status = Number(value);
  if (status === 5) return 'completed';
  if (status === 6) return 'failed';
  if (status === 2 || status === 3 || status === 4) return 'processing';
  return 'submitted';
};

export const unwrapLiblibPayload = (payload: any) => {
  if (payload?.code && Number(payload.code) !== 0) {
    throw new Error(payload?.msg || payload?.message || `LiblibAI 错误码 ${payload.code}`);
  }
  return payload?.data ?? payload;
};
