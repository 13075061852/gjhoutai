import '../../../styles/pages/office-table-sort.css';

type Axis = 'row' | 'column';

/** Move existing nodes so unsaved values, checkboxes and input state stay attached. */
export function moveOfficeTableItem(table: HTMLTableElement, axis: Axis, from: number, to: number): boolean {
  const fields = [...table.querySelectorAll('[data-office-table-column]')];
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('[data-office-table-row]')];
  const limit = axis === 'column' ? fields.length : rows.length;
  const min = axis === 'column' ? 1 : 0;
  if (![from, to].every(Number.isInteger) || from < min || to < min || from >= limit || to >= limit || from === to) return false;
  const move = (nodes: Node[]) => {
    const source = nodes[from], target = nodes[to];
    target.parentElement!.insertBefore(source, from < to ? target.nextSibling : target);
  };
  if (axis === 'row') move(rows);
  else {
    move(fields.map(field => field.closest<HTMLElement>('th')!));
    rows.forEach(row => move([...row.querySelectorAll('[data-office-table-cell]')].map(field => field.closest<HTMLElement>('td')!)));
  }
  return true;
}

export function addOfficeSortHandles(table: HTMLTableElement) {
  const add = (parent: Element, axis: Axis, index: number) => {
    let handle = parent.querySelector<HTMLButtonElement>('[data-office-sort]');
    if (!handle) {
      handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'biz-office-sort-handle';
      handle.textContent = '⠿';
      parent.prepend(handle);
    }
    handle.dataset.officeSort = axis;
    handle.dataset.officeSortIndex = String(index);
    handle.setAttribute('aria-label', `拖动第${index + 1}${axis === 'row' ? '行' : '列'}排序`);
    handle.title = axis === 'row' ? '拖动排序，也可使用上下方向键' : '拖动排序，也可使用左右方向键';
  };
  table.querySelectorAll('[data-office-table-column]').forEach((field, index) => {
    if (index) add(field.parentElement!, 'column', index);
  });
  table.querySelectorAll('[data-office-table-row]').forEach((row, index) => {
    const input = row.querySelector<HTMLInputElement>('[data-office-table-cell]');
    if (!input) return;
    input.value = String(index + 1);
    input.parentElement!.classList.add('biz-office-sort-index');
    add(input.parentElement!, 'row', index);
  });
}

export function bindOfficeTableSort(root: HTMLElement, sync: (table: HTMLTableElement) => void) {
  let cancel: (() => void) | undefined;
  const keydown = (event: KeyboardEvent) => {
    const handle = (event.target as Element).closest<HTMLButtonElement>('[data-office-sort]');
    if (!handle) return;
    const axis = handle.dataset.officeSort as Axis;
    const keys = axis === 'row' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const table = handle.closest('table')!;
    const from = Number(handle.dataset.officeSortIndex);
    if (moveOfficeTableItem(table, axis, from, from + (event.key === keys[0] ? -1 : 1))) sync(table);
    handle.focus();
  };
  const pointerdown = (event: PointerEvent) => {
    const handle = (event.target as Element).closest<HTMLButtonElement>('[data-office-sort]');
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    cancel?.();
    const table = handle.closest('table')!;
    const axis = handle.dataset.officeSort as Axis;
    const from = Number(handle.dataset.officeSortIndex);
    const rows = [...table.querySelectorAll<HTMLElement>('[data-office-table-row]')];
    const groups: HTMLElement[][] = axis === 'row' ? rows.map(row => [row])
      : [...table.querySelectorAll('[data-office-table-column]')].map((_, index) =>
        [...table.querySelectorAll('thead tr,[data-office-table-row]')].map(row => row.children[index] as HTMLElement));
    const source = groups[from];
    const scroll = table.closest<HTMLElement>('.biz-office-detail-scroll');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let to = from, dragging = false, ended = false, frame = 0;
    let pointerX = event.clientX, pointerY = event.clientY;
    let preview: HTMLDivElement | undefined;
    let rects: DOMRect[] = [], offsets: number[] = [];
    let originX = 0, originY = 0, initialScrollX = 0, initialScrollY = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const transform = (distance: number) => axis === 'row' ? `translate3d(0,${distance}px,0)` : `translate3d(${distance}px,0,0)`;
    const reset = () => {
      groups.flat().forEach(item => {
        item.style.removeProperty('transform');
        item.classList.remove('is-office-sort-moving', 'is-office-sort-source');
      });
      preview?.remove(); table.classList.remove('is-office-sorting');
      if (settleTimer) clearTimeout(settleTimer);
      cancel = undefined;
    };
    const createPreview = () => {
      rects = groups.map(group => group[0].getBoundingClientRect());
      initialScrollX = scroll?.scrollLeft || 0; initialScrollY = scroll?.scrollTop || 0;
      originX = rects[from].left; originY = rects[from].top;
      preview = document.createElement('div');
      preview.className = `biz-office-sort-preview is-${axis}`;
      preview.setAttribute('aria-hidden', 'true');
      const cells = axis === 'row' ? [...source[0].children] : source;
      cells.forEach(cell => {
        const item = document.createElement('div');
        const field = cell.querySelector<HTMLInputElement>('input');
        item.textContent = field ? (field.type === 'checkbox' ? (field.checked ? '已认可' : '待确认') : field.value || '—') : cell.textContent;
        const rect = cell.getBoundingClientRect();
        item.style.width = `${rect.width}px`; item.style.height = `${rect.height}px`;
        preview!.append(item);
      });
      preview.style.left = `${originX}px`; preview.style.top = `${originY}px`;
      document.body.append(preview);
      groups.flat().forEach(item => item.classList.add('is-office-sort-moving'));
      source.forEach(item => item.classList.add('is-office-sort-source'));
      table.classList.add('is-office-sorting');
    };
    const arrange = (next: number) => {
      to = next;
      const order = groups.map((_, index) => index);
      order.splice(to, 0, order.splice(from, 1)[0]);
      let position = axis === 'row' ? rects[0].top : rects[0].left;
      offsets = Array(groups.length).fill(0);
      order.forEach(index => {
        const rect = rects[index];
        offsets[index] = position - (axis === 'row' ? rect.top : rect.left);
        position += axis === 'row' ? rect.height : rect.width;
      });
      groups.forEach((group, index) => group.forEach(item => { item.style.transform = transform(offsets[index]); }));
      preview!.dataset.destination = String(to);
    };
    const render = () => {
      frame = 0;
      if (ended) return;
      if (!table.isConnected) { finish(false, true); return; }
      const bounds = (scroll || table).getBoundingClientRect();
      const inside = pointerX >= bounds.left - 24 && pointerX <= bounds.right + 24
        && pointerY >= bounds.top - 24 && pointerY <= bounds.bottom + 24;
      let scrolling = false;
      if (scroll && inside) {
        const before = axis === 'row' ? scroll.scrollTop : scroll.scrollLeft;
        const point = axis === 'row' ? pointerY : pointerX;
        const start = axis === 'row' ? bounds.top : bounds.left;
        const end = axis === 'row' ? bounds.bottom : bounds.right;
        const speed = point < start + 32 ? -Math.min(12, (start + 32 - point) / 3)
          : point > end - 32 ? Math.min(12, (point - end + 32) / 3) : 0;
        if (axis === 'row') scroll.scrollTop += speed; else scroll.scrollLeft += speed;
        scrolling = before !== (axis === 'row' ? scroll.scrollTop : scroll.scrollLeft);
      }
      const dx = (scroll?.scrollLeft || 0) - initialScrollX;
      const dy = (scroll?.scrollTop || 0) - initialScrollY;
      // Keep the lifted item under the original grab point, locked to its sorting axis.
      preview!.style.transform = `translate3d(${axis === 'column' ? pointerX - event.clientX : -dx}px,${axis === 'row' ? pointerY - event.clientY : -dy}px,0)`;
      let next = from;
      if (inside) {
        const center = axis === 'row'
          ? rects[from].top + rects[from].height / 2 + pointerY - event.clientY + dy
          : rects[from].left + rects[from].width / 2 + pointerX - event.clientX + dx;
        const min = axis === 'column' ? 1 : 0;
        next = min;
        rects.forEach((rect, index) => {
          if (index < min || index === from) return;
          if (center > (axis === 'row' ? rect.top + rect.height / 2 : rect.left + rect.width / 2)) next++;
        });
      }
      if (!offsets.length || next !== to) arrange(next);
      if (scrolling) frame = requestAnimationFrame(render);
    };
    const finish = (commit: boolean, immediate = false) => {
      if (ended) { if (immediate) reset(); return; }
      ended = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', abort);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', abort);
      if (!dragging) { reset(); return; }
      // Preserve in-flight positions so a quick release cannot snap neighbours to their destination.
      const visualRects = groups.map(group => group[0].getBoundingClientRect());
      if (commit && table.isConnected && moveOfficeTableItem(table, axis, from, to)) sync(table);
      groups.flat().forEach(item => {
        if (commit) item.classList.remove('is-office-sort-moving');
        item.style.removeProperty('transform');
      });
      if (immediate || reducedMotion || !table.isConnected) { reset(); return; }
      if (commit) {
        groups.forEach((group, index) => {
          if (index === from) return;
          const finalRect = group[0].getBoundingClientRect();
          const distance = axis === 'row' ? visualRects[index].top - finalRect.top : visualRects[index].left - finalRect.left;
          group.forEach(item => { item.style.transform = transform(distance); });
        });
        // Flush the inverse positions before playing the remaining distance to zero.
        void table.offsetHeight;
        groups.forEach((group, index) => {
          if (index === from) return;
          group.forEach(item => { item.classList.add('is-office-sort-moving'); item.style.transform = transform(0); });
        });
      }
      const destination = commit ? source[0].getBoundingClientRect() : {
        left: originX - ((scroll?.scrollLeft || 0) - initialScrollX),
        top: originY - ((scroll?.scrollTop || 0) - initialScrollY),
      };
      preview!.classList.add('is-settling');
      preview!.style.transform = `translate3d(${destination.left - originX}px,${destination.top - originY}px,0)`;
      settleTimer = setTimeout(() => { reset(); if (handle.isConnected) handle.focus({ preventScroll: true }); }, 260);
      cancel = reset;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId || ended) return;
      if (!table.isConnected) { finish(false, true); return; }
      if (!dragging && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 5) return;
      pointerX = e.clientX; pointerY = e.clientY;
      if (!dragging) { createPreview(); dragging = true; }
      e.preventDefault();
      if (!frame) frame = requestAnimationFrame(render);
    };
    const up = (e: PointerEvent) => { if (e.pointerId === event.pointerId) { if (frame) { cancelAnimationFrame(frame); render(); } finish(true); } };
    const abort = () => finish(false, true);
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    cancel = abort;
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', abort);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', abort);
  };
  root.addEventListener('pointerdown', pointerdown);
  root.addEventListener('keydown', keydown, true);
  return () => { cancel?.(); root.removeEventListener('pointerdown', pointerdown); root.removeEventListener('keydown', keydown, true); };
}
