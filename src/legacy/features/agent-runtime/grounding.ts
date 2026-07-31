export type GroundingAuditInput = {
  answer?: unknown;
  evidence?: unknown[];
  requiresEvidence?: boolean;
};

export type GroundingAuditResult = {
  ok: boolean;
  reasons: string[];
  unsupportedClaims: string[];
};

const QUANTIFIED_CLAIM_PATTERN = /-?\d+(?:\.\d+)?\s*(?:条|个|项|张|元|%|％|kg|KG|吨|天|次|人|页|行|家|份|种|台|小时|分钟)/g;

const stringifyEvidence = (evidence: unknown[]) => {
  try {
    return JSON.stringify(evidence);
  } catch {
    return String(evidence || '');
  }
};

const normalizeClaim = (value: unknown) => String(value || '').replace(/\s+/g, '');

export const normalizeAgentToolResult = (result: any, fallbackMessage = '技能已执行。') => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return {
      ok: false,
      message: '技能没有返回有效的结构化结果，已按执行失败处理。',
      details: [],
      candidates: [],
      data: {},
    };
  }
  return {
    ok: result.ok !== false,
    message: String(result.message || fallbackMessage),
    details: Array.isArray(result.details) ? result.details.map((item: unknown) => String(item)) : [],
    candidates: Array.isArray(result.candidates) ? result.candidates : [],
    data: result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {},
  };
};

const evidenceItemSucceeded = (item: any) => {
  if (!item || typeof item !== 'object') return false;
  if (item.ok === false || item.result?.ok === false) return false;
  return item.ok === true || item.result?.ok === true || Boolean(item.data || item.message || item.summary);
};

const evidenceItemFailed = (item: any) => (
  Boolean(item && typeof item === 'object')
  && (
    item.ok === false
    || item.result?.ok === false
    || (
      typeof item.status === 'string'
      && ['error', 'cancelled', 'timeout'].includes(item.status)
    )
  )
);

const isV2ToolResult = (item: unknown): item is {
  status: 'success' | 'error' | 'cancelled' | 'timeout';
  message?: unknown;
  evidence?: unknown[];
} => (
  typeof item === 'object'
  && item !== null
  && !Array.isArray(item)
  && ['success', 'error', 'cancelled', 'timeout'].includes(
    String((item as { status?: unknown }).status || ''),
  )
);

const expandEvidenceItems = (items: unknown[]): unknown[] => items.flatMap((item) => {
  if (!isV2ToolResult(item)) return [item];
  if (item.status !== 'success') {
    return [{
      ok: false,
      status: item.status,
      message: String(item.message || ''),
    }];
  }
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) return [];
  return item.evidence.map((evidence) => ({
    ok: true,
    evidence,
  }));
});

export const auditGroundedAnswer = ({
  answer = '',
  evidence = [],
  requiresEvidence = false,
}: GroundingAuditInput = {}): GroundingAuditResult => {
  const text = String(answer || '').trim();
  const items = expandEvidenceItems(Array.isArray(evidence) ? evidence.filter(Boolean) : []);
  const successfulEvidence = items.filter(evidenceItemSucceeded);
  const failedEvidence = items.filter(evidenceItemFailed);
  const evidenceText = normalizeClaim(stringifyEvidence(successfulEvidence));
  const reasons: string[] = [];

  if (!text) reasons.push('empty_answer');
  if (requiresEvidence && !successfulEvidence.length) reasons.push('missing_evidence');
  if (failedEvidence.length) {
    reasons.push('failed_operation_claimed_success');
  }

  const unsupportedClaims = [...new Set((text.match(QUANTIFIED_CLAIM_PATTERN) || [])
    .map(normalizeClaim)
    .filter((claim) => {
      if (!claim || evidenceText.includes(claim)) return false;
      const numericValue = claim.match(/-?\d+(?:\.\d+)?/)?.[0] || '';
      if (!numericValue) return true;
      const escaped = numericValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !(new RegExp(`(?:^|[^\\d.])${escaped}(?:[^\\d.]|$)`).test(evidenceText));
    }))];
  if (successfulEvidence.length && unsupportedClaims.length) reasons.push('unsupported_quantified_claim');

  return {
    ok: reasons.length === 0,
    reasons,
    unsupportedClaims,
  };
};

export const selectGroundedAnswer = ({
  answer = '',
  evidence = [],
  fallback = '',
  requiresEvidence = false,
} = {} as GroundingAuditInput & { fallback?: unknown }) => {
  const audit = auditGroundedAnswer({ answer, evidence, requiresEvidence });
  if (audit.ok) {
    return { content: String(answer || '').trim(), usedFallback: false, audit };
  }
  const fallbackText = String(fallback || '').trim() || '项目数据不足，暂时无法给出可靠结论。';
  return {
    content: fallbackText,
    usedFallback: true,
    audit,
  };
};
