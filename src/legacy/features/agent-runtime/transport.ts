type AgentTransportErrorCode =
  | 'AGENT_TRANSPORT_FAILED'
  | 'AGENT_TRANSPORT_TIMEOUT'
  | 'AGENT_TRANSPORT_CANCELLED';

export class AgentTransportError extends Error {
  readonly code: AgentTransportErrorCode = 'AGENT_TRANSPORT_FAILED';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AgentTransportError';
  }
}

export class AgentTransportTimeoutError extends AgentTransportError {
  readonly code = 'AGENT_TRANSPORT_TIMEOUT';

  constructor(readonly timeoutMs: number, options?: { cause?: unknown }) {
    super(`Model request exceeded its ${timeoutMs}ms deadline.`, options);
    this.name = 'AgentTransportTimeoutError';
  }
}

export class AgentTransportCancelledError extends AgentTransportError {
  readonly code = 'AGENT_TRANSPORT_CANCELLED';

  constructor(options?: { cause?: unknown }) {
    super('Model request was cancelled.', options);
    this.name = 'AgentTransportCancelledError';
  }
}

const isTimeoutReason = (reason: unknown): boolean => {
  if (!reason || typeof reason !== 'object') return false;
  const candidate = reason as { code?: unknown; name?: unknown };
  return candidate.code === 'AGENT_PLANNER_TIMEOUT'
    || candidate.code === 'AGENT_TRANSPORT_TIMEOUT'
    || /Timeout/i.test(String(candidate.name || ''));
};

export const normalizeAgentTransportError = (
  error: unknown,
  {
    signal,
    timeoutMs,
  }: {
    signal?: AbortSignal;
    timeoutMs: number;
  },
): unknown => {
  if (error instanceof AgentTransportTimeoutError) return error;

  const reason = signal?.reason;
  if (reason instanceof AgentTransportTimeoutError) return reason;
  if (isTimeoutReason(reason)) {
    return new AgentTransportTimeoutError(timeoutMs, { cause: reason });
  }
  if (error instanceof AgentTransportCancelledError) return error;
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new AgentTransportCancelledError({ cause: reason ?? error });
  }
  return error;
};

export const parseChatCompletionStreamBlock = (block: string) => {
  const line = String(block || '').split(/\r?\n/).find((item) => item.startsWith('data:'));
  const raw = line ? line.replace(/^data:\s*/, '').trim() : '';
  if (!raw || raw === '[DONE]') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const formatTransportError = (error: unknown, label = '模型请求') => {
  if (error instanceof AgentTransportTimeoutError) return `${label}超时。`;
  if (error instanceof AgentTransportCancelledError) return `${label}已取消。`;
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  return `${label}失败：${message}`;
};
