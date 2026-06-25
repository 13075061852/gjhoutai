export const DEFAULT_FETCH_TIMEOUT_MS = 15000;
export const UPLOAD_FETCH_TIMEOUT_MS = 30000;
export const AI_FETCH_TIMEOUT_MS = 90000;

const createTimeoutError = (timeoutMs: number) => {
  try {
    return new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError');
  } catch {
    const error = new Error(`Request timed out after ${timeoutMs}ms`);
    error.name = 'TimeoutError';
    return error;
  }
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== 'function') {
    return fetch(input, init);
  }

  const parentSignal = init.signal;
  if (parentSignal?.aborted) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  let settled = false;
  const abortFromParent = () => {
    if (settled || controller.signal.aborted) return;
    try {
      controller.abort(parentSignal?.reason);
    } catch {
      controller.abort();
    }
  };
  const timeout = globalThis.setTimeout(() => {
    if (settled || controller.signal.aborted) return;
    try {
      controller.abort(createTimeoutError(timeoutMs));
    } catch {
      controller.abort();
    }
  }, timeoutMs);

  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    settled = true;
    globalThis.clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};
