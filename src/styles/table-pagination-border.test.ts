import { expect, it } from 'vitest';
// @ts-expect-error Test-only Node API.
import { readFileSync } from 'node:fs';
it('keeps only current office pagination styles, not retired ERP tables',()=>{
 const base=readFileSync(new URL('./pages/office-records-base.css',import.meta.url),'utf8');
 const layout=readFileSync(new URL('./pages/office-records.css',import.meta.url),'utf8');
 expect(layout).toMatch(/\.biz-office-pagination\s*\{[^}]*border:\s*0;/);
 for(const old of ['.biz-order-table','.biz-production-table','.biz-supplier-table','.biz-personnel-archive'])expect(base).not.toContain(old);
});
