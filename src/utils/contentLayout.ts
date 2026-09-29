/** Respond to the workspace width, including space taken by either sidebar. */
export function observeContentLayout(main: HTMLElement) {
  const update = (width: number) => {
    const layout = width <= 480 ? 'small' : width <= 760 ? 'narrow' : width <= 1100 ? 'compact' : 'wide';
    if (main.dataset.contentLayout !== layout) main.dataset.contentLayout = layout;
  };
  update(main.getBoundingClientRect().width);
  const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
  observer.observe(main);
  return () => observer.disconnect();
}
