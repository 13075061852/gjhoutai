import { describe, expect, it } from 'vitest';
import { evaluateAgentLoopDecision, getAgentSkillCallSignature } from './orchestrator';

describe('project agent loop guard', () => {
  const allowedSkillIds = ['project.getManifest', 'business.queryPageData', 'project.finalAnswerCheck'];

  it('accepts an allowed skill call and returns a stable signature', () => {
    const decision = { action: 'callSkill', skillId: 'business.queryPageData', input: { pageId: 'order-management', intent: 'count' } };
    const result = evaluateAgentLoopDecision(decision, { allowedSkillIds, calledSignatures: [], toolCallCount: 0 });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('callSkill');
    expect(result.signature).toBe(getAgentSkillCallSignature(decision.skillId, decision.input));
  });

  it('rejects skills that are not registered in the current project', () => {
    const result = evaluateAgentLoopDecision(
      { action: 'callSkill', skillId: 'shell.execute', input: { command: 'rm -rf /' } },
      { allowedSkillIds, calledSignatures: [], toolCallCount: 0 }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_skill');
  });

  it('stops repeated calls with identical inputs', () => {
    const signature = getAgentSkillCallSignature('business.queryPageData', { pageId: 'order-management', intent: 'count' });
    const result = evaluateAgentLoopDecision(
      { action: 'callSkill', skillId: 'business.queryPageData', input: { intent: 'count', pageId: 'order-management' } },
      { allowedSkillIds, calledSignatures: [signature], toolCallCount: 1 }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('duplicate_skill_call');
  });

  it('requires evidence before a project-data final answer', () => {
    const result = evaluateAgentLoopDecision(
      { action: 'final', answer: '当前库存一切正常。', confidence: 'high' },
      { allowedSkillIds, calledSignatures: [], toolCallCount: 0, observationCount: 0, requiresEvidence: true }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('final_without_evidence');
  });

  it('enforces the maximum number of tool calls', () => {
    const result = evaluateAgentLoopDecision(
      { action: 'callSkill', skillId: 'business.queryPageData', input: { pageId: 'order-management' } },
      { allowedSkillIds, calledSignatures: [], toolCallCount: 4, maxToolCalls: 4 }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('tool_call_limit');
  });
});
