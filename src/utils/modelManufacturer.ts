// Group by model manufacturer, never by model version or service tier.
export function getModelManufacturerLabel(value: string, source = ''): string {
  const id = String(value || '').trim().replace(/^pro\//i, '');
  if (source === 'deepseek') return 'DEEPSEEK';
  if (source === 'lmstudio') return 'LM STUDIO';
  if (!id) return '其他';
  const parts = id.split('/');
  const owner = parts.length > 1 ? parts[0] : id;
  const normalized = owner.toLowerCase().replace(/[-_ ]/g, '');
  if (normalized.startsWith('deepseek')) return 'DEEPSEEK';
  if (normalized.startsWith('qwen') || normalized === 'alibaba') return 'QWEN';
  if (normalized.startsWith('moonshot') || normalized.startsWith('kimi')) return 'MOONSHOT';
  if (normalized.startsWith('minimax')) return 'MINIMAX';
  if (normalized.startsWith('xiaomi')) return 'XIAOMI';
  if (normalized === 'openai' || /^(gpt[-_]|o[134](?:[-_]|$))/i.test(owner)) return 'OPENAI';
  if (normalized === 'anthropic' || normalized.startsWith('claude')) return 'ANTHROPIC';
  if (normalized === 'google' || normalized.startsWith('gemini')) return 'GOOGLE';
  if (normalized === 'meta' || normalized === 'metallama' || normalized.startsWith('llama')) return 'META';
  return parts.length > 1 ? owner.replace(/[-_]/g, ' ').toUpperCase() : '其他';
}
