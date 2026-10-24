type ModelOption = { value: string; title: string; category?: string; contextLength?: string | number };
export function getModelOptionPresentation(option: ModelOption, provider: string, knownReasoning = false) {
  const title = /^deepseek[-_]/i.test(option.title)
    ? option.title.replace(/[-_]/g, ' ') : option.title;
  const id = provider === 'deepseek' && !option.value.includes('/') ? `deepseek/${option.value}` : option.value;
  const category = String(option.category || '').toLowerCase();
  const type = provider === 'lmstudio' ? 'local' : knownReasoning || /推理|reason|think/.test(category)
    ? 'reasoning' : /图像理解|vision/.test(category) ? 'vision' : /代码|code/.test(category) ? 'code' : 'text';
  const length = Number(option.contextLength);
  const context = !Number.isFinite(length) || length <= 0 ? '' : length >= 1e6 ? `${(length / 1e6).toFixed(1)}M`
    : length >= 1e3 ? `${Number((length / 1e3).toFixed(1))}K` : String(length);
  return { title, id, meta: [type, context].filter(Boolean).join(' · ') };
}
