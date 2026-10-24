/** Let the pending navigation actually paint before module evaluation / synchronous rendering. */
export function afterPagePaint(): Promise<void> {
  if (document.hidden) return new Promise((resolve) => window.setTimeout(resolve, 0));
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** A content-only state: navigation stays usable, hidden pages cannot receive input. */
export function showPageLoading(content: HTMLElement, title: string, retry: () => void) {
  const previousBusy = content.getAttribute('aria-busy');
  const inertStates = [...content.querySelectorAll<HTMLElement>('.page-section')]
    .map((section) => ({ section, inert: section.inert }));
  inertStates.forEach(({ section }) => { section.inert = true; });
  const state = document.createElement('div');
  state.className = 'page-transition-state';
  state.setAttribute('role', 'status');
  state.setAttribute('aria-live', 'polite');
  state.innerHTML = '<span class="page-transition-spinner" aria-hidden="true"></span><strong></strong><p></p><button type="button" hidden>重新加载</button>';
  state.querySelector('strong')!.textContent = `正在加载${title}`;
  state.querySelector('p')!.textContent = '正在准备页面，请稍候…';
  state.querySelector('button')!.addEventListener('click', retry);
  content.classList.add('is-page-loading');
  content.setAttribute('aria-busy', 'true');
  // The overlay must not start above the viewport when leaving a scrolled page.
  content.scrollTop = 0;
  content.appendChild(state);
  let finished = false;
  return {
    finish() {
      if (finished) return;
      finished = true;
      state.remove();
      content.classList.remove('is-page-loading');
      if (previousBusy === null) content.removeAttribute('aria-busy');
      else content.setAttribute('aria-busy', previousBusy);
      inertStates.forEach(({ section, inert }) => { section.inert = inert; });
    },
    fail() {
      if (finished) return;
      content.setAttribute('aria-busy', 'false');
      state.classList.add('is-error');
      state.setAttribute('role', 'alert');
      state.querySelector<HTMLElement>('.page-transition-spinner')!.hidden = true;
      state.querySelector('strong')!.textContent = `${title}暂时无法加载`;
      state.querySelector('p')!.textContent = '请检查网络后重试，或切换到其他页面。';
      state.querySelector('button')!.hidden = false;
    },
  };
}
