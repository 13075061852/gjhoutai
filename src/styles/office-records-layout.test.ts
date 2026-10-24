// @ts-expect-error Tests run in Node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css=readFileSync(new URL('./pages/office-records.css',import.meta.url),'utf8');
const styles=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const compact=(s:string)=>s.replace(/\s+/g,'').replace(/::(before|after)/g,':$1');
function rule(selector:string,properties:Record<string,string>){
 const candidates=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>compact(m[1]).includes(compact(selector)));
 expect(candidates.some(m=>Object.entries(properties).every(([k,v])=>compact(m[2]).includes(compact(`${k}:${v};`))))).toBe(true);
}
describe('office workspace geometry after legacy ERP removal',()=>{
 it('keeps scoped styles after shared workspace and removes the outer card',()=>{
  expect(styles.indexOf('./pages/office-records.css')).toBeGreaterThan(styles.indexOf('./layout/workspace.css'));
  rule('.biz-office-table-panel',{'box-shadow':'none','border':'0'});
 });
 it('keeps content-sized cards and responsive table grids',()=>{
  rule('.biz-office-record-list',{'grid-auto-rows':'max-content','align-items':'start'});
  expect(compact(css)).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(compact(css)).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
 });
 it('preserves wider ash editors and fixed columns',()=>{
  rule('.biz-office-page',{'--office-record-dialog-width':'760px'});
  rule('[data-ash-modal] .biz-office-dialog',{'width':'min(var(--office-record-dialog-width),calc(100vw - 32px))','min-width':'0'});
  rule('.biz-office-details-dialog',{'width':'min(var(--office-record-dialog-width),100%)'});
  rule('.biz-ash-index-column',{'width':'48px'});rule('.biz-ash-action-column',{'width':'44px'});
  expect(compact(css)).toContain('min-width:576px;');expect(compact(css)).toContain('min-width:620px;');
 });
 it('preserves editor typography and safe-area spacing',()=>{
  rule('.biz-office-editor',{'padding':'0 16px 16px','gap':'14px'});
  expect(compact(css)).toContain('font-size:14px;');expect(compact(css)).toContain('line-height:20px;');
  expect(css).toContain('env(safe-area-inset-bottom)');
 });
 it('keeps top-layer modal mounting, mobile sheets and close animation',()=>{
  const source=readFileSync(new URL('../legacy/features/office-records/index.ts',import.meta.url),'utf8');
  expect(source).toContain("querySelectorAll('[data-office-details-overlay], [data-office-modal], [data-ash-modal]')");
  expect(source).toContain('mountOfficeDetailsOverlay(overlay)');
  expect(css).toContain('[popover]::backdrop');
  rule('.biz-office-modal .biz-office-dialog',{'width':'100%','max-height':'94dvh','border-radius':'12px 12px 0 0'});
  expect(css).toContain('@keyframes office-record-sheet-in');
 });
 it('keeps empty states stretched while normal rows stay content-sized',()=>{
  expect(compact(css)).toContain('.biz-office-record-list:has(>.biz-office-empty-list)');
  rule('.biz-office-empty-list',{'flex':'1 1 0','min-height':'0'});
 });
 it('keeps segmented controls shadow-free and pagination borderless',()=>{
  rule('.biz-office-tabs:before',{'display':'none'});
  rule('.biz-office-pagination',{'border':'0'});
 });
});
