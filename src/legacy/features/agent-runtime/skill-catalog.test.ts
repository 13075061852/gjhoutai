import { describe, expect, it } from 'vitest';
import { buildSkillCatalogSummary, filterSkillCatalog } from './skill-catalog';

const skills = [
  {
    id: 'business.queryPageData',
    title: '查询业务页面数据',
    module: '业务数据',
    level: '查询型',
    summary: '查询订单、库存和客户',
    examples: ['统计系统有几个供应商'],
    handler: () => null,
  },
  {
    id: 'project.auditRuntime',
    title: '审计 Agent 运行能力',
    module: '项目管家',
    level: '分析型',
    summary: '检查技能和结构化页面覆盖',
    examples: ['诊断 AI 异常'],
    handler: () => null,
  },
];

describe('skill catalog', () => {
  it('searches ids, summaries and examples in addition to titles', () => {
    expect(filterSkillCatalog(skills, 'queryPageData').map((skill) => skill.id)).toEqual(['business.queryPageData']);
    expect(filterSkillCatalog(skills, '结构化页面').map((skill) => skill.id)).toEqual(['project.auditRuntime']);
    expect(filterSkillCatalog(skills, '供应商').map((skill) => skill.id)).toEqual(['business.queryPageData']);
  });

  it('reports modules, executable skills, analysis skills and structured page coverage', () => {
    const summary = buildSkillCatalogSummary(skills, {
      totalPages: 10,
      structuredPages: 6,
      issueCount: 2,
    });

    expect(summary).toEqual({
      totalSkills: 2,
      modules: 2,
      executableSkills: 2,
      analysisSkills: 1,
      totalPages: 10,
      structuredPages: 6,
      pageCoveragePercent: 60,
      issueCount: 2,
    });
  });
});
