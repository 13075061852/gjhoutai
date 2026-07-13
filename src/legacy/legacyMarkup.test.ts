import { describe, expect, it } from 'vitest';
import { legacyMarkup } from './legacyMarkup';

describe('legacy sidebar markup', () => {
  it('exposes the inspection report storage page before lazy features load', () => {
    expect(legacyMarkup).toContain(
      '<button class="nav-subitem" type="button" data-page="inspection-reports">检测报告</button>',
    );
  });
});
