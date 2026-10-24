// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableMainFrameNavigation":true,"disableChildPageNavigation":true}}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyMarkup } from '../legacyMarkup';

const api = vi.hoisted(() => ({ start: vi.fn(), stream: vi.fn(), abort: vi.fn(), health: vi.fn(), upload: vi.fn(), submitProjectAction: vi.fn(), resolveAssetUrl: (url: string) => url, toolLabel: (name: string) => name === 'web_search' ? '联网搜索' : '读取数据概况' }));
vi.mock('../../services/ai-analysis', () => ({ aiAnalysis: api }));
const businessActions = vi.hoisted(() => ({ submit: vi.fn(), refresh: vi.fn() }));
vi.mock('../../services/business-actions', () => ({ submitBusinessAction: businessActions.submit }));
vi.mock('../../utils/refreshBusinessData', () => ({ refreshBusinessData: businessActions.refresh }));
vi.mock('../../utils/aiImageFiles', () => ({
  fetchAiImageFile: async () => new File(['png'], '图谱.png', { type: 'image/png' }),
  downloadAiImageFile: vi.fn(),
  shareAiImageFile: async () => 'unsupported',
}));
let app: any;
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const element = (id: string) => document.getElementById(id)!;
const done = { type: 'done', status: 'completed', seq: 3, at: 1 };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = legacyMarkup;
  app = { currentUser: { id: 'test-user', department: '系统管理员' }, utils: { escapeHtml: (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), markdownLite: (value: string) => `<p>${value}</p>` } };
  window.GJHApp = app;
  api.start.mockResolvedValue({ id: 'run1' });
  api.abort.mockResolvedValue(true);
  api.upload.mockImplementation(async (file: File) => ({ id: `up-${file.name}`, name: file.name, type: file.type, size: file.size, kind: file.type.startsWith('image/') ? 'image' : 'binary', url: `/gjhoutai/api/ai/uploads/up-${file.name}` }));
  api.health.mockResolvedValue({ model: { ready: true, modelId: 'server-model' } });
  businessActions.refresh.mockResolvedValue(undefined);
  api.stream.mockImplementation(async (_id, onEvent) => {
    onEvent({ type: 'tool_start', name: 'web_search', seq: 1, at: 1 });
    onEvent({ type: 'tool_end', name: 'web_search', isError: false, result: '官方来源', seq: 2, at: 1 });
    onEvent({ type: 'text', delta: '服务端回答', seq: 3, at: 1 });
    onEvent(done);
  });
  await import('./ai-analysis');
  app.aiAnalysis.init();
});
afterEach(() => { app.aiAnalysis.cleanup(); document.body.innerHTML = ''; });

describe('single rewritten AI workspace', () => {
  it('isolates browser history on account switches and does not import unowned old history', async () => {
    localStorage.setItem('gjh-ai-analysis-sessions-v1', JSON.stringify([{ id:'unowned',title:'旧账户私密',turns:[],updatedAt:1 }]));
    await app.aiAnalysis.run('账户A私密问题');
    app.aiAnalysis.cleanup();
    app.currentUser = { id:'other-user',department:'测试部' };
    app.aiAnalysis.init();
    expect(document.getElementById('aiAnalysisThread')?.textContent).not.toContain('账户A私密问题');
    expect(document.getElementById('aiAnalysisHistory')?.textContent).not.toContain('旧账户私密');
    await app.aiAnalysis.run('账户B问题');
    expect(localStorage.getItem('gjh-ai-analysis-sessions-v2:test-user')).toContain('账户A私密问题');
    expect(localStorage.getItem('gjh-ai-analysis-sessions-v2:other-user')).not.toContain('账户A私密问题');
  });
  it('keeps empty sends inactive and enables text, suggestions and attachments', () => {
    const send = element('aiAnalysisSendBtn') as HTMLButtonElement;
    const input = element('aiAnalysisInput') as HTMLTextAreaElement;
    expect(send.disabled).toBe(true);
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    expect(send.disabled).toBe(true);
    app.aiAnalysis.draftPrompt('查一下图谱');
    expect(send.disabled).toBe(false);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(send.disabled).toBe(true);
    app.aiAnalysis.attach([new File(['test'], 'data.csv', { type: 'text/csv' })]);
    expect(send.disabled).toBe(false);
    (document.querySelector('[data-remove-attachment]') as HTMLButtonElement).click();
    expect(send.disabled).toBe(true);
    expect(element('aiAnalysisAttachBtn').querySelector('.ti-plus-plain')).not.toBeNull();
    expect(send.querySelector('.ti-arrow-up')).not.toBeNull();
    expect(document.querySelectorAll('.ai-analysis-capability')).toHaveLength(2);
  });
  it('上传附件后随提问发送，并在双方气泡里展示图片与文件', async () => {
    const image = new File([new Uint8Array([1, 2, 3])], '图谱.png', { type: 'image/png' });
    const sheet = new File([new Uint8Array([4, 5])], '测试数据.xlsx', { type: '' });
    app.aiAnalysis.attach([image, sheet]);
    expect(document.querySelectorAll('.ai-analysis-attachment')).toHaveLength(2);
    expect(element('aiAnalysisSendBtn').disabled).toBe(false);
    (element('aiAnalysisInput') as HTMLTextAreaElement).value = '看看这两个文件';
    (element('aiAnalysisForm') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.start).toHaveBeenCalledWith('看看这两个文件', expect.objectContaining({
      attachments: [expect.objectContaining({ id: 'up-图谱.png' }), expect.objectContaining({ id: 'up-测试数据.xlsx' })],
    }));
    expect(document.querySelector('.ai-analysis-message-image img')?.getAttribute('src')).toBe('/gjhoutai/api/ai/uploads/up-图谱.png');
    expect(document.querySelector('.ai-analysis-message-file')?.textContent).toContain('测试数据.xlsx');
    expect(element('aiAnalysisAttachments').hidden).toBe(true);
    expect(api.resolveAssetUrl).toBeTypeOf('function');
  });

  it('图谱由结构化结果确保三类各一张，模型漏DSC或重复FTIR也不影响，并保存到历史', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_end', name: 'list_spectrum_records', isError: false, result: '{截断的工具文本', spectrumGallery: {
        mode: 'one_per_type', scopeKey: '4830bkf', query: { keyword: '4830bkf', category: '', tag: '' },
        requestedTypes: ['DSC', 'TGA', 'FTIR'], missingTypes: [],
        entries: ['DSC', 'TGA', 'FTIR'].map(type => ({ id: type.toLowerCase(), title: `4830BKF ${type}`, date: '2026-10-20', registeredType: type, typeVerified: false, imageUrl: `/gjhoutai/api/blob/spectrum/${type.toLowerCase()}` })),
      } });
      emit({ type: 'text', delta: '找到三类图谱。\n\n![TGA](/gjhoutai/api/blob/spectrum/tga)\n\n![FTIR](/gjhoutai/api/blob/spectrum/ftir)\n\n![灰份FTIR](/gjhoutai/api/blob/spectrum/ftir-ash)' });
      emit(done);
    });
    await app.aiAnalysis.run('查一下长春4830bkf的图谱');
    const images = () => [...document.querySelectorAll('.is-assistant .ai-analysis-text img')];
    expect(images().map(image => image.getAttribute('src'))).toEqual(['/gjhoutai/api/blob/spectrum/dsc', '/gjhoutai/api/blob/spectrum/tga', '/gjhoutai/api/blob/spectrum/ftir']);
    expect(document.querySelector('.ai-spectrum-gallery')?.textContent).toContain('4830BKF DSC');
    expect(document.querySelector('img[src$="ftir-ash"]')).toBeNull();
    app.aiAnalysis.cleanup(); app.aiAnalysis.init();
    expect(images()).toHaveLength(3);
  });

  it('没有正文图片时也直接展示工具返回的完整类型图谱', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_end', name: 'list_spectrum_records', isError: false, spectrumGallery: {
        mode: 'one_per_type', scopeKey: 'model', query: { keyword: '型号', category: '', tag: '' }, requestedTypes: ['DSC', 'TGA', 'FTIR'], missingTypes: [],
        entries: ['DSC', 'TGA', 'FTIR'].map(type => ({ id: type.toLowerCase(), title: type, date: '', registeredType: type, typeVerified: false, imageUrl: `/gjhoutai/api/blob/spectrum/${type.toLowerCase()}` })),
      } });
      emit({ type: 'text', delta: '仅输出文字，未插入图片链接。' }); emit(done);
    });
    await app.aiAnalysis.run('查型号图谱');
    expect(document.querySelectorAll('.ai-spectrum-gallery img')).toHaveLength(3);
  });

  it('旧业务写入卡片不再提供提交入口', async () => {
    let proposal: any;
    api.stream.mockImplementation(async (_id, emit) => {
      const threadId = api.start.mock.calls.at(-1)![1].threadId;
      proposal = { id: 'proposal1', threadId, dataset: 'ash_records', operation: 'create', label: '灰份记录', count: 1, pageId: 'office-records', expiresAt: new Date(Date.now()+600_000).toISOString(), status: 'pending', changes: [{ id: 'ASH-1', before: null, after: { name: '测试材料', rows: [{ content: '25%' }] } }] };
      emit({ type: 'tool_end', name: 'prepare_business_change', isError: false, proposal, seq: 1, at: 1 });
      emit({ type: 'text', delta: '已准备好。\n\n| 名称 | 灰份含量 |\n| --- | --- |\n| 测试材料 | 25% |', seq: 2, at: 1 });
      emit(done);
    });
    await app.aiAnalysis.run('帮我录入灰份');
    expect(businessActions.submit).not.toHaveBeenCalled();
    expect(document.querySelector('[data-business-action]')).toBeNull();
    expect(element('aiAnalysisThread').textContent).toContain('AI业务变更权限已关闭');
    expect(businessActions.refresh).not.toHaveBeenCalled();
  });

  it('项目启停必须点击独立确认按钮，失败不伪装成功', async () => {
    let action: any;
    api.stream.mockImplementation(async (_id, emit) => {
      action = { id: '12345678-1234-1234-1234-123456789abc', threadId: api.start.mock.calls.at(-1)![1].threadId, project: 'guangjun', operation: 'stop', expiresAt: new Date(Date.now()+300_000).toISOString(), status: 'pending' };
      emit({ type: 'tool_end', name: 'prepare_project_lifecycle', isError: false, projectAction: action, seq: 1, at: 1 }); emit(done);
    });
    await app.aiAnalysis.run('关闭官网');
    expect(api.submitProjectAction).not.toHaveBeenCalled();
    expect(document.querySelector('.ai-business-change')?.textContent).toContain('待确认，尚未执行');
    api.submitProjectAction.mockRejectedValueOnce(new Error('expired'));
    (document.querySelector('[data-project-action="confirm"]') as HTMLButtonElement).click();
    await flush();
    expect(api.submitProjectAction).toHaveBeenCalledWith(action.id, action.threadId, 'confirm');
    expect(document.querySelector('.ai-business-change')?.textContent).toContain('提交失败');
    expect(document.querySelector('.ai-business-change')?.textContent).not.toContain('服务操作已完成');
    api.submitProjectAction.mockResolvedValue({ ...action, name: '广俊官网及管理后台', path: '/web/', status: 'cancelled' });
    (document.querySelector('[data-project-action="cancel"]') as HTMLButtonElement).click();
    await flush();
    expect(document.querySelector('.ai-business-change')?.textContent).toContain('已取消');
  });

  it('只发附件也能提问，并阻止重复选择与超限', async () => {
    app.aiAnalysis.attach([new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })]);
    expect(element('aiAnalysisSendBtn').disabled).toBe(false);
    (element('aiAnalysisForm') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();
    expect(api.start).toHaveBeenCalledWith('请看附件内容。', expect.objectContaining({ attachments: [expect.objectContaining({ id: 'up-a.png' })] }));
    const many = Array.from({ length: 6 }, (_, index) => new File([new Uint8Array([index + 1])], `f${index}.png`, { type: 'image/png' }));
    app.aiAnalysis.attach(many);
    expect(document.querySelectorAll('.ai-analysis-attachment')).toHaveLength(4);
    expect(document.querySelector('.ai-analysis-attachment-error')?.textContent).toContain('最多 4 个');
  });

  it('上传失败时保留附件并报错，不发起分析', async () => {
    api.upload.mockRejectedValueOnce(new Error('单个附件不能超过 8 MB'));
    app.aiAnalysis.attach([new File([new Uint8Array([1, 2])], 'big.png', { type: 'image/png' })]);
    (element('aiAnalysisInput') as HTMLTextAreaElement).value = '带附件的问题';
    (element('aiAnalysisForm') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();
    expect(api.start).not.toHaveBeenCalled();
    expect(document.querySelector('.ai-analysis-attachment-error')?.textContent).toContain('8 MB');
    expect(document.querySelectorAll('.ai-analysis-attachment')).toHaveLength(1);
    expect((element('aiAnalysisInput') as HTMLTextAreaElement).value).toBe('带附件的问题');
  });

  it('上传失败不会覆盖用户在等待期间输入的新草稿', async () => {
    let reject!: (error: Error) => void;
    api.upload.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const input = element('aiAnalysisInput') as HTMLTextAreaElement;
    app.aiAnalysis.attach([new File(['image'], 'a.png', { type: 'image/png' })]);
    input.value = '原问题';
    element('aiAnalysisForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    input.value = '新草稿';
    reject(new Error('连接失败'));
    await flush();
    expect(input.value).toBe('新草稿');
    expect(api.start).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.ai-analysis-attachment')).toHaveLength(1);
  });

  it('回答里的图片和文件卡片会渲染成可点开的预览与链接', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'text', delta: '![320G6-B1S FTIR](/gjhoutai/api/blob/spectrum/upload-1)\n\n[报告.pdf](/gjhoutai/api/inspection-reports/abc/file)', seq: 1, at: 1 });
      emit(done);
    });
    await app.aiAnalysis.run('展示谱图');
    expect(document.querySelector('.ai-analysis-text a.ai-image-link img')?.getAttribute('src')).toBe('/gjhoutai/api/blob/spectrum/upload-1');
    expect(document.querySelector('.ai-analysis-text a.ai-file-link')?.getAttribute('href')).toBe('/gjhoutai/api/inspection-reports/abc/file');
    (document.querySelector('.ai-analysis-text a.ai-image-link img') as HTMLElement).click();
    const preview = document.querySelector<HTMLDialogElement>('.ai-image-preview')!;
    expect(preview.open).toBe(true);
    expect(preview.querySelector('img')!.getAttribute('src')).toContain('/gjhoutai/api/blob/spectrum/upload-1');
    (preview.querySelector('[data-preview-in]') as HTMLButtonElement).click();
    expect(preview.querySelector('output')!.value).toBe('125%');
    (preview.querySelector('[data-preview-close]') as HTMLButtonElement).click();
    expect(document.querySelector('.ai-image-preview')).toBeNull();
  });

  it('runs through the pi client and renders text and search tools without old UI', async () => {
    await app.aiAnalysis.run('查询官方资料');
    expect(api.start).toHaveBeenCalledWith('查询官方资料', expect.objectContaining({ threadId: expect.any(String) }));
    expect(document.querySelector('.ai-analysis-text')?.textContent).toBe('查询官方资料');
    expect(element('aiAnalysisThread').textContent).toContain('服务端回答');
    expect(element('aiAnalysisThread').textContent).toContain('联网搜索');
    expect(document.querySelector('.assistant, #askAiToggle, #chatInput')).toBeNull();
    expect(document.querySelectorAll('[data-page="ai-analysis"]')).toHaveLength(1);
  });

  it('reserves busy state before the start request resolves and prevents duplicate runs or session changes', async () => {
    let resolve!: (value: unknown) => void;
    api.start.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const pending = app.aiAnalysis.run('第一个问题');
    const status = document.querySelector('.ai-analysis-state')!;
    expect(status.textContent).toContain('正在处理');
    expect(status.previousElementSibling).toBeNull();
    expect(status.parentElement?.querySelector('.ai-analysis-avatar')).toBeNull();
    expect(status.parentElement?.querySelector('.ai-analysis-label')).toBeNull();
    expect(document.querySelectorAll('.ai-analysis-state')).toHaveLength(1);
    await app.aiAnalysis.run('重复问题');
    expect(api.start).toHaveBeenCalledOnce();
    expect((element('aiAnalysisSendBtn') as HTMLButtonElement).disabled).toBe(true);
    expect((element('aiAnalysisNewBtn') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('[data-session]') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('[data-delete-session]') as HTMLButtonElement).disabled).toBe(true);
    (document.querySelector('[data-delete-session]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-confirm-session-delete]')).toBeNull();
    resolve({ id: 'run1' });
    await pending;
    expect((element('aiAnalysisSendBtn') as HTMLButtonElement).disabled).toBe(true);
    expect(element('aiAnalysisForm').getAttribute('aria-busy')).toBe('false');
  });

  it('stops a run created after Stop is pressed while POST is pending', async () => {
    let resolve!: (value: unknown) => void;
    api.start.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const pending = app.aiAnalysis.run('问题');
    app.aiAnalysis.stop();
    resolve({ id: 'late-run' });
    await pending;
    expect(api.abort).toHaveBeenCalledWith('late-run');
    expect(api.stream).not.toHaveBeenCalled();
    expect(document.querySelector('[data-state="stopped"]')).not.toBeNull();
  });

  it('reports EOF without done as an interruption, not success', async () => {
    api.stream.mockResolvedValue(undefined);
    await app.aiAnalysis.run('问题');
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    expect(element('aiAnalysisThread').textContent).toContain('连接已中断');
  });

  it('supports clean teardown and reinitialization without duplicate handlers', async () => {
    app.aiAnalysis.cleanup();
    app.aiAnalysis.init();
    app.aiAnalysis.init();
    (element('aiAnalysisInput') as HTMLTextAreaElement).value = '仅提交一次';
    element('aiAnalysisForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(api.start).toHaveBeenCalledOnce();
  });

  it('keeps Enter available to Chinese composition instead of sending early', async () => {
    app.aiAnalysis.draftPrompt('输入中的中文');
    element('aiAnalysisInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    await flush();
    expect(api.start).not.toHaveBeenCalled();
    expect((element('aiAnalysisInput') as HTMLTextAreaElement).value).toBe('输入中的中文');
  });

  it('offers four starter questions that only use real page fields and fill the composer without a paid request', () => {
    const samples = document.querySelectorAll<HTMLButtonElement>('.ai-analysis-sample');
    expect(samples).toHaveLength(4);
    expect(samples[0].textContent).toContain('查物性记录');
    expect(samples[1].textContent).toContain('查材料图谱');
    expect(samples[2].textContent).toContain('查检测报告');
    expect(samples[3].textContent).toContain('查灰份记录');
    const questions = [...samples].map((sample) => sample.dataset.sample ?? '');
    expect(questions.join(' ')).not.toMatch(/色板|打版记录|同批次/);
    samples[0].click();
    expect((element('aiAnalysisInput') as HTMLTextAreaElement).value).toContain('物性记录');
    expect(api.start).not.toHaveBeenCalled();
    element('aiAnalysisNewBtn').click();
    expect((element('aiAnalysisInput') as HTMLTextAreaElement).value).toBe('');
  });

  it('opens a focused history dialog and restores a saved conversation on every device', async () => {
    await app.aiAnalysis.run('历史问题');
    element('aiAnalysisNewBtn').click();
    element('aiAnalysisHistoryBtn').click();
    const dialog = element('aiAnalysisHistory') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(element('aiAnalysisHistoryBtn').getAttribute('aria-expanded')).toBe('true');
    (dialog.querySelector('[data-session]') as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(element('aiAnalysisHistoryBtn').getAttribute('aria-expanded')).toBe('false');
    expect(element('aiAnalysisThread').textContent).toContain('历史问题');
    expect(element('aiAnalysisThread').textContent).toContain('服务端回答');
  });

  it('folds finished tool calls into one summary instead of leaving a row for every tool', async () => {
    await app.aiAnalysis.run('问题');
    const group = document.querySelector('.ai-analysis-tools') as HTMLDetailsElement;
    expect(group.open).toBe(false);
    expect(group.querySelector('summary')?.textContent).toContain('已完成 1 项工具调用');
    expect(group.querySelectorAll('.ai-analysis-tool')).toHaveLength(1);
    const toggle = document.querySelector('.ai-analysis-head [data-tools-toggle]') as HTMLButtonElement;
    expect(toggle.closest('.ai-analysis-head')?.querySelector('.ai-analysis-label')).toBeNull();
    expect(toggle.closest('.ai-analysis-head')?.querySelector('.ai-analysis-avatar')).toBeNull();
    expect(toggle.closest('.ai-analysis-head')?.querySelector('.ti-sparkles')).toBeNull();
    expect(toggle.getAttribute('aria-controls')).toBe(group.id);
    expect(toggle.querySelector('.ti-history')).toBeNull();
    expect(toggle.querySelector('.ai-analysis-tools-chevron')).not.toBeNull();
    toggle.click();
    expect(group.open).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(group.querySelector('.ai-analysis-tool')?.textContent).toContain('联网搜索');
    toggle.click();
    expect(group.open).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens while tools execute, folds after completion, and preserves manual expansion during the answer', async () => {
    let release!: () => void;
    let emit!: (event: any) => void;
    api.stream.mockImplementation(async (_id, onEvent) => {
      emit = onEvent;
      await new Promise<void>((resolve) => { release = resolve; });
      onEvent(done);
    });
    const pending = app.aiAnalysis.run('问题');
    await flush();
    const group = () => document.querySelector('.ai-analysis-tools') as HTMLDetailsElement;
    emit({ type: 'tool_start', name: 'web_search' });
    expect(group().open).toBe(true);
    emit({ type: 'tool_end', name: 'web_search', isError: false, result: '原始证据' });
    expect(group().open).toBe(false);
    group().open = true;
    emit({ type: 'usage', usage: { totalTokens: 100 } });
    expect(group().open).toBe(true);
    emit({ type: 'tool_start', name: 'data_overview' });
    expect(group().open).toBe(true);
    emit({ type: 'tool_end', name: 'data_overview', isError: true, result: '工具失败' });
    expect(group().open).toBe(false);
    expect(group().querySelector('summary')?.textContent).toContain('1 项失败');
    release();
    await pending;
  });

  it('keeps expanded evidence open during streamed paints', async () => {
    let release!: () => void;
    let emit!: (event: any) => void;
    api.stream.mockImplementation(async (_id, onEvent) => {
      emit = onEvent;
      onEvent({ type: 'tool_end', name: 'web_search', isError: false, result: '原始证据' });
      await new Promise<void>((resolve) => { release = resolve; });
      onEvent(done);
    });
    const pending = app.aiAnalysis.run('问题');
    await flush();
    (document.querySelector('[data-disclosure="tool-0"]') as HTMLDetailsElement).open = true;
    emit({ type: 'usage', usage: { totalTokens: 100 } });
    expect((document.querySelector('[data-disclosure="tool-0"]') as HTMLDetailsElement).open).toBe(true);
    release();
    await pending;
  });

  it('requires confirmation and can cancel a history deletion without changing stored records', async () => {
    await app.aiAnalysis.run('保留这条记录');
    element('aiAnalysisHistoryBtn').click();
    (document.querySelector('[data-delete-session]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-confirm-session-delete]')).not.toBeNull();
    expect(document.querySelectorAll('[data-session]')).toHaveLength(1);
    (document.querySelector('[data-cancel-session-delete]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-confirm-session-delete]')).toBeNull();
    expect(document.querySelectorAll('[data-session]')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('gjh-ai-analysis-sessions-v2:test-user')!)).toHaveLength(1);
  });

  it('deletes an inactive record without switching the current conversation', async () => {
    await app.aiAnalysis.run('旧记录');
    element('aiAnalysisNewBtn').click();
    await app.aiAnalysis.run('当前记录');
    element('aiAnalysisHistoryBtn').click();
    const old = [...document.querySelectorAll<HTMLButtonElement>('[data-session]')].find((button) => button.textContent?.includes('旧记录'))!;
    (old.closest('.ai-analysis-session-row')!.querySelector('[data-delete-session]') as HTMLButtonElement).click();
    (document.querySelector('[data-confirm-session-delete]') as HTMLButtonElement).click();
    expect(element('aiAnalysisThread').textContent).toContain('当前记录');
    expect(document.querySelectorAll('[data-session]')).toHaveLength(1);
    const saved = JSON.parse(localStorage.getItem('gjh-ai-analysis-sessions-v2:test-user')!);
    expect(saved.map((session: any) => session.title)).toEqual(['当前记录']);
    app.aiAnalysis.cleanup();
    app.aiAnalysis.init();
    expect(document.querySelectorAll('[data-session]')).toHaveLength(1);
    expect(element('aiAnalysisSessions').textContent).not.toContain('旧记录');
  });

  it('switches after deleting the active record and returns to an empty analysis after deleting the last', async () => {
    await app.aiAnalysis.run('第一条');
    element('aiAnalysisNewBtn').click();
    await app.aiAnalysis.run('第二条');
    element('aiAnalysisHistoryBtn').click();
    const removeActive = () => {
      (document.querySelector('.ai-analysis-session-row.is-active [data-delete-session]') as HTMLButtonElement).click();
      (document.querySelector('[data-confirm-session-delete]') as HTMLButtonElement).click();
    };
    removeActive();
    expect(element('aiAnalysisThread').textContent).toContain('第一条');
    expect(element('aiAnalysisThread').textContent).not.toContain('第二条');
    removeActive();
    expect(document.querySelectorAll('[data-session]')).toHaveLength(0);
    expect(element('aiAnalysisThread').childElementCount).toBe(0);
    expect(element('aiAnalysisEmpty').hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem('gjh-ai-analysis-sessions-v2:test-user')!).every((session: any) => session.turns.length === 0)).toBe(true);
  });

  it('shows one execution phase, no duplicate loading prose, and patches streamed paragraphs in place', async () => {
    let release!: () => void;
    let emit!: (event: any) => void;
    api.stream.mockImplementation(async (_id, onEvent) => {
      emit = onEvent;
      await new Promise<void>((resolve) => { release = resolve; });
      onEvent(done);
    });
    const pending = app.aiAnalysis.run('查询');
    await flush();
    emit({ type: 'tool_start', name: 'web_search', toolCallId: 'search1' });
    const thread = element('aiAnalysisThread');
    expect(thread.textContent).not.toContain('正在读取平台数据');
    expect(thread.textContent).not.toContain('正在执行，请稍候');
    expect(thread.querySelector('.ai-analysis-text')?.childElementCount).toBe(0);
    expect(thread.querySelector('.ai-analysis-state')).toBeNull();
    expect(thread.querySelectorAll('.ai-analysis-tool-label')).toHaveLength(1);
    emit({ type: 'tool_end', name: 'web_search', toolCallId: 'search1', result: '官方证据', isError: false });
    expect(thread.querySelector('.ai-analysis-state')?.textContent).toBe('正在整理回答');
    emit({ type: 'text', delta: '第一段' });
    emit({ type: 'usage', usage: { totalTokens: 100 } });
    const paragraph = thread.querySelector('.ai-analysis-text p');
    emit({ type: 'text', delta: '继续输出' });
    emit({ type: 'usage', usage: { totalTokens: 200 } });
    expect(thread.querySelector('.ai-analysis-text p')).toBe(paragraph);
    expect(paragraph?.textContent).toBe('第一段继续输出');
    expect(thread.querySelector('.ai-analysis-response-actions')).toBeNull();
    release();
    await pending;
    expect(thread.querySelector('[data-copy-answer]')).not.toBeNull();
    expect(thread.querySelector('.ai-analysis-state')).toBeNull();
  });

  it('matches parallel tool results by call ID instead of swapping tools with the same name', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_start', name: 'query_property_rows', toolCallId: 'a', args: { model: 'PA-101' } });
      emit({ type: 'tool_start', name: 'query_property_rows', toolCallId: 'b', args: { model: 'PA-202' } });
      emit({ type: 'tool_end', name: 'query_property_rows', toolCallId: 'a', isError: false, result: 'A的证据' });
      expect(document.querySelector('[data-disclosure="tool-0"] pre')?.textContent).toBe('A的证据');
      expect(document.querySelectorAll('.ai-analysis-tool.is-running')).toHaveLength(1);
      emit({ type: 'tool_end', name: 'query_property_rows', toolCallId: 'b', isError: false, result: 'B的证据' });
      emit({ type: 'text', delta: '回答' });
      emit(done);
    });
    await app.aiAnalysis.run('问题');
    expect(document.querySelector('[data-disclosure="tool-1"] pre')?.textContent).toBe('B的证据');
  });

  it('collapses a batch of searches into one row while keeping the queries visible', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_start', name: 'web_search', toolCallId: 'a', args: { query: '王者荣耀 下象棋 模式 玩法' } });
      emit({ type: 'tool_start', name: 'web_search', toolCallId: 'b', args: { query: '王者荣耀 象棋 活动' } });
      expect(document.querySelector('.ai-analysis-tools-summary')?.textContent).toContain('正在执行 2 次联网搜索');
      expect(document.querySelectorAll('.ai-analysis-tool')).toHaveLength(1);
      emit({ type: 'tool_end', name: 'web_search', toolCallId: 'a', isError: false, result: 'A' });
      emit({ type: 'tool_end', name: 'web_search', toolCallId: 'b', isError: false, result: 'B' });
      emit({ type: 'text', delta: '回答' });
      emit(done);
    });
    await app.aiAnalysis.run('王者荣耀象棋');
    expect(document.querySelector('.ai-analysis-tools-summary')?.textContent).toContain('已完成 2 次联网搜索');
    const labels = [...document.querySelectorAll('.ai-analysis-tool-label')].map((element) => element.textContent);
    expect(labels).toEqual(['联网搜索']);
    const hint = document.querySelector('.ai-analysis-tool-hint')?.textContent || '';
    expect(hint).toContain('王者荣耀 下象棋 模式 玩法');
    expect(hint).toContain('王者荣耀 象棋 活动');
    expect(hint.length).toBeLessThanOrEqual(56);
    expect(document.querySelectorAll('.ai-analysis-tool.is-done')).toHaveLength(1);
  });

  it('keeps repeat calls of a business tool as separate rows with their own arguments', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_start', name: 'query_property_rows', toolCallId: 'a', args: { model: 'PA-101' } });
      emit({ type: 'tool_end', name: 'query_property_rows', toolCallId: 'a', isError: false, result: 'A' });
      emit({ type: 'tool_start', name: 'query_property_rows', toolCallId: 'b', args: { model: 'PA-202' } });
      emit({ type: 'tool_end', name: 'query_property_rows', toolCallId: 'b', isError: false, result: 'B' });
      emit(done);
    });
    await app.aiAnalysis.run('对比两种型号');
    expect(document.querySelectorAll('.ai-analysis-tool')).toHaveLength(2);
    const hints = [...document.querySelectorAll('.ai-analysis-tool-hint')].map((element) => element.textContent);
    expect(hints).toEqual(['PA-101', 'PA-202']);
  });

  it('shows a failed search batch as a single failed row', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_start', name: 'web_search', toolCallId: 'a', args: { query: 'A' } });
      emit({ type: 'tool_start', name: 'web_search', toolCallId: 'b', args: { query: 'B' } });
      emit({ type: 'tool_end', name: 'web_search', toolCallId: 'a', isError: true, result: 'boom' });
      emit({ type: 'tool_end', name: 'web_search', toolCallId: 'b', isError: true, result: 'boom' });
      emit(done);
    });
    await app.aiAnalysis.run('搜索');
    expect(document.querySelectorAll('.ai-analysis-tool')).toHaveLength(1);
    expect(document.querySelector('.ai-analysis-tool.is-error')).toBeTruthy();
    expect(document.querySelector('.ai-analysis-tools-summary')?.textContent).toContain('2 项失败');
  });

  it('truncates a long query hint instead of breaking the tool row layout', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_start', name: 'query_property_rows', toolCallId: 'a', args: { model: 'X'.repeat(120) } });
      emit(done);
    });
    await app.aiAnalysis.run('查询');
    const hint = document.querySelector('.ai-analysis-tool-hint')?.textContent || '';
    expect(hint.length).toBeLessThanOrEqual(56);
    expect(hint.endsWith('…')).toBe(true);
  });

  it('copies a completed answer without tool logs, token counts or interface labels', async () => {
    app.utils.copyText = vi.fn().mockResolvedValue(true);
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'text', delta: '**结论**：数据完整。' });
      emit(done);
    });
    await app.aiAnalysis.run('问题');
    (document.querySelector('[data-copy-answer]') as HTMLButtonElement).click();
    await flush();
    expect(app.utils.copyText).toHaveBeenCalledWith('**结论**：数据完整。');
    expect(document.querySelector('[data-copy-answer]')?.getAttribute('aria-label')).toBe('回答已复制');
  });

  it('uses one transient retry notice and never marks an unfinished tool as successful', async () => {
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'tool_start', name: 'web_search', toolCallId: 'a' });
      emit({ type: 'status', status: 'retrying', attempt: 1 });
      expect(document.querySelector('.ai-analysis-state')?.textContent).toContain('正在重试');
      expect(document.querySelector('.ai-analysis-error')).toBeNull();
      emit({ ...done, status: 'aborted' });
    });
    await app.aiAnalysis.run('问题');
    expect(document.querySelector('.ai-analysis-tool.is-stopped')).not.toBeNull();
    expect(document.querySelector('.ai-analysis-tool.is-done')).toBeNull();
    expect(document.querySelector('.ai-tool-running')).toBeNull();
  });

  it('copies the raw code, not rendered markup or the language label', async () => {
    app.utils.copyText = vi.fn().mockResolvedValue(true);
    api.stream.mockImplementation(async (_id, emit) => {
      emit({ type: 'text', delta: '```html\n<b>原文</b>\n```' });
      emit(done);
    });
    await app.aiAnalysis.run('输出代码');
    (document.querySelector('[data-copy-code]') as HTMLButtonElement).click();
    await flush();
    expect(app.utils.copyText).toHaveBeenCalledWith('<b>原文</b>\n');
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('已复制');
  });

  it('preserves a model error as an error state and restores the composer', async () => {
    api.start.mockRejectedValue(new Error('服务端模型不可用'));
    await app.aiAnalysis.run('问题');
    expect(element('aiAnalysisThread').textContent).toContain('服务端模型不可用');
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    expect((element('aiAnalysisSendBtn') as HTMLButtonElement).disabled).toBe(true);
    (element('aiAnalysisInput') as HTMLTextAreaElement).value = '重新提问';
    element('aiAnalysisInput').dispatchEvent(new Event('input', { bubbles: true }));
    expect((element('aiAnalysisSendBtn') as HTMLButtonElement).disabled).toBe(false);
  });
});
