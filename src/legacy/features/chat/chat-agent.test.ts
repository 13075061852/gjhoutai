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

  it('runs registered simple data skills directly but keeps complex analysis in the agent loop', () => {
    const skills = [
      { id: 'business.queryPageData', handler: () => null },
      { id: 'property.searchRows', handler: () => null },
    ];
    const plan = { skillId: 'business.queryPageData' };
    expect(canRunLocalSkillDirectly(plan, '今天有几个新订单', skills)).toBe(true);
    expect(canRunLocalSkillDirectly(plan, '分析订单数据为什么异常并给出建议', skills)).toBe(false);
    expect(canRunLocalSkillDirectly({ skillId: 'property.searchRows' }, '320G5-B21呢', skills)).toBe(false);
  });
});
