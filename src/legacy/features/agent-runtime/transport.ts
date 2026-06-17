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
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  return `${label}失败：${message}`;
};
