import { expect, it } from 'vitest';
import { findOfficialModelPrice, type OfficialModelPricing } from './model-pricing';
const snapshot: OfficialModelPricing = { source: 'official', fetchedAt: '2026-10-16', models: [
  { id: 'deepseek-flash', aliases: ['DeepSeek-V4.1-Flash'], contextLength: 1000000, pricing: { inputCnyPerMillion: 1, outputCnyPerMillion: 4 } },
] };
it('matches published API IDs and documented version aliases case-insensitively', () => {
  expect(findOfficialModelPrice(snapshot, 'deepseek-flash')?.pricing.inputCnyPerMillion).toBe(1);
  expect(findOfficialModelPrice(snapshot, 'deepseek-v4.1-flash')?.pricing.outputCnyPerMillion).toBe(4);
});
it('never assigns old version prices to unknown or unpublished new models', () => {
  expect(findOfficialModelPrice(snapshot, 'deepseek-v4-flash')).toBeUndefined();
  expect(findOfficialModelPrice(snapshot, 'deepseek-v5-flash')).toBeUndefined();
});
