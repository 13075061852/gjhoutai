import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterRecords, filterSpectrumRecords, normalizeSpectrumRecords } from './data.mjs';
import { businessTools } from './tools.mjs';

const uploaded = [
  {
    id: 'upload-1',
    code: 'UPLOAD-20260722',
    title: '320G6-B1S A604201 FTIR',
    spectrumType: 'FTIR',
    category: '广俊',
    date: '2026-07-22',
    tags: ['320'],
    imageStored: true,
  },
  {
    id: 'upload-2',
    title: '320G6-B1S A604201 TGA',
    spectrumType: 'TGA',
    category: '广俊',
    date: '2026-05-30',
    tags: ['320'],
    imageStored: true,
  },
  {
    id: 'upload-3',
    title: '宝理 6300T DSC',
    spectrumType: 'dsc',
    category: '宝理',
    date: '2026-04-25',
    tags: '320, PBT',
    note: '',
  },
];

test('normalizes spectrum records and applies page edits without dropping fields', () => {
  const records = normalizeSpectrumRecords(uploaded, { 'upload-3': { tags: ['PBT'], note: '客诉复测' } });
  assert.equal(records.length, 3);
  assert.deepEqual(records[2], {
    id: 'upload-3',
    code: '',
    title: '宝理 6300T DSC',
    spectrumType: 'DSC',
    category: '宝理',
    date: '2026-04-25',
    tags: ['PBT'],
    note: '客诉复测',
    hasImage: false,
  });
  assert.equal(records[0].hasImage, true);
  assert.equal(normalizeSpectrumRecords(null, null).length, 0);
  assert.equal(normalizeSpectrumRecords([{ title: '无 id 记录' }], null).length, 1);
});

test('filters spectrum records by model keyword, type, category and tag', () => {
  const records = normalizeSpectrumRecords(uploaded, null);
  assert.equal(filterSpectrumRecords(records, { keyword: '320G6-B1S' }).length, 2);
  assert.equal(filterSpectrumRecords(records, { keyword: '320g6-b1s', type: 'ftir' }).length, 1);
  assert.equal(filterSpectrumRecords(records, { type: 'DSC' }).length, 1);
  assert.equal(filterSpectrumRecords(records, { category: '宝理' }).length, 1);
  assert.equal(filterSpectrumRecords(records, { tag: '320' }).length, 3);
  assert.equal(filterSpectrumRecords(records, { keyword: '不存在的东西' }).length, 0);
  assert.equal(filterSpectrumRecords(records, { keyword: 'A604201', limit: 1 }).length, 1);
});

test('registers the spectrum tool so the kernel can expose it to the model', () => {
  const names = businessTools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('list_spectrum_records'));
  const tool = businessTools.find((entry) => entry.name === 'list_spectrum_records');
  assert.equal(tool.label, '查询图谱记录');
  assert.match(tool.description, /FTIR/);
  assert.match(tool.description, /图谱分析/);
  assert.ok(tool.parameters.properties.keyword);
  assert.ok(tool.parameters.properties.type);
  assert.ok(tool.parameters.properties.category);
  assert.ok(tool.parameters.properties.tag);
});

test('exposes one tool per real page data domain and nothing else', () => {
  const names = businessTools.map((tool) => tool.name);
  assert.deepEqual([...names].sort(), [
    'data_overview',
    'list_ash_records',
    'list_inspection_reports',
    'list_office_records',
    'list_server_projects',
    'list_spectrum_records',
    'prepare_project_lifecycle',
    'query_property_rows',
    'query_report_ranges',
    'query_sheet_rows',
    'read_server_project',
    'read_spectrum_image',
  ]);
  const text = businessTools.map((tool) => `${tool.name} ${tool.description}`).join('\n');
  for (const absent of ['personnel', 'orders', 'suppliers', 'customers', 'inventory', 'formula_recipes', 'media_tasks', 'platform_users', 'recognition']) {
    assert.ok(!text.includes(absent), `dead module ${absent} must not be exposed`);
  }
  assert.match(businessTools.find((tool) => tool.name === 'list_ash_records').description, /办事记录/);
});

test('filters arbitrary record collections by keyword across nested values', () => {
  const items = [
    { id: 'OR-1', project: '定润PET换PBT', tableRows: [['1', '2026-9-19', '3kg']] },
    { id: 'OR-2', project: '天吉-配苹果白', tableRows: [['1', '2026-9-18', '4kg']] },
  ];
  assert.equal(filterRecords(items, { keyword: '定润' }).length, 1);
  assert.equal(filterRecords(items, { keyword: '3kg' }).length, 1);
  assert.equal(filterRecords(items, { keyword: '2026-9-18' }).length, 1);
  assert.equal(filterRecords(items, {}).length, 2);
  assert.equal(filterRecords(null, {}).length, 0);
});
