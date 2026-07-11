import { describe, expect, it } from 'vitest';
import { canRunLocalSkillDirectly, selectRecentHistory } from './chat-agent';

describe('chat agent history budget', () => {
  it('keeps recent messages within the token budget', () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(300) },
      { role: 'assistant', content: 'b'.repeat(300) },
      { role: 'user', content: 'latest' },
    ];
    const selected = selectRecentHistory(messages, 110);
    expect(selected).toEqual([messages[2]]);
  });

  it('reserves token budget for attached images', () => {
    const messages = [
      { role: 'user', content: 'old' },
      { role: 'user', content: 'image', images: [{}, {}] },
    ];
    expect(selectRecentHistory(messages, 900)).toEqual([messages[1]]);
  });

  it('lets AI synthesize read-only results and only runs explicit actions directly', () => {
    const skills = [
      { id: 'business.queryPageData', handler: () => null },
      { id: 'property.searchRows', handler: () => null },
      { id: 'assistant.projectGuide', handler: () => null },
      { id: 'assistant.currentPage', handler: () => null },
      { id: 'assistant.openPage', handler: () => null },
      { id: 'formula.createRecipe', handler: () => null },
      { id: 'spectrum.manageImages', handler: () => null },
    ];
    const plan = { skillId: 'business.queryPageData' };
    expect(canRunLocalSkillDirectly(plan, '今天有几个新订单', skills)).toBe(false);
    expect(canRunLocalSkillDirectly(plan, '分析订单数据为什么异常并给出建议', skills)).toBe(false);
    expect(canRunLocalSkillDirectly({ skillId: 'property.searchRows' }, '320G5-B21呢', skills)).toBe(false);
    expect(canRunLocalSkillDirectly({ skillId: 'assistant.projectGuide' }, '这是什么项目', skills)).toBe(false);
    expect(canRunLocalSkillDirectly({ skillId: 'assistant.currentPage' }, '我在哪个页面', skills)).toBe(false);
    expect(canRunLocalSkillDirectly({ skillId: 'assistant.openPage' }, '打开库存管理', skills)).toBe(true);
    expect(canRunLocalSkillDirectly({ skillId: 'formula.createRecipe' }, '创建测试配方', skills)).toBe(true);
    expect(canRunLocalSkillDirectly({ skillId: 'spectrum.manageImages', input: { action: 'search' } }, '查找图谱', skills)).toBe(false);
    expect(canRunLocalSkillDirectly({ skillId: 'spectrum.manageImages', input: { action: 'delete' } }, '删除图谱', skills)).toBe(true);
  });
});
