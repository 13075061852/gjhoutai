// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderAiMarkdown } from './aiMarkdown';

function root(text: string) {
  const element = document.createElement('div');
  element.innerHTML = renderAiMarkdown(text);
  return element;
}

describe('AI answer output types', () => {
  it('renders semantic headings, nested lists, quotes and separators', () => {
    const element = root('# 总结\n\n## 明细\n\n### 注意\n\n- 第一项\n  - 子项\n\n1. 步骤\n\n> 引用说明\n\n---\n\n**重要**与`型号`');
    for (const selector of ['h1', 'h2', 'h3', 'ul ul', 'ol', 'blockquote', 'hr', 'strong', 'code']) expect(element.querySelector(selector), selector).not.toBeNull();
  });
  it('keeps tables semantic inside a keyboard-accessible scroll region and centers headers and numeric columns', () => {
    const element = root('| 版本 | 数量 | 特点 |\n| --- | ---: | --- |\n| 性能版 | 1200 | 加速更快 |\n| 推进版 | 800 | 冷气推进 |');
    const wrapper = element.querySelector('.markdown-table-wrap')!;
    expect(wrapper.getAttribute('tabindex')).toBe('0');
    expect(wrapper.getAttribute('role')).toBe('region');
    expect(wrapper.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
    expect(wrapper.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(wrapper.querySelector('td.ai-number')?.textContent).toBe('1200');
    expect(element.querySelectorAll('.markdown-table-wrap')).toHaveLength(1);
  });
  it('marks whole numeric columns including placeholders, and leaves dates and models alone', () => {
    const element = root('| 检测日期 | 客户/名称 | 灰份1 | 灰份2 | 平均 |\n| --- | --- | --- | --- | --- |\n| 2026-08-12 | 余姚凯一 | — | 4.10% | ≈4.15% |\n| 2026-06-27 | 鼎松/本松 | 29.98% | 29.79% | ≈29.89% |\n| 2026-04-07 | 新纤 D201G30 | 23.0~27.0 | ≤0.05% | 12.5 MPa |');
    const rows = [...element.querySelectorAll('tbody tr')].map((row) => [...row.children]);
    // 日期与客户列是文本，只靠全局居中，不参与数值列判定
    expect(rows[0][0].classList.contains('ai-number')).toBe(false);
    expect(rows[0][1].classList.contains('ai-number')).toBe(false);
    // 数值列整列标记，包括“—”占位与区间/约数/带单位的值
    for (const row of rows) {
      for (const cell of row.slice(2)) expect(cell.classList.contains('ai-number')).toBe(true);
    }
  });
  it('marks a long explanation column as a whole instead of per cell', () => {
    const element = root('| 日期 | 型号 | 灰份 | 备注 |\n| --- | --- | --- | --- |\n| 2026/8/1 | 320G6-B3S | — | 该批次为本年度新客户首次送样，需复核三次取平均。 |\n| 2026/8/1 | 320G6-B9 | — | 正常 |');
    const rows = [...element.querySelectorAll('tbody tr')].map((row) => [...row.children]);
    expect(rows[0][0].classList.contains('ai-cell-long')).toBe(false);
    expect(rows[0][3].classList.contains('ai-cell-long')).toBe(true);
    expect(rows[1][3].classList.contains('ai-cell-long')).toBe(true);
    expect(rows[1][1].classList.contains('ai-cell-long')).toBe(false);
    const heads = [...element.querySelectorAll('thead th')];
    expect(heads[3].classList.contains('ai-cell-long')).toBe(true);
    expect(heads[1].classList.contains('ai-cell-long')).toBe(false);
  });
  it('provides a language header and copy control with exact escaped code content', () => {
    const element = root('```js\nconst html = "<b>hello</b>";\n```');
    expect(element.querySelector('.ai-code-head')?.textContent).toContain('js');
    expect(element.querySelector('[data-copy-code]')?.getAttribute('aria-label')).toBe('复制代码');
    expect(element.querySelector('pre code')?.textContent).toBe('const html = "<b>hello</b>";\n');
    expect(element.querySelector('pre b')).toBeNull();
  });
  it('shows task lists as disabled checkboxes, not emoji or interactive business operations', () => {
    const element = root('- [x] 已核对\n- [ ] 待确认');
    const checkboxes = element.querySelectorAll<HTMLInputElement>('.ai-task-checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect([...checkboxes].every((checkbox) => checkbox.disabled)).toBe(true);
  });
  it('keeps source links safe and formats numeric citations', () => {
    const element = root('[1](https://example.com/docs)\n\n[危险](javascript:alert(1))\n\n<script>alert(1)</script>');
    const source = element.querySelector('a.ai-citation')!;
    expect(source.getAttribute('rel')).toBe('noopener noreferrer');
    expect(source.getAttribute('target')).toBe('_blank');
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('a[href^="javascript:"]')).toBeNull();
  });
  it('renders answer images as clickable previews and rejects unsafe sources', () => {
    const element = root('![320G6-B1S FTIR](/gjhoutai/api/blob/spectrum/upload-1)');
    const link = element.querySelector('a.ai-image-link')!;
    expect(link.getAttribute('href')).toBe('/gjhoutai/api/blob/spectrum/upload-1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.querySelector('img.ai-image')?.getAttribute('src')).toBe('/gjhoutai/api/blob/spectrum/upload-1');
    expect(link.querySelector('img')?.getAttribute('alt')).toBe('320G6-B1S FTIR');
    expect(link.querySelector('.ai-image-caption')?.textContent).toBe('320G6-B1S FTIR');
    expect(root('![x](javascript:alert(1))').querySelector('img')).toBeNull();
    expect(root('![x](vbscript:msgbox)').querySelector('img')).toBeNull();
  });
  it('shows a distinct visible name for every spectrum, including old saved Markdown answers', () => {
    const element = root('![4815 NCB FTIR（2026-10-15）](/gjhoutai/api/blob/spectrum/ftir)\n\n![4815 NCB TGA（2026-10-17）](/gjhoutai/api/blob/spectrum/tga)');
    expect([...element.querySelectorAll('.ai-image-caption')].map(node => node.textContent)).toEqual(['4815 NCB FTIR（2026-10-15）', '4815 NCB TGA（2026-10-17）']);
    for (const link of element.querySelectorAll('.ai-image-link')) expect(link.firstElementChild?.className).toBe('ai-image-caption');
  });
  it('does not repeat the identical adjacent name already supplied as a heading or bold paragraph', () => {
    for (const title of ['### 4815 NCB FTIR', '**4815 NCB FTIR**']) {
      const element = root(`${title}\n\n![4815 NCB FTIR](/gjhoutai/api/blob/spectrum/x)`);
      expect(element.querySelector('img')).not.toBeNull();
      expect(element.querySelector('.ai-image-caption')).toBeNull();
      expect(element.textContent?.trim()).toBe('4815 NCB FTIR');
    }
    // A general section title or a different date must not hide the actual image name.
    expect(root('### 图谱\n\n![4815 NCB FTIR](/gjhoutai/api/blob/spectrum/x)').querySelector('.ai-image-caption')).not.toBeNull();
  });
  it('escapes image names and uses an explicit title or honest fallback when alt is empty', () => {
    const element = root('![<img src=x onerror=alert(1)>](/gjhoutai/api/blob/spectrum/x)');
    expect(element.querySelector('.ai-image-caption')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(element.querySelectorAll('img')).toHaveLength(1);
    expect(element.querySelector('[onerror]')).toBeNull();
    expect(root('![](/gjhoutai/api/blob/spectrum/x "4815 NCB")').querySelector('.ai-image-caption')?.textContent).toBe('4815 NCB');
    expect(root('![](/gjhoutai/api/blob/spectrum/x)').querySelector('.ai-image-caption')?.textContent).toBe('图片（未提供名称）');
    expect(root('![4815 **NCB** `FTIR`](/gjhoutai/api/blob/spectrum/x)').querySelector('.ai-image-caption')?.textContent).toBe('4815 NCB FTIR');
  });
  it('resolves platform-relative image and file urls through the provided resolver', () => {
    const resolveUrl = (url: string) => url.startsWith('/gjhoutai/') ? `https://www.kingpolymer.com${url}` : url;
    const html = renderAiMarkdown('![谱图](/gjhoutai/api/blob/spectrum/upload-1)\n\n[报告.pdf](/gjhoutai/api/inspection-reports/abc/file)', { resolveUrl });
    const element = document.createElement('div');
    element.innerHTML = html;
    expect(element.querySelector('img.ai-image')?.getAttribute('src')).toBe('https://www.kingpolymer.com/gjhoutai/api/blob/spectrum/upload-1');
    expect(element.querySelector('a.ai-file-link')?.getAttribute('href')).toBe('https://www.kingpolymer.com/gjhoutai/api/inspection-reports/abc/file');
  });
  it('renders platform file links as file cards but leaves external links plain', () => {
    const report = root('[A609091 320G6-B1S.pdf](/gjhoutai/api/inspection-reports/abc/file)');
    expect(report.querySelector('a.ai-file-link')).not.toBeNull();
    expect(report.querySelector('a.ai-file-link i.ti-paperclip')).not.toBeNull();
    const external = root('[来源](https://example.com/a.pdf)');
    expect(external.querySelector('a.ai-file-link')).toBeNull();
    const image = root('[查看](/gjhoutai/api/blob/spectrum/upload-2.png)');
    expect(image.querySelector('a.ai-file-link')).toBeNull();
  });
  it('handles partial streaming tables and fences without invalid wrappers or exceptions', () => {
    for (const text of ['', '| 型号 | 数量 |\n|---|---|\n| 320G6 |', '```json\n{"型号":', '## 标题\n\n>']) {
      expect(() => root(text)).not.toThrow();
    }
  });
});
