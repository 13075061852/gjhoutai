import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { MAX_SPECTRUM_IMAGE_BYTES, spectrumImageTools, spectrumRecordForModel, buildSpectrumListing } from './spectrum-tools.mjs';

// Transport fixture only; no test pretends this one-pixel image is a classified spectrum.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3i0AAAAASUVORK5CYII=', 'base64');
const record = { id: 'upload-1789603008060-test', title: '4830-BKF 干燥 DSC', spectrumType: 'DSC', date: '2026-09-16', hasImage: true };
const goodResponse = () => new Response(png, { headers: { 'content-type': 'image/png' } });
const fixture = (options = {}) => {
  let calls = 0;
  const context = { cookie: 'gjh_session=PRIVATE_TEST_COOKIE', supportsImages: true, ...options.context };
  const tool = spectrumImageTools(context, {
    getRecords: options.getRecords || (() => [record]),
    fetchImage: async (...args) => { calls++; return (options.fetchImage || goodResponse)(...args); },
  })[0];
  return { context, tool, calls: () => calls, run: (params = { id: record.id }, signal) => tool.execute('call-1', params, signal) };
};

const library = [
  { ...record, id: 'tga', title: '长春4830BKF TGA', spectrumType: 'TGA', category: '长春', tags: [], date: '2026-10-20' },
  { ...record, id: 'ftir-ash', title: '长春PBT 4830BKF 灰份 FTIR', spectrumType: 'FTIR', category: '长春', tags: [], date: '2026-09-05' },
  { ...record, id: 'ftir-normal', title: '长春PBT 4830BKF FTIR', spectrumType: 'FTIR', category: '长春', tags: [], date: '2026-09-05' },
  { ...record, id: 'dsc', title: '长春4830-BKF DSC', spectrumType: 'DSC', category: '长春', tags: [], date: '2026-04-25' },
  { ...record, id: 'nearby', title: '4830-BKX DSC', spectrumType: 'DSC', category: '长春', tags: [], date: '2026-10-21' },
];

test('selects DSC/TGA/FTIR each once before truncation, not TGA plus two FTIRs', () => {
  const result = buildSpectrumListing(library, { keyword: '4830bkf', limit: 1 }, { question: '查一下长春4830bkf的图谱' });
  assert.equal(result.returned, 1);
  assert.equal(result.matchedTotal, 4);
  assert.deepEqual(result.spectrumGallery.entries.map(item => item.registeredType), ['DSC', 'TGA', 'FTIR']);
  assert.deepEqual(result.spectrumGallery.entries.map(item => item.id), ['dsc', 'tga', 'ftir-normal']);
  assert.deepEqual(result.spectrumGallery.missingTypes, []);
  assert.ok(result.spectrumGallery.entries.every(item => item.typeVerified === false));
});

test('finds an older rare DSC beyond 200 repeated FTIR matches and normalizes model spaces/dashes', () => {
  const many = [...Array.from({ length: 230 }, (_, n) => ({ ...library[2], id: `ftir-${n}` })), library[0], library[3]];
  const result = buildSpectrumListing(many, { keyword: '长春4830-bkf', limit: 3 });
  assert.equal(result.matchedTotal, 232);
  assert.deepEqual(result.spectrumGallery.entries.map(item => item.registeredType), ['DSC', 'TGA', 'FTIR']);
});

test('skips missing images and duplicate ids, reports missing slots without using a second FTIR', () => {
  const result = buildSpectrumListing(library.filter(item => item.id !== 'dsc').map(item => item.id === 'tga' ? { ...item, hasImage: false } : item), { keyword: '4830bkf' });
  assert.deepEqual(result.spectrumGallery.entries.map(item => item.registeredType), ['FTIR']);
  assert.deepEqual(result.spectrumGallery.missingTypes, ['DSC', 'TGA']);
  const duplicates = buildSpectrumListing([library[3], library[3]], { keyword: '4830bkf' });
  assert.equal(duplicates.spectrumGallery.entries.length, 0);
});

test('does not let model filters hide other types unless the user actually requested just one type', () => {
  assert.equal(buildSpectrumListing(library, { keyword: '4830bkf', type: 'FTIR' }, { question: '查看4830BKF图谱' }).spectrumGallery.entries.length, 3);
  const one = buildSpectrumListing(library, { keyword: '4830bkf' }, { question: '找4830BKF的FTIR图谱' });
  assert.deepEqual(one.spectrumGallery.entries.map(item => item.registeredType), ['FTIR']);
  const broad = buildSpectrumListing(library, { keyword: '4830' }, { question: '查一下4830bkf的图谱' });
  assert.ok(broad.records.every(item => !item.title.includes('BKX')));
  assert.equal(broad.spectrumGallery.entries[0].id, 'dsc');
});

test('listing reports stored DSC as unverified metadata, not as a recognized image type', () => {
  const result = spectrumRecordForModel(record);
  assert.equal(result.spectrumType, 'DSC');
  assert.equal(result.registeredType, 'DSC');
  assert.equal(result.typeSource, 'stored_metadata');
  assert.equal(result.typeVerified, false);
  assert.equal(result.imageProvided, false);
  assert.equal(result.imageUrl, `/gjhoutai/api/blob/spectrum/${record.id}`);
  assert.equal(spectrumRecordForModel({ ...record, hasImage: false }).imageUrl, '');
});

test('supplies actual image bytes to the model, binds identity and preserves the registered/observed distinction', async () => {
  const f = fixture({ fetchImage: async (url, options) => {
    assert.equal(url, `http://127.0.0.1:8788/api/blob/spectrum/${record.id}?format=original`);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.cookie, 'gjh_session=PRIVATE_TEST_COOKIE');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return goodResponse();
  } });
  const result = await f.run({ id: record.id, cookie: 'forged', url: 'https://attacker.invalid' });
  assert.ok(!result.isError);
  const meta = JSON.parse(result.content[0].text);
  assert.equal(meta.registeredType, 'DSC');
  assert.equal(meta.imageProvided, true);
  assert.equal(meta.typeVerified, false); // Returning pixels is not an AI classification.
  assert.equal(meta.evidence.sha256, createHash('sha256').update(png).digest('hex'));
  assert.match(meta.review, /失重速率为TGA\/DTG/);
  assert.match(meta.review, /登记类型可能误标/);
  assert.equal(result.content[1].type, 'image');
  assert.equal(result.content[1].mimeType, 'image/png');
  assert.deepEqual(Buffer.from(result.content[1].data, 'base64'), png);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_COOKIE'));
});

test('pi OpenAI transport includes the real tool image in model input instead of only an imageUrl string', async () => {
  const { convertMessages } = await import('@earendil-works/pi-ai/api/openai-completions');
  const result = await fixture().run();
  const model = { provider: 'fixture', id: 'vision-fixture', api: 'openai-completions', input: ['text', 'image'] };
  const context = { messages: [
    { role: 'user', content: '核验这张谱图', timestamp: 1 },
    { role: 'assistant', ...model, model: model.id, content: [{ type: 'toolCall', id: 'call-1', name: 'read_spectrum_image', arguments: { id: record.id } }], stopReason: 'toolUse', timestamp: 2 },
    { role: 'toolResult', toolCallId: 'call-1', toolName: 'read_spectrum_image', content: result.content, isError: false, timestamp: 3 },
  ] };
  const messages = convertMessages(model, context, {});
  const images = messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'image_url');
  assert.equal(images.length, 1);
  assert.equal(images[0].image_url.url, `data:image/png;base64,${png.toString('base64')}`);
  const metadata = JSON.parse(messages.find(message => message.role === 'tool').content);
  assert.equal(metadata.registeredType, 'DSC');
  assert.equal(metadata.typeVerified, false);
});

test('missing login or image capability never fetches or pretends to inspect a picture', async () => {
  for (const [context, code] of [[{ cookie: '' }, 'login_required'], [{ supportsImages: false }, 'vision_unavailable'], [{ supportsImages: undefined }, 'vision_unavailable']]) {
    const f = fixture({ context });
    const result = await f.run();
    assert.equal(result.isError, true);
    assert.equal(result.details.code, code);
    assert.equal(f.calls(), 0);
    assert.equal(JSON.parse(result.content[0].text).imageProvided, false);
  }
});

test('rejects URLs, paths, missing or ambiguous ids and unavailable images without fetching', async () => {
  for (const id of ['../escape', 'https://attacker.invalid/x', '', 'a'.repeat(161)]) {
    const f = fixture();
    assert.equal((await f.run({ id })).details.code, 'invalid_id');
    assert.equal(f.calls(), 0);
  }
  for (const records of [[], [record, record], [{ ...record, hasImage: false }]]) {
    const f = fixture({ getRecords: () => records });
    assert.equal((await f.run()).isError, true);
    assert.equal(f.calls(), 0);
  }
});

test('honours main-service 401/403/404 instead of reading files directly or using another identity', async () => {
  for (const status of [401, 403, 404]) {
    const f = fixture({ fetchImage: () => new Response('denied', { status }) });
    const result = await f.run();
    assert.equal(result.isError, true);
    assert.equal(result.details.code, 'image_access_failed');
    assert.equal(f.calls(), 1);
    assert.equal(result.content.some(part => part.type === 'image'), false);
  }
});

test('rejects HTML, unsupported formats, empty files and MIME-spoofed bytes', async () => {
  for (const [data, mime] of [['<html>login</html>', 'text/html'], ['not png', 'image/png'], [Buffer.alloc(0), 'image/png'], [png, 'image/avif']]) {
    const result = await fixture({ fetchImage: () => new Response(data, { headers: { 'content-type': mime } }) }).run();
    assert.equal(result.isError, true);
    assert.equal(result.content.some(part => part.type === 'image'), false);
  }
});

test('bounds both declared and streamed byte counts and cancels an oversized stream', async () => {
  const oversized = await fixture({ fetchImage: () => new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(MAX_SPECTRUM_IMAGE_BYTES + 1) } }) }).run();
  assert.equal(oversized.details.code, 'image_too_large');
  let cancelled = false;
  const streamed = await fixture({ fetchImage: () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_SPECTRUM_IMAGE_BYTES + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'image/png' } }) }).run();
  assert.equal(streamed.details.code, 'image_too_large');
  assert.equal(cancelled, true);
});

test('allows no more than three HTTP image reads in one run, including parallel requests', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => f.run()));
  assert.equal(f.calls(), 3);
  assert.equal(results.filter(r => r.details.code === 'image_read_limit').length, 1);
  f.context.spectrumImageReads = 0; // Runtime resets this counter at the start of a new user run.
  assert.ok(!(await f.run()).isError);
});

test('supports pre-cancellation and sanitizes fetch failures without leaking login secrets', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture();
  assert.equal((await f.run(undefined, controller.signal)).details.code, 'aborted');
  assert.equal(f.calls(), 0);
  const result = await fixture({ fetchImage: () => { throw new Error('PRIVATE_TEST_COOKIE network internals'); } }).run();
  assert.equal(result.isError, true);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_COOKIE'));
});
