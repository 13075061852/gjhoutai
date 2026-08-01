const SENSITIVE_KEY = /(?:api[_-]?key|authorization|bearer|token|password|credential|private[_-]?key|secret)/i;
const IMAGE_DATA_URL = /^data:image\//i;

const sanitizeContextValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'string') return IMAGE_DATA_URL.test(value) ? '[image omitted]' : value;
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular omitted]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeContextValue(item, seen));
  const output: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (SENSITIVE_KEY.test(key)) return;
    output[key] = sanitizeContextValue(item, seen);
  });
  return output;
};

export const buildAgentContextSnapshot = (App: any, {
  question = '',
  activePageId = '',
  forceCurrentPage = false,
} = {} as any) => {
  const manifest = sanitizeContextValue(App?.agentButler?.getProjectManifest?.() || App?.projectSkills?.getProjectManifest?.() || null);
  const context = sanitizeContextValue(App?.agentButler?.buildContext?.({ question, activePageId, forceCurrentPage }) || '');
  const images = sanitizeContextValue(App?.agentButler?.getImages?.({ question, activePageId, forceCurrentPage }) || []);
  return {
    manifest,
    context,
    images,
    activePageId,
    hasContext: Boolean(String(context || '').trim()),
    imageCount: Array.isArray(images) ? images.length : 0,
  };
};
