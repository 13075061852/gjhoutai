import { describe, expect, it, vi } from 'vitest';
import {
  createProjectToolDefinitions,
  createProjectToolRegistry,
} from './project-tool-definitions';
import { createAgentExecutionEngine } from './execution-engine';
import { createMemoryAgentRunStore } from './run-store';
import { createProjectToolAdapters } from './tools';

const legacyAppRef = vi.hoisted(() => ({ current: null as any }));

vi.mock('../../core/app-context', () => ({
  getLegacyApp: () => legacyAppRef.current,
}));

const REQUIRED_TOOL_IDS = [
  'assistant.modelInfo',
  'assistant.currentPage',
  'assistant.projectGuide',
  'assistant.openPage',
  'project.getManifest',
  'project.searchCapabilities',
  'project.auditRuntime',
  'project.inspectPage',
  'project.finalAnswerCheck',
  'business.queryPageData',
  'business.analyzeOverview',
  'property.searchRows',
  'property.summarizeMetrics',
  'property.compareRows',
  'property.validateRanges',
  'spectrum.searchImages',
  'spectrum.deleteImages',
  'analysis.buildJointPackage',
  'formula.createRecipe',
  'dataRecognition.searchHistory',
  'dataRecognition.inspectCurrent',
  'web.search',
  'media.generateImage',
  'media.analyzeImages',
] as const;

const createAdapters = () => ({
  searchWeb: vi.fn().mockResolvedValue({
    results: [{ title: '官方资料', url: 'https://example.com', content: '摘要' }],
  }),
});

const getDefinition = (
  App: any,
  id: (typeof REQUIRED_TOOL_IDS)[number],
  adapters = createAdapters(),
) => {
  const definition = createProjectToolDefinitions(App, adapters).find((tool) => tool.id === id);
  if (!definition) throw new Error(`Missing project tool definition: ${id}`);
  return definition;
};

describe('project V2 tool registry', () => {
  it('registers the complete required tool set with explicit execution policy metadata', () => {
    const definitions = createProjectToolDefinitions({}, createAdapters());
    const registry = createProjectToolRegistry({}, createAdapters());

    expect(definitions.map((tool) => tool.id)).toEqual(REQUIRED_TOOL_IDS);
    expect(registry.list().map((tool) => tool.id)).toEqual(REQUIRED_TOOL_IDS);
    expect(new Set(definitions.map((tool) => tool.id)).size).toBe(REQUIRED_TOOL_IDS.length);

    definitions.forEach((definition) => {
      expect(definition.version).toBe(2);
      expect(definition.inputSchema).toEqual(expect.objectContaining({ parse: expect.any(Function) }));
      expect(definition.outputSchema).toEqual(expect.objectContaining({ parse: expect.any(Function) }));
      expect(definition.timeoutMs).toBeGreaterThan(0);
      expect(definition.maxRetries).toBeGreaterThanOrEqual(0);
      expect(typeof definition.idempotent).toBe('boolean');
      expect(typeof definition.supportsAbort).toBe('boolean');

      const expectedRisk = definition.id === 'formula.createRecipe' || definition.id === 'media.generateImage'
        ? 'create'
        : definition.id === 'spectrum.deleteImages'
          ? 'delete'
          : 'read';
      expect(definition.riskLevel).toBe(expectedRisk);
    });

    const abortableToolIds = definitions
      .filter((definition) => definition.supportsAbort)
      .map((definition) => definition.id);
    expect(abortableToolIds).toEqual([
      'spectrum.deleteImages',
      'formula.createRecipe',
      'web.search',
      'media.generateImage',
    ]);
    definitions.forEach((definition) => {
      const expectedPolicy = definition.id === 'web.search'
        ? 'cooperative'
        : definition.riskLevel === 'read'
          ? 'unsupported'
          : 'preflight_only_write_outcome_unknown';
      expect((definition as any).abortPolicy).toBe(expectedPolicy);
    });
  });

  it('uses bounded, tool-specific schemas for business queries, recipes, and web search', () => {
    const definitions = createProjectToolDefinitions({}, createAdapters());
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));

    expect(byId.get('business.queryPageData')?.inputSchema.parse({
      question: '库存最低的是哪个材料',
      intent: 'extrema',
      limit: 100,
      customFilter: true,
    })).toEqual(expect.objectContaining({ question: '库存最低的是哪个材料', customFilter: true }));
    expect(() => byId.get('business.queryPageData')?.inputSchema.parse({ question: '', limit: 101 })).toThrow();

    expect(byId.get('formula.createRecipe')?.inputSchema.parse({
      name: '阻燃配方',
      components: [{ material: 'ABS', percentage: 70 }],
    })).toEqual({
      name: '阻燃配方',
      components: [{ material: 'ABS', percentage: 70 }],
    });
    expect(() => byId.get('formula.createRecipe')?.inputSchema.parse({
      name: '无组分配方',
      components: [],
    })).toThrow();

    expect(byId.get('web.search')?.inputSchema.parse({
      queries: ['官方资料'],
    })).toEqual({
      queries: ['官方资料'],
      maxResults: 5,
      searchDepth: 'basic',
      topic: 'general',
    });
    expect(() => byId.get('web.search')?.inputSchema.parse({
      queries: ['a', 'b', 'c', 'd'],
    })).toThrow();

    expect(byId.get('assistant.modelInfo')?.outputSchema.parse({
      provider: 'openrouter',
      model: 'model-a',
      configured: true,
    })).toEqual({
      provider: 'openrouter',
      model: 'model-a',
      configured: true,
    });
    expect(() => byId.get('assistant.modelInfo')?.outputSchema.parse({
      provider: 'openrouter',
      model: 'model-a',
      configured: 'yes',
    })).toThrow();
    expect(() => byId.get('spectrum.deleteImages')?.outputSchema.parse({
      deleted: 'one',
    })).toThrow();
  });
});

describe('project tool handler normalization', () => {
  it('normalizes legacy success and failure envelopes into V2 results', async () => {
    const success = getDefinition({
      dataRecognition: {
        searchHistoryByAgent: vi.fn().mockResolvedValue({
          ok: true,
          message: '找到一条记录',
          data: { rowCount: 1 },
        }),
      },
    }, 'dataRecognition.searchHistory');
    const failure = getDefinition({
      dataRecognition: {
        inspectCurrentByAgent: vi.fn().mockResolvedValue({
          ok: false,
          message: '当前没有识别结果',
        }),
      },
    }, 'dataRecognition.inspectCurrent');

    await expect(success.handler(
      { query: '320G6', limit: 8 },
      { runId: 'run-success', stepId: 'step-success' },
    )).resolves.toEqual(expect.objectContaining({
      status: 'success',
      message: '找到一条记录',
      data: { rowCount: 1 },
    }));
    await expect(failure.handler(
      {},
      { runId: 'run-error', stepId: 'step-error' },
    )).resolves.toEqual(expect.objectContaining({
      status: 'error',
      message: '当前没有识别结果',
      data: {},
    }));
  });

  it('accepts the real empty current-recognition payload with nullable result and image fields', async () => {
    const registry = createProjectToolRegistry({
      dataRecognition: {
        inspectCurrentByAgent: vi.fn().mockResolvedValue({
          ok: false,
          message: '当前没有可用的识别结果。',
          data: {
            fileName: '',
            model: '',
            modelCode: '',
            batchCode: '',
            rowCount: 0,
            result: null,
            hasImage: false,
            image: null,
          },
        }),
      },
    }, createAdapters());
    const definition = registry.get('dataRecognition.inspectCurrent');
    const rawResult = await definition?.handler(
      {},
      { runId: 'run-empty-current', stepId: 'step-empty-current' },
    );

    expect(() => registry.validateResult('dataRecognition.inspectCurrent', rawResult)).not.toThrow();
    expect(rawResult).toEqual(expect.objectContaining({
      status: 'error',
      data: expect.objectContaining({
        result: null,
        image: null,
        hasImage: false,
      }),
    }));
    expect(() => definition?.outputSchema.parse({
      result: 'not-a-structured-result',
      image: null,
    })).toThrow();
  });

  it('forces the split spectrum action before invoking legacy handlers', async () => {
    const searchByAgent = vi.fn().mockResolvedValue({ ok: true, message: 'searched', data: {} });
    const deleteByAgent = vi.fn().mockResolvedValue({ ok: true, message: 'deleted', data: {} });
    const App = { spectrumAnalysis: { searchByAgent, deleteByAgent } };

    const search = getDefinition(App, 'spectrum.searchImages');
    const remove = getDefinition(App, 'spectrum.deleteImages');
    await search.handler(
      { query: 'DSC', action: 'delete' } as any,
      { runId: 'run-search', stepId: 'step-search' },
    );
    await remove.handler(
      { target: 'image-1', action: 'search' } as any,
      { runId: 'run-delete', stepId: 'step-delete', idempotencyKey: 'delete-1' },
    );

    expect(searchByAgent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'search', query: 'DSC' }),
    );
    expect(deleteByAgent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', target: 'image-1' }),
    );
    expect(searchByAgent.mock.calls[0]).toHaveLength(1);
    expect(deleteByAgent.mock.calls[0]).toHaveLength(1);
  });

  it('sanitizes thrown errors and excludes secrets and raw image payloads from evidence', async () => {
    const inspectCurrentByAgent = vi.fn().mockRejectedValue(
      new Error('request failed with apiKey=top-secret and data:image/png;base64,RAW-DATA'),
    );
    const failed = getDefinition({
      dataRecognition: { inspectCurrentByAgent },
    }, 'dataRecognition.inspectCurrent');
    const failure = await failed.handler(
      {},
      { runId: 'run-throw', stepId: 'step-throw' },
    );

    expect(failure.status).toBe('error');
    expect(failure.diagnostics?.code).toBe('LEGACY_HANDLER_ERROR');
    expect(JSON.stringify(failure)).not.toContain('top-secret');
    expect(JSON.stringify(failure)).not.toContain('RAW-DATA');

    const modelInfo = getDefinition({
      config: {
        getFormConfig: () => ({
          aiProvider: 'openrouter',
          apiKey: 'sk-project-secret',
          rawImage: 'data:image/png;base64,PRIVATE-IMAGE',
        }),
        getResolvedModel: () => 'model-a',
      },
    }, 'assistant.modelInfo');
    const result = await modelInfo.handler(
      {},
      { runId: 'run-evidence', stepId: 'step-evidence' },
    );
    expect(result.status).toBe('success');
    expect(JSON.stringify(result.evidence)).not.toContain('sk-project-secret');
    expect(JSON.stringify(result.evidence)).not.toContain('PRIVATE-IMAGE');
    expect(JSON.stringify(result)).not.toContain('sk-project-secret');
  });

  it('delegates web search through the explicit adapter with the execution signal', async () => {
    const adapters = createAdapters();
    const tool = getDefinition({}, 'web.search', adapters);
    const controller = new AbortController();

    const result = await tool.handler(
      {
        queries: ['官方资料'],
        maxResults: 5,
        searchDepth: 'advanced',
        topic: 'news',
      },
      { runId: 'run-web', stepId: 'step-web', signal: controller.signal },
    );

    expect(adapters.searchWeb).toHaveBeenCalledWith({
      queries: ['官方资料'],
      maxResults: 5,
      searchDepth: 'advanced',
      topic: 'news',
    }, controller.signal);
    expect(result.status).toBe('success');
    expect(result.data.results).toHaveLength(1);
  });

  it('uses a preflight-only abort boundary for non-abortable legacy image generation', async () => {
    const generateImage = vi.fn().mockResolvedValue({ taskId: 'task-1' });
    const tool = getDefinition({ apimartMedia: { generateImage } }, 'media.generateImage');
    const activeController = new AbortController();

    const result = await tool.handler(
      { prompt: '产品海报', count: 1, referenceUrls: [] },
      {
        runId: 'run-image-write',
        stepId: 'step-image-write',
        signal: activeController.signal,
        idempotencyKey: 'image-write-1',
      },
    );

    expect(result.status).toBe('success');
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0]).toHaveLength(1);

    const abortedController = new AbortController();
    abortedController.abort();
    const aborted = await tool.handler(
      { prompt: '另一个海报', count: 1, referenceUrls: [] },
      {
        runId: 'run-image-aborted',
        stepId: 'step-image-aborted',
        signal: abortedController.signal,
        idempotencyKey: 'image-write-2',
      },
    );
    expect(aborted.status).toBe('cancelled');
    expect(generateImage).toHaveBeenCalledTimes(1);
  });

  it('reports an in-flight legacy write cancellation as outcome unknown', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const generateImage = vi.fn().mockImplementation(async () => {
      markStarted();
      return new Promise(() => {});
    });
    const store = createMemoryAgentRunStore();
    const registry = createProjectToolRegistry(
      { apimartMedia: { generateImage } },
      createAdapters(),
    );
    const engine = createAgentExecutionEngine({ registry, store });
    const waiting = await engine.executeSingleTool({
      runId: 'run-image-outcome-unknown',
      prompt: '生成图片',
      toolId: 'media.generateImage',
      input: { prompt: '产品海报' },
    });
    expect(waiting.diagnostics?.code).toBe('CONFIRMATION_REQUIRED');
    const confirmation = (await store.get('run-image-outcome-unknown'))?.pendingConfirmation;
    expect(confirmation).toBeDefined();

    const execution = engine.resumeConfirmedRun({
      runId: 'run-image-outcome-unknown',
      confirmation: confirmation!,
    });
    await started;
    const cancellation = engine.cancelRun('run-image-outcome-unknown');
    const result = await execution;
    await cancellation;

    expect(result.status).toBe('error');
    expect(result.diagnostics?.code).toBe('WRITE_OUTCOME_UNKNOWN');
    expect(result.actions).toEqual([{ type: 'reconcile_write', cause: 'cancelled' }]);
    expect(generateImage).toHaveBeenCalledTimes(1);
  });
});

describe('project capability page integration', () => {
  it('builds the web-search adapter from live configuration without exposing it to tool metadata', async () => {
    const searchWebForPromptDynamic = vi.fn().mockResolvedValue({ results: [{ title: 'result' }] });
    const adapters = createProjectToolAdapters({
      config: {
        getFormConfig: () => ({
          searchProvider: 'tavily',
          searchApiKey: 'search-secret',
        }),
      },
    }, { searchWebForPromptDynamic });
    const controller = new AbortController();

    await expect(adapters.searchWeb({
      queries: ['query one', 'query two'],
      maxResults: 7,
      searchDepth: 'advanced',
      topic: 'news',
    }, controller.signal)).resolves.toEqual({ results: [{ title: 'result' }] });
    expect(searchWebForPromptDynamic).toHaveBeenCalledWith(
      expect.objectContaining({ searchApiKey: 'search-secret' }),
      'query one\nquery two',
      expect.objectContaining({
        searchPlan: {
          queries: ['query one', 'query two'],
          maxResults: 7,
          searchDepth: 'advanced',
          topic: 'news',
        },
        signal: controller.signal,
      }),
    );
  });

  it('exposes the V2 registry and delegates manual reads to the execution engine', async () => {
    const storageItems = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return storageItems.size;
      },
      clear: () => storageItems.clear(),
      getItem: (key: string) => storageItems.get(key) ?? null,
      key: (index: number) => [...storageItems.keys()][index] ?? null,
      removeItem: (key: string) => storageItems.delete(key),
      setItem: (key: string, value: string) => storageItems.set(key, String(value)),
    });
    vi.stubGlobal('window', { performance });
    vi.stubGlobal('document', { getElementById: () => null });
    const searchHistoryByAgent = vi.fn().mockResolvedValue({
      ok: true,
      message: 'history',
      data: { rowCount: 2 },
    });
    legacyAppRef.current = {
      refs: { projectSkillPanel: null },
      constants: {
        NAV_PAGE_KEY: 'page',
        PAGE_DEFS: { dashboard: { title: '仪表盘' } },
      },
      utils: {
        escapeHtml: (value: unknown) => String(value ?? ''),
        readJson: () => [],
        writeJson: vi.fn(),
      },
      dataRecognition: { searchHistoryByAgent },
      config: { getFormConfig: () => ({ searchProvider: 'tavily' }) },
    };
    vi.resetModules();

    await import('../project-skills');

    expect(legacyAppRef.current.projectSkills.getToolRegistry().list().map((tool: any) => tool.id))
      .toEqual(REQUIRED_TOOL_IDS);
    const execution = await legacyAppRef.current.projectSkills.executeSkill(
      'dataRecognition.searchHistory',
      { query: '320G6', limit: 8 },
      { prompt: '查询识别历史', source: 'manual-test' },
    );
    expect(searchHistoryByAgent).toHaveBeenCalledTimes(1);
    expect(execution.result).toEqual(expect.objectContaining({
      ok: true,
      message: 'history',
      data: { rowCount: 2 },
    }));
    expect(JSON.parse(storageItems.get('gjh-agent-runs-v2') || '[]')).toHaveLength(1);
  });

  it('returns confirmation context and resumes one legacy write exactly once', async () => {
    const storageItems = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return storageItems.size;
      },
      clear: () => storageItems.clear(),
      getItem: (key: string) => storageItems.get(key) ?? null,
      key: (index: number) => [...storageItems.keys()][index] ?? null,
      removeItem: (key: string) => storageItems.delete(key),
      setItem: (key: string, value: string) => storageItems.set(key, String(value)),
    });
    vi.stubGlobal('window', { performance });
    vi.stubGlobal('document', { getElementById: () => null });
    const createFormulaByAgent = vi.fn().mockResolvedValue({
      ok: true,
      message: '配方已创建',
      data: {
        created: 1,
        items: [{ name: '阻燃配方', code: 'FR-01' }],
      },
    });
    legacyAppRef.current = {
      refs: { projectSkillPanel: null },
      constants: {
        NAV_PAGE_KEY: 'page',
        PAGE_DEFS: { dashboard: { title: '仪表盘' } },
      },
      utils: {
        escapeHtml: (value: unknown) => String(value ?? ''),
        readJson: () => [],
        writeJson: vi.fn(),
      },
      businessPages: { createFormulaByAgent },
      config: { getFormConfig: () => ({ searchProvider: 'tavily' }) },
    };
    vi.resetModules();
    await import('../project-skills');

    const waiting = await legacyAppRef.current.projectSkills.executeSkill(
      'formula.createRecipe',
      {
        name: '阻燃配方',
        code: 'FR-01',
        components: [{ material: 'ABS', percentage: 70 }],
      },
      { prompt: '创建阻燃配方', source: 'manual-test' },
    );
    expect(waiting.result.diagnostics?.code).toBe('CONFIRMATION_REQUIRED');
    expect(waiting.runId).toEqual(expect.any(String));
    expect(waiting.pendingConfirmation).toEqual(expect.objectContaining({
      runId: waiting.runId,
      toolId: 'formula.createRecipe',
    }));
    expect(createFormulaByAgent).toHaveBeenCalledTimes(0);

    const resumed = await legacyAppRef.current.projectSkills.resumeConfirmedRun({
      runId: waiting.runId,
      confirmation: waiting.pendingConfirmation,
    });
    expect(resumed.result).toEqual(expect.objectContaining({
      ok: true,
      message: '配方已创建',
      data: expect.objectContaining({ created: 1 }),
    }));
    expect(createFormulaByAgent).toHaveBeenCalledTimes(1);

    const replayed = await legacyAppRef.current.projectSkills.resumeConfirmedRun({
      runId: waiting.runId,
      confirmation: waiting.pendingConfirmation,
    });
    expect(replayed.result.data).toEqual(resumed.result.data);
    expect(createFormulaByAgent).toHaveBeenCalledTimes(1);
  });
});
