/**
 * 结构化业务查询 + 受控变更预览工具集。
 * 不接受任意 SQL，变更只能由用户在独立确认接口提交。
 */
import { Type } from 'typebox';
import { projectTools } from './project-tools.mjs';
import { businessWriteTools } from './write-tools.mjs';
import { spectrumImageTools, buildSpectrumListing } from './spectrum-tools.mjs';
import { createHash } from 'node:crypto';
const rowRef = (row) => `row-${createHash('sha256').update(JSON.stringify(row)).digest('hex')}`;
import {
  countRows,
  filterRows,
  getPropertyData,
  listAshRecords,
  listInspectionReports,
  listOfficeRecords,
  propertyFields,
  propertyRows,
  reportRanges,
  sheetNames,
  sheetRows,
  spectrumOverview,
  spectrumRecords,
} from './data.mjs';

import { config } from './config.mjs';

const MAX_TEXT_CHARS = 24_000;

/** 页面内可点击/可预览的同源地址（浏览器带 Cookie 直接访问）。 */
export const appUrl = (path) => `${config.appBasePath}${path}`;

const textResult = (value, details = {}) => {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
  if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}\n…（结果已截断，请缩小查询范围）`;
  return { content: [{ type: 'text', text }], details };
};

const failure = (message) => ({
  content: [{ type: 'text', text: `查询失败：${message}` }],
  details: { error: true },
  isError: true,
});

const guard = async (run) => {
  try {
    return await run();
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
};

const limitSchema = Type.Optional(Type.Integer({
  minimum: 1,
  maximum: 200,
  description: '返回条数上限，默认 30，最大 200',
}));

const spectrumListResult = (params, context = {}) => {
  const result = buildSpectrumListing(spectrumRecords(), params, { question: context.question });
  return textResult(result, { spectrumGallery: result.spectrumGallery });
};

const businessToolsBase = [
  {
    name: 'data_overview',
    label: '数据概况',
    description: '查看平台当前可分析的数据概况：物性表更新时间、行数、字段、分表名称，图谱库概览，以及检测报告、办事记录和灰份记录条数。用于确认真实数据范围与字段。',
    promptSnippet: 'data_overview: 了解当前数据范围与更新时间',
    promptGuidelines: ['在不确定数据范围时先调用 data_overview。'],
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: () => guard(() => {
      const property = getPropertyData();
      const rows = propertyRows();
      return textResult({
        propertyData: {
          sourceFileName: property?.sourceFileName ?? '',
          updatedAt: property?.updatedAt ?? '',
          rowCount: rows.length,
          fields: propertyFields(),
          sheets: sheetNames(),
        },
        inspectionReportCount: countRows('inspection_reports'),
        spectrumLibrary: spectrumOverview(),
        officeRecords: listOfficeRecords({ limit: 1 }).total,
        ashRecords: listAshRecords({}).total,
      });
    }),
  },
  {
    name: 'list_spectrum_records',
    label: '查询图谱记录',
    description: '查询「图谱分析」图谱库记录，返回编号、标题、登记类型（FTIR/TGA/DSC）、分类、日期、标签和图片地址。仅元信息，未做图像识别，登记/标题可能误标。按型号查全类型候选，核验前不要因登记类型排除候选；分析/展示前用read_spectrum_image读取实际图片。',
    promptSnippet: 'list_spectrum_records: 查询图谱库里的 FTIR/TGA/DSC 谱图记录',
    promptGuidelines: [
      '用户提到图谱、谱图、红外、FTIR、TGA、DSC 时先调用本工具，不要凭记忆回答有没有。',
      '不要把图谱库记录与检测报告、数据识别记录混为一谈。',
      '登记类型不是图像识别：按型号先查全类型候选，随后用read_spectrum_image核对坐标轴；无法读取则注明未核验。',
      'spectrumGallery已保证DSC/TGA/FTIR存在时各选一张，界面会自动展示；优先读取这些id，不用重复FTIR占掉DSC名额。',
    ],
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: '型号、编号、标题、分类、标签或备注关键字，例如 320G6-B1S' })),
      type: Type.Optional(Type.String({ description: '仅按登记类型筛选：FTIR、TGA或DSC，不代表实际图像类型；查型号时优先不传，避免漏掉误标记录' })),
      category: Type.Optional(Type.String({ description: '分类，例如 广俊、中蓝、长春、宝理' })),
      tag: Type.Optional(Type.String({ description: '标签，例如 320、PBT、阻燃剂' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => spectrumListResult(params)),
  },
  {
    name: 'query_property_rows',
    label: '查询物性打版记录',
    description: '按型号、批号或任意关键字查询物性/打版表（主表 processedData）里的记录。型号和批号是模糊匹配，关键字会匹配该行任意字段。',
    promptSnippet: 'query_property_rows: 按型号/批号/关键字查询物性打版记录',
    promptGuidelines: ['查询具体型号或批号时优先使用本工具，不要凭记忆回答。'],
    parameters: Type.Object({
      model: Type.Optional(Type.String({ description: '型号，模糊匹配，例如 320G6-B1S' })),
      batch: Type.Optional(Type.String({ description: '批号，模糊匹配，例如 A608011' })),
      keyword: Type.Optional(Type.String({ description: '任意关键字，匹配该行所有字段' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => {
      const matched = filterRows(propertyRows(), params);
      return textResult({
        total: propertyRows().length,
        returned: matched.length,
        rowRefs: matched.map((row, index) => ({ rowRef: rowRef(row), rowIndex: index, model: row['型号'], batch: row['批号'] ?? row['批次'], date: row['日期'] })),
        rows: matched,
      });
    }),
  },
  {
    name: 'query_sheet_rows',
    label: '查询分表数据',
    description: '查询物性数据文件中某个分表的记录。可用分表见 data_overview 的 sheets 字段，例如 测试板、PBT阻燃、PET阻燃、无卤、尼龙、原料、竞品。',
    promptSnippet: 'query_sheet_rows: 查询指定分表的记录',
    promptGuidelines: ['回答分表相关问题时先用 data_overview 确认分表名称。'],
    parameters: Type.Object({
      sheet: Type.String({ description: '分表名称，例如 测试板' }),
      variant: Type.Optional(Type.Union([Type.Literal('merged'), Type.Literal('raw')], {
        description: 'merged（合并后，默认）或 raw（原始表）',
      })),
      keyword: Type.Optional(Type.String({ description: '任意关键字过滤' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => {
      const sheet = sheetRows(params.sheet, params.variant ?? 'merged');
      if (!sheet) return failure(`没有找到分表「${params.sheet}」，可用分表：${sheetNames().join('、')}`);
      const matched = filterRows(sheet.rows, { keyword: params.keyword, limit: params.limit });
      return textResult({
        sheet: sheet.sheet,
        variant: sheet.variant,
        total: sheet.rows.length,
        returned: matched.length,
        rowRefs: matched.map((row, index) => ({ rowRef: rowRef(row), rowIndex: index, model: row['型号'], batch: row['批号'] ?? row['批次'], date: row['日期'] })),
        rows: matched,
      });
    }),
  },
  {
    name: 'list_inspection_reports',
    label: '查询检测报告',
    description: '列出检测报告库中的报告（标题、分类、文件名、备注、时间），可按标题或备注关键字过滤。仅返回报告元信息，不返回 PDF 内容。',
    promptSnippet: 'list_inspection_reports: 查询检测报告元信息',
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: '标题、分类、文件名或备注关键字' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => {
      const reports = listInspectionReports(params);
      return textResult({
        hint: 'openUrl 是报告文件地址，用 Markdown 链接给出，例如 [文件名](openUrl)；工具不返回 PDF 正文。',
        reports: reports.map((report) => ({
          ...report,
          openUrl: appUrl(`/api/inspection-reports/${encodeURIComponent(report.id)}/file`),
        })),
      });
    }),
  },
  {
    name: 'list_office_records',
    label: '查询办事记录',
    description: '查询「办事记录」页面的送样/配色/灰份等记录：项目名、日期、类型、明细表的列名与数据行。可按类型、项目、日期区间或关键字过滤，并返回已有记录类型与总数。',
    promptSnippet: 'list_office_records: 查询办事记录（送样/配色/灰份）与明细表',
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: '项目名、型号、日期或明细内容的任意关键字' })),
      type: Type.Optional(Type.String({ description: '记录类型，例如 sampling' })),
      project: Type.Optional(Type.String({ description: '项目名称关键字，例如 定润' })),
      dateFrom: Type.Optional(Type.String({ description: '起始日期 YYYY-MM-DD' })),
      dateTo: Type.Optional(Type.String({ description: '结束日期 YYYY-MM-DD' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => textResult(listOfficeRecords(params))),
  },
  {
    name: 'list_ash_records',
    label: '查询灰份记录',
    description: '查询「办事记录」页面里的灰份检测记录（客户/名称、日期、批号、每个坩埚的杯重/料重/残重/灰份含量）。可按名称、批号或关键字过滤。',
    promptSnippet: 'list_ash_records: 查询灰份检测记录与每行含量',
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: '客户名称、批号、日期或任意关键字' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => textResult(listAshRecords(params))),
  },
  {
    name: 'query_report_ranges',
    label: '查询报告判定范围',
    description: '查询物性分析页生成报告时使用的型号指标判定范围（型号 + 指标 + 上下限，例如 320G5-B7 灰份 23.0~27.0）。可按型号或关键字过滤。',
    promptSnippet: 'query_report_ranges: 查询型号指标的判定范围',
    promptGuidelines: ['回答「某型号某指标合格范围」时用本工具，不要用物性记录反推。'],
    parameters: Type.Object({
      model: Type.Optional(Type.String({ description: '型号关键字，例如 320G5-B7' })),
      keyword: Type.Optional(Type.String({ description: '指标或其他关键字，例如 灰份' })),
      limit: limitSchema,
    }, { additionalProperties: false }),
    execute: (_id, params) => guard(() => textResult(reportRanges(params))),
  },
];

export const businessToolsFor = (context = {}) => [
  ...businessToolsBase.map(tool => tool.name === 'list_spectrum_records'
    ? { ...tool, execute: (_id, params) => guard(() => spectrumListResult(params, context)) } : tool),
  ...spectrumImageTools(context), ...projectTools(context), ...businessWriteTools(context),
];
export const businessTools = businessToolsFor();