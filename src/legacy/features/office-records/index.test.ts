// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
let app:any;
beforeEach(async()=>{
 vi.resetModules();localStorage.clear();
 document.body.innerHTML='<section class="business-page active"><div id="businessPageContent"></div></section>';
 const root=document.getElementById('businessPageContent')!;
 app={currentUser:{id:'lab',department:'测试部'},refs:{businessPageContent:root,placeholderPageSection:root.parentElement},constants:{NAV_PAGE_KEY:'active-page'},utils:{escapeHtml:(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),readJson:(key:string,fallback:any)=>key==='gjh-office-records-v1'?[{id:'sample1',type:'sampling',project:'保留的送样项目',date:'2026-10-21',tableColumns:['编号','型号'],tableRows:[['1','320G6']]}]:key==='gjh-ash-records-v1'?[{id:'ash1',name:'灰份材料',date:'2026-10-21',rows:[{content:'25%'}]}]:fallback,writeJson:vi.fn()},permissions:{canCurrentUserEditPage:()=>true}};
 window.GJHApp=app;await import('./index');app.officeRecords.init();app.officeRecords.render('office-records');
});
afterEach(()=>{app.officeRecords.cleanup();vi.restoreAllMocks();});
it('renders sampling and ash records without initializing any retired module',async()=>{
 expect(document.body.textContent).toContain('保留的送样项目');
 (document.querySelector('[data-office-type="ash"]') as HTMLButtonElement).click();
 await new Promise(resolve=>setTimeout(resolve,240));
 expect(document.body.textContent).toContain('灰份材料');
 expect(app.businessPages).toBeUndefined();expect(document.querySelector('[data-order-new]')).toBeNull();
});
it('preserves the record editor and rebinds events without duplicate listeners',()=>{
 app.officeRecords.cleanup();app.officeRecords.init();
 (document.querySelector('[data-office-new]') as HTMLButtonElement).click();
 expect(document.querySelector('[data-office-modal]')).not.toBeNull();
 (document.querySelector('[data-office-cancel]') as HTMLButtonElement).click();
 expect(document.body.textContent).toContain('保留的送样项目');
});
it('does not allow read-only accounts to open mutation controls',()=>{
 app.permissions.canCurrentUserEditPage=()=>false;app.officeRecords.render('office-records');
 const button=document.querySelector('[data-office-new]') as HTMLButtonElement;
 expect(button.disabled).toBe(true);button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 expect(document.querySelector('[data-office-modal]')).toBeNull();expect(app.utils.writeJson).not.toHaveBeenCalled();
});
