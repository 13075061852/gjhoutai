// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => { await import('./custom-select'); });
afterEach(() => { document.body.innerHTML = ''; });

const setup = (attributes = '') => {
  document.body.innerHTML = `<label for="department">部门</label><select id="department" ${attributes}>
    <option value="a">研发</option><option value="b" disabled>禁用项</option>
    <optgroup label="禁用组" disabled><option value="c">组内禁用</option></optgroup>
    <option value="d">销售</option></select><button id="next">下一个</button>`;
  window.GJHApp.customSelects.enhanceAll();
  return {
    select: document.querySelector('select')!,
    trigger: document.querySelector<HTMLButtonElement>('.custom-select-trigger')!,
    menu: document.querySelector<HTMLElement>('.custom-select-menu')!,
  };
};

describe('shared custom select', () => {
  it('respects disabled native selects and disabled options/optgroups', () => {
    const { trigger } = setup('disabled');
    expect(trigger.disabled).toBe(true);
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.custom-select-option:disabled')).toHaveLength(2);
  });

  it('skips disabled options with arrow keys and emits input/change', () => {
    const { trigger, select, menu } = setup();
    const events: string[] = [];
    select.addEventListener('input', () => events.push('input'));
    select.addEventListener('change', () => events.push('change'));
    trigger.click();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent?.trim()).toBe('销售');
    (document.activeElement as HTMLElement).click();
    expect(select.value).toBe('d');
    expect(events).toEqual(['input', 'change']);
    expect(document.activeElement).toBe(trigger);
    expect(menu.hidden).toBe(true);
  });

  it('connects labels and closes on Tab and Escape', () => {
    const { trigger, select, menu } = setup();
    expect(trigger.getAttribute('aria-label')).toBe('部门');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(select.tabIndex).toBe(-1);
    trigger.click();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(menu.hidden).toBe(true);
    trigger.click();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps multi-select native and makes enhancement idempotent', () => {
    setup('multiple');
    expect(document.querySelector('.custom-select')).toBeNull();
    const { select } = setup();
    window.GJHApp.customSelects.enhanceAll();
    select.value = 'd';
    window.GJHApp.customSelects.enhanceAll();
    expect(document.querySelectorAll('.custom-select')).toHaveLength(1);
    expect(document.querySelector('.custom-select-value')?.textContent).toBe('销售');
  });
});
