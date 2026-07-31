import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createAgentExecutionEngine } from '../agent-runtime/execution-engine';
import type { AgentProgressEvent, AgentRunRecord, AgentRunState } from '../agent-runtime/protocol';
import { createMemoryAgentRunStore } from '../agent-runtime/run-store';
import {
  createAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeResult,
} from '../agent-runtime/runtime';
import { createAgentToolRegistry } from '../agent-runtime/tool-registry';
import {
  createChatRuntimeController,
  type ChatRuntimeMessage,
} from './chat-runtime-controller';

const now = '2026-07-31T08:00:00.000Z';

const runRecord = (
  id: string,
  state: AgentRunState,
  overrides: Partial<AgentRunRecord> = {},
): AgentRunRecord => ({
  version: 2,
  id,
  prompt: '早',
  state,
  startedAt: now,
  updatedAt: now,
  progress: [],
  confirmationHistory: {},
  stepResults: {},
  ...overrides,
});

const runtimeResult = (
  id: string,
  state: AgentRunState,
  overrides: Partial<AgentRuntimeResult> = {},
): AgentRuntimeResult => ({
  run: runRecord(id, state),
  state,
  answer: state === 'completed' ? '早上好。' : '',
  images: [],
  actions: [],
  ...overrides,
});

const createHarness = (
  runtimeOverrides: Partial<AgentRuntime> = {},
  options: {
    prepareAttachments?: () => unknown | Promise<unknown>;
  } = {},
) => {
  const messages: ChatRuntimeMessage[] = [];
  const messageUpdates: ChatRuntimeMessage[] = [];
  const busy: boolean[] = [];
  const runtime: AgentRuntime = {
    run: vi.fn().mockResolvedValue(runtimeResult('run-1', 'completed')),
    confirm: vi.fn().mockResolvedValue(runtimeResult('run-1', 'completed')),
    cancel: vi.fn().mockResolvedValue(null),
    ...runtimeOverrides,
  };
  const focusInput = vi.fn();
  const prepareAttachments = options.prepareAttachments
    ? vi.fn(options.prepareAttachments)
    : vi.fn().mockResolvedValue(undefined);
  const controller = createChatRuntimeController({
    runtime,
    getActivePageId: () => 'dashboard',
    getRunConfig: () => ({
      projectAccessEnabled: true,
      webSearchEnabled: true,
    }),
    prepareAttachments,
    addAssistantMessage(message) {
      messages.push(message);
      return messages.length - 1;
    },
    updateAssistantMessage(index, message) {
      messages[Number(index)] = message;
      messageUpdates.push(structuredClone(message));
    },
    setBusy(value) {
      busy.push(value);
    },
    focusInput,
  });
  return {
    busy,
    controller,
    focusInput,
    messages,
    messageUpdates,
    prepareAttachments,
    runtime,
  };
};

describe('chat runtime controller', () => {
  it('replaces one pending assistant message with the completed answer', async () => {
    const harness = createHarness();

    await harness.controller.submit({ prompt: '早' });

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toMatchObject({
      role: 'assistant',
      pending: false,
      content: '早上好。',
    });
    expect(harness.prepareAttachments).toHaveBeenCalledOnce();
    expect(harness.runtime.run).toHaveBeenCalledOnce();
  });

  it('replaces the current progress step without adding assistant messages', async () => {
    let emitProgress!: (event: AgentProgressEvent) => void;
    const harness = createHarness({
      run: vi.fn().mockImplementation(async (input) => {
        emitProgress = input.onProgress;
        input.onProgress?.({
          at: now,
          phase: 'routing',
          label: '正在判断请求类型。',
          status: 'started',
        });
        input.onProgress?.({
          at: now,
          phase: 'planning',
          label: '正在制定执行计划。',
          status: 'running',
        });
        return runtimeResult('run-progress', 'completed');
      }),
    });

    await harness.controller.submit({ prompt: '分析库存' });

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0].agentSteps).toEqual([
      expect.objectContaining({
        phase: 'planning',
        label: '正在制定执行计划。',
        status: 'running',
      }),
    ]);
    expect(emitProgress).toBeTypeOf('function');
  });

  it('shows each real execution-engine tool step once through the runtime bridge', async () => {
    let finishTool!: () => void;
    const toolFinished = new Promise<void>((resolve) => {
      finishTool = resolve;
    });
    const registry = createAgentToolRegistry([{
      id: 'inventory.read',
      version: 2,
      title: '读取库存',
      description: '读取库存',
      category: 'inventory',
      riskLevel: 'read',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number() }),
      timeoutMs: 30_000,
      maxRetries: 0,
      idempotent: true,
      supportsAbort: true,
      async handler() {
        await toolFinished;
        return {
          status: 'success',
          message: '库存读取完成。',
          data: { count: 3 },
          evidence: [{ count: 3 }],
          actions: [],
        };
      },
    }]);
    const store = createMemoryAgentRunStore();
    const executionEngine = createAgentExecutionEngine({
      registry,
      store,
      now: () => now,
    });
    const runtime = createAgentRuntime({
      gateway: {
        route: vi.fn().mockResolvedValue({
          kind: 'single_tool',
          confidence: 0.99,
          reason: 'inventory lookup',
          toolId: 'inventory.read',
          toolInput: {},
        }),
      },
      planner: { plan: vi.fn() },
      registry,
      executionEngine,
      store,
      chatModel: vi.fn().mockResolvedValue('库存共有 3 条。'),
      now: () => now,
      createId: () => 'run-real-engine',
    });
    const harness = createHarness(runtime);

    const running = harness.controller.submit({ prompt: '读取库存' });
    await vi.waitFor(() => {
      expect(harness.messages[0]?.agentSteps?.[0]).toMatchObject({
        phase: 'executing',
        stepId: 'single-step',
        status: 'running',
      });
    });
    expect(harness.messages).toHaveLength(1);

    finishTool();
    await running;

    expect(harness.messageUpdates.filter((message) => (
      message.agentSteps?.[0]?.stepId === 'single-step'
      && message.agentSteps[0].status === 'running'
    ))).toHaveLength(1);
    expect(harness.messageUpdates.filter((message) => (
      message.agentSteps?.[0]?.stepId === 'single-step'
      && message.agentSteps[0].status === 'completed'
    ))).toHaveLength(1);
  });

  it('renders confirmation target, parameters, impact, expiry and both actions', async () => {
    const confirmation = {
      version: 2 as const,
      id: 'confirmation-1',
      runId: 'run-confirm',
      stepId: 'create-formula',
      toolId: 'formula.createRecipe',
      inputHash: 'hash',
      riskLevel: 'create' as const,
      expiresAt: '2026-07-31T08:10:00.000Z',
      idempotencyKey: 'idem-1',
      createdAt: now,
    };
    const result = runtimeResult('run-confirm', 'awaiting_confirmation', {
      run: runRecord('run-confirm', 'awaiting_confirmation', {
        plan: {
          version: 2,
          kind: 'complex_agent',
          summary: '创建配方',
          steps: [{
            id: 'create-formula',
            toolId: 'formula.createRecipe',
            input: { name: '耐热配方', material: 'PBT' },
            dependsOn: [],
          }],
        },
        pendingConfirmation: confirmation,
      }),
      answer: '此操作需要确认后才能执行。',
    });
    const harness = createHarness({
      run: vi.fn().mockResolvedValue(result),
    });

    await harness.controller.submit({ prompt: '创建耐热配方' });

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0].agentConfirmation).toEqual({
      runId: 'run-confirm',
      confirmationId: 'confirmation-1',
      target: 'formula.createRecipe',
      parameters: [
        { name: 'name', value: '耐热配方' },
        { name: 'material', value: 'PBT' },
      ],
      impact: '将创建新的项目数据',
      expiresAt: '2026-07-31T08:10:00.000Z',
      actions: [
        { id: 'confirm', label: '确认执行' },
        { id: 'cancel', label: '取消' },
      ],
    });
  });

  it.each([
    ['completed', '完成'],
    ['failed', '失败'],
    ['timed_out', '超时'],
    ['cancelled', '取消'],
  ] as const)('clears busy state after a %s result', async (state, answer) => {
    const harness = createHarness({
      run: vi.fn().mockResolvedValue(runtimeResult(`run-${state}`, state, { answer })),
    });

    await harness.controller.submit({ prompt: '测试' });

    expect(harness.busy).toEqual([true, false]);
    expect(harness.focusInput).toHaveBeenCalledOnce();
    expect(harness.messages[0]).toMatchObject({ pending: false, content: answer });
  });

  it('clears busy state when configuration throws before routing', async () => {
    const harness = createHarness();
    const getRunConfig = vi.fn(() => {
      throw new Error('配置不可用');
    });
    const controller = createChatRuntimeController({
      runtime: harness.runtime,
      getActivePageId: () => 'dashboard',
      getRunConfig,
      addAssistantMessage: (message) => {
        harness.messages.push(message);
        return harness.messages.length - 1;
      },
      updateAssistantMessage: (index, message) => {
        harness.messages[Number(index)] = message;
      },
      setBusy: (value) => harness.busy.push(value),
      focusInput: harness.focusInput,
    });

    await controller.submit({ prompt: '早' });

    expect(harness.runtime.run).not.toHaveBeenCalled();
    expect(harness.messages[0]).toMatchObject({
      pending: false,
      content: '发送失败：配置不可用',
    });
    expect(harness.busy).toEqual([true, false]);
    expect(harness.focusInput).toHaveBeenCalledOnce();
  });

  it('finishes without routing when the attachment adapter declines upload', async () => {
    const harness = createHarness({}, {
      prepareAttachments: async () => ({
        terminalMessage: '已取消上传 2 张图片，本次未向 AI 发送图片。',
      }),
    });

    await harness.controller.submit({ prompt: '分析这两张图' });

    expect(harness.runtime.run).not.toHaveBeenCalled();
    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toMatchObject({
      content: '已取消上传 2 张图片，本次未向 AI 发送图片。',
      pending: false,
    });
    expect(harness.busy).toEqual([true, false]);
  });

  it('passes prepared authorized attachments and the originating session snapshot into runtime.run', async () => {
    const authorizedImage = {
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,compressed-authorized' },
    };
    const history = [{ id: 'user-a', role: 'user', content: '分析图片' }];
    const harness = createHarness({}, {
      prepareAttachments: async () => ({
        attachments: { images: [authorizedImage] },
      }),
    });
    const controller = createChatRuntimeController({
      runtime: harness.runtime,
      getActivePageId: () => 'dashboard',
      getRunConfig: () => ({
        projectAccessEnabled: true,
        webSearchEnabled: true,
      }),
      getSessionContext: () => ({
        sessionId: 'session-a',
        history,
      }),
      prepareAttachments: harness.prepareAttachments,
      addAssistantMessage(message) {
        harness.messages.push(message);
        return {
          sessionId: 'session-a',
          messageId: 'assistant-a',
        };
      },
      updateAssistantMessage(_messageRef, message) {
        harness.messages[0] = message;
      },
      setBusy: (value) => harness.busy.push(value),
      focusInput: harness.focusInput,
    });

    await controller.submit({ prompt: '分析图片' });

    expect(harness.runtime.run).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-a',
      history,
      attachments: { images: [authorizedImage] },
    }));
  });

  it('ignores progress and results from an older superseded run', async () => {
    const pending: Array<{
      input: Parameters<AgentRuntime['run']>[0];
      resolve: (result: AgentRuntimeResult) => void;
    }> = [];
    const harness = createHarness({
      run: vi.fn().mockImplementation((input) => new Promise<AgentRuntimeResult>((resolve) => {
        pending.push({ input, resolve });
      })),
    });

    const first = harness.controller.submit({ prompt: '第一次' });
    const second = harness.controller.submit({ prompt: '第二次' });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0].input.onProgress?.({
      at: now,
      phase: 'executing',
      label: '过期进度',
      status: 'running',
    });
    pending[1].input.onProgress?.({
      at: now,
      phase: 'executing',
      label: '当前进度',
      status: 'running',
    });
    pending[0].resolve(runtimeResult('run-old', 'completed', { answer: '过期回答' }));
    pending[1].resolve(runtimeResult('run-current', 'completed', { answer: '当前回答' }));
    await Promise.all([first, second]);

    expect(harness.messages).toHaveLength(2);
    expect(harness.messages[0].content).not.toBe('过期回答');
    expect(harness.messages[1]).toMatchObject({
      content: '当前回答',
      pending: false,
      agentSteps: [expect.objectContaining({ label: '当前进度' })],
    });
    expect(harness.messages[1].agentSteps).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: '过期进度' })]),
    );
  });

  it('cancels the real runtime run id captured from progress', async () => {
    let resolveRun!: (result: AgentRuntimeResult) => void;
    let onProgress!: (event: AgentProgressEvent) => void;
    const harness = createHarness({
      run: vi.fn().mockImplementation((input) => {
        onProgress = input.onProgress;
        return new Promise<AgentRuntimeResult>((resolve) => {
          resolveRun = resolve;
        });
      }),
    });
    const running = harness.controller.submit({ prompt: '分析库存' });
    await vi.waitFor(() => expect(onProgress).toBeTypeOf('function'));
    onProgress({
      at: now,
      phase: 'routing',
      label: '正在判断请求类型。',
      status: 'started',
      runId: 'runtime-run-42',
    } as AgentProgressEvent & { runId: string });

    await harness.controller.cancel();
    resolveRun(runtimeResult('runtime-run-42', 'cancelled', { answer: '已取消' }));
    await running;

    expect(harness.runtime.cancel).toHaveBeenCalledOnce();
    expect(harness.runtime.cancel).toHaveBeenCalledWith('runtime-run-42');
  });

  it('cancels a persisted awaiting-confirmation run from its action', async () => {
    const confirmation = {
      version: 2 as const,
      id: 'confirmation-cancel',
      runId: 'run-confirm-cancel',
      stepId: 'delete-row',
      toolId: 'inventory.delete',
      inputHash: 'hash',
      riskLevel: 'delete' as const,
      expiresAt: '2026-07-31T08:10:00.000Z',
      idempotencyKey: 'idem-cancel',
      createdAt: now,
    };
    const waiting = runtimeResult('run-confirm-cancel', 'awaiting_confirmation', {
      run: runRecord('run-confirm-cancel', 'awaiting_confirmation', {
        pendingConfirmation: confirmation,
      }),
      answer: '此操作需要确认后才能执行。',
    });
    const cancelled = runRecord('run-confirm-cancel', 'cancelled', {
      terminalError: {
        code: 'AGENT_RUNTIME_CANCELLED',
        message: 'Agent 运行已取消。',
      },
    });
    const harness = createHarness({
      run: vi.fn().mockResolvedValue(waiting),
      cancel: vi.fn().mockResolvedValue(cancelled),
    });
    await harness.controller.submit({ prompt: '删除库存记录' });

    await harness.controller.cancel('run-confirm-cancel');

    expect(harness.runtime.cancel).toHaveBeenCalledWith('run-confirm-cancel');
    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toMatchObject({
      content: 'Agent 运行已取消。',
      pending: false,
      agentConfirmation: null,
    });
  });

  it.each(['confirm', 'cancel'] as const)(
    'hydrates and updates the original persisted confirmation message after reload on %s',
    async (action) => {
      const confirmation = {
        version: 2 as const,
        id: 'confirmation-reload',
        runId: 'run-confirm-reload',
        stepId: 'delete-row',
        toolId: 'inventory.delete',
        inputHash: 'hash',
        riskLevel: 'delete' as const,
        expiresAt: '2026-07-31T08:10:00.000Z',
        idempotencyKey: 'idem-reload',
        createdAt: now,
      };
      const persisted = runtimeResult('run-confirm-reload', 'awaiting_confirmation', {
        run: runRecord('run-confirm-reload', 'awaiting_confirmation', {
          pendingConfirmation: confirmation,
        }),
        answer: '此操作需要确认后才能执行。',
      });
      const terminalRun = runRecord(
        'run-confirm-reload',
        action === 'confirm' ? 'completed' : 'cancelled',
        action === 'cancel'
          ? {
              terminalError: {
                code: 'AGENT_RUNTIME_CANCELLED',
                message: 'Agent 运行已取消。',
              },
            }
          : {},
      );
      const messages = [{
        ...runtimeResult('unused', 'completed'),
      }] as unknown as ChatRuntimeMessage[];
      messages[0] = {
        role: 'assistant',
        id: 'assistant-confirm-reload',
        agentRunId: 'run-confirm-reload',
        content: persisted.answer,
        pending: false,
        agentConfirmation: {
          runId: 'run-confirm-reload',
          confirmationId: 'confirmation-reload',
          target: 'inventory.delete',
          parameters: [],
          impact: '将删除项目数据，此操作可能无法恢复',
          expiresAt: confirmation.expiresAt,
          actions: [
            { id: 'confirm', label: '确认执行' },
            { id: 'cancel', label: '取消' },
          ],
        },
      };
      const runtime: AgentRuntime = {
        run: vi.fn(),
        confirm: vi.fn().mockResolvedValue({
          run: terminalRun,
          state: terminalRun.state,
          answer: '删除完成。',
          images: [],
          actions: [],
        }),
        cancel: vi.fn().mockResolvedValue(terminalRun),
      };
      const controller = createChatRuntimeController({
        runtime,
        getActivePageId: () => 'dashboard',
        getRunConfig: () => ({
          projectAccessEnabled: true,
          webSearchEnabled: true,
        }),
        getSessionContext: () => ({ sessionId: 'session-b', history: [] }),
        findAssistantMessageByRunId: () => ({
          messageRef: {
            sessionId: 'session-a',
            messageId: 'assistant-confirm-reload',
          },
          message: messages[0],
        }),
        addAssistantMessage: vi.fn(),
        updateAssistantMessage(_messageRef, message) {
          messages[0] = message;
        },
        setBusy: vi.fn(),
        focusInput: vi.fn(),
      });

      if (action === 'confirm') {
        await controller.confirm({
          runId: 'run-confirm-reload',
          confirmationId: 'confirmation-reload',
        });
      } else {
        await controller.cancel('run-confirm-reload');
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        id: 'assistant-confirm-reload',
        agentRunId: 'run-confirm-reload',
        pending: false,
        agentConfirmation: null,
      });
      expect(messages[0].content).toBe(
        action === 'confirm' ? '删除完成。' : 'Agent 运行已取消。',
      );
    },
  );

  it('releases terminal message and run tracking while retaining an awaiting confirmation', async () => {
    const completedHarness = createHarness();
    for (let index = 0; index < 20; index += 1) {
      await completedHarness.controller.submit({ prompt: `问题 ${index}` });
    }
    expect(completedHarness.controller.getRetainedStateSize()).toEqual({
      messages: 0,
      runs: 0,
    });

    const confirmation = {
      version: 2 as const,
      id: 'confirmation-retained',
      runId: 'run-retained',
      stepId: 'write',
      toolId: 'formula.create',
      inputHash: 'hash',
      riskLevel: 'create' as const,
      expiresAt: '2026-07-31T08:10:00.000Z',
      idempotencyKey: 'idem-retained',
      createdAt: now,
    };
    const waitingHarness = createHarness({
      run: vi.fn().mockResolvedValue(runtimeResult(
        'run-retained',
        'awaiting_confirmation',
        {
          run: runRecord('run-retained', 'awaiting_confirmation', {
            pendingConfirmation: confirmation,
          }),
        },
      )),
    });
    await waitingHarness.controller.submit({ prompt: '创建配方' });

    expect(waitingHarness.controller.getRetainedStateSize()).toEqual({
      messages: 1,
      runs: 1,
    });
  });
});
