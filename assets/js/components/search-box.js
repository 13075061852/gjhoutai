(function () {
  const App = window.GJHApp || (window.GJHApp = {});
  const PublicApp = window.App = window.App || {};

  const escapeHtml = (value) => {
    if (window.App?.utils?.escapeHtml) return window.App.utils.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  };

  const renderAttributes = (attributes = {}) => Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([name, value]) => (value === true || value === '' ? escapeHtml(name) : `${escapeHtml(name)}="${escapeHtml(value)}"`))
    .join(' ');

  const render = ({
    className = '',
    inputClassName = '',
    value = '',
    placeholder = '搜索...',
    label = placeholder,
    icon = 'ti ti-search',
    type = 'search',
    attributes = {},
  } = {}) => {
    const inputAttributes = renderAttributes({
      autocomplete: 'off',
      spellcheck: 'false',
      ...attributes,
    });
    return `
      <label class="ui-search-box${className ? ` ${escapeHtml(className)}` : ''}">
        <i class="${escapeHtml(icon)}" aria-hidden="true"></i>
        <input
          class="ui-search-box-input${inputClassName ? ` ${escapeHtml(inputClassName)}` : ''}"
          type="${escapeHtml(type)}"
          placeholder="${escapeHtml(placeholder)}"
          aria-label="${escapeHtml(label)}"
          value="${escapeHtml(value)}"
          ${inputAttributes}>
      </label>
    `;
  };

  PublicApp.searchBox = { render };
  App.searchBox = PublicApp.searchBox;
}());
