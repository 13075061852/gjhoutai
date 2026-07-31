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

  it('sets end timestamps and rejects progress after reaching a terminal state', () => {
    const run = createAgentRun({ id: 'run-4', prompt: '停止', startedAt: '2026-07-31T00:00:00.000Z' });
    transitionAgentRun(run, 'failed', 'tool failed');

    expect(run.updatedAt).toBe(run.endedAt);
    expect(() => appendProgress(run, {
      at: '2026-07-31T00:00:01.000Z',
      phase: 'failed',
      label: '不应记录',
      status: 'failed',
    })).toThrow(AgentStateTransitionError);
  });

  it('records user-visible progress without hidden reasoning', () => {
    const run = createAgentRun({ id: 'run-3', prompt: '查订单', startedAt: '2026-07-31T00:00:00.000Z' });
    appendProgress(run, {
      at: '2026-07-31T00:00:01.000Z',
      phase: 'executing',
      label: '正在查询订单',
      status: 'running',
    });

    expect(run.progress[0]).not.toHaveProperty('thought');
  });
});
