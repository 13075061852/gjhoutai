import { expect, it } from 'vitest';
import { CURRENT_PAGE_IDS, userDepartment, canEditCurrentPage, canViewCurrentPage } from './page-permissions';
it('only exposes the seven current pages and never elevates unknown/research departments',()=>{
 expect(CURRENT_PAGE_IDS).toHaveLength(7);
 expect(userDepartment({department:'研发部',role:'system_admin'})).toBe('研发部');
 expect(userDepartment({department:'unknown',role:'system_admin'})).toBe('');
 expect(canViewCurrentPage({department:'unknown',role:'system_admin'},'ai-config')).toBe(false);
 expect(canEditCurrentPage({department:'研发部',role:'system_admin'},'office-records')).toBe(false);
 expect(canViewCurrentPage({department:'系统管理员'},'permission-management')).toBe(false);
});
it('allows lab/admin business edits but makes other departments read-only',()=>{
 for(const page of ['office-records','property-analysis','spectrum-analysis','inspection-reports']){
  expect(canEditCurrentPage({department:'测试部'},page)).toBe(true);
  expect(canEditCurrentPage({department:'系统管理员'},page)).toBe(true);
  for(const department of ['销售部','生产部','研发部'])expect(canEditCurrentPage({department},page)).toBe(false);
 }
});
