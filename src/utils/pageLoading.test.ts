// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterPagePaint, showPageLoading } from './pageLoading';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('content loading state', () => {
  it('announces the destination safely and restores busy/inert state on completion', () => {
    document.body.innerHTML = '<main aria-busy="false"><section class="page-section"></section><section class="page-section" inert></section></main>';
    const content = document.querySelector('main')!;
    const sections = [...content.querySelectorAll<HTMLElement>('.page-section')];
    content.scrollTop = 500;
    const loading = showPageLoading(content, '<img src=x onerror=alert(1)>', vi.fn());
    expect(content.querySelector('img')).toBeNull();
    expect(content.textContent).toContain('正在加载<img');
    expect(content.scrollTop).toBe(0);
    expect(sections.every((section) => section.inert)).toBe(true);
    expect(content.getAttribute('aria-busy')).toBe('true');
    loading.finish();
    loading.finish();
    expect(content.querySelector('.page-transition-state')).toBeNull();
    expect(content.getAttribute('aria-busy')).toBe('false');
    expect(sections[0].inert).toBe(false);
    expect(sections[1].inert).toBe(true);
  });

  it('turns failure into an accessible retry and never leaves a fake spinning state', () => {
    document.body.innerHTML = '<main></main>';
    const content = document.querySelector('main')!;
    const retry = vi.fn();
    const loading = showPageLoading(content, '图谱分析', retry);
    loading.fail();
    expect(content.querySelector('[role="alert"]')?.textContent).toContain('图谱分析暂时无法加载');
    expect(content.querySelector<HTMLElement>('.page-transition-spinner')?.hidden).toBe(true);
    const button = content.querySelector('button')!;
    expect(button.hidden).toBe(false);
    button.click();
    expect(retry).toHaveBeenCalledOnce();
    loading.finish();
    loading.fail();
    expect(content.hasAttribute('aria-busy')).toBe(false);
  });

  it('yields an actual paint boundary before synchronous initialisation begins', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    let painted = false;
    const waiting = afterPagePaint().then(() => { painted = true; });
    expect(frames).toHaveLength(1);
    frames[0](1);
    await Promise.resolve();
    expect(painted).toBe(false);
    expect(frames).toHaveLength(2);
    frames[1](2);
    await waiting;
    expect(painted).toBe(true);
  });

});
