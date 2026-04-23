(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, utils } = App;
  let usdToCny = 6.838833;

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

  const getFormConfig = () => ({
    apiKey: (refs.openrouterApiKey?.value || '').trim(),
    baseUrl: utils.normalizeBaseUrl(refs.openrouterBaseUrl?.value || constants.DEFAULT_BASE_URL),
    appTitle: (refs.appTitle?.value || constants.DEFAULT_CONFIG.appTitle || '').trim(),
    httpReferer: (refs.httpReferer?.value || '').trim(),
    modelChoice: refs.modelSelect?.value || constants.DEFAULT_CONFIG.modelChoice,
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
    if (refs.systemPrompt) refs.systemPrompt.value = next.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    if (refs.temperature) refs.temperature.value = String(next.temperature ?? constants.DEFAULT_CONFIG.temperature);
    if (refs.maxTokens) refs.maxTokens.value = String(next.maxTokens ?? constants.DEFAULT_CONFIG.maxTokens);
    if (refs.streamEnabled) refs.streamEnabled.checked = Boolean(next.streamEnabled);
    if (refs.jsonMode) refs.jsonMode.checked = Boolean(next.jsonMode);
    if (refs.logEnabled) refs.logEnabled.checked = Boolean(next.logEnabled);
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
    refs.appTitle.value = getModelProviderLabel(getResolvedModel());
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
    const headerTitle = toIso88591HeaderValue(config.appTitle, 'Gjun Backend');
    if (headerTitle) headers['X-Title'] = headerTitle;
    return headers;
  };

  const loadSavedConfig = () => utils.readJson(constants.CONFIG_STORAGE_KEY, null);

  const getModelOptions = () => {
    if (!refs.modelSelect) return [];
    return Array.from(refs.modelSelect.options).map((option) => ({
      value: option.value,
      label: (option.textContent || option.value || '').trim(),
      pricing: (option.dataset?.pricing || '').trim(),
      category: (option.dataset?.category || '').trim(),
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

  const getModelCategoryLabel = (item) => {
    const modalities = Array.isArray(item?.architecture?.input_modalities) ? item.architecture.input_modalities : [];
    const raw = String(item?.category || '').toLowerCase();
    if (modalities.includes('image') || raw.includes('image')) return '图像理解';
    if (raw.includes('code')) return '代码';
    if (raw.includes('reason') || raw.includes('think')) return '推理';
    return '通用文本';
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rate = Number(payload?.rates?.CNY);
      if (Number.isFinite(rate) && rate > 0) {
        usdToCny = rate;
      }
    } catch {
      // Keep the baked-in fallback if the live rate fetch fails.
    }
  };

  const getModelTriggerLabel = () => {
    if (!refs.modelSelect) return constants.DEFAULT_CONFIG.modelChoice;
    const match = Array.from(refs.modelSelect.options).find((option) => option.value === refs.modelSelect.value);
    const parts = splitModelLabel(match?.textContent || refs.modelSelect.value || constants.DEFAULT_CONFIG.modelChoice);
    return parts.title || refs.modelSelect.value || constants.DEFAULT_CONFIG.modelChoice;
  };

  const setModelDropdownOpen = (open) => {
    if (!refs.modelDropdown || !refs.modelSelectTrigger) return;
    refs.modelDropdown.classList.toggle('is-open', open);
    refs.modelSelectTrigger.setAttribute('aria-expanded', String(open));
  };

  const closeModelDropdown = () => setModelDropdownOpen(false);

  const openModelDropdown = () => setModelDropdownOpen(true);

  const syncModelDropdown = () => {
    if (!refs.modelDropdown || !refs.modelSelectPanel || !refs.modelSelectTriggerLabel) return;
    const currentValue = refs.modelSelect?.value || constants.DEFAULT_CONFIG.modelChoice;
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
      const items = grouped.get(provider) || [];
      items.push({
        ...option,
        title: parts.title,
        pricingLabel: getPricingLabel(pricing),
        category,
      });
      grouped.set(provider, items);
    });

    refs.modelSelectPanel.innerHTML = Array.from(grouped.entries()).map(([provider, items]) => {
      const rows = items.map((option) => {
        const isActive = option.value === currentValue;
        return `
          <button
            type="button"
            class="model-dropdown-option${isActive ? ' is-active' : ''}"
            role="option"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-model-value="${option.value}">
            <span class="model-dropdown-option-body">
              <span class="model-dropdown-option-label">${utils.escapeHtml(option.title)}</span>
              <span class="model-dropdown-option-subline">
                <span class="model-dropdown-option-price">${utils.escapeHtml(option.pricingLabel)}</span>
              </span>
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
    }).join('');
  };

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
      refs.modelSelect.appendChild(option);
    };

    const seen = new Set();
    const list = Array.isArray(models) ? models : [];

    list.forEach(appendModelOption);

    if ([...refs.modelSelect.options].some((option) => option.value === currentChoice)) {
      refs.modelSelect.value = currentChoice;
    } else if (currentResolved) {
      refs.modelSelect.value = currentResolved;
    }

    syncModelState();
    syncModelDropdown();
  };

  const fetchModels = async () => {
    const config = getFormConfig();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      setStatus('正在加载 OpenRouter 官方模型列表…', 'success');
      const response = await fetch(`${config.baseUrl}/models?output_modalities=text`, {
        method: 'GET',
        headers: getRequestHeaders(config),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const models = Array.isArray(payload?.data)
        ? payload.data
          .filter((item) => item && typeof item.id === 'string' && item.id.includes('/'))
          .sort((a, b) => {
            const rankA = getProviderSortRank(a.id);
            const rankB = getProviderSortRank(b.id);
            if (rankA !== rankB) return rankA - rankB;
            const providerA = String(a.id || '').split('/')[0] || '';
            const providerB = String(b.id || '').split('/')[0] || '';
            if (providerA !== providerB) return providerA.localeCompare(providerB);
            return (b.created || 0) - (a.created || 0);
          })
        : [];
      buildModelSelect(models);
      setStatus(`已加载 OpenRouter 官方模型列表：${models.length || 0} 项`, 'success');
      if (config.logEnabled) saveLog({ type: 'models', at: new Date().toISOString(), count: models.length || 0 });
    } catch (error) {
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

  const syncConfigBindings = () => {
    if (refs.modelSelect) {
      refs.modelSelect.addEventListener('change', () => {
        syncModelState();
        syncPreview();
      });
    }

    [refs.openrouterApiKey, refs.openrouterBaseUrl, refs.appTitle, refs.httpReferer, refs.systemPrompt, refs.maxTokens]
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
      persistConfig(config);
      updateSavedState(true);
      syncPreview();
    });

    refs.apiKeyToggle?.addEventListener('click', () => {
      if (!refs.openrouterApiKey) return;
      refs.openrouterApiKey.type = refs.openrouterApiKey.type === 'password' ? 'text' : 'password';
      refs.apiKeyToggle.setAttribute(
        'aria-label',
        refs.openrouterApiKey.type === 'password' ? '显示 API 密钥' : '隐藏 API 密钥',
      );
      refs.apiKeyToggle.classList.toggle('is-visible', refs.openrouterApiKey.type === 'text');
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
    syncConfigBindings();

    const savedConfig = loadSavedConfig();
    if (savedConfig) {
      setFormConfig(savedConfig);
      updateSavedState(true);
    } else {
      setFormConfig(constants.DEFAULT_CONFIG);
      updateSavedState(false);
    }

    syncTemperatureLabel();
    syncPreview();
    fetchUsdToCnyRate().finally(() => fetchModels());
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
  };
})();
