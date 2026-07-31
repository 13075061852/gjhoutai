import { createAgentPlan } from './router';
import { validatePlanDependencies } from './planner';
import type { AgentPlanV2 } from './protocol';

export const MAX_PROJECT_AGENT_TOOL_CALLS = 4;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export const getAgentSkillCallSignature = (skillId: unknown, input: unknown) => (
  `${String(skillId || '').trim()}:${stableJson(input && typeof input === 'object' ? input : {})}`
);

type AgentLoopDecisionCompatibilityResult = {
  ok: boolean;
  kind: 'plan' | 'invalid' | 'final' | 'callSkill';
  reason: string;
  plan?: AgentPlanV2;
  answer?: string;
  skillId?: string;
  input?: Record<string, unknown>;
  signature?: string;
};

export const evaluateAgentLoopDecision = (decision: unknown, options: {
  allowedSkillIds?: string[];
  calledSignatures?: string[];
  toolCallCount?: number;
  maxToolCalls?: number;
  observationCount?: number;
  requiresEvidence?: boolean;
} = {}): AgentLoopDecisionCompatibilityResult => {
  const legacyDecision = decision && typeof decision === 'object' && !Array.isArray(decision)
    && Object.prototype.hasOwnProperty.call(decision, 'action');
  if (legacyDecision) {
    const reactDecision = decision as Record<string, unknown>;
    const action = String(reactDecision.action || '').trim();
    if (action === 'final') {
      const answer = String(reactDecision.answer || '').trim();
      if (!answer) return { ok: false, kind: 'final', reason: 'empty_final_answer' };
      if (options.requiresEvidence && !Number(options.observationCount || 0)) {
        return { ok: false, kind: 'final', reason: 'final_without_evidence' };
      }
      return { ok: true, kind: 'final', reason: '', answer };
    }
    if (action !== 'callSkill') return { ok: false, kind: 'invalid', reason: 'invalid_action' };

    const skillId = String(reactDecision.skillId || '').trim();
    const allowedSkillIds = Array.isArray(options.allowedSkillIds) ? options.allowedSkillIds : [];
    if (!skillId || !allowedSkillIds.includes(skillId)) {
      return { ok: false, kind: 'callSkill', reason: 'unknown_skill', skillId };
    }
    const maxToolCalls = Math.max(1, Number(options.maxToolCalls || MAX_PROJECT_AGENT_TOOL_CALLS));
    if (Number(options.toolCallCount || 0) >= maxToolCalls) {
      return { ok: false, kind: 'callSkill', reason: 'tool_call_limit', skillId };
    }
    const input = reactDecision.input && typeof reactDecision.input === 'object' && !Array.isArray(reactDecision.input)
      ? reactDecision.input as Record<string, unknown>
      : {};
    const signature = getAgentSkillCallSignature(skillId, input);
    if ((options.calledSignatures || []).includes(signature)) {
      return { ok: false, kind: 'callSkill', reason: 'duplicate_skill_call', skillId, signature };
    }
    return { ok: true, kind: 'callSkill', reason: '', skillId, input, signature };
  }

  const allowedToolIds = new Set(Array.isArray(options.allowedSkillIds) ? options.allowedSkillIds : []);
  const validation = validatePlanDependencies(decision, allowedToolIds);
  if (!validation.ok) return { ok: false, kind: 'invalid', reason: validation.reason };
  return { ok: true, kind: 'plan', reason: '', plan: validation.plan };
};

export const createRuntimeDecision = (input: Parameters<typeof createAgentPlan>[0]) => {
  const plan = createAgentPlan(input);
  return {
    plan,
    statusText: plan.needsWebSearch
      ? '正在联网搜索'
      : plan.localSkillPlan
        ? '正在执行项目技能'
        : plan.useProjectContext
          ? '正在读取项目数据'
          : '正在思考',
  };
};
