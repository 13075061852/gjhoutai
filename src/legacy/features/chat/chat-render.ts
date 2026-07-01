type StreamRenderPayload = {
  pendingIndex: number;
  content: string;
  options: Record<string, any>;
};

export const createStreamRenderScheduler = (
  render: (payload: StreamRenderPayload) => void,
) => {
  let frameId = 0;
  let pending: StreamRenderPayload | null = null;

  const cancel = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    pending = null;
  };

  const schedule = (payload: StreamRenderPayload) => {
    pending = payload;
    if (frameId) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      const next = pending;
      pending = null;
      if (next) render(next);
    });
  };

  return { schedule, cancel };
};
