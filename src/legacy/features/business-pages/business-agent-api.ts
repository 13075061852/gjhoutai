import { parseAgentNumber, queryAgentRows } from './agent-query';

export const createBusinessAgentApi = (context = {} as any) => {
  const {
    App,
    authUsers,
    archiveStates,
    orderRows,
    inventoryRows,
    procurementRows,
    supplierRows,
    formulaRecipes,
    officeRecords,
    ashRecords,
    getUserDepartment,
    getPermissionDepartments,
    getPermissionPages,
    getPermissionDepartmentMemberCount,
    getFormulaSummary,
    getProductionOrders,
    getInventoryCategories,
    getOfficeRecordLabel,
    getTodayCode,
  } = context;
  const formatAgentRecords = (rows = [], columns = [], limit = 20) => rows.slice(0, limit).map((row, index) => {
    if (Array.isArray(row)) {
      return `${index + 1}. ${row.map((value, cellIndex) => `${columns[cellIndex] || `列${cellIndex + 1}`}=${value || '--'}`).join('；')}`;
    }
    return `${index + 1}. ${columns.map(([label, key]) => `${label}=${row?.[key] || '--'}`).join('；')}`;
  });

  const getBusinessPageHints = (question = '', activePageId = '') => {
    const text = String(question || '').toLowerCase();
    const hints = new Set<any>();
    const add = (...pageIds: any[]) => pageIds.forEach((pageId) => hints.add(pageId));
    if (/账号|账户|用户|人员|员工|部门|权限|角色|登录|在线/.test(text)) add('personnel-archive', 'permission-management');
    if (/订单|交付|交期|客户订单|销售单/.test(text)) add('order-management');
    if (/库存|商品|产品|材料|原料|成品|仓库|可售|锁库/.test(text)) add('inventory-management');
    if (/供应商|采购|供货|原料采购|进货/.test(text)) add('supplier-archive', 'raw-material-procurement');
    if (/客户|客群|联系人|交易|信用/.test(text)) add('customer-archive');
    if (/配方|工艺|组分|比例|版本/.test(text)) add('formula-management');
    if (/办事|送样|配色|色粉|助剂|添加剂|打样|型号批次|混合比例/.test(text)) add('office-records');
    if (/灰份|灰分|含量|杯重|料重|剩余重量|剩余料重/.test(text)) add('office-records');
    if (/生产|排产|产线|批次|质检|待排/.test(text)) add('production-plan');
    if (activePageId && App.constants?.PAGE_DEFS?.[activePageId]) add(activePageId);
    return [...hints];
  };

  const buildBusinessPageContext = (pageId) => {
    if (pageId === 'personnel-archive') {
      const rows = archiveStates['personnel']?.rows || [];
      const accountRows = authUsers.map((user, index) => ({
        code: `账号${index + 1}`,
        name: user.display_name || user.displayName || user.username,
        username: user.username,
        department: getUserDepartment(user),
        status: user.disabled ? '停用' : '启用',
      }));
      return [
        '【人员档案 / 系统账号】',
        `人员档案记录数：${rows.length}`,
        `系统登录账号数：${authUsers.length}`,
        rows.length ? '人员档案：' : '',
        ...formatAgentRecords(rows, [['编号', 'code'], ['姓名', 'name'], ['部门', 'category'], ['电话', 'phone'], ['邮箱', 'email'], ['状态', 'status']]),
        accountRows.length ? '登录账号：' : '',
        ...formatAgentRecords(accountRows, [['编号', 'code'], ['姓名', 'name'], ['账号', 'username'], ['部门', 'department'], ['状态', 'status']]),
      ].filter(Boolean).join('\n');
    }
    if (pageId === 'permission-management') {
      const departments = getPermissionDepartments();
      const pages = getPermissionPages();
      return [
        '【权限管理】',
        `部门数：${departments.length}`,
        `可配置页面数：${pages.length}`,
        '部门与成员数：',
        ...departments.map((department, index) => `${index + 1}. ${department}；成员数=${getPermissionDepartmentMemberCount(department)}`),
      ].join('\n');
    }
    if (pageId === 'order-management') {
      return [
        '【订单管理】',
        `订单总数：${orderRows.length}`,
        `待处理：${orderRows.filter((row) => row.status === '待处理').length}`,
        `生产中：${orderRows.filter((row) => row.status === '生产中').length}`,
        ...formatAgentRecords(orderRows, [['订单号', 'id'], ['客户', 'customer'], ['配方', 'formula'], ['数量KG', 'quantity'], ['状态', 'status'], ['交货日期', 'deliveryDate']]),
      ].join('\n');
    }
    if (pageId === 'inventory-management') {
      return [
        '【库存管理】',
        `库存物料数：${inventoryRows.length}`,
        `分类数：${getInventoryCategories().length}`,
        ...formatAgentRecords(inventoryRows, ['物料', '规格/批次', '分类', '供应商', '库存', '单位', '状态']),
      ].join('\n');
    }
    if (pageId === 'supplier-archive') {
      return [
        '【供应商档案】',
        `供应商总数：${supplierRows.length}`,
        ...formatAgentRecords(supplierRows, [['编号', 'code'], ['名称', 'name'], ['联系人', 'contact'], ['品类', 'category'], ['状态', 'status']]),
      ].join('\n');
    }
    if (pageId === 'raw-material-procurement') {
      return [
        '【原料采购】',
        `采购记录数：${procurementRows.length}`,
        ...formatAgentRecords(procurementRows, [['采购单号', 'id'], ['供应商', 'supplier'], ['物料', 'material'], ['数量', 'quantity'], ['状态', 'status'], ['采购日期', 'purchaseDate']]),
      ].join('\n');
    }
    if (pageId === 'office-records') {
      const rows = officeRecords.map((record) => ({
        ...record,
        typeLabel: getOfficeRecordLabel(record.type),
        customerApprovalText: record.type === 'sampling' ? `已认可 ${(record.customerApprovedRows || []).length}/${(record.tableRows || []).length} 条` : '',
        tableColumnsText: (record.tableColumns || []).join('、'),
        tableRowsText: (record.tableRows || []).map((row) => row.filter(Boolean).join(' / ')).filter(Boolean).join('；') || '无',
      }));
      const ashRows = ashRecords.map((record) => ({
        ...record,
        details: (record.rows || []).map((row) => `编号${row.index || ''}: 杯重=${row.cupWeight || '--'}；料重=${row.materialWeight || '--'}；剩余重量=${row.residueWeight || '--'}；剩余料重=${row.residueMaterialWeight || '--'}；含量=${row.content || '--'}`).join(' / '),
      }));
      return [
        '【办事记录】',
        `送样记录数：${officeRecords.filter((record) => record.type === 'sampling').length}`,
        `配色记录数：${officeRecords.filter((record) => record.type === 'coloring').length}`,
        `灰份记录数：${ashRecords.length}`,
        ...formatAgentRecords(rows, [['板块', 'typeLabel'], ['编号', 'id'], ['客户/项目', 'project'], ['客户认可', 'customerApprovalText'], ['表头', 'tableColumnsText'], ['明细', 'tableRowsText'], ['目标', 'target'], ['日期', 'date']]),
        ashRows.length ? '灰份记录：' : '',
        ...formatAgentRecords(ashRows, [['编号', 'id'], ['日期', 'date'], ['名称', 'name'], ['批次', 'batch'], ['明细', 'details']]),
      ].join('\n');
    }
    if (pageId === 'customer-archive') {
      const rows = archiveStates['customer']?.rows || [];
      return [
        '【客户档案】',
        `客户总数：${rows.length}`,
        ...formatAgentRecords(rows, [['编号', 'code'], ['客户名称', 'name'], ['联系人', 'contact'], ['等级', 'category'], ['状态', 'status']]),
      ].join('\n');
    }
    if (pageId === 'formula-management') {
      const rows = formulaRecipes.map((recipe) => {
        const summary = getFormulaSummary(recipe);
        return {
          code: recipe.code || String(recipe.id || '').replace(/^FM-/, ''),
          name: recipe.name,
          updated: recipe.updated || getTodayCode(),
          category: summary.category,
          line: `${recipe.line || 'A'}线`,
          cost: summary.cost,
          inventoryStatus: summary.riskCount ? `${summary.riskCount} 项风险` : '可排产',
          version: recipe.version,
          status: summary.status,
        };
      });
      return [
        '【配方管理】',
        `配方总数：${formulaRecipes.length}`,
        '说明：以下字段与配方管理页面表格保持一致；不要使用内部 id、product 或 owner 字段回答。',
        ...formatAgentRecords(rows, [['配方编号', 'code'], ['配方名称', 'name'], ['日期', 'updated'], ['分类', 'category'], ['产线', 'line'], ['成本', 'cost'], ['库存状态', 'inventoryStatus'], ['版本', 'version'], ['状态', 'status']]),
      ].join('\n');
    }
    if (pageId === 'production-plan') {
      const rows = getProductionOrders();
      return [
        '【生产计划】',
        `生产计划相关订单数：${rows.length}`,
        ...formatAgentRecords(rows, [['订单号', 'id'], ['客户', 'customer'], ['配方', 'formula'], ['状态', 'status'], ['生产日期', 'productionDate'], ['生产编号', 'productionNo']]),
      ].join('\n');
    }
    return '';
  };

  const getAgentContext = (question = '', options = {} as any) => {
    const activePageId = options.activePageId || localStorage.getItem(App.constants?.NAV_PAGE_KEY || 'sidebar-active-page') || '';
    const hints: any[] = getBusinessPageHints(question, activePageId);
    const sections = hints
      .map((pageId) => buildBusinessPageContext(pageId))
      .filter((content) => String(content || '').trim());
    if (!sections.length) return null;
    return {
      title: '业务页面数据调度',
      reason: `按问题模糊调度页面：${hints.map((pageId) => App.constants?.PAGE_DEFS?.[pageId]?.title || pageId).join('、')}`,
      score: /账号|账户|用户|人员|员工|部门|权限|订单|库存|供应商|客户|采购|配方|生产|多少|几个|数量|总数/.test(String(question || '')) ? 11 : 6,
      content: [
        '【业务页面精准数据】',
        '说明：先根据问题在全系统页面能力地图中模糊匹配，再读取相关页面的数据池；即使当前不在目标页面，也可以回答数量、列表和状态类问题。',
        sections.join('\n\n'),
      ].join('\n'),
    };
  };

  const renderAgentMarkdownTable = (headers = [], rows = []) => {
    if (!headers.length || !rows.length) return '';
    return [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '--').replace(/\|/g, '/')).join(' | ')} |`),
    ].join('\n');
  };

  const getFormulaAgentRows = () => formulaRecipes.map((recipe) => {
    const summary = getFormulaSummary(recipe);
    return [
      recipe.code || String(recipe.id || '').replace(/^FM-/, ''),
      recipe.name || '--',
      recipe.updated || getTodayCode(),
      summary.category || '--',
      `${recipe.line || 'A'}线`,
      summary.cost || '--',
      summary.riskCount ? `${summary.riskCount} 项风险` : '可排产',
      recipe.version || '--',
      summary.status || '--',
    ];
  });

  const getAccountAgentRows = () => authUsers.map((user, index) => [
    `账号${index + 1}`,
    user.display_name || user.displayName || user.username || '--',
    user.username || '--',
    getUserDepartment(user) || '--',
    user.disabled ? '停用' : '启用',
  ]);

  const getPersonnelAgentRows = () => (archiveStates['personnel']?.rows || []).map((record) => [
    record.code || '--',
    record.name || '--',
    record.category || '--',
    record.phone || '--',
    record.email || '--',
    record.status || '--',
  ]);

  const getFormulaAgentObjects = () => formulaRecipes.map((recipe) => {
    const summary = getFormulaSummary(recipe);
    return {
      code: recipe.code || String(recipe.id || '').replace(/^FM-/, ''),
      name: recipe.name || '--',
      updated: recipe.updated || getTodayCode(),
      category: summary.category || '--',
      line: `${recipe.line || 'A'}线`,
      cost: summary.cost || '--',
      costValue: parseAgentNumber(summary.cost),
      inventoryStatus: summary.riskCount ? `${summary.riskCount} 项风险` : '可排产',
      riskCount: summary.riskCount || 0,
      version: recipe.version || '--',
      status: summary.status || '--',
    };
  });

  const getInventoryAgentObjects = () => inventoryRows.map((row) => {
    const stockText = String(row[4] || '--');
    const unitMatch = stockText.match(/[\u4e00-\u9fa5A-Za-z/%]+$/);
    return {
      name: row[0] || '--',
      type: row[1] || '--',
      category: row[2] || '--',
      supplier: row[3] || '--',
      stock: stockText,
      stockQuantity: parseAgentNumber(stockText),
      stockUnit: unitMatch ? unitMatch[0] : '',
      status: row[5] || '--',
      note: row[6] || '',
      isFinishedGoods: isFinishedInventoryRow(row),
    };
  });

  const getBusinessAgentDatasets = () => ({
    'formula-management': {
      entity: 'formula',
      rows: getFormulaAgentObjects(),
      defaultFields: ['code', 'name', 'updated', 'category', 'line', 'cost', 'inventoryStatus', 'version', 'status'],
      fieldAliases: {
        id: 'code',
        title: 'name',
        date: 'updated',
        productLine: 'line',
      },
    },
    'inventory-management': {
      entity: 'inventoryItem',
      rows: getInventoryAgentObjects(),
      defaultFields: ['name', 'type', 'category', 'supplier', 'stock', 'stockQuantity', 'stockUnit', 'status'],
      fieldAliases: {
        material: 'name',
        itemName: 'name',
        quantity: 'stockQuantity',
        stockValue: 'stockQuantity',
        unit: 'stockUnit',
      },
    },
    'order-management': {
      entity: 'order',
      rows: orderRows.map((order) => ({ ...order })),
      defaultFields: ['id', 'customer', 'formula', 'quantity', 'status', 'deliveryDate'],
    },
    'production-plan': {
      entity: 'productionOrder',
      rows: getProductionOrders().map((order) => ({ ...order })),
      defaultFields: ['id', 'customer', 'formula', 'status', 'productionDate', 'productionNo'],
    },
    'supplier-archive': {
      entity: 'supplier',
      rows: supplierRows.map((supplier) => ({ ...supplier })),
      defaultFields: ['code', 'name', 'contact', 'category', 'status'],
    },
    'raw-material-procurement': {
      entity: 'procurement',
      rows: procurementRows.map((record) => ({ ...record })),
      defaultFields: ['id', 'supplier', 'material', 'quantity', 'unitPrice', 'purchaseDate', 'status'],
    },
    'office-records': {
      entity: 'officeRecord',
      rows: [
        ...officeRecords.map((record) => ({
          ...record,
          typeLabel: getOfficeRecordLabel(record.type),
          customerApprovalText: record.type === 'sampling' ? `已认可 ${(record.customerApprovedRows || []).length}/${(record.tableRows || []).length} 条` : '',
          tableColumnsText: (record.tableColumns || []).join('、'),
          tableRowsText: (record.tableRows || []).map((row) => row.filter(Boolean).join(' / ')).filter(Boolean).join('\n'),
        })),
        ...ashRecords.map((record) => ({
          ...record,
          typeLabel: '灰份记录',
          project: record.name,
          tableColumnsText: '编号、杯重、料重、剩余重量、剩余料重、含量',
          tableRowsText: (record.rows || []).map((row) => `编号${row.index || ''}: 杯重=${row.cupWeight || '--'}；料重=${row.materialWeight || '--'}；剩余重量=${row.residueWeight || '--'}；剩余料重=${row.residueMaterialWeight || '--'}；含量=${row.content || '--'}`).join('\n'),
          target: record.batch,
        })),
      ],
      defaultFields: ['id', 'typeLabel', 'project', 'customerApprovalText', 'tableColumnsText', 'tableRowsText', 'target', 'date'],
      fieldAliases: {
        customer: 'project',
        approval: 'customerApprovalText',
        approved: 'customerApprovalText',
        columns: 'tableColumnsText',
        rows: 'tableRowsText',
        sample: 'project',
        lot: 'target',
      },
    },
    'customer-archive': {
      entity: 'customer',
      rows: (archiveStates['customer']?.rows || []).map((record) => ({ ...record })),
      defaultFields: ['code', 'name', 'contact', 'category', 'status'],
    },
    'personnel-archive': {
      entity: 'personnel',
      rows: (archiveStates['personnel']?.rows || []).map((record) => ({ ...record })),
      defaultFields: ['code', 'name', 'category', 'phone', 'email', 'status'],
    },
    'permission-management': {
      entity: 'permissionRole',
      rows: getPermissionDepartments().map((department) => ({
        department,
        memberCount: getPermissionDepartmentMemberCount(department),
      })),
      defaultFields: ['department', 'memberCount'],
    },
  });

  const getBusinessAgentManifestPages = () => {
    const datasets = getBusinessAgentDatasets();
    return Object.entries(datasets).map(([pageId, dataset]) => ({
      pageId,
      title: App.constants?.PAGE_DEFS?.[pageId]?.title || pageId,
      desc: App.constants?.PAGE_DEFS?.[pageId]?.desc || '',
      entity: dataset.entity,
      fields: dataset.defaultFields,
      skills: ['business.queryPageData', 'project.inspectPage'],
      rowCount: dataset.rows.length,
    }));
  };

  const inspectAgentPage = (pageId = '') => {
    const datasets = getBusinessAgentDatasets();
    const dataset = datasets[pageId];
    if (!dataset) return null;
    return {
      ok: true,
      pageId,
      title: App.constants?.PAGE_DEFS?.[pageId]?.title || pageId,
      entity: dataset.entity,
      fields: dataset.defaultFields,
      rowCount: dataset.rows.length,
      sampleShape: dataset.rows[0] ? Object.fromEntries(dataset.defaultFields.map((field) => [field, dataset.rows[0]?.[field] ?? ''])) : {},
      summary: `页面 ${pageId} 可查询实体 ${dataset.entity}，当前 ${dataset.rows.length} 条记录。`,
    };
  };

  const normalizeBusinessQueryRequest = (request = {} as any) => {
    const text = String(request.question || request.query || request.originalQuestion || '').trim();
    const input = { ...request };
    if (!input.pageId) {
      const hints = getBusinessPageHints(text, input.activePageId || '');
      input.pageId = hints[0] || input.activePageId || 'dashboard';
    }
    if (!input.intent) {
      if (/几个|多少|数量|总数/.test(text)) input.intent = 'count';
      else if (/最低|最少|最小/.test(text)) input.intent = 'extrema';
      else if (/最高|最多|最大/.test(text)) input.intent = 'extrema';
      else if (/有哪些|哪几个|列表|明细|查看|列举|列出|展示|罗列/.test(text)) input.intent = 'list';
      else input.intent = 'filter';
    }
    if (!Array.isArray(input.filters)) input.filters = [];
    if (/商品|产品|成品/.test(text) && /inventory|stock/.test(input.pageId)) {
      input.filters.push({ field: 'isFinishedGoods', op: 'eq', value: true });
    }
    if (input.intent === 'extrema' && !Array.isArray(input.sort)) {
      input.sort = [{ field: /库存|商品|产品|成品|物料|材料/.test(text) ? 'stockQuantity' : 'count', direction: /最高|最多|最大/.test(text) ? 'desc' : 'asc' }];
    }
    if (input.intent === 'extrema' && !input.limit) input.limit = 1;
    return input;
  };

  const queryAgentData = (request = {} as any) => {
    const input = normalizeBusinessQueryRequest(request);
    const datasets = getBusinessAgentDatasets();
    const dataset = datasets[input.pageId];
    if (!dataset) {
      return {
        ok: false,
        skillId: 'business.queryPageData',
        pageId: input.pageId,
        intent: input.intent || 'list',
        data: [],
        rowCount: 0,
        summary: `页面 ${input.pageId || '-'} 暂未接入结构化取数。`,
      };
    }
    return queryAgentRows({
      pageId: input.pageId,
      entity: input.entity || dataset.entity,
      rows: dataset.rows,
      request: input,
      defaultFields: dataset.defaultFields,
      fieldAliases: dataset.fieldAliases || {},
    });
  };

  const parseInventoryQuantity = (value) => {
    const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NaN;
  };

  const isFinishedInventoryRow = (row = []) => (
    /成品|商品|产品/.test(String(row[1] || '')) || /^GJ-/i.test(String(row[0] || ''))
  );

  const getInventoryRowsForQuestion = (text = '') => {
    if (/商品|产品|成品/.test(text)) {
      const rows = inventoryRows.filter(isFinishedInventoryRow);
      return rows.length ? rows : inventoryRows;
    }
    return inventoryRows;
  };

  const answerInventoryExtremaQuestion = (text = '') => {
    if (!/(?:最低|最少|最小|最高|最多|最大)/.test(text)) return '';
    const rows = getInventoryRowsForQuestion(text)
      .map((row) => ({ row, quantity: parseInventoryQuantity(row[4]) }))
      .filter((item) => Number.isFinite(item.quantity));
    if (!rows.length) return '当前库存数据里没有可比较的库存数值。';

    const isMax = /最高|最多|最大/.test(text);
    rows.sort((left, right) => isMax ? right.quantity - left.quantity : left.quantity - right.quantity);
    const best = rows[0].row;
    const scope = /商品|产品|成品/.test(text) ? '成品商品' : '库存物料';
    return [
      `当前库存${isMax ? '最高' : '最低'}的${scope}是：${best[0]}。`,
      `库存：${best[4]}；类型：${best[1]}；分类：${best[2]}；供应商：${best[3]}；状态：${best[5]}。`,
    ].join('\n');
  };

  const answerQuestion = (question = '', options = {} as any) => {
    const text = String(question || '').trim();
    if (!/(?:几个|多少|数量|总数|有哪些|哪几个|列表|明细|当前|现在|查看|列举|列出|展示|罗列|最低|最少|最小|最高|最多|最大)/.test(text)) return '';
    const wantsListPattern = /(?:有哪些|哪几个|哪几|哪四|哪.*个|列表|明细|查看|列举|列出|展示|罗列|具体|详细|分别)/;

    if (/配方/.test(text)) {
      const rows = getFormulaAgentRows();
      const wantsList = wantsListPattern.test(text);
      return [
        `系统当前共有 ${formulaRecipes.length} 个配方。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(
          ['配方编号', '配方名称', '日期', '分类', '产线', '成本', '库存状态', '版本', '状态'],
          rows
        ) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    if (/账号|账户|用户|登录/.test(text)) {
      const rows = getAccountAgentRows();
      const wantsList = wantsListPattern.test(text);
      return [
        `系统当前共有 ${authUsers.length} 个登录账号。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(['序号', '姓名', '账号', '角色', '状态'], rows) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    if (/人员|员工/.test(text)) {
      const rows = getPersonnelAgentRows();
      const wantsList = wantsListPattern.test(text);
      return [
        `系统当前共有 ${rows.length} 条人员档案。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(['编号', '姓名', '部门', '电话', '邮箱', '状态'], rows) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    if (/订单/.test(text)) {
      const rows = orderRows.map((order) => [order.id, order.customer, order.formula, order.quantity, order.status, order.deliveryDate]);
      const wantsList = wantsListPattern.test(text);
      return [
        `系统当前共有 ${orderRows.length} 个订单。`,
        `其中待处理 ${orderRows.filter((row) => row.status === '待处理').length} 个，生产中 ${orderRows.filter((row) => row.status === '生产中').length} 个。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(['订单号', '客户', '配方', '数量KG', '状态', '交货日期'], rows) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    if (/供应商/.test(text)) {
      const rows = supplierRows.map((supplier) => [supplier.code, supplier.name, supplier.contact, supplier.category, supplier.status]);
      const wantsList = wantsListPattern.test(text);
      return [
        `系统当前共有 ${supplierRows.length} 个供应商。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(['编号', '名称', '联系人', '品类', '状态'], rows) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    if (/客户/.test(text)) {
      const customers = archiveStates['customer']?.rows || [];
      const rows = customers.map((customer) => [customer.code, customer.name, customer.contact, customer.category, customer.status]);
      const wantsList = wantsListPattern.test(text);
      return [
        `系统当前共有 ${customers.length} 个客户。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(['编号', '客户名称', '联系人', '等级', '状态'], rows) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    if (/库存|物料|材料|商品|产品|成品/.test(text)) {
      const extremaAnswer = answerInventoryExtremaQuestion(text);
      if (extremaAnswer) return extremaAnswer;

      const inventoryScopeRows = getInventoryRowsForQuestion(text);
      const rows = inventoryScopeRows.map((row) => [row[0], row[1], row[2], row[3], row[4], row[5], row[6]]);
      const wantsList = wantsListPattern.test(text);
      const scopeText = /商品|产品|成品/.test(text) ? '成品商品' : '库存物料记录';
      return [
        `系统当前共有 ${inventoryScopeRows.length} 条${scopeText}。`,
        wantsList && rows.length ? '' : '',
        wantsList && rows.length ? renderAgentMarkdownTable(['物料', '规格/批次', '分类', '供应商', '库存', '单位', '状态'], rows) : '',
      ].filter((item) => item != null).join('\n').trim();
    }

    return '';
  };


  return {
    getAgentContext,
    answerQuestion,
    queryAgentData,
    inspectAgentPage,
    getBusinessAgentManifestPages,
  };
};
