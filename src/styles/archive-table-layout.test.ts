import { describe, expect, it } from 'vitest';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';

const businessStyles = readFileSync(new URL('./pages/business-pages.css', import.meta.url), 'utf8');

describe('archive table layout', () => {
  it('keeps partially filled archive pages at a normal row height', () => {
    expect(businessStyles).toMatch(/\.biz-supplier-table\s*\{[^}]*height:auto;/s);
  });

  it('fills the table area only when an archive has no rows', () => {
    expect(businessStyles).toMatch(/\.biz-archive-table\.is-empty\s*\{[^}]*height:100%;/s);
    expect(businessStyles).toMatch(/\.biz-supplier-table\.is-empty\s*\{[^}]*height:100%;/s);
  });

  it('lets the seven-column personnel table fit the available panel width', () => {
    expect(businessStyles).toMatch(/\.biz-personnel-archive-table-panel\s+\.biz-supplier-table\s*\{[^}]*min-width:0;/s);
  });

  it('keeps every personnel archive toolbar control at the same height', () => {
    expect(businessStyles).toMatch(/\.biz-personnel-archive-table-panel\s+\.biz-archive-table-actions\s+\.custom-select-trigger\s*\{[^}]*height:36px;[^}]*min-height:36px;/s);
    expect(businessStyles).toMatch(/\.biz-personnel-archive-table-panel\s+\.biz-formula-new-btn\s*\{[^}]*height:36px;[^}]*min-height:36px;/s);
  });
});
