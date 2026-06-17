import { createAgentPlan } from './router';

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
