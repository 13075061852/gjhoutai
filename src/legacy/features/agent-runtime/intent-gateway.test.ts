import { describe, expect, it, vi } from 'vitest';
import { createIntentGateway } from './intent-gateway';

describe('agent intent gateway', () => {
  it('routes a greeting directly to chat on a normal project page', async () => {
    const classifier = vi.fn();
    const gateway = createIntentGateway({ classifier });

    const intent = await gateway.route({
      prompt: '你好',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });

    expect(intent.kind).toBe('chat');
    expect(intent.toolId).toBeUndefined();
    expect(classifier).not.toHaveBeenCalled();
  });

  it('routes the original early greeting directly to chat without classification', async () => {
    const classifier = vi.fn();
    const gateway = createIntentGateway({ classifier });

    const intent = await gateway.route({
      prompt: '早',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });

    expect(intent.kind).toBe('chat');
    expect(intent.toolId).toBeUndefined();
    expect(classifier).not.toHaveBeenCalled();
  });

  it('does not turn generic quality wording into a property tool from the active page alone', async () => {
    const gateway = createIntentGateway();

    await expect(gateway.route({
      prompt: '帮我分析一下生活质量',
      activePageId: 'property-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    })).resolves.toMatchObject({ kind: 'chat' });
  });

  it('uses the property page to disambiguate an independently material-specific prompt', async () => {
    const gateway = createIntentGateway();

    await expect(gateway.route({
      prompt: '帮我看看这批料的质量怎么样',
      activePageId: 'property-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    })).resolves.toMatchObject({ kind: 'single_tool', toolId: 'property.searchRows' });
  });

  it('routes an explicit inventory query to one read tool', async () => {
    const gateway = createIntentGateway();

    await expect(gateway.route({
      prompt: '查看当前库存最低的成品',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    })).resolves.toMatchObject({ kind: 'single_tool', toolId: 'business.queryPageData' });
  });

  it('routes cross-domain analysis to the complex planner', async () => {
    const gateway = createIntentGateway();

    await expect(gateway.route({
      prompt: '结合订单、库存和配方分析本周排产风险',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    })).resolves.toMatchObject({ kind: 'complex_agent' });
  });

  it('falls back to deterministic chat when ambiguous classification times out', async () => {
    vi.useFakeTimers();
    const gateway = createIntentGateway({
      classifyTimeoutMs: 12_000,
      classifier: () => new Promise(() => undefined),
    });

    try {
      const route = gateway.route({
        prompt: '帮我处理一下这个',
        activePageId: 'dashboard',
        projectAccessEnabled: true,
        webSearchEnabled: true,
      });
      await vi.advanceTimersByTimeAsync(12_000);

      await expect(route).resolves.toMatchObject({ kind: 'chat' });
      await expect(route).resolves.not.toHaveProperty('toolId');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let ambiguous classification bypass disabled project access', async () => {
    const gateway = createIntentGateway({
      classifier: async () => ({
        kind: 'single_tool',
        confidence: 0.9,
        reason: '项目数据查询',
        toolId: 'business.queryPageData',
        toolInput: { question: '帮我处理一下这个' },
      }),
    });

    await expect(gateway.route({
      prompt: '帮我处理一下这个',
      activePageId: 'dashboard',
      projectAccessEnabled: false,
      webSearchEnabled: true,
    })).resolves.toMatchObject({ kind: 'chat' });
  });
});
