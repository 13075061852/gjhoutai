import { z } from 'zod';

export const agentRunStateSchema = z.enum([
  'routing',
  'planning',
  'executing',
  'awaiting_confirmation',
  'composing',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);

export const agentIntentSchema = z.object({
  kind: z.enum(['chat', 'single_tool', 'complex_agent', 'web_search', 'image_analysis', 'image_generation']),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  toolId: z.string().optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  searchPlan: z.object({
    queries: z.array(z.string()).min(1).max(3),
    maxResults: z.number().int().min(3).max(20),
    searchDepth: z.enum(['basic', 'advanced']),
    topic: z.enum(['general', 'news']),
  }).optional(),
});

export const agentPlanStepSchema = z.object({
  id: z.string().min(1),
  toolId: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  dependsOn: z.array(z.string()).default([]),
});

export const agentPlanSchema = z.object({
  version: z.literal(2),
  kind: z.literal('complex_agent'),
  summary: z.string().min(1),
  steps: z.array(agentPlanStepSchema).min(1).max(4),
});

export const agentToolResultSchema = z.object({
  status: z.enum(['success', 'error', 'cancelled', 'timeout']),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  diagnostics: z.object({ code: z.string(), detail: z.string() }).optional(),
});

export const agentConfirmationSchema = z.object({
  version: z.literal(2),
  id: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  toolId: z.string().min(1),
  inputHash: z.string().min(1),
  riskLevel: z.enum(['read', 'create', 'update', 'delete']),
  expiresAt: z.string().datetime(),
  idempotencyKey: z.string().min(1),
  createdAt: z.string().datetime(),
  consumedAt: z.string().datetime().optional(),
});

export const agentProgressEventSchema = z.object({
  at: z.string().datetime(),
  phase: agentRunStateSchema,
  label: z.string().min(1),
  status: z.enum(['started', 'running', 'completed', 'failed', 'waiting_confirmation']),
  toolId: z.string().min(1).optional(),
  stepId: z.string().min(1).optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const agentToolCallSchema = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  toolId: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1).optional(),
});

export const agentRunRecordSchema = z.object({
  version: z.literal(2),
  id: z.string().min(1),
  prompt: z.string(),
  state: agentRunStateSchema,
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  intent: agentIntentSchema.optional(),
  plan: agentPlanSchema.optional(),
  progress: z.array(agentProgressEventSchema).default([]),
  pendingConfirmation: agentConfirmationSchema.optional(),
  stepResults: z.record(z.string(), agentToolResultSchema).default({}),
  terminalError: z.object({ code: z.string(), message: z.string() }).optional(),
});

export type AgentIntent = z.infer<typeof agentIntentSchema>;
export type AgentPlanV2 = z.infer<typeof agentPlanSchema>;
export type AgentPlanStep = z.infer<typeof agentPlanStepSchema>;
export type AgentRunState = z.infer<typeof agentRunStateSchema>;
export type AgentToolCall = z.infer<typeof agentToolCallSchema>;
export type AgentProgressEvent = z.infer<typeof agentProgressEventSchema>;
export type AgentConfirmation = z.infer<typeof agentConfirmationSchema>;
export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;
export type AgentToolResultV2<TOutput extends Record<string, unknown> = Record<string, unknown>> =
  Omit<z.infer<typeof agentToolResultSchema>, 'data'> & { data: TOutput };

export interface AgentToolDefinition<
  TInput = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  version: number;
  title: string;
  description: string;
  category: string;
  riskLevel: 'read' | 'create' | 'update' | 'delete';
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  timeoutMs: number;
  maxRetries: number;
  idempotent: boolean;
  supportsAbort: boolean;
  handler: (input: TInput, context: {
    runId: string;
    stepId: string;
    signal?: AbortSignal;
    idempotencyKey?: string;
  }) => Promise<AgentToolResultV2<TOutput>>;
}
