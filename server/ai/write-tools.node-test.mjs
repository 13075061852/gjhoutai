import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { businessWriteTools } from './write-tools.mjs';
let original;
beforeEach(() => { original = globalThis.fetch; });
afterEach(() => { globalThis.fetch = original; });

test('模型仅有准备工具，不存在可绕过用户确认的commit工具', async () => {
  const context = { cookie: 'gjh_session=secret', threadId: 'thread1', attachmentIds: ['file1'] };
  const tools = businessWriteTools(context);
  assert.deepEqual(tools.map((tool) => tool.name), ['prepare_business_change']);
  let body;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8788/api/business-actions/prepare');
    assert.equal(options.headers.cookie, context.cookie);
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ proposal: { id: 'proposal1', status: 'pending' } }), { status: 201 });
  };
  const result = await tools[0].execute('call1', { dataset: 'ash_records', operation: 'create', items: [{ data: { name: '真实材料' } }], threadId: 'forged' });
  assert.equal(body.threadId, 'thread1');
  assert.equal(result.details.proposal.id, 'proposal1');
  assert.match(result.content[0].text, /awaiting_confirmation/);
  assert.ok(!result.content[0].text.includes('secret'));
});

test('无登录上下文或非本轮附件都不能请求写入', async () => {
  globalThis.fetch = async () => { throw new Error('不应请求'); };
  assert.equal((await businessWriteTools()[0].execute('', { items: [] })).isError, true);
  const tool = businessWriteTools({ cookie: 'gjh_session=secret', threadId: 't', attachmentIds: ['own-file'] })[0];
  const result = await tool.execute('', { items: [{ attachmentId: 'someone-elses-file' }] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /本会话/);
});

test('主服务拒绝时必须返回失败，而不能告诉模型已经保存', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: '没有该页面的编辑权限' }), { status: 403 });
  const result = await businessWriteTools({ cookie: 'gjh_session=x', threadId: 't', attachmentIds: [] })[0].execute('', { items: [] });
  assert.equal(result.isError, true);
  assert.equal(result.details.error, true);
  assert.match(result.content[0].text, /没有该页面/);
});
