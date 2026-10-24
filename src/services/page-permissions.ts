import { getLegacyApp } from '../legacy/core/app-context';

export const CURRENT_PAGE_IDS = ['property-analysis', 'spectrum-analysis', 'inspection-reports', 'ai-analysis', 'office-records', 'ai-config', 'theme-settings'] as const;
export type CurrentPageId = typeof CURRENT_PAGE_IDS[number];
const known = new Set(['系统管理员', '研发部', '测试部', '销售部', '生产部', '生产部主管']);
const legacyDepartments: Record<string, string> = { system_admin: '系统管理员', lab_engineer: '测试部', sales_manager: '销售部', warehouse_manager: '生产部主管' };
export function userDepartment(user: { department?: unknown; role?: unknown } | null | undefined): string {
  if (!user) return '';
  const explicit = typeof user.department === 'string' ? user.department.trim() : '';
  // A supplied unknown department must never fall back to administrator.
  return explicit ? known.has(explicit) ? explicit : '' : legacyDepartments[String(user.role || '')] || '';
}
export function canViewCurrentPage(user: { department?: unknown; role?: unknown } | null | undefined, page: string): boolean {
  const department = userDepartment(user);
  if (!department || !CURRENT_PAGE_IDS.includes(page as CurrentPageId)) return false;
  if (page === 'ai-config') return department === '系统管理员';
  // All authenticated departments can read current analysis pages; edits remain lab/admin only.
  return true;
}
export function canEditCurrentPage(user: { department?: unknown; role?: unknown } | null | undefined, page: string): boolean {
  if (!canViewCurrentPage(user, page)) return false;
  const department = userDepartment(user);
  if (page === 'theme-settings') return true;
  return department === '系统管理员' || department === '测试部' && ['property-analysis','spectrum-analysis','inspection-reports','office-records'].includes(page);
}
export function installCurrentPagePermissions(): void {
  const app = getLegacyApp();
  if (!app) return;
  app.permissions = {
    canCurrentUserViewPage: (page: string, user = app.currentUser) => canViewCurrentPage(user, page),
    canCurrentUserEditPage: (page: string, user = app.currentUser) => canEditCurrentPage(user, page),
    getCurrentUserPermissionKey: () => `department:${userDepartment(app.currentUser)}`,
  };
}
