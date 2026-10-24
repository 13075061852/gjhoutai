/**
 * 本地假模型服务（仅用于验证链路，不接入生产流量）。
 *
 * 模拟一个 OpenAI 兼容的 /v1/chat/completions：
 *   第一次请求 → 流式返回一个工具调用（data_overview）
 *   带工具结果后的请求 → 流式返回一段文字
 * 用途：在没有任何模型密钥的情况下验证 pi 会话、工具执行、SSE 回传是否打通。
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8791);

const sse = (response, chunks) => {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  let index = 0;
  const timer = setInterval(() => {
    if (index >= chunks.length) {
      clearInterval(timer);
      response.write('data: [DONE]\n\n');
      response.end();
      return;
    }
    const chunk = chunks[index++];
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }, 20);
  response.on('close', () => clearInterval(timer));
};

const collect = (request) => new Promise((resolve) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); }
  });
});

const delta = (payload, content = '', toolCalls) => ({
  id: 'mock-1',
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model: payload.model || 'mock-model',
  choices: [{
    index: 0,
    delta: {
      ...(content ? { content } : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    },
    finish_reason: null,
  }],
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.endsWith('/models')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model' }] }));
    return;
  }
  if (!url.pathname.endsWith('/chat/completions')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":{"message":"not found"}}');
    return;
  }

  const payload = await collect(request);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const hasToolResult = messages.some((message) => message.role === 'tool');
  console.log(`[mock] 收到请求 messages=${messages.length} tool结果=${hasToolResult}`);

  if (!hasToolResult) {
    sse(response, [
      delta(payload, '', [{
        index: 0,
        id: 'call_mock_1',
        type: 'function',
        function: { name: 'data_overview', arguments: '{}' },
      }]),
      { ...delta(payload), choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    ]);
    return;
  }

  sse(response, [
    delta(payload, '链路验证通过：'),
    delta(payload, '工具已执行'),
    delta(payload, '并回传。'),
    { ...delta(payload), choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 } },
  ]);
});

server.listen(PORT, '127.0.0.1', () => console.log(`[mock] 假模型服务：http://127.0.0.1:${PORT}/v1`));
