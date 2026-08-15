export const IMPACT_STRENGTH_METRIC_KEY = '冲击强度[KJ/M²]';

export const IMPACT_STRENGTH_HEADER_ALIASES = [
  IMPACT_STRENGTH_METRIC_KEY,
  '冲击强度[kJ/m²]',
  '冲击强度[KJ/M2]',
  '冲击强度[kJ/m2]',
  '冲击强度[Mpa]',
  '冲击强度[MPa]',
] as const;

const normalizeHeaderIdentity = (value: string) => value
  .replace(/\s+/g, '')
  .replace(/[（]/g, '(')
  .replace(/[）]/g, ')')
  .toLowerCase();

const IMPACT_STRENGTH_HEADER_IDENTITIES = new Set(
  IMPACT_STRENGTH_HEADER_ALIASES.map(normalizeHeaderIdentity)
);

const isImpactStrengthHeader = (value: string) => (
  IMPACT_STRENGTH_HEADER_IDENTITIES.has(normalizeHeaderIdentity(value))
);

export const normalizePropertyMetricRow = (
  row: Record<string, unknown>
): Record<string, unknown> => {
  const legacyImpactEntry = Object.entries(row).find(([key]) => (
    key !== IMPACT_STRENGTH_METRIC_KEY && isImpactStrengthHeader(key)
  ));
  if (!legacyImpactEntry) return row;

  const normalized = { ...row };
  Object.keys(normalized).forEach((key) => {
    if (key !== IMPACT_STRENGTH_METRIC_KEY && isImpactStrengthHeader(key)) {
      delete normalized[key];
    }
  });
  if (!(IMPACT_STRENGTH_METRIC_KEY in normalized)) {
    normalized[IMPACT_STRENGTH_METRIC_KEY] = legacyImpactEntry[1];
  }
  return normalized;
};

export const normalizePropertyReportRange = <T extends Record<string, unknown>>(range: T): T => {
  const metricKey = typeof range.metricKey === 'string' ? range.metricKey.trim() : '';
  if (!metricKey || !isImpactStrengthHeader(metricKey) || metricKey === IMPACT_STRENGTH_METRIC_KEY) {
    return range;
  }
  return {
    ...range,
    metricKey: IMPACT_STRENGTH_METRIC_KEY,
  };
};
