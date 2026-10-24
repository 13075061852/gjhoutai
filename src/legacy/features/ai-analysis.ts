/**
 * AI 分析页面（服务端 pi 内核）。
 *
 * 页面只做三件事：发问题、订阅事件流、把增量渲染成结果。
 * 取数、模型调用、密钥都在服务端，页面不接触数据查询。
 */
import { getLegacyApp } from '../core/app-context';
import { aiAnalysis, type AiAttachment, type AiRunEvent, type AiUsage, type AiSpectrumGallery } from '../../services/ai-analysis';
import { renderAiMarkdown } from '../../utils/aiMarkdown';
import { formatAiResponseMetrics } from '../../utils/aiResponseMetrics';
import { parseAiProjectAction, renderAiProjectActions, type AiProjectAction } from '../../utils/aiProjectActions';
import { patchAiChildren, patchAiTurn } from '../../utils/aiStreamDom';
import { mountAiImagePreview } from '../../utils/aiImagePreview';
import '../../styles/pages/ai-analysis.css';
import '../../styles/pages/ai-business-actions.css';
import { parseSpectrumGallery, selectSpectrumGalleries, spectrumImagePrefixes, renderSpectrumGalleries } from '../../utils/aiSpectrumGallery';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  let sessionsKey = ''; // Bound to the authenticated account on init; never import unowned v1 history.
  const MAX_SESSIONS = 20;
  const PAINT_INTERVAL_MS = 110;

  // 示例问题只使用页面真实存在的字段与页面：物性表（型号/批次/灰份/拉伸强度）、
  // 图谱库（FTIR/TGA/DSC、编号/分类/日期）、检测报告（标题/分类/时间/文件）、
  // 办事记录中的灰份检测（名称/批号/坩埚灰份）。不要写入不存在的模块或字段。
  const SAMPLES = [
    { title: '查物性记录', detail: '物性分析 · 按型号查批次与检测指标', icon: 'ti-table-search', question: '最近 20 条物性记录，按日期列出型号、批次、灰份和拉伸强度。' },
    { title: '查材料图谱', detail: '图谱分析 · 按 FTIR、DSC、TGA 检索图谱', icon: 'ti-chart-line', question: '找一下最近的 DSC 图谱，列出编号、分类和日期，并把图片展示出来。' },
    { title: '查检测报告', detail: '检测报告 · 查看记录与原始文件', icon: 'ti-files', question: '最近有哪些检测报告？列出标题、分类、时间和可以打开的文件。' },
    { title: '查灰份记录', detail: '办事记录 · 按批号查看灰份检测明细', icon: 'ti-clipboard-list', question: '最近的灰份检测记录有哪些？列出名称、批号和各坩埚的灰份含量。' },
  ];

  type ToolStep = { id?: string; name: string; status: 'running' | 'done' | 'error' | 'stopped'; result?: string; args?: unknown };
  type TurnState = 'streaming' | 'done' | 'error' | 'stopped';
  type Turn = {
    role: 'user' | 'assistant';
    text: string;
    attachments?: AiAttachment[];
    retiredBusinessChange?: boolean;
    projectActions?: AiProjectAction[];
    spectrumGalleries?: AiSpectrumGallery[];
    /** 工具调用前的说明（模型偶尔会输出，单独降级展示，不混进正式回答）。 */
    plan?: string;
    tools: ToolStep[];
    state: TurnState;
    error?: string;
    notice?: string;
    usage?: AiUsage | null;
    startedAt?: number;
    firstTextAt?: number;
    finishedAt?: number;
  };
  type Session = { id: string; title: string; turns: Turn[]; updatedAt: number };

  let sessions: Session[] = [];
  let activeId = '';
  let deleteCandidateId = '';
  let running: { runId: string; controller: AbortController } | null = null;
  let lastPaint = 0;
  let paintTimer = 0;
  let bindings: AbortController | null = null;
  let unmountImagePreview: (() => void) | null = null;
  let refs: Record<string, any> = {};

  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const escapeHtml = (value: unknown) => App.utils?.escapeHtml?.(value) ?? String(value ?? '');
  const markdown = (value: string, galleries: AiSpectrumGallery[] = []) => renderAiMarkdown(value, { resolveUrl: aiAnalysis.resolveAssetUrl, managedSpectrumPrefixes: spectrumImagePrefixes(galleries) });
  const uid = () => (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const formatTime = (value: number) => {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatTokens = (usage?: AiUsage | null) => {
    const total = Number(usage?.totalTokens || 0);
    if (!total) return '';
    const parts = [`${total.toLocaleString('zh-CN')} tokens`];
    if (usage?.input) parts.push(`输入 ${usage.input}`);
    if (usage?.output) parts.push(`输出 ${usage.output}`);
    return parts.join(' · ');
  };

  const activeSession = () => sessions.find((item) => item.id === activeId) || null;

  const loadSessions = () => {
    try {
      if (!sessionsKey) return [];
      const raw = localStorage.getItem(sessionsKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item: any) => item && typeof item.id === 'string' && Array.isArray(item.turns))
        .slice(0, MAX_SESSIONS)
        .map((item: any) => ({
          id: item.id,
          title: String(item.title || '历史分析'),
          updatedAt: Number(item.updatedAt) || Date.now(),
          turns: item.turns
            .filter((turn: any) => turn && (turn.role === 'user' || turn.role === 'assistant'))
            .map((turn: any) => ({
              role: turn.role,
              text: String(turn.text || ''),
              plan: turn.plan ? String(turn.plan) : '',
              tools: Array.isArray(turn.tools) ? turn.tools.map((tool: ToolStep) => ({ ...tool, status: tool.status === 'running' ? 'stopped' : tool.status })) : [],
              state: turn.state === 'streaming' ? 'stopped' : (turn.state || 'done'),
              error: turn.error,
              usage: turn.usage ?? null,
              startedAt: Number(turn.startedAt) || undefined,
              firstTextAt: Number(turn.firstTextAt) || undefined,
              finishedAt: Number(turn.finishedAt) || undefined,
              projectActions: Array.isArray(turn.projectActions) ? turn.projectActions.map(parseAiProjectAction).filter(Boolean) : [],
              retiredBusinessChange: Boolean(turn.retiredBusinessChange || turn.proposals?.length),
              spectrumGalleries: Array.isArray(turn.spectrumGalleries) ? turn.spectrumGalleries.map(parseSpectrumGallery).filter(Boolean).slice(-10) : [],
            })),
        }));
    } catch {
      return [];
    }
  };

  const persistSessions = () => {
    if (!sessionsKey) return;
    try {
      const trimmed = [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_SESSIONS)
        .map((session) => ({ ...session, turns: session.turns.slice(-40) }));
      localStorage.setItem(sessionsKey, JSON.stringify(trimmed));
    } catch {
      /* 存储不可用时不影响本次分析 */
    }
  };

  const createSession = (): Session => ({ id: uid(), title: '新分析', turns: [], updatedAt: Date.now() });

  const refreshRefs = () => {
    refs = {
      shell: el('aiAnalysisShell'),
      sessions: el('aiAnalysisSessions'),
      newBtn: el('aiAnalysisNewBtn'),
      historyBtn: el('aiAnalysisHistoryBtn'),
      history: el('aiAnalysisHistory') as HTMLDialogElement | null,
      historyClose: el('aiAnalysisHistoryClose'),
      samples: el('aiAnalysisSamples'),
      thread: el('aiAnalysisThread'),
      empty: el('aiAnalysisEmpty'),
      form: el('aiAnalysisForm') as HTMLFormElement | null,
      input: el('aiAnalysisInput') as HTMLTextAreaElement | null,
      attachments: el('aiAnalysisAttachments'),
      attachBtn: el('aiAnalysisAttachBtn') as HTMLButtonElement | null,
      fileInput: el('aiAnalysisFileInput') as HTMLInputElement | null,
      sendBtn: el('aiAnalysisSendBtn') as HTMLButtonElement | null,
      stopBtn: el('aiAnalysisStopBtn') as HTMLButtonElement | null,
    };
  };

  const MAX_ATTACHMENTS = 4;
  const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
  type PendingAttachment = { file: File; preview: string };
  let pendingAttachments: PendingAttachment[] = [];
  let uploading = false;
  let attachmentError = '';

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / 104857.6) / 10} MB`;
  };

  const scrollThread = (force = false) => {
    const thread = refs.thread as HTMLElement | null;
    if (!thread || thread.hidden) return;
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160;
    if (force || nearBottom) thread.scrollTop = thread.scrollHeight;
  };

  const toolQuery = (tool: ToolStep) => {
    const args = tool.args && typeof tool.args === 'object' ? tool.args as Record<string, unknown> : null;
    if (!args) return '';
    const preferred = args.query ?? args.keyword ?? args.model ?? args.pattern ?? args.sheet ?? args.category ?? args.tag ?? args.name ?? args.id;
    const value = typeof preferred === 'string' && preferred.trim()
      ? preferred.trim()
      : String(Object.values(args).find((item) => typeof item === 'string' && item.trim()) || '').trim();
    return value.length > 56 ? `${value.slice(0, 55)}…` : value;
  };

  const SEARCH_TOOLS = new Set(['web_search', 'url_context']);

  const groupTools = (tools: ToolStep[]) => {
    const groups: { name: string; items: ToolStep[]; first: number }[] = [];
    tools.forEach((tool, index) => {
      const last = groups[groups.length - 1];
      if (last && last.name === tool.name && SEARCH_TOOLS.has(tool.name)) last.items.push(tool);
      else groups.push({ name: tool.name, items: [tool], first: index });
    });
    return groups;
  };

  const groupStatus = (items: ToolStep[]): ToolStep['status'] => {
    if (items.some((tool) => tool.status === 'running')) return 'running';
    if (items.some((tool) => tool.status === 'done')) return 'done';
    if (items.some((tool) => tool.status === 'error')) return 'error';
    return 'stopped';
  };

  const groupHint = (items: ToolStep[]) => {
    const queries = items.map(toolQuery).filter(Boolean).join('、');
    return queries.length > 56 ? `${queries.slice(0, 55)}…` : queries;
  };

  const toolIcon = (name: string) => {
    if (name === 'web_search') return 'ti-world-search';
    if (name === 'url_context') return 'ti-file-search';
    if (name.includes('spectrum')) return 'ti-chart-line';
    if (name.includes('report_ranges')) return 'ti-clipboard-list';
    if (name.includes('inspection')) return 'ti-files';
    if (name.includes('office') || name.includes('ash')) return 'ti-clipboard-list';
    if (name.startsWith('query_sheet')) return 'ti-table';
    if (name.startsWith('query_property')) return 'ti-table-search';
    return 'ti-database-edit';
  };

  const renderTools = (turn: Turn, turnIndex: number) => {
    if (!turn.tools.length) return { control: '', panel: '' };
    const executing = turn.state === 'streaming' && turn.tools.some((tool) => tool.status === 'running');
    const failures = turn.tools.filter((tool) => tool.status === 'error').length;
    const stopped = turn.tools.filter((tool) => tool.status === 'stopped').length;
    const names = new Set(turn.tools.map((tool) => tool.name));
    const sameTool = names.size === 1 && turn.tools.length > 1;
    const label = executing ? (sameTool ? `正在执行 ${turn.tools.length} 次${aiAnalysis.toolLabel(turn.tools[0].name)}` : `正在执行 ${turn.tools.length} 项工具调用`)
      : turn.state === 'stopped' ? `已停止 · ${turn.tools.length} 项工具调用`
      : failures || stopped ? `已执行 ${turn.tools.length} 项工具调用`
      : sameTool ? `已完成 ${turn.tools.length} 次${aiAnalysis.toolLabel(turn.tools[0].name)}`
      : `已完成 ${turn.tools.length} 项工具调用`;
    const indicator = executing ? '<span class="ai-execution-pulse" aria-hidden="true"></span>' : '';
    const control = `<button class="ai-analysis-tools-summary" type="button" data-tools-toggle aria-expanded="${executing}" aria-controls="ai-tools-${turnIndex}">${indicator}<span>${label}</span>${failures ? `<span class="ai-analysis-tools-failures">${failures} 项失败</span>` : ''}<i class="ti ti-chevron-right ai-analysis-tools-chevron" aria-hidden="true"></i></button>`;
    const panel = `<details class="ai-analysis-tools" id="ai-tools-${turnIndex}" data-disclosure="tools" data-executing="${executing}" ${executing ? 'open' : ''}>
      <summary hidden>${label}${failures ? ` · ${failures} 项失败` : ''}</summary>
      <div class="ai-analysis-tools-list">${groupTools(turn.tools).map((group) => {
      const status = groupStatus(group.items);
      const state = status === 'running' ? '进行中' : status === 'error' ? '失败' : status === 'stopped' ? '已停止' : '已完成';
      const stateClass = status === 'running' ? 'is-running' : status === 'error' ? 'is-error' : status === 'stopped' ? 'is-stopped' : 'is-done';
      const statusIcon = status === 'running' ? 'ai-tool-running' : status === 'error' ? 'ti ti-alert-triangle' : status === 'stopped' ? 'ti ti-player-stop-filled' : 'ti ti-check';
      const hint = group.items.length > 1 ? groupHint(group.items) : toolQuery(group.items[0]);
      const label = escapeHtml(aiAnalysis.toolLabel(group.name));
      const line = `<i class="ti ${toolIcon(group.name)} ai-tool-kind" aria-hidden="true"></i><span class="ai-analysis-tool-label">${label}</span><span class="ai-analysis-tool-hint">${escapeHtml(hint)}</span><span class="ai-analysis-tool-state" title="${state}"><span class="${statusIcon}" aria-hidden="true"></span><span class="ai-sr-only">${state}</span></span>`;
      const result = group.items.length === 1 ? group.items[0].result : undefined;
      if (!result) return `<div class="ai-analysis-tool ${stateClass}" data-ui-key="tool-${group.first}"><div class="ai-analysis-tool-line">${line}</div></div>`;
      return `<details class="ai-analysis-tool ${stateClass}" data-disclosure="tool-${group.first}"><summary class="ai-analysis-tool-line" aria-label="${label}，${state}，展开结果">${line}<i class="ti ti-chevron-right ai-analysis-tool-chevron" aria-hidden="true"></i></summary><pre>${escapeHtml(result)}</pre></details>`;
    }).join('')}${turn.plan ? `<details class="ai-analysis-plan" data-disclosure="plan"><summary>处理过程</summary><p>${escapeHtml(turn.plan)}</p></details>` : ''}</div></details>`;
    return { control, panel };
  };

  const renderUserAttachment = (attachment: AiAttachment) => {
    const url = escapeHtml(aiAnalysis.resolveAssetUrl(attachment.url || ''));
    const name = escapeHtml(attachment.name || '附件');
    if (attachment.kind === 'image' && url) {
      return `<a class="ai-analysis-message-image" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="打开图片：${name}"><img src="${url}" alt="${name}" loading="lazy" decoding="async"></a>`;
    }
    const icon = attachment.kind === 'text' ? 'ti-file-text' : 'ti-paperclip';
    return `<a class="ai-analysis-message-file" href="${url}" target="_blank" rel="noopener noreferrer" download><i class="ti ${icon}" aria-hidden="true"></i><span>${name}</span><span class="ai-analysis-message-file-size">${formatBytes(attachment.size || 0)}</span></a>`;
  };

  const renderTurn = (turn: Turn, index: number) => {
    if (turn.role === 'user') {
      return `<article class="ai-analysis-turn is-user" data-turn="${index}">
        <div class="ai-analysis-bubble">${turn.attachments?.length ? `<div class="ai-analysis-message-attachments">${turn.attachments.map(renderUserAttachment).join('')}</div>` : ''}<div class="ai-analysis-text">${escapeHtml(turn.text).replace(/\n/g, '<br>')}</div></div>
      </article>`;
    }
    const tools = renderTools(turn, index);
    const executing = turn.tools.some((tool) => tool.status === 'running');
    const stateText = turn.state === 'error' ? '未完成' : turn.state === 'stopped' ? '已停止'
      : turn.state === 'streaming' ? turn.notice || (executing ? '' : turn.text ? '正在生成' : turn.tools.length ? '正在整理回答' : '正在处理') : '';
    const state = stateText ? `<span class="ai-analysis-state" role="status">${turn.state === 'streaming' ? '<span class="ai-status-dot" aria-hidden="true"></span>' : ''}${escapeHtml(stateText)}</span>` : '';
    const question = activeSession()?.turns.slice(0, index).reverse().find(item => item.role === 'user')?.text || '';
    const galleries = selectSpectrumGalleries(turn.spectrumGalleries || [], question);
    const body = (turn.text ? markdown(turn.text, galleries) : '')
      + (turn.state === 'streaming' ? '' : renderSpectrumGalleries(galleries, aiAnalysis.resolveAssetUrl));
    const error = turn.error ? `<div class="ai-analysis-error"><i class="ti ti-alert-triangle" aria-hidden="true"></i><span>${escapeHtml(turn.error)}</span></div>` : '';
    const tokens = formatTokens(turn.usage);
    const metrics = formatAiResponseMetrics(turn, turn.state === 'done' ? turn.usage?.output : undefined);
    const stats = [tokens ? `${Number(turn.usage?.totalTokens || 0).toLocaleString('zh-CN')} tokens` : '', ...metrics].filter(Boolean).join(' · ');
    const statsTitle = [tokens, '耗时为发送至结束；速率为最后一轮回答首段文字至结束的平均输出速度（含传输），非模型纯推理速度。'].filter(Boolean).join(' · ');
    const usage = stats && turn.state !== 'streaming' ? `<span class="ai-analysis-usage" title="${escapeHtml(statsTitle)}">${escapeHtml(stats)}</span>` : '';
    const actions = turn.state !== 'streaming' && turn.text ? `<div class="ai-analysis-response-actions"><button class="ai-analysis-copy-answer" type="button" data-copy-answer="${index}" aria-label="复制回答"><i class="ti ti-copy" aria-hidden="true"></i><span>复制</span></button>${usage}</div>` : '';
    return `<article class="ai-analysis-turn is-assistant" data-turn="${index}" data-state="${turn.state}" aria-busy="${turn.state === 'streaming'}">
      <div class="ai-analysis-bubble">
        <div class="ai-analysis-head">
          ${state}
          ${tools.control}
        </div>
        ${tools.panel}
        <div class="ai-analysis-text">${body}</div>
        ${renderAiProjectActions(turn.projectActions || [], turn.state === 'streaming')}
        ${turn.retiredBusinessChange ? '<p class="ai-analysis-state">AI业务变更权限已关闭，请在业务页面人工操作。</p>' : ''}
        ${error}${actions}
      </div>
    </article>`;
  };

  const renderThread = () => {
    const thread = refs.thread as HTMLElement | null;
    if (!thread) return;
    const session = activeSession();
    const turns = session?.turns || [];
    const html = turns.map(renderTurn).join('');
    if (thread.dataset.renderedSession !== session?.id) {
      thread.innerHTML = html;
      thread.dataset.renderedSession = session?.id || '';
    } else {
      patchAiChildren(thread, html);
    }
    thread.querySelectorAll<HTMLElement>('[data-turn]').forEach((article) => {
      article.querySelector('[data-tools-toggle]')?.setAttribute('aria-expanded', String(Boolean(article.querySelector<HTMLDetailsElement>('.ai-analysis-tools')?.open)));
    });
    if (refs.empty) (refs.empty as HTMLElement).hidden = turns.length > 0;
    scrollThread(turns.length <= 1);
  };

  /** 流式期间只重绘最后一条助手气泡，避免整页重排。 */
  const paintStreaming = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPaint < PAINT_INTERVAL_MS) {
      if (!paintTimer) {
        paintTimer = window.setTimeout(() => {
          paintTimer = 0;
          paintStreaming(true);
        }, PAINT_INTERVAL_MS);
      }
      return;
    }
    lastPaint = now;
    const session = activeSession();
    const index = session ? session.turns.length - 1 : -1;
    const turn = session && index >= 0 ? session.turns[index] : null;
    if (!session || !turn) return;
    const node = refs.thread?.querySelector(`[data-turn="${index}"]`) as HTMLElement | null;
    if (!node) {
      renderThread();
      return;
    }
    const thread = refs.thread as HTMLElement;
    const following = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160;
    const disclosures = new Map([...node.querySelectorAll<HTMLDetailsElement>('details[data-disclosure]')].map((details) => [
      details.dataset.disclosure, { open: details.open, executing: details.dataset.executing },
    ]));
    const scrollPositions = [...node.querySelectorAll<HTMLElement>('.markdown-table-wrap, .ai-code-block pre')].map((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
    patchAiTurn(node, renderTurn(turn, index));
    thread.querySelectorAll<HTMLElement>(`[data-turn="${index}"] .markdown-table-wrap, [data-turn="${index}"] .ai-code-block pre`).forEach((element, position) => {
      element.scrollLeft = scrollPositions[position]?.left || 0;
      element.scrollTop = scrollPositions[position]?.top || 0;
    });
    thread.querySelectorAll<HTMLDetailsElement>(`[data-turn="${index}"] details[data-disclosure]`).forEach((details) => {
      const previous = disclosures.get(details.dataset.disclosure);
      if (!previous) return;
      // A new execution phase opens the group; completion always folds it once.
      // Between transitions, preserve the user's manual expand/collapse choice.
      if (details.dataset.disclosure === 'tools' && previous.executing !== details.dataset.executing) {
        details.open = details.dataset.executing === 'true';
        return;
      }
      details.open = previous.open;
    });
    const group = thread.querySelector<HTMLDetailsElement>(`[data-turn="${index}"] .ai-analysis-tools`);
    thread.querySelector(`[data-turn="${index}"] [data-tools-toggle]`)?.setAttribute('aria-expanded', String(Boolean(group?.open)));
    if (following) scrollThread(true);
  };

  const renderSessions = () => {
    const list = refs.sessions as HTMLElement | null;
    if (!list) return;
    const items = sessions.filter((session) => session.turns.length).sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = items.length
      ? items.map((session) => `<div class="ai-analysis-session-row${session.id === activeId ? ' is-active' : ''}">
          <button class="ai-analysis-session" type="button" data-session="${escapeHtml(session.id)}"${running ? ' disabled' : ''}${session.id === activeId ? ' aria-current="true"' : ''}>
            <span class="ai-analysis-session-title">${escapeHtml(session.title)}</span>
            <span class="ai-analysis-session-time">${formatTime(session.updatedAt)}</span>
          </button>
          <button class="ai-analysis-session-delete" type="button" data-delete-session="${escapeHtml(session.id)}" aria-label="删除分析：${escapeHtml(session.title)}" title="删除分析"${running ? ' disabled' : ''}><i class="ti ti-trash" aria-hidden="true"></i></button>
          ${deleteCandidateId === session.id ? `<div class="ai-analysis-delete-confirm" role="alert"><p>删除这条分析记录？<span>仅删除当前浏览器中的记录，无法恢复。</span></p><div><button type="button" data-cancel-session-delete>取消</button><button class="is-danger" type="button" data-confirm-session-delete="${escapeHtml(session.id)}">删除</button></div></div>` : ''}
        </div>`).join('')
      : '<div class="ai-analysis-session-empty">还没有分析记录。<br>发送问题后，会自动保存在这里。</div>';
  };

  const renderSamples = () => {
    const box = refs.samples as HTMLElement | null;
    if (!box || box.childElementCount) return;
    box.innerHTML = SAMPLES.map((sample) => `<button class="ai-analysis-sample" type="button" data-sample="${escapeHtml(sample.question)}" aria-label="${escapeHtml(sample.question)}">
      <span class="ai-analysis-sample-icon"><i class="ti ${sample.icon}" aria-hidden="true"></i></span>
      <span class="ai-analysis-sample-copy"><strong>${sample.title}</strong><span>${sample.detail}</span></span>
      <i class="ti ti-arrow-up-right" aria-hidden="true"></i>
    </button>`).join('');
  };

  const setComposerState = () => {
    const busy = Boolean(running);
    const hasDraft = Boolean(refs.input?.value.trim() || pendingAttachments.length);
    if (refs.sendBtn) (refs.sendBtn as HTMLButtonElement).disabled = busy || uploading || !hasDraft;
    refs.form?.setAttribute('aria-busy', String(busy || uploading));
    if (refs.stopBtn) (refs.stopBtn as HTMLButtonElement).hidden = !busy;
    if (refs.attachBtn) (refs.attachBtn as HTMLButtonElement).disabled = busy || uploading;
    if (refs.newBtn) (refs.newBtn as HTMLButtonElement).disabled = busy;
    refs.sessions?.querySelectorAll('button').forEach((button: HTMLButtonElement) => { button.disabled = busy; });
    if (refs.shell) refs.shell.classList.toggle('is-busy', busy);
    if (refs.shell) refs.shell.classList.toggle('is-uploading', uploading);
  };

  const resizeInput = () => {
    const input = refs.input as HTMLTextAreaElement | null;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(34, Math.min(128, input.scrollHeight))}px`;
    input.style.overflowY = input.scrollHeight > 128 ? 'auto' : 'hidden';
  };

  const ensureSession = () => {
    let session = activeSession();
    if (session) return session;
    session = sessions[0] || createSession();
    if (!sessions.includes(session)) sessions.unshift(session);
    activeId = session.id;
    return session;
  };

  const applyEvent = (session: Session, turn: Turn, event: AiRunEvent) => {
    switch (event.type) {
      case 'text':
        if (event.delta && !turn.firstTextAt) turn.firstTextAt = Date.now();
        turn.text += event.delta || '';
        paintStreaming();
        return true;
      case 'tool_start':
        turn.firstTextAt = undefined;
        // 工具调用前的说明单独归档，正式回答与取数过程分开呈现。
        if (!turn.tools.length && turn.text.trim()) {
          turn.plan = [turn.plan, turn.text.trim()].filter(Boolean).join('\n');
          turn.text = '';
        }
        turn.notice = '';
        turn.tools.push({ id: event.toolCallId, name: event.name, status: 'running', args: event.args ?? undefined });
        paintStreaming(true);
        return true;
      case 'tool_end': {
        const step = [...turn.tools].reverse().find((item) => item.status === 'running' && (event.toolCallId && item.id ? item.id === event.toolCallId : item.name === event.name));
        if (step) {
          step.status = event.isError ? 'error' : 'done';
          step.result = event.result;
        } else {
          turn.tools.push({ id: event.toolCallId, name: event.name, status: event.isError ? 'error' : 'done', result: event.result, args: undefined });
        }
        if (event.name === 'list_spectrum_records' && !event.isError) {
          const gallery = parseSpectrumGallery(event.spectrumGallery);
          if (gallery) {
            turn.spectrumGalleries = [...(turn.spectrumGalleries || []).filter(item => item.scopeKey !== gallery.scopeKey), gallery].slice(-10);
          }
        }
        if (event.name === 'prepare_project_lifecycle' && !event.isError) {
          const action = parseAiProjectAction(event.projectAction);
          if (action && action.threadId === session.id) turn.projectActions = [...(turn.projectActions || []).filter(item => item.id !== action.id), action];
        }
        if (event.name === 'prepare_business_change') turn.retiredBusinessChange = true;
        paintStreaming(true);
        return true;
      }
      case 'usage':
        turn.usage = event.usage;
        paintStreaming(true);
        return true;
      case 'status':
        turn.notice = event.status === 'retrying' ? `正在重试 · 第 ${event.attempt || 1} 次`
          : event.status === 'compacting' ? '正在整理上下文' : event.status === 'timeout' ? '任务超时，正在停止'
          : event.status === 'attachments' ? `已读取 ${event.files || 0} 个附件${event.images ? `（含 ${event.images} 张图片）` : ''}` : '';
        paintStreaming(true);
        return true;
      case 'done':
        turn.finishedAt = Date.now();
        turn.state = event.status === 'completed' ? 'done' : event.status === 'aborted' ? 'stopped' : 'error';
        if (event.status === 'failed') turn.error = event.error || '分析未完成，请重试。';
        else if (event.status === 'aborted') turn.error = '';
        else turn.error = '';
        turn.notice = '';
        if (event.usage) turn.usage = event.usage;
        turn.tools.forEach((item) => { if (item.status === 'running') item.status = 'stopped'; });
        session.updatedAt = Date.now();
        persistSessions();
        renderSessions();
        paintStreaming(true);
        return true;
      default:
        return false;
    }
  };

  const runAnalysis = async (question: string, attachments: AiAttachment[] = []) => {
    const session = ensureSession();
    const prompt = String(question || '').trim();
    if ((!prompt && !attachments.length) || running) return;

    const controller = new AbortController();
    const task = { runId: '', controller };
    running = task;
    session.turns.push({ role: 'user', text: prompt || '（仅附件）', attachments, tools: [], state: 'done' });
    const turn: Turn = { role: 'assistant', text: '', tools: [], state: 'streaming', usage: null, startedAt: Date.now() };
    session.turns.push(turn);
    if (session.turns.filter((item) => item.role === 'user').length === 1) session.title = (prompt || attachments[0]?.name || '附件分析').slice(0, 24);
    session.updatedAt = Date.now();
    renderThread();
    renderSessions();
    persistSessions();

    setComposerState();
    try {
      // Always collect the run ID, even if Stop was pressed while POST was pending,
      // so a just-created server run cannot be orphaned by cancelling its response.
      const run = await aiAnalysis.start(prompt || '请看附件内容。', { threadId: session.id, attachments });
      task.runId = run.id;
      if (controller.signal.aborted || running !== task) {
        void aiAnalysis.abort(run.id).catch(() => {});
        controller.signal.throwIfAborted();
        return;
      }
      await aiAnalysis.stream(run.id, (event) => {
        if (running === task) applyEvent(session, turn, event);
      }, { signal: controller.signal });
      if (turn.state === 'streaming') throw new Error('连接已中断，分析未完整结束，请重试。');
    } catch (error) {
      const aborted = controller.signal.aborted;
      turn.finishedAt = Date.now();
      turn.state = aborted ? 'stopped' : 'error';
      turn.error = aborted ? '' : (error instanceof Error ? error.message : '分析失败，请稍后重试。');
      turn.notice = '';
      turn.tools.forEach((tool) => { if (tool.status === 'running') tool.status = 'stopped'; });
      if (running === task) paintStreaming(true);
    } finally {
      if (running === task) {
        running = null;
        session.updatedAt = Date.now();
        persistSessions();
        renderSessions();
        setComposerState();
      }
    }
  };

  const stopAnalysis = () => {
    if (!running) return;
    if (running.runId) void aiAnalysis.abort(running.runId).catch(() => {});
    running.controller.abort();
  };

  const submit = async () => {
    const input = refs.input as HTMLTextAreaElement | null;
    if (!input || running || uploading) return;
    const value = input.value.trim();
    if (!value && !pendingAttachments.length) return;
    const files = [...pendingAttachments];
    input.value = '';
    resizeInput();
    if (!files.length) {
      void runAnalysis(value);
      return;
    }
    uploading = true;
    setComposerState();
    try {
      const uploaded = await uploadAttachments(files);
      pendingAttachments = [];
      renderAttachments();
      void runAnalysis(value, uploaded);
    } catch (error) {
      // Upload failed before a conversation was sent: keep both files and the question.
      // Do not overwrite text the user has typed while the upload was pending.
      if (!input.value) input.value = value;
      resizeInput();
      setAttachmentError(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      uploading = false;
      setComposerState();
    }
  };

  /** 逐个上传已选附件（失败则整体不上发，保留待重试）。 */
  const uploadAttachments = async (files: PendingAttachment[]): Promise<AiAttachment[]> => {
    const uploaded: AiAttachment[] = [];
    for (const file of files) {
      uploaded.push(await aiAnalysis.upload(file.file));
    }
    return uploaded;
  };

  const setAttachmentError = (message: string) => {
    attachmentError = message;
    renderAttachments();
  };

  const renderAttachments = () => {
    const strip = refs.attachments as HTMLElement | null;
    if (!strip) return;
    const chips = pendingAttachments.map((item, index) => {
      const preview = item.preview
        ? `<img src="${escapeHtml(item.preview)}" alt="${escapeHtml(item.file.name)}">`
        : `<i class="ti ${item.file.type.startsWith('image/') ? 'ti-photo' : 'ti-file-text'}" aria-hidden="true"></i>`;
      return `<span class="ai-analysis-attachment" data-attachment-index="${index}">${preview}<span class="ai-analysis-attachment-name">${escapeHtml(item.file.name)}</span><span class="ai-analysis-attachment-size">${formatBytes(item.file.size)}</span><button class="ai-analysis-attachment-remove" type="button" data-remove-attachment="${index}" aria-label="移除附件 ${escapeHtml(item.file.name)}"><i class="ti ti-x" aria-hidden="true"></i></button></span>`;
    }).join('');
    strip.innerHTML = `${chips}${attachmentError ? `<p class="ai-analysis-attachment-error" data-attachment-error>${escapeHtml(attachmentError)}</p>` : ''}`;
    strip.hidden = pendingAttachments.length === 0 && !attachmentError;
    setComposerState();
  };

  const addAttachments = (files: File[]) => {
    const room = MAX_ATTACHMENTS - pendingAttachments.length;
    if (room <= 0) {
      setAttachmentError(`一次最多 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    const candidates = files.slice(0, room);
    const accepted = candidates.filter((file) => file.size > 0 && file.size <= MAX_ATTACHMENT_BYTES);
    pendingAttachments.push(...accepted.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    })));
    attachmentError = files.length > room
      ? `一次最多 ${MAX_ATTACHMENTS} 个附件，已保留前 ${accepted.length} 个`
      : accepted.length < candidates.length ? `已跳过超过 ${formatBytes(MAX_ATTACHMENT_BYTES)} 的文件` : '';
    renderAttachments();
  };

  const removeAttachment = (index: number) => {
    const [removed] = pendingAttachments.splice(index, 1);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    attachmentError = '';
    renderAttachments();
  };

  const clearAttachments = () => {
    pendingAttachments.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
    pendingAttachments = [];
    attachmentError = '';
    renderAttachments();
  };

  const deleteSession = (id: string) => {
    if (running || id !== deleteCandidateId || !sessions.some((session) => session.id === id)) return;
    const wasActive = activeId === id;
    sessions = sessions.filter((session) => session.id !== id);
    deleteCandidateId = '';
    if (wasActive) {
      activeId = [...sessions].filter((session) => session.turns.length).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || '';
      ensureSession();
      if (paintTimer) window.clearTimeout(paintTimer);
      paintTimer = 0;
      if (refs.input) refs.input.value = '';
      resizeInput();
      renderThread();
    }
    persistSessions();
    renderSessions();
    setComposerState();
    (refs.sessions?.querySelector('[aria-current="true"]') || refs.historyClose)?.focus();
  };

  const closeHistory = () => {
    deleteCandidateId = '';
    const dialog = refs.history as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
    refs.historyBtn?.setAttribute('aria-expanded', 'false');
  };

  const bind = () => {
    bindings = new AbortController();
    const options = { signal: bindings.signal };
    if (refs.thread) unmountImagePreview = mountAiImagePreview(refs.thread);
    refs.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    }, options);
    refs.stopBtn?.addEventListener('click', stopAnalysis, options);
    refs.historyBtn?.addEventListener('click', () => {
      renderSessions();
      setComposerState();
      (refs.history as HTMLDialogElement | null)?.showModal();
      refs.historyBtn?.setAttribute('aria-expanded', 'true');
    }, options);
    refs.historyClose?.addEventListener('click', closeHistory, options);
    refs.history?.addEventListener('close', () => {
      deleteCandidateId = '';
      refs.historyBtn?.setAttribute('aria-expanded', 'false');
      refs.historyBtn?.focus();
    }, options);
    refs.history?.addEventListener('click', (event: MouseEvent) => {
      if (event.target === refs.history) closeHistory();
    }, options);
    refs.newBtn?.addEventListener('click', () => {
      if (running) return;
      const session = createSession();
      sessions = sessions.filter((item) => item.turns.length);
      sessions.unshift(session);
      activeId = session.id;
      persistSessions();
      renderSessions();
      renderThread();
      if (refs.input) refs.input.value = '';
      resizeInput();
      setComposerState();
      (refs.input as HTMLTextAreaElement | null)?.focus();
    }, options);
    refs.shell?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement)?.closest?.('[data-sample]') as HTMLElement | null;
      if (!button || running) return;
      draftPrompt(button.getAttribute('data-sample') || '');
    }, options);
    refs.sessions?.addEventListener('click', (event) => {
      if (running) return;
      const target = event.target as HTMLElement;
      const remove = target?.closest?.('[data-delete-session]') as HTMLButtonElement | null;
      if (remove) {
        deleteCandidateId = remove.getAttribute('data-delete-session') || '';
        renderSessions();
        refs.sessions?.querySelector('[data-cancel-session-delete]')?.focus();
        return;
      }
      if (target?.closest?.('[data-cancel-session-delete]')) {
        const id = deleteCandidateId;
        deleteCandidateId = '';
        renderSessions();
        [...(refs.sessions?.querySelectorAll('[data-delete-session]') || [])].find((button: HTMLElement) => button.getAttribute('data-delete-session') === id)?.focus();
        return;
      }
      const confirmed = target?.closest?.('[data-confirm-session-delete]') as HTMLButtonElement | null;
      if (confirmed) {
        deleteSession(confirmed.getAttribute('data-confirm-session-delete') || '');
        return;
      }
      const button = (event.target as HTMLElement)?.closest?.('[data-session]') as HTMLElement | null;
      if (!button || running) return;
      const session = sessions.find((item) => item.id === button.getAttribute('data-session'));
      if (!session) return;
      activeId = session.id;
      renderSessions();
      renderThread();
      closeHistory();
    }, options);
    refs.input?.addEventListener('input', () => { resizeInput(); setComposerState(); }, options);
    refs.attachBtn?.addEventListener('click', () => {
      if (running || uploading) return;
      refs.fileInput?.click();
    }, options);
    refs.fileInput?.addEventListener('change', () => {
      const input = refs.fileInput as HTMLInputElement;
      addAttachments([...input.files || []]);
      input.value = '';
    }, options);
    refs.attachments?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement)?.closest?.('[data-remove-attachment]') as HTMLElement | null;
      if (!button || running || uploading) return;
      removeAttachment(Number(button.getAttribute('data-remove-attachment')) || 0);
      setComposerState();
    }, options);
    const dropZone = refs.form as HTMLFormElement | null;
    const setDragging = (active: boolean) => dropZone?.classList.toggle('is-dragging', active);
    dropZone?.addEventListener('dragover', (event) => {
      if (running || uploading || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      setDragging(true);
    }, options);
    dropZone?.addEventListener('dragleave', () => setDragging(false), options);
    dropZone?.addEventListener('drop', (event) => {
      setDragging(false);
      if (running || uploading || !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      addAttachments([...event.dataTransfer.files]);
      setComposerState();
    }, options);
    refs.input?.addEventListener('paste', (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files || [])];
      if (running || uploading || !files.length) return;
      event.preventDefault();
      addAttachments(files);
      setComposerState();
    }, options);
    refs.input?.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      submit();
    }, options);
    refs.thread?.addEventListener('click', async (event) => {
      const actionButton = (event.target as HTMLElement)?.closest<HTMLButtonElement>('[data-project-action]');
      if (actionButton) {
        if (actionButton.disabled || running) return;
        const session = activeSession();
        const action = session?.turns.flatMap(turn => turn.projectActions || []).find(item => item.id === actionButton.dataset.projectActionId);
        if (!session || !action || action.threadId !== session.id || action.status !== 'pending' || action.submitting) return;
        action.submitting = true;
        action.error = '';
        renderThread();
        try { Object.assign(action, await aiAnalysis.submitProjectAction(action.id, session.id, actionButton.dataset.projectAction === 'cancel' ? 'cancel' : 'confirm')); }
        catch { action.error = '提交失败或确认已失效，请查询实际状态后重新准备。'; }
        finally { action.submitting = false; persistSessions(); if (activeId === session.id) renderThread(); }
        return;
      }
      const toggle = (event.target as HTMLElement)?.closest?.('[data-tools-toggle]') as HTMLButtonElement | null;
      if (toggle) {
        const panel = toggle.closest('[data-turn]')?.querySelector<HTMLDetailsElement>('.ai-analysis-tools');
        if (panel) {
          panel.open = !panel.open;
          toggle.setAttribute('aria-expanded', String(panel.open));
        }
        return;
      }
      const copy = (event.target as HTMLElement)?.closest?.('[data-copy-code], [data-copy-answer]') as HTMLButtonElement | null;
      if (copy) {
        const answer = copy.hasAttribute('data-copy-answer');
        const code = answer ? activeSession()?.turns[Number(copy.getAttribute('data-copy-answer'))]?.text || '' : copy.closest('.ai-code-block')?.querySelector('pre code')?.textContent || '';
        try {
          const copied = App.utils?.copyText ? await App.utils.copyText(code) : await navigator.clipboard.writeText(code).then(() => true);
          if (!copied) throw new Error('copy_failed');
          copy.textContent = '已复制';
          copy.setAttribute('aria-label', answer ? '回答已复制' : '代码已复制');
        } catch {
          copy.textContent = '复制失败';
          copy.setAttribute('aria-label', answer ? '复制失败，请手动选择回答' : '复制失败，请手动选择代码');
        }
        return;
      }
      const retry = (event.target as HTMLElement)?.closest?.('[data-retry]') as HTMLElement | null;
      if (retry) void runAnalysis(activeSession()?.turns.filter((item) => item.role === 'user').slice(-1)[0]?.text || '');
    }, options);
  };

  const init = () => {
    refreshRefs();
    const root = refs.shell as HTMLElement | null;
    if (!root || root.dataset.aiBound === '1') return;
    root.dataset.aiBound = '1';

    const userId = String(App.currentUser?.id || '');
    sessionsKey = userId ? `gjh-ai-analysis-sessions-v2:${encodeURIComponent(userId)}` : '';
    sessions = loadSessions();
    activeId = sessions[0]?.id || '';
    deleteCandidateId = '';
    ensureSession();
    running = null;

    renderSamples();
    renderSessions();
    renderThread();
    setComposerState();
    resizeInput();
    bind();
  };

  const cleanup = () => {
    unmountImagePreview?.();
    unmountImagePreview = null;
    closeHistory();
    stopAnalysis();
    const session = activeSession();
    session?.turns.forEach((turn) => {
      if (turn.state === 'streaming') turn.state = 'stopped';
      turn.tools.forEach((tool) => { if (tool.status === 'running') tool.status = 'stopped'; });
    });
    persistSessions();
    clearAttachments();
    running = null;
    bindings?.abort();
    bindings = null;
    if (paintTimer) window.clearTimeout(paintTimer);
    paintTimer = 0;
    sessions = [];
    activeId = '';
    sessionsKey = '';
    if (refs.shell) delete refs.shell.dataset.aiBound;
  };

  const draftPrompt = (question: string) => {
    if (refs.input) {
      refs.input.value = question;
      resizeInput();
      setComposerState();
      refs.input.focus();
    }
  };

  App.aiAnalysis = { init, cleanup, run: runAnalysis, stop: stopAnalysis, draftPrompt, attach: addAttachments };
})();
