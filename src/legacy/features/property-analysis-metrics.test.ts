import { describe, expect, it } from 'vitest';
import {
  IMPACT_STRENGTH_METRIC_KEY,
  normalizePropertyMetricRow,
  normalizePropertyReportRange,
} from './property-analysis-metrics';

describe('property analysis metric headers', () => {
  it('keeps the current impact-strength header as the canonical column', () => {
    const row = normalizePropertyMetricRow({
      型号: '310G6-N6',
      '冲击强度[KJ/M²]': [11.8, 11.6, 12],
    });

    expect(row).toEqual({
      型号: '310G6-N6',
      [IMPACT_STRENGTH_METRIC_KEY]: [11.8, 11.6, 12],
    });
  });

  it('maps the legacy Mpa header to the current impact-strength column', () => {
    const row = normalizePropertyMetricRow({
      型号: '320G6-N11',
      '冲击强度[Mpa]': [9.8, 9.1, 8.5],
    });

    expect(row).toEqual({
      型号: '320G6-N11',
      [IMPACT_STRENGTH_METRIC_KEY]: [9.8, 9.1, 8.5],
    });
    expect(row).not.toHaveProperty('冲击强度[Mpa]');
  });

  it('maps a saved legacy impact range to the current metric key', () => {
    const range = normalizePropertyReportRange({
      model: '320G6-N11',
      metricKey: '冲击强度[Mpa]',
      item: '缺口冲击强度（悬臂）',
      unit: 'kJ/m²',
      range: '≥10',
    });

    expect(range).toMatchObject({
      model: '320G6-N11',
      metricKey: IMPACT_STRENGTH_METRIC_KEY,
      range: '≥10',
    });
  });
});
