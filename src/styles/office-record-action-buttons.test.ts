import { describe, expect, it } from 'vitest';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';

const businessStyles = readFileSync(new URL('./pages/business-pages.css', import.meta.url), 'utf8');

describe('office record action buttons', () => {
  it('keeps edit and delete buttons in the same fixed square hit area', () => {
    expect(businessStyles).toMatch(/\.biz-office-record-actions button\s*\{[^}]*flex:0 0 30px;[^}]*width:30px;[^}]*min-width:30px;[^}]*height:30px;[^}]*min-height:30px;[^}]*padding:0;[^}]*box-sizing:border-box;/s);
  });
});
