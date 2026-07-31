import type { AgentProgressEvent, AgentRunRecord, AgentRunState } from './protocol';

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

const TERMINAL_STATES = new Set<AgentRunState>(['completed', 'failed', 'timed_out', 'cancelled']);

export class AgentStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentStateTransitionError';
  }
}

export const createAgentRun = ({
  id,
  prompt,
  startedAt,
}: Pick<AgentRunRecord, 'id' | 'prompt' | 'startedAt'>): AgentRunRecord => ({
  version: 2,
  id,
  prompt,
  state: 'routing',
  startedAt,
  updatedAt: startedAt,
  progress: [],
  confirmationHistory: {},
  stepResults: {},
});

export const isTerminalAgentState = (state: AgentRunState): boolean => TERMINAL_STATES.has(state);

export const transitionAgentRun = (
  run: AgentRunRecord,
  nextState: AgentRunState,
  reason: string,
): void => {
  void reason;

  if (!ALLOWED_TRANSITIONS[run.state].includes(nextState)) {
    throw new AgentStateTransitionError(`Cannot transition agent run from ${run.state} to ${nextState}.`);
  }

  const timestamp = new Date().toISOString();
  run.state = nextState;
  run.updatedAt = timestamp;

  if (isTerminalAgentState(nextState)) {
    run.endedAt = timestamp;
  }
};

export const appendProgress = (run: AgentRunRecord, event: AgentProgressEvent): void => {
  if (isTerminalAgentState(run.state)) {
    throw new AgentStateTransitionError(`Cannot append progress to terminal agent run state ${run.state}.`);
  }

  const { at, phase, label, status, toolId, stepId, durationMs } = event;
  run.progress.push({
    at,
    phase,
    label,
    status,
    ...(toolId === undefined ? {} : { toolId }),
    ...(stepId === undefined ? {} : { stepId }),
    ...(durationMs === undefined ? {} : { durationMs }),
  });
};
