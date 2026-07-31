import { agentPlanSchema, type AgentPlanV2 } from './protocol';
import type { AgentToolRegistry } from './tool-registry';

type PlannerMessage = { role: string; content: string };

type PlanValidationResult =
  | { ok: true; reason: ''; plan: AgentPlanV2 }
  | { ok: false; reason: 'invalid_plan' | 'duplicate_step_id' | 'unknown_tool' | 'missing_dependency' | 'dependency_cycle' };

export class AgentPlannerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AgentPlannerError';
  }
}

export class AgentPlannerTimeoutError extends AgentPlannerError {
  constructor(timeoutMs: number) {
    super(`Agent planner exceeded its ${timeoutMs}ms deadline.`);
    this.name = 'AgentPlannerTimeoutError';
  }
}

const hasDependencyCycle = (plan: AgentPlanV2): boolean => {
  const dependencies = new Map(plan.steps.map((step) => [step.id, step.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (stepId: string): boolean => {
    if (visiting.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visiting.add(stepId);
    for (const dependency of dependencies.get(stepId) || []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(stepId);
    visited.add(stepId);
    return false;
  };

  return plan.steps.some((step) => visit(step.id));
};

const hasOnlyKeys = (value: unknown, allowedKeys: string[]): boolean => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && Object.keys(value).every((key) => allowedKeys.includes(key))
);

const hasStrictPlanShape = (plan: unknown): boolean => {
  if (!hasOnlyKeys(plan, ['version', 'kind', 'summary', 'steps'])) return false;
  const steps = (plan as { steps?: unknown }).steps;
  return !Array.isArray(steps) || steps.every((step) => hasOnlyKeys(step, ['id', 'toolId', 'input', 'dependsOn']));
};

export const validatePlanDependencies = (
  plan: unknown,
  registeredToolIds: ReadonlySet<string>,
): PlanValidationResult => {
  if (!hasStrictPlanShape(plan)) return { ok: false, reason: 'invalid_plan' };
  const parsed = agentPlanSchema.safeParse(plan);
  if (!parsed.success) return { ok: false, reason: 'invalid_plan' };

  const stepIds = new Set<string>();
  for (const step of parsed.data.steps) {
    if (stepIds.has(step.id)) return { ok: false, reason: 'duplicate_step_id' };
    stepIds.add(step.id);
  }

  for (const step of parsed.data.steps) {
    if (!registeredToolIds.has(step.toolId)) return { ok: false, reason: 'unknown_tool' };
    if (step.dependsOn.some((dependency) => !stepIds.has(dependency))) {
      return { ok: false, reason: 'missing_dependency' };
    }
  }

  if (hasDependencyCycle(parsed.data)) return { ok: false, reason: 'dependency_cycle' };
  return { ok: true, reason: '', plan: parsed.data };
};

const parsePlannerResponse = (response: unknown): unknown => {
  if (typeof response !== 'string') return response;
  try {
    return JSON.parse(response);
  } catch (cause) {
    throw new AgentPlannerError('Agent planner must return strict JSON matching AgentPlanV2.', { cause });
  }
};

const buildPlannerMessages = (input: {
  prompt: string;
  activePageId: string;
  catalog: ReturnType<AgentToolRegistry['getPlannerCatalog']>;
}): PlannerMessage[] => [
  {
    role: 'system',
    content: [
      'You are a plan-only agent planner.',
      'Return strict JSON matching AgentPlanV2 and no prose.',
      'Return a complete plan that may use at most four tools.',
      'You cannot invent tools, cannot return a final user answer, and cannot bypass confirmation.',
      'Use only the following planner-safe tool metadata:',
      JSON.stringify(input.catalog),
    ].join('\n'),
  },
  {
    role: 'user',
    content: JSON.stringify({ prompt: input.prompt, activePageId: input.activePageId }),
  },
];

export const createAgentPlanner = ({
  registry,
  requestPlan,
  timeoutMs = 45_000,
}: {
  registry: AgentToolRegistry;
  requestPlan: (messages: PlannerMessage[], signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
}) => ({
  plan: async (input: { prompt: string; activePageId: string; signal?: AbortSignal }): Promise<AgentPlanV2> => {
    const catalog = registry.getPlannerCatalog();
    const controller = new AbortController();
    const messages = buildPlannerMessages({ ...input, catalog });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (input.signal?.aborted) {
      controller.abort(input.signal.reason);
      throw new AgentPlannerError('Agent planner request was aborted.');
    }

    let rejectExternalAbort: ((reason: AgentPlannerError) => void) | undefined;
    const onExternalAbort = () => {
      controller.abort(input.signal?.reason);
      rejectExternalAbort?.(new AgentPlannerError('Agent planner request was aborted.'));
    };
    input.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const externalAbort = new Promise<never>((_, reject) => {
      rejectExternalAbort = reject;
    });
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new AgentPlannerTimeoutError(timeoutMs);
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    });

    try {
      const response = await Promise.race([requestPlan(messages, controller.signal), timeout, externalAbort]);
      const validation = validatePlanDependencies(parsePlannerResponse(response), new Set(catalog.map((tool) => tool.id)));
      if (!validation.ok) {
        throw new AgentPlannerError(`Agent planner returned an invalid plan: ${validation.reason}.`);
      }
      return validation.plan;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      input.signal?.removeEventListener('abort', onExternalAbort);
    }
  },
});
