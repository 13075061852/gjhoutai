import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSkillDefinitions } from './tools';

const getSkill = (App: any, id: string) => createRuntimeSkillDefinitions(App).find((skill) => skill.id === id);

it('reuses runtime skill definitions for the same app instance', () => {
  const App = {};
  expect(createRuntimeSkillDefinitions(App)).toBe(createRuntimeSkillDefinitions(App));
  expect(createRuntimeSkillDefinitions({})).not.toBe(createRuntimeSkillDefinitions({}));
});

describe('agent runtime tools', () => {
  it('reports dynamic project capabilities and current data through the project guide', async () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('dashboard') });
    const skill = getSkill({
      constants: { NAV_PAGE_KEY: 'page', PAGE_DEFS: { dashboard: { title: '仪表盘', desc: '总览' } } },
      projectSkills: {
        getProjectManifest: () => ({
          pages: [{ pageId: 'dashboard' }],
          skills: ['business.queryPageData'],
          dataSources: ['本地业务数据'],
          currentData: { orders: 3 },
        }),
      },
    }, 'assistant.projectGuide');
    const result = await skill?.handler({ question: '你能做什么' });
    expect(result?.message).toBe('已读取项目、当前页面和可用能力信息。');
    expect(result?.details).toEqual([]);
    expect(result?.data.manifest.currentData).toEqual({ orders: 3 });
    expect(result?.data.manifest.skills).toEqual(['business.queryPageData']);
  });

  it('reads the active provider and model without exposing the API key', async () => {
    const skill = getSkill({
      config: {
        getFormConfig: () => ({ aiProvider: 'openrouter', apiKey: 'secret-value' }),
        getResolvedModel: () => 'anthropic/claude-sonnet-4',
      },
    }, 'assistant.modelInfo');

    const result = await skill?.handler();
    expect(result?.ok).toBe(true);
    expect(result?.data).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      configured: true,
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('submits image generation through LiblibAI', async () => {
    const generateImage = vi.fn().mockResolvedValue({ taskId: 'task-1' });
    const skill = getSkill({ apimartMedia: { generateImage } }, 'media.generateImage');
    const result = await skill?.handler({ prompt: '产品海报', count: 2 });
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: '产品海报', n: 2 }));
    expect(result?.ok).toBe(true);
    expect(result?.data.taskId).toBe('task-1');
  });

  it('delegates data recognition history search', async () => {
    const searchHistoryByAgent = vi.fn().mockResolvedValue({ ok: true, message: 'ok', data: { rowCount: 1 } });
    const skill = getSkill({ dataRecognition: { searchHistoryByAgent } }, 'dataRecognition.searchHistory');
    const result = await skill?.handler({ query: '320G6' });
    expect(searchHistoryByAgent).toHaveBeenCalledWith({ query: '320G6' });
    expect(result?.data.rowCount).toBe(1);
  });

  it('returns a clear failure when image module is unavailable', async () => {
    const skill = getSkill({}, 'media.generateImage');
    const result = await skill?.handler({ prompt: '产品海报' });
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('AI 绘图模块');
  });

  it('searches pages and skills instead of guessing unsupported capabilities', async () => {
    const skill = getSkill({
      constants: {
        PAGE_DEFS: {
          'inventory-management': { title: '库存管理', desc: '查询材料库存和库存状态' },
          'theme-settings': { title: '主题设置', desc: '调整界面主题' },
        },
      },
      projectSkills: {
        getSkillRegistry: () => [
          { id: 'business.queryPageData', title: '查询业务页面数据', module: '业务数据', summary: '查询库存、订单和客户' },
          { id: 'assistant.openPage', title: '切换项目页面', module: '导航', summary: '打开指定页面' },
        ],
      },
    }, 'project.searchCapabilities');

    const result = await skill?.handler({ query: '库存查询' });
    expect(result?.ok).toBe(true);
    expect(result?.data.pages[0].pageId).toBe('inventory-management');
    expect(result?.data.skills[0].id).toBe('business.queryPageData');
  });

  it('audits real page and skill coverage without exposing credentials', async () => {
    const skill = getSkill({
      constants: { PAGE_DEFS: { dashboard: { title: '仪表盘' }, 'theme-settings': { title: '主题设置' } } },
      businessPages: { getAgentManifestPages: () => [{ pageId: 'dashboard', rowCount: 2, fields: ['id'] }] },
      projectSkills: {
        getSkillRegistry: () => [
          { id: 'ok.skill', title: '正常技能', handler: () => null, inputSpec: '{}', outputSpec: '{}' },
          { id: 'broken.skill', title: '缺少处理器', inputSpec: '{}', outputSpec: '{}' },
        ],
      },
      config: { getFormConfig: () => ({ aiProvider: 'openrouter', apiKey: 'secret-value', model: 'model-a' }) },
    }, 'project.auditRuntime');

    const result = await skill?.handler();
    expect(result?.ok).toBe(true);
    expect(result?.data.coverage.structuredPages).toBe(1);
    expect(result?.data.issues.some((item) => item.includes('broken.skill'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('builds a deterministic multi-page business overview', async () => {
    const queryAgentData = vi.fn(({ pageId, intent }) => ({
      ok: true,
      pageId,
      intent,
      rowCount: pageId === 'order-management' ? 4 : 7,
      data: [],
      summary: 'ok',
    }));
    const skill = getSkill({
      businessPages: {
        getAgentManifestPages: () => [
          { pageId: 'order-management', title: '订单管理', rowCount: 4 },
          { pageId: 'inventory-management', title: '库存管理', rowCount: 7 },
        ],
        queryAgentData,
      },
    }, 'business.analyzeOverview');

    const result = await skill?.handler({ includeStatusGroups: false });
    expect(result?.ok).toBe(true);
    expect(result?.data.totalRecords).toBe(11);
    expect(result?.data.pages).toHaveLength(2);
    expect(queryAgentData).toHaveBeenCalledTimes(2);
  });
});
