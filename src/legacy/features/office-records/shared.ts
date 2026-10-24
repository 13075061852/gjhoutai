const primary = /(?:^|\s)(?:[^\s]*primary-btn|is-primary)(?:\s|$)/;
const standard = /(?:^|\s)[^\s]*(?:ghost|icon|back)-btn(?:\s|$)/;
const danger = /(?:^|\s)(?:[^\s]*danger-btn|is-danger)(?:\s|$)/;

export const decorateOfficeMarkup = (html = '') => String(html).replace(
  /<button\b([^>]*?)class="([^"]+)"([^>]*)>/g,
  (match, before, className, after) => {
    if (/(?:^|\s)ui-button(?:\s|$)/.test(className)) return match;
    const variant = danger.test(className) ? 'ui-button ui-button--danger'
      : primary.test(className) ? 'ui-button ui-button--primary'
      : standard.test(className) ? 'ui-button' : '';
    return variant ? `<button${before}class="${variant} ${className}"${after}>` : match;
  },
);

export const createOfficeUi = ({ App, utils, render }) => {
  const esc = (value) => utils.escapeHtml(value);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const clearSearchTimer = () => { if (searchTimer !== undefined) window.clearTimeout(searchTimer); searchTimer = undefined; };
  return {
    esc,
    decorateOfficeMarkup,
    clearSearchTimer,
    renderSearchBox: (options) => App.searchBox?.render?.(options) || `
      <label class="${esc(options.className || '')}"><i class="ti ti-search" aria-hidden="true"></i>
      <input type="search" placeholder="${esc(options.placeholder || '搜索...')}" value="${esc(options.value || '')}" ${Object.entries(options.attributes || {}).map(([key, value]) => `${esc(key)}="${esc(value)}"`).join(' ')}></label>`,
    scheduleSearchRender: (pageId, afterRender) => {
      clearSearchTimer();
      searchTimer = window.setTimeout(() => {
        searchTimer = undefined;
        if (App.constants?.NAV_PAGE_KEY && localStorage.getItem(App.constants.NAV_PAGE_KEY) !== pageId) return;
        render(pageId);
        afterRender?.();
      }, 160);
    },
  };
};
