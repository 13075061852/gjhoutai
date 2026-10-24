import { getLegacyApp } from '../core/app-context';
// Configuration and resident assistant layout styles load from styles.css.
import { cloudConfig } from '../../services/cloud-config';
import { withoutRetiredSearchConfig } from '../../utils/retiredSearchConfig';
import { DEEPSEEK_OFFICIAL_SNAPSHOT, fetchOfficialDeepSeekPricing, findOfficialModelPrice } from '../../services/model-pricing';
import { mountConfigSections } from '../components/config-sections';
import { positionConfigDropdown, watchConfigDropdowns } from '../components/config-dropdown-position';
import { SILICONFLOW_MODEL_CATALOG } from '../data/siliconflow-model-catalog';
import { cloneJsonValue, parseJsonMaybe } from '../../utils/json';
import { getModelManufacturerLabel } from '../../utils/modelManufacturer';
import { getModelOptionPresentation } from '../../utils/modelOptionPresentation';
import { AI_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../../utils/fetch';
import { LOCAL_STORAGE_KEYS } from '../../services/local-storage-keys';
import {
  APIMART_DEFAULT_BASE_URL,
  APIMART_IMAGE_MODELS,
  APIMART_VIDEO_MODELS,
  unwrapApimartPayload,
} from '../../services/apimart';
import { requestApimart } from '../../services/apimart-proxy';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { refs, constants, utils } = App;
  let usdToCny = 6.838833;
  const PROVIDER_OPENROUTER = 'openrouter';
  const PROVIDER_LM_STUDIO = 'lmstudio';
  const PROVIDER_DEEPSEEK = 'deepseek';
  const PROVIDER_SILICONFLOW = 'siliconflow';
  const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
  const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
  const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
  const DEFAULT_SILICONFLOW_MODEL = 'Pro/zai-org/GLM-5.1';
  const DEEPSEEK_CONTEXT_LENGTH = 1000000;
  const DEEPSEEK_MODEL_NAMES = {
    'deepseek-flash': 'DeepSeek V4.1 Flash',
    'deepseek-v4-flash': 'DeepSeek V4 Flash',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'deepseek-chat': 'DeepSeek Chat',
    'deepseek-reasoner': 'DeepSeek Reasoner',
  };
  const DEEPSEEK_MODEL_OPTIONS = [
    { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', context_length: DEEPSEEK_CONTEXT_LENGTH },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash（官方已转由 V4.1 服务）', context_length: DEEPSEEK_CONTEXT_LENGTH },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context_length: DEEPSEEK_CONTEXT_LENGTH },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', context_length: DEEPSEEK_CONTEXT_LENGTH },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', context_length: DEEPSEEK_CONTEXT_LENGTH },
  ];
  const SILICONFLOW_CONTEXT_LENGTH = 131072;
  const SILICONFLOW_MODEL_NAMES = {
    'Pro/zai-org/GLM-5.1': 'GLM-5.1 Pro',
    'Pro/zai-org/GLM-5': 'GLM-5 Pro',
    'zai-org/GLM-4.5-Air': 'GLM-4.5 Air',
    'deepseek-ai/DeepSeek-V3.2': 'DeepSeek V3.2',
    'Pro/deepseek-ai/DeepSeek-V3.2': 'DeepSeek V3.2 Pro',
    'deepseek-ai/DeepSeek-R1': 'DeepSeek R1',
    'Pro/deepseek-ai/DeepSeek-R1': 'DeepSeek R1 Pro',
    'Qwen/Qwen3-32B': 'Qwen3-32B',
    'Qwen/Qwen3-14B': 'Qwen3-14B',
    'Qwen/Qwen3-8B': 'Qwen3-8B',
  };
  const SILICONFLOW_RECOMMENDED_MODEL_IDS = [
    'Pro/zai-org/GLM-5.1',
    'deepseek-ai/DeepSeek-V3.2',
    'Pro/deepseek-ai/DeepSeek-V3.2',
    'Qwen/Qwen3-32B',
    'Qwen/Qwen3-14B',
    'Qwen/Qwen3-8B',
  ];
  const SILICONFLOW_RECOMMENDED_MODEL_FALLBACKS = new Map([
    ['Pro/zai-org/GLM-5.1', { id: 'Pro/zai-org/GLM-5.1', name: 'GLM-5.1 Pro', context_length: 205000 }],
    ['deepseek-ai/DeepSeek-V3.2', { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2', context_length: 164000 }],
    ['Pro/deepseek-ai/DeepSeek-V3.2', { id: 'Pro/deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2 Pro', context_length: 164000 }],
    ['Qwen/Qwen3-32B', { id: 'Qwen/Qwen3-32B', name: 'Qwen3-32B', context_length: SILICONFLOW_CONTEXT_LENGTH }],
    ['Qwen/Qwen3-14B', { id: 'Qwen/Qwen3-14B', name: 'Qwen3-14B', context_length: SILICONFLOW_CONTEXT_LENGTH }],
    ['Qwen/Qwen3-8B', { id: 'Qwen/Qwen3-8B', name: 'Qwen3-8B', context_length: SILICONFLOW_CONTEXT_LENGTH }],
  ]);
  const buildSiliconFlowCatalogIndexes = () => {
    const byId = new Map();
    const byTarget = new Map();
    SILICONFLOW_MODEL_CATALOG.forEach((model) => {
      if (model.id) byId.set(model.id, model);
      if (model.targetModelName) byTarget.set(model.targetModelName, model);
    });
    return { byId, byTarget };
  };
  const {
    byId: SILICONFLOW_CATALOG_BY_ID,
    byTarget: SILICONFLOW_CATALOG_BY_TARGET,
  } = buildSiliconFlowCatalogIndexes();
  const isSiliconFlowCatalogChatOption = (model = {} as any) => {
    const subType = String(model.subType || model.sub_type || '').toLowerCase();
    const type = String(model.type || '').toLowerCase();
    if (subType) return subType === 'chat';
    if (type && type !== 'text') return false;
    return !/(embedding|rerank|bge-|bge_|ocr|image|video|speech|tts)/i.test(String(model.id || ''));
  };
  const makeSiliconFlowStaticModelOption = (model = {} as any) => ({
    id: model.id || '',
    name: SILICONFLOW_MODEL_NAMES[model.id] || model.name || model.id || '',
    category: model.subType || model.type || '',
    context_length: model.contextLength || SILICONFLOW_CONTEXT_LENGTH,
    pricing: model.pricing || {},
  });
  const buildSiliconFlowStaticModelOptions = () => {
    const seen = new Set();
    const append = (options, item) => {
      if (!item?.id || seen.has(item.id)) return;
      seen.add(item.id);
      options.push(item);
    };
    const options = [];
    SILICONFLOW_RECOMMENDED_MODEL_IDS.forEach((id) => {
      append(
        options,
        SILICONFLOW_CATALOG_BY_ID.has(id)
          ? makeSiliconFlowStaticModelOption(SILICONFLOW_CATALOG_BY_ID.get(id))
          : SILICONFLOW_RECOMMENDED_MODEL_FALLBACKS.get(id)
      );
    });
    SILICONFLOW_MODEL_CATALOG
      .filter(isSiliconFlowCatalogChatOption)
      .map(makeSiliconFlowStaticModelOption)
      .forEach((item) => append(options, item));
    return options;
  };
  const SILICONFLOW_MODEL_OPTIONS = buildSiliconFlowStaticModelOptions();
  const SENSITIVE_CONFIG_PLACEHOLDER = '__REDACTED__';
  let activeProvider = constants.DEFAULT_CONFIG.aiProvider || PROVIDER_DEEPSEEK;
  const providerDrafts = {};
  let openRouterModelRefreshTimer = null;
  let lastLoadedOpenRouterApiKey = '';
  let modelSearchQuery = '';

  const getAssistantBehaviorRefs = () => ({
    autoImageUpload: document.getElementById('autoImageUpload'),
  });

  const mountAssistantBehaviorControls = () => {
    if (document.getElementById('autoImageUpload')) return;
    const grid = refs.aiConfigForm?.querySelector('.config-module-assistant .form-grid');
    if (!grid) return;
    const field = document.createElement('div');
    field.className = 'field full image-upload-policy-field';
    field.innerHTML = `
      <div class="image-upload-policy-row">
        <div class="image-upload-policy-copy">
          <div class="field-label-main">
            <i class="field-label-icon ti ti-photo-up" aria-hidden="true"></i>
            <span>图片上传策略</span>
          </div>
          <span class="field-label-note">开启后自动上传对话所需图片；关闭后每次上传前需手动确认。</span>
        </div>
        <label class="image-upload-toggle">
          <input id="autoImageUpload" name="autoImageUpload" type="checkbox" checked />
          <span class="image-upload-toggle-track" aria-hidden="true"></span>
          <span>自动上传</span>
        </label>
      </div>
    `;
    grid.appendChild(field);
  };

  const getApimartRefs = () => ({
    accessKey: document.getElementById('apimartApiKey'),
    accessKeyToggle: document.getElementById('apimartApiKeyToggle'),
    accessKeyIcon: document.querySelector('#apimartApiKeyToggle .apimart-api-key-toggle-icon'),
    baseUrl: document.getElementById('apimartBaseUrl'),
    imageModel: document.getElementById('apimartImageModel'),
    imageModelCustom: document.getElementById('apimartImageModelCustom'),
    videoModel: document.getElementById('apimartVideoModel'),
    videoModelCustom: document.getElementById('apimartVideoModelCustom'),
    balanceButton: document.getElementById('apimartBalanceBtn'),
    balanceText: document.getElementById('apimartBalanceText'),
  });

  const renderModelOptions = (models, selectedValue = '') => {
    const selected = String(selectedValue || '').trim();
    const options = models.map(([value, label]) => `
      <option value="${utils.escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${utils.escapeHtml(label)} (${utils.escapeHtml(value)})</option>
    `).join('');
    return options;
  };

  const getApimartModelValue = (kind) => {
    const apimartRefs = getApimartRefs();
    const select = kind === 'video' ? apimartRefs.videoModel : apimartRefs.imageModel;
    const custom = kind === 'video' ? apimartRefs.videoModelCustom : apimartRefs.imageModelCustom;
    return String(select?.value === 'custom' ? custom?.value : select?.value || '').trim();
  };

  const setApimartModelValue = (kind, value = '') => {
    const apimartRefs = getApimartRefs();
    const select = kind === 'video' ? apimartRefs.videoModel : apimartRefs.imageModel;
    const custom = kind === 'video' ? apimartRefs.videoModelCustom : apimartRefs.imageModelCustom;
    if (!select) return;
    const models = kind === 'video' ? APIMART_VIDEO_MODELS : APIMART_IMAGE_MODELS;
    const normalized = String(value || '').trim();
    if (models.some(([model]) => model === normalized)) {
      select.value = normalized;
      if (custom) custom.value = '';
    } else {
      select.value = models[0]?.[0] || '';
      if (custom) custom.value = '';
    }
    if (custom) custom.hidden = select.value !== 'custom';
  };

  let stopDropdownPositioning: (() => void) | undefined;

  const mountApimartConfigSection = () => {
    if (!refs.aiConfigForm || document.getElementById('apimartConfigModule')) return;
    const anchor = refs.aiConfigForm.querySelector('.oss-config-block') || refs.aiConfigForm.querySelector('.config-module-assistant');
    const article = document.createElement('article');
    article.className = 'panel config-module config-module-apimart';
    article.id = 'apimartConfigModule';
    article.innerHTML = `
      <div class="config-module-head">
        <div class="config-module-title">
          <span class="config-module-icon"><i class="ti ti-photo-spark" aria-hidden="true"></i></span>
          <div>
            <div class="config-module-kicker">APIMart</div>
            <h2>图片与视频生成</h2>
          </div>
        </div>
        <div class="apimart-module-actions">
          <button class="apimart-balance-btn" id="apimartBalanceBtn" type="button">
            <i class="ti ti-coins" aria-hidden="true"></i>
            <span id="apimartBalanceText">查询额度</span>
          </button>
          <a class="panel-help" href="https://docs.apib.ai/cn" target="_blank" rel="noreferrer">APIMart 文档</a>
        </div>
      </div>
      <div class="form-grid apimart-config-grid">
        <div class="field apimart-key-field">
          <label class="field-label-row" for="apimartApiKey">
            <span class="field-label-main">
              <i class="field-label-icon ti ti-key" aria-hidden="true"></i>
              <span>API Key</span>
            </span>
            <span class="field-label-note">保存后同步至配置中心</span>
          </label>
          <div class="password-row">
            <input id="apimartApiKey" name="apimartApiKey" type="password" placeholder="填写 APIMart API Key" autocomplete="off" />
            <button class="password-toggle" id="apimartApiKeyToggle" type="button" aria-label="显示或隐藏 APIMart API Key">
              <i class="apimart-api-key-toggle-icon ti ti-eye" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="field">
          <label for="apimartBaseUrl">
            <span class="field-label-main">
              <i class="field-label-icon ti ti-world" aria-hidden="true"></i>
              <span>API 基地址</span>
            </span>
          </label>
          <input id="apimartBaseUrl" name="apimartBaseUrl" type="url" value="${APIMART_DEFAULT_BASE_URL}" readonly />
        </div>
        <div class="field">
          <label for="apimartImageModel">
            <span class="field-label-main">
              <i class="field-label-icon ti ti-photo" aria-hidden="true"></i>
              <span>默认图片模型</span>
            </span>
          </label>
          <select id="apimartImageModel" name="apimartImageModel">
            ${renderModelOptions(APIMART_IMAGE_MODELS, constants.DEFAULT_CONFIG.apimartImageModel)}
          </select>
          <input id="apimartImageModelCustom" name="apimartImageModelCustom" type="text" placeholder="输入自定义图片模型 ID" autocomplete="off" hidden />
        </div>
        <div class="field">
          <label for="apimartVideoModel">
            <span class="field-label-main">
              <i class="field-label-icon ti ti-video" aria-hidden="true"></i>
              <span>默认视频模型</span>
            </span>
          </label>
          <select id="apimartVideoModel" name="apimartVideoModel">
            ${renderModelOptions(APIMART_VIDEO_MODELS, constants.DEFAULT_CONFIG.apimartVideoModel)}
          </select>
          <input id="apimartVideoModelCustom" name="apimartVideoModelCustom" type="text" placeholder="输入自定义视频模型 ID" autocomplete="off" hidden />
        </div>
      </div>
    `;
    if (anchor && anchor.parentElement === refs.aiConfigForm) {
      refs.aiConfigForm.insertBefore(article, anchor);
    } else {
      refs.aiConfigForm.appendChild(article);
    }
  };

  const removeLegacyStorageConfigSection = () => {
    const module = document.querySelector('.oss-config-block');
    module?.remove();
  };

  const mountConfigContentPanel = () => {
    if (!refs.aiConfigForm || refs.aiConfigForm.querySelector(':scope > .config-content-panel')) return;
    mountConfigSections(refs.aiConfigForm);
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
    if (!raw) return 'DeepSeek';
    const provider = raw.split('/')[0] || raw;
    const normalized = provider.replace(/[-_]/g, ' ').trim().toLowerCase();
    const aliases = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      deepseek: 'DeepSeek',
      qwen: 'Qwen',
      pro: 'SiliconFlow',
      meta: 'Meta',
      mistral: 'Mistral',
      cohere: 'Cohere',
      perplexity: 'Perplexity',
      xai: 'xAI',
      'x ai': 'xAI',
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
  const isDeepSeekProvider = (provider) => String(provider || '').toLowerCase() === PROVIDER_DEEPSEEK;
  const isSiliconFlowProvider = (provider) => String(provider || '').toLowerCase() === PROVIDER_SILICONFLOW;

  const normalizeProvider = (provider) => {
    const raw = String(provider || '').toLowerCase();
    if (raw === PROVIDER_DEEPSEEK) return PROVIDER_DEEPSEEK;
    if (raw === PROVIDER_SILICONFLOW) return PROVIDER_SILICONFLOW;
    return isLmStudioProvider(raw) ? PROVIDER_LM_STUDIO : PROVIDER_DEEPSEEK;
  };

  const getAiProvider = () => {
    const checked = Array.from(document.querySelectorAll('input[name="aiProvider"]')).find((input) => input.checked);
    return normalizeProvider(checked?.value || activeProvider || constants.DEFAULT_CONFIG.aiProvider);
  };

  const getProviderDefaults = (provider = getAiProvider()) => {
    const normalizedProvider = normalizeProvider(provider);
    if (isLmStudioProvider(normalizedProvider)) {
      return {
        baseUrl: constants.DEFAULT_LM_STUDIO_BASE_URL,
        appTitle: 'LM Studio',
        modelChoice: '',
      };
    }
    if (isDeepSeekProvider(normalizedProvider)) {
      return {
        baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
        appTitle: 'DeepSeek',
        modelChoice: DEFAULT_DEEPSEEK_MODEL,
      };
    }
    if (isSiliconFlowProvider(normalizedProvider)) {
      return {
        baseUrl: DEFAULT_SILICONFLOW_BASE_URL,
        appTitle: 'SiliconFlow',
        modelChoice: DEFAULT_SILICONFLOW_MODEL,
      };
    }
    return {
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      appTitle: 'DeepSeek',
      modelChoice: DEFAULT_DEEPSEEK_MODEL,
    };
  };

  const normalizeDeepSeekModel = (item = {} as any) => {
    const id = String(item?.id || '').trim();
    if (!id) return item;
    const baseUrl = refs.openrouterBaseUrl?.value || DEFAULT_DEEPSEEK_BASE_URL;
    const official = /^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/i.test(baseUrl)
      ? findOfficialModelPrice(DEEPSEEK_OFFICIAL_SNAPSHOT, id) : undefined;
    return {
      ...item,
      name: item.name || DEEPSEEK_MODEL_NAMES[id] || id,
      context_length: Number(item.context_length || 0) > 0 ? item.context_length : DEEPSEEK_CONTEXT_LENGTH,
      pricing: item.pricing && typeof item.pricing === 'object' && Object.keys(item.pricing).length
        ? item.pricing : official ? { ...official.pricing, source: DEEPSEEK_OFFICIAL_SNAPSHOT.source,
          updatedAt: DEEPSEEK_OFFICIAL_SNAPSHOT.fetchedAt, snapshot: true } : { unavailable: true },
    };
  };

  const findFirstDefined = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

  const normalizePriceValue = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).replace(/[¥$,]/g, '').trim();
    if (!text) return null;
    const amount = Number.parseFloat(text);
    return Number.isFinite(amount) ? amount : null;
  };

  const normalizePerMillionCnyToUsdPerToken = (value) => {
    const amount = normalizePriceValue(value);
    if (amount == null) return null;
    return amount / 1000000 / usdToCny;
  };

  const normalizePerMillionUsdToUsdPerToken = (value) => {
    const amount = normalizePriceValue(value);
    if (amount == null) return null;
    return amount / 1000000;
  };

  const getSiliconFlowCatalogEntry = (id) => {
    const raw = String(id || '').trim();
    if (!raw) return null;
    return SILICONFLOW_CATALOG_BY_ID.get(raw)
      || SILICONFLOW_CATALOG_BY_TARGET.get(raw)
      || (raw.startsWith('Pro/') ? SILICONFLOW_CATALOG_BY_ID.get(raw.slice(4)) : null)
      || null;
  };

  const isSiliconFlowChatCatalogModel = (item = {} as any) => {
    const subType = String(item.subType || item.sub_type || '').toLowerCase();
    const type = String(item.type || '').toLowerCase();
    if (subType) return subType === 'chat';
    if (type && type !== 'text') return false;
    const id = String(item.id || '').toLowerCase();
    return !/(embedding|rerank|bge-|bge_|ocr|image|video|speech|tts)/i.test(id);
  };

  const extractSiliconFlowPricing = (item = {} as any) => {
    const pricing = item.pricing && typeof item.pricing === 'object' ? item.pricing : {};
    const price = item.price && typeof item.price === 'object' ? item.price : {};
    const billing = item.billing && typeof item.billing === 'object' ? item.billing : {};
    const input = pricing.input && typeof pricing.input === 'object' ? pricing.input : {};
    const output = pricing.output && typeof pricing.output === 'object' ? pricing.output : {};
    const promptCnyPerMillion = findFirstDefined(
      pricing.promptCny,
      pricing.inputCny,
      pricing.input_cny,
      pricing.prompt_cny,
      pricing.input_price_cny,
      pricing.prompt_price_cny,
      pricing.inputCnyPerMillion,
      pricing.promptCnyPerMillion,
      price.inputCny,
      price.input_cny,
      price.input_price_cny,
      input.cny,
      input.cny_per_million,
      billing.inputCny,
    );
    const completionCnyPerMillion = findFirstDefined(
      pricing.completionCny,
      pricing.outputCny,
      pricing.output_cny,
      pricing.completion_cny,
      pricing.output_price_cny,
      pricing.completion_price_cny,
      pricing.outputCnyPerMillion,
      pricing.completionCnyPerMillion,
      price.outputCny,
      price.output_cny,
      price.output_price_cny,
      output.cny,
      output.cny_per_million,
      billing.outputCny,
    );
    const cachedInputCnyPerMillion = findFirstDefined(
      pricing.cachedInputCnyPerMillion,
      pricing.cached_input_cny_per_million,
      pricing.cachedInputCny,
      pricing.cacheCny,
      price.cachedInputCny,
      billing.cachedInputCny,
    );
    const promptUsdPerToken = findFirstDefined(
      pricing.prompt,
      pricing.input,
      pricing.input_price,
      pricing.prompt_price,
      item.input_price,
      item.prompt_price,
      price.input,
      input.usd_per_token,
      billing.input,
    );
    const completionUsdPerToken = findFirstDefined(
      pricing.completion,
      pricing.output,
      pricing.output_price,
      pricing.completion_price,
      item.output_price,
      item.completion_price,
      price.output,
      output.usd_per_token,
      billing.output,
    );
    const promptUsdPerMillion = findFirstDefined(
      pricing.input_usd_per_million,
      pricing.prompt_usd_per_million,
      price.input_usd_per_million,
      input.usd_per_million,
      billing.input_usd_per_million,
    );
    const completionUsdPerMillion = findFirstDefined(
      pricing.output_usd_per_million,
      pricing.completion_usd_per_million,
      price.output_usd_per_million,
      output.usd_per_million,
      billing.output_usd_per_million,
    );
    const prompt = normalizePerMillionCnyToUsdPerToken(promptCnyPerMillion)
      ?? normalizePerMillionUsdToUsdPerToken(promptUsdPerMillion)
      ?? normalizePriceValue(promptUsdPerToken);
    const completion = normalizePerMillionCnyToUsdPerToken(completionCnyPerMillion)
      ?? normalizePerMillionUsdToUsdPerToken(completionUsdPerMillion)
      ?? normalizePriceValue(completionUsdPerToken);
    const promptCny = normalizePriceValue(promptCnyPerMillion);
    const completionCny = normalizePriceValue(completionCnyPerMillion);
    const cachedInputCny = normalizePriceValue(cachedInputCnyPerMillion);
    return {
      inputCnyPerMillion: promptCny == null ? undefined : promptCny,
      outputCnyPerMillion: completionCny == null ? undefined : completionCny,
      cachedInputCnyPerMillion: cachedInputCny == null ? undefined : cachedInputCny,
      prompt: prompt == null ? undefined : String(prompt),
      completion: completion == null ? undefined : String(completion),
      source: prompt != null || completion != null ? 'official-models-api' : '',
      unavailable: prompt == null && completion == null && promptCny == null && completionCny == null ? 'official-models-api' : '',
    };
  };

  const normalizeSiliconFlowModel = (item = {} as any) => {
    const id = String(item?.id || '').trim();
    if (!id) return item;
    const catalog = getSiliconFlowCatalogEntry(id);
    const fallback = SILICONFLOW_MODEL_OPTIONS.find((model) => model.id === id);
    const sourcePricing = item.pricing && typeof item.pricing === 'object' ? item.pricing : {};
    const merged = catalog
      ? {
          ...catalog,
          ...item,
          id,
          name: item.name || catalog.name,
          context_length: item.context_length || catalog.contextLength,
          pricing: {
            ...(catalog.pricing || {}),
            ...sourcePricing,
          },
        }
      : item;
    const pricing = extractSiliconFlowPricing(merged);
    return {
      ...item,
      name: item.name || catalog?.name || SILICONFLOW_MODEL_NAMES[id] || fallback?.name || id,
      category: item.category || catalog?.subType || fallback?.category || '',
      context_length: Number(item.context_length || 0) > 0
        ? item.context_length
        : catalog?.contextLength || fallback?.context_length || SILICONFLOW_CONTEXT_LENGTH,
      pricing,
    };
  };

  const normalizeLmStudioBaseUrl = (value) => {
    const normalized = utils.normalizeBaseUrl(value || constants.DEFAULT_LM_STUDIO_BASE_URL);
    return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`;
  };

  const isLocalBaseUrl = (value) => /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.)/i.test(String(value || ''));

  const normalizeDeepSeekBaseUrl = (value) => {
    const normalized = utils.normalizeBaseUrl(value || DEFAULT_DEEPSEEK_BASE_URL);
    if (/openrouter\.ai/i.test(normalized)) return DEFAULT_DEEPSEEK_BASE_URL;
    return isLocalBaseUrl(normalized) ? DEFAULT_DEEPSEEK_BASE_URL : normalized.replace(/\/v1$/i, '');
  };

  const normalizeSiliconFlowBaseUrl = (value) => {
    const normalized = utils.normalizeBaseUrl(value || DEFAULT_SILICONFLOW_BASE_URL);
    if (/openrouter\.ai|api\.deepseek\.com/i.test(normalized)) return DEFAULT_SILICONFLOW_BASE_URL;
    const withoutChatPath = normalized.replace(/\/chat\/completions$/i, '');
    if (isLocalBaseUrl(withoutChatPath)) return DEFAULT_SILICONFLOW_BASE_URL;
    return /\/v1$/i.test(withoutChatPath) ? withoutChatPath : `${withoutChatPath}/v1`;
  };

  const normalizeProviderBaseUrl = (provider, value) => {
    const normalizedProvider = normalizeProvider(provider);
    if (isLmStudioProvider(normalizedProvider)) return normalizeLmStudioBaseUrl(value);
    if (isDeepSeekProvider(normalizedProvider)) return normalizeDeepSeekBaseUrl(value);
    if (isSiliconFlowProvider(normalizedProvider)) return normalizeSiliconFlowBaseUrl(value);
    return normalizeDeepSeekBaseUrl(value);
  };

  const makeProviderDraft = (provider, config = {} as any) => {
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
    providerDrafts[PROVIDER_DEEPSEEK] = makeProviderDraft(
      PROVIDER_DEEPSEEK,
      providerDrafts[PROVIDER_DEEPSEEK] || {}
    );
    providerDrafts[PROVIDER_SILICONFLOW] = makeProviderDraft(
      PROVIDER_SILICONFLOW,
      providerDrafts[PROVIDER_SILICONFLOW] || {}
    );
    providerDrafts[PROVIDER_LM_STUDIO] = {
      ...makeProviderDraft(PROVIDER_LM_STUDIO, providerDrafts[PROVIDER_LM_STUDIO] || {}),
      apiKey: '',
      appTitle: 'LM Studio',
    };
  };

  const inferProviderFromConfig = (config = {} as any) => {
    if (config.aiProvider) return normalizeProvider(config.aiProvider);
    return isLocalBaseUrl(config.baseUrl)
      ? PROVIDER_LM_STUDIO
      : String(config.baseUrl || '').includes('api.deepseek.com')
        ? PROVIDER_DEEPSEEK
        : String(config.baseUrl || '').includes('api.siliconflow.cn')
          ? PROVIDER_SILICONFLOW
      : PROVIDER_DEEPSEEK;
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
        : isDeepSeekProvider(normalizedProvider)
          ? 'DeepSeek'
        : isSiliconFlowProvider(normalizedProvider)
          ? 'SiliconFlow'
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
    const deepSeekInput = document.getElementById('aiProviderDeepSeek');
    const siliconFlowInput = document.getElementById('aiProviderSiliconFlow');
    const lmStudioInput = refs.aiProviderLmStudio || document.getElementById('aiProviderLmStudio');
    if (deepSeekInput) deepSeekInput.checked = normalizedProvider === PROVIDER_DEEPSEEK;
    if (siliconFlowInput) siliconFlowInput.checked = normalizedProvider === PROVIDER_SILICONFLOW;
    if (lmStudioInput) lmStudioInput.checked = normalizedProvider === PROVIDER_LM_STUDIO;
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
      } else if (isDeepSeekProvider(activeProvider)) {
        setDeepSeekModelOptions(draft.modelChoice || getProviderDefaults(activeProvider).modelChoice);
      } else if (isSiliconFlowProvider(activeProvider)) {
        setSiliconFlowModelOptions(draft.modelChoice || getProviderDefaults(activeProvider).modelChoice);
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
      deepseekConfig: { ...providerDrafts[PROVIDER_DEEPSEEK], appTitle: 'DeepSeek' },
      siliconflowConfig: { ...providerDrafts[PROVIDER_SILICONFLOW], appTitle: 'SiliconFlow' },
      lmStudioConfig: { ...providerDrafts[PROVIDER_LM_STUDIO], apiKey: '', appTitle: 'LM Studio' },
      systemPrompt: (refs.systemPrompt?.value || '').trim() || constants.DEFAULT_CONFIG.systemPrompt,
      temperature: Number(refs.temperature?.value ?? constants.DEFAULT_CONFIG.temperature),
      maxTokens: Math.max(
        Number(refs.maxTokens?.value ?? constants.DEFAULT_CONFIG.maxTokens),
        constants.DEFAULT_CONFIG.maxTokens
      ),
      streamEnabled: Boolean(refs.streamEnabled?.checked),
      autoImageUpload: Boolean(getAssistantBehaviorRefs().autoImageUpload?.checked),
      jsonMode: Boolean(refs.jsonMode?.checked),
      logEnabled: Boolean(refs.logEnabled?.checked),
      apimartApiKey: (getApimartRefs().accessKey?.value || '').trim(),
      apimartBaseUrl: APIMART_DEFAULT_BASE_URL,
      apimartImageModel: getApimartModelValue('image') || constants.DEFAULT_CONFIG.apimartImageModel,
      apimartVideoModel: getApimartModelValue('video') || constants.DEFAULT_CONFIG.apimartVideoModel,
      ossBucket: (refs.ossBucket?.value || '').trim(),
      ossEndpoint: (refs.ossEndpoint?.value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
      ossObjectKey: (refs.ossObjectKey?.value || '').trim().replace(/^\/+/, ''),
      ossAccessKeyId: (refs.ossAccessKeyId?.value || '').trim(),
      ossAccessKeySecret: (refs.ossAccessKeySecret?.value || '').trim(),
      ossExcelBackupPrefix: (refs.ossExcelBackupPrefix?.value || '').trim().replace(/^\/+/, ''),
    };
  };

  const isRedactedValue = (value) => String(value || '').trim() === SENSITIVE_CONFIG_PLACEHOLDER;

  const dropRedactedSecrets = (config = {} as any) => {
    const next = withoutRetiredSearchConfig({ ...config });
    if (isRedactedValue(next.apiKey)) next.apiKey = '';
    if (isRedactedValue(next.ossAccessKeyId)) next.ossAccessKeyId = '';
    if (isRedactedValue(next.ossAccessKeySecret)) next.ossAccessKeySecret = '';
    if (isRedactedValue(next.apimartApiKey)) next.apimartApiKey = '';
    if (isRedactedValue(next.liblibSecretKey)) next.liblibSecretKey = '';
    if (next.openrouterConfig && typeof next.openrouterConfig === 'object') {
      next.openrouterConfig = { ...next.openrouterConfig };
      if (isRedactedValue(next.openrouterConfig.apiKey)) next.openrouterConfig.apiKey = '';
    }
    if (next.deepseekConfig && typeof next.deepseekConfig === 'object') {
      next.deepseekConfig = { ...next.deepseekConfig };
      if (isRedactedValue(next.deepseekConfig.apiKey)) next.deepseekConfig.apiKey = '';
    }
    if (next.siliconflowConfig && typeof next.siliconflowConfig === 'object') {
      next.siliconflowConfig = { ...next.siliconflowConfig };
      if (isRedactedValue(next.siliconflowConfig.apiKey)) next.siliconflowConfig.apiKey = '';
    }
    if (next.lmStudioConfig && typeof next.lmStudioConfig === 'object') {
      next.lmStudioConfig = { ...next.lmStudioConfig, apiKey: '' };
    }
    return next;
  };

  const redactSensitiveConfig = (config = {} as any) => {
    const next = withoutRetiredSearchConfig(cloneJsonValue(config || {}));
    const redact = (target, key) => {
      if (!target || !String(target[key] || '').trim()) return;
      target[key] = SENSITIVE_CONFIG_PLACEHOLDER;
    };
    redact(next, 'apiKey');
    redact(next, 'ossAccessKeyId');
    redact(next, 'ossAccessKeySecret');
    redact(next, 'apimartApiKey');
    redact(next, 'liblibAccessKey');
    redact(next, 'liblibSecretKey');
    redact(next.openrouterConfig, 'apiKey');
    redact(next.deepseekConfig, 'apiKey');
    redact(next.siliconflowConfig, 'apiKey');
    redact(next.lmStudioConfig, 'apiKey');
    return next;
  };

  const setFormConfig = (config) => {
    const next = { ...constants.DEFAULT_CONFIG, ...dropRedactedSecrets(config) };
    const provider = inferProviderFromConfig(next);
    providerDrafts[PROVIDER_OPENROUTER] = makeProviderDraft(PROVIDER_OPENROUTER, next.openrouterConfig || {});
    providerDrafts[PROVIDER_DEEPSEEK] = makeProviderDraft(PROVIDER_DEEPSEEK, next.deepseekConfig || {});
    providerDrafts[PROVIDER_SILICONFLOW] = makeProviderDraft(PROVIDER_SILICONFLOW, next.siliconflowConfig || {});
    providerDrafts[PROVIDER_LM_STUDIO] = makeProviderDraft(PROVIDER_LM_STUDIO, next.lmStudioConfig || {});
    if (!next.deepseekConfig && isDeepSeekProvider(provider)) {
      providerDrafts[PROVIDER_DEEPSEEK] = makeProviderDraft(PROVIDER_DEEPSEEK, next);
    }
    if (!next.siliconflowConfig && isSiliconFlowProvider(provider)) {
      providerDrafts[PROVIDER_SILICONFLOW] = makeProviderDraft(PROVIDER_SILICONFLOW, next);
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
      if (isDeepSeekProvider(activeProvider)) {
        setDeepSeekModelOptions(modelChoice || getProviderDefaults(activeProvider).modelChoice);
      } else if (isSiliconFlowProvider(activeProvider)) {
        setSiliconFlowModelOptions(modelChoice || getProviderDefaults(activeProvider).modelChoice);
      } else {
        ensureModelOption(modelChoice);
        refs.modelSelect.value = modelChoice;
      }
    }
    syncProviderUi();
    if (refs.systemPrompt) refs.systemPrompt.value = next.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    if (refs.temperature) refs.temperature.value = String(next.temperature ?? constants.DEFAULT_CONFIG.temperature);
    if (refs.maxTokens) refs.maxTokens.value = String(next.maxTokens ?? constants.DEFAULT_CONFIG.maxTokens);
    if (refs.streamEnabled) refs.streamEnabled.checked = Boolean(next.streamEnabled);
    if (getAssistantBehaviorRefs().autoImageUpload) {
      getAssistantBehaviorRefs().autoImageUpload.checked = next.autoImageUpload !== false;
    }
    if (refs.jsonMode) refs.jsonMode.checked = Boolean(next.jsonMode);
    if (refs.logEnabled) refs.logEnabled.checked = Boolean(next.logEnabled);
    const apimartRefs = getApimartRefs();
    if (apimartRefs.accessKey) apimartRefs.accessKey.value = next.apimartApiKey || '';
    if (apimartRefs.baseUrl) apimartRefs.baseUrl.value = APIMART_DEFAULT_BASE_URL;
    setApimartModelValue('image', next.apimartImageModel || constants.DEFAULT_CONFIG.apimartImageModel);
    setApimartModelValue('video', next.apimartVideoModel || constants.DEFAULT_CONFIG.apimartVideoModel);
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
    const provider = getAiProvider();
    if (isLmStudioProvider(provider)) {
      refs.appTitle.value = 'LM Studio';
      return;
    }
    if (isDeepSeekProvider(provider)) {
      refs.appTitle.value = 'DeepSeek';
      return;
    }
    if (isSiliconFlowProvider(provider)) {
      refs.appTitle.value = 'SiliconFlow';
      return;
    }
    refs.appTitle.value = getModelProviderLabel(getResolvedModel());
  };

  const mountProviderOption = ({ id, value, label }) => {
    if (document.getElementById(id)) return;
    const segment = document.querySelector('.provider-segment');
    if (!segment) return;
    const option = document.createElement('label');
    option.className = 'provider-option';
    option.innerHTML = `
      <input id="${id}" name="aiProvider" type="radio" value="${value}" />
      <span>${label}</span>
    `;
    const lmStudioOption = document.getElementById('aiProviderLmStudio')?.closest('.provider-option');
    segment.insertBefore(option, lmStudioOption || null);
  };

  const removeOpenRouterProviderOption = () => {
    document.getElementById('aiProviderOpenRouter')?.closest('.provider-option')?.remove();
  };

  const mountDeepSeekProviderOption = () => {
    removeOpenRouterProviderOption();
    if (document.getElementById('aiProviderDeepSeek')) return;
    mountProviderOption({ id: 'aiProviderDeepSeek', value: PROVIDER_DEEPSEEK, label: 'DeepSeek' });
  };

  const mountSiliconFlowProviderOption = () => {
    if (document.getElementById('aiProviderSiliconFlow')) return;
    mountProviderOption({ id: 'aiProviderSiliconFlow', value: PROVIDER_SILICONFLOW, label: '硅基流动' });
  };

  const mountBalanceControl = () => {
    const actionBar = document.querySelector('.config-actions-panel');
    const actionButtons = actionBar?.querySelector('.action-buttons');
    if (!actionBar || !actionButtons) return;
    if (!document.getElementById('readBalanceBtn')) {
      const button = document.createElement('button');
      button.className = 'ghost-btn outline-btn';
      button.id = 'readBalanceBtn';
      button.type = 'button';
      button.innerHTML = `
        <i class="ti ti-coins" aria-hidden="true"></i>
        <span class="balance-button-status" id="aiBalanceStatus">余额：未查询</span>
      `;
      actionButtons.appendChild(button);
    }
    actionBar.querySelector(':scope > #aiBalanceStatus')?.remove();
  };

  const syncProviderUi = () => {
    const provider = getAiProvider();
    const isLocal = isLmStudioProvider(provider);
    const isDeepSeek = isDeepSeekProvider(provider);
    const isSiliconFlow = isSiliconFlowProvider(provider);
    const defaults = getProviderDefaults(provider);

    if (refs.apiKeyLabelText) {
      refs.apiKeyLabelText.textContent = isLocal
        ? 'LM Studio API 密钥（可选）'
        : isDeepSeek
          ? 'DeepSeek API 密钥'
          : isSiliconFlow
            ? '硅基流动 API 密钥'
          : 'API 密钥';
    }
    if (refs.apiKeyNoteText) {
      refs.apiKeyNoteText.textContent = isLocal ? '本地接入可留空' : '保存后云端同步';
    }
    if (refs.openrouterApiKey) {
      refs.openrouterApiKey.placeholder = isLocal ? '可留空' : isDeepSeek || isSiliconFlow ? 'sk-...' : 'sk-or-...';
    }
    if (refs.apiKeyField) {
      refs.apiKeyField.hidden = isLocal;
    }
    if (refs.aiProviderHelp) {
      refs.aiProviderHelp.hidden = isLocal;
      const helpMeta = isDeepSeek
        ? { href: 'https://api-docs.deepseek.com/', label: 'DeepSeek 接入文档' }
        : isSiliconFlow
          ? { href: 'https://api-docs.siliconflow.cn/docs/userguide/get_started/introduction', label: 'SiliconFlow 接入文档' }
          : { href: 'https://api-docs.deepseek.com/', label: 'DeepSeek 接入文档' };
      refs.aiProviderHelp.href = helpMeta.href;
      refs.aiProviderHelp.textContent = helpMeta.label;
      refs.aiProviderHelp.title = helpMeta.label;
    }
    if (refs.openrouterBaseUrl && !refs.openrouterBaseUrl.value.trim()) {
      refs.openrouterBaseUrl.value = defaults.baseUrl;
    }
    if (refs.appTitle && (isLocal || isDeepSeek || isSiliconFlow)) {
      refs.appTitle.value = defaults.appTitle;
    } else if (refs.appTitle && !refs.appTitle.value.trim()) {
      refs.appTitle.value = defaults.appTitle;
    }
    queueBalanceRefresh();
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

  const getBalanceRefs = () => ({
    button: document.getElementById('readBalanceBtn'),
    status: document.getElementById('aiBalanceStatus'),
  });

  const setBalanceStatus = (message, tone = 'success') => {
    const { button, status } = getBalanceRefs();
    if (!status) return;
    status.textContent = message;
    status.classList.remove('success', 'warn');
    status.classList.add(tone === 'warn' ? 'warn' : 'success');
    button?.classList.remove('is-balance-idle', 'is-balance-loading', 'is-balance-success', 'is-balance-warn');
    const text = String(message || '');
    const stateClass = tone === 'warn'
      ? 'is-balance-warn'
      : text.includes('正在')
        ? 'is-balance-loading'
        : text.includes('本地') || text.includes('未查')
          ? 'is-balance-idle'
          : 'is-balance-success';
    button?.classList.add(stateClass);
  };

  const formatBalanceAmount = (value, currency = 'USD') => {
    const amount = Number.parseFloat(value);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const normalizedCurrency = String(currency || 'USD').toUpperCase();
    const symbol = normalizedCurrency === 'CNY' ? '¥' : normalizedCurrency === 'USD' ? '$' : `${normalizedCurrency} `;
    return `${symbol}${safeAmount.toFixed(2)}`;
  };

  const formatProviderBalance = (_provider, value, currency = 'USD') => {
    return `余额：${formatBalanceAmount(value, currency)}`;
  };

  const formatDeepSeekBalance = (payload = {} as any) => {
    const balances = Array.isArray(payload.balance_infos)
      ? payload.balance_infos
      : Array.isArray(payload.data?.balance_infos)
        ? payload.data.balance_infos
        : [];
    const preferred = balances.find((item) => item.currency === 'CNY')
      || balances.find((item) => item.currency === 'USD')
      || balances[0];
    if (!preferred) throw new Error('未返回余额信息');
    const currency = preferred.currency || 'USD';
    return formatProviderBalance('DeepSeek', preferred.total_balance, currency);
  };

  const formatSiliconFlowUserInfo = (payload = {} as any) => {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const balance = data?.totalBalance ?? data?.chargeBalance ?? data?.balance;
    if (balance === undefined) {
      throw new Error('未返回余额信息');
    }
    return formatProviderBalance('硅基流动', balance, 'CNY');
  };

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
        'pi-web-search（服务端）',
        config.apimartApiKey ? 'APIMart 余额查询已配置' : 'APIMart 未配置',
      ].join(' / ');
    }
    const isLocal = isLmStudioProvider(config.aiProvider);
    const isAiReady = isLocal ? Boolean(resolvedModel) : Boolean(config.apiKey);
    if (refs.previewPrompt) {
      refs.previewPrompt.textContent = isAiReady
        ? `已准备使用 ${resolvedModel || '未选择的模型'} 调用 ${baseUrl}/chat/completions。导入/导出均使用 UTF-8。`
        : (isLocal
          ? '当前还没有选择本地模型。请先在 LM Studio 加载模型，再刷新模型列表。'
          : '当前还没有填写 API 密钥。先保存配置，再用“加载模型列表”或“检测配置”验证模型接入。');
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

  const syncApimartKeyToggleIcon = () => {
    const apimartRefs = getApimartRefs();
    const syncIcon = (input, icon) => {
      if (!icon) return;
      const isVisible = input?.type === 'text';
      icon.classList.toggle('ti-eye', !isVisible);
      icon.classList.toggle('ti-eye-off', isVisible);
    };
    syncIcon(apimartRefs.accessKey, apimartRefs.accessKeyIcon);
  };

  const updateSavedState = (saved) => {
    setStatus(saved ? '云端配置已同步' : '尚未保存配置', saved ? 'success' : 'warn');
  };

  const saveLog = (entry) => {
    const current = utils.readJson(constants.CONFIG_LOG_KEY, []);
    const next = Array.isArray(current) ? [entry, ...current].slice(0, 10) : [entry];
    utils.writeJson(constants.CONFIG_LOG_KEY, next);
  };

  const persistConfig = async (config) => {
    const saved = await cloudConfig.put(config);
    if (!saved) throw new Error('cloud_config_save_failed');
    localStorage.removeItem(constants.CONFIG_STORAGE_KEY);
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
    const payload: any = parseJsonMaybe(text);
    const message = payload?.error?.message || payload?.message || payload?.error;
    return message ? `${fallback}：${String(message).slice(0, 240)}` : `${fallback}：${text.slice(0, 240)}`;
  };

  const getRequestHeaders = (config) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    if (config.httpReferer) headers['HTTP-Referer'] = config.httpReferer;
    const headerTitle = toIso88591HeaderValue(config.appTitle, 'Gjun Backend');
    if (headerTitle) headers['X-Title'] = headerTitle;
    return headers;
  };

  const loadSavedConfig = async () => {
    const remoteConfig = await cloudConfig.get();
    if (remoteConfig) {
      localStorage.removeItem(constants.CONFIG_STORAGE_KEY);
      return remoteConfig;
    }
    const legacyLocalConfig = utils.readJson(constants.CONFIG_STORAGE_KEY, null);
    if (!legacyLocalConfig) return null;
    const migrated = await cloudConfig.put(legacyLocalConfig);
    if (migrated) {
      localStorage.removeItem(constants.CONFIG_STORAGE_KEY);
      return legacyLocalConfig;
    }
    return null;
  };
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

  const formatOfficialCnyPerMillion = (value) => {
    const amount = normalizePriceValue(value);
    if (amount == null) return '未返回';
    return `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(amount)}`;
  };

  const getPricingLabel = (pricing) => {
    const inputCny = findFirstDefined(pricing?.inputCnyPerMillion, pricing?.promptCnyPerMillion);
    const outputCny = findFirstDefined(pricing?.outputCnyPerMillion, pricing?.completionCnyPerMillion);
    const cachedInputCny = pricing?.cachedInputCnyPerMillion;
    if (inputCny !== undefined || outputCny !== undefined) {
      if (pricing?.peak) {
        return `闲时：输入 ${formatOfficialCnyPerMillion(inputCny)} / 输出 ${formatOfficialCnyPerMillion(outputCny)}\n高峰：输入 ${formatOfficialCnyPerMillion(pricing.peak.inputCnyPerMillion)} / 输出 ${formatOfficialCnyPerMillion(pricing.peak.outputCnyPerMillion)}\n元 / 百万 tokens${pricing.snapshot ? ' · 官方快照' : ''}`;
      }
      const base = `入 ${formatOfficialCnyPerMillion(inputCny)} / 出 ${formatOfficialCnyPerMillion(outputCny)}（每百万 tokens）`;
      return cachedInputCny !== undefined ? `${base} · 缓存 ${formatOfficialCnyPerMillion(cachedInputCny)}` : base;
    }
    if (pricing?.unavailable) return '官方未返回价格';
    const prompt = formatCnyPerMillionTokens(pricing?.prompt);
    const completion = formatCnyPerMillionTokens(pricing?.completion);
    return prompt === '—' && completion === '—' ? '官方未返回价格' : `${prompt} / ${completion}（折合元/百万 tokens）`;
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

  const getProviderGroupLabel = (value) => getModelManufacturerLabel(value, getAiProvider());

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
      const response = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
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
    if (open) positionConfigDropdown(refs.modelDropdown);
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
    const config = getFormConfig();
    if (!isLmStudioProvider(config.aiProvider) && config.apiKey && Date.now() - lastModelSyncAt > 300000) void fetchModels();
    syncModelDropdown();
    setModelDropdownOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      refs.modelSelectPanel?.querySelector('.model-dropdown-search-input')?.focus({ preventScroll: true });
      scrollActiveModelIntoView();
    }));
  };

  const renderModelOptionContent = (option) => {
    const provider = getAiProvider();
    const knownReasoning = provider === PROVIDER_DEEPSEEK && Boolean(findOfficialModelPrice(DEEPSEEK_OFFICIAL_SNAPSHOT, option.value));
    const display = getModelOptionPresentation(option, provider, knownReasoning);
    return `<span class="model-dropdown-option-body">
      <span class="model-dropdown-option-label" title="${utils.escapeHtml(display.title)}">${utils.escapeHtml(display.title)}</span>
      <span class="model-dropdown-option-id" title="${utils.escapeHtml(display.id)}">${utils.escapeHtml(display.id)}</span>
    </span><span class="model-dropdown-option-meta">${utils.escapeHtml(display.meta)}</span>`;
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
      const pricing = parseJsonMaybe(option.pricing);
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
        return `
          <button
            type="button"
            class="model-dropdown-option${isActive ? ' is-active' : ''}"
            role="option"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-model-value="${option.value}">
            ${renderModelOptionContent(option)}
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
          placeholder="搜索模型或厂商"
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

  const setDeepSeekModelOptions = (preferredModel = DEFAULT_DEEPSEEK_MODEL) => {
    buildModelSelect(DEEPSEEK_MODEL_OPTIONS.map(normalizeDeepSeekModel));
    if (!refs.modelSelect) return;
    const preferred = String(preferredModel || DEFAULT_DEEPSEEK_MODEL).trim();
    if ([...refs.modelSelect.options].some((option) => option.value === preferred)) {
      refs.modelSelect.value = preferred;
    } else {
      refs.modelSelect.value = DEFAULT_DEEPSEEK_MODEL;
    }
    syncModelState();
    syncPreview();
  };

  const setSiliconFlowModelOptions = (preferredModel = DEFAULT_SILICONFLOW_MODEL) => {
    buildModelSelect(buildSiliconFlowModelList([]));
    if (!refs.modelSelect) return;
    const preferred = String(preferredModel || DEFAULT_SILICONFLOW_MODEL).trim();
    if (preferred && ![...refs.modelSelect.options].some((option) => option.value === preferred)) {
      ensureModelOption(preferred);
    }
    if ([...refs.modelSelect.options].some((option) => option.value === preferred)) {
      refs.modelSelect.value = preferred;
    } else {
      refs.modelSelect.value = DEFAULT_SILICONFLOW_MODEL;
    }
    syncModelState();
    syncModelDropdown();
    syncPreview();
  };

  const getSiliconFlowModelSortRank = (id) => {
    if (id === DEFAULT_SILICONFLOW_MODEL) return 0;
    const optionIndex = SILICONFLOW_MODEL_OPTIONS.findIndex((option) => option.id === id);
    if (optionIndex >= 0) return optionIndex + 1;
    const catalogIndex = SILICONFLOW_MODEL_CATALOG.findIndex((option) => option.id === id);
    return catalogIndex >= 0 ? catalogIndex + 20 : 1000;
  };

  const buildSiliconFlowModelList = (rawModels) => {
    const apiModels = (Array.isArray(rawModels) ? rawModels : [])
      .filter((item) => item?.id && item.id.includes('/'))
      .map((item) => {
        const catalog = getSiliconFlowCatalogEntry(item.id);
        return normalizeSiliconFlowModel({
          ...item,
          category: item.category || catalog?.subType || '',
        });
      })
      .filter((item) => {
        const catalog = getSiliconFlowCatalogEntry(item.id);
        return catalog ? isSiliconFlowChatCatalogModel(catalog) : isSiliconFlowChatCatalogModel(item);
      });

    const models = apiModels.length
      ? apiModels
      : SILICONFLOW_MODEL_CATALOG
        .filter(isSiliconFlowChatCatalogModel)
        .map((item) => normalizeSiliconFlowModel({ id: item.id }));

    return models.sort((a, b) => {
      const rankA = getSiliconFlowModelSortRank(a.id);
      const rankB = getSiliconFlowModelSortRank(b.id);
      return rankA - rankB || String(a.id || '').localeCompare(String(b.id || ''));
    });
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

  let lastModelSyncAt = 0;
  let modelSyncTimer = 0;
  let modelRequestId = 0;
  let modelRequestController: AbortController | null = null;
  const fetchModels = async () => {
    const config = getFormConfig();
    const isLocal = isLmStudioProvider(config.aiProvider);
    const isDeepSeek = isDeepSeekProvider(config.aiProvider);
    const isSiliconFlow = isSiliconFlowProvider(config.aiProvider);
    const requestedProvider = config.aiProvider;
    const requestId = ++modelRequestId;
    modelRequestController?.abort();
    const isStaleProviderRequest = () => {
      const current = getFormConfig();
      return requestId !== modelRequestId || current.aiProvider !== requestedProvider || current.apiKey !== config.apiKey || current.baseUrl !== config.baseUrl;
    };
    if (isLocal && refs.openrouterBaseUrl) {
      refs.openrouterBaseUrl.value = config.baseUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    modelRequestController = controller;

    try {
      setStatus(isLocal
        ? '正在加载 LM Studio 本地模型列表…'
        : isDeepSeek
          ? '正在加载 DeepSeek 模型列表…'
          : isSiliconFlow
            ? '正在加载硅基流动模型列表…'
        : '正在加载 OpenRouter 官方模型列表…', 'success');
      const modelsUrl = isLocal || isDeepSeek || isSiliconFlow
        ? `${config.baseUrl}/models`
        : `${config.baseUrl}/models?output_modalities=text,image`;
      const response = await fetchWithTimeout(modelsUrl, {
        method: 'GET',
        headers: getRequestHeaders(config),
        cache: 'no-store',
        signal: controller.signal,
      }, 15000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      let rawModels = Array.isArray(payload?.data)
        ? payload.data.filter((item) => item && typeof item.id === 'string')
        : [];
      if (isStaleProviderRequest()) return;
      if (isDeepSeek && /^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/i.test(config.baseUrl)) {
        try {
          const snapshot = await fetchOfficialDeepSeekPricing(controller.signal);
          rawModels = rawModels.map((item) => {
            const official = findOfficialModelPrice(snapshot, item.id);
            return official ? { ...item, context_length: item.context_length || official.contextLength,
              pricing: { ...official.pricing, source: snapshot.source, updatedAt: snapshot.fetchedAt } } : item;
          });
        } catch {
          // Keep the verified official snapshot without an extra persistent notice.
        }
      }
      if (isStaleProviderRequest()) return;
      const models = isLocal
        ? rawModels
          .filter((item) => !isInvalidLmStudioChatModel(item))
          .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
        : isDeepSeek
          ? rawModels
            .filter((item) => item.id && !item.id.includes('/'))
            .map(normalizeDeepSeekModel)
            .sort((a, b) => {
              const rank = (id) => {
                if (id === DEFAULT_DEEPSEEK_MODEL) return 0;
                if (id === 'deepseek-v4-pro') return 1;
                if (id === 'deepseek-chat') return 2;
                if (id === 'deepseek-reasoner') return 3;
                return 10;
              };
              return rank(a.id) - rank(b.id) || String(a.id || '').localeCompare(String(b.id || ''));
            })
          : isSiliconFlow
            ? buildSiliconFlowModelList(rawModels)
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
      buildModelSelect(
        isDeepSeek && !models.length
          ? DEEPSEEK_MODEL_OPTIONS.map(normalizeDeepSeekModel)
          : isSiliconFlow && !models.length
            ? buildSiliconFlowModelList([])
        : models
      );
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
        const providerKey = isDeepSeek
          ? PROVIDER_DEEPSEEK
          : isSiliconFlow
            ? PROVIDER_SILICONFLOW
          : PROVIDER_OPENROUTER;
        providerDrafts[providerKey] = {
          ...providerDrafts[providerKey],
          modelChoice: refs.modelSelect.value,
        };
      }
      if (!isLocal) {
        recordLoadedOpenRouterApiKey(config);
      }
      setStatus(isLocal
        ? `已加载 LM Studio 本地模型列表：${models.length || 0} 项`
        : isDeepSeek
          ? `已加载 DeepSeek 模型列表：${models.length || 0} 项`
          : isSiliconFlow
            ? `已加载硅基流动模型列表：${models.length || 0} 项`
        : `已加载模型列表：${models.length || 0} 项`, 'success');
      lastModelSyncAt = Date.now();
      // Snapshot provenance remains in the price row and tooltip, not the save area.
      if (config.logEnabled) saveLog({ type: 'models', provider: config.aiProvider, at: new Date().toISOString(), count: models.length || 0 });
      return true;
    } catch (error) {
      if (isStaleProviderRequest()) return;
      if (isLocal) setLmStudioModelPlaceholder();
      if (isDeepSeek) setDeepSeekModelOptions(providerDrafts[PROVIDER_DEEPSEEK]?.modelChoice || DEFAULT_DEEPSEEK_MODEL);
      if (isSiliconFlow) setSiliconFlowModelOptions(providerDrafts[PROVIDER_SILICONFLOW]?.modelChoice || DEFAULT_SILICONFLOW_MODEL);
      setStatus(isLocal
        ? `本地模型加载失败：请确认 LM Studio 已启动并加载模型（${error?.message || '未知错误'}）`
        : isDeepSeek
          ? `DeepSeek 模型加载失败：已保留内置模型选项（${error?.message || '未知错误'}）`
          : isSiliconFlow
            ? `硅基流动模型加载失败：已保留内置模型选项（${error?.message || '未知错误'}）`
        : `模型加载失败：${error?.message || '未知错误'}`, 'warn');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  const fetchBalanceJson = async (url, config, signal) => {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: getRequestHeaders(config),
      cache: 'no-store',
      signal,
    }, 12000);
    if (!response.ok) throw new Error(await readApiErrorMessage(response));
    return response.json();
  };

  const setApimartBalanceStatus = (message, state = 'idle', title = '') => {
    const { balanceButton, balanceText } = getApimartRefs();
    if (balanceText) balanceText.textContent = message;
    if (!balanceButton) return;
    balanceButton.classList.remove('is-loading', 'is-success', 'is-warn');
    if (state !== 'idle') balanceButton.classList.add(`is-${state}`);
    balanceButton.title = title;
  };

  const formatApimartBalance = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) throw new Error('未返回有效积分');
    return new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const readApimartBalance = async () => {
    const config = getFormConfig();
    const { balanceButton } = getApimartRefs();
    if (!config.apimartApiKey) {
      setApimartBalanceStatus('请先填写 API Key', 'warn');
      return;
    }
    if (balanceButton) balanceButton.disabled = true;
    setApimartBalanceStatus('查询中...', 'loading');
    try {
      const response = await requestApimart({
        baseUrl: APIMART_DEFAULT_BASE_URL, path: '/balance', method: 'GET', apiKey: config.apimartApiKey,
      }, 12000);
      if (!response.ok) throw new Error(await readApiErrorMessage(response));
      const data = unwrapApimartPayload(await response.json());
      const remaining = data.unlimited_quota ? '不限额' : formatApimartBalance(data.remain_credits);
      setApimartBalanceStatus(`额度：${remaining}${data.unlimited_quota ? '' : ' 积分'}`, 'success', '当前 API Key 的可用额度');
    } catch (error) {
      setApimartBalanceStatus('查询失败', 'warn', error?.message || '未知错误');
      App.notify?.warn?.(`APIMart 额度查询失败：${error?.message || '未知错误'}`, { key: 'apimart-balance-error' });
    } finally {
      if (balanceButton) balanceButton.disabled = false;
    }
  };

  let balanceRefreshTimer = 0;
  let balanceConfigSignature = '';
  let balanceRequestId = 0;
  let balanceController: AbortController | null = null;
  const cancelBalanceRequest = () => {
    window.clearTimeout(balanceRefreshTimer);
    balanceRefreshTimer = 0;
    balanceRequestId += 1;
    balanceController?.abort();
    balanceController = null;
    const { button } = getBalanceRefs();
    if (button) button.disabled = false;
  };
  const queueBalanceRefresh = () => {
    const config = getFormConfig();
    const signature = JSON.stringify([config.aiProvider, config.baseUrl, config.apiKey]);
    if (signature === balanceConfigSignature) return;
    balanceConfigSignature = signature;
    cancelBalanceRequest();
    if (isLmStudioProvider(config.aiProvider)) {
      setBalanceStatus('余额：本地模型无需查询');
      return;
    }
    setBalanceStatus(config.apiKey ? '余额：正在查询...' : '余额：未配置密钥');
    if (config.apiKey) balanceRefreshTimer = window.setTimeout(() => { void readBalance(); }, 400);
  };

  const readBalance = async () => {
    cancelBalanceRequest();
    const requestId = balanceRequestId;
    const config = getFormConfig();
    const isLocal = isLmStudioProvider(config.aiProvider);
    const isDeepSeek = isDeepSeekProvider(config.aiProvider);
    const isSiliconFlow = isSiliconFlowProvider(config.aiProvider);
    const balanceRefs = getBalanceRefs();
    if (isLocal) {
      setBalanceStatus('余额：本地模型无需查询');
      return;
    }
    if (!config.apiKey) {
      setBalanceStatus('余额：请先填写 API Key', 'warn');
      return;
    }

    const baseUrl = utils.normalizeBaseUrl(config.baseUrl);
    const controller = new AbortController();
    balanceController = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    const publishBalance = (message, tone = 'success') => {
      if (requestId === balanceRequestId) setBalanceStatus(message, tone);
    };
    if (balanceRefs.button) balanceRefs.button.disabled = true;
    setBalanceStatus('余额：正在查询...');

    try {
      if (isDeepSeek) {
        const payload = await fetchBalanceJson(`${baseUrl}/user/balance`, config, controller.signal);
        publishBalance(formatDeepSeekBalance(payload));
      } else if (isSiliconFlow) {
        const payload = await fetchBalanceJson(`${baseUrl}/user/info`, config, controller.signal);
        publishBalance(formatSiliconFlowUserInfo(payload));
      } else {
        publishBalance('余额：当前接入暂不支持余额查询');
      }
    } catch (error) {
      publishBalance(`余额：读取失败（${error?.message || '未知错误'}）`, 'warn');
    } finally {
      clearTimeout(timeout);
      if (requestId === balanceRequestId) {
        balanceController = null;
        if (balanceRefs.button) balanceRefs.button.disabled = false;
      }
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
    const callStartMs = window.performance?.now?.() ?? Date.now();

    try {
      setStatus('正在测试聊天接入…', 'success');
      const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
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
      }, AI_FETCH_TIMEOUT_MS);
      if (!response.ok) throw new Error(await readApiErrorMessage(response));
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
      setFormConfig(dropRedactedSecrets(parsed));
      await persistConfig(getFormConfig());
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
    utils.downloadUtf8Json(`ai-config-${new Date().toISOString().slice(0, 10)}.json`, redactSensitiveConfig(getFormConfig()));
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
      title: '清空云端配置',
      message: '确认清空云端共享配置并恢复默认值？其他设备也会受到影响。',
      confirmText: '确认清空',
    });
    if (!confirmed) return;
    clearOpenRouterModelRefreshTimer();
    const cleared = await cloudConfig.clear();
    if (!cleared) {
      setStatus('云端配置清空失败，请稍后重试', 'warn');
      App.notify?.warn?.('云端配置清空失败，请稍后重试', { key: 'config-clear-failed' });
      return;
    }
    localStorage.removeItem(constants.CONFIG_STORAGE_KEY);
    setFormConfig(constants.DEFAULT_CONFIG);
    lastLoadedOpenRouterApiKey = '';
    updateSavedState(false);
    syncPreview();
    setStatus('已清空云端配置', 'warn');
    App.notify?.warn?.('已清空云端配置', { key: 'config-clear' });
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

    Array.from(document.querySelectorAll('input[name="aiProvider"]')).forEach((input) => {
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
        if (!isLmStudioProvider(nextProvider) && providerDrafts[nextProvider]?.apiKey) {
          readBalance();
        }
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
      getApimartRefs().accessKey,
      getApimartRefs().baseUrl,
      getApimartRefs().imageModel,
      getApimartRefs().imageModelCustom,
      getApimartRefs().videoModel,
      getApimartRefs().videoModelCustom,
      refs.ossBucket,
      refs.ossEndpoint,
      refs.ossObjectKey,
      refs.ossAccessKeyId,
      refs.ossAccessKeySecret,
      refs.ossExcelBackupPrefix,
    ]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('input', () => {
        if (input === getApimartRefs().imageModel || input === getApimartRefs().videoModel) {
          const apimartRefs = getApimartRefs();
          if (apimartRefs.imageModelCustom) apimartRefs.imageModelCustom.hidden = apimartRefs.imageModel?.value !== 'custom';
          if (apimartRefs.videoModelCustom) apimartRefs.videoModelCustom.hidden = apimartRefs.videoModel?.value !== 'custom';
        }
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

    [refs.streamEnabled, getAssistantBehaviorRefs().autoImageUpload, refs.jsonMode, refs.logEnabled]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('change', syncPreview));

    [getApimartRefs().imageModel, getApimartRefs().videoModel]
      .filter(Boolean)
      .forEach((select) => select.addEventListener('change', () => {
        const apimartRefs = getApimartRefs();
        if (apimartRefs.imageModelCustom) apimartRefs.imageModelCustom.hidden = apimartRefs.imageModel?.value !== 'custom';
        if (apimartRefs.videoModelCustom) apimartRefs.videoModelCustom.hidden = apimartRefs.videoModel?.value !== 'custom';
        syncPreview();
      }));

    refs.aiConfigForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const config = getFormConfig();
      const hasOssConfig = Boolean(config.ossBucket || config.ossEndpoint || config.ossObjectKey || config.ossAccessKeyId || config.ossAccessKeySecret);
      const hasApimartConfig = Boolean(config.apimartApiKey);
      if (!isLmStudioProvider(config.aiProvider) && !config.apiKey && !hasOssConfig && !hasApimartConfig) {
        setStatus('请先填写模型 API 密钥、APIMart 密钥或 OSS 配置', 'warn');
        App.notify?.warn?.('请先填写模型 API 密钥、APIMart 密钥或 OSS 配置', { key: 'config-save-missing-secret' });
        return;
      }
      try {
        await persistConfig(config);
      } catch {
        setStatus('云端保存失败，请稍后重试', 'warn');
        App.notify?.warn?.('云端保存失败，请稍后重试', { key: 'config-save-failed' });
        return;
      }
      clearOpenRouterModelRefreshTimer();
      if (!isLmStudioProvider(config.aiProvider) && config.apiKey) {
        fetchModels();
        void readBalance();
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

    getApimartRefs().accessKeyToggle?.addEventListener('click', () => {
      const apimartRefs = getApimartRefs();
      if (!apimartRefs.accessKey) return;
      apimartRefs.accessKey.type = apimartRefs.accessKey.type === 'password' ? 'text' : 'password';
      apimartRefs.accessKeyToggle.setAttribute(
        'aria-label',
        apimartRefs.accessKey.type === 'password' ? '显示 APIMart API Key' : '隐藏 APIMart API Key',
      );
      apimartRefs.accessKeyToggle.classList.toggle('is-visible', apimartRefs.accessKey.type === 'text');
      syncApimartKeyToggleIcon();
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
        nextInput.focus({ preventScroll: true });
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
    getBalanceRefs().button?.addEventListener('click', readBalance);
    getApimartRefs().balanceButton?.addEventListener('click', readApimartBalance);
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

  const init = async () => {
    const configPage = document.querySelector('.ai-config');
    if (configPage && !configPage.querySelector('.config-loading-shell')) {
      const loadingShell = document.createElement('div');
      loadingShell.className = 'config-loading-shell';
      loadingShell.innerHTML = `
        <span class="config-loading-spinner" aria-hidden="true"></span>
        <strong>正在加载配置中心</strong>
        <span>同步云端配置并准备页面布局</span>
      `;
      configPage.appendChild(loadingShell);
    }
    mountApimartConfigSection();
    mountAssistantBehaviorControls();
    mountDeepSeekProviderOption();
    mountSiliconFlowProviderOption();
    mountBalanceControl();
    removeLegacyStorageConfigSection();
    mountConfigContentPanel();
    stopDropdownPositioning?.();
    if (refs.aiConfigForm) stopDropdownPositioning = watchConfigDropdowns(refs.aiConfigForm);
    App.customSelects?.enhanceAll?.();
    syncConfigBindings();

    const savedConfig = await loadSavedConfig();
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
    syncApimartKeyToggleIcon();
    syncTemperatureLabel();
    syncPreview();
    const initialConfig = getFormConfig();
    if (!isLmStudioProvider(initialConfig.aiProvider) && initialConfig.apiKey) {
      void readBalance();
      window.setTimeout(() => {
        fetchModels();
      }, 0);
    } else {
      setStatus('配置已加载；模型列表和实时汇率将在手动刷新时联网获取。', 'success');
    }
    window.clearInterval(modelSyncTimer);
    modelSyncTimer = window.setInterval(() => {
      const config = getFormConfig();
      if (document.visibilityState === 'visible' && configPage?.classList.contains('active') && !isLmStudioProvider(config.aiProvider) && config.apiKey) void fetchModels();
    }, 300000);
    configPage?.classList.add('config-ready');
  };

  const cleanup = () => {
    window.clearInterval(modelSyncTimer);
    modelRequestId += 1;
    modelRequestController?.abort();
    modelRequestController = null;
    cancelBalanceRequest();
    balanceConfigSignature = '';
    stopDropdownPositioning?.();
    clearOpenRouterModelRefreshTimer();
    closeModelDropdown();
  };

  App.config = {
    init,
    cleanup,
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
