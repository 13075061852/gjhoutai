import { describe, expect, it } from 'vitest';
import { auditGroundedAnswer, normalizeAgentToolResult, selectGroundedAnswer } from './grounding';

describe('agent answer grounding', () => {
  it('treats an empty or non-object tool response as failure instead of fake success', () => {
    expect(normalizeAgentToolResult(null).ok).toBe(false);
    expect(normalizeAgentToolResult('done').ok).toBe(false);
    expect(normalizeAgentToolResult({ ok: true, message: '完成' }).ok).toBe(true);
  });
  it('rejects project facts when no successful observation exists', () => {
    const audit = auditGroundedAnswer({
      answer: '当前共有 12 个订单。',
      evidence: [],
      requiresEvidence: true,
    });

    expect(audit.ok).toBe(false);
    expect(audit.reasons).toContain('missing_evidence');
  });

  it('rejects success claims after a failed project operation', () => {
    const audit = auditGroundedAnswer({
      answer: '已成功删除 3 条图谱。',
      evidence: [{ ok: false, message: '目标不唯一，未执行删除。' }],
      requiresEvidence: true,
    });

    expect(audit.ok).toBe(false);
    expect(audit.reasons).toContain('failed_operation_claimed_success');
  });

  it('rejects a success claim when successful evidence is mixed with a failed operation', () => {
    const audit = auditGroundedAnswer({
      answer: '项目操作已成功完成。',
      evidence: [
        {
          status: 'success',
          message: '库存读取完成。',
          data: {},
          evidence: [{ field: 'count', value: 3 }],
        },
        {
          status: 'error',
          message: '删除没有执行。',
          data: {},
          evidence: [],
        },
      ],
      requiresEvidence: true,
    });

    expect(audit.ok).toBe(false);
    expect(audit.reasons).toContain('failed_operation_claimed_success');
  });

  it('rejects quantified claims that are absent from evidence', () => {
    const audit = auditGroundedAnswer({
      answer: '当前共有 18 个订单，其中 6 个生产中。',
      evidence: [{ ok: true, message: '当前共有 18 个订单。', data: { count: 18 } }],
      requiresEvidence: true,
    });

    expect(audit.ok).toBe(false);
    expect(audit.unsupportedClaims).toContain('6个');
  });

  it('keeps an answer whose quantified claims are present in evidence', () => {
    const audit = auditGroundedAnswer({
      answer: '当前共有 18 个订单，其中 6 个生产中。',
      evidence: [{ ok: true, data: { total: 18, producing: 6 }, message: '18 个订单，6 个生产中。' }],
      requiresEvidence: true,
    });

    expect(audit.ok).toBe(true);
  });

  it('falls back to deterministic tool output when model text is ungrounded', () => {
    const selected = selectGroundedAnswer({
      answer: '已成功更新 9 条记录。',
      evidence: [{ ok: false, message: '没有执行更新。' }],
      fallback: '执行状态：未完成\n没有执行更新。',
      requiresEvidence: true,
    });

    expect(selected.usedFallback).toBe(true);
    expect(selected.content).toContain('执行状态：未完成');
    expect(selected.content).not.toContain('成功更新 9 条');
  });

  it('uses an exact deterministic fallback without appending model-facing prose', () => {
    const selected = selectGroundedAnswer({
      answer: '库存共有 99 条。',
      evidence: [],
      fallback: '没有取得库存数据。',
      requiresEvidence: true,
    });

    expect(selected.content).toBe('没有取得库存数据。');
  });

  it('requires the evidence field instead of trusting result data or messages', () => {
    const withoutEvidence = auditGroundedAnswer({
      answer: '当前共有 3 条库存。',
      evidence: [{
        status: 'success',
        message: '当前共有 3 条库存。',
        data: { count: 3 },
        evidence: [],
      }],
      requiresEvidence: true,
    });
    const withEvidence = auditGroundedAnswer({
      answer: '当前共有 3 条库存。',
      evidence: [{
        status: 'success',
        message: '当前共有 3 条库存。',
        data: { count: 3 },
        evidence: [{ field: 'count', value: 3 }],
      }],
      requiresEvidence: true,
    });

    expect(withoutEvidence.reasons).toContain('missing_evidence');
    expect(withEvidence.ok).toBe(true);
  });
});
