(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, utils } = App;

  const setStatus = (message, tone = 'success') => {
    if (!refs.configStatus) return;
    refs.configStatus.textContent = message;
    refs.configStatus.classList.remove('success', 'warn');
    refs.configStatus.classList.add(tone === 'warn' ? 'warn' : 'success');
  };

  const getResolvedModel = () => {
    if (!refs.modelSelect) return constants.DEFAULT_CONFIG.modelChoice;
    return refs.modelSelect.value === 'custom' ? (refs.customModel?.value || '').trim() : refs.modelSelect.value;
  };

  const getFormConfig = () => ({
    apiKey: (refs.openrouterApiKey?.value || '').trim(),
    baseUrl: utils.normalizeBaseUrl(refs.openrouterBaseUrl?.value || constants.DEFAULT_BASE_URL),
    appTitle: (refs.appTitle?.value || constants.DEFAULT_CONFIG.appTitle || '').trim(),
    httpReferer: (refs.httpReferer?.value || '').trim(),
    modelChoice: refs.modelSelect?.value || constants.DEFAULT_CONFIG.modelChoice,
    customModel: (refs.customModel?.value || '').trim(),
    systemPrompt: (refs.systemPrompt?.value || '').trim() || constants.DEFAULT_CONFIG.systemPrompt,
    temperature: Number(refs.temperature?.value ?? constants.DEFAULT_CONFIG.temperature),
    maxTokens: Number(refs.maxTokens?.value ?? constants.DEFAULT_CONFIG.maxTokens),
    streamEnabled: Boolean(refs.streamEnabled?.checked),
    jsonMode: Boolean(refs.jsonMode?.checked),
    logEnabled: Boolean(refs.logEnabled?.checked),
  });

  const setFormConfig = (config) => {
    const next = { ...constants.DEFAULT_CONFIG, ...config };
    if (refs.openrouterApiKey) refs.openrouterApiKey.value = next.apiKey || '';
    if (refs.openrouterBaseUrl) refs.openrouterBaseUrl.value = next.baseUrl || constants.DEFAULT_BASE_URL;
    if (refs.appTitle) refs.appTitle.value = next.appTitle || constants.DEFAULT_CONFIG.appTitle;
    if (refs.httpReferer) refs.httpReferer.value = next.httpReferer || '';
    if (refs.modelSelect) refs.modelSelect.value = next.modelChoice || next.model || constants.DEFAULT_CONFIG.modelChoice;
    if (refs.customModel) refs.customModel.value = next.customModel || next.model || '';
    if (refs.systemPrompt) refs.systemPrompt.value = next.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    if (refs.temperature) refs.temperature.value = String(next.temperature ?? constants.DEFAULT_CONFIG.temperature);
    if (refs.maxTokens) refs.maxTokens.value = String(next.maxTokens ?? constants.DEFAULT_CONFIG.maxTokens);
    if (refs.streamEnabled) refs.streamEnabled.checked = Boolean(next.streamEnabled);
    if (refs.jsonMode) refs.jsonMode.checked = Boolean(next.jsonMode);
    if (refs.logEnabled) refs.logEnabled.checked = Boolean(next.logEnabled);
    syncModelState();
    syncTemperatureLabel();
    syncPreview();
  };

  const syncTemperatureLabel = () => {
    if (refs.temperatureValue && refs.temperature) {
      refs.temperatureValue.textContent = Number(refs.temperature.value || constants.DEFAULT_CONFIG.temperature).toFixed(1);
    }
  };

  const syncModelState = () => {
    if (!refs.modelSelect || !refs.customModel) return;
    const isCustom = refs.modelSelect.value === 'custom';
    refs.customModel.disabled = !isCustom;
    refs.customModel.style.opacity = isCustom ? '1' : '.6';
    refs.customModel.placeholder = isCustom
      ? '例如：google/gemini-2.5-pro-preview'
      : '选择“自定义”后可输入模型 ID';
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
      ].join(' / ');
    }
    if (refs.previewPrompt) {
      refs.previewPrompt.textContent = config.apiKey
        ? `已准备使用 ${resolvedModel || '未选择的模型'} 调用 ${baseUrl}/chat/completions。导入/导出均使用 UTF-8。`
        : '当前还没有填写 API 密钥。先保存配置，再用“加载模型列表”或“检测配置”验证 OpenRouter 接入。';
    }
    if (refs.previewStatusText) {
      refs.previewStatusText.textContent = config.apiKey
        ? `配置已就绪，模型为 ${resolvedModel || '未选择'}，保存后即可接入。`
        : '当前还没有保存过配置，先填写 API 密钥和模型 ID，然后点击保存。';
    }
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

  const getRequestHeaders = (config) => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    if (config.httpReferer) headers['HTTP-Referer'] = config.httpReferer;
    if (config.appTitle) headers['X-Title'] = config.appTitle;
    return headers;
  };

  const loadSavedConfig = () => utils.readJson(constants.CONFIG_STORAGE_KEY, null);

  const buildModelSelect = (models) => {
    if (!refs.modelSelect) return;
    const currentResolved = getResolvedModel();
    const currentChoice = refs.modelSelect.value === 'custom' ? 'custom' : refs.modelSelect.value;
    refs.modelSelect.innerHTML = '';

    const appendOption = (value, label) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      refs.modelSelect.appendChild(option);
    };

    const seen = new Set();
    const list = Array.isArray(models) && models.length
      ? models
      : [
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' },
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
          { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
          { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
        ];

    list.forEach((item) => {
      const id = item?.id || '';
      if (!id || seen.has(id)) return;
      seen.add(id);
      appendOption(id, item?.name ? `${item.name} (${id})` : id);
    });

    appendOption('custom', '自定义模型 ID');

    if ([...refs.modelSelect.options].some((option) => option.value === currentChoice)) {
      refs.modelSelect.value = currentChoice;
    } else if (currentResolved) {
      refs.modelSelect.value = 'custom';
      if (refs.customModel) refs.customModel.value = currentResolved;
    }

    syncModelState();
  };

  const fetchModels = async () => {
    const config = getFormConfig();
    if (!config.apiKey) {
      setStatus('请先填写 OpenRouter API 密钥', 'warn');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      setStatus('正在加载模型列表…', 'success');
      const response = await fetch(`${config.baseUrl}/models?output_modalities=text`, {
        method: 'GET',
        headers: getRequestHeaders(config),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const models = Array.isArray(payload?.data)
        ? payload.data
          .filter((item) => item && typeof item.id === 'string' && item.id.includes('/'))
          .sort((a, b) => (b.created || 0) - (a.created || 0))
          .slice(0, 20)
        : [];
      buildModelSelect(models);
      setStatus(`已加载 ${models.length || 0} 个模型`, 'success');
      if (config.logEnabled) saveLog({ type: 'models', at: new Date().toISOString(), count: models.length || 0 });
    } catch (error) {
      buildModelSelect([]);
      setStatus(`模型加载失败：${error?.message || '未知错误'}`, 'warn');
    } finally {
      clearTimeout(timeout);
    }
  };

  const testConfig = async () => {
    const config = getFormConfig();
    const model = getResolvedModel();
    if (!config.apiKey) {
      setStatus('请先填写 API Key 再测试接入。', 'warn');
      return;
    }
    if (!model) {
      setStatus('请先选择一个模型。', 'warn');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      setStatus('正在测试聊天接入…', 'success');
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: getRequestHeaders(config),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt },
            { role: 'user', content: '请用一句话回复：连接测试通过。' },
          ],
          temperature: 0.2,
          max_tokens: 32,
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const answer = payload?.choices?.[0]?.message?.content?.trim();
      setStatus(answer
        ? `接入正常，AI 已返回：${answer.slice(0, 24)}${answer.length > 24 ? '…' : ''}`
        : '接入正常，AI 已返回结果。', 'success');
    } catch (error) {
      setStatus(`测试失败：${error?.message || '网络或权限错误'}`, 'warn');
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
      setFormConfig(parsed);
      persistConfig(getFormConfig());
      updateSavedState(true);
      syncPreview();
      setStatus('已导入配置', 'success');
    } catch (error) {
      setStatus(`导入失败：${error?.message || '文件格式错误'}`, 'warn');
    }
  };

  const exportConfig = () => {
    utils.downloadUtf8Json(`openrouter-config-${new Date().toISOString().slice(0, 10)}.json`, getFormConfig());
    setStatus('已导出配置', 'success');
  };

  const copyConfig = async () => {
    try {
      const copied = await utils.copyText(JSON.stringify(getFormConfig(), null, 2));
      setStatus(copied ? '配置已复制到剪贴板' : '当前环境不支持剪贴板复制', copied ? 'success' : 'warn');
    } catch (error) {
      setStatus(`复制失败：${error?.message || '未知错误'}`, 'warn');
    }
  };

  const clearConfig = () => {
    localStorage.removeItem(constants.CONFIG_STORAGE_KEY);
    setFormConfig(constants.DEFAULT_CONFIG);
    updateSavedState(false);
    syncPreview();
    setStatus('已清空本地配置', 'warn');
  };

  const applyDefaults = (shouldSave = false) => {
    setFormConfig(constants.DEFAULT_CONFIG);
    updateSavedState(false);
    if (shouldSave) persistConfig(getFormConfig());
  };

  const syncConfigBindings = () => {
    if (refs.modelSelect) {
      refs.modelSelect.addEventListener('change', () => {
        syncModelState();
        syncPreview();
      });
    }

    [refs.openrouterApiKey, refs.openrouterBaseUrl, refs.appTitle, refs.httpReferer, refs.customModel, refs.systemPrompt, refs.maxTokens]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('input', syncPreview));

    refs.temperature?.addEventListener('input', () => {
      syncTemperatureLabel();
      syncPreview();
    });

    [refs.streamEnabled, refs.jsonMode, refs.logEnabled]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('change', syncPreview));

    refs.aiConfigForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const config = getFormConfig();
      if (!config.apiKey) {
        setStatus('请先填写 OpenRouter API 密钥', 'warn');
        return;
      }
      if (refs.modelSelect?.value === 'custom' && !config.customModel) {
        setStatus('自定义模型 ID 不能为空', 'warn');
        return;
      }
      persistConfig(config);
      updateSavedState(true);
      syncPreview();
    });

    refs.loadModelsBtn?.addEventListener('click', fetchModels);
    refs.importConfigBtn?.addEventListener('click', importConfig);
    refs.exportConfigBtn?.addEventListener('click', exportConfig);
    refs.testConfigBtn?.addEventListener('click', testConfig);
    refs.loadDefaultsBtn?.addEventListener('click', () => applyDefaults(false));
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
    syncConfigBindings();

    const savedConfig = loadSavedConfig();
    if (savedConfig) {
      setFormConfig(savedConfig);
      updateSavedState(true);
      if (savedConfig.modelChoice === 'custom' && savedConfig.customModel) {
        if (refs.modelSelect) refs.modelSelect.value = 'custom';
        syncModelState();
      }
    } else {
      setFormConfig(constants.DEFAULT_CONFIG);
      updateSavedState(false);
    }

    syncTemperatureLabel();
    syncPreview();
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
    buildModelSelect,
    fetchModels,
    testConfig,
    applyDefaults,
  };
})();
