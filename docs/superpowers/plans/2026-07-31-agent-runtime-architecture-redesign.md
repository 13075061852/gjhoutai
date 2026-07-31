# Agent Runtime Architecture Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chat-bound Agent loop with a typed, cancellable runtime that routes simple chat directly, plans only complex project work, enforces confirmation for writes, and always reaches a terminal state.

**Architecture:** Build a new Agent runtime beside the legacy chat feature, then migrate registered project capabilities into a versioned tool registry and switch the chat entry point to the new runtime. The runtime uses a deterministic-first intent gateway, a validated plan DAG, a finite-state execution engine, a policy-controlled confirmation pause, and a versioned audit store; legacy records remain readable while the old `gjhSkillCall` and loop protocol are removed after cutover.

**Tech Stack:** TypeScript 5.9, Vite 7, Vitest 4, Zod runtime schemas, existing OpenAI-compatible HTTP endpoints, browser `AbortController`, browser `localStorage`.

## Global Constraints

- Read and write every source, test, document, and JSON file as UTF-8.
- Do not start a browser, development server, preview server, or browser-based verification.
- Keep all existing project data, web search, image analysis, image generation, and configured model-provider capabilities available through the new runtime.
- Route ordinary chat through one chat-model request and never load the project manifest solely because a normal page is active.
- Automatically execute only `read` tools; require confirmation for `create`, `update`, and `delete`.
- Show step names, invoked capabilities, elapsed time, and key results; never expose hidden model reasoning, secrets, raw authorization headers, or full system prompts.
- Use comfortable solid colors only; do not add gradients.
- Preserve the user's unrelated working-tree changes, especially the existing edits in `src/legacy/features/chat.ts` and style files.
- Keep `node_modules/`, `dist/`, `coverage/`, `.wrangler/`, build caches, logs, environment files, local Agent run dumps, and generated artifacts out of Git.
- Use `npm.cmd` for npm commands on Windows and serialize Vitest with `--pool=threads --maxWorkers=1`.
- Every implementation task follows red-green-refactor and ends in an independently reviewable commit.

---

## File and Responsibility Map

### New runtime core

- `src/legacy/features/agent-runtime/protocol.ts` — versioned run, intent, plan, tool, result, progress, and confirmation schemas and TypeScript types.
- `src/legacy/features/agent-runtime/state-machine.ts` — legal `AgentRun` state transitions and terminal-state helpers.
- `src/legacy/features/agent-runtime/run-store.ts` — in-memory and versioned `localStorage` persistence for resumable runs and audit records.
- `src/legacy/features/agent-runtime/policy.ts` — risk evaluation, confirmation creation, confirmation validation, and idempotency protection.
- `src/legacy/features/agent-runtime/intent-gateway.ts` — deterministic-first routing and bounded ambiguous-intent classification.
- `src/legacy/features/agent-runtime/tool-registry.ts` — typed tool registration, schema validation, duplicate detection, and execution lookup.
- `src/legacy/features/agent-runtime/planner.ts` — prompt construction, structured plan parsing, registry validation, dependency validation, and planner timeout.
- `src/legacy/features/agent-runtime/execution-engine.ts` — tool deadlines, retry rules, cancellation, confirmation pause/resume, progress, and evidence collection.
- `src/legacy/features/agent-runtime/response-composer.ts` — grounded final response construction from tool evidence.
- `src/legacy/features/agent-runtime/runtime.ts` — public `route`, `run`, `confirm`, and `cancel` coordination API.
- `src/legacy/features/agent-runtime/project-tool-definitions.ts` — new protocol definitions and adapters for all project, business, property, spectrum, media, navigation, and recognition capabilities.

### Chat integration

- `src/legacy/features/chat/chat-runtime-controller.ts` — adapts the new runtime to chat history, progress rendering, confirmation actions, and final messages.
- `src/legacy/features/chat.ts` — remove the old Agent loop and delegate message execution to the controller while preserving attachments, search, image authorization, and existing output rendering.
- `src/styles/pages/dashboard-chat.css` — solid-color step timeline and confirmation preview states.

### Compatibility and Git

- `src/legacy/features/project-skills.ts` — expose the new registry to the existing project-skills page, remove old text-call execution after cutover, and retain formatting/UI metadata only where still consumed.
- `src/legacy/features/agent-butler.ts` — read capability metadata from the new registry.
- `src/types/global.d.ts` — type the new runtime and registry surfaces on the legacy app.
- `.gitignore` — ignore local Agent run exports and diagnostic dumps.
- `package.json`, `package-lock.json` — add Zod.

---

### Task 1: Define the Versioned Agent Protocol

**Files:**
- Create: `src/legacy/features/agent-runtime/protocol.ts`
- Create: `src/legacy/features/agent-runtime/protocol.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/legacy/features/agent-runtime/types.ts`

**Interfaces:**
- Produces: `agentIntentSchema`, `agentPlanSchema`, `agentToolResultSchema`, `agentRunRecordSchema`, `AgentIntent`, `AgentPlanV2`, `AgentPlanStep`, `AgentRunRecord`, `AgentRunState`, `AgentToolDefinition`, `AgentToolCall`, `AgentToolResultV2`, `AgentProgressEvent`, and `AgentConfirmation`.
- Later tasks import every runtime type from `protocol.ts`; `types.ts` becomes a compatibility re-export only.

- [ ] **Step 1: Install the runtime schema dependency**

Run:

```powershell
npm.cmd i zod
```

Expected: `zod` appears in `dependencies` and the lockfile changes without unrelated package upgrades.

- [ ] **Step 2: Write failing protocol schema tests**

Create tests that require versioned plans, reject unsupported kinds, and reject unstructured tool results:

```ts
import { describe, expect, it } from 'vitest';
import {
  agentPlanSchema,
  agentRunRecordSchema,
  agentToolResultSchema,
} from './protocol';

describe('agent runtime protocol', () => {
  it('accepts a versioned complex plan', () => {
    const parsed = agentPlanSchema.parse({
      version: 2,
      kind: 'complex_agent',
      summary: '查询库存并检查配方风险',
      steps: [
        { id: 'inventory', toolId: 'business.queryPageData', input: { question: '当前库存' }, dependsOn: [] },
      ],
    });
    expect(parsed.steps[0].toolId).toBe('business.queryPageData');
  });

  it('rejects unsupported intent kinds', () => {
    expect(() => agentPlanSchema.parse({ version: 2, kind: 'react_loop', summary: '', steps: [] })).toThrow();
  });

  it('requires a terminal tool-result status', () => {
    expect(() => agentToolResultSchema.parse({ message: 'missing status' })).toThrow();
  });

  it('requires version 2 run records', () => {
    expect(() => agentRunRecordSchema.parse({ version: 1, id: 'run-1' })).toThrow();
  });
});
```

- [ ] **Step 3: Run the tests and verify the missing module failure**

Run:

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/protocol.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because `./protocol` does not exist.

- [ ] **Step 4: Implement the schemas and inferred types**

Define the exact runtime vocabulary:

```ts
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
```

Add `AgentToolDefinition<TInput, TOutput>` with `inputSchema`, `outputSchema`, `riskLevel`, `timeoutMs`, `maxRetries`, `idempotent`, `supportsAbort`, and `handler(input, context): Promise<AgentToolResultV2<TOutput>>`. `outputSchema` validates `result.data`; the outer result is always validated by `agentToolResultSchema`. Define run and confirmation schemas with `version: 2`, timestamps, state, progress events, pending confirmation, step results, and terminal error.

- [ ] **Step 5: Re-export protocol types through the old type entry point**

Replace duplicate plan/result declarations in `types.ts` with explicit re-exports:

```ts
export type {
  AgentIntent,
  AgentPlanV2,
  AgentProgressEvent,
  AgentRunRecord,
  AgentToolDefinition,
  AgentToolResultV2,
} from './protocol';
```

Keep `AgentImage` temporarily because existing media code still consumes it.

- [ ] **Step 6: Run protocol tests and typecheck**

Run:

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/protocol.test.ts --pool=threads --maxWorkers=1
npm.cmd run typecheck
```

Expected: protocol tests PASS and typecheck PASS.

- [ ] **Step 7: Commit the protocol**

```powershell
git add package.json package-lock.json src/legacy/features/agent-runtime/protocol.ts src/legacy/features/agent-runtime/protocol.test.ts src/legacy/features/agent-runtime/types.ts
git commit -m "feat: define versioned agent protocol"
```

---

### Task 2: Add the Finite-State Run Model

**Files:**
- Create: `src/legacy/features/agent-runtime/state-machine.ts`
- Create: `src/legacy/features/agent-runtime/state-machine.test.ts`

**Interfaces:**
- Consumes: `AgentRunRecord`, `AgentRunState`, and `AgentProgressEvent` from `protocol.ts`.
- Produces: `createAgentRun`, `transitionAgentRun`, `appendProgress`, `isTerminalAgentState`, and `AgentStateTransitionError`.

- [ ] **Step 1: Write failing state-transition tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  AgentStateTransitionError,
  appendProgress,
  createAgentRun,
  isTerminalAgentState,
  transitionAgentRun,
} from './state-machine';

describe('agent run state machine', () => {
  it('allows routing through execution to completion', () => {
    const run = createAgentRun({ id: 'run-1', prompt: '查询库存', startedAt: '2026-07-31T00:00:00.000Z' });
    transitionAgentRun(run, 'executing', 'direct read tool');
    transitionAgentRun(run, 'composing', 'tool complete');
    transitionAgentRun(run, 'completed', 'answer complete');
    expect(run.state).toBe('completed');
    expect(isTerminalAgentState(run.state)).toBe(true);
  });

  it('rejects transitions out of a terminal state', () => {
    const run = createAgentRun({ id: 'run-2', prompt: '早', startedAt: '2026-07-31T00:00:00.000Z' });
    transitionAgentRun(run, 'cancelled', 'user cancelled');
    expect(() => transitionAgentRun(run, 'executing', 'late callback')).toThrow(AgentStateTransitionError);
  });

  it('records user-visible progress without hidden reasoning', () => {
    const run = createAgentRun({ id: 'run-3', prompt: '查订单', startedAt: '2026-07-31T00:00:00.000Z' });
    appendProgress(run, { at: '2026-07-31T00:00:01.000Z', phase: 'executing', label: '正在查询订单', status: 'running' });
    expect(run.progress[0]).not.toHaveProperty('thought');
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/state-machine.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the state-machine module is missing.

- [ ] **Step 3: Implement explicit legal transitions**

Use this transition table:

```ts
const ALLOWED_TRANSITIONS: Record<AgentRunState, AgentRunState[]> = {
  routing: ['planning', 'executing', 'composing', 'failed', 'timed_out', 'cancelled'],
  planning: ['executing', 'failed', 'timed_out', 'cancelled'],
  executing: ['awaiting_confirmation', 'composing', 'failed', 'timed_out', 'cancelled'],
  awaiting_confirmation: ['executing', 'cancelled', 'timed_out'],
  composing: ['completed', 'failed', 'timed_out', 'cancelled'],
  completed: [],
  failed: [],
  timed_out: [],
  cancelled: [],
};
```

`transitionAgentRun` must update `state`, `updatedAt`, and terminal `endedAt`; `appendProgress` must reject events after a terminal state.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/state-machine.test.ts --pool=threads --maxWorkers=1
git add src/legacy/features/agent-runtime/state-machine.ts src/legacy/features/agent-runtime/state-machine.test.ts
git commit -m "feat: add agent run state machine"
```

Expected: tests PASS and commit contains only the state-machine files.

---

### Task 3: Persist Runs and Enforce Confirmation Policy

**Files:**
- Create: `src/legacy/features/agent-runtime/run-store.ts`
- Create: `src/legacy/features/agent-runtime/run-store.test.ts`
- Create: `src/legacy/features/agent-runtime/policy.ts`
- Create: `src/legacy/features/agent-runtime/policy.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: protocol schemas and `AgentRunRecord`.
- Produces: `AgentRunStore`, `createMemoryAgentRunStore`, `createLocalStorageAgentRunStore`, `requiresConfirmation`, `createAgentConfirmation`, `validateAgentConfirmation`, and `markConfirmationConsumed`.

- [ ] **Step 1: Write failing store tests**

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryAgentRunStore } from './run-store';
import { createAgentRun } from './state-machine';

describe('agent run store', () => {
  it('saves and restores a version 2 awaiting-confirmation run', async () => {
    const store = createMemoryAgentRunStore();
    const run = createAgentRun({ id: 'run-1', prompt: '创建配方', startedAt: '2026-07-31T00:00:00.000Z' });
    run.state = 'awaiting_confirmation';
    await store.save(run);
    expect((await store.get('run-1'))?.state).toBe('awaiting_confirmation');
  });

  it('returns cloned records so callers cannot mutate persisted state', async () => {
    const store = createMemoryAgentRunStore();
    const run = createAgentRun({ id: 'run-2', prompt: '查询库存', startedAt: '2026-07-31T00:00:00.000Z' });
    await store.save(run);
    const loaded = await store.get('run-2');
    loaded!.state = 'failed';
    expect((await store.get('run-2'))?.state).toBe('routing');
  });
});
```

- [ ] **Step 2: Write failing policy tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createAgentConfirmation,
  markConfirmationConsumed,
  requiresConfirmation,
  validateAgentConfirmation,
} from './policy';

describe('agent permission policy', () => {
  it('allows reads and blocks persistent writes', () => {
    expect(requiresConfirmation('read')).toBe(false);
    expect(requiresConfirmation('create')).toBe(true);
    expect(requiresConfirmation('update')).toBe(true);
    expect(requiresConfirmation('delete')).toBe(true);
  });

  it('invalidates confirmation when tool inputs change', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-1',
      runId: 'run-1',
      stepId: 'step-1',
      toolId: 'formula.createRecipe',
      input: { name: 'PBT-A' },
      riskLevel: 'create',
      expiresAt: '2026-07-31T01:00:00.000Z',
      idempotencyKey: 'idem-1',
    });
    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-1',
      stepId: 'step-1',
      toolId: 'formula.createRecipe',
      input: { name: 'PBT-B' },
      now: '2026-07-31T00:30:00.000Z',
    }).ok).toBe(false);
  });

  it('prevents a consumed confirmation from executing twice', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-2',
      runId: 'run-2',
      stepId: 'step-2',
      toolId: 'spectrum.deleteImages',
      input: { ids: ['img-1'] },
      riskLevel: 'delete',
      expiresAt: '2026-07-31T01:00:00.000Z',
      idempotencyKey: 'idem-2',
    });
    markConfirmationConsumed(confirmation, '2026-07-31T00:20:00.000Z');
    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-2',
      stepId: 'step-2',
      toolId: 'spectrum.deleteImages',
      input: { ids: ['img-1'] },
      now: '2026-07-31T00:30:00.000Z',
    }).reason).toBe('confirmation_already_consumed');
  });
});
```

- [ ] **Step 3: Verify both test files fail**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/run-store.test.ts src/legacy/features/agent-runtime/policy.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement versioned persistence**

Define:

```ts
export interface AgentRunStore {
  get(id: string): Promise<AgentRunRecord | null>;
  save(run: AgentRunRecord): Promise<void>;
  list(limit?: number): Promise<AgentRunRecord[]>;
  remove(id: string): Promise<void>;
}

export const AGENT_RUN_STORAGE_KEY = 'gjh-agent-runs-v2';
```

The local-storage implementation must parse each record with `agentRunRecordSchema`, ignore invalid legacy entries without deleting them, cap the new store at 100 runs, and clone on reads and writes.

- [ ] **Step 5: Implement confirmation hashing and replay protection**

Use stable, sorted JSON to calculate `inputHash`. `validateAgentConfirmation` must compare run ID, step ID, tool ID, input hash, expiry, and `consumedAt`. `markConfirmationConsumed` sets `consumedAt` before the write handler is invoked and the execution engine persists that update.

- [ ] **Step 6: Add local run dumps to Git ignore rules**

Append:

```gitignore
# Local Agent diagnostics
.agent-runs/
*.agent-run.json
```

- [ ] **Step 7: Run tests, check Git rules, and commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/run-store.test.ts src/legacy/features/agent-runtime/policy.test.ts --pool=threads --maxWorkers=1
git check-ignore .agent-runs/example.json sample.agent-run.json
git add .gitignore src/legacy/features/agent-runtime/run-store.ts src/legacy/features/agent-runtime/run-store.test.ts src/legacy/features/agent-runtime/policy.ts src/legacy/features/agent-runtime/policy.test.ts
git commit -m "feat: persist agent runs and confirmations"
```

Expected: tests PASS and both diagnostic paths are ignored.

---

### Task 4: Replace Page-Driven Routing with the Intent Gateway

**Files:**
- Create: `src/legacy/features/agent-runtime/intent-gateway.ts`
- Create: `src/legacy/features/agent-runtime/intent-gateway.test.ts`
- Modify: `src/legacy/features/agent-runtime/router.ts`
- Modify: `src/legacy/features/agent-runtime/router.test.ts`

**Interfaces:**
- Consumes: `AgentIntent`, active page ID, project-access flag, web-search flag, and optional bounded classifier.
- Produces: `createIntentGateway`, `classifyDeterministically`, and a compatibility `createAgentPlan` wrapper during migration.

- [ ] **Step 1: Write the regression test for the reported bug**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createIntentGateway } from './intent-gateway';

describe('agent intent gateway', () => {
  it('routes a greeting directly to chat on a normal project page', async () => {
    const classifier = vi.fn();
    const gateway = createIntentGateway({ classifier });
    const intent = await gateway.route({
      prompt: '早',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(intent.kind).toBe('chat');
    expect(intent.toolId).toBeUndefined();
    expect(classifier).not.toHaveBeenCalled();
  });

  it('routes an explicit inventory query to one read tool', async () => {
    const gateway = createIntentGateway();
    const intent = await gateway.route({
      prompt: '查看当前库存最低的成品',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(intent).toMatchObject({ kind: 'single_tool', toolId: 'business.queryPageData' });
  });

  it('routes cross-domain analysis to the complex planner', async () => {
    const gateway = createIntentGateway();
    const intent = await gateway.route({
      prompt: '结合订单、库存和配方分析本周排产风险',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    expect(intent.kind).toBe('complex_agent');
  });
});
```

- [ ] **Step 2: Add a classifier timeout fallback test**

Use fake timers and an injected `classifyTimeoutMs: 12_000`; the unresolved classifier must fall back to deterministic `chat` and return no project tool.

- [ ] **Step 3: Verify tests fail against the current page-driven router**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/intent-gateway.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the gateway is missing.

- [ ] **Step 4: Implement deterministic-first routing**

Implement the priority order:

```ts
const ROUTE_PRIORITY = [
  'image_generation',
  'image_analysis',
  'explicit_project_tool',
  'explicit_web_search',
  'complex_project_analysis',
  'obvious_chat',
  'ambiguous',
] as const;
```

`activePageId` may select between otherwise matching tools, but it must never change `obvious_chat` to `single_tool` or `complex_agent`. Greetings matching `/^(早|早上好|你好|您好|嗨|hello|hi)[!！。.]*$/i` return `chat` without invoking the classifier.

- [ ] **Step 5: Bound ambiguous classification and preserve deterministic safety**

The classifier returns an `AgentIntent`; wrap it with a 12-second abort deadline. Reject unknown tool IDs later in the registry. A classifier result may upgrade an ambiguous prompt, but cannot downgrade explicit web search or bypass project-access restrictions.

- [ ] **Step 6: Keep router compatibility while callers migrate**

Make `router.ts` delegate to deterministic gateway helpers and remove the rule that returns project context merely because a non-config page is active:

```ts
export const shouldUseProjectContextForPrompt = (prompt: unknown) => (
  PROJECT_DATA_PATTERN.test(String(prompt || '').trim())
);
```

Update the old regression test to assert both `kind === 'chat'` and `useProjectContext === false` for `"早"` and generic small talk.

- [ ] **Step 7: Run routing tests and commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/intent-gateway.test.ts src/legacy/features/agent-runtime/router.test.ts --pool=threads --maxWorkers=1
git add src/legacy/features/agent-runtime/intent-gateway.ts src/legacy/features/agent-runtime/intent-gateway.test.ts src/legacy/features/agent-runtime/router.ts src/legacy/features/agent-runtime/router.test.ts
git commit -m "fix: route ordinary chat outside project agent"
```

---

### Task 5: Build the Typed Tool Registry

**Files:**
- Create: `src/legacy/features/agent-runtime/tool-registry.ts`
- Create: `src/legacy/features/agent-runtime/tool-registry.test.ts`

**Interfaces:**
- Consumes: `AgentToolDefinition`, `AgentToolCall`, and `AgentToolResultV2`.
- Produces: `createAgentToolRegistry`, `AgentToolRegistry`, `ToolRegistrationError`, and `ToolValidationError`.

- [ ] **Step 1: Write failing registry tests**

```ts
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createAgentToolRegistry, ToolRegistrationError, ToolValidationError } from './tool-registry';

const readTool = {
  id: 'inventory.count',
  version: 1,
  title: '库存计数',
  description: '读取库存数量',
  category: 'business',
  riskLevel: 'read',
  inputSchema: z.object({ category: z.string() }),
  outputSchema: z.object({ count: z.number() }),
  timeoutMs: 30_000,
  maxRetries: 1,
  idempotent: true,
  supportsAbort: true,
  handler: async () => ({
    status: 'success',
    message: '库存数量读取完成。',
    data: { count: 3 },
    evidence: [{ field: 'count', value: 3 }],
    actions: [],
  }),
} as const;

describe('agent tool registry', () => {
  it('rejects duplicate tool ids', () => {
    const registry = createAgentToolRegistry();
    registry.register(readTool);
    expect(() => registry.register(readTool)).toThrow(ToolRegistrationError);
  });

  it('validates inputs before returning a call', () => {
    const registry = createAgentToolRegistry([readTool]);
    expect(() => registry.prepareCall('inventory.count', { category: 7 }, { runId: 'r1', stepId: 's1' }))
      .toThrow(ToolValidationError);
  });

  it('exposes planner-safe metadata without handlers', () => {
    const registry = createAgentToolRegistry([readTool]);
    expect(registry.getPlannerCatalog()[0]).not.toHaveProperty('handler');
  });
});
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/tool-registry.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the registry module is missing.

- [ ] **Step 3: Implement registration and validation**

Define:

```ts
export interface AgentToolRegistry {
  register(definition: AgentToolDefinition): void;
  get(toolId: string): AgentToolDefinition | null;
  list(): AgentToolDefinition[];
  getPlannerCatalog(): Array<Omit<AgentToolDefinition, 'handler' | 'inputSchema' | 'outputSchema'> & {
    inputShape: string;
    outputShape: string;
  }>;
  prepareCall(toolId: string, input: unknown, context: { runId: string; stepId: string }): AgentToolCall;
  validateResult(toolId: string, result: unknown): AgentToolResultV2;
}
```

Freeze registered definitions, reject missing metadata, reject nonpositive timeouts, validate the outer result and `result.data`, and keep handler references out of planner serialization.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/tool-registry.test.ts --pool=threads --maxWorkers=1
git add src/legacy/features/agent-runtime/tool-registry.ts src/legacy/features/agent-runtime/tool-registry.test.ts
git commit -m "feat: add typed agent tool registry"
```

---

### Task 6: Add the Validated Complex-Task Planner

**Files:**
- Create: `src/legacy/features/agent-runtime/planner.ts`
- Create: `src/legacy/features/agent-runtime/planner.test.ts`
- Modify: `src/legacy/features/agent-runtime/orchestrator.ts`
- Modify: `src/legacy/features/agent-runtime/orchestrator.test.ts`

**Interfaces:**
- Consumes: `AgentToolRegistry`, tool planner catalog, model request adapter, user prompt, active page, and abort signal.
- Produces: `createAgentPlanner`, `validatePlanDependencies`, `AgentPlannerError`, and `AgentPlannerTimeoutError`.

- [ ] **Step 1: Write failing planner validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { validatePlanDependencies } from './planner';

describe('agent planner', () => {
  it('accepts an acyclic plan with registered tools', () => {
    const result = validatePlanDependencies({
      version: 2,
      kind: 'complex_agent',
      summary: '库存与配方风险',
      steps: [
        { id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] },
        { id: 'formula', toolId: 'formula.read', input: {}, dependsOn: ['inventory'] },
      ],
    }, new Set(['inventory.read', 'formula.read']));
    expect(result.ok).toBe(true);
  });

  it('rejects unknown tools, missing dependencies, cycles, and duplicate step ids', () => {
    const invalid = {
      version: 2,
      kind: 'complex_agent',
      summary: 'invalid',
      steps: [
        { id: 'same', toolId: 'unknown', input: {}, dependsOn: ['same'] },
        { id: 'same', toolId: 'inventory.read', input: {}, dependsOn: ['missing'] },
      ],
    } as const;
    expect(validatePlanDependencies(invalid, new Set(['inventory.read'])).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Write a bounded planner request test**

Inject a `requestPlan` mock and fake timers. Verify the planner:

- sends only planner-safe tool metadata,
- requests strict JSON matching `AgentPlanV2`,
- aborts at 45 seconds,
- rejects a plan with more than four steps,
- never executes a tool.

- [ ] **Step 3: Verify planner tests fail**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/planner.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because `planner.ts` does not exist.

- [ ] **Step 4: Implement the planner boundary**

Expose:

```ts
export const createAgentPlanner = ({
  registry,
  requestPlan,
  timeoutMs = 45_000,
}: {
  registry: AgentToolRegistry;
  requestPlan: (messages: Array<{ role: string; content: string }>, signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
}) => ({
  plan: async (input: { prompt: string; activePageId: string; signal?: AbortSignal }): Promise<AgentPlanV2> => {
    // Build catalog-only messages, enforce deadline, parse schema, validate graph.
  },
});
```

The system message must state that the planner returns a complete plan, may use at most four tools, cannot invent tools, cannot return a final user answer, and cannot bypass confirmation.

- [ ] **Step 5: Retire the old ReAct decision evaluator**

Replace `evaluateAgentLoopDecision` exports with compatibility wrappers that validate a complete V2 plan. Keep `getAgentSkillCallSignature` only until tool migration tests no longer import it, then remove it in Task 11.

- [ ] **Step 6: Run planner and orchestrator tests, then commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/planner.test.ts src/legacy/features/agent-runtime/orchestrator.test.ts --pool=threads --maxWorkers=1
git add src/legacy/features/agent-runtime/planner.ts src/legacy/features/agent-runtime/planner.test.ts src/legacy/features/agent-runtime/orchestrator.ts src/legacy/features/agent-runtime/orchestrator.test.ts
git commit -m "feat: add validated agent planner"
```

---

### Task 7: Implement the Cancellable Execution Engine

**Files:**
- Create: `src/legacy/features/agent-runtime/execution-engine.ts`
- Create: `src/legacy/features/agent-runtime/execution-engine.test.ts`

**Interfaces:**
- Consumes: `AgentToolRegistry`, `AgentRunStore`, policy helpers, `AgentPlanV2`, clock/ID dependencies, and parent abort signal.
- Produces: `createAgentExecutionEngine`, `executePlan`, `executeSingleTool`, `resumeConfirmedRun`, and `cancelRun`.

- [ ] **Step 1: Write failing direct-read and retry tests**

Create a registry tool whose handler fails once with `{ code: 'NETWORK_TEMPORARY' }` and then succeeds. Assert:

```ts
expect(result.status).toBe('success');
expect(handler).toHaveBeenCalledTimes(2);
expect(run.state).toBe('composing');
```

Add a non-idempotent `create` tool with `maxRetries: 1` and assert its handler is never called before confirmation and is called once after confirmation.

- [ ] **Step 2: Write failing timeout and cancellation tests**

Use fake timers with handlers that never resolve. Verify:

```ts
expect((await store.get('run-timeout'))?.state).toBe('timed_out');
expect((await store.get('run-cancel'))?.state).toBe('cancelled');
expect(progress.at(-1)?.status).toBe('timeout');
```

The parent abort signal must reach a tool that declares `supportsAbort: true`.

- [ ] **Step 3: Write failing confirmation-resume and replay tests**

Execute a `delete` plan and expect `awaiting_confirmation` with the handler untouched. Resume with the exact confirmation and expect one handler call. Resume again with the same confirmation and expect the persisted first result without a second call.

- [ ] **Step 4: Verify execution tests fail**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/execution-engine.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the engine is missing.

- [ ] **Step 5: Implement one deadline per tool call**

Implement an abort helper that combines parent cancellation and tool timeout. Convert abort causes into `cancelled` or `timeout`, not a generic user-stop message. Retry only when all conditions are true:

```ts
const canRetry = (
  definition.riskLevel === 'read'
  && definition.idempotent
  && attempt <= definition.maxRetries
  && result.diagnostics?.code === 'NETWORK_TEMPORARY'
);
```

- [ ] **Step 6: Implement plan ordering and confirmation pause**

Topologically execute ready steps in declared order. Before a write handler:

1. create and persist `AgentConfirmation`,
2. transition to `awaiting_confirmation`,
3. emit a `waiting_confirmation` progress event,
4. return without calling the handler.

On resume, validate and consume the confirmation, transition back to `executing`, invoke the handler once with the stored idempotency key, persist the result, and continue remaining steps.

- [ ] **Step 7: Guarantee terminal cleanup inside the engine**

Wrap every public method in `try/catch/finally`; clear child timers in `finally`. Unknown exceptions become a structured `error` result and `failed` run state. Late callbacks must be ignored after a terminal state.

- [ ] **Step 8: Run tests and commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/execution-engine.test.ts --pool=threads --maxWorkers=1
git add src/legacy/features/agent-runtime/execution-engine.ts src/legacy/features/agent-runtime/execution-engine.test.ts
git commit -m "feat: execute agent plans with cancellation"
```

---

### Task 8: Migrate Project Capabilities to V2 Tool Definitions

**Files:**
- Create: `src/legacy/features/agent-runtime/project-tool-definitions.ts`
- Create: `src/legacy/features/agent-runtime/project-tool-definitions.test.ts`
- Modify: `src/legacy/features/agent-runtime/tools.ts`
- Modify: `src/legacy/features/project-skills.ts`
- Modify: `src/legacy/features/agent-butler.ts`

**Interfaces:**
- Consumes: the legacy `App` capability handlers and `AgentToolDefinition`.
- Produces: `createProjectToolDefinitions(App)`, `createProjectToolRegistry(App)`, and planner-safe metadata for the project-skills UI and Agent Butler.

- [ ] **Step 1: Write a failing complete-registry contract test**

Require these V2 IDs:

```ts
const REQUIRED_TOOL_IDS = [
  'assistant.modelInfo',
  'assistant.currentPage',
  'assistant.projectGuide',
  'assistant.openPage',
  'project.getManifest',
  'project.searchCapabilities',
  'project.auditRuntime',
  'project.inspectPage',
  'project.finalAnswerCheck',
  'business.queryPageData',
  'business.analyzeOverview',
  'property.searchRows',
  'property.summarizeMetrics',
  'property.compareRows',
  'property.validateRanges',
  'spectrum.searchImages',
  'spectrum.deleteImages',
  'analysis.buildJointPackage',
  'formula.createRecipe',
  'dataRecognition.searchHistory',
  'dataRecognition.inspectCurrent',
  'web.search',
  'media.generateImage',
  'media.analyzeImages',
];
```

Assert every definition has version, schemas, timeout, abort policy, retry policy, and correct risk level. Assert `formula.createRecipe` and `media.generateImage` are `create`, `spectrum.deleteImages` is `delete`, and all other listed tools are `read`.

- [ ] **Step 2: Write handler-normalization tests**

Use a fake `App` to verify:

- old `{ ok: true, message, data }` becomes `status: 'success'`,
- old `{ ok: false, message }` becomes `status: 'error'`,
- thrown errors become sanitized diagnostics,
- `spectrum.searchImages` always injects `{ action: 'search' }`,
- `spectrum.deleteImages` always injects `{ action: 'delete' }`,
- API keys and raw image data do not enter `evidence`.

- [ ] **Step 3: Verify contract tests fail**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/project-tool-definitions.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the V2 definitions do not exist.

- [ ] **Step 4: Implement explicit tool schemas and adapters**

Use Zod schemas per tool. `createProjectToolDefinitions` accepts explicit adapters for web search and other capabilities that are not methods on `App`:

```ts
export const createProjectToolDefinitions = (
  App: any,
  adapters: {
    searchWeb: (input: {
      queries: string[];
      maxResults: number;
      searchDepth: 'basic' | 'advanced';
      topic: 'general' | 'news';
    }, signal?: AbortSignal) => Promise<unknown>;
  },
): AgentToolDefinition[] => {
  // Return the complete REQUIRED_TOOL_IDS set.
};
```

Use Zod schemas per tool. For example:

```ts
const businessQueryInput = z.object({
  question: z.string().min(1),
  pageId: z.string().optional(),
  intent: z.enum(['count', 'list', 'filter', 'detail', 'aggregate', 'extrema']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).passthrough();

const formulaCreateInput = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  components: z.array(z.object({
    material: z.string().min(1),
    percentage: z.number().positive(),
  })).min(1),
});

const webSearchInput = z.object({
  queries: z.array(z.string().min(1)).min(1).max(3),
  maxResults: z.number().int().min(3).max(20).default(5),
  searchDepth: z.enum(['basic', 'advanced']).default('basic'),
  topic: z.enum(['general', 'news']).default('general'),
});
```

Move runtime-only tool definitions from `tools.ts` into the returned V2 list or wrap their existing handlers with explicit schemas. Split the action-dependent spectrum skill into search and delete definitions.

- [ ] **Step 5: Expose the V2 registry to existing capability pages**

Update `project-skills.ts` so its UI catalog reads V2 metadata and its manual “run” action delegates to the execution engine. Keep formatting helpers only while chat migration still consumes them. Update Agent Butler to read `registry.list()` rather than the old skill array.

- [ ] **Step 6: Run registry, tool, and capability tests**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/project-tool-definitions.test.ts src/legacy/features/agent-runtime/tools.test.ts src/legacy/features/agent-runtime/skill-catalog.test.ts --pool=threads --maxWorkers=1
```

Expected: all tests PASS and the registered tool count matches the required ID list.

- [ ] **Step 7: Commit the capability migration**

```powershell
git add src/legacy/features/agent-runtime/project-tool-definitions.ts src/legacy/features/agent-runtime/project-tool-definitions.test.ts src/legacy/features/agent-runtime/tools.ts src/legacy/features/project-skills.ts src/legacy/features/agent-butler.ts
git commit -m "feat: migrate project capabilities to agent tools"
```

---

### Task 9: Compose Grounded Answers and Coordinate Full Runs

**Files:**
- Create: `src/legacy/features/agent-runtime/response-composer.ts`
- Create: `src/legacy/features/agent-runtime/response-composer.test.ts`
- Create: `src/legacy/features/agent-runtime/runtime.ts`
- Create: `src/legacy/features/agent-runtime/runtime.test.ts`
- Modify: `src/legacy/features/agent-runtime/grounding.ts`
- Modify: `src/legacy/features/agent-runtime/grounding.test.ts`
- Modify: `src/legacy/features/agent-runtime/transport.ts`

**Interfaces:**
- Consumes: gateway, planner, registry, execution engine, run store, chat-model adapter, and progress callback.
- Produces: `createAgentRuntime`, `AgentRuntime.run`, `AgentRuntime.confirm`, `AgentRuntime.cancel`, and `composeGroundedResponse`.

- [ ] **Step 1: Write failing response-composer tests**

Verify a result with no evidence cannot claim a business count, a failed tool cannot be described as successful, and deterministic tool formatting is used when the model output is empty or unsupported.

```ts
expect(composeGroundedResponse({
  proposedAnswer: '库存共有 99 条。',
  results: [],
  fallback: '没有取得库存数据。',
}).content).toBe('没有取得库存数据。');
```

- [ ] **Step 2: Write the ordinary-chat integration regression**

Inject spies for gateway, chat model, planner, registry, and project manifest:

```ts
const result = await runtime.run({ prompt: '早', activePageId: 'dashboard' });
expect(result.state).toBe('completed');
expect(chatModel).toHaveBeenCalledOnce();
expect(planner.plan).not.toHaveBeenCalled();
expect(projectManifestTool).not.toHaveBeenCalled();
expect(result.answer).toContain('早');
```

- [ ] **Step 3: Write complex, confirmation, timeout, and cancellation integration tests**

Cover:

- a two-tool complex plan reaches `completed`,
- a write plan returns `awaiting_confirmation`,
- `confirm` resumes and completes,
- `cancel` aborts the active child request,
- planner timeout reaches `timed_out`,
- every path emits exactly one terminal event,
- runtime no longer reports a timeout as a user cancellation.

- [ ] **Step 4: Verify tests fail**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/response-composer.test.ts src/legacy/features/agent-runtime/runtime.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the composer and runtime modules are missing.

- [ ] **Step 5: Implement the response composer**

Reuse the grounding selector but require `AgentToolResultV2.evidence`. The model receives compact evidence and the original question, never handlers, secrets, confirmation tokens, or full raw image payloads. Fall back to deterministic summaries on model failure.

- [ ] **Step 6: Implement the runtime coordinator**

Expose:

```ts
export interface AgentRuntime {
  run(input: {
    prompt: string;
    activePageId: string;
    projectAccessEnabled: boolean;
    webSearchEnabled: boolean;
    signal?: AbortSignal;
    onProgress?: (event: AgentProgressEvent) => void;
  }): Promise<{ run: AgentRunRecord; answer: string; images: unknown[]; actions: unknown[] }>;
  confirm(input: { runId: string; confirmationId: string; signal?: AbortSignal }): Promise<{
    run: AgentRunRecord;
    answer: string;
    images: unknown[];
    actions: unknown[];
  }>;
  cancel(runId: string): Promise<AgentRunRecord | null>;
}
```

Routing behavior:

- `chat` → one chat-model request, then `completed`.
- `single_tool`, `web_search`, `image_analysis`, `image_generation` → one registered tool path.
- `complex_agent` → planner, execution engine, composer.
- write path → return at `awaiting_confirmation` without composing a success answer.

Wrap the complete method body, including route classification and config resolution, in `try/catch/finally`.

- [ ] **Step 7: Update transport errors**

Add distinct `AgentTransportTimeoutError` and `AgentTransportCancelledError`. Preserve abort reasons so a 45-second planner deadline is reported as timeout, while a user abort is reported as cancellation.

- [ ] **Step 8: Run runtime tests and commit**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/response-composer.test.ts src/legacy/features/agent-runtime/runtime.test.ts src/legacy/features/agent-runtime/grounding.test.ts --pool=threads --maxWorkers=1
git add src/legacy/features/agent-runtime/response-composer.ts src/legacy/features/agent-runtime/response-composer.test.ts src/legacy/features/agent-runtime/runtime.ts src/legacy/features/agent-runtime/runtime.test.ts src/legacy/features/agent-runtime/grounding.ts src/legacy/features/agent-runtime/grounding.test.ts src/legacy/features/agent-runtime/transport.ts
git commit -m "feat: coordinate grounded agent runs"
```

---

### Task 10: Integrate Runtime Progress and Confirmation into Chat

**Files:**
- Create: `src/legacy/features/chat/chat-runtime-controller.ts`
- Create: `src/legacy/features/chat/chat-runtime-controller.test.ts`
- Modify: `src/legacy/features/chat.ts`
- Modify: `src/styles/pages/dashboard-chat.css`
- Modify: `src/types/global.d.ts`

**Interfaces:**
- Consumes: `AgentRuntime`, chat session accessors, message render callbacks, config adapters, attachment adapters, and current-page access.
- Produces: `createChatRuntimeController`, `submit`, `confirm`, `cancel`, and user-visible step/confirmation message models.

- [ ] **Step 1: Write failing controller tests**

Use a fake runtime and fake message store to verify:

- submitting `"早"` creates one pending assistant message and then one completed answer,
- progress updates replace the current pending step without adding duplicate assistant messages,
- `awaiting_confirmation` renders target, parameters, impact, expiry, confirm, and cancel actions,
- final, failed, timed-out, and cancelled results clear busy state,
- an exception during configuration or routing still clears busy state,
- late events from an older run are ignored.

- [ ] **Step 2: Verify controller tests fail**

```powershell
npm.cmd test -- src/legacy/features/chat/chat-runtime-controller.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the controller module is missing.

- [ ] **Step 3: Implement the controller with a single cleanup boundary**

The controller owns `activeRunId` and `AbortController`. Its `submit` method must start with:

```ts
setBusy(true);
try {
  const result = await runtime.run({ ...input, signal: controller.signal, onProgress });
  applyRunResult(result);
} catch (error) {
  applyTerminalError(error);
} finally {
  if (activeRunId === runId) {
    activeRunId = '';
    setBusy(false);
    focusInput();
  }
}
```

Confirmation uses `runtime.confirm`; cancellation aborts the controller and calls `runtime.cancel(activeRunId)`.

- [ ] **Step 4: Replace the old chat Agent path**

In `chat.ts`:

- preserve the user's existing token-display removal and unrelated output changes,
- instantiate the runtime and controller during chat initialization,
- route `sendChatMessage` through the controller,
- retain attachment compression and explicit image-upload authorization as injected adapters,
- remove `runProjectAgentLoop`, `callProjectAgentPlanner`, `executeProjectSkillWithRetry`, the AI route preflight outside `try/finally`, and text-based skill-call execution,
- keep session persistence, search source rendering, image preview, and assistant actions.

The send button must stop the active runtime through the controller.

- [ ] **Step 5: Render solid-color progress and confirmation UI**

Add classes for `.ai-agent-steps`, `.ai-agent-step`, and `.ai-agent-confirmation`. Use existing neutral borders and solid background colors; do not add `linear-gradient`, `radial-gradient`, or `conic-gradient`. Keep status height stable so content does not jump between phases.

- [ ] **Step 6: Add global runtime types**

Type the V2 runtime and registry surfaces in `global.d.ts`; remove obsolete text-call methods after all compile errors are resolved.

- [ ] **Step 7: Run chat and style tests**

```powershell
npm.cmd test -- src/legacy/features/chat/chat-runtime-controller.test.ts src/legacy/features/chat/chat-agent.test.ts src/legacy/features/chat/chat-core.test.ts src/legacy/features/chat/chat-message-output.test.ts --pool=threads --maxWorkers=1
rg -n "linear-gradient|radial-gradient|conic-gradient" src/styles/pages/dashboard-chat.css
```

Expected: tests PASS and gradient scan returns no matches.

- [ ] **Step 8: Commit the chat cutover**

```powershell
git add src/legacy/features/chat/chat-runtime-controller.ts src/legacy/features/chat/chat-runtime-controller.test.ts src/legacy/features/chat.ts src/styles/pages/dashboard-chat.css src/types/global.d.ts
git commit -m "feat: connect chat to agent runtime"
```

Before committing, inspect `git diff --cached` to confirm no unrelated pre-existing style or chat changes were staged accidentally.

---

### Task 11: Remove the Old Agent Protocol and Preserve Audit Compatibility

**Files:**
- Modify: `src/legacy/features/project-skills.ts`
- Modify: `src/legacy/features/agent-runtime/orchestrator.ts`
- Modify: `src/legacy/features/agent-runtime/router.ts`
- Modify: `src/legacy/features/agent-runtime/context.ts`
- Modify: `src/legacy/features/chat.ts`
- Create: `src/legacy/features/agent-runtime/legacy-compatibility.test.ts`
- Create: `src/legacy/features/agent-runtime/context.test.ts`

**Interfaces:**
- Consumes: V2 registry and V2 run store.
- Produces: read-only legacy history import and no executable legacy Agent protocol.

- [ ] **Step 1: Write a failing legacy-removal test**

Read source files as UTF-8 and assert executable legacy markers are gone:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('legacy agent protocol removal', () => {
  it('removes text skill calls and the old project agent loop', () => {
    const chat = readFileSync('src/legacy/features/chat.ts', 'utf8');
    const skills = readFileSync('src/legacy/features/project-skills.ts', 'utf8');
    expect(chat).not.toContain('runProjectAgentLoop');
    expect(chat).not.toContain('callProjectAgentPlanner');
    expect(skills).not.toContain('executeSkillCallFromText');
    expect(skills).not.toContain('gjhSkillCall');
  });
});
```

Add a fixture with one old history record and verify the project-skills history view can read it without attempting to parse it as a V2 run.

Create `context.test.ts` with an `App` fixture containing an API key, authorization header, confirmation token, and image data URL. Assert `buildAgentContextSnapshot` returns capability metadata but its serialized form contains none of those four sensitive values.

- [ ] **Step 2: Verify the removal test fails**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/legacy-compatibility.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because legacy executable markers still exist.

- [ ] **Step 3: Remove executable legacy paths**

Delete old ReAct decision parsing, `gjhSkillCall` prompt examples, text-call parsing/execution, duplicated retry helpers, duplicated project-loop timeouts, and obsolete router compatibility once no caller imports them. Keep only old history rendering and explicit conversion helpers required for read-only display.

- [ ] **Step 4: Update context and capability consumers**

Use V2 planner catalog for manifest summaries. Ensure context snapshots do not serialize handlers, raw secrets, confirmation tokens, or complete image data URLs.

- [ ] **Step 5: Run compatibility and source scans**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime/legacy-compatibility.test.ts src/legacy/features/agent-runtime/context.test.ts src/legacy/features/agent-runtime/skill-catalog.test.ts --pool=threads --maxWorkers=1
rg -n "runProjectAgentLoop|callProjectAgentPlanner|executeSkillCallFromText|gjhSkillCall" src/legacy/features -g '!*.test.ts'
```

Expected: tests PASS and source scan returns no executable legacy protocol matches.

- [ ] **Step 6: Commit the cleanup**

```powershell
git add src/legacy/features/project-skills.ts src/legacy/features/agent-runtime/orchestrator.ts src/legacy/features/agent-runtime/router.ts src/legacy/features/agent-runtime/context.ts src/legacy/features/chat.ts src/legacy/features/agent-runtime/legacy-compatibility.test.ts src/legacy/features/agent-runtime/context.test.ts
git commit -m "refactor: remove legacy agent execution protocol"
```

---

### Task 12: Verify the Complete Runtime and Update Project Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-31-agent-architecture-redesign-design.md` only if implementation details require a factual clarification
- Test: all `src/**/*.test.ts`

**Interfaces:**
- Consumes: the completed Agent runtime.
- Produces: verified build artifacts locally, updated operator documentation, and a clean staged scope.

- [ ] **Step 1: Document runtime behavior and safety**

Add a concise README section describing:

- direct ordinary chat,
- deterministic single-tool routing,
- complex planning,
- query auto-execution,
- write confirmation,
- cancellation and timeout behavior,
- visible steps without hidden reasoning,
- versioned local audit records,
- the fact that API credentials remain in the existing local configuration path.

- [ ] **Step 2: Run the focused Agent and chat suite**

```powershell
npm.cmd test -- src/legacy/features/agent-runtime src/legacy/features/chat --pool=threads --maxWorkers=1
```

Expected: all Agent and chat tests PASS.

- [ ] **Step 3: Run the full automated suite**

```powershell
npm.cmd test -- --pool=threads --maxWorkers=1
```

Expected: all tests PASS. Record any unrelated pre-existing failure separately and do not alter unrelated features to hide it.

- [ ] **Step 4: Run typecheck and production build**

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Expected: both commands exit successfully.

- [ ] **Step 5: Run static safety and repository checks**

```powershell
rg -n "linear-gradient|radial-gradient|conic-gradient" src/legacy/features/agent-runtime src/legacy/features/chat src/styles/pages/dashboard-chat.css
rg -n "runProjectAgentLoop|callProjectAgentPlanner|executeSkillCallFromText|gjhSkillCall" src -g '!*.test.ts'
git diff --check
git status --short
```

Expected: no gradients in the touched Agent UI, no executable old protocol references, no whitespace errors, and only intentional files appear in the task diff. Existing unrelated user changes may remain unstaged.

- [ ] **Step 6: Commit documentation and final verification adjustments**

```powershell
git add README.md docs/superpowers/specs/2026-07-31-agent-architecture-redesign-design.md
git commit -m "docs: explain agent runtime behavior"
```

If the design document did not need a factual clarification, stage and commit only `README.md`.

- [ ] **Step 7: Prepare the handoff**

Report:

- implemented architecture and user-visible behavior,
- all focused/full test, typecheck, and build results,
- exact commits,
- preserved unrelated working-tree changes,
- browser verification intentionally not run per project instructions,
- manual checks for the user: ordinary greeting latency, complex multi-tool progress, write confirmation, cancel, and timeout messaging.
