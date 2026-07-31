import { describe, expect, it } from 'vitest';
import { evaluateAgentLoopDecision, getAgentSkillCallSignature } from './orchestrator';

describe('project agent planner compatibility', () => {
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
    const result = evaluateAgentLoopDecision(plan, { allowedSkillIds });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('plan');
    expect(result.plan).toEqual(plan);
  });

  it('rejects V2 plans that use tools not registered in the current project', () => {
    const result = evaluateAgentLoopDecision(
      {
        version: 2,
        kind: 'complex_agent',
        summary: 'unsafe',
        steps: [{ id: 'shell', toolId: 'shell.execute', input: {}, dependsOn: [] }],
      },
      { allowedSkillIds }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_tool');
  });

  it('rejects plans with dependency cycles', () => {
    const result = evaluateAgentLoopDecision(
      {
        version: 2,
        kind: 'complex_agent',
        summary: 'cyclic',
        steps: [
          { id: 'first', toolId: 'business.queryPageData', input: {}, dependsOn: ['second'] },
          { id: 'second', toolId: 'project.finalAnswerCheck', input: {}, dependsOn: ['first'] },
        ],
      },
      { allowedSkillIds }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('dependency_cycle');
  });

  it('keeps stable skill signatures for migrations that still import it', () => {
    expect(getAgentSkillCallSignature('business.queryPageData', { intent: 'count', pageId: 'order-management' }))
      .toBe(getAgentSkillCallSignature('business.queryPageData', { pageId: 'order-management', intent: 'count' }));
  });

  it('keeps accepting legacy callSkill decisions for registered skills', () => {
    const result = evaluateAgentLoopDecision(
      { action: 'callSkill', skillId: 'business.queryPageData', input: { pageId: 'order-management' } },
      { allowedSkillIds },
    );

    expect(result).toMatchObject({
      ok: true,
      kind: 'callSkill',
      skillId: 'business.queryPageData',
      input: { pageId: 'order-management' },
    });
    expect(result.signature).toBe(getAgentSkillCallSignature('business.queryPageData', { pageId: 'order-management' }));
  });

  it('keeps legacy final evidence requirements intact', () => {
    expect(evaluateAgentLoopDecision(
      { action: 'final', answer: '已完成分析' },
      { requiresEvidence: true, observationCount: 0 },
    )).toMatchObject({ ok: false, kind: 'final', reason: 'final_without_evidence' });

    expect(evaluateAgentLoopDecision(
      { action: 'final', answer: '已完成分析' },
      { requiresEvidence: true, observationCount: 1 },
    )).toMatchObject({ ok: true, kind: 'final', answer: '已完成分析' });
  });

  it('keeps legacy call limits and duplicate-call prevention intact', () => {
    const duplicate = getAgentSkillCallSignature('business.queryPageData', { pageId: 'order-management' });
    const decision = { action: 'callSkill', skillId: 'business.queryPageData', input: { pageId: 'order-management' } };

    expect(evaluateAgentLoopDecision(decision, {
      allowedSkillIds,
      toolCallCount: 4,
      maxToolCalls: 4,
    })).toMatchObject({ ok: false, kind: 'callSkill', reason: 'tool_call_limit' });
    expect(evaluateAgentLoopDecision(decision, {
      allowedSkillIds,
      calledSignatures: [duplicate],
    })).toMatchObject({ ok: false, kind: 'callSkill', reason: 'duplicate_skill_call', signature: duplicate });
  });
});
