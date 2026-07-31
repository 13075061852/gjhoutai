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
