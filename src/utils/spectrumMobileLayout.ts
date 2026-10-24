import { mountSpectrumToolbarActions } from './spectrumToolbarActions';

/** Move existing controls, never duplicate IDs or their bound listeners. */
export function mountSpectrumMobileLayout(root: HTMLElement): () => void {
  const categoryList = root.querySelector<HTMLElement>('#spectrumCategoryFilters');
  const tagRow = root.querySelector<HTMLElement>('.spectrum-toolbar-tags');
  const selectedBlock = root.querySelector<HTMLElement>('.spectrum-selected-block');
  const toolbar = root.querySelector<HTMLElement>('.spectrum-toolbar');
  if (!categoryList || !tagRow || !selectedBlock || !toolbar) return () => {};

  const cleanupToolbarActions = mountSpectrumToolbarActions(toolbar);
  const galleryControls = root.querySelector<HTMLElement>('.spectrum-gallery-controls');
  const detailToggle = root.querySelector<HTMLElement>('#spectrumToggleDetailBtn');
  const selectedActions = root.querySelector<HTMLElement>('.spectrum-selected-actions');
  const categoryHome = categoryList.parentElement!;
  const selectedHome = selectedBlock.parentElement!;
  const categoryAnchor = document.createComment('category desktop position');
  const selectedAnchor = document.createComment('selection desktop position');
  const selectedActionsAnchor = document.createComment('selection actions desktop position');
  const galleryControlsAnchor = document.createComment('gallery controls desktop position');
  categoryList.before(categoryAnchor);
  selectedBlock.before(selectedAnchor);
  selectedActions?.before(selectedActionsAnchor);
  galleryControls?.before(galleryControlsAnchor);
  const restoreControls = () => {
    const actionsParent = selectedActionsAnchor.parentNode;
    if (selectedActions && actionsParent) actionsParent.insertBefore(selectedActions, selectedActionsAnchor.nextSibling);
    const controlsParent = galleryControlsAnchor.parentNode;
    if (galleryControls && controlsParent) controlsParent.insertBefore(galleryControls, galleryControlsAnchor.nextSibling);
  };
  const row = document.createElement('div');
  row.className = 'spectrum-mobile-categories';
  row.setAttribute('aria-label', '分类筛选');
  const label = document.createElement('span');
  label.className = 'spectrum-toolbar-label';
  label.textContent = '分类';
  row.append(label);
  const mq = window.matchMedia('(max-width: 1200px)');
  const sync = () => {
    root.classList.toggle('spectrum-mobile-layout', mq.matches);
    if (mq.matches) {
      tagRow.before(row);
      row.append(categoryList);
      toolbar.append(selectedBlock);
      if (selectedActions && galleryControls && detailToggle) {
        galleryControls.insertBefore(selectedActions, detailToggle);
      }
      if (galleryControls) tagRow.after(galleryControls);
    } else {
      categoryHome.insertBefore(categoryList, categoryAnchor.nextSibling);
      selectedHome.insertBefore(selectedBlock, selectedAnchor.nextSibling);
      restoreControls();
      row.remove();
    }
  };
  sync();
  mq.addEventListener('change', sync);
  return () => {
    cleanupToolbarActions();
    mq.removeEventListener('change', sync);
    categoryHome.insertBefore(categoryList, categoryAnchor.nextSibling);
    selectedHome.insertBefore(selectedBlock, selectedAnchor.nextSibling);
    restoreControls();
    categoryAnchor.remove();
    selectedAnchor.remove();
    selectedActionsAnchor.remove();
    galleryControlsAnchor.remove();
    row.remove();
    root.classList.remove('spectrum-mobile-layout');
  };
}
