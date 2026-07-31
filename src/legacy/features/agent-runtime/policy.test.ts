import { describe, expect, it } from 'vitest';
import {
  createAgentConfirmation,
  markConfirmationConsumed,
  requiresConfirmation,
  validateAgentConfirmation,
} from './policy';

describe('agent permission policy', () => {
  it('allows reads and blocks persistent writes', () => {
    expect(requiresConfirmation('read')).toBe(false);
    expect(requiresConfirmation('create')).toBe(true);
    expect(requiresConfirmation('update')).toBe(true);
    expect(requiresConfirmation('delete')).toBe(true);
  });

  it('invalidates confirmation when tool inputs change', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-1',
      runId: 'run-1',
      stepId: 'step-1',
      toolId: 'formula.createRecipe',
      input: { name: 'PBT-A' },
      riskLevel: 'create',
      expiresAt: '2026-07-31T01:00:00.000Z',
      idempotencyKey: 'idem-1',
    });

    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-1',
      stepId: 'step-1',
      toolId: 'formula.createRecipe',
      input: { name: 'PBT-B' },
      idempotencyKey: 'idem-1',
      now: '2026-07-31T00:30:00.000Z',
    }).ok).toBe(false);
  });

  it('invalidates confirmation when its idempotency key changes', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-idempotency',
      runId: 'run-idempotency',
      stepId: 'step-idempotency',
      toolId: 'formula.createRecipe',
      input: { name: 'PBT-A' },
      riskLevel: 'create',
      expiresAt: '2026-07-31T01:00:00.000Z',
      idempotencyKey: 'idem-original',
    });

    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-idempotency',
      stepId: 'step-idempotency',
      toolId: 'formula.createRecipe',
      input: { name: 'PBT-A' },
      idempotencyKey: 'idem-replayed',
      now: '2026-07-31T00:30:00.000Z',
    }).reason).toBe('confirmation_context_mismatch');
  });

  it('uses stable input hashing regardless of object property order', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-stable',
      runId: 'run-stable',
      stepId: 'step-stable',
      toolId: 'formula.createRecipe',
      input: { formula: { resin: 'PBT', additive: 'GF30' } },
      riskLevel: 'create',
      expiresAt: '2026-07-31T01:00:00.000Z',
      idempotencyKey: 'idem-stable',
    });

    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-stable',
      stepId: 'step-stable',
      toolId: 'formula.createRecipe',
      input: { formula: { additive: 'GF30', resin: 'PBT' } },
      idempotencyKey: 'idem-stable',
      now: '2026-07-31T00:30:00.000Z',
    })).toEqual({ ok: true });
  });

  it('rejects expired confirmation before a write can run', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-expired',
      runId: 'run-expired',
      stepId: 'step-expired',
      toolId: 'formula.updateRecipe',
      input: { id: 'PBT-A' },
      riskLevel: 'update',
      expiresAt: '2026-07-31T00:00:00.000Z',
      idempotencyKey: 'idem-expired',
    });

    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-expired',
      stepId: 'step-expired',
      toolId: 'formula.updateRecipe',
      input: { id: 'PBT-A' },
      idempotencyKey: 'idem-expired',
      now: '2026-07-31T00:00:00.000Z',
    }).reason).toBe('confirmation_expired');
  });

  it('prevents a consumed confirmation from executing twice', () => {
    const confirmation = createAgentConfirmation({
      id: 'confirm-2',
      runId: 'run-2',
      stepId: 'step-2',
      toolId: 'spectrum.deleteImages',
      input: { ids: ['img-1'] },
      riskLevel: 'delete',
      expiresAt: '2026-07-31T01:00:00.000Z',
      idempotencyKey: 'idem-2',
    });

    markConfirmationConsumed(confirmation, '2026-07-31T00:20:00.000Z');

    expect(validateAgentConfirmation(confirmation, {
      runId: 'run-2',
      stepId: 'step-2',
      toolId: 'spectrum.deleteImages',
      input: { ids: ['img-1'] },
      idempotencyKey: 'idem-2',
      now: '2026-07-31T00:30:00.000Z',
    }).reason).toBe('confirmation_already_consumed');
  });
});
