import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiAnalysis, aiToolLabel, createPlatformUrlResolver, startAiRun, streamAiRun } from './ai-analysis';

const streamOf = (frames: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
};

afterEach(() => { vi.restoreAllMocks(); });

describe('ai-analysis 客户端', () => {
  it('按顺序解析 SSE 增量事件并在 done 后结束', async () => {
    const frames = [
      'id: 1\ndata: {"seq":1,"at":1,"type":"start","runId":"r1","threadKey":"u:t"}\n\n',
      'id: 2\ndata: {"seq":2,"at":2,"type":"tool_start","toolCallId":"c1","name":"data_overview","args":{}}\n\n',
      'id: 3\ndata: {"seq":3,"at":3,"type":"text","delta":"命中"}\n\n',
      'id: 4\ndata: {"seq":4,"at":4,"type":"text","delta":" 3 条"}\n\n',
      ': ping\n\n',
      'id: 5\ndata: {"seq":5,"at":5,"type":"done","status":"completed"}\n\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(frames), { status: 200 }));

    const events: string[] = [];
    let text = '';
    await streamAiRun('r1', (event) => {
      events.push(event.type);
      if (event.type === 'text') text += event.delta;
    });

    expect(events).toEqual(['start', 'tool_start', 'text', 'text', 'done']);
    expect(text).toBe('命中 3 条');
  });

  it('登录失效时给出明确提示', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }));
    await expect(streamAiRun('r1', () => {})).rejects.toThrow('登录状态已失效');
  });

  it('发起运行只发送提问与线程标识', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ run: { id: 'run-1', threadKey: 'u:默认', status: 'running' } }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    ));

    const run = await startAiRun('查一下 320G6', { threadId: '默认' });
    expect(run.id).toBe('run-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/ai/runs');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: '查一下 320G6', threadId: '默认' });
  });

  it('上传附件时带上原始文件名与类型，并把附件 id 随提问发出', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ attachment: { id: 'up-1', name: '图谱.png', type: 'image/png', size: 12, kind: 'image', url: '/gjhoutai/api/ai/uploads/up-1' } }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    const file = new File([new Uint8Array([1, 2, 3])], '图谱 图.png', { type: 'image/png' });
    const attachment = await aiAnalysis.upload(file);
    expect(attachment.id).toBe('up-1');
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toContain('/api/ai/uploads');
    expect(uploadInit?.method).toBe('POST');
    expect((uploadInit?.headers as Record<string, string>)['x-file-name']).toBe(encodeURIComponent('图谱 图.png'));
    expect(uploadInit?.body).toBe(file);

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ run: { id: 'run-2', threadKey: 'u:默认', status: 'running' } }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    ));
    await startAiRun('看看这张图', { threadId: '默认', attachments: [{ id: 'up-1' }, { id: 'up-2' }] });
    const [, runInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(String(runInit?.body))).toEqual({
      prompt: '看看这张图',
      threadId: '默认',
      attachments: [{ id: 'up-1' }, { id: 'up-2' }],
    });
  });

  it('附件上传失败时把服务端提示原样抛出', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"单个附件不能超过 8 MB"}', { status: 400 }));
    await expect(aiAnalysis.upload(new File([new Uint8Array([1])], 'big.png', { type: 'image/png' }))).rejects.toThrow('单个附件不能超过 8 MB');
  });

  it('把浏览器上传连接异常翻译为可读提示，而不是直接暴露 Failed to fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(aiAnalysis.upload(new File(['image'], 'a.png', { type: 'image/png' }))).rejects.toThrow('网络中断或浏览器跨域限制');
  });

  it('区分上传超时与主动取消', async () => {
    const timeout = new DOMException('timeout', 'TimeoutError');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);
    const file = new File(['image'], 'a.png', { type: 'image/png' });
    await expect(aiAnalysis.upload(file)).rejects.toThrow('附件上传超时');
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException('cancelled', 'AbortError');
    fetchMock.mockRejectedValue(aborted);
    await expect(aiAnalysis.upload(file, { signal: controller.signal })).rejects.toBe(aborted);
  });

  it('把服务端返回的平台相对地址解析成当前环境可访问的地址', () => {
    const dev = createPlatformUrlResolver('https://www.kingpolymer.com/gjhoutai');
    expect(dev('/gjhoutai/api/blob/spectrum/upload-1')).toBe('https://www.kingpolymer.com/gjhoutai/api/blob/spectrum/upload-1');
    expect(dev('/gjhoutai/api/inspection-reports/abc/file')).toBe('https://www.kingpolymer.com/gjhoutai/api/inspection-reports/abc/file');
    expect(dev('https://other.example/a.png')).toBe('https://other.example/a.png');
    expect(dev('')).toBe('');
    expect(dev('/other/path')).toBe('/other/path');
    const prod = createPlatformUrlResolver('/gjhoutai');
    expect(prod('/gjhoutai/api/blob/spectrum/x')).toBe('/gjhoutai/api/blob/spectrum/x');
    const sameOrigin = createPlatformUrlResolver('');
    expect(sameOrigin('/gjhoutai/api/blob/spectrum/x')).toBe('/gjhoutai/api/blob/spectrum/x');
    expect(createPlatformUrlResolver('not a url')('/gjhoutai/api/blob/x')).toBe('/gjhoutai/api/blob/x');
  });

  it('工具名映射为中文说明', () => {
    expect(aiToolLabel('query_property_rows')).toBe('查询物性打版记录');
    expect(aiToolLabel('list_spectrum_records')).toBe('查询图谱记录');
    expect(aiToolLabel('read_spectrum_image')).toBe('读取图谱图片');
    expect(aiToolLabel('list_office_records')).toBe('查询办事记录');
    expect(aiToolLabel('list_ash_records')).toBe('查询灰份记录');
    expect(aiToolLabel('query_report_ranges')).toBe('查询报告判定范围');
    expect(aiToolLabel('list_inspection_reports')).toBe('查询检测报告');
    expect(aiToolLabel('unknown_tool')).toBe('读取平台数据');
    expect(aiAnalysis.toolLabel('data_overview')).toBe('读取数据概况');
  });
});
