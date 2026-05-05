// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, utils } = App;
  let usdToCny = 6.838833;
  const PROVIDER_OPENROUTER = 'openrouter';
  const PROVIDER_LM_STUDIO = 'lmstudio';
  const SENSITIVE_CONFIG_PLACEHOLDER = '__REDACTED__';
  let activeProvider = constants.DEFAULT_CONFIG.aiProvider || PROVIDER_OPENROUTER;
  const providerDrafts = {};
  let openRouterModelRefreshTimer = null;
  let lastLoadedOpenRouterApiKey = '';
  let modelSearchQuery = '';

  const getSearchRefs = () => ({
    provider: document.getElementById('searchProvider'),
    apiKey: document.getElementById('searchApiKey'),
    depth: document.getElementById('searchDepth'),
    maxResults: document.getElementById('searchMaxResults'),
    topic: document.getElementById('searchTopic'),
    apiKeyToggle: document.getElementById('searchApiKeyToggle'),
    apiKeyIcon: document.querySelector('#searchApiKeyToggle .search-key-toggle-icon'),
  });

  const mountSearchConfigSection = () => {
    if (!refs.aiConfigForm || document.getElementById('searchConfigModule')) return;
    const anchor = refs.aiConfigForm.querySelector('.config-module-assistant');
    const article = document.createElement('article');
    article.className = 'panel config-module config-module-search';
    article.id = 'searchConfigModule';
    article.innerHTML = `
      <div class="config-module-head">
        <div class="config-module-title">
          <span class="config-module-icon"><i class="ti ti-world-search" aria-hidden="true"></i></span>
          <div>
            <div class="config-module-kicker">联网搜索</div>
            <h2>搜索增强</h2>
          </div>
        </div>
        <a class="panel-help" href="https://docs.tavily.com/documentation/api-reference/endpoint/search" target="_blank" rel="noreferrer">Tavily 文档</a>
      </div>
      <div class="form-grid">
        <div class="form-grid form-grid-3">
          <div class="field">
            <label for="searchProvider">
              <span class="field-label-main">
                <i class="field-label-icon ti ti-search" aria-hidden="true"></i>
                <span>搜索引擎</span>
              </span>
            </label>
            <select id="searchProvider" name="searchProvider">
              <option value="tavily">Tavily Search</option>
            </select>
          </div>
          <div class="field">
            <label for="searchDepth">
              <span class="field-label-main">
                <i class="field-label-icon ti ti-adjustments" aria-hidden="true"></i>
                <span>搜索深度</span>
              </span>
            </label>
            <select id="searchDepth" name="searchDepth">
              <option value="basic">basic</option>
              <option value="advanced">advanced</option>
            </select>
          </div>
          <div class="field">
            <label for="searchMaxResults">
              <span class="field-label-main">
                <i class="field-label-icon ti ti-list-numbers" aria-hidden="true"></i>
                <span>结果数量</span>
              </span>
            </label>
            <input id="searchMaxResults" name="searchMaxResults" type="number" min="1" max="10" value="5" />
          </div>
        </div>
        <div class="form-grid form-grid-3">
          <div class="field">
            <label for="searchTopic">
              <span class="field-label-main">
                <i class="field-label-icon ti ti-category" aria-hidden="true"></i>
                <span>搜索主题</span>
              </span>
            </label>
            <select id="searchTopic" name="searchTopic">
              <option value="general">general</option>
              <option value="news">news</option>
            </select>
          </div>
          <div class="field full search-key-field">
            <label class="field-label-row" for="searchApiKey">
              <span class="field-label-main">
                <i class="field-label-icon ti ti-key" aria-hidden="true"></i>
                <span>Tavily API Key</span>
              </span>
              <span class="field-label-note">仅保存在本机浏览器</span>
            </label>
            <div class="password-row">
              <input id="searchApiKey" name="searchApiKey" type="password" placeholder="tvly-..." autocomplete="off" />
              <button class="password-toggle" id="searchApiKeyToggle" type="button" aria-label="显示或隐藏 Tavily API 密钥">
                <i class="search-key-toggle-icon ti ti-eye" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    if (anchor) {
      refs.aiConfigForm.insertBefore(article, anchor);
    } else {
      refs.aiConfigForm.appendChild(article);
    }
  };

  const setStatus = (message, tone = 'success') => {
    if (!refs.configStatus) return;
    refs.configStatus.textContent = message;
    refs.configStatus.classList.remove('success', 'warn');
    refs.configStatus.classList.add(tone === 'warn' ? 'warn' : 'success');
  };

  const getResolvedModel = () => {
    if (!refs.modelSelect) return constants.DEFAULT_CONFIG.modelChoice;
    return refs.modelSelect.value;
  };

  const getModelProviderLabel = (modelValue = '') => {
    const raw = String(modelValue || '').trim();
    if (!raw) return 'OpenRouter';
    const provider = raw.split('/')[0] || raw;
    const normalized = provider.replace(/[-_]/g, ' ').trim().toLowerCase();
    const aliases = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      deepseek: 'DeepSeek',
      qwen: 'Qwen',
      meta: 'Meta',
      mistral: 'Mistral',
      cohere: 'Cohere',
      perplexity: 'Perplexity',
      xai: 'xAI',
      'x ai': 'xAI',
      openrouter: 'OpenRouter',
    };
    if (aliases[normalized]) return aliases[normalized];
    return normalized
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || provider;
  };

  const toIso88591HeaderValue = (value, fallback = '') => {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const asciiSafe = [...text].every((char) => char.charCodeAt(0) <= 255);
    if (asciiSafe) return text;
    const stripped = text.replace(/[^\x00-\xff]/g, '').trim();
    return stripped || fallback;
  };

  const isLmStudioProvider = (provider) => String(provider || '').toLowerCase() === PROVIDER_LM_STUDIO;

  const normalizeProvider = (provider) => (
    isLmStudioProvider(provider) ? PROVIDER_LM_STUDIO : PROVIDER_OPENROUTER
  );

  const getAiProvider = () => {
    const checked = Array.from(refs.aiProviderInputs || []).find((input) => input.checked);
    return normalizeProvider(checked?.value || activeProvider || constants.DEFAULT_CONFIG.aiProvider);
  };

  const getProviderDefaults = (provider = getAiProvider()) => (isLmStudioProvider(provider)
    ? {
        baseUrl: constants.DEFAULT_LM_STUDIO_BASE_URL,
        appTitle: 'LM Studio',
        modelChoice: '',
      }
    : {
        baseUrl: constants.DEFAULT_BASE_URL,
        appTitle: 'OpenRouter',
        modelChoice: constants.DEFAULT_CONFIG.modelChoice,
      });

  const normalizeLmStudioBaseUrl = (value) => {
    const normalized = utils.normalizeBaseUrl(value || constants.DEFAULT_LM_STUDIO_BASE_URL);
    return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`;
  };

  const isLocalBaseUrl = (value) => /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.)/i.test(String(value || ''));

  const normalizeOpenRouterBaseUrl = (value) => {
    const normalized = utils.normalizeBaseUrl(value || constants.DEFAULT_BASE_URL);
    return isLocalBaseUrl(normalized) ? constants.DEFAULT_BASE_URL : normalized;
  };

  const normalizeProviderBaseUrl = (provider, value) => (
    isLmStudioProvider(provider) ? normalizeLmStudioBaseUrl(value) : normalizeOpenRouterBaseUrl(value)
  );

  const makeProviderDraft = (provider, config = {}) => {
    const normalizedProvider = normalizeProvider(provider);
    const defaults = getProviderDefaults(normalizedProvider);
    const baseUrl = config.baseUrl || defaults.baseUrl;
    return {
      apiKey: isLmStudioProvider(normalizedProvider) ? '' : String(config.apiKey || '').trim(),
      baseUrl: normalizeProviderBaseUrl(normalizedProvider, baseUrl),
      appTitle: String(config.appTitle || defaults.appTitle || '').trim(),
      modelChoice: String(config.modelChoice || config.model || defaults.modelChoice || '').trim(),
    };
  };

  const ensureProviderDrafts = () => {
    providerDrafts[PROVIDER_OPENROUTER] = makeProviderDraft(
      PROVIDER_OPENROUTER,
      providerDrafts[PROVIDER_OPENROUTER] || {}
    );
    providerDrafts[PROVIDER_LM_STUDIO] = {
      ...makeProviderDraft(PROVIDER_LM_STUDIO, providerDrafts[PROVIDER_LM_STUDIO] || {}),
      apiKey: '',
      appTitle: 'LM Studio',
    };
  };

  const inferProviderFromConfig = (config = {}) => {
    if (config.aiProvider) return normalizeProvider(config.aiProvider);
    return isLocalBaseUrl(config.baseUrl)
      ? PROVIDER_LM_STUDIO
      : PROVIDER_OPENROUTER;
  };

  const readProviderFields = (provider = activeProvider) => {
    const normalizedProvider = normalizeProvider(provider);
    const defaults = getProviderDefaults(normalizedProvider);
    const rawBaseUrl = refs.openrouterBaseUrl?.value || defaults.baseUrl;
    return {
      apiKey: isLmStudioProvider(normalizedProvider) ? '' : (refs.openrouterApiKey?.value || '').trim(),
      baseUrl: normalizeProviderBaseUrl(normalizedProvider, rawBaseUrl),
      appTitle: isLmStudioProvider(normalizedProvider)
        ? 'LM Studio'
        : (refs.appTitle?.value || defaults.appTitle || '').trim(),
      modelChoice: refs.modelSelect?.value || providerDrafts[normalizedProvider]?.modelChoice || defaults.modelChoice,
    };
  };

  const storeActiveProviderDraft = () => {
    ensureProviderDrafts();
    providerDrafts[activeProvider] = {
      ...providerDrafts[activeProvider],
      ...readProviderFields(activeProvider),
    };
  };

  const setProviderRadio = (provider) => {
    const normalizedProvider = normalizeProvider(provider);
    if (refs.aiProviderOpenRouter) refs.aiProviderOpenRouter.checked = normalizedProvider === PROVIDER_OPENROUTER;
    if (refs.aiProviderLmStudio) refs.aiProviderLmStudio.checked = normalizedProvider === PROVIDER_LM_STUDIO;
  };

  const ensureModelOption = (modelChoice, label = '') => {
    if (!refs.modelSelect || !modelChoice) return;
    const existing = Array.from(refs.modelSelect.options).find((option) => option.value === modelChoice);
    if (existing) return;
    const option = document.createElement('option');
    option.value = modelChoice;
    option.textContent = label || `${modelChoice}（已保存）`;
    option.dataset.category = '已保存模型';
    refs.modelSelect.appendChild(option);
  };

  const applyProviderDraft = (provider) => {
    ensureProviderDrafts();
    activeProvider = normalizeProvider(provider);
    const draft = providerDrafts[activeProvider];
    setProviderRadio(activeProvider);
    if (refs.openrouterApiKey && !isLmStudioProvider(activeProvider)) {
      refs.openrouterApiKey.value = draft.apiKey || '';
    }
    if (refs.openrouterBaseUrl) refs.openrouterBaseUrl.value = draft.baseUrl || getProviderDefaults(activeProvider).baseUrl;
    if (refs.appTitle) refs.appTitle.value = draft.appTitle || getProviderDefaults(activeProvider).appTitle;
    if (refs.modelSelect) {
      if (isLmStudioProvider(activeProvider) && !draft.modelChoice) {
        setLmStudioModelPlaceholder();
      } else {
        ensureModelOption(draft.modelChoice);
        refs.modelSelect.value = draft.modelChoice || getProviderDefaults(activeProvider).modelChoice;
      }
    }
    syncProviderUi();
    syncModelState();
    syncPreview();
  };

  const getFormConfig = () => {
    activeProvider = getAiProvider();
    storeActiveProviderDraft();
    const aiProvider = activeProvider;
    const activeDraft = providerDrafts[aiProvider] || makeProviderDraft(aiProvider);
    return {
      aiProvider,
      apiKey: activeDraft.apiKey,
      baseUrl: activeDraft.baseUrl,
      appTitle: activeDraft.appTitle,
      httpReferer: (refs.httpReferer?.value || '').trim(),
      modelChoice: activeDraft.modelChoice,
      openrouterConfig: { ...providerDrafts[PROVIDER_OPENROUTER] },
      lmStudioConfig: { ...providerDrafts[PROVIDER_LM_STUDIO], apiKey: '', appTitle: 'LM Studio' },
      systemPrompt: (refs.systemPrompt?.value || '').trim() || constants.DEFAULT_CONFIG.systemPrompt,
      temperature: Number(refs.temperature?.value ?? constants.DEFAULT_CONFIG.temperature),
      maxTokens: Math.max(
        Number(refs.maxTokens?.value ?? constants.DEFAULT_CONFIG.maxTokens),
        constants.DEFAULT_CONFIG.maxTokens
      ),
      streamEnabled: Boolean(refs.streamEnabled?.checked),
      jsonMode: Boolean(refs.jsonMode?.checked),
      logEnabled: Boolean(refs.logEnabled?.checked),
      searchProvider: getSearchRefs().provider?.value || constants.DEFAULT_CONFIG.searchProvider,
      searchApiKey: (getSearchRefs().apiKey?.value || '').trim(),
      searchDepth: getSearchRefs().depth?.value || constants.DEFAULT_CONFIG.searchDepth,
      searchMaxResults: Math.max(1, Math.min(10, Number(getSearchRefs().maxResults?.value || constants.DEFAULT_CONFIG.searchMaxResults))),
      searchTopic: getSearchRefs().topic?.value || constants.DEFAULT_CONFIG.searchTopic,
      ossBucket: (refs.ossBucket?.value || '').trim(),
      ossEndpoint: (refs.ossEndpoint?.value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
      ossObjectKey: (refs.ossObjectKey?.value || '').trim().replace(/^\/+/, ''),
      ossAccessKeyId: (refs.ossAccessKeyId?.value || '').trim(),
      ossAccessKeySecret: (refs.ossAccessKeySecret?.value || '').trim(),
      ossExcelBackupPrefix: (refs.ossExcelBackupPrefix?.value || '').trim().replace(/^\/+/, ''),
    };
  };

  const isRedactedValue = (value) => String(value || '').trim() === SENSITIVE_CONFIG_PLACEHOLDER;

  const dropRedactedSecrets = (config = {}) => {
    const next = { ...config };
    if (isRedactedValue(next.apiKey)) next.apiKey = '';
    if (isRedactedValue(next.ossAccessKeyId)) next.ossAccessKeyId = '';
    if (isRedactedValue(next.ossAccessKeySecret)) next.ossAccessKeySecret = '';
    if (isRedactedValue(next.searchApiKey)) next.searchApiKey = '';
    if (next.openrouterConfig && typeof next.openrouterConfig === 'object') {
      next.openrouterConfig = { ...next.openrouterConfig };
      if (isRedactedValue(next.openrouterConfig.apiKey)) next.openrouterConfig.apiKey = '';
    }
    if (next.lmStudioConfig && typeof next.lmStudioConfig === 'object') {
      next.lmStudioConfig = { ...next.lmStudioConfig, apiKey: '' };
    }
    return next;
  };

  const redactSensitiveConfig = (config = {}) => {
    const next = JSON.parse(JSON.stringify(config || {}));
    const redact = (target, key) => {
      if (!target || !String(target[key] || '').trim()) return;
      target[key] = SENSITIVE_CONFIG_PLACEHOLDER;
    };
    redact(next, 'apiKey');
    redact(next, 'ossAccessKeyId');
    redact(next, 'ossAccessKeySecret');
    redact(next, 'searchApiKey');
    redact(next.openrouterConfig, 'apiKey');
    redact(next.lmStudioConfig, 'apiKey');
    return next;
  };

  const setFormConfig = (config) => {
    const next = { ...constants.DEFAULT_CONFIG, ...dropRedactedSecrets(config) };
    const provider = inferProviderFromConfig(next);
    providerDrafts[PROVIDER_OPENROUTER] = makeProviderDraft(PROVIDER_OPENROUTER, next.openrouterConfig || {});
    providerDrafts[PROVIDER_LM_STUDIO] = makeProviderDraft(PROVIDER_LM_STUDIO, next.lmStudioConfig || {});
    if (!next.openrouterConfig && !isLmStudioProvider(provider)) {
      providerDrafts[PROVIDER_OPENROUTER] = makeProviderDraft(PROVIDER_OPENROUTER, next);
    }
    if (!next.lmStudioConfig && isLmStudioProvider(provider)) {
      providerDrafts[PROVIDER_LM_STUDIO] = makeProviderDraft(PROVIDER_LM_STUDIO, next);
    }
    activeProvider = provider;
    setProviderRadio(activeProvider);
    const activeDraft = providerDrafts[activeProvider];
    if (refs.openrouterApiKey) {
      refs.openrouterApiKey.value = isLmStudioProvider(activeProvider)
        ? providerDrafts[PROVIDER_OPENROUTER]?.apiKey || ''
        : activeDraft.apiKey || '';
    }
    if (refs.openrouterBaseUrl) refs.openrouterBaseUrl.value = activeDraft.baseUrl || getProviderDefaults(activeProvider).baseUrl;
    if (refs.appTitle) refs.appTitle.value = activeDraft.appTitle || getProviderDefaults(activeProvider).appTitle;
    if (refs.httpReferer) refs.httpReferer.value = next.httpReferer || '';
    if (refs.modelSelect) {
      const modelChoice = activeDraft.modelChoice;
      ensureModelOption(modelChoice);
      refs.modelSelect.value = modelChoice;
    }
    syncProviderUi();
    if (refs.systemPrompt) refs.systemPrompt.value = next.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    if (refs.temperature) refs.temperature.value = String(next.temperature ?? constants.DEFAULT_CONFIG.temperature);
    if (refs.maxTokens) refs.maxTokens.value = String(next.maxTokens ?? constants.DEFAULT_CONFIG.maxTokens);
    if (refs.streamEnabled) refs.streamEnabled.checked = Boolean(next.streamEnabled);
    if (refs.jsonMode) refs.jsonMode.checked = Boolean(next.jsonMode);
    if (refs.logEnabled) refs.logEnabled.checked = Boolean(next.logEnabled);
    const searchRefs = getSearchRefs();
    if (searchRefs.provider) searchRefs.provider.value = next.searchProvider || constants.DEFAULT_CONFIG.searchProvider;
    if (searchRefs.apiKey) searchRefs.apiKey.value = next.searchApiKey || '';
    if (searchRefs.depth) searchRefs.depth.value = next.searchDepth || constants.DEFAULT_CONFIG.searchDepth;
    if (searchRefs.maxResults) searchRefs.maxResults.value = String(next.searchMaxResults || constants.DEFAULT_CONFIG.searchMaxResults);
    if (searchRefs.topic) searchRefs.topic.value = next.searchTopic || constants.DEFAULT_CONFIG.searchTopic;
    if (refs.ossBucket) refs.ossBucket.value = next.ossBucket || '';
    if (refs.ossEndpoint) refs.ossEndpoint.value = next.ossEndpoint || '';
    if (refs.ossObjectKey) refs.ossObjectKey.value = next.ossObjectKey || '';
    if (refs.ossAccessKeyId) refs.ossAccessKeyId.value = next.ossAccessKeyId || '';
    if (refs.ossAccessKeySecret) refs.ossAccessKeySecret.value = next.ossAccessKeySecret || '';
    if (refs.ossExcelBackupPrefix) refs.ossExcelBackupPrefix.value = next.ossExcelBackupPrefix || '';
    syncModelProviderField();
    syncModelState();
    syncTemperatureLabel();
    syncPreview();
  };

  const syncTemperatureFill = () => {
    if (!refs.temperature) return;
    const min = Number(refs.temperature.min ?? 0);
    const max = Number(refs.temperature.max ?? 100);
    const value = Number(refs.temperature.value ?? constants.DEFAULT_CONFIG.temperature);
    const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
    refs.temperature.style.setProperty('--slider-fill', `${Math.max(0, Math.min(100, fill))}%`);
  };

  const syncTemperatureLabel = () => {
    syncTemperatureFill();
    if (refs.temperatureValue && refs.temperature) {
      refs.temperatureValue.textContent = Number(refs.temperature.value || constants.DEFAULT_CONFIG.temperature).toFixed(1);
    }
  };

  const syncModelState = () => {
    if (!refs.modelSelect) return;
    syncModelDropdown();
    syncModelProviderField();
  };

  const syncModelProviderField = () => {
    if (!refs.appTitle) return;
    if (isLmStudioProvider(getAiProvider())) {
      refs.appTitle.value = 'LM Studio';
      return;
    }
    refs.appTitle.value = getModelProviderLabel(getResolvedModel());
  };

  const syncProviderUi = () => {
    const provider = getAiProvider();
    const isLocal = isLmStudioProvider(provider);
    const defaults = getProviderDefaults(provider);

    if (refs.apiKeyLabelText) {
      refs.apiKeyLabelText.textContent = isLocal ? 'LM Studio API 密钥（可选）' : 'OpenRouter API 密钥';
    }
    if (refs.apiKeyNoteText) {
      refs.apiKeyNoteText.textContent = isLocal ? '本地接入可留空' : '仅保存在本机浏览器';
    }
    if (refs.openrouterApiKey) {
      refs.openrouterApiKey.placeholder = isLocal ? '可留空' : 'sk-or-...';
    }
    if (refs.apiKeyField) {
      refs.apiKeyField.hidden = isLocal;
    }
    if (refs.aiProviderHelp) {
      refs.aiProviderHelp.hidden = isLocal;
    }
    if (refs.openrouterBaseUrl && !refs.openrouterBaseUrl.value.trim()) {
      refs.openrouterBaseUrl.value = defaults.baseUrl;
    }
    if (refs.appTitle && isLocal) {
      refs.appTitle.value = defaults.appTitle;
    } else if (refs.appTitle && !refs.appTitle.value.trim()) {
      refs.appTitle.value = defaults.appTitle;
    }
  };

  const syncApiKeyToggleIcon = () => {
    if (!refs.apiKeyToggle) return;
    const isVisible = refs.openrouterApiKey?.type === 'text';
    const icon = refs.apiKeyToggle.querySelector('.password-toggle-icon');
    if (icon) {
      icon.classList.toggle('ti-eye', !isVisible);
      icon.classList.toggle('ti-eye-off', isVisible);
    }
  };

  const maskKey = (key) => utils.maskKey(key);

  const syncPreview = () => {
    const config = getFormConfig();
    const resolvedModel = getResolvedModel();
    const baseUrl = utils.normalizeBaseUrl(config.baseUrl);

    if (refs.temperatureValue) refs.temperatureValue.textContent = config.temperature.toFixed(1);
    if (refs.previewModel) refs.previewModel.textContent = resolvedModel || '未选择';
    if (refs.previewBaseUrl) refs.previewBaseUrl.textContent = baseUrl;
    if (refs.previewAppTitle) refs.previewAppTitle.textContent = config.appTitle || constants.DEFAULT_CONFIG.appTitle;
    if (refs.previewKey) refs.previewKey.textContent = maskKey(config.apiKey);
    if (refs.previewFlags) {
      refs.previewFlags.textContent = [
        config.streamEnabled ? 'stream' : 'no-stream',
        config.jsonMode ? 'json' : 'text',
        config.logEnabled ? 'log' : 'no-log',
        config.searchApiKey ? 'web-search' : 'no-search',
      ].join(' / ');
    }
    const isLocal = isLmStudioProvider(config.aiProvider);
    const isAiReady = isLocal ? Boolean(resolvedModel) : Boolean(config.apiKey);
    if (refs.previewPrompt) {
      refs.previewPrompt.textContent = isAiReady
        ? `已准备使用 ${resolvedModel || '未选择的模型'} 调用 ${baseUrl}/chat/completions。导入/导出均使用 UTF-8。`
        : (isLocal
          ? '当前还没有选择本地模型。请先在 LM Studio 加载模型，再刷新模型列表。'
          : '当前还没有填写 API 密钥。先保存配置，再用“加载模型列表”或“检测配置”验证 OpenRouter 接入。');
    }
    if (refs.previewStatusText) {
      refs.previewStatusText.textContent = isAiReady
        ? `配置已就绪，模型为 ${resolvedModel || '未选择'}，保存后即可接入。`
        : (isLocal
          ? '本地模型配置未完成，请先选择 LM Studio 已加载的模型。'
          : '当前还没有保存过配置，先填写 API 密钥和模型 ID，然后点击保存。');
    }
  };

  const syncOssSecretToggleIcon = () => {
    if (!refs.ossSecretToggle) return;
    const isVisible = refs.ossAccessKeySecret?.type === 'text';
    const icon = refs.ossSecretToggle.querySelector('.oss-secret-toggle-icon');
    if (icon) {
      icon.classList.toggle('ti-eye', !isVisible);
      icon.classList.toggle('ti-eye-off', isVisible);
    }
  };

  const syncSearchKeyToggleIcon = () => {
    const searchRefs = getSearchRefs();
    if (!searchRefs.apiKeyIcon) return;
    const isVisible = searchRefs.apiKey?.type === 'text';
    searchRefs.apiKeyIcon.classList.toggle('ti-eye', !isVisible);
    searchRefs.apiKeyIcon.classList.toggle('ti-eye-off', isVisible);
  };

  const updateSavedState = (saved) => {
    setStatus(saved ? '本地配置：已保存' : '本地配置：未保存', saved ? 'success' : 'warn');
  };

  const saveLog = (entry) => {
    const current = utils.readJson(constants.CONFIG_LOG_KEY, []);
    const next = Array.isArray(current) ? [entry, ...current].slice(0, 10) : [entry];
    utils.writeJson(constants.CONFIG_LOG_KEY, next);
  };

  const persistConfig = (config) => {
    utils.writeJson(constants.CONFIG_STORAGE_KEY, config);
    if (config.logEnabled) {
      saveLog({
        type: 'save',
        at: new Date().toISOString(),
        model: getResolvedModel(),
        baseUrl: config.baseUrl,
      });
    }
  };

  const clearOpenRouterModelRefreshTimer = () => {
    if (openRouterModelRefreshTimer) {
      window.clearTimeout(openRouterModelRefreshTimer);
      openRouterModelRefreshTimer = null;
    }
  };

  const recordLoadedOpenRouterApiKey = (config = getFormConfig()) => {
    if (!config || isLmStudioProvider(config.aiProvider)) return;
    lastLoadedOpenRouterApiKey = String(config.apiKey || '').trim();
  };

  const shouldRefreshOpenRouterModels = (config = getFormConfig()) => {
    if (!config || isLmStudioProvider(config.aiProvider)) return false;
    const apiKey = String(config.apiKey || '').trim();
    return apiKey.length >= 20 && apiKey !== lastLoadedOpenRouterApiKey;
  };

  const refreshOpenRouterModelsAfterApiKeyUpdate = () => {
    clearOpenRouterModelRefreshTimer();
    const config = getFormConfig();
    if (!shouldRefreshOpenRouterModels(config)) return;

    openRouterModelRefreshTimer = window.setTimeout(() => {
      openRouterModelRefreshTimer = null;
      const nextConfig = getFormConfig();
      if (!shouldRefreshOpenRouterModels(nextConfig)) return;
      fetchModels().then((loaded) => {
        if (loaded) recordLoadedOpenRouterApiKey(nextConfig);
      });
    }, 450);
  };

  const readApiErrorMessage = async (response) => {
    const fallback = `HTTP ${response.status}`;
    const text = await response.text().catch(() => '');
    if (!text) return fallback;
    try {
      const payload = JSON.parse(text);
      const message = payload?.error?.message || payload?.message || payload?.error;
      return message ? `${fallback}：${String(message).slice(0, 240)}` : `${fallback}：${text.slice(0, 240)}`;
    } catch {
      return `${fallback}：${text.slice(0, 240)}`;
    }
  };

  const getRequestHeaders = (config) => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    if (config.httpReferer) headers['HTTP-Referer'] = config.httpReferer;
    const headerTitle = toIso88591HeaderValue(config.appTitle, 'Gjun Backend');
    if (headerTitle) headers['X-Title'] = headerTitle;
    return headers;
  };

  const loadSavedConfig = () => utils.readJson(constants.CONFIG_STORAGE_KEY, null);
  const getUsdToCnyRate = () => usdToCny;

  const getModelOptions = () => {
    if (!refs.modelSelect) return [];
    return Array.from(refs.modelSelect.options).map((option) => ({
      value: option.value,
      label: (option.textContent || option.value || '').trim(),
      pricing: (option.dataset?.pricing || '').trim(),
      category: (option.dataset?.category || '').trim(),
      contextLength: (option.dataset?.contextLength || '').trim(),
      outputModalities: (option.dataset?.outputModalities || '').trim(),
    }));
  };

  const splitModelLabel = (label) => {
    const text = String(label || '').trim();
    const match = text.match(/^(.*)\s+\((.+)\)$/);
    if (match) {
      return { title: match[1].trim(), desc: match[2].trim() };
    }
    return { title: text, desc: text };
  };

  const parseUsdPricing = (value) => {
    const amount = Number.parseFloat(value);
    return Number.isFinite(amount) ? amount : null;
  };

  const formatCnyPerMillionTokens = (usdPerToken) => {
    const price = parseUsdPricing(usdPerToken);
    if (price == null) return '—';
    const cnyPerMillion = price * 1000000 * usdToCny;
    return `¥${cnyPerMillion.toFixed(cnyPerMillion >= 100 ? 0 : 2)}`;
  };

  const getPricingLabel = (pricing) => {
    const prompt = formatCnyPerMillionTokens(pricing?.prompt);
    const completion = formatCnyPerMillionTokens(pricing?.completion);
    return `${prompt} / ${completion}`;
  };

  const formatContextLength = (value) => {
    const length = Number(value);
    if (!Number.isFinite(length) || length <= 0) return '';
    if (length >= 1000000) {
      const millions = length / 1000000;
      return `${millions.toFixed(Number.isInteger(millions) ? 0 : 1)}M`;
    }
    if (length >= 1000) {
      const thousands = length / 1000;
      return `${thousands.toFixed(Number.isInteger(thousands) ? 0 : 1)}K`;
    }
    return `${length}`;
  };

  const getModelCategoryLabel = (item) => {
    const modalities = Array.isArray(item?.architecture?.input_modalities) ? item.architecture.input_modalities : [];
    const outputModalities = Array.isArray(item?.output_modalities) ? item.output_modalities : [];
    const raw = String(item?.category || '').toLowerCase();
    if (modalities.includes('image') || raw.includes('image')) return '图像理解';
    if (outputModalities.includes('image') && !outputModalities.includes('text')) return '图像生成';
    if (outputModalities.includes('image') && outputModalities.includes('text')) return '图像/文本';
    if (raw.includes('code')) return '代码';
    if (raw.includes('reason') || raw.includes('think')) return '推理';
    return '通用文本';
  };

  const isSlowModelLike = (valueOrItem) => {
    const raw = typeof valueOrItem === 'string'
      ? valueOrItem
      : [
          valueOrItem?.id,
          valueOrItem?.name,
          valueOrItem?.category,
          valueOrItem?.architecture?.input_modalities?.join(' '),
        ].filter(Boolean).join(' ');

    const text = String(raw || '').toLowerCase();
    if (!text) return false;

    return [
      'reason',
      'thinking',
      'think',
      'reasoning',
      'research',
      'deepresearch',
      'preview',
      'r1',
      'o1',
      'o3',
      'slow',
    ].some((token) => text.includes(token)) || text.includes('推理');
  };

  const isFreeModelLike = (valueOrItem) => {
    const raw = typeof valueOrItem === 'string'
      ? valueOrItem
      : [
          valueOrItem?.id,
          valueOrItem?.name,
          valueOrItem?.category,
          valueOrItem?.pricing?.prompt,
          valueOrItem?.pricing?.completion,
        ].filter(Boolean).join(' ');

    const text = String(raw || '').toLowerCase();
    if (!text) return false;

    const pricing = typeof valueOrItem === 'string' ? null : valueOrItem?.pricing;
    const prompt = parseUsdPricing(pricing?.prompt);
    const completion = parseUsdPricing(pricing?.completion);
    const hasFreePricing = [prompt, completion].some((value) => value === 0)
      && [prompt, completion].every((value) => value == null || value === 0);

    return hasFreePricing
      || text.includes('free')
      || text.includes('鍏嶈垂')
      || text.includes('免费')
      || text.includes('free tier')
      || text.includes('free plan');
  };

  const isSlowOrFreeModelLike = (valueOrItem) => isSlowModelLike(valueOrItem) || isFreeModelLike(valueOrItem);

  const isInvalidLmStudioChatModel = (valueOrItem) => {
    const raw = typeof valueOrItem === 'string'
      ? valueOrItem
      : [
          valueOrItem?.id,
          valueOrItem?.name,
          valueOrItem?.type,
          valueOrItem?.object,
        ].filter(Boolean).join(' ');
    const text = String(raw || '').toLowerCase();
    return !text
      || text.includes('embedding')
      || text.includes('embed')
      || text.includes('rerank')
      || text.includes('text-embedding')
      || text.includes('nomic-embed');
  };

  const supportsImageOutput = (valueOrItem) => {
    const raw = typeof valueOrItem === 'string'
      ? valueOrItem
      : [
          valueOrItem?.id,
          valueOrItem?.name,
          valueOrItem?.category,
          valueOrItem?.output_modalities?.join(' '),
        ].filter(Boolean).join(' ');

    const text = String(raw || '').toLowerCase();
    return text.includes('image') || text.includes('图像');
  };

  const getProviderGroupLabel = (value) => {
    const raw = String(value || '');
    if (!raw) return '其他';
    const provider = raw.split('/')[0] || raw;
    return provider.replace(/[-_]/g, ' ').toUpperCase();
  };

  const getProviderSortRank = (value) => {
    const raw = String(value || '').toLowerCase();
    const provider = (raw.split('/')[0] || raw).replace(/[-_]/g, '');
    if (provider.includes('qwen')) return 0;
    if (provider.includes('deepseek')) return 1;
    if (provider.includes('kimi') || provider.includes('moonshot')) return 2;
    if (provider.includes('xiaomi')) return 3;
    if (provider.includes('openai') || provider.includes('gpt')) return 4;
    return 10;
  };

  const fetchUsdToCnyRate = async () => {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
      if (!response.ok) throw new Error(await readApiErrorMessage(response));
      const payload = await response.json();
      const rate = Number(payload?.rates?.CNY);
      if (Number.isFinite(rate) && rate > 0) {
        usdToCny = rate;
      }
    } catch {
      // Keep the baked-in fallback if the live rate fetch fails.
    }
  };

  const refreshPricingContext = async () => {
    await fetchUsdToCnyRate();
    syncModelDropdown();
    syncPreview();
  };

  const getModelTriggerLabel = () => {
    if (!refs.modelSelect) return constants.DEFAULT_CONFIG.modelChoice;
    if (isLmStudioProvider(getAiProvider()) && !refs.modelSelect.value) {
      const placeholder = Array.from(refs.modelSelect.options).find((option) => option.value === '');
      return (placeholder?.textContent || '请先在 LM Studio 加载本地模型').trim();
    }
    const match = Array.from(refs.modelSelect.options).find((option) => option.value === refs.modelSelect.value);
    const parts = splitModelLabel(match?.textContent || refs.modelSelect.value || constants.DEFAULT_CONFIG.modelChoice);
    return parts.title || refs.modelSelect.value || constants.DEFAULT_CONFIG.modelChoice;
  };

  const setModelDropdownOpen = (open) => {
    if (!refs.modelDropdown || !refs.modelSelectTrigger) return;
    refs.modelDropdown.classList.toggle('is-open', open);
    refs.modelSelectTrigger.setAttribute('aria-expanded', String(open));
  };

  const closeModelDropdown = () => {
    setModelDropdownOpen(false);
    if (modelSearchQuery) {
      modelSearchQuery = '';
      syncModelDropdown();
    }
  };

  const scrollActiveModelIntoView = () => {
    const panel = refs.modelSelectPanel;
    const activeOption = panel?.querySelector('.model-dropdown-option.is-active');
    if (!panel || !activeOption) return;

    const maxPanelHeight = Number.parseFloat(window.getComputedStyle(panel).maxHeight);
    const panelViewportHeight = Math.min(
      panel.scrollHeight,
      Number.isFinite(maxPanelHeight) ? maxPanelHeight : panel.clientHeight,
    );
    const panelRect = panel.getBoundingClientRect();
    const activeRect = activeOption.getBoundingClientRect();
    const activeTop = (activeRect.top - panelRect.top) + panel.scrollTop;
    const nextScrollTop = activeTop - ((panelViewportHeight - activeRect.height) / 2);
    panel.scrollTop = Math.max(0, nextScrollTop);
  };

  const openModelDropdown = () => {
    syncModelDropdown();
    setModelDropdownOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      refs.modelSelectPanel?.querySelector('.model-dropdown-search-input')?.focus();
      scrollActiveModelIntoView();
    }));
  };

  const normalizeModelSearchText = (value) => String(value || '').trim().toLowerCase();

  const modelMatchesSearch = (option, provider, query) => {
    if (!query) return true;
    return [
      option.title,
      option.value,
      option.label,
      provider,
      option.category,
      option.pricingLabel,
      option.contextLabel,
    ].some((value) => normalizeModelSearchText(value).includes(query));
  };

  const syncModelDropdown = () => {
    if (!refs.modelDropdown || !refs.modelSelectPanel || !refs.modelSelectTriggerLabel) return;
    const currentValue = refs.modelSelect?.value || constants.DEFAULT_CONFIG.modelChoice;
    const isLocal = isLmStudioProvider(getAiProvider());
    const searchQuery = normalizeModelSearchText(modelSearchQuery);
    refs.modelSelectTriggerLabel.textContent = getModelTriggerLabel();

    const options = getModelOptions();
    const grouped = new Map();

    options.forEach((option) => {
      const parts = splitModelLabel(option.label);
      const provider = getProviderGroupLabel(option.value);
      const pricing = option.pricing ? (() => {
        try {
          return JSON.parse(option.pricing);
        } catch {
          return null;
        }
      })() : null;
      const category = option.category || getModelCategoryLabel(option);
      const contextLabel = formatContextLength(option.contextLength);
      const items = grouped.get(provider) || [];
      items.push({
        ...option,
        title: parts.title,
        pricingLabel: getPricingLabel(pricing),
        category,
        contextLabel,
      });
      grouped.set(provider, items);
    });

    const filteredGroups = Array.from(grouped.entries())
      .map(([provider, items]) => [provider, items.filter((option) => modelMatchesSearch(option, provider, searchQuery))])
      .filter(([, items]) => items.length);
    const resultCount = filteredGroups.reduce((count, [, items]) => count + items.length, 0);
    const searchValue = utils.escapeHtml(modelSearchQuery);
    const resultsHtml = resultCount
      ? filteredGroups.map(([provider, items]) => {
      const rows = items.map((option) => {
        const isActive = option.value === currentValue;
        const showSubline = !isLocal && (option.pricingLabel || option.contextLabel);
        return `
          <button
            type="button"
            class="model-dropdown-option${isActive ? ' is-active' : ''}"
            role="option"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-model-value="${option.value}">
            <span class="model-dropdown-option-body">
              <span class="model-dropdown-option-label">${utils.escapeHtml(option.title)}</span>
              ${showSubline ? `<span class="model-dropdown-option-subline">
                <span class="model-dropdown-option-price">${utils.escapeHtml(option.pricingLabel)}</span>
                ${option.contextLabel ? `<span class="model-dropdown-option-context">${utils.escapeHtml(option.contextLabel)}</span>` : ''}
              </span>` : ''}
            </span>
            <span class="model-dropdown-option-meta">${utils.escapeHtml(option.category || '通用文本')}</span>
          </button>
        `;
      }).join('');

      return `
        <div class="model-dropdown-group">
          <div class="model-dropdown-group-title">${utils.escapeHtml(provider)}</div>
          <div class="model-dropdown-group-body">${rows}</div>
        </div>
      `;
    }).join('')
      : '<div class="model-dropdown-empty">没有匹配的模型</div>';

    refs.modelSelectPanel.innerHTML = `
      <label class="model-dropdown-search">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input
          class="model-dropdown-search-input"
          type="search"
          placeholder="搜索模型、供应商或分类"
          aria-label="搜索模型"
          value="${searchValue}">
      </label>
      <div class="model-dropdown-results">${resultsHtml}</div>
    `;
  };

  const buildModelSelect = (models) => {
    if (!refs.modelSelect) return;
    const currentResolved = getResolvedModel();
    const currentChoice = refs.modelSelect.value === 'custom' ? 'custom' : refs.modelSelect.value;
    const currentLabel = (() => {
      const match = Array.from(refs.modelSelect.options).find((option) => option.value === currentChoice);
      return (match?.textContent || currentChoice || constants.DEFAULT_CONFIG.modelChoice).trim();
    })();
    refs.modelSelect.innerHTML = '';

    const appendOption = (value, label) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      refs.modelSelect.appendChild(option);
    };

    const appendModelOption = (item) => {
      const id = item?.id || '';
      if (!id || seen.has(id)) return;
      seen.add(id);
      const label = item?.name ? `${item.name} (${id})` : id;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      option.dataset.pricing = JSON.stringify(item?.pricing || {});
      option.dataset.category = getModelCategoryLabel(item);
      option.dataset.contextLength = String(item?.context_length ?? '');
      option.dataset.inputModalities = JSON.stringify(item?.architecture?.input_modalities || []);
      option.dataset.outputModalities = JSON.stringify(item?.output_modalities || []);
      refs.modelSelect.appendChild(option);
    };

    const seen = new Set();
    const list = Array.isArray(models) ? models : [];

    list.forEach(appendModelOption);

    if (currentChoice && ![...refs.modelSelect.options].some((option) => option.value === currentChoice) && !isSlowOrFreeModelLike(currentChoice)) {
      const option = document.createElement('option');
      option.value = currentChoice;
      option.textContent = `${currentLabel}${currentLabel === currentChoice ? '' : '（已保存）'}`;
      option.dataset.category = '已保存模型';
      refs.modelSelect.appendChild(option);
    }

    if ([...refs.modelSelect.options].some((option) => option.value === currentChoice)) {
      refs.modelSelect.value = currentChoice;
    } else if (currentResolved) {
      refs.modelSelect.value = currentResolved;
    }

    syncModelState();
    syncModelDropdown();
  };

  const setLmStudioModelPlaceholder = () => {
    if (!refs.modelSelect) return;
    refs.modelSelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '请先在 LM Studio 加载本地模型';
    option.dataset.category = '本地模型';
    refs.modelSelect.appendChild(option);
    refs.modelSelect.value = '';
    syncModelState();
    syncPreview();
  };

  const fetchModels = async () => {
    const config = getFormConfig();
    const isLocal = isLmStudioProvider(config.aiProvider);
    const requestedProvider = config.aiProvider;
    const isStaleProviderRequest = () => getAiProvider() !== requestedProvider;
    if (isLocal && refs.openrouterBaseUrl) {
      refs.openrouterBaseUrl.value = config.baseUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      setStatus(isLocal ? '正在加载 LM Studio 本地模型列表…' : '正在加载 OpenRouter 官方模型列表…', 'success');
      const modelsUrl = isLocal ? `${config.baseUrl}/models` : `${config.baseUrl}/models?output_modalities=text,image`;
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: getRequestHeaders(config),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rawModels = Array.isArray(payload?.data)
        ? payload.data.filter((item) => item && typeof item.id === 'string')
        : [];
      if (isStaleProviderRequest()) return;
      const models = isLocal
        ? rawModels
          .filter((item) => !isInvalidLmStudioChatModel(item))
          .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
        : rawModels
          .filter((item) => item.id.includes('/'))
          .filter((item) => !isSlowOrFreeModelLike(item))
          .sort((a, b) => {
            const rankA = getProviderSortRank(a.id);
            const rankB = getProviderSortRank(b.id);
            if (rankA !== rankB) return rankA - rankB;
            const providerA = String(a.id || '').split('/')[0] || '';
            const providerB = String(b.id || '').split('/')[0] || '';
            if (providerA !== providerB) return providerA.localeCompare(providerB);
            return (b.created || 0) - (a.created || 0);
          });
      const savedModelChoice = providerDrafts[config.aiProvider]?.modelChoice || getResolvedModel();
      if (refs.modelSelect && !isLocal && isSlowOrFreeModelLike(savedModelChoice) && models.length) {
        refs.modelSelect.value = models[0].id;
      }
      buildModelSelect(models);
      if (isLocal && refs.modelSelect && models.length) {
        const hasSavedLocalModel = models.some((item) => item.id === savedModelChoice);
        refs.modelSelect.value = hasSavedLocalModel ? savedModelChoice : models[0].id;
        providerDrafts[PROVIDER_LM_STUDIO] = {
          ...providerDrafts[PROVIDER_LM_STUDIO],
          modelChoice: refs.modelSelect.value,
        };
        syncModelState();
        syncPreview();
      } else if (isLocal && refs.modelSelect && !models.length) {
        setLmStudioModelPlaceholder();
      } else if (!isLocal && refs.modelSelect) {
        providerDrafts[PROVIDER_OPENROUTER] = {
          ...providerDrafts[PROVIDER_OPENROUTER],
          modelChoice: refs.modelSelect.value,
        };
      }
      if (!isLocal) {
        recordLoadedOpenRouterApiKey(config);
      }
      setStatus(isLocal
        ? `已加载 LM Studio 本地模型列表：${models.length || 0} 项`
        : `已加载 OpenRouter 官方模型列表：${models.length || 0} 项`, 'success');
      if (config.logEnabled) saveLog({ type: 'models', provider: config.aiProvider, at: new Date().toISOString(), count: models.length || 0 });
      return true;
    } catch (error) {
      if (isStaleProviderRequest()) return;
      if (isLocal) setLmStudioModelPlaceholder();
      setStatus(isLocal
        ? `本地模型加载失败：请确认 LM Studio 已启动并加载模型（${error?.message || '未知错误'}）`
        : `模型加载失败：${error?.message || '未知错误'}`, 'warn');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  const testConfig = async () => {
    const config = getFormConfig();
    const model = getResolvedModel();
    if (!isLmStudioProvider(config.aiProvider) && !config.apiKey) {
      setStatus('请先填写 API Key 再测试接入。', 'warn');
      return;
    }
    if (!model) {
      setStatus('请先选择一个模型。', 'warn');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const testMessages = [
      { role: 'system', content: config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt },
      { role: 'user', content: '请用一句话回复：连接测试通过。' },
    ];
    const callStartedAt = new Date().toISOString();
    const callStartMs = window.performance?.now?.() ?? Date.now();

    try {
      setStatus('正在测试聊天接入…', 'success');
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: getRequestHeaders(config),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: testMessages,
          temperature: 0.2,
          max_tokens: 32,
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response));
      const payload = await response.json();
      const answer = payload?.choices?.[0]?.message?.content?.trim();
      setStatus(answer
        ? `接入正常，AI 已返回：${answer.slice(0, 24)}${answer.length > 24 ? '…' : ''}`
        : '接入正常，AI 已返回结果。', 'success');
      App.aiCallAnalysis?.record?.({
        source: 'config-test',
        provider: config.aiProvider,
        model,
        endpoint: `${config.baseUrl}/chat/completions`,
        pageId: 'ai-config',
        startedAt: callStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: (window.performance?.now?.() ?? Date.now()) - callStartMs,
        status: 'success',
        statusText: 'connection-ok',
        prompt: '配置中心连接测试',
        responsePreview: answer || '',
        apiUsage: payload?.usage || null,
        requestMessages: testMessages,
        completionText: answer || '',
        requestMeta: {
          messages: testMessages.length,
          images: 0,
          files: 0,
          attachedData: false,
          stream: false,
        },
      });
    } catch (error) {
      setStatus(`测试失败：${error?.message || '网络或权限错误'}`, 'warn');
      App.aiCallAnalysis?.record?.({
        source: 'config-test',
        provider: config.aiProvider,
        model,
        endpoint: `${config.baseUrl}/chat/completions`,
        pageId: 'ai-config',
        startedAt: callStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: (window.performance?.now?.() ?? Date.now()) - callStartMs,
        status: 'failed',
        error: error?.message || '网络或权限错误',
        prompt: '配置中心连接测试',
        requestMessages: testMessages,
        requestMeta: {
          messages: testMessages.length,
          images: 0,
          files: 0,
          attachedData: false,
          stream: false,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const importConfig = async () => {
    if (!refs.configFileInput) return;
    refs.configFileInput.value = '';
    refs.configFileInput.click();
  };

  const handleConfigImport = async (file) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setFormConfig(dropRedactedSecrets(parsed));
      persistConfig(getFormConfig());
      updateSavedState(true);
      syncPreview();
      setStatus('已导入配置', 'success');
      App.notify?.success?.('已导入配置', { key: 'config-import' });
    } catch (error) {
      setStatus(`导入失败：${error?.message || '文件格式错误'}`, 'warn');
      App.notify?.warn?.(`导入失败：${error?.message || '文件格式错误'}`, { key: 'config-import-failed' });
    }
  };

  const exportConfig = () => {
    utils.downloadUtf8Json(`openrouter-config-${new Date().toISOString().slice(0, 10)}.json`, redactSensitiveConfig(getFormConfig()));
    setStatus('已导出配置（密钥已脱敏）', 'success');
    App.notify?.success?.('已导出配置（密钥已脱敏）', { key: 'config-export' });
  };

  const copyConfig = async () => {
    try {
      const copied = await utils.copyText(JSON.stringify(redactSensitiveConfig(getFormConfig()), null, 2));
      setStatus(copied ? '配置已复制到剪贴板（密钥已脱敏）' : '当前环境不支持剪贴板复制', copied ? 'success' : 'warn');
      App.notify?.[copied ? 'success' : 'warn']?.(copied ? '配置已复制到剪贴板（密钥已脱敏）' : '当前环境不支持剪贴板复制', { key: 'config-copy' });
    } catch (error) {
      setStatus(`复制失败：${error?.message || '未知错误'}`, 'warn');
      App.notify?.warn?.(`复制失败：${error?.message || '未知错误'}`, { key: 'config-copy-failed' });
    }
  };

  const clearConfig = async () => {
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '清空本地配置',
      message: '确认清空本地配置并恢复默认值？',
      confirmText: '确认清空',
    });
    if (!confirmed) return;
    clearOpenRouterModelRefreshTimer();
    localStorage.removeItem(constants.CONFIG_STORAGE_KEY);
    setFormConfig(constants.DEFAULT_CONFIG);
    lastLoadedOpenRouterApiKey = '';
    updateSavedState(false);
    syncPreview();
    setStatus('已清空本地配置', 'warn');
    App.notify?.warn?.('已清空本地配置', { key: 'config-clear' });
  };

  const syncConfigBindings = () => {
    document.querySelectorAll('.provider-segment').forEach((segment) => {
      segment.addEventListener('click', (event) => {
        const option = event.target.closest('.provider-option');
        if (!option || !segment.contains(option)) return;
        event.preventDefault();
        const input = option.querySelector('input[name="aiProvider"]');
        if (!input) return;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    Array.from(refs.aiProviderInputs || []).forEach((input) => {
      input.addEventListener('change', () => {
        clearOpenRouterModelRefreshTimer();
        const nextProvider = normalizeProvider(input.value);
        if (nextProvider === activeProvider) {
          setProviderRadio(activeProvider);
          return;
        }
        storeActiveProviderDraft();
        applyProviderDraft(nextProvider);
        fetchModels();
      });
    });

    if (refs.modelSelect) {
      refs.modelSelect.addEventListener('change', () => {
        syncModelState();
        storeActiveProviderDraft();
        syncPreview();
      });
    }

    [
      refs.openrouterApiKey,
      refs.openrouterBaseUrl,
      refs.appTitle,
      refs.httpReferer,
      refs.systemPrompt,
      refs.maxTokens,
      getSearchRefs().provider,
      getSearchRefs().apiKey,
      getSearchRefs().depth,
      getSearchRefs().maxResults,
      getSearchRefs().topic,
      refs.ossBucket,
      refs.ossEndpoint,
      refs.ossObjectKey,
      refs.ossAccessKeyId,
      refs.ossAccessKeySecret,
      refs.ossExcelBackupPrefix,
    ]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('input', () => {
        syncProviderUi();
        storeActiveProviderDraft();
        syncPreview();
        if (input === refs.openrouterApiKey) {
          refreshOpenRouterModelsAfterApiKeyUpdate();
        }
      }));

    refs.temperature?.addEventListener('input', () => {
      syncTemperatureLabel();
      syncPreview();
    });

    refs.openrouterBaseUrl?.addEventListener('blur', () => {
      if (!isLmStudioProvider(getAiProvider())) return;
      refs.openrouterBaseUrl.value = normalizeLmStudioBaseUrl(refs.openrouterBaseUrl.value);
      storeActiveProviderDraft();
      syncPreview();
      fetchModels();
    });

    [refs.streamEnabled, refs.jsonMode, refs.logEnabled]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('change', syncPreview));

    refs.aiConfigForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const config = getFormConfig();
      const hasOssConfig = Boolean(config.ossBucket || config.ossEndpoint || config.ossObjectKey || config.ossAccessKeyId || config.ossAccessKeySecret);
      if (!isLmStudioProvider(config.aiProvider) && !config.apiKey && !hasOssConfig) {
        setStatus('请先填写 OpenRouter API 密钥或 OSS 配置', 'warn');
        App.notify?.warn?.('请先填写 OpenRouter API 密钥或 OSS 配置', { key: 'config-save-missing-secret' });
        return;
      }
      persistConfig(config);
      clearOpenRouterModelRefreshTimer();
      if (!isLmStudioProvider(config.aiProvider) && config.apiKey) {
        fetchModels();
      }
      updateSavedState(true);
      syncPreview();
      App.notify?.success?.('配置已保存', { key: 'config-save' });
    });

    refs.apiKeyToggle?.addEventListener('click', () => {
      if (!refs.openrouterApiKey) return;
      refs.openrouterApiKey.type = refs.openrouterApiKey.type === 'password' ? 'text' : 'password';
      refs.apiKeyToggle.setAttribute(
        'aria-label',
        refs.openrouterApiKey.type === 'password' ? '显示 API 密钥' : '隐藏 API 密钥',
      );
      refs.apiKeyToggle.classList.toggle('is-visible', refs.openrouterApiKey.type === 'text');
      syncApiKeyToggleIcon();
    });

    refs.ossSecretToggle?.addEventListener('click', () => {
      if (!refs.ossAccessKeySecret) return;
      refs.ossAccessKeySecret.type = refs.ossAccessKeySecret.type === 'password' ? 'text' : 'password';
      refs.ossSecretToggle.setAttribute(
        'aria-label',
        refs.ossAccessKeySecret.type === 'password' ? '显示 OSS 密钥' : '隐藏 OSS 密钥',
      );
      refs.ossSecretToggle.classList.toggle('is-visible', refs.ossAccessKeySecret.type === 'text');
      syncOssSecretToggleIcon();
    });

    getSearchRefs().apiKeyToggle?.addEventListener('click', () => {
      const searchRefs = getSearchRefs();
      if (!searchRefs.apiKey) return;
      searchRefs.apiKey.type = searchRefs.apiKey.type === 'password' ? 'text' : 'password';
      searchRefs.apiKeyToggle.setAttribute(
        'aria-label',
        searchRefs.apiKey.type === 'password' ? '显示 Tavily API 密钥' : '隐藏 Tavily API 密钥',
      );
      searchRefs.apiKeyToggle.classList.toggle('is-visible', searchRefs.apiKey.type === 'text');
      syncSearchKeyToggleIcon();
    });

    refs.modelSelectTrigger?.addEventListener('click', () => {
      const isOpen = refs.modelDropdown?.classList.contains('is-open');
      if (isOpen) {
        closeModelDropdown();
      } else {
        openModelDropdown();
      }
    });

    refs.modelSelectTrigger?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModelDropdown();
      } else if (event.key === 'Escape') {
        closeModelDropdown();
      }
    });

    refs.modelSelectPanel?.addEventListener('input', (event) => {
      const searchInput = event.target.closest('.model-dropdown-search-input');
      if (!searchInput) return;
      modelSearchQuery = searchInput.value || '';
      syncModelDropdown();
      requestAnimationFrame(() => {
        const nextInput = refs.modelSelectPanel?.querySelector('.model-dropdown-search-input');
        if (!nextInput) return;
        nextInput.focus();
        nextInput.setSelectionRange(modelSearchQuery.length, modelSearchQuery.length);
      });
    });

    refs.modelSelectPanel?.addEventListener('click', (event) => {
      const option = event.target.closest('[data-model-value]');
      if (!option || !refs.modelSelect) return;
      const nextValue = option.getAttribute('data-model-value');
      refs.modelSelect.value = nextValue || refs.modelSelect.value;
      refs.modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      closeModelDropdown();
      refs.modelSelectTrigger?.focus();
    });

    refs.modelSelectPanel?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModelDropdown();
        refs.modelSelectTrigger?.focus();
      }
    });

    document.addEventListener('click', (event) => {
      if (!refs.modelDropdown || refs.modelDropdown.contains(event.target)) return;
      closeModelDropdown();
    });

    refs.loadModelsBtn?.addEventListener('click', fetchModels);
    refs.importConfigBtn?.addEventListener('click', importConfig);
    refs.exportConfigBtn?.addEventListener('click', exportConfig);
    refs.testConfigBtn?.addEventListener('click', testConfig);
    refs.clearConfigBtn?.addEventListener('click', clearConfig);
    refs.copyConfigBtn?.addEventListener('click', copyConfig);
    refs.syncPreviewBtn?.addEventListener('click', syncPreview);
    refs.resetPreviewBtn?.addEventListener('click', () => {
      setFormConfig(constants.DEFAULT_CONFIG);
      syncPreview();
    });
    refs.refreshPreviewBtn?.addEventListener('click', syncPreview);
    refs.copyEndpointBtn?.addEventListener('click', async () => {
      try {
        const endpoint = `${utils.normalizeBaseUrl(getFormConfig().baseUrl)}/chat/completions`;
        const copied = await utils.copyText(endpoint);
        setStatus(copied ? '接口地址已复制' : '当前环境不支持剪贴板复制', copied ? 'success' : 'warn');
      } catch (error) {
        setStatus(`复制失败：${error?.message || '未知错误'}`, 'warn');
      }
    });

    refs.configFileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) handleConfigImport(file);
    });
  };

  const init = () => {
    mountSearchConfigSection();
    syncConfigBindings();

    const savedConfig = loadSavedConfig();
    if (savedConfig) {
      setFormConfig(savedConfig);
      updateSavedState(true);
    } else {
      setFormConfig(constants.DEFAULT_CONFIG);
      updateSavedState(false);
    }
    lastLoadedOpenRouterApiKey = '';

    syncApiKeyToggleIcon();
    syncOssSecretToggleIcon();
    syncSearchKeyToggleIcon();
    syncTemperatureLabel();
    syncPreview();
    const initialConfig = getFormConfig();
    if (!isLmStudioProvider(initialConfig.aiProvider) && initialConfig.apiKey) {
      window.setTimeout(() => {
        fetchModels();
      }, 0);
    } else {
      setStatus('配置已加载；模型列表和实时汇率将在手动刷新时联网获取。', 'success');
    }
  };

  App.config = {
    init,
    getResolvedModel,
    getFormConfig,
    setFormConfig,
    syncModelState,
    syncTemperatureLabel,
    syncPreview,
    updateSavedState,
    persistConfig,
    getRequestHeaders,
    loadSavedConfig,
    getUsdToCnyRate,
    buildModelSelect,
    fetchModels,
    refreshPricingContext,
    testConfig,
  };
})();
