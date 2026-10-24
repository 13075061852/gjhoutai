const sections = [
  { key: 'models', label: '模型接入', selector: '.config-module-ai' },
  { key: 'media', label: '图像视频', selector: '.config-module-apimart' },
  { key: 'assistant', label: '助手设置', selector: '.config-module-assistant' },
];

/** Move existing form modules without recreating inputs or their event handlers. */
export function mountConfigSections(form: HTMLFormElement): void {
  if (form.querySelector('.config-section-nav')) return;
  const entries = sections.flatMap((section) => {
    const panel = form.querySelector<HTMLElement>(section.selector);
    return panel ? [{ ...section, panel }] : [];
  });
  if (!entries.length) return;
  const content = document.createElement('div');
  content.className = 'config-content-panel';
  const nav = document.createElement('div');
  nav.className = 'config-section-nav';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '配置分类');
  const buttons = entries.map((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `config-tab-${entry.key}`;
    button.className = 'config-section-tab';
    button.textContent = entry.label;
    button.setAttribute('role', 'tab');
    const panelId = entry.panel.id || `config-panel-${entry.key}`;
    button.setAttribute('aria-controls', panelId);
    entry.panel.id = panelId;
    entry.panel.setAttribute('role', 'tabpanel');
    entry.panel.setAttribute('aria-labelledby', button.id);
    content.append(entry.panel);
    nav.append(button);
    return button;
  });
  const activate = (index: number) => {
    entries.forEach((entry, position) => {
      const active = position === index;
      entry.panel.hidden = !active;
      buttons[position].setAttribute('aria-selected', String(active));
      buttons[position].tabIndex = active ? 0 : -1;
      if (!active) {
        entry.panel.querySelectorAll('.model-dropdown.is-open').forEach((dropdown) => {
          dropdown.classList.remove('is-open');
          dropdown.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
        });
      }
    });
    form.dataset.configSection = entries[index].key;
    content.scrollTop = 0;
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => activate(index));
    button.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      activate(next);
      buttons[next].focus();
    });
  });
  form.prepend(nav, content);
  form.querySelector('#configStatus')?.setAttribute('aria-live', 'polite');
  activate(0);
}
