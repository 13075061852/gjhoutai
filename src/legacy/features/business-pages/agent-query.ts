
type AgentQueryRow = Record<string, any>;
type AgentQueryAliases = Record<string, string>;
type AgentQueryFilter = {
  field?: string;
  key?: string;
  op?: string;
  operator?: string;
  value?: unknown;
  values?: unknown;
};
type AgentQuerySort = {
  field?: string;
  key?: string;
  direction?: string;
  order?: string;
};
type AgentQueryRequest = {
  intent?: string;
  fields?: string[];
  filters?: AgentQueryFilter[];
  sort?: AgentQuerySort[];
  limit?: number | string;
  field?: string;
  direction?: string;
  groupBy?: string;
  groupField?: string;
  target?: string;
  key?: string;
  id?: string;
};
type AgentQueryInput = {
  pageId?: string;
  entity?: string;
  rows?: AgentQueryRow[];
  request?: AgentQueryRequest;
  defaultFields?: string[];
  fieldAliases?: AgentQueryAliases;
};
type AgentQueryResult = {
  ok: boolean;
  skillId: string;
  pageId: string;
  entity: string;
  intent: string;
  rowCount: number;
  totalRows: number;
  data: AgentQueryRow[];
  summary: string;
  comparedRows?: number;
  groupBy?: string;
};

const toText = (value) => String(value ?? '').trim();

export const parseAgentNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  const match = toText(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
};

const normalizeField = (field, aliases = {} as any) => aliases[field] || field;

const getValue = (row, field, aliases = {} as any) => row?.[normalizeField(field, aliases)];

const compareValues = (left, right) => {
  const leftNumber = parseAgentNumber(left);
  const rightNumber = parseAgentNumber(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return toText(left).localeCompare(toText(right), 'zh-CN', { numeric: true });
};

export const applyAgentFilters = (rows = [], filters = [], aliases = {} as any) => {
  const list = Array.isArray(filters) ? filters.filter(Boolean) : [];
  if (!list.length) return rows;
  return rows.filter((row) => list.every((filter) => {
    const field = normalizeField(filter.field || filter.key || '', aliases);
    const op = toText(filter.op || filter.operator || 'contains').toLowerCase();
    const expected = filter.value ?? filter.values ?? '';
    const actual = row?.[field];
    const actualText = toText(actual).toLowerCase();

    if (op === 'exists') return actual != null && toText(actual) !== '';
    if (op === 'empty') return actual == null || toText(actual) === '';
    if (op === 'in') {
      const values = Array.isArray(expected) ? expected : toText(expected).split(/[,\s，、]+/);
      return values.map((item) => toText(item).toLowerCase()).includes(actualText);
    }
    if (op === 'eq' || op === '=' || op === 'equals') return actualText === toText(expected).toLowerCase();
    if (op === 'ne' || op === '!=' || op === 'not') return actualText !== toText(expected).toLowerCase();
    if (op === 'startsWith'.toLowerCase()) return actualText.startsWith(toText(expected).toLowerCase());
    if (op === 'endsWith'.toLowerCase()) return actualText.endsWith(toText(expected).toLowerCase());
    if (['gt', 'gte', 'lt', 'lte', '>', '>=', '<', '<='].includes(op)) {
      const left = parseAgentNumber(actual);
      const right = parseAgentNumber(expected);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (op === 'gt' || op === '>') return left > right;
      if (op === 'gte' || op === '>=') return left >= right;
      if (op === 'lt' || op === '<') return left < right;
      return left <= right;
    }
    return actualText.includes(toText(expected).toLowerCase());
  }));
};

export const sortAgentRows = (rows = [], sort = [], aliases = {} as any) => {
  const rules = Array.isArray(sort) ? sort.filter(Boolean) : [];
  if (!rules.length) return [...rows];
  return [...rows].sort((left, right) => {
    for (const rule of rules) {
      const field = normalizeField(rule.field || rule.key || '', aliases);
      const direction = toText(rule.direction || rule.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      const compared = compareValues(left?.[field], right?.[field]);
      if (compared !== 0) return compared * direction;
    }
    return 0;
  });
};

const pickFields = (row, fields = []) => {
  if (!fields.length) return { ...row };
  return Object.fromEntries(fields.map((field) => [field, row?.[field] ?? '']));
};

export const queryAgentRows = ({
  pageId = '',
  entity = '',
  rows = [],
  request = {} as any,
  defaultFields = [],
  fieldAliases = {} as any,
}: AgentQueryInput = {} as any): AgentQueryResult => {
  const intent = toText(request.intent || 'list') || 'list';
  const requestedFields = Array.isArray(request.fields) && request.fields.length
    ? request.fields.map((field) => normalizeField(field, fieldAliases)).filter(Boolean)
    : defaultFields;
  const filters = Array.isArray(request.filters) ? request.filters : [];
  const filteredRows = applyAgentFilters(rows, filters, fieldAliases);
  const sortRules = Array.isArray(request.sort) ? request.sort : [];
  const sortedRows = sortAgentRows(filteredRows, sortRules, fieldAliases);
  const parsedLimit = Number.parseInt(String(request.limit || ''), 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : (intent === 'count' ? 0 : 20);
  const limitedRows = limit ? sortedRows.slice(0, limit) : [];
  const common = {
    ok: true,
    skillId: 'business.queryPageData',
    pageId,
    entity,
    intent,
    rowCount: filteredRows.length,
    totalRows: rows.length,
  };

  if (intent === 'count') {
    return {
      ...common,
      data: [],
      summary: `已统计 ${pageId} / ${entity}，命中 ${filteredRows.length} 条。`,
    };
  }

  if (intent === 'extrema') {
    const primarySort = sortRules[0] || {};
    const field = normalizeField(primarySort.field || request.field || requestedFields[0] || 'stockQuantity', fieldAliases);
    const direction = toText(primarySort.direction || request.direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const comparableRows = filteredRows.filter((row) => Number.isFinite(parseAgentNumber(row?.[field])));
    const ordered = sortAgentRows(comparableRows, [{ field, direction }], fieldAliases);
    const data = ordered.slice(0, limit || 1).map((row) => pickFields(row, requestedFields));
    return {
      ...common,
      rowCount: data.length,
      comparedRows: comparableRows.length,
      data,
      summary: `已在 ${filteredRows.length} 条候选中按 ${field} ${direction === 'desc' ? '降序' : '升序'}取 ${data.length} 条。`,
    };
  }

  if (intent === 'aggregate') {
    const groupBy = normalizeField(request.groupBy || request.groupField || 'status', fieldAliases);
    const groups = filteredRows.reduce((acc, row) => {
      const key = toText(row?.[groupBy] || '未分组');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return {
      ...common,
      groupBy,
      data: Object.entries(groups).map(([key, count]) => ({ [groupBy]: key, count })),
      summary: `已按 ${groupBy} 聚合 ${filteredRows.length} 条记录。`,
    };
  }

  if (intent === 'detail') {
    const target = toText(request.target || request.key || request.id || '');
    const detailRows = target
      ? filteredRows.filter((row) => Object.values(row || {}).some((value) => toText(value).toLowerCase().includes(target.toLowerCase())))
      : sortedRows;
    const data = detailRows.slice(0, limit || 1).map((row) => pickFields(row, requestedFields));
    return {
      ...common,
      rowCount: data.length,
      data,
      summary: target
        ? `已按目标 ${target} 查询详情，返回 ${data.length} 条。`
        : `已返回 ${pageId} / ${entity} 的详情候选 ${data.length} 条。`,
    };
  }

  if (intent === 'compare') {
    return {
      ...common,
      data: limitedRows.map((row) => pickFields(row, requestedFields)),
      summary: `已取回 ${limitedRows.length} 条用于对比，候选 ${filteredRows.length} 条。`,
    };
  }

  return {
    ...common,
    data: limitedRows.map((row) => pickFields(row, requestedFields)),
    summary: `已按意图 ${intent} 从 ${pageId} / ${entity} 取回 ${limitedRows.length} 条，候选 ${filteredRows.length} 条。`,
  };
};

