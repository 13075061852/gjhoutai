import { captureOfficeListScroll } from './office-list-scroll';
import { deferOfficeOverlayClose } from '../../../utils/officeOverlayMotion';
import { mountOfficeDetailsOverlay, toggleOfficeDetailsOrientation } from '../../../utils/officeDetailsOrientation';
import { addOfficeSortHandles, bindOfficeTableSort } from './office-table-sort';
import '../../../styles/pages/office-records-base.css';
import { getLegacyApp } from '../../core/app-context';
import { LOCAL_STORAGE_KEYS } from '../../../services/local-storage-keys';
const officePageSizeOptions = [5, 10, 20, 50];
const mutationControls = '[data-office-new], [data-office-edit], [data-office-delete], [data-office-save], [data-office-toggle-row-approval], [data-office-add-row], [data-office-remove-row], [data-office-add-column], [data-office-remove-column], [data-ash-new], [data-ash-edit], [data-ash-delete], [data-ash-save], [data-ash-add-row], [data-ash-remove-row]';
import { createOfficeUi } from './shared';

/** Office records only: sampling, coloring and ash measurements. */
(function () {
'use strict';
const App = getLegacyApp();

if (!App) return;

const { refs, utils } = App;

const {
    esc,
    decorateOfficeMarkup,
    renderSearchBox,
    scheduleSearchRender,
    clearSearchTimer,
  } = createOfficeUi({ App, utils, render });

const OFFICE_RECORD_STORAGE_KEY = LOCAL_STORAGE_KEYS.officeRecords;

const officeRecordTypes = {
    sampling: '送样记录',
    coloring: '配色记录',
  };

const officeRecordSections = {
    ...officeRecordTypes,
    ash: '灰份记录',
  };

const officeFixedIndexColumn = '编号';

const officeDefaultTableColumns = [officeFixedIndexColumn, '', '', ''];

const createOfficeDefaultTableRows = (count = 3, columns = officeDefaultTableColumns) => Array.from({ length: count }, (_, rowIndex) => (
    columns.map((_, columnIndex) => (columnIndex === 0 ? String(rowIndex + 1) : ''))
  ));

const getTodayCode = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  };

const getTimeCode = () => {
    const now = new Date();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  };

const getOfficeRecordFallbackDate = () => getTodayCode();

const parseOfficeTextRows = (value = '') => String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const parseOfficeComponents = (value = '') => {
    if (Array.isArray(value)) {
      return value.map((item) => ({
        model: String(item.model || item.name || '').trim(),
        batch: String(item.batch || '').trim(),
        ratio: String(item.ratio || '').trim(),
      })).filter((item) => item.model || item.batch);
    }
    return parseOfficeTextRows(value).map((line) => {
      const parts = line.split(/\s*(?:\/|\||,|，|、|\t)\s*/).filter(Boolean);
      return {
        model: parts[0] || line,
        batch: parts[1] || '',
        ratio: parts[2] || '',
      };
    }).filter((item) => item.model || item.batch);
  };

const parseOfficeAdditives = (value = '') => {
    if (Array.isArray(value)) {
      return value.map((item) => ({
        name: String(item.name || '').trim(),
        ratio: String(item.ratio || '').trim(),
        note: String(item.note || '').trim(),
      })).filter((item) => item.name);
    }
    return parseOfficeTextRows(value).map((line) => {
      const parts = line.split(/\s*(?:\/|\||,|，|、|\t)\s*/).filter(Boolean);
      return {
        name: parts[0] || line,
        ratio: parts[1] || '',
        note: parts.slice(2).join(' / '),
      };
    }).filter((item) => item.name);
  };

const normalizeOfficeTableColumns = (value) => {
    const columns = Array.isArray(value)
      ? value.map((column) => String(column || '').trim())
      : [];
    if (!columns.length) return [...officeDefaultTableColumns];
    const customColumns = columns.filter((column, index) => index !== 0 && column !== officeFixedIndexColumn);
    return [officeFixedIndexColumn, ...customColumns];
  };

const normalizeOfficeTableRows = (record = {} as any, columns = []) => {
    if (Array.isArray(record.tableRows) && record.tableRows.length) {
      return record.tableRows.map((row, rowIndex) => {
        const cells = Array.isArray(row) ? row : [];
        return columns.map((_, index) => (index === 0 ? String(rowIndex + 1) : String(cells[index] || '').trim()));
      });
    }
    const components = parseOfficeComponents(record.componentsText || record.components);
    const additives = parseOfficeAdditives(record.additivesText || record.additives);
    if (components.length || additives.length) {
      const rows: any[] = [];
      const maxLength = Math.max(components.length, additives.length, 1);
      for (let index = 0; index < maxLength; index += 1) {
        const component = components[index] || {} as any;
        const additive = additives[index] || {} as any;
        rows.push(columns.map((column, columnIndex) => {
          const label = String(column || '');
          if (columnIndex === 0 || /编号/.test(label)) return String(index + 1);
          if (/型号/.test(label)) return component.model || '';
          if (/批次/.test(label)) return component.batch || '';
          if (/比例/.test(label)) return component.ratio || additive.ratio || '';
          if (/添加|色粉|助剂/.test(label)) return additive.name || '';
          if (/备注/.test(label)) return additive.note || '';
          return '';
        }));
      }
      return rows;
    }
    return createOfficeDefaultTableRows(3, columns);
  };

const normalizeOfficeRecord = (record = {} as any, index = 0) => {
    const type = officeRecordTypes[record.type] ? record.type : 'sampling';
    const fallbackDate = getOfficeRecordFallbackDate();
    const tableColumns = normalizeOfficeTableColumns(record.tableColumns);
    const tableRows = normalizeOfficeTableRows(record, tableColumns);
    const legacyCustomerApproved = type === 'sampling' && (
      record.customerApproved === true
      || record.customerAccepted === true
      || record.approved === true
      || String(record.customerApproved || '').trim() === 'true'
    );
    const customerApprovedRows = type === 'sampling'
      ? [...new Set((Array.isArray(record.customerApprovedRows)
        ? record.customerApprovedRows
        : legacyCustomerApproved ? tableRows.map((_, rowIndex) => rowIndex) : [])
        .map(Number)
        .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < tableRows.length))]
      : [];
    return {
      id: String(record.id || `OR-${fallbackDate.replace(/-/g, '')}-${String(index + 1).padStart(2, '0')}`).trim(),
      type,
      project: String(record.project || record.customer || '').trim(),
      date: String(record.date || fallbackDate).trim(),
      customerApproved: customerApprovedRows.length > 0,
      customerApprovedRows,
      components: parseOfficeComponents(record.componentsText || record.components),
      additives: parseOfficeAdditives(record.additivesText || record.additives),
      tableColumns,
      tableRows,
      target: String(record.target || '').trim(),
      updatedAt: String(record.updatedAt || new Date().toISOString()),
    };
  };

const normalizeOfficeRecords = (value) => (Array.isArray(value) ? value : [])
    .map(normalizeOfficeRecord)
    .filter((record) => record.id);

const officeRecords = normalizeOfficeRecords(utils.readJson(OFFICE_RECORD_STORAGE_KEY, null));

let officeRecordActiveType = 'sampling';

let officeRecordSearchQuery = '';

let officeRecordListPage = 1;

let officeRecordPageSize = 10;

let officeRecordEditingId = '';

let officeRecordModalOpen = false;

let officeDetailsId = '';

let officeDetailsKind = 'office';

let officeRecordDraftNote = '办事记录自动保存到云端';

const ASH_RECORD_STORAGE_KEY = LOCAL_STORAGE_KEYS.ashRecords;

const ashRecordFields = [
    ['cupWeight', '杯重'],
    ['materialWeight', '料重'],
    ['residueWeight', '剩余重量'],
    ['residueMaterialWeight', '剩余料重'],
    ['content', '含量'],
  ];

const createAshDefaultRows = (count = 2) => Array.from({ length: count }, (_, index) => ({
    index: String(index + 1),
    cupWeight: '',
    materialWeight: '',
    residueWeight: '',
    residueMaterialWeight: '',
    content: '',
  }));

const parseAshNumber = (value = '') => {
    const normalized = String(value || '').trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
    if (!normalized) return NaN;
    return Number(normalized);
  };

const formatAshNumber = (value, digits = 3) => {
    if (!Number.isFinite(value)) return '';
    return String(Number(value.toFixed(digits)));
  };

const calculateAshDerivedRow = (row = {} as any) => {
    const cupWeight = parseAshNumber(row.cupWeight);
    const materialWeight = parseAshNumber(row.materialWeight);
    const residueWeight = parseAshNumber(row.residueWeight);
    if (!Number.isFinite(cupWeight) || !Number.isFinite(materialWeight) || !Number.isFinite(residueWeight)) {
      return row;
    }
    const residueMaterialWeight = residueWeight - cupWeight;
    const content = materialWeight ? (residueMaterialWeight / materialWeight) * 100 : NaN;
    return {
      ...row,
      residueMaterialWeight: formatAshNumber(residueMaterialWeight),
      content: Number.isFinite(content) ? `${formatAshNumber(content, 2)}%` : '',
    };
  };

const normalizeAshRows = (value) => {
    const rows = Array.isArray(value) && value.length ? value : createAshDefaultRows();
    return rows.map((row = {} as any, index) => calculateAshDerivedRow({
      index: String(index + 1),
      cupWeight: String(row.cupWeight || row.cup || '').trim(),
      materialWeight: String(row.materialWeight || row.material || '').trim(),
      residueWeight: String(row.residueWeight || row.remainingWeight || '').trim(),
      residueMaterialWeight: String(row.residueMaterialWeight || row.remainingMaterial || '').trim(),
      content: String(row.content || row.ashContent || '').trim(),
    }));
  };

const normalizeAshRecord = (record = {} as any, index = 0) => {
    const fallbackDate = getTodayCode();
    return {
      id: String(record.id || `ASH-${fallbackDate.replace(/-/g, '')}-${String(index + 1).padStart(2, '0')}`).trim(),
      date: String(record.date || fallbackDate).trim(),
      name: String(record.name || record.project || '').trim(),
      batch: String(record.batch || '').trim(),
      rows: normalizeAshRows(record.rows),
      updatedAt: String(record.updatedAt || new Date().toISOString()),
    };
  };

const normalizeAshRecords = (value) => (Array.isArray(value) ? value : [])
    .map(normalizeAshRecord)
    .filter((record) => record.id);

const ashRecords = normalizeAshRecords(utils.readJson(ASH_RECORD_STORAGE_KEY, null));

let ashRecordSearchQuery = '';

let ashRecordListPage = 1;

let ashRecordPageSize = 10;

let ashRecordEditingId = '';

let ashRecordModalOpen = false;

let ashRecordDraftNote = '灰份记录自动保存到云端';

const notifyAction = (message, tone = 'success', key = '') => {
    App.notify?.show?.({
      title: tone === 'warn' ? '需要处理' : '操作完成',
      message,
      tone,
      key: key || `${tone}:${message}`,
    });
  };

const getOfficeRecordIndex = (id) => officeRecords.findIndex((record) => record.id === id);

const getOfficeRecordLabel = (type = officeRecordActiveType) => officeRecordSections[type] || officeRecordTypes.sampling;

const persistOfficeRecords = (note = '办事记录已保存') => {
    officeRecordDraftNote = note;
    utils.writeJson(OFFICE_RECORD_STORAGE_KEY, officeRecords);
  };

const getOfficeRecordFormRecord = () => {
    const root = refs.businessPageContent;
    const read = (field) => String(root?.querySelector(`[data-office-field="${field}"]`)?.value || '').trim();
    const editingRecord: any = officeRecords[getOfficeRecordIndex(officeRecordEditingId)] || {};
    const tableColumns = [officeFixedIndexColumn, ...[...(root?.querySelectorAll('[data-office-table-column]') || [])]
      .filter((input) => input.getAttribute('data-office-table-fixed') !== 'true')
      .map((input) => String(input.value || '').trim())];
    const tableRows = [...(root?.querySelectorAll('[data-office-table-row]') || [])]
      .map((row) => [...row.querySelectorAll('[data-office-table-cell]')]
        .map((input) => String(input.value || '').trim()));
    const customerApprovedRows = [...(root?.querySelectorAll('[data-office-table-row]') || [])]
      .map((row, rowIndex) => row.querySelector('[data-office-row-approved]')?.checked ? rowIndex : -1)
      .filter((rowIndex) => rowIndex >= 0);
    return normalizeOfficeRecord({
      ...editingRecord,
      id: editingRecord.id || `OR-${getTodayCode().replace(/-/g, '')}-${String(officeRecords.length + 1).padStart(2, '0')}`,
      type: officeRecordActiveType,
      project: read('project'),
      date: editingRecord.date || getTodayCode(),
      customerApprovedRows,
      target: read('target'),
      tableColumns,
      tableRows,
      updatedAt: new Date().toISOString(),
    });
  };

const saveOfficeRecord = () => {
    const record = getOfficeRecordFormRecord();
    const hasTableContent = record.tableRows.some((row) => row.some((cell) => String(cell || '').trim()));
    if (!record.project || !hasTableContent) {
      officeRecordDraftNote = '请填写客户/项目，并至少录入一行明细内容';
      notifyAction(officeRecordDraftNote, 'warn', 'office-record-required-fields');
      return false;
    }
    const index = getOfficeRecordIndex(officeRecordEditingId);
    if (index >= 0) {
      officeRecords[index] = record;
      persistOfficeRecords(`已更新${getOfficeRecordLabel(record.type)} ${record.id} · ${getTimeCode()}`);
      notifyAction(`已保存${getOfficeRecordLabel(record.type)} ${record.id}`, 'success', `office-record-save:${record.id}`);
      return true;
    }
    officeRecords.unshift(record);
    persistOfficeRecords(`已新增${getOfficeRecordLabel(record.type)} ${record.id} · ${getTimeCode()}`);
    notifyAction(`已新增${getOfficeRecordLabel(record.type)} ${record.id}`, 'success', `office-record-save:${record.id}`);
    return true;
  };

const deleteOfficeRecord = async (id) => {
    const index = getOfficeRecordIndex(id);
    if (index < 0) return;
    const record = officeRecords[index];
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: `删除${getOfficeRecordLabel(record.type)}`,
      message: `确认删除「${record.project || record.id}」？删除后无法恢复。`,
      confirmText: '确认删除',
    });
    if (!confirmed) return;
    officeRecords.splice(index, 1);
    persistOfficeRecords(`已删除${getOfficeRecordLabel(record.type)} ${id} · ${getTimeCode()}`);
    notifyAction(`已删除${getOfficeRecordLabel(record.type)} ${id}`, 'success', `office-record-delete:${id}`);
  };

const toggleOfficeRecordRowApproval = (id, rowIndex) => {
    const index = getOfficeRecordIndex(id);
    if (index < 0) return null;
    const record = officeRecords[index];
    if (record.type !== 'sampling' || rowIndex < 0 || rowIndex >= record.tableRows.length) return null;
    const approvedRows = new Set(record.customerApprovedRows || []);
    const nextApproved = !approvedRows.has(rowIndex);
    if (nextApproved) approvedRows.add(rowIndex);
    else approvedRows.delete(rowIndex);
    officeRecords[index] = normalizeOfficeRecord({
      ...record,
      customerApproved: false,
      customerApprovedRows: [...approvedRows],
      updatedAt: new Date().toISOString(),
    }, index);
    persistOfficeRecords(`${nextApproved ? '已标记' : '已取消'}第 ${rowIndex + 1} 条客户认可 ${record.id} · ${getTimeCode()}`);
    return nextApproved;
  };

const getOfficeTableFilledRows = (record) => (record.tableRows || []).filter((row) => row.some((cell) => String(cell || '').trim()));

const renderOfficeTableSummary = (record) => {
    const columns = record.tableColumns || [];
    const rows = (record.tableRows || [])
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => row.some((cell) => String(cell || '').trim()));
    if (!columns.length && !rows.length) return '<span class="biz-office-muted">未配置明细表</span>';
    if (!rows.length) return '<span class="biz-office-muted">未填写明细</span>';
    const visibleColumns = columns;
    const hasRowApproval = record.type === 'sampling';
    return `
      <div class="biz-office-table-summary">
        <table>
          <thead><tr>${visibleColumns.map((column) => `<th>${esc(column || '未命名')}</th>`).join('')}${hasRowApproval ? '<th>客户认可</th>' : ''}</tr></thead>
          <tbody>${rows.map(({ row, rowIndex }) => `
            <tr>
              ${visibleColumns.map((_, index) => `<td>${esc(row[index] || '--')}</td>`).join('')}
              ${hasRowApproval ? `<td><button class="biz-office-row-approval ${record.customerApprovedRows.includes(rowIndex) ? 'is-approved' : ''}" type="button" data-office-toggle-row-approval="${esc(record.id)}" data-office-row-index="${rowIndex}">${record.customerApprovedRows.includes(rowIndex) ? '已认可' : '待确认'}</button></td>` : ''}
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;
  };

const renderOfficeRecordCard = (record) => {
    return `
      <article class="biz-office-record-card" data-office-view="${esc(record.id)}">
        <div class="biz-office-record-top">
          <button type="button" class="biz-office-card-open" data-office-view="${esc(record.id)}" aria-haspopup="dialog">
            <strong>${esc(record.project || '未填写客户/项目')}</strong>
            <span class="biz-office-card-summary">${esc(getOfficeRecordLabel(record.type))} · ${(record.tableRows || []).filter((row) => row.some((cell) => String(cell || '').trim())).length} 条明细</span>
            <span class="biz-office-card-hint">查看详细数据</span>
          </button>
          <div class="biz-office-record-actions">
            <button type="button" data-office-edit="${esc(record.id)}" aria-label="编辑${esc(record.id)}">
              <i class="ti ti-pencil" aria-hidden="true"></i>
            </button>
            <button class="is-danger" type="button" data-office-delete="${esc(record.id)}" aria-label="删除${esc(record.id)}">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  };

const renderOfficeDetails = () => {
    if (!officeDetailsId) return '';
    const isAsh = officeDetailsKind === 'ash';
    const ashRecord = isAsh ? ashRecords.find((item) => item.id === officeDetailsId) : undefined;
    const officeRecord = !isAsh ? officeRecords.find((item) => item.id === officeDetailsId) : undefined;
    if (!ashRecord && !officeRecord) return '';
    const title = ashRecord ? ashRecord.name || '未填写名称' : officeRecord?.project || '未填写客户/项目';
    const label = ashRecord ? '灰份记录' : getOfficeRecordLabel(officeRecord?.type);
    return `
      <div class="dialog-overlay biz-office-details-overlay" data-office-details-overlay>
        <section class="dialog-card biz-office-details-dialog${isAsh ? ' is-ash-details' : ''}" role="dialog" aria-modal="true" aria-labelledby="officeDetailsTitle">
          <header class="biz-office-details-head">
            <div><span>${esc(label)}</span><h2 id="officeDetailsTitle">${esc(title)}</h2></div>
            <div class="biz-office-details-actions">
              <button type="button" data-office-details-orientation aria-pressed="false" aria-label="横向查看详细数据">横向查看</button>
              <button type="button" data-office-details-close aria-label="关闭详细数据">关闭</button>
            </div>
          </header>
          <div class="biz-office-details-body">
            ${ashRecord ? `<p class="biz-office-details-meta">${esc(ashRecord.date || '--')}${ashRecord.batch ? ` · ${esc(ashRecord.batch)}` : ''}</p>` : ''}
            ${ashRecord ? renderAshMeasurementTable(ashRecord) : renderOfficeTableSummary(officeRecord)}
          </div>
        </section>
      </div>`;
  };

const renderOfficeEditableTable = (record) => {
    const columns = record.tableColumns?.length ? record.tableColumns : [];
    const rows = record.tableRows?.length ? record.tableRows : [];
    return `
      <section class="biz-office-detail-table is-wide ${record.type === 'sampling' ? 'has-row-approval' : ''}">
        <div class="biz-office-detail-head">
          <div>
            <strong>明细表</strong>
          </div>
          <div class="biz-office-detail-actions">
            <button type="button" data-office-add-column><i class="ti ti-column-insert-right" aria-hidden="true"></i><span>加列</span></button>
            <button type="button" data-office-add-row><i class="ti ti-row-insert-bottom" aria-hidden="true"></i><span>加行</span></button>
          </div>
        </div>
        <div class="biz-office-detail-scroll">
          ${columns.length ? `<table>
            <thead>
              <tr>
                ${columns.map((column, index) => `
                  <th>
                    <div class="biz-office-column-field">
                      ${index === 0 ? `
                        <span class="biz-office-fixed-column" data-office-table-column="${index}" data-office-table-fixed="true">${esc(officeFixedIndexColumn)}</span>
                      ` : `
                        <input type="text" value="${esc(column)}" placeholder="填写列名" data-office-table-column="${index}" aria-label="第${index + 1}列列名">
                        <button type="button" data-office-remove-column="${index}" aria-label="删除第${index + 1}列">
                          <i class="ti ti-x" aria-hidden="true"></i>
                        </button>
                      `}
                    </div>
                  </th>
                `).join('')}
                ${record.type === 'sampling' ? '<th class="biz-office-row-approval-head">客户认可</th>' : ''}
                <th class="biz-office-row-action-head">操作</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, rowIndex) => `
                <tr data-office-table-row="${rowIndex}">
                  ${columns.map((_, columnIndex) => `
                    <td>
                      <input type="text" value="${esc(columnIndex === 0 ? String(rowIndex + 1) : row[columnIndex] || '')}" data-office-table-cell="${columnIndex}" aria-label="第${rowIndex + 1}行第${columnIndex + 1}列" ${columnIndex === 0 ? 'readonly class="biz-office-fixed-cell"' : ''}>
                    </td>
                  `).join('')}
                  ${record.type === 'sampling' ? `<td class="biz-office-row-approval-cell"><label class="biz-office-row-approval-field" title="客户认可第${rowIndex + 1}条送样"><input type="checkbox" data-office-row-approved="${rowIndex}" ${record.customerApprovedRows.includes(rowIndex) ? 'checked' : ''}><span>认可</span></label></td>` : ''}
                  <td class="biz-office-row-action-cell">
                    <button type="button" data-office-remove-row="${rowIndex}" aria-label="删除第${rowIndex + 1}行" ${rows.length <= 1 ? 'disabled' : ''}>
                      <i class="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>` : `
            <div class="biz-office-empty-table">
              <i class="ti ti-table-plus" aria-hidden="true"></i>
              <span>暂无列，请先点击“加列”创建你需要的参数</span>
            </div>
          `}
        </div>
      </section>
    `;
  };

const getOfficeDialogContentWidth = (columnCount: number, hasRowApproval: boolean) => (
    // Editor padding (40px), dialog borders (2px), and table viewport borders (2px).
    Math.max(760, 44 + 78 + Math.max(0, columnCount - 1) * 150 + (hasRowApproval ? 78 : 0) + 54)
  );

const renderOfficeRecords = () => {
    if (officeRecordActiveType === 'ash') return renderAshRecords();
    const typeRows = officeRecords.filter((record) => record.type === officeRecordActiveType);
    const visibleRows = typeRows.filter((record) => {
      const haystack = [
        record.id,
        record.project,
        record.target,
        record.type === 'sampling' ? `客户认可 ${(record.customerApprovedRows || []).length}/${(record.tableRows || []).length}` : '',
        ...(record.tableColumns || []),
        ...(record.tableRows || []).flat(),
      ].join(' ').toLowerCase();
      return haystack.includes(officeRecordSearchQuery.toLowerCase());
    });
    const totalPages = Math.max(1, Math.ceil(visibleRows.length / officeRecordPageSize));
    officeRecordListPage = Math.min(Math.max(1, officeRecordListPage), totalPages);
    const pageStart = (officeRecordListPage - 1) * officeRecordPageSize;
    const pagedRows = visibleRows.slice(pageStart, pageStart + officeRecordPageSize);
    const modalRecord = normalizeOfficeRecord(officeRecords[getOfficeRecordIndex(officeRecordEditingId)] || {
      type: officeRecordActiveType,
      project: '',
      date: getTodayCode(),
      target: '',
      tableColumns: [...officeDefaultTableColumns],
      tableRows: createOfficeDefaultTableRows(),
    });
    const modalDialogContentWidth = getOfficeDialogContentWidth(modalRecord.tableColumns.length, modalRecord.type === 'sampling');
    return `
      <section class="biz-office-page">
        <section class="business-panel biz-office-table-panel">
          <div class="biz-formula-table-head biz-office-table-head">
            <div class="biz-formula-table-actions biz-office-table-actions">
              <div class="biz-office-tabs" role="tablist" aria-label="办事记录板块" data-office-active-type="${esc(officeRecordActiveType)}">
                ${Object.entries(officeRecordSections).map(([type, label]) => `
                  <button class="${type === officeRecordActiveType ? 'is-active' : ''}" type="button" data-office-type="${esc(type)}">${esc(label)}</button>
                `).join('')}
              </div>
              ${renderSearchBox({
                className: 'biz-formula-table-search biz-office-search',
                placeholder: '搜索客户、列名、单元格内容',
                value: officeRecordSearchQuery,
                attributes: { 'data-office-search': '' },
              })}
              <button class="biz-formula-new-btn" type="button" data-office-new>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新建</span>
              </button>
            </div>
          </div>
          <div class="biz-office-record-list" data-office-list-key="${esc(JSON.stringify([officeRecordActiveType, officeRecordSearchQuery, officeRecordListPage, officeRecordPageSize]))}">
            ${pagedRows.length ? pagedRows.map(renderOfficeRecordCard).join('') : `
              <div class="biz-office-empty-list">
                <i class="ti ti-clipboard-list" aria-hidden="true"></i>
                <strong>暂无办事记录</strong>
                <span>点击右上角新建${esc(getOfficeRecordLabel())}</span>
              </div>
            `}
          </div>
          <div class="biz-formula-pagination biz-office-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-office-page-size aria-label="办事记录每页条数">${officePageSizeOptions.map((n) => `
                  <option value="${n}" ${n === officeRecordPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-office-page-prev ${officeRecordListPage <= 1 ? 'disabled' : ''} aria-label="办事记录上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${officeRecordListPage} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-office-page-next ${officeRecordListPage >= totalPages ? 'disabled' : ''} aria-label="办事记录下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${renderOfficeDetails()}
        ${officeRecordModalOpen ? `
          <div class="biz-office-modal dialog-overlay" data-office-modal>
            <div class="biz-inventory-material-dialog biz-office-dialog dialog-card" style="--biz-office-dialog-content-width:${modalDialogContentWidth}px" role="dialog" aria-modal="true" aria-labelledby="officeRecordModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="officeRecordModalTitle">${officeRecordEditingId ? `编辑${esc(getOfficeRecordLabel(modalRecord.type))}` : `新建${esc(getOfficeRecordLabel())}`}</h2>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭办事记录弹窗" data-office-close>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-office-editor">
                <label class="is-wide">
                  <span>客户/项目 <em class="biz-office-required">*</em></span>
                  <input type="text" value="${esc(modalRecord.project)}" placeholder="客户名称或内部项目" data-office-field="project" aria-required="true">
                </label>
                <label class="is-wide">
                  <span>目标/用途</span>
                  <input type="text" value="${esc(modalRecord.target)}" placeholder="打样用途、配色目标或客户要求" data-office-field="target">
                </label>
                ${renderOfficeEditableTable(modalRecord)}
                <div class="biz-inventory-modal-actions biz-office-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-office-cancel>取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-office-save>保存记录</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </section>
    `;
  };

const getAshRecordIndex = (id) => ashRecords.findIndex((record) => record.id === id);

const persistAshRecords = (note = '灰份记录已保存') => {
    ashRecordDraftNote = note;
    utils.writeJson(ASH_RECORD_STORAGE_KEY, ashRecords);
  };

const getAshFilledRows = (record) => (record.rows || []).filter((row) => (
    ashRecordFields.some(([key]) => String(row[key] || '').trim())
  ));

const renderAshMeasurementTable = (record) => renderOfficeTableSummary({
    id: record.id,
    type: 'ash',
    tableColumns: [officeFixedIndexColumn, ...ashRecordFields.map(([, label]) => label)],
    tableRows: getAshFilledRows(record).map((row, rowIndex) => [
      String(rowIndex + 1),
      ...ashRecordFields.map(([key]) => row[key]),
    ]),
    customerApprovedRows: [],
  });

const renderAshRecordCard = (record) => `
    <article class="biz-office-record-card biz-ash-card" data-ash-view="${esc(record.id)}">
      <div class="biz-office-record-top">
        <button type="button" class="biz-office-card-open" data-ash-view="${esc(record.id)}" aria-haspopup="dialog">
          <strong>${esc(record.name || '未填写名称')}</strong>
          <span class="biz-office-card-summary">${esc(record.date || '--')}${record.batch ? ` · ${esc(record.batch)}` : ''} · ${getAshFilledRows(record).length} 条明细</span>
          <span class="biz-office-card-hint">查看详细数据</span>
        </button>
        <div class="biz-office-record-actions">
          <button type="button" data-ash-edit="${esc(record.id)}" aria-label="编辑${esc(record.id)}">
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
          <button class="is-danger" type="button" data-ash-delete="${esc(record.id)}" aria-label="删除${esc(record.id)}">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </article>
  `;

const renderAshEditableRows = (record) => `
    <section class="biz-office-detail-table biz-ash-detail-table is-wide">
      <div class="biz-office-detail-head">
        <div><strong>检测明细</strong></div>
        <div class="biz-office-detail-actions">
          <button type="button" data-ash-add-row><i class="ti ti-row-insert-bottom" aria-hidden="true"></i><span>加行</span></button>
        </div>
      </div>
      <div class="biz-office-detail-scroll">
        <table>
          <colgroup>
            <col class="biz-ash-index-column">
            ${ashRecordFields.map(() => '<col>').join('')}
            <col class="biz-ash-action-column">
          </colgroup>
          <thead>
            <tr>
              <th>编号</th>
              ${ashRecordFields.map(([, label]) => `<th>${esc(label)}</th>`).join('')}
              <th class="biz-office-row-action-head">操作</th>
            </tr>
          </thead>
          <tbody>
            ${(record.rows || createAshDefaultRows()).map((row, rowIndex) => `
              <tr data-ash-row="${rowIndex}">
                <td><input class="biz-office-fixed-cell" type="text" value="${esc(rowIndex + 1)}" readonly data-ash-row-field="index"></td>
                ${ashRecordFields.map(([key, label]) => `
                  <td><input type="text" value="${esc(row[key] || '')}" data-ash-row-field="${esc(key)}" aria-label="第${rowIndex + 1}行${esc(label)}" ${key === 'residueMaterialWeight' || key === 'content' ? 'readonly class="biz-office-fixed-cell"' : ''}></td>
                `).join('')}
                <td class="biz-office-row-action-cell">
                  <button type="button" data-ash-remove-row="${rowIndex}" aria-label="删除第${rowIndex + 1}行" ${(record.rows || []).length <= 1 ? 'disabled' : ''}>
                    <i class="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

const getAshRecordFormRecord = () => {
    const root = refs.businessPageContent;
    const read = (field) => String(root?.querySelector(`[data-ash-field="${field}"]`)?.value || '').trim();
    const editingRecord: any = ashRecords[getAshRecordIndex(ashRecordEditingId)] || {};
    const rows = [...(root?.querySelectorAll('[data-ash-row]') || [])].map((row, rowIndex) => {
      const item = { index: String(rowIndex + 1) };
      ashRecordFields.forEach(([key]) => {
        item[key] = String(row.querySelector(`[data-ash-row-field="${key}"]`)?.value || '').trim();
      });
      return item;
    });
    return normalizeAshRecord({
      ...editingRecord,
      id: editingRecord.id || `ASH-${getTodayCode().replace(/-/g, '')}-${String(ashRecords.length + 1).padStart(2, '0')}`,
      date: read('date') || getTodayCode(),
      name: read('name'),
      batch: read('batch'),
      rows,
      updatedAt: new Date().toISOString(),
    });
  };

const saveAshRecord = () => {
    const record = getAshRecordFormRecord();
    const hasRowContent = record.rows.some((row) => ashRecordFields.some(([key]) => String(row[key] || '').trim()));
    if (!record.name || !hasRowContent) {
      ashRecordDraftNote = '请填写名称，并至少录入一行检测明细';
      notifyAction(ashRecordDraftNote, 'warn', 'ash-record-required-fields');
      return false;
    }
    const index = getAshRecordIndex(ashRecordEditingId);
    if (index >= 0) {
      ashRecords[index] = record;
      persistAshRecords(`已更新灰份记录 ${record.id} · ${getTimeCode()}`);
      notifyAction(`已保存灰份记录 ${record.id}`, 'success', `ash-record-save:${record.id}`);
      return true;
    }
    ashRecords.unshift(record);
    persistAshRecords(`已新增灰份记录 ${record.id} · ${getTimeCode()}`);
    notifyAction(`已新增灰份记录 ${record.id}`, 'success', `ash-record-save:${record.id}`);
    return true;
  };

const deleteAshRecord = async (id) => {
    const index = getAshRecordIndex(id);
    if (index < 0) return;
    const record = ashRecords[index];
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除灰份记录',
      message: `确定删除 ${record.name || record.id} 的灰份记录？`,
      confirmText: '删除记录',
    });
    if (!confirmed) return;
    ashRecords.splice(index, 1);
    persistAshRecords(`已删除灰份记录 ${id} · ${getTimeCode()}`);
    notifyAction(`已删除灰份记录 ${id}`, 'success', `ash-record-delete:${id}`);
  };

const renderAshRecords = () => {
    const visibleRows = ashRecords.filter((record) => {
      const haystack = [
        record.id,
        record.date,
        record.name,
        record.batch,
        ...(record.rows || []).flatMap((row) => [row.index, ...ashRecordFields.map(([key]) => row[key])]),
      ].join(' ').toLowerCase();
      return haystack.includes(ashRecordSearchQuery.toLowerCase());
    });
    const totalPages = Math.max(1, Math.ceil(visibleRows.length / ashRecordPageSize));
    ashRecordListPage = Math.min(Math.max(1, ashRecordListPage), totalPages);
    const pageStart = (ashRecordListPage - 1) * ashRecordPageSize;
    const pagedRows = visibleRows.slice(pageStart, pageStart + ashRecordPageSize);
    const modalRecord = normalizeAshRecord(ashRecords[getAshRecordIndex(ashRecordEditingId)] || {
      date: getTodayCode(),
      name: '',
      batch: '',
      rows: createAshDefaultRows(),
    });
    return `
      <section class="biz-office-page biz-ash-page">
        <section class="business-panel biz-office-table-panel">
          <div class="biz-formula-table-head biz-office-table-head">
            <div class="biz-formula-table-actions biz-office-table-actions">
              <div class="biz-office-tabs" role="tablist" aria-label="办事记录板块" data-office-active-type="${esc(officeRecordActiveType)}">
                ${Object.entries(officeRecordSections).map(([type, label]) => `
                  <button class="${type === officeRecordActiveType ? 'is-active' : ''}" type="button" data-office-type="${esc(type)}">${esc(label)}</button>
                `).join('')}
              </div>
              ${renderSearchBox({
                className: 'biz-formula-table-search biz-office-search',
                placeholder: '搜索日期、名称、批次、检测数值',
                value: ashRecordSearchQuery,
                attributes: { 'data-ash-search': '' },
              })}
              <button class="biz-formula-new-btn" type="button" data-ash-new>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新建</span>
              </button>
            </div>
          </div>
          <div class="biz-office-record-list" data-office-list-key="${esc(JSON.stringify(['ash', ashRecordSearchQuery, ashRecordListPage, ashRecordPageSize]))}">
            ${pagedRows.length ? pagedRows.map(renderAshRecordCard).join('') : `
              <div class="biz-office-empty-list">
                <i class="ti ti-clipboard-list" aria-hidden="true"></i>
                <strong>暂无灰份记录</strong>
                <span>点击上方新建灰份记录</span>
              </div>
            `}
          </div>
          <div class="biz-formula-pagination biz-office-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-ash-page-size aria-label="灰份记录每页条数">${officePageSizeOptions.map((n) => `
                  <option value="${n}" ${n === ashRecordPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-ash-page-prev ${ashRecordListPage <= 1 ? 'disabled' : ''} aria-label="灰份记录上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${ashRecordListPage} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-ash-page-next ${ashRecordListPage >= totalPages ? 'disabled' : ''} aria-label="灰份记录下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${renderOfficeDetails()}
        ${ashRecordModalOpen ? `
          <div class="biz-office-modal dialog-overlay" data-ash-modal>
            <div class="biz-inventory-material-dialog biz-office-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="ashRecordModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="ashRecordModalTitle">${ashRecordEditingId ? '编辑灰份记录' : '新建灰份记录'}</h2>
                  <span>${esc(ashRecordDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭灰份记录弹窗" data-ash-close>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-office-editor">
                <label>
                  <span>名称 *</span>
                  <input type="text" value="${esc(modalRecord.name)}" placeholder="样品名称" data-ash-field="name">
                </label>
                <label>
                  <span>日期</span>
                  <input type="date" value="${esc(modalRecord.date)}" data-ash-field="date">
                </label>
                <label class="is-wide">
                  <span>批次</span>
                  <input type="text" value="${esc(modalRecord.batch)}" placeholder="批次或备注批号" data-ash-field="batch">
                </label>
                ${renderAshEditableRows(modalRecord)}
                <div class="biz-inventory-modal-actions biz-office-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-ash-cancel>取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-ash-save>保存记录</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </section>
    `;
  };

const syncAshDerivedFields = (row) => {
    if (!row) return;
    const getInput = (field) => row.querySelector(`[data-ash-row-field="${field}"]`);
    const next = calculateAshDerivedRow({
      cupWeight: getInput('cupWeight')?.value || '',
      materialWeight: getInput('materialWeight')?.value || '',
      residueWeight: getInput('residueWeight')?.value || '',
      residueMaterialWeight: getInput('residueMaterialWeight')?.value || '',
      content: getInput('content')?.value || '',
    });
    const residueInput = getInput('residueMaterialWeight');
    const contentInput = getInput('content');
    if (residueInput) residueInput.value = next.residueMaterialWeight || '';
    if (contentInput) contentInput.value = next.content || '';
  };

const syncOfficeDetailTableControls = (table) => {
    if (!table) return;
    const columnFields = [...table.querySelectorAll('[data-office-table-column]')];
    const rows = [...table.querySelectorAll('[data-office-table-row]')];
    const columnCount = columnFields.length;
    const dialog = table.closest('.biz-office-dialog');
    dialog?.style.setProperty(
      '--biz-office-dialog-content-width',
      `${getOfficeDialogContentWidth(columnCount, Boolean(table.querySelector('.biz-office-row-approval-head')))}px`,
    );
    addOfficeSortHandles(table);
    columnFields.forEach((field, index) => {
      field.setAttribute('data-office-table-column', String(index));
      if (index === 0) {
        field.setAttribute('data-office-table-fixed', 'true');
        field.textContent = officeFixedIndexColumn;
      } else {
        field.setAttribute('aria-label', `第${index + 1}列列名`);
      }
      const removeButton = field.closest('th')?.querySelector('[data-office-remove-column]');
      if (removeButton) {
        removeButton.setAttribute('data-office-remove-column', String(index));
        removeButton.setAttribute('aria-label', `删除第${index + 1}列`);
        removeButton.disabled = index === 0 || columnCount <= 1;
      }
    });
    rows.forEach((row, rowIndex) => {
      row.setAttribute('data-office-table-row', String(rowIndex));
      [...row.querySelectorAll('[data-office-table-cell]')].forEach((input, columnIndex) => {
        input.setAttribute('data-office-table-cell', String(columnIndex));
        input.setAttribute('aria-label', `第${rowIndex + 1}行第${columnIndex + 1}列`);
      });
      const removeButton = row.querySelector('[data-office-remove-row]');
      if (removeButton) {
        removeButton.setAttribute('data-office-remove-row', String(rowIndex));
        removeButton.setAttribute('aria-label', `删除第${rowIndex + 1}行`);
        removeButton.disabled = rows.length <= 1;
      }
      const approvalInput = row.querySelector('[data-office-row-approved]');
      if (approvalInput) {
        approvalInput.setAttribute('data-office-row-approved', String(rowIndex));
        approvalInput.closest('label')?.setAttribute('title', `客户认可第${rowIndex + 1}条送样`);
      }
    });
  };

const createOfficeTableInput = (value = '', attrs = {} as any) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    Object.entries(attrs).forEach(([key, attrValue]) => input.setAttribute(key, String(attrValue)));
    return input;
  };

const createOfficeTableCell = (value = '', isFixedIndex = false) => {
    const cell = document.createElement('td');
    const input = createOfficeTableInput(value, { 'data-office-table-cell': '' });
    if (isFixedIndex) {
      input.readOnly = true;
      input.className = 'biz-office-fixed-cell';
    }
    cell.appendChild(input);
    return cell;
  };

const createOfficeEditableTableElement = () => {
    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>
            <div class="biz-office-column-field">
              <span class="biz-office-fixed-column" data-office-table-column="0" data-office-table-fixed="true">${officeFixedIndexColumn}</span>
            </div>
          </th>
          ${officeRecordActiveType === 'sampling' ? '<th class="biz-office-row-approval-head">客户认可</th>' : ''}
          <th class="biz-office-row-action-head">操作</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    return table;
  };

function render(pageId = 'office-records', def = {} as any) {
    if (pageId !== 'office-records' || !refs.businessPageContent) return;
    if (!def.officeOverlayExitComplete) {
      const overlay = (!officeRecordModalOpen ? refs.businessPageContent.querySelector('[data-office-modal]') : null) || (!ashRecordModalOpen ? refs.businessPageContent.querySelector('[data-ash-modal]') : null);
      if (overlay && deferOfficeOverlayClose(overlay, () => render(pageId, { officeOverlayExitComplete: true }))) return;
    }
    refs.businessPageContent.classList.add('biz-inventory-shell');
    refs.businessPageContent.closest('.business-page')?.classList.add('biz-inventory-active');
    const restoreScroll = captureOfficeListScroll(refs.businessPageContent);
    refs.businessPageContent.innerHTML = decorateOfficeMarkup(renderOfficeRecords());
    if (App.permissions?.canCurrentUserEditPage?.('office-records') !== true) {
      refs.businessPageContent.querySelectorAll(mutationControls).forEach((button: HTMLButtonElement) => { button.disabled = true; button.title = '当前账户只有读取权限'; });
    }
    refs.businessPageContent.querySelectorAll('[data-office-details-overlay], [data-office-modal], [data-ash-modal]').forEach((overlay: HTMLElement) => mountOfficeDetailsOverlay(overlay));
    refs.businessPageContent.querySelectorAll('.biz-office-detail-scroll table:has([data-office-table-column])').forEach(syncOfficeDetailTableControls);
    App.customSelects?.enhanceAll?.(refs.businessPageContent);
    restoreScroll();
  }

const refreshFromLocalStorage = (changedKeys = []) => {
    if (changedKeys.length && !changedKeys.some(key => key === OFFICE_RECORD_STORAGE_KEY || key === ASH_RECORD_STORAGE_KEY)) return;
    officeRecords.splice(0, officeRecords.length, ...normalizeOfficeRecords(utils.readJson(OFFICE_RECORD_STORAGE_KEY, null)));
    ashRecords.splice(0, ashRecords.length, ...normalizeAshRecords(utils.readJson(ASH_RECORD_STORAGE_KEY, null)));
    if (refs.placeholderPageSection?.classList.contains('active')) render('office-records');
  };

const restoreSearchInputState = (selector, value, selectionStart = value.length, selectionEnd = selectionStart) => {
    requestAnimationFrame(() => {
      const searchInput = refs.businessPageContent?.querySelector(selector);
      if (!(searchInput instanceof HTMLInputElement)) return;
      searchInput.focus();
      searchInput.setSelectionRange(selectionStart, selectionEnd);
    });
  };

const handleOfficeInput = (event) => {
if (!(event.target instanceof Element)) return;
if (event.target.matches('select')) return;
if (event.target.hasAttribute('data-office-search')) {
      officeRecordSearchQuery = event.target.value;
      officeRecordListPage = 1;
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? officeRecordSearchQuery.length) : officeRecordSearchQuery.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender(
        'office-records',
        () => restoreSearchInputState('[data-office-search]', officeRecordSearchQuery, selectionStart, selectionEnd),
      );
      return;
    }
if (event.target.hasAttribute('data-ash-search')) {
      ashRecordSearchQuery = event.target.value;
      ashRecordListPage = 1;
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? ashRecordSearchQuery.length) : ashRecordSearchQuery.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender(
        'office-records',
        () => restoreSearchInputState('[data-ash-search]', ashRecordSearchQuery, selectionStart, selectionEnd),
      );
      return;
    }
if (event.target.hasAttribute('data-ash-row-field')) {
      const field = event.target.getAttribute('data-ash-row-field');
      if (field === 'cupWeight' || field === 'materialWeight' || field === 'residueWeight') {
        syncAshDerivedFields(event.target.closest('[data-ash-row]'));
      }
      return;
    }
};

const handleOfficeCompositionend = (event) => {
if (!(event.target instanceof HTMLInputElement)) return;
if (event.target.hasAttribute('data-office-search')) {
      officeRecordSearchQuery = event.target.value;
      officeRecordListPage = 1;
      const selectionStart = event.target.selectionStart ?? officeRecordSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('office-records');
      restoreSearchInputState('[data-office-search]', officeRecordSearchQuery, selectionStart, selectionEnd);
      return;
    }
if (event.target.hasAttribute('data-ash-search')) {
      ashRecordSearchQuery = event.target.value;
      ashRecordListPage = 1;
      const selectionStart = event.target.selectionStart ?? ashRecordSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('office-records');
      restoreSearchInputState('[data-ash-search]', ashRecordSearchQuery, selectionStart, selectionEnd);
      return;
    }
};

const handleOfficeChange = (event) => {
if (!(event.target instanceof Element)) return;
if (event.target.hasAttribute('data-office-page-size')) {
      officeRecordPageSize = Number(event.target.value) || 10;
      officeRecordListPage = 1;
      render('office-records');
      return;
    }
if (event.target.hasAttribute('data-ash-page-size')) {
      ashRecordPageSize = Number(event.target.value) || 10;
      ashRecordListPage = 1;
      render('office-records');
      return;
    }
};

const handleOfficeClick = async (event) => {
if (!(event.target instanceof Element)) return;
if (event.target.closest(mutationControls) && App.permissions?.canCurrentUserEditPage?.('office-records') !== true) return;
const datePickerTrigger = event.target.closest('[data-date-picker-trigger]');
if (datePickerTrigger && refs.businessPageContent.contains(datePickerTrigger)) {
      const input = datePickerTrigger.querySelector('input[type="date"]');
      if (input && event.target !== input) {
        event.preventDefault();
        input.focus({ preventScroll: true });
        try {
          if (typeof input.showPicker === 'function') {
            input.showPicker();
          } else {
            input.click();
          }
        } catch {
          input.click();
        }
      }
      return;
    }
const officeTypeButton = event.target.closest('[data-office-type]');
if (officeTypeButton && refs.businessPageContent.contains(officeTypeButton)) {
      const type = officeTypeButton.getAttribute('data-office-type') || 'sampling';
      if (officeRecordSections[type]) {
        if (type === officeRecordActiveType) return;
        officeRecordActiveType = type;
        officeRecordSearchQuery = '';
        ashRecordSearchQuery = '';
        officeRecordListPage = 1;
        ashRecordListPage = 1;
        officeRecordModalOpen = false;
        officeRecordEditingId = '';
        ashRecordModalOpen = false;
        ashRecordEditingId = '';
        const tabs = officeTypeButton.closest('.biz-office-tabs');
        tabs?.setAttribute('data-office-active-type', type);
        tabs?.querySelectorAll('[data-office-type]').forEach((button) => {
          button.classList.toggle('is-active', button.getAttribute('data-office-type') === type);
        });
        window.setTimeout(() => render('office-records'), 220);
      }
      return;
    }
const officePagePrev = event.target.closest('[data-office-page-prev]');
if (officePagePrev && refs.businessPageContent.contains(officePagePrev) && !officePagePrev.disabled) {
      officeRecordListPage -= 1;
      render('office-records');
      return;
    }
const officePageNext = event.target.closest('[data-office-page-next]');
if (officePageNext && refs.businessPageContent.contains(officePageNext) && !officePageNext.disabled) {
      officeRecordListPage += 1;
      render('office-records');
      return;
    }
const officeAddColumnButton = event.target.closest('[data-office-add-column]');
if (officeAddColumnButton && refs.businessPageContent.contains(officeAddColumnButton)) {
      const detailTable = officeAddColumnButton.closest('.biz-office-detail-table');
      const scroll = detailTable?.querySelector('.biz-office-detail-scroll');
      let table = detailTable?.querySelector('table');
      if (!table && scroll) {
        scroll.innerHTML = '';
        table = createOfficeEditableTableElement();
        scroll.appendChild(table);
      }
      const headerRow = table?.querySelector('thead tr');
      const actionHead = headerRow?.querySelector('.biz-office-row-action-head');
      if (table && headerRow && actionHead) {
        const columnCount = table.querySelectorAll('[data-office-table-column]').length;
        const headerCell = document.createElement('th');
        const field = document.createElement('div');
        field.className = 'biz-office-column-field';
        field.appendChild(createOfficeTableInput('', { 'data-office-table-column': columnCount, placeholder: '填写列名' }));
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.setAttribute('data-office-remove-column', String(columnCount));
        removeButton.setAttribute('aria-label', `删除第${columnCount + 1}列`);
        removeButton.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        field.appendChild(removeButton);
        headerCell.appendChild(field);
        const trailingHead = headerRow.querySelector('.biz-office-row-approval-head') || actionHead;
        headerRow.insertBefore(headerCell, trailingHead);
        table.querySelectorAll('tbody tr').forEach((row) => {
          const trailingCell = row.querySelector('.biz-office-row-approval-cell') || row.querySelector('.biz-office-row-action-cell');
          row.insertBefore(createOfficeTableCell(''), trailingCell);
        });
        syncOfficeDetailTableControls(table);
      }
      return;
    }
const officeRemoveColumnButton = event.target.closest('[data-office-remove-column]');
if (officeRemoveColumnButton && refs.businessPageContent.contains(officeRemoveColumnButton) && !officeRemoveColumnButton.disabled) {
      const table = officeRemoveColumnButton.closest('table');
      const columnIndex = Number(officeRemoveColumnButton.getAttribute('data-office-remove-column') || 0);
      if (columnIndex === 0) return;
      const headerCell = officeRemoveColumnButton.closest('th');
      if (table && headerCell) {
        headerCell.remove();
        table.querySelectorAll('tbody tr').forEach((row) => {
          const cells = [...row.querySelectorAll('td:not(.biz-office-row-action-cell):not(.biz-office-row-approval-cell)')];
          cells[columnIndex]?.remove();
        });
        syncOfficeDetailTableControls(table);
      }
      return;
    }
const officeAddRowButton = event.target.closest('[data-office-add-row]');
if (officeAddRowButton && refs.businessPageContent.contains(officeAddRowButton)) {
      const table = officeAddRowButton.closest('.biz-office-detail-table')?.querySelector('table');
      const tbody = table?.querySelector('tbody');
      if (table && tbody) {
        const columnCount = table.querySelectorAll('[data-office-table-column]').length;
        if (!columnCount) {
          notifyAction('请先添加列，再添加明细行', 'warn', 'office-table-column-required');
          return;
        }
        const row = document.createElement('tr');
        row.setAttribute('data-office-table-row', '');
        for (let index = 0; index < columnCount; index += 1) {
          row.appendChild(createOfficeTableCell(index === 0 ? String(tbody.querySelectorAll('tr').length + 1) : '', index === 0));
        }
        if (officeRecordActiveType === 'sampling') {
          const approvalCell = document.createElement('td');
          approvalCell.className = 'biz-office-row-approval-cell';
          const approvalField = document.createElement('label');
          approvalField.className = 'biz-office-row-approval-field';
          approvalField.title = '客户认可该条送样';
          approvalField.innerHTML = '<input type="checkbox" data-office-row-approved><span>认可</span>';
          approvalCell.appendChild(approvalField);
          row.appendChild(approvalCell);
        }
        const actionCell = document.createElement('td');
        actionCell.className = 'biz-office-row-action-cell';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.setAttribute('data-office-remove-row', '');
        removeButton.setAttribute('aria-label', '删除行');
        removeButton.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
        actionCell.appendChild(removeButton);
        row.appendChild(actionCell);
        tbody.appendChild(row);
        syncOfficeDetailTableControls(table);
      }
      return;
    }
const officeRemoveRowButton = event.target.closest('[data-office-remove-row]');
if (officeRemoveRowButton && refs.businessPageContent.contains(officeRemoveRowButton) && !officeRemoveRowButton.disabled) {
      const table = officeRemoveRowButton.closest('table');
      officeRemoveRowButton.closest('tr')?.remove();
      syncOfficeDetailTableControls(table);
      return;
    }
const detailsOrientation = event.target.closest('[data-office-details-orientation]') as HTMLButtonElement | null;
if (detailsOrientation) {
      const overlay = detailsOrientation.closest('[data-office-details-overlay]') as HTMLElement | null;
      if (overlay) toggleOfficeDetailsOrientation(overlay, detailsOrientation);
      return;
    }
const detailsClose = event.target.closest('[data-office-details-close]');
const detailsOverlay = event.target.closest('[data-office-details-overlay]');
if (detailsClose || (detailsOverlay && event.target === detailsOverlay)) {
      const id = officeDetailsId;
      const kind = officeDetailsKind;
      officeDetailsId = '';
      render('office-records');
      (Array.from(refs.businessPageContent?.querySelectorAll('.biz-office-card-open') || []) as HTMLButtonElement[]).find((button) => button.getAttribute(kind === 'ash' ? 'data-ash-view' : 'data-office-view') === id)?.focus({ preventScroll: true });
      return;
    }
const detailsCard = event.target.closest('[data-office-view], [data-ash-view]');
if (detailsCard && !event.target.closest('[data-office-edit], [data-office-delete], [data-ash-edit], [data-ash-delete]')) {
      officeDetailsKind = detailsCard.hasAttribute('data-ash-view') ? 'ash' : 'office';
      officeDetailsId = detailsCard.getAttribute(officeDetailsKind === 'ash' ? 'data-ash-view' : 'data-office-view') || '';
      render('office-records');
      refs.businessPageContent?.querySelector('[data-office-details-close]')?.focus({ preventScroll: true });
      return;
    }
const officeNewButton = event.target.closest('[data-office-new]');
if (officeNewButton && refs.businessPageContent.contains(officeNewButton)) {
      officeRecordEditingId = '';
      officeRecordDraftNote = `正在新建${getOfficeRecordLabel()}`;
      officeRecordModalOpen = true;
      render('office-records');
      refs.businessPageContent?.querySelector('[data-office-field="project"]')?.focus({ preventScroll: true });
      return;
    }
const officeEditButton = event.target.closest('[data-office-edit]');
if (officeEditButton && refs.businessPageContent.contains(officeEditButton)) {
      officeRecordEditingId = officeEditButton.getAttribute('data-office-edit') || '';
      const record = officeRecords[getOfficeRecordIndex(officeRecordEditingId)];
      if (record?.type && officeRecordTypes[record.type]) officeRecordActiveType = record.type;
      officeRecordDraftNote = `正在编辑${getOfficeRecordLabel(record?.type)} ${officeRecordEditingId}`;
      officeRecordModalOpen = true;
      render('office-records');
      refs.businessPageContent?.querySelector('[data-office-field="project"]')?.focus({ preventScroll: true });
      return;
    }
const officeDeleteButton = event.target.closest('[data-office-delete]');
if (officeDeleteButton && refs.businessPageContent.contains(officeDeleteButton)) {
      await deleteOfficeRecord(officeDeleteButton.getAttribute('data-office-delete'));
      render('office-records');
      return;
    }
const officeToggleRowApprovalButton = event.target.closest('[data-office-toggle-row-approval]');
if (officeToggleRowApprovalButton && refs.businessPageContent.contains(officeToggleRowApprovalButton)) {
      const recordId = officeToggleRowApprovalButton.getAttribute('data-office-toggle-row-approval');
      const rowIndex = Number(officeToggleRowApprovalButton.getAttribute('data-office-row-index'));
      const nextApproved = toggleOfficeRecordRowApproval(recordId, rowIndex);
      if (typeof nextApproved !== 'boolean') return;
      officeToggleRowApprovalButton.classList.toggle('is-approved', nextApproved);
      officeToggleRowApprovalButton.textContent = nextApproved ? '已认可' : '待确认';
      const record = officeRecords[getOfficeRecordIndex(recordId)];
      const approvalBadge = officeToggleRowApprovalButton.closest('.biz-office-record-card')?.querySelector('.biz-office-approval-badge');
      if (record && approvalBadge) {
        const approvedCount = record.customerApprovedRows?.length || 0;
        approvalBadge.textContent = `已认可 ${approvedCount}/${getOfficeTableFilledRows(record).length}`;
        approvalBadge.classList.toggle('is-approved', approvedCount > 0);
        approvalBadge.classList.toggle('is-pending', approvedCount === 0);
      }
      return;
    }
const officeSaveButton = event.target.closest('[data-office-save]');
if (officeSaveButton && refs.businessPageContent.contains(officeSaveButton)) {
      const saved = saveOfficeRecord();
      officeRecordModalOpen = !saved;
      if (saved) officeRecordEditingId = '';
      render('office-records');
      return;
    }
const officeCloseButton = event.target.closest('[data-office-close], [data-office-cancel]');
if (officeCloseButton && refs.businessPageContent.contains(officeCloseButton)) {
      officeRecordEditingId = '';
      officeRecordDraftNote = '已取消办事记录编辑';
      officeRecordModalOpen = false;
      render('office-records');
      return;
    }
const officeModal = event.target.closest('[data-office-modal]');
if (officeModal && event.target === officeModal) {
      officeRecordEditingId = '';
      officeRecordModalOpen = false;
      render('office-records');
      return;
    }
const ashPagePrev = event.target.closest('[data-ash-page-prev]');
if (ashPagePrev && refs.businessPageContent.contains(ashPagePrev) && !ashPagePrev.disabled) {
      ashRecordListPage -= 1;
      render('office-records');
      return;
    }
const ashPageNext = event.target.closest('[data-ash-page-next]');
if (ashPageNext && refs.businessPageContent.contains(ashPageNext) && !ashPageNext.disabled) {
      ashRecordListPage += 1;
      render('office-records');
      return;
    }
const ashAddRowButton = event.target.closest('[data-ash-add-row]');
if (ashAddRowButton && refs.businessPageContent.contains(ashAddRowButton)) {
      const tbody = ashAddRowButton.closest('.biz-ash-detail-table')?.querySelector('tbody');
      if (tbody) {
        const rowIndex = tbody.querySelectorAll('[data-ash-row]').length;
        const row = document.createElement('tr');
        row.setAttribute('data-ash-row', String(rowIndex));
        row.innerHTML = `
          <td><input class="biz-office-fixed-cell" type="text" value="${rowIndex + 1}" readonly data-ash-row-field="index"></td>
          ${ashRecordFields.map(([key, label]) => `
            <td><input type="text" value="" data-ash-row-field="${key}" aria-label="第${rowIndex + 1}行${label}" ${key === 'residueMaterialWeight' || key === 'content' ? 'readonly class="biz-office-fixed-cell"' : ''}></td>
          `).join('')}
          <td class="biz-office-row-action-cell">
            <button type="button" data-ash-remove-row="${rowIndex}" aria-label="删除第${rowIndex + 1}行">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </td>
        `;
        tbody.appendChild(row);
        tbody.querySelectorAll('[data-ash-row]').forEach((item, index) => {
          item.setAttribute('data-ash-row', String(index));
          item.querySelector('[data-ash-row-field="index"]').value = String(index + 1);
          const removeButton = item.querySelector('[data-ash-remove-row]');
          if (removeButton) {
            removeButton.setAttribute('data-ash-remove-row', String(index));
            removeButton.setAttribute('aria-label', `删除第${index + 1}行`);
            removeButton.disabled = tbody.querySelectorAll('[data-ash-row]').length <= 1;
          }
        });
      }
      return;
    }
const ashRemoveRowButton = event.target.closest('[data-ash-remove-row]');
if (ashRemoveRowButton && refs.businessPageContent.contains(ashRemoveRowButton) && !ashRemoveRowButton.disabled) {
      const tbody = ashRemoveRowButton.closest('tbody');
      ashRemoveRowButton.closest('tr')?.remove();
      tbody?.querySelectorAll('[data-ash-row]').forEach((item, index) => {
        item.setAttribute('data-ash-row', String(index));
        item.querySelector('[data-ash-row-field="index"]').value = String(index + 1);
        const removeButton = item.querySelector('[data-ash-remove-row]');
        if (removeButton) {
          removeButton.setAttribute('data-ash-remove-row', String(index));
          removeButton.setAttribute('aria-label', `删除第${index + 1}行`);
          removeButton.disabled = tbody.querySelectorAll('[data-ash-row]').length <= 1;
        }
      });
      return;
    }
const ashNewButton = event.target.closest('[data-ash-new]');
if (ashNewButton && refs.businessPageContent.contains(ashNewButton)) {
      ashRecordEditingId = '';
      ashRecordDraftNote = '正在新建灰份记录';
      ashRecordModalOpen = true;
      render('office-records');
      refs.businessPageContent?.querySelector('[data-ash-field="name"]')?.focus();
      return;
    }
const ashEditButton = event.target.closest('[data-ash-edit]');
if (ashEditButton && refs.businessPageContent.contains(ashEditButton)) {
      ashRecordEditingId = ashEditButton.getAttribute('data-ash-edit') || '';
      ashRecordDraftNote = `正在编辑灰份记录 ${ashRecordEditingId}`;
      ashRecordModalOpen = true;
      render('office-records');
      refs.businessPageContent?.querySelector('[data-ash-field="name"]')?.focus();
      return;
    }
const ashDeleteButton = event.target.closest('[data-ash-delete]');
if (ashDeleteButton && refs.businessPageContent.contains(ashDeleteButton)) {
      await deleteAshRecord(ashDeleteButton.getAttribute('data-ash-delete'));
      render('office-records');
      return;
    }
const ashSaveButton = event.target.closest('[data-ash-save]');
if (ashSaveButton && refs.businessPageContent.contains(ashSaveButton)) {
      const saved = saveAshRecord();
      ashRecordModalOpen = !saved;
      if (saved) ashRecordEditingId = '';
      render('office-records');
      return;
    }
const ashCloseButton = event.target.closest('[data-ash-close], [data-ash-cancel]');
if (ashCloseButton && refs.businessPageContent.contains(ashCloseButton)) {
      ashRecordEditingId = '';
      ashRecordDraftNote = '已取消灰份记录编辑';
      ashRecordModalOpen = false;
      render('office-records');
      return;
    }
const ashModal = event.target.closest('[data-ash-modal]');
if (ashModal && event.target === ashModal) {
      ashRecordEditingId = '';
      ashRecordModalOpen = false;
      render('office-records');
      return;
    }
};

const handleOfficeKeydown = (event) => {
if (!(event.target instanceof Element)) return;
if (officeDetailsId) {
      if (event.key === 'Escape') {
        event.preventDefault();
        refs.businessPageContent?.querySelector('[data-office-details-close]')?.click();
        return;
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(refs.businessPageContent?.querySelectorAll('.biz-office-details-dialog button:not(:disabled)') || []) as HTMLButtonElement[];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }
    }
if (event.key === 'Escape' && officeRecordModalOpen) {
      officeRecordEditingId = '';
      officeRecordModalOpen = false;
      render('office-records');
      return;
    }
if (event.key === 'Escape' && ashRecordModalOpen) {
      ashRecordEditingId = '';
      ashRecordModalOpen = false;
      render('office-records');
      return;
    }
};

let officeSortCleanup: (() => void) | undefined;

let eventController: AbortController | undefined;

const initOffice = () => {
    eventController?.abort(); officeSortCleanup?.();
    const target = refs.businessPageContent;
    if (!target) return;
    eventController = new AbortController();
    const options = { signal: eventController.signal };
    officeSortCleanup = bindOfficeTableSort(target, syncOfficeDetailTableControls);
    target.addEventListener('click', handleOfficeClick, options);
    target.addEventListener('keydown', handleOfficeKeydown, options);
    target.addEventListener('input', handleOfficeInput, options);
    target.addEventListener('change', handleOfficeChange, options);
    target.addEventListener('compositionend', handleOfficeCompositionend, options);
  };

App.officeRecords = { init: initOffice, render, refreshFromLocalStorage, cleanup: () => {
    eventController?.abort();eventController = undefined;officeSortCleanup?.();officeSortCleanup = undefined;clearSearchTimer();
    officeRecordModalOpen = false; ashRecordModalOpen = false;officeDetailsId = '';
  }};
})();
