import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const directory = await mkdtemp(path.join(tmpdir(), 'gjh-pi-search-test-'));
let mode = 'success';
let requestBody;
let requestPath;
const provider = http.createServer(async (request, response) => {
  requestPath = request.url;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requestBody = JSON.parse(Buffer.concat(chunks).toString());
  if (mode === 'failure') { response.writeHead(400); response.end('search not supported'); return; }
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const events = mode === 'ungrounded' ? [] : [
    { type: 'content_block_start', content_block: { type: 'server_tool_use', name: 'web_search', id: 'search1', input: { query: '标准' } } },
    { type: 'content_block_start', content_block: { type: 'web_search_tool_result', tool_use_id: 'search1', content: [{ type: 'web_search_result', title: '标准原文', url: 'https://example.com/standard' }] } },
  ];
  events.push({ type: 'content_block_delta', delta: { type: 'text_delta', text: '已找到公开标准。' } });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
process.env.AI_AGENT_DIR = directory;
process.env.PI_CODING_AGENT_DIR = directory;
process.env.AI_PROVIDER_ID = 'deepseek';
process.env.AI_MODEL = 'deepseek:deepseek-chat';
process.env.AI_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`;
process.env.AI_API_KEY = 'test-only';
const { createBusinessSession, searchWeb, sweepInterval } = await import('./runtime.mjs');
const user = { id: 'test', username: 'test', department: '测试部' };
after(async () => { clearInterval(sweepInterval); provider.closeAllConnections(); await new Promise((resolve) => provider.close(resolve)); await rm(directory, { recursive: true, force: true }); });

test('loads pinned built-in search without filesystem/shell tools or unsupported URL tool', async () => {
  const session = await createBusinessSession({ user });
  try {
    const names = session.getActiveToolNames();
    assert(names.includes('web_search'));
    for (const name of ['read', 'write', 'edit', 'bash', 'url_context']) assert(!names.includes(name), name);
  } finally { session.dispose(); }
});

test('legacy bridge executes the real plugin and normalizes sources', async () => {
  mode = 'success';
  const result = await searchWeb({ user, query: '查询公开标准', signal: new AbortController().signal });
  assert.equal(result.provider, 'pi-web-search');
  assert.equal(result.nativeSearchUsed, true);
  assert.equal(result.results[0].url, 'https://example.com/standard');
  assert.match(result.context, /已找到公开标准/);
  assert.equal(requestPath, '/anthropic/v1/messages');
  assert.equal(requestBody.tools[0].name, 'web_search');
});

test('provider error is a failure, not a successful tool answer or a fallback', async () => {
  mode = 'failure';
  await assert.rejects(searchWeb({ user, query: '搜索', signal: new AbortController().signal }), /400/);
});

test('rejects ungrounded model output as search evidence', async () => {
  mode = 'ungrounded';
  await assert.rejects(searchWeb({ user, query: '搜索', signal: new AbortController().signal }), /未返回原生联网搜索证据/);
});

test('validates inputs and cancellation before calling a provider', async () => {
  await assert.rejects(searchWeb({ user, query: '' }), /为空或过长/);
  await assert.rejects(searchWeb({ user, query: '搜索', urls: ['file:///etc/passwd'] }), /公开 HTTP/);
  await assert.rejects(searchWeb({ user, query: '搜索', signal: AbortSignal.abort() }), { name: 'AbortError' });
});
