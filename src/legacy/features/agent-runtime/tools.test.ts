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
    expect(result?.message).toContain('1 个页面');
    expect(result?.details).toContain('当前已接入结构化记录：3 条');
    expect(result?.data.manifest.skills).toEqual(['business.queryPageData']);
  });

  it('submits image generation through APIMart', async () => {
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
});
