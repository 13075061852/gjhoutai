import { mountApimartReactBitsShowcase } from '../../components/reactbits/ApimartReactBitsShowcase';
import { LOCAL_STORAGE_KEYS } from '../../services/local-storage-keys';
import { AI_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../../utils/fetch';
import { getLegacyApp } from '../core/app-context';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { refs, constants, utils } = App;
  const PAGE_ID = 'apimart-media';
  const STORAGE_KEY = LOCAL_STORAGE_KEYS.apimartMediaTasks;
  const MAX_TASKS = 30;
  const IMAGE_MODELS = [
    ['gpt-image-2', 'GPT-Image-2'],
    ['gpt-image-2-official', 'GPT-Image-2 Official'],
    ['gpt-image-1-official', 'GPT-Image-1 Official'],
    ['gpt-image-1.5-official', 'GPT-Image-1.5 Official'],
    ['flux-2-flex', 'Flux 2 Flex'],
    ['flux-2-pro', 'Flux 2 Pro'],
    ['flux-kontext-pro', 'Flux Kontext Pro'],
    ['wan2.7-image-pro', 'Wan2.7 Image Pro'],
    ['seedream-4.0', 'Seedream 4.0'],
    ['seedream-4.5', 'Seedream 4.5'],
    ['grok-imagine-1.0-apimart', 'Grok Imagine 1.0'],
  ];
  const VIDEO_MODELS = [
    ['sora-2', 'Sora 2'],
    ['sora-2-preview', 'Sora 2 Preview'],
    ['veo3.1-fast', 'VEO3.1 Fast'],
    ['veo3.1-quality', 'VEO3.1 Quality'],
    ['veo3.1-lite', 'VEO3.1 Lite'],
    ['veo3.1-fast-official', 'VEO3.1 Fast Official'],
    ['wan2.6', 'Wan2.6'],
    ['doubao-seedance-2.0', 'Doubao Seedance 2.0'],
    ['doubao-seedance-1-5-pro', 'Doubao Seedance 1.5 Pro'],
    ['MiniMax-Hailuo-02', 'MiniMax Hailuo 02'],
    ['grok-imagine-1.0-video-apimart', 'Grok Imagine Video'],
    ['kling-v2-6-motion-control', 'Kling 2.6 Motion Control'],
  ];
  const IMAGE_RESOLUTIONS = [
    ['1k', '1K (1024 × 576)'],
    ['2k', '2K (2048 × 1152)'],
    ['4k', '4K (4096 × 2304)'],
  ];
  const VIDEO_RESOLUTIONS = [
    ['720p', '720p'],
    ['1080p', '1080p'],
    ['4k', '4K'],
  ];
  const ASPECT_RATIOS = [
    ['16:9', '16:9'],
    ['4:3', '4:3'],
    ['1:1', '1:1'],
    ['3:4', '3:4'],
    ['9:16', '9:16'],
  ];
  const ADVANCED_PROMPTS = [
    {
      id: 'cinematic-portrait',
      label: '电影人像',
      icon: 'ti-video',
      prompt: '电影级写实人像，主体眼神清晰，35mm 镜头，浅景深，柔和轮廓光，真实肤色，细腻皮肤纹理，背景有层次但不喧宾夺主，高级调色，8K 细节',
    },
    {
      id: 'product-hero',
      label: '产品大片',
      icon: 'ti-package',
      prompt: '高端产品商业摄影，主体居中偏上，干净背景，柔和棚拍布光，边缘高光清晰，材质反射自然，微距质感，品牌海报构图，留出标题空间，超清细节',
    },
    {
      id: 'architectural-space',
      label: '建筑空间',
      icon: 'ti-building-factory-2',
      prompt: '现代建筑空间摄影，广角透视，结构线条干净，晨间自然天光，真实玻璃与木石材质，空间纵深明显，少量人物尺度参照，杂物极少，杂志封面级构图',
    },
    {
      id: 'poster-keyart',
      label: '电影海报',
      icon: 'ti-photo-spark',
      prompt: '电影概念海报，强叙事主视觉，前景主体明确，中景动作张力，远景环境压迫感，戏剧化顶光与边缘光，色彩对比强烈，竖版构图，保留上方标题区域',
    },
    {
      id: 'oriental-fantasy',
      label: '东方奇幻',
      icon: 'ti-palette',
      prompt: '东方奇幻插画，云海山峦，飞檐建筑，流动丝绸与金色纹样，水墨层次结合精细数字绘画，氛围空灵，主体衣纹精致，画面留白优雅',
    },
    {
      id: 'character-design',
      label: '角色设定',
      icon: 'ti-user',
      prompt: '完整角色设定图，正面站姿，服装层次清晰，配饰和道具细节完整，轮廓辨识度高，干净浅色背景，角色比例稳定，概念设计稿质感',
    },
    {
      id: 'miniature-world',
      label: '微缩世界',
      icon: 'ti-world',
      prompt: '微缩景观摄影，日常物件构成奇幻小世界，超近距离微距镜头，真实景深，微小人物与环境互动，暖色自然光，材质细节丰富，画面有故事感',
    },
    {
      id: 'fashion-editorial',
      label: '时尚大片',
      icon: 'ti-tags',
      prompt: '高级时装杂志大片，模特姿态自然有力量，服装面料纹理清晰，极简场景，硬光与柔光混合，低饱和高级色调，大片构图，真实摄影质感',
    },
    {
      id: 'food-commercial',
      label: '美食广告',
      icon: 'ti-star',
      prompt: '高端美食广告摄影，食物表面光泽自然，热气与新鲜感明显，桌面布景克制，侧逆光突出质感，浅景深，色彩诱人但真实，商业菜单级画面',
    },
    {
      id: 'sci-fi-interface',
      label: '科幻界面',
      icon: 'ti-cpu-2',
      prompt: '未来科幻操作界面场景，透明全息屏幕，精密数据图层，冷色环境光，金属与玻璃材质，人物手部交互自然，空间有纵深，硬科幻电影美术风格',
    },
    {
      id: 'street-photography',
      label: '街拍纪实',
      icon: 'ti-building',
      prompt: '城市街头纪实摄影，徕卡 M 系列镜头质感，35mm 焦段，自然光与霓虹混合，雨后湿润路面反光，行人动态模糊，城市纵深透视，胶片颗粒感，人文故事性构图',
    },
    {
      id: 'nature-landscape',
      label: '自然风光',
      icon: 'ti-sun',
      prompt: '壮阔自然风光摄影，16mm 超广角，黄金时段低角度光线，前景花海或岩石引导线，中景湖泊倒影，远景雪山层叠，天空云层戏剧化，HDR 宽动态范围，国家地理级画面',
    },
    {
      id: 'automotive',
      label: '汽车大片',
      icon: 'ti-car',
      prompt: '高端汽车广告摄影，车辆 45 度角经典构图，清晨公路或城市天际线背景，车身漆面高光反射环境，轮毂细节锐利，运动模糊路面，暗调高级氛围，汽车杂志封面级',
    },
    {
      id: 'jewelry-luxury',
      label: '珠宝奢品',
      icon: 'ti-diamond',
      prompt: '高端珠宝广告摄影，微距镜头捕捉切面火彩，黑色丝绒背景，精准点光源制造星芒，金属表面无指纹，钻石折射彩虹光谱，极浅景深突出主体，奢侈品画册质感',
    },
    {
      id: 'travel-editorial',
      label: '旅行大片',
      icon: 'ti-plane',
      prompt: '旅行杂志编辑级摄影，异域风情场景，当地人文元素自然融入，清晨或黄昏柔和光线，航拍视角与地面视角结合，色彩饱和但不失真，画面有呼吸感和叙事性',
    },
    {
      id: 'interior-design',
      label: '室内设计',
      icon: 'ti-armchair',
      prompt: '高端室内设计摄影，北欧极简或日式侘寂风格，自然光从大落地窗倾泻，家具材质纹理清晰，空间比例协调，绿植点缀生机，Architectural Digest 级构图与调色',
    },
    {
      id: 'tech-product',
      label: '科技产品',
      icon: 'ti-device-mobile',
      prompt: '科技产品广告摄影，悬浮或斜角展示，屏幕内容清晰可见，金属与玻璃材质高光精致，深色渐变背景突出产品，界面 UI 可读，苹果风格极简产品摄影',
    },
    {
      id: 'sneaker-streetwear',
      label: '潮牌运动',
      icon: 'ti-shoe',
      prompt: '运动鞋/潮牌产品摄影，动态悬浮姿态，鞋底纹理与材质细节锐利，城市街头或工业风背景，烟雾或水花特效增强动感，侧光勾勒轮廓，潮流杂志级视觉冲击力',
    },
    {
      id: 'perfume-beauty',
      label: '美妆香氛',
      icon: 'ti-flask',
      prompt: '高端香水/美妆广告摄影，瓶身玻璃质感通透，液体流动瞬间捕捉，花瓣或水珠环绕，柔焦梦幻背景，逆光轮廓光勾勒，低饱和高级色调，Vogue 美妆大片质感',
    },
    {
      id: 'night-cityscape',
      label: '城市夜景',
      icon: 'ti-moon-stars',
      prompt: '城市夜景长曝光摄影，车流光轨如河流穿梭，摩天大楼灯火通明，天空呈现深蓝到紫的渐变，水面倒影对称构图，三脚架稳定画质锐利，8K 超高清城市全景',
    },
    {
      id: 'underwater',
      label: '水下世界',
      icon: 'ti-seeding',
      prompt: '水下摄影，珊瑚礁生态场景，热带鱼群穿梭，阳光穿透水面形成丁达尔光束，色彩鲜艳但不饱和失真，水下能见度高，海洋生物细节清晰，国家海洋地理级画面',
    },
  ];
  const DEFAULT_UI_STATE = {
    type: 'image',
    model: '',
    prompt: '',
    referenceUrls: '',
    size: '16:9',
    resolution: '1k',
    count: 1,
    duration: 5,
    resultPage: 0,
    imageModel: '',
    videoModel: '',
    imageResolution: '1k',
    videoResolution: '720p',
    imageCount: 1,
    videoDuration: 5,
    resultCleared: false,
  };
  let bound = false;
  let tasks: any[] = [];
  let uiState: any = { ...DEFAULT_UI_STATE };
  const pollTimers = new Map();
  let previewKeydownHandler = null;
  let reactBitsShowcaseCleanup = null;

  const esc = (value) => utils.escapeHtml(value);
  const getConfig = () => {
    const saved = App.config?.getFormConfig?.() || App.config?.loadSavedConfig?.() || constants.DEFAULT_CONFIG;
    return {
      apiKey: String(saved.apimartApiKey || '').trim(),
      baseUrl: utils.normalizeBaseUrl(saved.apimartBaseUrl || constants.DEFAULT_APIMART_BASE_URL),
      imageModel: String(saved.apimartImageModel || constants.DEFAULT_CONFIG.apimartImageModel || 'gpt-image-2').trim(),
      videoModel: String(saved.apimartVideoModel || constants.DEFAULT_CONFIG.apimartVideoModel || 'sora-2').trim(),
    };
  };

  const readTasks = () => {
    const value = utils.readJson(STORAGE_KEY, []);
    return Array.isArray(value) ? value : [];
  };

  const writeTasks = () => {
    utils.writeJson(STORAGE_KEY, tasks.slice(0, MAX_TASKS));
  };

  const readApiError = async (response) => {
    const fallback = `HTTP ${response.status}`;
    const text = await response.text().catch(() => '');
    if (!text) return fallback;
    try {
      const payload = JSON.parse(text);
      const message = payload?.error?.message || payload?.message || payload?.error || payload?.data?.message;
      return message ? `${fallback}: ${String(message).slice(0, 240)}` : `${fallback}: ${text.slice(0, 240)}`;
    } catch {
      return `${fallback}: ${text.slice(0, 240)}`;
    }
  };

  const requestJson = async (path, options = {} as any) => {
    const config = getConfig();
    if (!config.apiKey) throw new Error('请先在配置中心填写 APIMart API Key');
    const response = await fetchWithTimeout(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await readApiError(response));
    return response.json();
  };

  const normalizeTaskId = (payload) => {
    const data = payload?.data;
    if (Array.isArray(data)) return data[0]?.task_id || data[0]?.id || '';
    return data?.task_id || data?.id || payload?.task_id || payload?.id || '';
  };

  const normalizeAllTaskIds = (payload) => {
    const data = payload?.data;
    if (Array.isArray(data)) return data.map((item) => item?.task_id || item?.id || '').filter(Boolean);
    const single = data?.task_id || data?.id || payload?.task_id || payload?.id || '';
    return single ? [single] : [];
  };

  const extractResultUrls = (task) => {
    const result = task?.result || {};
    const collectOne = (value) => {
      if (Array.isArray(value)) return value.filter(Boolean);
      return value ? [value] : [];
    };
    const collect = (items) => (Array.isArray(items) ? items.flatMap((item) => {
      const url = item?.url ?? item?.urls ?? item?.video_url ?? item?.image_url;
      if (Array.isArray(url)) return url;
      return url ? [url] : [];
    }) : []);
    return {
      images: [...collect(result.images), ...collectOne(result.image_url)],
      videos: [...collect(result.videos), ...collectOne(result.video_url)],
      thumbnail: result.thumbnail_url || result.cover_url || '',
    };
  };

  const submitGeneration = async (type, params = {} as any) => {
    const config = getConfig();
    const payload = {
      ...params,
      model: params.model || (type === 'video' ? config.videoModel : config.imageModel),
    };
    const path = type === 'video' ? '/v1/videos/generations' : '/v1/images/generations';
    const response = await requestJson(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const taskId = normalizeTaskId(response);
    if (!taskId) throw new Error('APIMart 未返回 task_id');
    return { taskId, response };
  };

  const trackSubmittedTasks = ({ type, payload, response }) => {
    const allIds = normalizeAllTaskIds(response);
    const createdIds = [];
    for (const id of allIds) {
      if (tasks.some((t) => t.id === id)) continue;
      const task = {
        id,
        type,
        model: payload.model,
        prompt: payload.prompt,
        size: payload.size || payload.aspect_ratio || uiState.size,
        resolution: payload.resolution || uiState.resolution,
        cost: Number(response?.data?.cost || response?.cost || 0) / (allIds.length || 1),
        status: 'submitted',
        progress: 0,
        images: [],
        videos: [],
        thumbnail: '',
        error: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        raw: response,
      };
      tasks = [task, ...tasks.filter((item) => item.id !== id)].slice(0, MAX_TASKS);
      createdIds.push(id);
    }
    uiState.resultPage = 0;
    uiState.resultCleared = false;
    writeTasks();
    render();
    createdIds.forEach((id) => pollTask(id, true));
    return createdIds;
  };

  const submitAndTrackGeneration = async (type, payload = {} as any) => {
    const submitted = await submitGeneration(type, payload);
    const createdIds = trackSubmittedTasks({ type, payload: { ...payload, model: payload.model || getConfig()[type === 'video' ? 'videoModel' : 'imageModel'] }, response: submitted.response });
    return { ...submitted, createdIds };
  };

  const getTaskStatus = async (taskId, language = 'zh') => {
    const payload = await requestJson(`/v1/tasks/${encodeURIComponent(taskId)}?language=${encodeURIComponent(language)}`);
    return payload?.data || payload;
  };

  const updateTask = (id, patch = {} as any) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task));
    writeTasks();
    scheduleRender();
  };

  const deleteTask = (id) => {
    const timer = pollTimers.get(id);
    if (timer) { window.clearTimeout(timer); pollTimers.delete(id); }
    tasks = tasks.filter((task) => task.id !== id);
    writeTasks();
    if (uiState.activeTaskId === id) uiState.activeTaskId = tasks[0]?.id || '';
    scheduleRender();
  };

  let renderTimer = null;
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      render();
    }, 100);
  };

  const pollTask = async (id, immediate = false) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return;
    if (!immediate) {
      const existing = pollTimers.get(id);
      if (existing) window.clearTimeout(existing);
    }

    try {
      const data = await getTaskStatus(id);
      const urls = extractResultUrls(data);
      updateTask(id, {
        status: data.status || task.status,
        progress: Number(data.progress ?? task.progress ?? 0),
        cost: Number(data.cost ?? task.cost ?? 0),
        result: data.result || task.result || null,
        images: urls.images,
        videos: urls.videos,
        thumbnail: urls.thumbnail,
        error: data.error?.message || '',
        raw: data,
      });
      if (!['completed', 'failed', 'cancelled'].includes(data.status)) {
        const timer = window.setTimeout(() => pollTask(id), 5000);
        pollTimers.set(id, timer);
      } else {
        pollTimers.delete(id);
      }
    } catch (error) {
      updateTask(id, { error: error?.message || '任务查询失败' });
      const timer = window.setTimeout(() => pollTask(id), 8000);
      pollTimers.set(id, timer);
    }
  };

  const parseReferenceUrls = (value) => {
    const text = String(value || '').trim();
    if (!text) return [];
    const lines = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    return lines.flatMap((line) => {
      if (line.startsWith('data:')) return [line];
      return line.split(',').map((item) => item.trim()).filter(Boolean);
    });
  };

  const renderReferencePreviewItems = (value) => {
    const urls = parseReferenceUrls(value);
    if (!urls.length) return '未选择文件';
    return urls.map((url, index) => `
      <span class="apimart-reference-preview-item">
        <img src="${esc(url)}" alt="参考图 ${index + 1}" loading="lazy" />
        <button class="apimart-reference-remove-btn" type="button" data-apimart-remove-reference="${esc(String(index))}" aria-label="移除参考图 ${index + 1}" title="移除参考图">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <b>${index + 1}</b>
      </span>
    `).join('');
  };

  const updateReferenceUi = (value) => {
    const panel = refs.apimartMediaPanel;
    const textarea = panel?.querySelector('#apimartReferenceUrls');
    const fileNamesEl = panel?.querySelector('#apimartReferenceFileNames');
    if (textarea) textarea.value = String(value || '');
    if (fileNamesEl) fileNamesEl.innerHTML = renderReferencePreviewItems(value);
    uiState.referenceUrls = String(value || '');
  };

  const addReferenceImageUrl = (url) => {
    const value = String(url || '').trim();
    if (!value) return false;
    const existing = parseReferenceUrls(uiState.referenceUrls);
    if (existing.includes(value)) {
      App.notify?.warn?.('这张图已经在参考图里了', { key: 'apimart-ref-duplicate' });
      return false;
    }
    const nextValue = [...existing, value].join('\n');
    updateReferenceUi(nextValue);
    App.notify?.success?.('已添加到参考图，下一次生成会自动参考它', { key: 'apimart-ref-added' });
    return true;
  };

  const removeReferenceImageAt = (index) => {
    const urls = parseReferenceUrls(uiState.referenceUrls);
    const removeIndex = Number(index);
    if (!Number.isInteger(removeIndex) || removeIndex < 0 || removeIndex >= urls.length) return false;
    urls.splice(removeIndex, 1);
    updateReferenceUi(urls.join('\n'));
    App.notify?.success?.('已移除参考图', { key: 'apimart-ref-removed' });
    return true;
  };

  const readReferenceFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file?.type?.match?.(/^image\/(jpeg|png)$/)) {
      reject(new Error(`${file?.name || '文件'} 仅支持 JPG / PNG`));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error(`${file.name} 超过 10MB 限制`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`));
    reader.readAsDataURL(file);
  });

  const handleReferenceFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    const fileNamesEl = refs.apimartMediaPanel?.querySelector('#apimartReferenceFileNames');
    if (fileNamesEl) {
      fileNamesEl.innerHTML = files.length
        ? files.map((file) => `<span>${esc(file.name)} · ${esc(formatFileSize(file.size))}</span>`).join('')
        : renderReferencePreviewItems(uiState.referenceUrls);
    }
    if (!files.length) return;

    try {
      const dataUrls = await Promise.all(files.map(readReferenceFileAsDataUrl)) as string[];
      const textarea = refs.apimartMediaPanel?.querySelector('#apimartReferenceUrls');
      const existingUrls = parseReferenceUrls(textarea?.value || uiState.referenceUrls);
      const nextUrls = [...existingUrls];
      dataUrls.forEach((url) => {
        if (!nextUrls.includes(url)) nextUrls.push(url);
      });
      updateReferenceUi(nextUrls.join('\n'));
      captureUiState();
    } catch (err) {
      if (fileNamesEl) fileNamesEl.innerHTML = renderReferencePreviewItems(uiState.referenceUrls);
      App.notify?.warn?.(err.message || '参考图上传失败', { key: 'apimart-ref-upload' });
    }
  };

  const renderModelOptions = (models, selectedValue = '') => {
    const selected = String(selectedValue || '').trim();
    const customSelected = selected && !models.some(([value]) => value === selected);
    return `${models.map(([value, label]) => `
      <option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)} (${esc(value)})</option>
    `).join('')}<option value="custom" ${customSelected ? 'selected' : ''}>自定义模型 ID...</option>`;
  };

  const renderResolutionOptions = (type = 'image', selectedValue = '') => {
    const fallback = type === 'video' ? '720p' : '1k';
    const selected = String(selectedValue || fallback).toLowerCase();
    const options = type === 'video' ? VIDEO_RESOLUTIONS : IMAGE_RESOLUTIONS;
    return options.map(([value, label]) => `
      <option value="${esc(value)}" ${String(value).toLowerCase() === selected ? 'selected' : ''}>${esc(label)}</option>
    `).join('');
  };

  const getSelectedModel = () => {
    const panel = refs.apimartMediaPanel;
    const select = panel?.querySelector('#apimartModel');
    const custom = panel?.querySelector('#apimartModelCustom');
    return String(select?.value === 'custom' ? custom?.value : select?.value || '').trim();
  };

  const setSelectedModel = (type, value = '') => {
    const panel = refs.apimartMediaPanel;
    const select = panel?.querySelector('#apimartModel');
    const custom = panel?.querySelector('#apimartModelCustom');
    if (!select) return;
    const models = type === 'video' ? VIDEO_MODELS : IMAGE_MODELS;
    const normalized = String(value || '').trim();
    select.innerHTML = renderModelOptions(models, normalized || models[0]?.[0] || '');
    if (custom) {
      custom.value = models.some(([model]) => model === normalized) ? '' : normalized;
      custom.hidden = select.value !== 'custom';
    }
  };

  const clampNumber = (value, min, max, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  };

  const captureUiState = () => {
    const panel = refs.apimartMediaPanel;
    if (!panel?.childElementCount) return;
    const type = panel.querySelector('[name="apimartMediaType"]:checked')?.value || uiState.type || 'image';
    uiState = {
      ...uiState,
      type,
      model: getSelectedModel() || uiState.model,
      prompt: panel.querySelector('#apimartPrompt')?.value || '',
      referenceUrls: panel.querySelector('#apimartReferenceUrls')?.value || '',
      size: panel.querySelector('[name="apimartSize"]:checked')?.value || uiState.size || '16:9',
      resolution: panel.querySelector('#apimartResolution')?.value || uiState.resolution || (type === 'video' ? '720p' : '1k'),
      count: clampNumber(panel.querySelector('#apimartCount')?.value, 1, 4, uiState.count || 1),
      duration: clampNumber(panel.querySelector('#apimartDuration')?.value, 1, 16, uiState.duration || 5),
    };
  };

  const getActiveModel = (config, type = uiState.type) => {
    return uiState.model || (type === 'video' ? config.videoModel : config.imageModel);
  };

  const updatePromptCounter = () => {
    const panel = refs.apimartMediaPanel;
    const prompt = panel?.querySelector('#apimartPrompt')?.value || '';
    const counter = panel?.querySelector('#apimartPromptCounter');
    if (counter) counter.textContent = `${prompt.length} / 1000`;
  };

  const applyPrompt = (prompt) => {
    const panel = refs.apimartMediaPanel;
    const input = panel?.querySelector('#apimartPrompt');
    if (!input) return;
    input.value = String(prompt || '').slice(0, 1000);
    uiState.prompt = input.value;
    updatePromptCounter();
    input.focus();
  };

  const optimizePrompt = async () => {
    const panel = refs.apimartMediaPanel;
    const input = panel?.querySelector('#apimartPrompt');
    const btn = panel?.querySelector('#apimartPromptOptimize');
    if (!input || !btn) return;
    const currentPrompt = (input.value || '').trim();
    if (!currentPrompt) {
      App.notify?.warn?.('请先输入提示词再进行 AI 优化', { key: 'apimart-optimize-empty' });
      return;
    }
    const config = App.config?.getFormConfig?.() || App.config?.loadSavedConfig?.() || constants.DEFAULT_CONFIG;
    const apiKey = String(config.apiKey || '').trim();
    const baseUrl = String(config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    if (!apiKey) {
      App.notify?.warn?.('请先在配置中心填写 OpenRouter API 密钥', { key: 'apimart-optimize-no-key' });
      return;
    }
    const type = uiState.type || 'image';
    const sceneHint = type === 'video' ? '视频' : '图片';
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="apimart-ai-optimize-spinner"></span><span>优化中...</span>';
    try {
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config?.getRequestHeaders?.(config) || { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.modelChoice || 'xiaomi/mimo-v2.5',
          messages: [
            {
              role: 'system',
              content: `你是一位专业的 AI ${sceneHint}生成提示词优化专家。用户会给你一段简单的${sceneHint}描述，你需要将其优化为一段高质量、详细、专业的${sceneHint}生成提示词。

规则：
1. 保持用户原始意图不变
2. 补充画面细节：光影、构图、色调、材质、氛围
3. 使用专业摄影/美术术语
4. 控制在 500 字以内
5. 只输出优化后的提示词，不要解释、不要前缀
6. 中文输出`,
            },
            {
              role: 'user',
              content: currentPrompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 600,
          stream: false,
        }),
      }, AI_FETCH_TIMEOUT_MS);
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 120)}` : ''}`);
      }
      const payload = await response.json();
      const optimized = (payload?.choices?.[0]?.message?.content || '').trim();
      if (!optimized) throw new Error('AI 未返回优化结果');
      applyPrompt(optimized);
      App.notify?.success?.('提示词已优化', { key: 'apimart-optimize-done' });
    } catch (error) {
      App.notify?.warn?.(`优化失败：${error?.message || '未知错误'}`, { key: 'apimart-optimize-error' });
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  };

  const formatGenerationDuration = (task) => {
    const started = new Date(task?.createdAt || '').getTime();
    if (!Number.isFinite(started)) return '-- 秒';
    const terminal = ['completed', 'failed', 'cancelled'].includes(task?.status);
    const endedAt = terminal ? new Date(task?.updatedAt || task?.createdAt || '').getTime() : Date.now();
    const ended = Number.isFinite(endedAt) ? endedAt : started;
    const seconds = Math.max(0, Math.round((ended - started) / 1000));
    return terminal ? `${seconds} 秒` : `已用 ${seconds} 秒`;
  };

  const getTaskUrls = (task) => ({
    images: (task?.images || []).filter((url) => !(task?.invalidMediaUrls || []).includes(url)),
    videos: (task?.videos || []).filter((url) => !(task?.invalidMediaUrls || []).includes(url)),
    thumbnail: (task?.invalidMediaUrls || []).includes(task?.thumbnail) ? '' : (task?.thumbnail || ''),
  });

  const markInvalidMediaUrl = (taskId, url) => {
    if (!taskId || !url) return;
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id !== taskId) return task;
      const invalidMediaUrls = Array.from(new Set([...(task.invalidMediaUrls || []), url]));
      if ((task.invalidMediaUrls || []).length === invalidMediaUrls.length) return task;
      changed = true;
      return { ...task, invalidMediaUrls };
    });
    if (changed) {
      writeTasks();
      render();
    }
  };

  const getTaskMediaItems = (task) => {
    const urls = getTaskUrls(task);
    return [
      ...urls.images.map((url) => ({ type: 'image', url })),
      ...urls.videos.map((url) => ({ type: 'video', url })),
    ];
  };

  const getTaskPrimaryUrl = (task) => {
    const urls = getTaskUrls(task);
    return urls.images[0] || urls.thumbnail || urls.videos[0] || '';
  };

  const getTaskPrimaryImageUrl = (task) => {
    const urls = getTaskUrls(task);
    return urls.images[0] || '';
  };

  const getTaskPrimaryVideoUrl = (task) => {
    const urls = getTaskUrls(task);
    return urls.videos[0] || '';
  };

  const getStoredImageSize = (task, url = '') => {
    const size = task?.imageSizes?.[url];
    const width = Number(size?.width || 0);
    const height = Number(size?.height || 0);
    return width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : null;
  };

  const formatImageSize = (size) => (size?.width && size?.height ? `${size.width} × ${size.height}` : '');

  const getEstimatedImageSize = (task) => {
    if (!task || task.type === 'video') return null;
    const longEdgeMap = {
      '1k': 1024,
      '2k': 2048,
      '4k': 4096,
    };
    const longEdge = longEdgeMap[String(task.resolution || '').toLowerCase()] || longEdgeMap['1k'];
    const ratioMatch = String(task.size || '16:9').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!ratioMatch) return null;
    const ratioWidth = Number(ratioMatch[1]);
    const ratioHeight = Number(ratioMatch[2]);
    if (!ratioWidth || !ratioHeight) return null;
    if (ratioWidth >= ratioHeight) {
      return {
        width: longEdge,
        height: Math.round((longEdge * ratioHeight) / ratioWidth),
      };
    }
    return {
      width: Math.round((longEdge * ratioWidth) / ratioHeight),
      height: longEdge,
    };
  };

  const getImageSizeLabel = (task, url = '') => {
    return formatImageSize(getStoredImageSize(task, url) || getEstimatedImageSize(task)) || '尺寸待加载';
  };

  const getStoredFileSize = (task, url = '') => {
    const bytes = Number(task?.imageFileSizes?.[url] || 0);
    return bytes > 0 ? Math.round(bytes) : 0;
  };

  const getDataUrlFileSize = (url = '') => {
    const value = String(url || '');
    const match = value.match(/^data:[^,]*,(.*)$/);
    if (!match) return 0;
    const meta = value.slice(0, value.indexOf(','));
    const data = match[1] || '';
    if (meta.includes(';base64')) {
      const normalized = data.replace(/\s/g, '');
      const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
      return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
    }
    try {
      return new TextEncoder().encode(decodeURIComponent(data)).length;
    } catch {
      return data.length;
    }
  };

  const formatFileSize = (bytes) => {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 100 * 1024 ? 1 : 0)} KB`;
    return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 2 : 1)} MB`;
  };

  const getFileSizeLabel = (task, url = '') => {
    return formatFileSize(getStoredFileSize(task, url) || getDataUrlFileSize(url)) || '读取中';
  };

  const updateImageSizeLabels = (taskId, url, label) => {
    document.querySelectorAll('[data-apimart-size-label]').forEach((node) => {
      if (node.getAttribute('data-apimart-size-task') === taskId && node.getAttribute('data-apimart-size-url') === url) {
        node.textContent = label;
      }
    });
  };

  const updateFileSizeLabels = (taskId, url, label) => {
    document.querySelectorAll('[data-apimart-file-size-label]').forEach((node) => {
      if (node.getAttribute('data-apimart-file-size-task') === taskId && node.getAttribute('data-apimart-file-size-url') === url) {
        node.textContent = label;
      }
    });
  };

  const recordImageSize = (taskId, url, image) => {
    const width = Math.round(Number(image?.naturalWidth || image?.videoWidth || 0));
    const height = Math.round(Number(image?.naturalHeight || image?.videoHeight || 0));
    if (!taskId || !url || !width || !height) return;
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id !== taskId) return task;
      const current = getStoredImageSize(task, url);
      if (current?.width === width && current?.height === height) return task;
      changed = true;
      return {
        ...task,
        imageSizes: {
          ...(task.imageSizes || {}),
          [url]: { width, height },
        },
      };
    });
    const label = formatImageSize({ width, height });
    updateImageSizeLabels(taskId, url, label);
    if (changed) writeTasks();
  };

  const recordImageFileSize = (taskId, url, bytes) => {
    const size = Math.round(Number(bytes || 0));
    if (!taskId || !url || !size) return;
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id !== taskId) return task;
      if (getStoredFileSize(task, url) === size) return task;
      changed = true;
      return {
        ...task,
        imageFileSizes: {
          ...(task.imageFileSizes || {}),
          [url]: size,
        },
      };
    });
    updateFileSizeLabels(taskId, url, formatFileSize(size));
    if (changed) writeTasks();
  };

  const fetchImageFileSize = async (url) => {
    if (!url || url.startsWith('data:')) return getDataUrlFileSize(url);
    try {
      const head = await fetchWithTimeout(url, { method: 'HEAD', cache: 'force-cache' });
      if (head.ok) {
        const length = Number(head.headers.get('content-length') || 0);
        if (length > 0) return length;
      }
    } catch {
      // Some image hosts block HEAD/CORS metadata; fall back to reading the blob.
    }
    const response = await fetchWithTimeout(url, { cache: 'force-cache' });
    if (!response.ok) return 0;
    const blob = await response.blob();
    return Number(blob.size || 0);
  };

  const ensureImageFileSize = async (taskId, url) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !url || getStoredFileSize(task, url)) return;
    try {
      const bytes = await fetchImageFileSize(url);
      recordImageFileSize(taskId, url, bytes);
    } catch {
      updateFileSizeLabels(taskId, url, '无法读取');
    }
  };

  const refreshLoadedImageSizes = () => {
    document.querySelectorAll('img[data-apimart-size-image]').forEach((image) => {
      if (image.complete && image.naturalWidth) {
        recordImageSize(image.getAttribute('data-apimart-size-task'), image.getAttribute('data-apimart-size-url'), image);
      }
    });
  };

  const closeImagePreview = () => {
    document.querySelector('.apimart-image-preview')?.remove();
    if (previewKeydownHandler) {
      document.removeEventListener('keydown', previewKeydownHandler);
      previewKeydownHandler = null;
    }
  };

  const openImagePreview = (taskId, imageUrl) => {
    const task = tasks.find((item) => item.id === taskId);
    const url = String(imageUrl || '').trim();
    if (!task || !url) return;
    closeImagePreview();
    const transform = {
      scale: 1,
      x: 0,
      y: 0,
      dragging: false,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
    };
    const clampScale = (value) => Math.min(5, Math.max(1, Number(value) || 1));
    const preview = document.createElement('div');
    preview.className = 'apimart-image-preview';
    preview.innerHTML = `
      <div class="apimart-image-preview-dialog" role="dialog" aria-modal="true" aria-label="图片预览">
        <div class="apimart-image-preview-head">
          <div class="apimart-image-preview-title">
            <strong title="${esc(task.prompt || '生成图片')}">${esc(task.prompt || '生成图片')}</strong>
            <span>图片尺寸 <b data-apimart-size-label data-apimart-size-task="${esc(task.id)}" data-apimart-size-url="${esc(url)}">${esc(getImageSizeLabel(task, url))}</b></span>
            <span>文件大小 <b data-apimart-file-size-label data-apimart-file-size-task="${esc(task.id)}" data-apimart-file-size-url="${esc(url)}">${esc(getFileSizeLabel(task, url))}</b></span>
          </div>
          <div class="apimart-image-preview-actions">
            <button class="apimart-image-preview-close" type="button" aria-label="关闭图片预览">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="apimart-image-preview-body">
          <img src="${esc(url)}" alt="${esc(task.prompt || '图片预览')}" data-apimart-size-image data-apimart-size-task="${esc(task.id)}" data-apimart-size-url="${esc(url)}" />
        </div>
      </div>
    `;
    preview.addEventListener('click', (event) => {
      if (event.target === preview || event.target.closest('.apimart-image-preview-close')) {
        closeImagePreview();
      }
    });
    const body = preview.querySelector('.apimart-image-preview-body');
    const image = preview.querySelector('.apimart-image-preview-body img');
    const applyTransform = () => {
      if (!image) return;
      image.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
      body?.classList.toggle('is-zoomed', transform.scale > 1);
    };
    const updateScale = (nextScale) => {
      const scale = clampScale(nextScale);
      transform.scale = scale;
      if (scale <= 1) {
        transform.x = 0;
        transform.y = 0;
      }
      applyTransform();
    };
    body?.addEventListener('wheel', (event) => {
      event.preventDefault();
      updateScale(transform.scale + (event.deltaY < 0 ? 0.18 : -0.18));
    }, { passive: false });
    body?.addEventListener('pointerdown', (event) => {
      if (transform.scale <= 1 || event.button !== 0) return;
      transform.dragging = true;
      transform.startX = event.clientX;
      transform.startY = event.clientY;
      transform.originX = transform.x;
      transform.originY = transform.y;
      body.classList.add('is-dragging');
      body.setPointerCapture?.(event.pointerId);
    });
    body?.addEventListener('pointermove', (event) => {
      if (!transform.dragging) return;
      transform.x = transform.originX + event.clientX - transform.startX;
      transform.y = transform.originY + event.clientY - transform.startY;
      applyTransform();
    });
    const stopDrag = (event) => {
      transform.dragging = false;
      body?.classList.remove('is-dragging');
      body?.releasePointerCapture?.(event.pointerId);
    };
    body?.addEventListener('pointerup', stopDrag);
    body?.addEventListener('pointercancel', stopDrag);
    previewKeydownHandler = (event) => {
      if (event.key === 'Escape') closeImagePreview();
      if (event.key === '+' || event.key === '=') updateScale(transform.scale + 0.25);
      if (event.key === '-') updateScale(transform.scale - 0.25);
      if (event.key === '0') {
        transform.x = 0;
        transform.y = 0;
        updateScale(1);
      }
    };
    document.addEventListener('keydown', previewKeydownHandler);
    document.body.appendChild(preview);
    applyTransform();
    refreshLoadedImageSizes();
    ensureImageFileSize(task.id, url);
  };

  const openVideoPreview = (taskId, videoUrl) => {
    const task = tasks.find((item) => item.id === taskId);
    const url = String(videoUrl || '').trim();
    if (!task || !url) return;
    closeImagePreview();
    const preview = document.createElement('div');
    preview.className = 'apimart-image-preview apimart-video-preview';
    preview.innerHTML = `
      <div class="apimart-image-preview-dialog" role="dialog" aria-modal="true" aria-label="视频预览">
        <div class="apimart-image-preview-head">
          <div class="apimart-image-preview-title">
            <strong title="${esc(task.prompt || '生成视频')}">${esc(task.prompt || '生成视频')}</strong>
            <span>视频比例 <b>${esc(task.size || task.aspect_ratio || '16:9')}</b></span>
            <span>生成耗时 <b>${esc(formatGenerationDuration(task))}</b></span>
          </div>
          <div class="apimart-image-preview-actions">
            <button class="apimart-image-preview-close" type="button" aria-label="关闭视频预览">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="apimart-image-preview-body apimart-video-preview-body">
          <video src="${esc(url)}" controls autoplay playsinline preload="metadata"></video>
        </div>
      </div>
    `;
    preview.addEventListener('click', (event) => {
      if (event.target === preview || event.target.closest('.apimart-image-preview-close')) {
        closeImagePreview();
      }
    });
    previewKeydownHandler = (event) => {
      if (event.key === 'Escape') closeImagePreview();
    };
    document.addEventListener('keydown', previewKeydownHandler);
    document.body.appendChild(preview);
  };

  const getTaskStatusLabel = (status = '') => {
    const map = {
      submitted: '已提交',
      queued: '排队中',
      pending: '排队中',
      running: '生成中',
      processing: '生成中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    return map[status] || status || '生成中';
  };

  const formatUsd = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '$--';
    return `$${numeric.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')}`;
  };

  const renderAspectButtons = () => ASPECT_RATIOS.map(([value, label]) => {
    const active = uiState.size === value;
    return `
      <label class="apimart-ratio-option ${active ? 'is-active' : ''}">
        <input name="apimartSize" type="radio" value="${esc(value)}" ${active ? 'checked' : ''} />
        <span class="apimart-ratio-glyph apimart-ratio-${esc(value.replace(':', '-'))}" aria-hidden="true"></span>
        <span>${esc(label)}</span>
      </label>
    `;
  }).join('');

  const renderResultMedia = (task) => {
    const items = getTaskMediaItems(task);
    if (!items.length) return '';
    const activeIndex = clampNumber(uiState.resultPage, 0, items.length - 1, 0);
    uiState.resultPage = activeIndex;
    const item = items[activeIndex];
    const media = item.type === 'image'
      ? `
        <div class="apimart-result-media">
          <button class="apimart-result-preview-btn" type="button" data-apimart-preview-task="${esc(task.id)}" data-apimart-preview-url="${esc(item.url)}" aria-label="放大查看生成图片">
            <img src="${esc(item.url)}" alt="APIMart generated image" loading="lazy" data-apimart-size-image data-apimart-size-task="${esc(task.id)}" data-apimart-size-url="${esc(item.url)}" />
            <span class="apimart-image-size-badge" data-apimart-size-label data-apimart-size-task="${esc(task.id)}" data-apimart-size-url="${esc(item.url)}">${esc(getImageSizeLabel(task, item.url))}</span>
          </button>
          <button class="apimart-add-reference-btn" type="button" data-apimart-add-reference="${esc(item.url)}">
            <i class="ti ti-photo-up" aria-hidden="true"></i>
            <span>设为参考图</span>
          </button>
        </div>
      `
      : `<video class="apimart-result-media apimart-result-video" src="${esc(item.url)}" controls preload="metadata"></video>`;
    return `
      <div class="apimart-result-pager">
        <div class="apimart-result-frame">
          ${media}
        </div>
      </div>
    `;
  };

  const renderEmptyResult = (task) => {
    const hasTask = Boolean(task);
    const title = hasTask ? `${getTaskStatusLabel(task.status)}，你的作品正在路上` : '你的生成结果将显示在这里';
    const desc = hasTask ? '任务完成后会自动展示图片或视频结果，可在历史记录中刷新状态。' : '在左侧设置参数并点击“生成图像”开始创作';
    return `
      <div class="apimart-result-empty">
        <div id="apimartReactBitsHero" class="apimart-reactbits-mount" aria-label="React Bits AI 绘图展示"></div>
        <div class="apimart-empty-visual" aria-hidden="true">
          <span class="apimart-empty-card apimart-empty-card-back"></span>
          <span class="apimart-empty-card apimart-empty-card-front">
            <i class="ti ti-photo-up" aria-hidden="true"></i>
          </span>
          <span class="apimart-empty-spark apimart-empty-spark-one"></span>
          <span class="apimart-empty-spark apimart-empty-spark-two"></span>
        </div>
        <div class="apimart-empty-title">${esc(title)}</div>
        <div class="apimart-empty-desc">${esc(desc)}</div>
      </div>
    `;
  };

  const renderLatestResult = () => {
    const latest = uiState.resultCleared ? null : tasks[0];
    const media = latest ? renderResultMedia(latest) : '';
    return `
      <section class="apimart-result-panel">
        <div class="apimart-section-head">
          <h2>生成结果</h2>
          <div class="apimart-head-actions">
            <button class="apimart-ghost-btn" id="apimartClearBtn" type="button" ${latest ? '' : 'disabled'}>
              <i class="ti ti-trash" aria-hidden="true"></i>
              <span>清空</span>
            </button>
          </div>
        </div>
        <div class="apimart-result-stage ${media ? 'is-paged' : 'is-empty'}">
          ${media || renderEmptyResult(latest)}
        </div>
      </section>
    `;
  };

  const renderHistoryItem = (task) => {
    const statusClass = ['completed', 'failed', 'cancelled'].includes(task.status) ? task.status : 'running';
    const primaryUrl = getTaskPrimaryUrl(task);
    const primaryImageUrl = getTaskPrimaryImageUrl(task);
    const primaryVideoUrl = getTaskPrimaryVideoUrl(task);
    const primaryStillUrl = primaryImageUrl || task.thumbnail || '';
    const urls = [...(task.images || []), ...(task.videos || [])];
    const isCompleted = task.status === 'completed';
    const isTerminal = ['completed', 'failed', 'cancelled'].includes(task.status);
    const statusBadge = isCompleted ? '' : `<span class="apimart-history-status ${isTerminal ? '' : 'is-polling'}">${isTerminal ? '' : '<span class="apimart-polling-dot" aria-hidden="true"></span>'}${esc(getTaskStatusLabel(task.status))}</span>`;
    const hasClickableImage = Boolean(primaryImageUrl);
    const hasClickableVideo = !hasClickableImage && Boolean(primaryVideoUrl);
    const thumbMedia = primaryStillUrl
      ? `<img src="${esc(primaryStillUrl)}" alt="${esc(task.prompt || '生成历史')}" loading="lazy" data-apimart-size-image data-apimart-size-task="${esc(task.id)}" data-apimart-size-url="${esc(primaryStillUrl)}" />`
      : (primaryVideoUrl
        ? `<video src="${esc(primaryVideoUrl)}" muted playsinline preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload noplaybackrate noremoteplayback" aria-label="${esc(task.prompt || '生成视频历史')}"></video>`
        : '<i class="ti ti-photo-up" aria-hidden="true"></i>');
    return `
      <article class="apimart-history-item apimart-status-${statusClass}">
        ${hasClickableImage ? `<button class="apimart-history-thumb" type="button" data-apimart-preview-task="${esc(task.id)}" data-apimart-preview-url="${esc(primaryImageUrl)}" aria-label="放大查看历史图片">` : (hasClickableVideo ? `<button class="apimart-history-thumb" type="button" data-apimart-preview-task="${esc(task.id)}" data-apimart-preview-video-url="${esc(primaryVideoUrl)}" aria-label="放大播放历史视频">` : `<div class="apimart-history-thumb ${primaryUrl ? '' : 'is-pending'}">`)}
          ${thumbMedia}
          ${primaryImageUrl ? `<span class="apimart-image-size-badge" data-apimart-size-label data-apimart-size-task="${esc(task.id)}" data-apimart-size-url="${esc(primaryImageUrl)}">${esc(getImageSizeLabel(task, primaryImageUrl))}</span>` : ''}
          ${statusBadge}
        ${hasClickableImage || hasClickableVideo ? '</button>' : '</div>'}
        <div class="apimart-history-foot">
          <span><i class="ti ti-photo-up" aria-hidden="true"></i>${esc(task.size || task.aspect_ratio || (task.type === 'video' ? '16:9' : '1:1'))}</span>
          <span><i class="ti ti-table" aria-hidden="true"></i>${esc(task.cost ? formatUsd(task.cost) : (task.resolution || '-'))}</span>
          <strong>${esc(formatGenerationDuration(task))}</strong>
        </div>
        <div class="apimart-history-actions">
          ${primaryStillUrl ? `<button type="button" data-apimart-add-reference="${esc(primaryStillUrl)}" aria-label="设为参考图" title="设为参考图"><i class="ti ti-photo-up" aria-hidden="true"></i></button>` : ''}
          ${urls.length ? `<button type="button" data-apimart-copy="${esc(urls.join('\n'))}" aria-label="复制链接"><i class="ti ti-copy" aria-hidden="true"></i></button>` : ''}
          <button type="button" data-apimart-delete-task="${esc(task.id)}" aria-label="删除记录" title="删除记录" class="apimart-delete-btn"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </article>
    `;
  };

  const renderHistory = () => `
    <section class="apimart-history-panel">
      <div class="apimart-section-head">
        <h2><i class="ti ti-clock-history" aria-hidden="true"></i>历史记录</h2>
        <button class="apimart-ghost-btn" type="button" data-apimart-scroll-history ${tasks.length ? '' : 'disabled'}>
          <span>查看全部</span>
          <i class="ti ti-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
      <div class="apimart-history-strip">
        ${tasks.length ? tasks.slice(0, 8).map(renderHistoryItem).join('') : `
          <div class="apimart-history-empty">
            <div class="apimart-history-empty-art" aria-hidden="true">
              <span class="apimart-history-empty-tile"></span>
              <span class="apimart-history-empty-tile"></span>
              <span class="apimart-history-empty-tile"></span>
            </div>
            <div>
              <strong>还没有作品记录</strong>
              <span>生成完成后会在这里保留缩略图、比例和费用信息。</span>
            </div>
          </div>
        `}
      </div>
    </section>
  `;

  const collectFormPayload = () => {
    const panel = refs.apimartMediaPanel;
    captureUiState();
    const type = panel?.querySelector('[name="apimartMediaType"]:checked')?.value || 'image';
    const prompt = panel?.querySelector('#apimartPrompt')?.value.trim() || '';
    const referenceUrls = parseReferenceUrls(panel?.querySelector('#apimartReferenceUrls')?.value || '');
    const size = panel?.querySelector('[name="apimartSize"]:checked')?.value || uiState.size || '16:9';
    const resolution = panel?.querySelector('#apimartResolution')?.value || '';
    const duration = Number(panel?.querySelector('#apimartDuration')?.value || 5);
    const model = getSelectedModel();
    if (!prompt) throw new Error('请先输入生成提示词');
    if (!model) throw new Error('请先选择生成模型');

    if (type === 'video') {
      return {
        type,
        payload: {
          model,
          prompt,
          duration,
          aspect_ratio: size,
          resolution,
          image_urls: referenceUrls.length ? referenceUrls : undefined,
        },
      };
    }

    return {
      type,
      payload: {
        model,
        prompt,
        size,
        resolution,
        n: Number(panel?.querySelector('#apimartCount')?.value || 1),
        image_urls: referenceUrls.length ? referenceUrls : undefined,
      },
    };
  };

  const submitFromUi = async () => {
    const submitBtn = refs.apimartMediaPanel?.querySelector('#apimartSubmitBtn');
    const status = refs.apimartMediaPanel?.querySelector('#apimartSubmitStatus');
    try {
      if (submitBtn) submitBtn.disabled = true;
      if (status) status.textContent = '正在提交到 APIMart...';
      const { type, payload } = collectFormPayload();
      const { taskId, createdIds } = await submitAndTrackGeneration(type, payload);
      App.notify?.success?.(`已提交 ${createdIds.length} 个任务`, { key: `apimart-submit-${taskId}` });
    } catch (error) {
      if (status) status.textContent = error?.message || '提交失败';
      App.notify?.warn?.(error?.message || 'APIMart 提交失败', { key: 'apimart-submit-failed' });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  const render = (capture = true) => {
    const panel = refs.apimartMediaPanel;
    if (!panel) return;
    reactBitsShowcaseCleanup?.();
    reactBitsShowcaseCleanup = null;
    const isVisible = refs.apimartMediaPageSection?.classList.contains('active');
    if (capture && isVisible) captureUiState();
    const config = getConfig();
    const type = uiState.type || 'image';
    const models = type === 'video' ? VIDEO_MODELS : IMAGE_MODELS;
    const selectedModel = getActiveModel(config, type);
    const selectedModelIsCustom = selectedModel && !models.some(([value]) => value === selectedModel);
    uiState.model = selectedModel;
    const submitText = type === 'video' ? '生成视频' : '生成图像';
    panel.innerHTML = `
      <div class="apimart-workbench">
        <aside class="apimart-creator-panel" aria-label="AI 绘图参数">
          <div class="apimart-type-row" role="radiogroup" aria-label="生成类型">
            <label class="${type === 'image' ? 'is-active' : ''}">
              <input name="apimartMediaType" type="radio" value="image" ${type === 'image' ? 'checked' : ''} />
              <i class="ti ti-photo-up" aria-hidden="true"></i>
              <span>图像生成</span>
            </label>
            <label class="${type === 'video' ? 'is-active' : ''}">
              <input name="apimartMediaType" type="radio" value="video" ${type === 'video' ? 'checked' : ''} />
              <i class="ti ti-player-play" aria-hidden="true"></i>
              <span>视频生成</span>
            </label>
          </div>

          <div class="apimart-scroll-area">
            <section class="apimart-panel-block">
              <div class="apimart-field-label">模型</div>
              <div id="apimartReactBitsModel"></div>
            </section>

            <section class="apimart-panel-block">
              <div class="apimart-field-row">
                <label class="apimart-field-label" for="apimartPrompt">提示词</label>
                <button class="apimart-link-btn" id="apimartPromptClear" type="button">清空</button>
              </div>
              <div class="apimart-prompt-box">
                <textarea id="apimartPrompt" rows="7" maxlength="1000" placeholder="描述你想要生成的画面、主体、风格、镜头运动等">${esc(uiState.prompt)}</textarea>
                <div class="apimart-prompt-tools">
                  <button type="button" id="apimartPromptRandom">
                    <i class="ti ti-refresh" aria-hidden="true"></i>
                    <span>随机提示词</span>
                  </button>
                  <button class="apimart-ai-optimize-btn" id="apimartPromptOptimize" type="button">
                    <i class="ti ti-sparkles" aria-hidden="true"></i>
                    <span>AI优化</span>
                  </button>
                  <span id="apimartPromptCounter">${esc(String(uiState.prompt || '').length)} / 1000</span>
                </div>
              </div>
            </section>

            <section class="apimart-panel-block apimart-reactbits-prompt-mount-block">
              <div id="apimartReactBitsPrompt" class="apimart-reactbits-prompt-mount"></div>
            </section>

            <section class="apimart-panel-block">
              <div class="apimart-panel-title">参数设置</div>
              <div class="apimart-field-label">比例</div>
              <div class="apimart-ratio-grid" role="radiogroup" aria-label="画面比例">
                ${renderAspectButtons()}
              </div>
              <div class="apimart-params-grid">
                <label class="apimart-field">
                  <span>分辨率</span>
                  <select id="apimartResolution">
                    ${renderResolutionOptions(type, uiState.resolution || (type === 'video' ? '720p' : '1k'))}
                  </select>
                </label>
                <label class="apimart-field">
                  <span>${type === 'video' ? '时长' : '数量'}</span>
                  <span class="apimart-stepper">
                    <button id="apimartStepperMinus" type="button" aria-label="减少${type === 'video' ? '时长' : '数量'}">−</button>
                    <input id="${type === 'video' ? 'apimartDuration' : 'apimartCount'}" type="number" min="${type === 'video' ? '1' : '1'}" max="${type === 'video' ? '16' : '4'}" value="${type === 'video' ? esc(uiState.duration) : esc(uiState.count)}" />
                    <button id="apimartStepperPlus" type="button" aria-label="增加${type === 'video' ? '时长' : '数量'}">+</button>
                  </span>
                  <input id="${type === 'video' ? 'apimartCount' : 'apimartDuration'}" type="number" min="${type === 'video' ? '1' : '1'}" max="${type === 'video' ? '4' : '16'}" value="${type === 'video' ? esc(uiState.count) : esc(uiState.duration)}" ${type === 'video' ? 'disabled' : 'disabled'} hidden />
                </label>
              </div>
            </section>

            <section class="apimart-panel-block apimart-reference-block">
              <label class="apimart-field-label" for="apimartReferenceFile">参考图 <span>（可选）</span></label>
              <div class="apimart-reference-box" id="apimartReferenceUploadBtn">
                <span class="apimart-reference-icon"><i class="ti ti-upload" aria-hidden="true"></i></span>
                <div class="apimart-reference-main">
                  <strong>上传参考图</strong>
                  <span>JPG / PNG，单张最多 10MB</span>
                </div>
                <input id="apimartReferenceFile" type="file" accept="image/jpeg,image/png" multiple hidden />
                <div id="apimartReferenceFileNames" class="apimart-reference-file-names">${renderReferencePreviewItems(uiState.referenceUrls)}</div>
                <textarea id="apimartReferenceUrls" hidden>${esc(uiState.referenceUrls)}</textarea>
              </div>
            </section>

            <section class="apimart-panel-block apimart-advanced ${uiState.advancedOpen ? 'is-open' : ''}">
              <button class="apimart-advanced-toggle" id="apimartAdvancedToggle" type="button" aria-expanded="${uiState.advancedOpen ? 'true' : 'false'}">
                <span><i class="ti ti-settings" aria-hidden="true"></i>高级设置</span>
                <i class="ti ti-chevron-down" aria-hidden="true"></i>
              </button>
              <div class="apimart-advanced-body" ${uiState.advancedOpen ? '' : 'hidden'}>
                <div id="apimartSubmitStatus" class="apimart-submit-status">${config.apiKey ? 'APIMart 配置已读取' : '请先在配置中心填写 APIMart API Key'}</div>
                <button class="apimart-link-btn" type="button" data-apimart-config>配置密钥与模型默认值</button>
              </div>
            </section>
          </div>

          <div class="apimart-submit-bar">
            <button class="apimart-submit-btn" id="apimartSubmitBtn" type="button">
              <i class="ti ti-send-2" aria-hidden="true"></i>
              <span>${submitText}</span>
            </button>
            <button class="apimart-save-btn" id="apimartConfigJumpBtn" type="button" aria-label="配置密钥" title="配置密钥">
              <i class="ti ti-settings" aria-hidden="true"></i>
            </button>
          </div>
        </aside>

        <main class="apimart-preview-column" aria-label="AI 绘图结果">
          ${renderLatestResult()}
          ${renderHistory()}
        </main>
      </div>
    `;
    reactBitsShowcaseCleanup = mountApimartReactBitsShowcase({
      heroTarget: panel.querySelector('#apimartReactBitsHero'),
      modelTarget: panel.querySelector('#apimartReactBitsModel'),
      promptTarget: panel.querySelector('#apimartReactBitsPrompt'),
      ideas: ADVANCED_PROMPTS,
      models,
      selectedModel,
      selectedModelIsCustom,
      modelHint: type === 'video' ? '高质量视频生成模型' : '高质量图像生成模型',
      mode: type,
      taskCount: tasks.length,
      hasApiKey: Boolean(config.apiKey),
      latestStatus: tasks[0] ? getTaskStatusLabel(tasks[0].status) : '',
      onPromptSelect: applyPrompt,
    } as any);
    window.requestAnimationFrame?.(() => {
      App.customSelects?.enhanceAll?.(panel);
    });
    updatePromptCounter();
    window.requestAnimationFrame?.(refreshLoadedImageSizes);
  };

  const syncMediaType = () => {
    const panel = refs.apimartMediaPanel;
    const config = getConfig();
    const newType = panel?.querySelector('[name="apimartMediaType"]:checked')?.value || 'image';
    if (uiState.type !== newType) {
      if (uiState.type === 'image') {
        uiState.imageModel = uiState.model;
        uiState.imageResolution = uiState.resolution;
        uiState.imageCount = uiState.count;
      } else {
        uiState.videoModel = uiState.model;
        uiState.videoResolution = uiState.resolution;
        uiState.videoDuration = uiState.duration;
      }
    }
    const perTypeModel = newType === 'video' ? uiState.videoModel : uiState.imageModel;
    const perTypeResolution = newType === 'video' ? uiState.videoResolution : uiState.imageResolution;
    uiState = {
      ...uiState,
      type: newType,
      model: perTypeModel || (newType === 'video' ? config.videoModel : config.imageModel),
      resolution: perTypeResolution || (newType === 'video' ? '720p' : '1k'),
      count: newType === 'image' ? (uiState.imageCount || 1) : 1,
      duration: newType === 'video' ? (uiState.videoDuration || 5) : 5,
    };
    render(false);
  };

  const bind = () => {
    if (bound || !refs.apimartMediaPanel) return;
    bound = true;
    refs.apimartMediaPanel.addEventListener('input', (event) => {
      const target = event.target;
      if (target?.matches?.('#apimartPrompt')) updatePromptCounter();
      if (target?.matches?.('#apimartPrompt, #apimartReferenceUrls, #apimartCount, #apimartDuration, #apimartModelCustom')) {
        captureUiState();
      }
    });
    refs.apimartMediaPanel.addEventListener('change', (event) => {
      const target = event.target;
      if (target?.matches?.('[name="apimartMediaType"]')) {
        syncMediaType();
        return;
      }
      if (target?.matches?.('#apimartModel')) {
        const custom = refs.apimartMediaPanel?.querySelector('#apimartModelCustom');
        if (custom) custom.hidden = event.target.value !== 'custom';
        captureUiState();
        if (uiState.type === 'image') uiState.imageModel = uiState.model;
        else uiState.videoModel = uiState.model;
        render(false);
        return;
      }
      if (target?.matches?.('[name="apimartSize"]')) {
        uiState.size = target.value;
        refs.apimartMediaPanel?.querySelectorAll('.apimart-ratio-option').forEach((item) => {
          const input = item.querySelector('input');
          item.classList.toggle('is-active', input?.checked);
        });
        captureUiState();
        return;
      }
      if (target?.matches?.('#apimartResolution')) {
        captureUiState();
        if (uiState.type === 'image') uiState.imageResolution = uiState.resolution;
        else uiState.videoResolution = uiState.resolution;
      }
      if (target?.matches?.('#apimartReferenceFile')) {
        handleReferenceFiles(target.files);
        target.value = '';
      }
    });
    refs.apimartMediaPanel.addEventListener('dragover', (event) => {
      const dropzone = event.target?.closest?.('#apimartReferenceUploadBtn');
      if (!dropzone) return;
      event.preventDefault();
      dropzone.classList.add('is-drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    refs.apimartMediaPanel.addEventListener('dragleave', (event) => {
      const dropzone = event.target?.closest?.('#apimartReferenceUploadBtn');
      if (!dropzone || dropzone.contains(event.relatedTarget)) return;
      dropzone.classList.remove('is-drag-over');
    });
    refs.apimartMediaPanel.addEventListener('drop', (event) => {
      const dropzone = event.target?.closest?.('#apimartReferenceUploadBtn');
      if (!dropzone) return;
      event.preventDefault();
      dropzone.classList.remove('is-drag-over');
      handleReferenceFiles(event.dataTransfer?.files);
    });
    document.addEventListener('load', (event) => {
      const image = event.target;
      if (!image?.matches?.('img[data-apimart-size-image]')) return;
      recordImageSize(image.getAttribute('data-apimart-size-task'), image.getAttribute('data-apimart-size-url'), image);
    }, true);
    document.addEventListener('error', (event) => {
      const image = event.target;
      if (!image?.matches?.('img[data-apimart-size-image]')) return;
      markInvalidMediaUrl(image.getAttribute('data-apimart-size-task'), image.getAttribute('data-apimart-size-url'));
    }, true);
    refs.apimartMediaPanel.addEventListener('click', async (event) => {
      const target = event.target;
      if (target.closest('#apimartPromptRandom')) {
        const item = ADVANCED_PROMPTS[Math.floor(Math.random() * ADVANCED_PROMPTS.length)];
        applyPrompt(item.prompt);
        return;
      }
      if (target.closest('#apimartPromptOptimize')) {
        optimizePrompt();
        return;
      }
      const removeReference = target.closest('[data-apimart-remove-reference]');
      if (removeReference) {
        event.preventDefault();
        event.stopPropagation();
        removeReferenceImageAt(removeReference.getAttribute('data-apimart-remove-reference'));
        return;
      }
      if (target.closest('#apimartReferenceUploadBtn') && !target.closest('[data-apimart-remove-reference]')) {
        refs.apimartMediaPanel?.querySelector('#apimartReferenceFile')?.click();
        return;
      }
      const addReference = target.closest('[data-apimart-add-reference]');
      if (addReference) {
        addReferenceImageUrl(addReference.getAttribute('data-apimart-add-reference'));
        return;
      }
      if (target.closest('#apimartPromptClear')) {
        applyPrompt('');
        return;
      }
      if (target.closest('#apimartStepperMinus') || target.closest('#apimartStepperPlus')) {
        const isPlus = Boolean(target.closest('#apimartStepperPlus'));
        const inputId = uiState.type === 'video' ? '#apimartDuration' : '#apimartCount';
        const input = refs.apimartMediaPanel?.querySelector(inputId);
        const min = Number(input?.getAttribute('min') || 1);
        const max = Number(input?.getAttribute('max') || 4);
        if (input) input.value = String(clampNumber(Number(input.value || min) + (isPlus ? 1 : -1), min, max, min));
        captureUiState();
        return;
      }
      const pageControl = target.closest('[data-apimart-result-page]');
      if (pageControl) {
        const total = getTaskMediaItems(tasks[0]).length;
        if (total) {
          const direction = pageControl.getAttribute('data-apimart-result-page');
          const current = clampNumber(uiState.resultPage, 0, total - 1, 0);
          uiState.resultPage = clampNumber(current + (direction === 'next' ? 1 : -1), 0, total - 1, current);
        }
        render();
        return;
      }
      if (target.closest('#apimartSubmitBtn')) {
        submitFromUi();
        return;
      }
      if (target.closest('#apimartConfigJumpBtn') || target.closest('[data-apimart-config]')) {
        App.navigation?.showPage?.('ai-config');
        return;
      }
      if (target.closest('#apimartClearBtn')) {
        uiState.resultPage = 0;
        uiState.resultCleared = true;
        render();
        return;
      }
      const copy = target.closest('[data-apimart-copy]');
      if (copy) {
        const copied = await utils.copyText(copy.getAttribute('data-apimart-copy') || '');
        App.notify?.[copied ? 'success' : 'warn']?.(copied ? '结果链接已复制' : '当前环境不支持复制', { key: 'apimart-copy' });
        return;
      }
      const deleteBtn = target.closest('[data-apimart-delete-task]');
      if (deleteBtn) {
        const taskId = deleteBtn.getAttribute('data-apimart-delete-task');
        if (taskId) {
          const confirmed = await App.confirmDialog?.confirmDelete?.({
            title: '删除生成记录',
            message: '确定要删除这条生成记录吗？该操作不可恢复。',
          });
          if (confirmed) deleteTask(taskId);
        }
        return;
      }
      const preview = target.closest('[data-apimart-preview-url]');
      if (preview) {
        openImagePreview(preview.getAttribute('data-apimart-preview-task'), preview.getAttribute('data-apimart-preview-url'));
        return;
      }
      const videoPreview = target.closest('[data-apimart-preview-video-url]');
      if (videoPreview) {
        openVideoPreview(videoPreview.getAttribute('data-apimart-preview-task'), videoPreview.getAttribute('data-apimart-preview-video-url'));
        return;
      }
      if (target.closest('[data-apimart-scroll-history]')) {
        const strip = refs.apimartMediaPanel?.querySelector('.apimart-history-strip');
        if (strip) {
          const firstItem = strip.querySelector('.apimart-history-item');
          const itemWidth = firstItem ? firstItem.offsetWidth + 14 : 220;
          strip.scrollBy({ left: itemWidth, behavior: 'smooth' });
        }
      }
    });
  };

  const mountNavEntry = () => {
    if (document.querySelector('[data-page="apimart-media"]')) return;
    const projectSkillsButton = document.querySelector('[data-page="project-skills"]');
    const container = projectSkillsButton?.parentElement;
    if (!container) return;
    const button = document.createElement('button');
    button.className = 'nav-subitem';
    button.type = 'button';
    button.dataset.page = PAGE_ID;
    button.textContent = 'AI绘图';
    button.addEventListener('click', () => App.navigation?.showPage?.(PAGE_ID));
    container.insertBefore(button, projectSkillsButton.nextSibling);
  };

  const init = () => {
    mountNavEntry();
    tasks = readTasks();
    render();
    bind();
    tasks.filter((task) => !['completed', 'failed', 'cancelled'].includes(task.status)).forEach((task) => {
      pollTask(task.id);
    });
  };

  App.apimartMedia = {
    init,
    render,
    submitGeneration,
    getTaskStatus,
    generateImage: (params) => submitAndTrackGeneration('image', params),
    generateVideo: (params) => submitAndTrackGeneration('video', params),
  };
})();
