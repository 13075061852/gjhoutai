import { describe, expect, it } from 'vitest';

import { findIconClasses } from './icon-class-pattern.mjs';

describe('findIconClasses', () => {
  it('does not treat a suffix inside multi-image as an icon class', () => {
    expect(findIconClasses("it('routes Kling multi-image requests')")).toEqual([]);
  });

  it('finds standalone icon classes', () => {
    expect(findIconClasses('<i class="ti ti-image"></i>')).toEqual(['ti-image']);
  });
});
