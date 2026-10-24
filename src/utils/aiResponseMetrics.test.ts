import { describe, expect, it } from 'vitest';
import { formatAiResponseMetrics } from './aiResponseMetrics';
describe('AI response timing and output throughput', () => {
  it('uses whole-request elapsed time but only the final text interval for output speed', () => {
    expect(formatAiResponseMetrics({ startedAt: 1000, firstTextAt: 5000, finishedAt: 7000 }, 80)).toEqual(['耗时 6.0 秒', '40.0 tokens/s']);
  });
  it('never fabricates timing for old history or speed when output usage is missing', () => {
    expect(formatAiResponseMetrics({}, 500)).toEqual([]);
    expect(formatAiResponseMetrics({ startedAt: 1000, finishedAt: 3000 }, 500)).toEqual(['耗时 2.0 秒']);
    expect(formatAiResponseMetrics({ startedAt: 1000, firstTextAt: 2000, finishedAt: 3000 })).toEqual(['耗时 2.0 秒']);
  });
  it('rejects negative, invalid and zero-length intervals and invalid output counts', () => {
    for (const end of [0, -5, 1000, NaN, Infinity]) expect(formatAiResponseMetrics({ startedAt: 1000, finishedAt: end }, 80)).toEqual([]);
    for (const output of [0, -1, NaN, Infinity]) expect(formatAiResponseMetrics({ startedAt: 1000, firstTextAt: 2000, finishedAt: 3000 }, output)).toEqual(['耗时 2.0 秒']);
    expect(formatAiResponseMetrics({ startedAt: 1000, firstTextAt: 3000, finishedAt: 3000 }, 80)).toEqual(['耗时 2.0 秒']);
  });
});
