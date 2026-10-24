// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addOfficeSortHandles, bindOfficeTableSort, moveOfficeTableItem } from './office-table-sort';

let table: HTMLTableElement;
let cleanup: () => void;
const sync = () => {
  table.querySelectorAll('[data-office-table-column]').forEach((e, i) => e.setAttribute('data-office-table-column', String(i)));
  table.querySelectorAll('[data-office-table-row]').forEach((row, i) => {
    row.setAttribute('data-office-table-row', String(i));
    row.querySelectorAll('[data-office-table-cell]').forEach((e, j) => e.setAttribute('data-office-table-cell', String(j)));
  });
  addOfficeSortHandles(table);
};
const values = () => [...table.querySelectorAll('[data-office-table-row]')].map(row => [...row.querySelectorAll<HTMLInputElement>('[data-office-table-cell]')].map(input => input.value));
beforeEach(() => {
  document.body.innerHTML = `<div class="biz-office-detail-scroll"><table><thead><tr>
    <th><div><span data-office-table-column="0">编号</span></div></th>
    <th><div><input data-office-table-column="1" value="原料 A"></div></th>
    <th><div><input data-office-table-column="2" value="原料 B"></div></th>
    <th>客户认可</th><th>操作</th></tr></thead><tbody>
    ${[0, 1, 2].map(i => `<tr data-office-table-row="${i}"><td><input data-office-table-cell="0" value="${i + 1}" readonly></td><td><input data-office-table-cell="1" value="A${i}"></td><td><input data-office-table-cell="2" value="B${i}"></td><td><input type="checkbox" data-office-row-approved ${i === 1 ? 'checked' : ''}></td><td><button>删除</button></td></tr>`).join('')}
    </tbody></table></div>`;
  table = document.querySelector('table')!;
  sync(); cleanup = bindOfficeTableSort(document.body, sync);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

it('moves complete columns with unsaved cell values and keeps fixed columns in place', () => {
  table.querySelector<HTMLInputElement>('tbody [data-office-table-cell="1"]')!.value = '未保存';
  expect(moveOfficeTableItem(table, 'column', 1, 2)).toBe(true); sync();
  expect(values()[0]).toEqual(['1', 'B0', '未保存']);
  expect([...table.querySelectorAll<HTMLInputElement>('thead input')].map(e => e.value)).toEqual(['原料 B', '原料 A']);
  expect(moveOfficeTableItem(table, 'column', 1, 0)).toBe(false);
  expect(moveOfficeTableItem(table, 'column', 0, 1)).toBe(false);
  expect(moveOfficeTableItem(table, 'column', 1, 3)).toBe(false);
  expect(table.querySelector('thead th:last-child')!.textContent).toBe('操作');
});
it('moves rows with approval state and renumbers without duplicates', () => {
  const approved = table.querySelectorAll('[data-office-table-row]')[1];
  moveOfficeTableItem(table, 'row', 1, 0); sync();
  expect(values()).toEqual([['1', 'A1', 'B1'], ['2', 'A0', 'B0'], ['3', 'A2', 'B2']]);
  expect(table.querySelector('[data-office-table-row]')).toBe(approved);
  expect(approved.querySelector<HTMLInputElement>('[data-office-row-approved]')!.checked).toBe(true);
  expect(table.querySelectorAll('[data-office-sort="row"]')).toHaveLength(3);
});
it('supports keyboard reordering and cleanup', () => {
  const handle = table.querySelector<HTMLButtonElement>('[data-office-sort="column"]')!;
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(values()[0]).toEqual(['1', 'B0', 'A0']);
  cleanup();
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(values()[0]).toEqual(['1', 'B0', 'A0']);
});

function geometry() {
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON() {} }) as DOMRect;
  vi.spyOn(table.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 500, 300));
  table.querySelectorAll<HTMLElement>('thead th').forEach((cell, i) => vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(rect(i * 100, 0, 100, 40)));
  table.querySelectorAll<HTMLElement>('tbody tr').forEach((row, i) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(0, 40 + i * 40, 500, 40));
    [...row.children].forEach((cell, j) => vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(rect(j * 100, 40 + i * 40, 100, 40)));
  });
  vi.useFakeTimers();
}
function start(axis: string, index: number, x: number, y: number) {
  table.querySelector(`[data-office-sort="${axis}"][data-office-sort-index="${index}"]`)!
    .dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 7, clientX: x, clientY: y, bubbles: true }));
}
function move(x: number, y: number) {
  document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: x, clientY: y, bubbles: true }));
  vi.advanceTimersByTime(20);
}
const release = () => document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
afterEach(() => vi.useRealTimers());

it('slides neighbouring rows into place before release without changing unsaved data', () => {
  geometry(); start('row', 0, 10, 60); move(10, 146);
  const rows = table.querySelectorAll<HTMLElement>('tbody tr');
  expect(rows[1].style.transform).toBe('translate3d(0,-40px,0)');
  expect(rows[2].style.transform).toBe('translate3d(0,-40px,0)');
  expect(values().map(row => row[1])).toEqual(['A0', 'A1', 'A2']);
  expect(document.querySelector<HTMLElement>('.biz-office-sort-preview')!.style.transform).toBe('translate3d(0px,86px,0)');
  release();
  expect(values().map(row => row[1])).toEqual(['A1', 'A2', 'A0']);
  expect(document.querySelector('.is-settling')).not.toBeNull();
  vi.advanceTimersByTime(300);
  expect(document.querySelector('.biz-office-sort-preview,.is-office-sort-source,.is-office-sort-moving')).toBeNull();
});
it('previews full columns and restores the gap when reversing direction', () => {
  geometry();
  table.querySelector<HTMLInputElement>('tbody [data-office-table-cell="1"]')!.value = '未保存的用量';
  start('column', 1, 110, 20); move(225, 20);
  expect(document.querySelector('.biz-office-sort-preview')!.textContent).toContain('未保存的用量');
  expect(table.querySelector<HTMLElement>('thead th:nth-child(3)')!.style.transform).toBe('translate3d(-100px,0,0)');
  expect(table.querySelector<HTMLElement>('tbody td:nth-child(3)')!.style.transform).toBe('translate3d(-100px,0,0)');
  expect(table.querySelector<HTMLElement>('thead th:first-child')!.style.transform).toBe('translate3d(0px,0,0)');
  move(110, 20);
  expect(table.querySelector<HTMLElement>('thead th:nth-child(3)')!.style.transform).toBe('translate3d(0px,0,0)');
  move(225, 20); release(); vi.advanceTimersByTime(300);
  expect(values()[0]).toEqual(['1', 'B0', '未保存的用量']);
});
it('cancels on Escape and cleans up even during settling', () => {
  geometry(); start('row', 2, 10, 140); move(10, 50);
  expect(document.querySelector<HTMLElement>('.biz-office-sort-preview')!.dataset.destination).toBe('0');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(values().map(row => row[1])).toEqual(['A0', 'A1', 'A2']);
  cleanup(); vi.advanceTimersByTime(300);
  expect(document.querySelector('.biz-office-sort-preview,.is-office-sort-source,.is-office-sort-moving')).toBeNull();
});
it('does not commit a drag outside the scroll area and cleans up pointer cancellation', () => {
  geometry(); start('row', 0, 10, 60); move(10, 146); move(700, 500); release();
  vi.advanceTimersByTime(300);
  expect(values().map(row => row[1])).toEqual(['A0', 'A1', 'A2']);
  start('column', 1, 110, 20); move(225, 20);
  document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, bubbles: true }));
  expect(document.querySelector('.biz-office-sort-preview,.is-office-sort-source')).toBeNull();
});
