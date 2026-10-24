/** Catalog and response handling still used by the current configuration page. */
export const APIMART_DEFAULT_BASE_URL = 'https://api.apimart.ai/v1';
export const APIMART_IMAGE_MODELS: Array<[string, string]> = [['seedream-4.5', 'Seedream 4.5']];
export const APIMART_VIDEO_MODELS: Array<[string, string]> = [['kling-v2-6', '可灵 2.6']];
export function unwrapApimartPayload(payload: any) {
  if (payload?.error || payload?.success === false || (payload?.code !== undefined && Number(payload.code) !== 200)) {
    throw new Error(payload?.error?.message || payload?.message || payload?.msg || 'APIMart 请求失败');
  }
  return payload?.data ?? payload;
}
