import { expect, it } from 'vitest';
import { APIMART_DEFAULT_BASE_URL, APIMART_IMAGE_MODELS, APIMART_VIDEO_MODELS, unwrapApimartPayload } from './apimart';
it('keeps catalog settings and balance response parsing for the configuration page',()=>{
 expect(APIMART_DEFAULT_BASE_URL).toBe('https://api.apimart.ai/v1');expect(APIMART_IMAGE_MODELS.length).toBeGreaterThan(0);expect(APIMART_VIDEO_MODELS.length).toBeGreaterThan(0);
 expect(unwrapApimartPayload({code:200,data:{balance:1}})).toEqual({balance:1});
 expect(()=>unwrapApimartPayload({error:{message:'rejected'}})).toThrow('rejected');
});
