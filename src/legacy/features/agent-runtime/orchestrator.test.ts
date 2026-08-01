import { describe, expect, it } from 'vitest';
import { evaluateAgentLoopDecision } from './orchestrator';

describe('versioned project agent planner', () => {
  const allowedSkillIds = ['project.getManifest', 'business.queryPageData', 'project.finalAnswerCheck'];

  it('accepts a complete V2 plan using registered tools', () => {
    const plan = {
      version: 2,
      kind: 'complex_agent',
      summary: '读取订单后检查结果',
      steps: [
        { id: 'orders', toolId: 'business.queryPageData', input: { pageId: 'order-management', intent: 'count' }, dependsOn: [] },
        { id: 'review', toolId: 'project.finalAnswerCheck', input: {}, dependsOn: ['orders'] },
      ],
    };
    expect(evaluateAgentLoopDecision(plan, { allowedSkillIds })).toMatchObject({ ok: true, kind: 'plan', plan });
  });

  it('rejects unregistered tools and dependency cycles', () => {
    expect(evaluateAgentLoopDecision({
      version: 2,
      kind: 'complex_agent',
      summary: 'unsafe',
      steps: [{ id: 'shell', toolId: 'shell.execute', input: {}, dependsOn: [] }],
    }, { allowedSkillIds }).reason).toBe('unknown_tool');

    expect(evaluateAgentLoopDecision({
      version: 2,
      kind: 'complex_agent',
      summary: 'cyclic',
      steps: [
        { id: 'first', toolId: 'business.queryPageData', input: {}, dependsOn: ['second'] },
        { id: 'second', toolId: 'project.finalAnswerCheck', input: {}, dependsOn: ['first'] },
      ],
    }, { allowedSkillIds }).reason).toBe('dependency_cycle');
  });

  it('rejects unversioned text decisions instead of executing them', () => {
    const result = evaluateAgentLoopDecision({ action: 'callSkill', skillId: 'business.queryPageData', input: {} }, { allowedSkillIds });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('invalid');
  });
});
