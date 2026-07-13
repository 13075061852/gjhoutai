import '../../../styles/pages/business/dashboard.css';
import { LOCAL_STORAGE_KEYS } from '../../../services/local-storage-keys';
import { getLegacyApp } from '../../core/app-context';
import { renderDashboard } from './dashboard';
import { createDashboardState } from './dashboard-state';

(function registerDashboardPage() {
  const App = getLegacyApp();
  if (!App) return;
  if (App.businessPages && !App.businessPages.dashboardOnly) return;

  const { refs, utils } = App;
  const api = {
    dashboardOnly: true,
    render(pageId: string) {
      if (pageId !== 'dashboard' || !refs.businessPageContent) return;
      refs.businessPageContent.classList.remove('biz-inventory-shell', 'biz-invoice-shell', 'biz-permission-shell');
      const state = createDashboardState((key) => utils.readJson(key, null), LOCAL_STORAGE_KEYS);
      refs.businessPageContent.innerHTML = renderDashboard(state);
    },
    cleanup() {},
  };

  refs.businessPageContent?.addEventListener('click', (event) => {
    if (App.businessPages !== api || !(event.target instanceof Element)) return;
    const quickButton = event.target.closest('[data-quick]');
    if (!quickButton) return;
    const targets: Record<string, string> = {
      order: 'order-management',
      produce: 'production-plan',
      quality: 'property-analysis',
      report: 'property-analysis',
    };
    const targetPage = targets[quickButton.getAttribute('data-quick') || ''];
    if (targetPage) App.navigation?.showPage?.(targetPage);
  });

  App.businessPages = api;
})();
