/** Authenticated, bounded spectrum image reads. A stored type is never visual evidence. */
import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import { config } from './config.mjs';
import { spectrumRecords, matchSpectrumRecords, normalizeSpectrumKeyword } from './data.mjs';

export const MAX_SPECTRUM_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_SPECTRUM_IMAGE_READS = 3;
const VALID_ID = /^[a-zA-Z0-9_-]{1,160}$/;
const imageUrl = (id) => `${config.appBasePath}/api/blob/spectrum/${encodeURIComponent(id)}`;

export function spectrumRecordForModel(record) {
  return {
    ...record,
    registeredType: record.spectrumType || null,
    typeSource: 'stored_metadata',
    typeVerified: false,
    imageProvided: false,
    imageAvailable: Boolean(record.hasImage),
    imageUrl: record.hasImage ? imageUrl(record.id) : '',
  };
}

export const SPECTRUM_DISPLAY_TYPES = ['DSC', 'TGA', 'FTIR'];
const modelTokens = (value) => [...String(value || '').matchAll(/\d{3,}[-\s]?[a-z][a-z0-9-]*/gi)]
  .map(match => normalizeSpectrumKeyword(match[0])).filter(token => !/^\d+(?:dsc|tga|ftir)$/.test(token));

/** Selection is deterministic and runs on ALL matches, not the first three rows. */
export function buildSpectrumListing(records, params = {}, { question } = {}) {
  const targets = modelTokens(question);
  const belongsToQuestion = (record) => !targets.length || modelTokens(`${record.title} ${record.code}`).some(token => targets.includes(token));
  const matches = matchSpectrumRecords(records, params).filter(belongsToQuestion);
  const requestedTypes = question === undefined ? (params.type ? [String(params.type).toUpperCase()] : SPECTRUM_DISPLAY_TYPES)
    : [...new Set((String(question).match(/DSC|TGA|FTIR/gi) || []).map(value => value.toUpperCase()))];
  const types = SPECTRUM_DISPLAY_TYPES.filter(type => !requestedTypes.length || requestedTypes.includes(type));
  // Model-supplied type filters must not hide DSC when the USER requested a full model lookup.
  const candidates = matchSpectrumRecords(records, { ...params, type: undefined }).filter(belongsToQuestion);
  const idCounts = new Map();
  for (const record of records) idCounts.set(record.id, (idCounts.get(record.id) || 0) + 1);
  const entries = types.flatMap(type => {
    const eligible = candidates.filter(record => record.spectrumType === type && record.hasImage && VALID_ID.test(record.id) && idCounts.get(record.id) === 1);
    eligible.sort((a, b) => String(b.date).localeCompare(String(a.date))
      || Number(/灰[份分]|ash/i.test(a.title)) - Number(/灰[份分]|ash/i.test(b.title))
      || String(a.id).localeCompare(String(b.id)));
    const record = eligible[0];
    return record ? [{ id: record.id, title: record.title, date: record.date, registeredType: type, typeVerified: false, imageUrl: imageUrl(record.id) }] : [];
  });
  const query = Object.fromEntries(['keyword', 'category', 'tag'].map(key => [key, String(params[key] || '')]));
  const gallery = {
    mode: 'one_per_type', scopeKey: JSON.stringify({ ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, normalizeSpectrumKeyword(value)])), types }), query,
    entries, requestedTypes: types, missingTypes: types.filter(type => !entries.some(entry => entry.registeredType === type)),
  };
  const limit = Math.max(1, Math.min(200, Math.floor(Number(params.limit) || 30)));
  const visible = matches.slice(0, limit);
  return {
    total: records.length, matchedTotal: matches.length, returned: visible.length,
    spectrumGallery: gallery,
    hint: 'spectrumGallery已按DSC/TGA/FTIR各选一张（存在可用图时），不受records截断影响；界面会自动展示，不能用第二张FTIR挤掉DSC。优先按entries的id读取图像核验；登记分类不是视觉结论，不能仅凭标题认定类型。',
    records: visible.map(spectrumRecordForModel),
  };
}

class SpectrumReadError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: message, code, typeVerified: false, imageProvided: false }) }],
  details: { error: true, code },
});
const discard = async (response) => { await response.body?.cancel().catch(() => {}); };
const matchesMime = (data, mime) => {
  if (mime === 'image/png') return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (mime === 'image/webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return false;
};
async function readBoundedImage(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_SPECTRUM_IMAGE_BYTES) {
    await discard(response);
    throw new SpectrumReadError('image_too_large', '谱图超过6MB，未提供图像，不能核验类型');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SpectrumReadError('empty_image', '谱图文件为空，不能核验类型');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SPECTRUM_IMAGE_BYTES) throw new SpectrumReadError('image_too_large', '谱图超过6MB，未提供图像，不能核验类型');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  if (!size) throw new SpectrumReadError('empty_image', '谱图文件为空，不能核验类型');
  return Buffer.concat(chunks, size);
}

export function spectrumImageTools(context = {}, { getRecords = spectrumRecords, fetchImage = (...args) => fetch(...args) } = {}) {
  return [{
    name: 'read_spectrum_image',
    label: '读取图谱图片',
    description: '按查询返回的精确id读取真实谱图图片，交给当前模型核验坐标轴和类型；登记的DSC/TGA/FTIR和标题不是识别结果。只读、登录权限校验、不改记录。最多查看回答中要分析/展示的3张，无法看图时必须标注登记类型未核验。',
    promptSnippet: 'read_spectrum_image: 读取真实图片后才可判断FTIR/TGA/DSC，不把登记类型当作图像识别',
    promptGuidelines: [
      '先 list_spectrum_records 取得精确id；分析/展示谱图前读取实际图片，不靠标题、文件名或登记类型判断。',
      '质量%/mg及其失重速率DTG曲线属于TGA/DTG；热流mW/W/g曲线才是DSC依据；峰朝下不代表DSC。',
      '图像与登记冲突时明确区分两者，不自动改库；不支持图片或读取失败时说明未核验。',
    ],
    parameters: Type.Object({ id: Type.String({ minLength: 1, maxLength: 160, pattern: VALID_ID.source, description: 'list_spectrum_records 返回的精确记录id，不接受URL或文件路径' }) }, { additionalProperties: false }),
    async execute(_id, params, signal) {
      try {
        signal?.throwIfAborted();
        if (!context.cookie) return fail('login_required', '缺少登录身份，未读取图片，不能核验类型');
        if (context.supportsImages !== true) return fail('vision_unavailable', '当前模型未声明图片输入能力，未读取图片。只能报告登记类型（尚未核验图像），不能声称已识别；请使用已配置且支持图片的模型或人工核对，不自动切换模型');
        const id = params?.id;
        if (typeof id !== 'string' || !VALID_ID.test(id)) return fail('invalid_id', '必须提供查询返回的精确记录id，不接受URL或文件路径');
        const matches = getRecords().filter(record => record.id === id);
        if (matches.length !== 1) return fail('ambiguous_record', '记录不存在或id重复，请重新查询定位，不能猜选图片');
        const record = matches[0];
        if (!record.hasImage) return fail('image_missing', '该记录没有可读取的图片，登记类型尚未核验');
        if ((context.spectrumImageReads || 0) >= MAX_SPECTRUM_IMAGE_READS) return fail('image_read_limit', '本轮最多读取3张谱图，请缩小范围后另行提问；其余登记类型未核验');
        context.spectrumImageReads = (context.spectrumImageReads || 0) + 1;
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
        // Fixed loopback + existing user cookie: main service applies its normal read permissions.
        const response = await fetchImage(`http://127.0.0.1:8788/api/blob/spectrum/${encodeURIComponent(id)}?format=original`, {
          method: 'GET', headers: { cookie: context.cookie, accept: 'image/png, image/jpeg, image/webp' },
          redirect: 'error', cache: 'no-store', signal: requestSignal,
        });
        if (!response.ok) {
          await discard(response);
          return fail('image_access_failed', response.status === 401 || response.status === 403 ? '登录已失效或没有读取图谱图片的权限，未核验类型' : '图谱图片读取失败，未核验类型');
        }
        const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
          await discard(response);
          return fail('invalid_image_type', '返回内容不是受支持的谱图图片，未核验类型');
        }
        const data = await readBoundedImage(response, requestSignal);
        if (!matchesMime(data, mimeType)) return fail('invalid_image_bytes', '图片内容与类型不符，未核验类型');
        const evidence = { mimeType, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
        return {
          content: [
            { type: 'text', text: JSON.stringify({
              ...spectrumRecordForModel(record), imageProvided: true, typeVerified: false,
              evidence,
              review: '以下为此id的实际图片，不是根据标题生成。现在核对纵轴单位/横轴/曲线：质量与失重速率为TGA/DTG，热流为DSC，波数与吸收/透过率为FTIR。登记类型可能误标；看不清轴或模型未实际收到图像就说明未核验，不编造结论。',
            }) },
            { type: 'image', mimeType, data: data.toString('base64') },
          ],
          details: { recordId: id, imageProvided: true, typeVerified: false, evidence },
        };
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return fail('aborted', '图片读取已取消，未核验类型');
        if (error instanceof SpectrumReadError) return fail(error.code, error.message);
        return fail('image_read_failed', '图片读取失败，未核验类型；不能把登记信息当作图像识别结果');
      }
    },
  }];
}
