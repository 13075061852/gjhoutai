// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountConfigSections } from './config-sections';

let form: HTMLFormElement;
beforeEach(() => {
  document.body.innerHTML = `<form>
    <article class="config-module config-module-ai"><input id="key" value="test-secret" /></article>
    <article id="apimartConfigModule" class="config-module config-module-apimart"></article>
    <article class="config-module config-module-assistant"></article>
    <div class="config-actions-panel"><button type="submit">保存</button><div id="configStatus"></div></div>
  </form>`;
  form = document.querySelector('form')!;
});

describe('configuration workspace sections', () => {
  it('shows one section with three accessible tabs and no retired search configuration and shared save controls', () => {
    mountConfigSections(form);
    expect(form.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(form.querySelector('#config-tab-search')).toBeNull();
    expect(form.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
    expect(form.dataset.configSection).toBe('models');
    expect(form.querySelector('[aria-selected="true"]')?.getAttribute('aria-controls')).toBe('config-panel-models');
    expect(form.querySelector('#configStatus')?.getAttribute('aria-live')).toBe('polite');
    expect(form.querySelectorAll('.config-actions-panel')).toHaveLength(1);
    expect(form.querySelector('#apimartConfigModule')).not.toBeNull();
    expect(form.querySelector('#config-tab-media')?.getAttribute('aria-controls')).toBe('apimartConfigModule');
  });

  it('keeps existing values and event handlers when switching, without submitting', () => {
    const input = form.querySelector<HTMLInputElement>('#key')!;
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    input.addEventListener('change', onChange);
    form.addEventListener('submit', onSubmit);
    mountConfigSections(form);
    form.querySelector<HTMLButtonElement>('#config-tab-media')!.click();
    expect(form.dataset.configSection).toBe('media');
    expect(form.querySelector('#config-panel-models')?.hasAttribute('hidden')).toBe(true);
    expect(form.querySelector('#apimartConfigModule')?.hasAttribute('hidden')).toBe(false);
    form.querySelector<HTMLButtonElement>('#config-tab-models')!.click();
    expect(form.querySelector('#key')).toBe(input);
    expect(input.value).toBe('test-secret');
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('supports arrow, Home and End keys with a single focusable tab', () => {
    mountConfigSections(form);
    const tabs = Array.from(form.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
    expect(form.dataset.configSection).toBe('media');
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(form.dataset.configSection).toBe('assistant');
    tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(form.dataset.configSection).toBe('models');
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it('does not duplicate modules or tabs when mounted twice', () => {
    mountConfigSections(form);
    mountConfigSections(form);
    expect(form.querySelectorAll('.config-section-nav')).toHaveLength(1);
    expect(form.querySelectorAll('.config-content-panel')).toHaveLength(1);
    expect(form.querySelectorAll('#key')).toHaveLength(1);
  });
});
