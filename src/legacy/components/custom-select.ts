// @ts-nocheck
import { ensureLegacyApp, ensurePublicApp, getPublicApp } from '../core/app-context';

(function () {
  const App = ensureLegacyApp();
  const PublicApp = ensurePublicApp();
  const enhancedSelects = new WeakMap();
  let openInstance = null;

  const escapeHtml = (value) => {
    if (getPublicApp()?.utils?.escapeHtml) return getPublicApp().utils.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  };

  const getSelectedOption = (select) => select.options[select.selectedIndex] || select.options[0];

  const closeInstance = (instance) => {
    if (!instance) return;
    PublicApp?.animations?.removeClass?.(instance.root, 'is-open') ?? instance.root.classList.remove('is-open');
    instance.trigger.setAttribute('aria-expanded', 'false');
    instance.menu.hidden = true;
    if (openInstance === instance) openInstance = null;
  };

  const positionMenu = (instance) => {
    const rect = instance.trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuHeight = Math.min(240, instance.menu.scrollHeight || 240);
    const opensUp = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow;

    instance.menu.style.position = 'fixed';
    instance.menu.style.minWidth = `${rect.width}px`;
    instance.menu.style.visibility = 'hidden';
    instance.menu.hidden = false;

    const menuWidth = instance.menu.offsetWidth;
    const spaceRight = window.innerWidth - rect.left;
    let left = rect.left;
    if (menuWidth > spaceRight) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }

    instance.menu.style.left = `${left}px`;
    instance.menu.style.visibility = '';

    if (opensUp) {
      instance.menu.style.top = 'auto';
      instance.menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      instance.menu.style.transformOrigin = 'bottom';
    } else {
      instance.menu.style.top = `${rect.bottom + 6}px`;
      instance.menu.style.bottom = 'auto';
      instance.menu.style.transformOrigin = 'top';
    }
  };

  const openSelect = (instance) => {
    if (openInstance && openInstance !== instance) closeInstance(openInstance);

    PublicApp?.animations?.addClass?.(instance.root, 'is-open') ?? instance.root.classList.add('is-open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    instance.menu.hidden = false;
    positionMenu(instance);
    openInstance = instance;

    const active = instance.menu.querySelector('.custom-select-option.is-active');
    (active || instance.menu.querySelector('.custom-select-option'))?.focus({ preventScroll: true });
  };

  const toggleSelect = (instance) => {
    if (instance.root.classList.contains('is-open')) {
      closeInstance(instance);
      return;
    }
    openSelect(instance);
  };

  const syncSelect = (instance) => {
    const selected = getSelectedOption(instance.select);
    instance.value.textContent = selected?.textContent || '';
    instance.menu.innerHTML = Array.from(instance.select.options).map((option, index) => {
      const active = option.selected ? ' is-active' : '';
      return `
        <button class="custom-select-option${active}" type="button" role="option" aria-selected="${option.selected ? 'true' : 'false'}" data-custom-select-index="${index}">
          <span>${escapeHtml(option.textContent || option.value)}</span>
        </button>
      `;
    }).join('');
  };

  const selectOption = (instance, index) => {
    const option = instance.select.options[index];
    if (!option) return;

    instance.select.selectedIndex = index;
    syncSelect(instance);
    instance.select.dispatchEvent(new Event('change', { bubbles: true }));
    closeInstance(instance);
    instance.trigger.focus({ preventScroll: true });
  };

  const moveFocus = (instance, direction) => {
    const options = [...instance.menu.querySelectorAll('.custom-select-option')];
    if (!options.length) return;

    const currentIndex = Math.max(0, options.indexOf(document.activeElement));
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    options[nextIndex].focus({ preventScroll: true });
  };

  const enhanceSelect = (select) => {
    if (enhancedSelects.has(select) || select.hidden || select.classList.contains('js-no-custom-select') || select.closest('.model-dropdown')) return;

    const root = document.createElement('span');
    root.className = 'custom-select';

    const label = select.getAttribute('aria-label') || select.name || '下拉选择';
    root.innerHTML = `
      <button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(label)}">
        <span class="custom-select-value"></span>
        <span class="custom-select-caret" aria-hidden="true"></span>
      </button>
      <div class="custom-select-menu" role="listbox" hidden></div>
    `;

    select.classList.add('is-custom-select-native');
    select.insertAdjacentElement('afterend', root);

    const instance = {
      select,
      root,
      trigger: root.querySelector('.custom-select-trigger'),
      value: root.querySelector('.custom-select-value'),
      menu: root.querySelector('.custom-select-menu'),
    };

    enhancedSelects.set(select, instance);
    syncSelect(instance);

    instance.trigger.addEventListener('click', () => toggleSelect(instance));
    instance.trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        openSelect(instance);
      }
    });

    instance.menu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-custom-select-index]');
      if (!option) return;
      selectOption(instance, Number.parseInt(option.getAttribute('data-custom-select-index') || '', 10));
    });

    instance.menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInstance(instance);
        instance.trigger.focus({ preventScroll: true });
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFocus(instance, 1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(instance, -1);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const option = event.target.closest('[data-custom-select-index]');
        if (!option) return;
        event.preventDefault();
        selectOption(instance, Number.parseInt(option.getAttribute('data-custom-select-index') || '', 10));
      }
    });

    select.addEventListener('change', () => syncSelect(instance));
  };

  const enhanceAll = (root = document) => {
    root.querySelectorAll?.('select').forEach(enhanceSelect);
  };

  document.addEventListener('click', (event) => {
    if (!openInstance || openInstance.root.contains(event.target)) return;
    closeInstance(openInstance);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeInstance(openInstance);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhanceAll(), { once: true });
  } else {
    enhanceAll();
  }
  PublicApp.customSelects = { enhanceAll };
  App.customSelects = PublicApp.customSelects;
}());
