import { describe, expect, it, vi } from 'vitest';
import type { AgentToolResultV2 } from './protocol';
import { composeGroundedResponse } from './response-composer';

const resultOf = (
  overrides: Partial<AgentToolResultV2> = {},
): AgentToolResultV2 => ({
  status: 'success',
  message: '库存读取完成。',
  data: {},
  evidence: [{ field: 'count', value: 3 }],
  actions: [],
  ...overrides,
});

describe('grounded response composer', () => {
  it('uses the exact fallback when a business count has no tool evidence', () => {
    const response = composeGroundedResponse({
      proposedAnswer: '库存共有 99 条。',
      results: [],
      fallback: '没有取得库存数据。',
    });

    expect(response.content).toBe('没有取得库存数据。');
    expect(response.usedFallback).toBe(true);
  });

  it('does not describe a failed tool as successful', () => {
    const response = composeGroundedResponse({
      proposedAnswer: '已成功删除 3 条图谱。',
      results: [resultOf({
        status: 'error',
        message: '目标不唯一，没有执行删除。',
        evidence: [],
        diagnostics: { code: 'TARGET_AMBIGUOUS', detail: 'More than one target matched.' },
      })],
    });

    expect(response.usedFallback).toBe(true);
    expect(response.content).toBe('工具执行失败，未生成事实性结论。');
    expect(response.content).not.toContain('成功删除');
    expect(response.content).not.toContain('目标不唯一');
  });

  it('does not use an ungrounded successful tool message as a business fact fallback', () => {
    const response = composeGroundedResponse({
      proposedAnswer: '',
      results: [resultOf({
        message: '库存共有 99 条。',
        data: { count: 99 },
        evidence: [],
      })],
    });

    expect(response.usedFallback).toBe(true);
    expect(response.content).toBe('工具没有返回可核验依据。');
    expect(response.content).not.toContain('99 条');
  });

  it.each([
    ['empty model content', ''],
    ['unsupported model payload', { answer: '库存共有 99 条。' }],
  ])('formats tool results deterministically for %s', async (_label, modelOutput) => {
    const response = await composeGroundedResponse({
      question: '当前库存有多少？',
      results: [resultOf()],
      model: vi.fn().mockResolvedValue(modelOutput),
    });

    expect(response.usedFallback).toBe(true);
    expect(response.content).toBe('依据 1：{"field":"count","value":3}');
  });

  it('rejects a success claim when any tool in a mixed result set failed', () => {
    const response = composeGroundedResponse({
      proposedAnswer: '项目操作已成功完成。',
      results: [
        resultOf({ evidence: [{ field: 'count', value: 3 }] }),
        resultOf({
          status: 'error',
          message: '删除没有执行。',
          evidence: [],
          diagnostics: { code: 'DELETE_FAILED', detail: 'The delete operation failed.' },
        }),
      ],
    });

    expect(response.usedFallback).toBe(true);
    expect(response.content).toContain('"value":3');
    expect(response.content).toContain('工具执行失败');
    expect(response.content).not.toContain('成功完成');
  });

  it('sends only the original question and compact evidence to the model', async () => {
    const model = vi.fn().mockResolvedValue('当前库存共有 3 条。');
    const rawImage = `data:image/png;base64,${'a'.repeat(2_000)}`;
    const response = await composeGroundedResponse({
      question: '当前库存有多少？',
      results: [resultOf({
        data: {
          apiKey: 'data-secret',
          confirmationToken: 'confirmation-secret',
          rawImage,
        },
        evidence: [{
          field: 'count',
          value: 3,
          apiKey: 'evidence-secret',
          password: 'password-secret',
          credential: 'credential-secret',
          privateKey: 'private-key-secret',
          genericBearer: 'Bearer bearer-secret-value',
          genericJwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature-value',
          genericApiKey: 'sk-proj-common-secret-value-1234567890',
          rawImage,
        }],
      })],
      model,
    });

    expect(response.content).toBe('当前库存共有 3 条。');
    expect(model).toHaveBeenCalledOnce();
    const serializedRequest = JSON.stringify(model.mock.calls[0][0]);
    expect(serializedRequest).toContain('当前库存有多少？');
    expect(serializedRequest).toContain('"value":3');
    expect(serializedRequest).not.toContain('data-secret');
    expect(serializedRequest).not.toContain('confirmation-secret');
    expect(serializedRequest).not.toContain('evidence-secret');
    expect(serializedRequest).not.toContain('password-secret');
    expect(serializedRequest).not.toContain('credential-secret');
    expect(serializedRequest).not.toContain('private-key-secret');
    expect(serializedRequest).not.toContain('bearer-secret-value');
    expect(serializedRequest).not.toContain('signature-value');
    expect(serializedRequest).not.toContain('sk-proj-common-secret-value');
    expect(serializedRequest).not.toContain('data:image');
    expect(serializedRequest).not.toContain('handler');
  });

  it('does not convert an explicit abort into a deterministic success fallback', async () => {
    const controller = new AbortController();
    const composing = composeGroundedResponse({
      question: '当前库存有多少？',
      results: [resultOf()],
      signal: controller.signal,
      model: vi.fn(({ signal }: { signal?: AbortSignal }) => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      })),
    });

    controller.abort('user cancelled');

    await expect(composing).rejects.toMatchObject({ name: 'AbortError' });
  });
});
