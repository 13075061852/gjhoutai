import { describe, expect, it } from 'vitest';
import { buildFallbackSearchPlan, extractSearchKeyTerms, rankSearchResultsForPrompt } from './chat-search';

describe('chat web search planning', () => {
  it('preserves entities, years, and intent terms in compact Chinese queries', () => {
    const plan = buildFallbackSearchPlan('王者荣耀亚运会2026中国队名单');
    expect(plan.queries.join('\n')).toContain('王者荣耀');
    expect(plan.queries.join('\n')).toContain('2026');
    expect(plan.queries.join('\n')).toContain('中国队');
    expect(plan.queries.join('\n')).toContain('名单');
  });

  it('extracts key terms without domain-specific rules', () => {
    expect(extractSearchKeyTerms('某某机器人R2 2026发布价格和官网')).toEqual(
      expect.arrayContaining(['某某机器人', 'R2', '2026', '发布', '价格', '官网']),
    );
  });

  it('ranks exact entity results before generic news', () => {
    const results = rankSearchResultsForPrompt([
      {
        title: '2026年6月下旬体育新闻汇总',
        url: 'https://example.com/sports',
        content: 'NHL、NBA、MLB、WWE、网球和棒球赛事新闻。',
      },
      {
        title: '中国队将派23名运动员参加2026年亚运会电竞项目',
        url: 'https://example.com/esports',
        content: '王者荣耀项目中国队名单包含运动员和教练员。',
      },
    ], '王者荣耀亚运会2026中国队名单');

    expect(results[0].title).toContain('电竞项目');
  });

  it('uses the same relevance ranking for unrelated product searches', () => {
    const results = rankSearchResultsForPrompt([
      {
        title: '机器人行业新闻汇总',
        url: 'https://example.com/industry',
        content: '多家公司发布新品，市场热度提升。',
      },
      {
        title: '某某机器人R2 2026发布价格与官网信息',
        url: 'https://example.com/r2',
        content: '某某机器人R2 公布价格、参数和官方购买渠道。',
      },
    ], '某某机器人R2 2026发布价格和官网');

    expect(results[0].title).toContain('R2');
  });
});
