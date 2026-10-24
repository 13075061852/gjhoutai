import { expect, it } from 'vitest';
import { getModelOptionPresentation as display } from './modelOptionPresentation';
it('formats the reference name, namespaced ID and compact reasoning context', () => {
  expect(display({ value: 'deepseek-flash', title: 'DeepSeek-V4.1-Flash', contextLength: '1000000' }, 'deepseek', true))
    .toEqual({ title: 'DeepSeek V4.1 Flash', id: 'deepseek/deepseek-flash', meta: 'reasoning · 1.0M' });
});
it('preserves exact routed IDs and does not invent reasoning support or context', () => {
  expect(display({ value: 'Qwen/Qwen3', title: 'Qwen3', contextLength: '' }, 'siliconflow'))
    .toEqual({ title: 'Qwen3', id: 'Qwen/Qwen3', meta: 'text' });
  expect(display({ value: 'local-model', title: 'Local', contextLength: 32768 }, 'lmstudio').meta).toBe('local · 32.8K');
});
