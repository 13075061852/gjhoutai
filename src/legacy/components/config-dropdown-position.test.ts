// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { getConfigDropdownPlacement, positionConfigDropdown, watchConfigDropdowns } from './config-dropdown-position';

describe('configuration model dropdown placement', () => {
  it('opens upward near the bottom without overlapping save controls', () => {
    expect(getConfigDropdownPlacement(120, 700, 560, 600)).toEqual({ placement: 'up', maxHeight: 360 });
  });
  it('opens downward when there is enough space', () => {
    expect(getConfigDropdownPlacement(120, 700, 160, 200)).toEqual({ placement: 'down', maxHeight: 360 });
  });
  it('limits height to the larger available side of a short container', () => {
    expect(getConfigDropdownPlacement(120, 400, 280, 320)).toEqual({ placement: 'up', maxHeight: 154 });
    expect(getConfigDropdownPlacement(120, 400, 150, 190)).toEqual({ placement: 'down', maxHeight: 204 });
  });
  it('does not produce negative heights outside the visible viewport', () => {
    expect(getConfigDropdownPlacement(200, 240, 180, 260).maxHeight).toBe(0);
  });
  it('uses the form scroll boundary, updates on scroll and stops on cleanup', () => {
    document.body.innerHTML = '<form><div class="config-content-panel"><div class="model-dropdown is-open"><button class="model-dropdown-trigger"></button></div></div></form>';
    const form = document.querySelector('form')!;
    const content = form.querySelector<HTMLElement>('.config-content-panel')!;
    const dropdown = form.querySelector<HTMLElement>('.model-dropdown')!;
    const trigger = form.querySelector<HTMLElement>('button')!;
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ top: 120, bottom: 640 } as DOMRect);
    const rect = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 530, bottom: 570 } as DOMRect);
    positionConfigDropdown(dropdown);
    expect(dropdown.dataset.placement).toBe('up');
    expect(dropdown.style.getPropertyValue('--model-panel-height')).toBe('360px');
    const stop = watchConfigDropdowns(form);
    rect.mockReturnValue({ top: 150, bottom: 190 } as DOMRect);
    content.dispatchEvent(new Event('scroll'));
    expect(dropdown.dataset.placement).toBe('down');
    stop();
    rect.mockReturnValue({ top: 530, bottom: 570 } as DOMRect);
    content.dispatchEvent(new Event('scroll'));
    expect(dropdown.dataset.placement).toBe('down');
  });
});
