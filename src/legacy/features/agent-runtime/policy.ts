import type { AgentConfirmation } from './protocol';

type ConfirmationInput = Record<string, unknown>;

type CreateAgentConfirmationInput = Omit<AgentConfirmation, 'version' | 'inputHash' | 'createdAt' | 'consumedAt'> & {
  input: ConfirmationInput;
  createdAt?: string;
};

type ConfirmationValidationInput = Pick<AgentConfirmation, 'runId' | 'stepId' | 'toolId'> & {
  input: ConfirmationInput;
  now?: string;
};

type ConfirmationValidationResult =
  | { ok: true; reason?: undefined }
  | {
    ok: false;
    reason: 'confirmation_already_consumed' | 'confirmation_expired' | 'confirmation_context_mismatch';
  };

const stableJson = (value: unknown): string => {
  const serialized = JSON.stringify(value, (_key, nestedValue) => {
    if (nestedValue === null || typeof nestedValue !== 'object' || Array.isArray(nestedValue)) return nestedValue;

    return Object.fromEntries(
      Object.keys(nestedValue as Record<string, unknown>)
        .sort()
        .map((key) => [key, (nestedValue as Record<string, unknown>)[key]]),
    );
  });

  if (serialized === undefined) throw new TypeError('Agent confirmation input must be JSON serializable.');
  return serialized;
};

const createInputHash = (input: ConfirmationInput): string => stableJson(input);

export const requiresConfirmation = (riskLevel: AgentConfirmation['riskLevel']): boolean => riskLevel !== 'read';

export const createAgentConfirmation = ({ input, createdAt, ...confirmation }: CreateAgentConfirmationInput): AgentConfirmation => ({
  version: 2,
  ...confirmation,
  inputHash: createInputHash(input),
  createdAt: createdAt ?? new Date().toISOString(),
});

export const validateAgentConfirmation = (
  confirmation: AgentConfirmation,
  { input, now = new Date().toISOString(), ...context }: ConfirmationValidationInput,
): ConfirmationValidationResult => {
  if (confirmation.consumedAt !== undefined) return { ok: false, reason: 'confirmation_already_consumed' };
  if (Date.parse(confirmation.expiresAt) <= Date.parse(now)) return { ok: false, reason: 'confirmation_expired' };

  const matchesContext = confirmation.runId === context.runId
    && confirmation.stepId === context.stepId
    && confirmation.toolId === context.toolId
    && confirmation.inputHash === createInputHash(input);

  return matchesContext ? { ok: true } : { ok: false, reason: 'confirmation_context_mismatch' };
};

export const markConfirmationConsumed = (confirmation: AgentConfirmation, consumedAt = new Date().toISOString()): void => {
  confirmation.consumedAt = consumedAt;
};
