// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { patchAiChildren, patchAiTurn } from './aiStreamDom';

const root = (html: string) => { const element = document.createElement('div'); element.innerHTML = html; return element; };

describe('stable streamed answer DOM', () => {
  it('updates text without replacing existing paragraphs or selected output containers', () => {
    const parent = root('<article data-turn="1"><div class="ai-analysis-text"><p>第一段</p></div></article>');
    const article = parent.firstElementChild as HTMLElement;
    const paragraph = article.querySelector('p');
    patchAiTurn(article, '<article data-turn="1" aria-busy="true"><div class="ai-analysis-text"><p>第一段继续</p><p>新段落</p></div></article>');
    expect(article.querySelector('p')).toBe(paragraph);
    expect(paragraph?.textContent).toBe('第一段继续');
    expect(article.querySelectorAll('p')).toHaveLength(2);
    expect(article.getAttribute('aria-busy')).toBe('true');
  });
  it('preserves disclosure state and IconPark-owned SVGs', () => {
    const parent = root('<article><i class="ti ti-copy" data-icon-park-rendered="true"><svg></svg></i><details data-disclosure="tool-0" open><summary>结果</summary><pre>A</pre></details></article>');
    const article = parent.firstElementChild as HTMLElement;
    const icon = article.querySelector('svg');
    patchAiTurn(article, '<article><i class="ti ti-copy"></i><details data-disclosure="tool-0"><summary>结果</summary><pre>AB</pre></details></article>');
    expect(article.querySelector('svg')).toBe(icon);
    expect(article.querySelector('details')?.open).toBe(true);
    expect(article.querySelector('pre')?.textContent).toBe('AB');
  });
  it('inserts a tool summary without recycling the phase label into another role', () => {
    const parent = root('<div><span class="label">AI</span><span class="state">处理中</span></div>');
    const header = parent.firstElementChild as HTMLElement;
    const state = header.querySelector('.state');
    patchAiTurn(header, '<div><span class="label">AI</span><button class="tools">工具</button><span class="state">生成中</span></div>');
    expect(header.querySelector('.state')).toBe(state);
    expect([...header.children].map((element) => element.className)).toEqual(['label', 'tools', 'state']);
  });
  it('appends a new turn without restarting old turns, and removes obsolete nodes', () => {
    const parent = root('<article data-turn="0">旧回答</article><span class="old">移除</span>');
    const first = parent.firstElementChild;
    patchAiChildren(parent, '<article data-turn="0">旧回答</article><article data-turn="1">新问题</article>');
    expect(parent.firstElementChild).toBe(first);
    expect(parent.querySelector('.old')).toBeNull();
    expect(parent.children).toHaveLength(2);
    patchAiChildren(parent, '');
    expect(parent.childNodes).toHaveLength(0);
  });
});
