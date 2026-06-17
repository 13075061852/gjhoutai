import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSkillDefinitions } from './tools';

const getSkill = (App: any, id: string) => createRuntimeSkillDefinitions(App).find((skill) => skill.id === id);

describe('agent runtime tools', () => {
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
