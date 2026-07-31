import type { AgentToolResultV2 } from './protocol';
import { selectGroundedAnswer, type GroundingAuditResult } from './grounding';

const REDACTED_KEY_PATTERN = /(?:api[-_]?key|token|secret|authorization|cookie|handler|schema|confirmation|raw[-_]?image|base64|data[-_]?url)/i;
const DATA_URL_PATTERN = /^data:/i;
const MAX_EVIDENCE_ITEMS = 24;
const MAX_ARRAY_ITEMS = 24;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 5;

export type AgentChatModelRequest = {
  purpose: 'chat' | 'grounded_response';
  question: string;
  evidence?: unknown[];
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  signal?: AbortSignal;
};

export type AgentChatModelAdapter = (request: AgentChatModelRequest) => Promise<unknown>;

export type GroundedResponse = {
  content: string;
  usedFallback: boolean;
  audit: GroundingAuditResult;
};

type ComposeGroundedResponseInput = {
  question?: string;
  proposedAnswer?: unknown;
  results?: AgentToolResultV2[];
  fallback?: unknown;
  signal?: AbortSignal;
};

type ComposeGroundedResponseWithModelInput = ComposeGroundedResponseInput & {
  question: string;
  model: AgentChatModelAdapter;
};

const sanitizeEvidenceValue = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') {
    if (DATA_URL_PATTERN.test(value)) return undefined;
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (
    value === null
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeEvidenceValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REDACTED_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeEvidenceValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined),
  );
};

const compactEvidence = (results: AgentToolResultV2[]): unknown[] => results.flatMap((result) => (
  result.status === 'success'
    ? result.evidence
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map((item) => sanitizeEvidenceValue(item))
      .filter((item) => item !== undefined)
    : []
)).slice(0, MAX_EVIDENCE_ITEMS);

const formatToolResults = (results: AgentToolResultV2[]): string => {
  const messages = [...new Set(results
    .map((result) => (
      result.status === 'success' && result.evidence.length === 0
        ? '工具没有返回可核验依据。'
        : String(result.message || '').trim()
    ))
    .filter(Boolean))];
  return messages.join('\n') || '没有取得可用于回答的数据。';
};

const extractModelContent = (response: unknown): string => {
  if (typeof response === 'string') return response.trim();
  if (!response || typeof response !== 'object' || Array.isArray(response)) return '';

  const candidate = response as {
    content?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (typeof candidate.content === 'string') return candidate.content.trim();
  const choiceContent = candidate.choices?.[0]?.message?.content;
  return typeof choiceContent === 'string' ? choiceContent.trim() : '';
};

const selectResponse = (
  input: ComposeGroundedResponseInput,
  proposedAnswer: unknown,
): GroundedResponse => {
  const results = Array.isArray(input.results) ? input.results : [];
  const fallback = String(input.fallback || '').trim() || formatToolResults(results);
  return selectGroundedAnswer({
    answer: proposedAnswer,
    evidence: results,
    fallback,
    requiresEvidence: true,
  });
};

const composeWithModel = async (
  input: ComposeGroundedResponseWithModelInput,
): Promise<GroundedResponse> => {
  const results = Array.isArray(input.results) ? input.results : [];
  const evidence = compactEvidence(results);
  let proposedAnswer = '';

  try {
    const response = await input.model({
      purpose: 'grounded_response',
      question: input.question,
      evidence,
      messages: [
        {
          role: 'system',
          content: [
            'Answer the original question using only the supplied compact evidence.',
            'Do not claim that a tool succeeded unless the evidence supports it.',
            'Do not invent counts or business facts.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            question: input.question,
            evidence,
          }),
        },
      ],
      signal: input.signal,
    });
    proposedAnswer = extractModelContent(response);
  } catch (error) {
    if (input.signal?.aborted) throw error;
    proposedAnswer = '';
  }

  return selectResponse(input, proposedAnswer);
};

export function composeGroundedResponse(
  input: ComposeGroundedResponseWithModelInput,
): Promise<GroundedResponse>;
export function composeGroundedResponse(
  input: ComposeGroundedResponseInput,
): GroundedResponse;
export function composeGroundedResponse(
  input: ComposeGroundedResponseInput | ComposeGroundedResponseWithModelInput,
): GroundedResponse | Promise<GroundedResponse> {
  if ('model' in input && typeof input.model === 'function') {
    return composeWithModel(input);
  }
  return selectResponse(input, input.proposedAnswer);
}
