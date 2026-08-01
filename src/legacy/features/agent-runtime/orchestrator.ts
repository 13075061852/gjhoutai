import { createAgentPlan } from './router';
import { validatePlanDependencies } from './planner';
import type { AgentPlanV2 } from './protocol';

type AgentPlanValidationResult = {
  ok: boolean;
  kind: 'plan' | 'invalid';
  reason: string;
  plan?: AgentPlanV2;
};

/**
 * Validate only versioned V2 plans. Text actions and ad-hoc skill calls are
 * intentionally rejected; execution belongs to the runtime and registry.
 */
export const evaluateAgentLoopDecision = (
  decision: unknown,
  options: { allowedSkillIds?: string[] } = {},
): AgentPlanValidationResult => {
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
