import { describe, expect, it, vi } from 'vitest';
import {
  buildLocalSkillPlan,
  createAgentPlan,
  createAgentPlanWithAi,
  parseAgentRouteClassification,
  shouldUseWebSearchForPrompt,
} from './router';

describe('agent runtime router', () => {
  it('keeps local project data questions off web search', () => {
    const plan = createAgentPlan({
      prompt: '当前库存最低的成品商品是哪一个',
      activePageId: 'inventory-management',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.useProjectContext).toBe(true);
    expect(plan.needsWebSearch).toBe(false);
    expect(plan.kind).toBe('local-tool');
  });

  it('routes real-time external questions to web search', () => {
    const plan = createAgentPlan({
      prompt: '今天美元人民币汇率最新是多少',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.needsWebSearch).toBe(true);
    expect(plan.kind).toBe('web-search');
  });

  it('routes image generation to the media tool', () => {
    const plan = createAgentPlan({
      prompt: '生成一张广俊塑料科技产品海报',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.kind).toBe('image-generation');
    expect(plan.localSkillPlan?.skillId).toBe('media.generateImage');
    expect(plan.needsWebSearch).toBe(false);
  });

  it('routes spectrum visual analysis to image analysis', () => {
    const plan = createAgentPlan({
      prompt: '分析当前选中的 DSC 图谱图片',
      activePageId: 'spectrum-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.kind).toBe('image-analysis');
    expect(plan.localSkillPlan?.skillId).toBe('media.analyzeImages');
  });

  it('does not treat page navigation as web search', () => {
    expect(shouldUseWebSearchForPrompt('打开库存管理页面', { projectFirst: true })).toBe(false);
  });

  it('answers current page questions through a local navigation skill', () => {
    const plan = createAgentPlan({
      prompt: '我现在处于什么界面',
      activePageId: 'spectrum-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.kind).toBe('local-tool');
    expect(plan.localSkillPlan?.skillId).toBe('assistant.currentPage');
    expect(plan.needsWebSearch).toBe(false);
  });

  it('handles alternate current page wording locally', () => {
    const plan = createAgentPlan({
      prompt: '我当前在什么页面',
      activePageId: 'spectrum-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.localSkillPlan?.skillId).toBe('assistant.currentPage');
    expect(plan.needsWebSearch).toBe(false);
  });

  it('answers page guide questions locally', () => {
    const plan = createAgentPlan({
      prompt: '这个页面是做什么的',
      activePageId: 'spectrum-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.localSkillPlan?.skillId).toBe('assistant.projectGuide');
    expect(plan.needsWebSearch).toBe(false);
  });

  it('routes business status questions to deterministic page data tools', () => {
    const plan = createAgentPlan({
      prompt: '查看一下现在的订单情况',
      activePageId: 'spectrum-analysis',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.kind).toBe('local-tool');
    expect(plan.localSkillPlan?.skillId).toBe('business.queryPageData');
    expect(plan.needsWebSearch).toBe(false);
  });

  it('does not enter agent loop for generic project context without complex analysis intent', () => {
    const plan = createAgentPlan({
      prompt: '我想了解一下后台功能',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(plan.kind).not.toBe('local-tool');
    expect(plan.needsWebSearch).toBe(false);
  });

  it('lets AI classification upgrade ambiguous wording to web search', async () => {
    const classifier = vi.fn().mockResolvedValue({
      kind: 'web-search',
      confidence: 0.86,
      reason: '用户要求外部查询',
    });
    const plan = await createAgentPlanWithAi({
      prompt: '帮我查查 Claude 新模型现在什么情况',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      classifier,
    });
    expect(classifier).toHaveBeenCalledOnce();
    expect(plan.kind).toBe('web-search');
    expect(plan.needsWebSearch).toBe(true);
  });

  it('lets AI classification route ambiguous project data to a local skill', async () => {
    const plan = await createAgentPlanWithAi({
      prompt: '帮我看看业务现在怎么样',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      classifier: vi.fn().mockResolvedValue({
        kind: 'local-tool',
        skillId: 'business.queryPageData',
        confidence: 0.8,
        reason: '用户询问后台业务状态',
      }),
    });
    expect(plan.kind).toBe('local-tool');
    expect(plan.localSkillPlan?.skillId).toBe('business.queryPageData');
    expect(plan.localSkillPlan?.input).toEqual({ question: '帮我看看业务现在怎么样' });
  });

  it('keeps regex route when AI classification fails', async () => {
    const plan = await createAgentPlanWithAi({
      prompt: '生成一张工厂质检海报',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      classifier: vi.fn().mockRejectedValue(new Error('network')),
    });
    expect(plan.kind).toBe('image-generation');
    expect(plan.localSkillPlan?.skillId).toBe('media.generateImage');
  });

  it('parses strict route JSON from model output', () => {
    expect(parseAgentRouteClassification('```json\n{"kind":"chat","reason":"普通对话"}\n```')).toEqual({
      kind: 'chat',
      skillId: '',
      input: {},
      confidence: 0,
      reason: '普通对话',
      useProjectContext: undefined,
      needsWebSearch: undefined,
    });
  });

  it('exposes local skill plan fallback detection', () => {
    expect(buildLocalSkillPlan('我当前在什么页面')?.skillId).toBe('assistant.currentPage');
    expect(buildLocalSkillPlan('随便聊两句')).toBeNull();
  });
});
