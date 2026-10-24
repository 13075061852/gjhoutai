import { describe, expect, it } from 'vitest';
import { getModelManufacturerLabel as label } from './modelManufacturer';

describe('manufacturer-only model groups', () => {
  it('keeps DeepSeek versions, tiers and saved models in a single manufacturer group', () => {
    const ids = ['deepseek-v4-pro', 'deepseek-flash', 'deepseek-v4-flash', 'DeepSeek-V4.1-Flash', 'deepseek-chat'];
    expect(new Set(ids.map((id) => label(id, 'deepseek')))).toEqual(new Set(['DEEPSEEK']));
  });
  it('merges aliased namespaces and Pro service tiers without mistaking distilled model names for the owner', () => {
    for (const id of ['deepseek-ai/DeepSeek-V4-Pro', 'Pro/deepseek-ai/DeepSeek-V4-Flash', 'deepseek/DeepSeek-R1', 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B']) {
      expect(label(id, 'siliconflow')).toBe('DEEPSEEK');
    }
    expect(label('Qwen/Qwen3-32B')).toBe('QWEN');
    expect(label('Pro/Qwen/Qwen3-8B')).toBe('QWEN');
    expect(label('moonshotai/Kimi-K2.7-Code')).toBe('MOONSHOT');
  });
  it('separates manufacturers but never creates a group from an unknown model version', () => {
    expect(label('openai/gpt-4.1')).toBe('OPENAI');
    expect(label('anthropic/claude-sonnet')).toBe('ANTHROPIC');
    expect(label('BAAI/bge-m3')).toBe('BAAI');
    expect(label('custom-model-v2')).toBe('其他');
    expect(label('local-model.gguf', 'lmstudio')).toBe('LM STUDIO');
  });
});
