import { describe, expect, it } from 'vitest';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';

const businessStyles = readFileSync(new URL('./pages/business-pages.css', import.meta.url), 'utf8');

describe('paginated table borders', () => {
  it.each(['order', 'production', 'supplier'])('leaves the %s table separator to the pagination bar', (name) => {
    expect(businessStyles).toMatch(new RegExp(`\\.biz-${name}-table tr:last-child td\\s*\\{[^}]*border-bottom:0;`, 's'));
  });
});
