import MarkdownIt from 'markdown-it';

export type AiMarkdownOptions = {
  /** 把平台相对地址（/gjhoutai/api/...）解析成当前环境可访问的地址。 */
  resolveUrl?: (url: string) => string;
  /** Prepared changes already have an authoritative confirmation table below the answer. */
  /** Canonical server-selected gallery owns these platform image slots. */
  managedSpectrumPrefixes?: readonly string[];
};

/** Answer-only renderer: trusted UI wrappers, never model-supplied HTML. */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
const safeUrl = (value: string) => {
  const url = value.trim();
  if (!url || /[\u0000-\u0020]/.test(url)) return false;
  if (/^(#|\/(?!\/)|\.{1,2}\/)/.test(url)) return true;
  try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(url).protocol); }
  catch { return false; }
};
md.validateLink = safeUrl;
const defaultLink = md.renderer.rules.link_open || ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options));
const isFileHref = (href: string) => (!/\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i.test(href))
  && (/\/api\/(blob|inspection-reports|ai\/uploads)\//.test(href) || /\/api\/property-data\/backup/.test(href));
md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const raw = token.attrGet('href') || '';
  const resolved = (env as AiMarkdownOptions | undefined)?.resolveUrl?.(raw) || raw;
  if (!safeUrl(resolved)) token.attrSet('href', '#');
  else if (resolved !== raw) token.attrSet('href', resolved);
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  const label = tokens[index + 1]?.content || '';
  if (/^\[?\d+(?:[,–-]\d+)*\]?$/.test(label)) token.attrJoin('class', 'ai-citation');
  const href = token.attrGet('href') || '';
  if (!isFileHref(href)) return defaultLink(tokens, index, options, env, renderer);
  token.attrJoin('class', 'ai-file-link');
  return `${renderer.renderToken(tokens, index, options)}<i class="ti ti-paperclip ai-file-icon" aria-hidden="true"></i>`;
};
md.renderer.rules.table_open = () => '<div class="markdown-table-wrap" role="region" aria-label="数据表格" tabindex="0"><table>';
md.renderer.rules.table_close = () => '</table></div>';
md.renderer.rules.th_open = (tokens, index, options, _env, renderer) => {
  tokens[index].attrSet('scope', 'col');
  return renderer.renderToken(tokens, index, options);
};

/** 数值单元格：允许约数符号、区间、百分号与常见单位，日期和型号不算数值。 */
const NUMERIC_CELL = new RegExp(
  '^(?:[≈~～<>≤≥±]\\s*)?[+-]?\\d[\\d,. ]*'
  + '(?:\\s*(?:%|‰|℃|°C|MPa|GPa|kPa|kJ/m²|g/cm³|kg/m³|g/10min|mm|cm|μm|um|nm|kg|g|h|min|s))?'
  + '(?:\\s*[~～\\-–至]\\s*(?:[≈~～<>≤≥±]\\s*)?[+-]?\\d[\\d,. ]*'
  + '(?:\\s*(?:%|‰|℃|°C|MPa|GPa|kPa))?)?$',
  'i',
);
const isNumericCell = (value: string) => NUMERIC_CELL.test(value.trim());
/** 超过这个长度的单元格（备注、说明）保留左对齐，其余短值统一居中。 */
const LONG_CELL_LENGTH = 18;
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0].replace(/[^\w#+.-]/g, '').slice(0, 32);
  const label = md.utils.escapeHtml(language || '纯文本');
  const code = md.utils.escapeHtml(token.content);
  return `<div class="ai-code-block"><div class="ai-code-head"><span>${label}</span><button class="ai-code-copy" type="button" data-copy-code aria-label="复制代码"><i class="ti ti-copy" aria-hidden="true"></i><span>复制</span></button></div><pre><code${language ? ` class="language-${md.utils.escapeHtml(language)}"` : ''}>${code}</code></pre></div>`;
};
const plainInlineText = (tokens: readonly { type: string; content: string }[]) => tokens
  .map((token) => ['text', 'code_inline'].includes(token.type) ? token.content : ['softbreak', 'hardbreak'].includes(token.type) ? ' ' : '').join('').trim();
const imageName = (token: { content: string; children?: { type: string; content: string }[] | null; attrGet: (name: string) => string | null }) => plainInlineText(token.children || [])
  || token.content.trim() || token.attrGet('title')?.trim() || '图片（未提供名称）';
md.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const raw = token.attrGet('src') || '';
  const resolved = (env as AiMarkdownOptions | undefined)?.resolveUrl?.(raw) || raw;
  if (!safeUrl(resolved) || /^(mailto|tel):/i.test(resolved)) return md.utils.escapeHtml(token.content);
  const alt = md.utils.escapeHtml(imageName(token));
  const href = md.utils.escapeHtml(resolved);
  const caption = token.meta?.captionAlreadyVisible ? '' : `<span class="ai-image-caption">${alt}</span>`;
  return `<a class="ai-image-link" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="打开图片：${alt}">${caption}<img class="ai-image" src="${href}" alt="${alt}" loading="lazy" decoding="async"></a>`;
};
// A name in Markdown alt text is normally invisible. Show it unless the same
// name is already the immediately preceding heading/paragraph (never delete source text).
md.core.ruler.after('inline', 'ai_image_captions', (state) => {
  const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  state.tokens.forEach((token, index) => {
    if (token.type !== 'inline') return;
    const images = token.children?.filter((child) => child.type === 'image') || [];
    if (images.length !== 1 || token.children?.some((child) => child.type !== 'image' && (child.type !== 'text' || child.content.trim()))) return;
    const previous = state.tokens[index - 3];
    const opener = state.tokens[index - 4];
    if (previous?.type !== 'inline' || !['paragraph_open', 'heading_open'].includes(opener?.type || '') || previous.children?.some((child) => child.type === 'image')) return;
    if (normalize(plainInlineText(previous.children || [])) === normalize(imageName(images[0]))) images[0].meta = { ...images[0].meta, captionAlreadyVisible: true };
  });
});
md.core.ruler.after('ai_image_captions', 'ai_managed_spectrum_images', (state) => {
  const env = state.env as AiMarkdownOptions | undefined;
  if (!env?.managedSpectrumPrefixes?.length) return;
  const base = typeof window !== 'undefined' && /^https?:/.test(window.location.href) ? window.location.href : 'https://relative.invalid/';
  const url = (value: string) => { try { return new URL(env.resolveUrl?.(value) || value, base); } catch { return null; } };
  const prefixes = env.managedSpectrumPrefixes.map(url).filter((value): value is URL => Boolean(value));
  const managed = (value: string) => {
    const source = url(value);
    return source && prefixes.some(prefix => source.origin === prefix.origin && source.pathname.startsWith(prefix.pathname));
  };
  const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  for (let index = state.tokens.length - 1; index >= 0; index--) {
    const token = state.tokens[index];
    if (token?.type !== 'inline') continue;
    const images = token.children?.filter(child => child.type === 'image' && managed(child.attrGet('src') || '')) || [];
    if (!images.length) continue;
    const onlyImages = token.children?.every(child => images.includes(child) || ['softbreak', 'hardbreak'].includes(child.type) || (child.type === 'text' && !child.content.trim()));
    if (!onlyImages || state.tokens[index - 1]?.type !== 'paragraph_open' || state.tokens[index + 1]?.type !== 'paragraph_close') {
      token.children = token.children?.filter(child => !images.includes(child)) || [];
      continue;
    }
    let start = index - 1;
    const previous = state.tokens[index - 3];
    if (previous?.type === 'inline' && ['paragraph_open', 'heading_open'].includes(state.tokens[index - 4]?.type || '')
      && !previous.children?.some(child => child.type === 'image')
      && images.some(image => normalize(imageName(image)) === normalize(plainInlineText(previous.children || [])))) start = index - 4;
    state.tokens.splice(start, index + 2 - start);
  }
});
md.core.ruler.after('inline', 'ai_task_list', (state) => {
  state.tokens.forEach((token, index) => {
    const first = token.children?.[0];
    if (token.type !== 'inline' || first?.type !== 'text' || state.tokens[index - 2]?.type !== 'list_item_open') return;
    const match = first.content.match(/^\[([ xX])\]\s+/);
    if (!match) return;
    state.tokens[index - 2].attrJoin('class', 'ai-task-item');
    first.content = first.content.slice(match[0].length);
    const checkbox = new state.Token('html_inline', '', 0);
    checkbox.content = `<input class="ai-task-checkbox" type="checkbox" disabled${match[1] !== ' ' ? ' checked' : ''} aria-label="${match[1] !== ' ' ? '已完成' : '未完成'}">`;
    token.children!.unshift(checkbox);
  });
});

// 按整列判定而不是逐个单元格：同一列的“—”、空值或单位文本也跟着居中，列内不错位。
md.core.ruler.after('ai_task_list', 'ai_table_numeric', (state) => {
  let inTable = false;
  let rows: Array<Array<{ token: any; value: string }>> = [];
  let current: Array<{ token: any; value: string }> = [];
  state.tokens.forEach((token, index) => {
    if (token.type === 'table_open') { inTable = true; rows = []; return; }
    if (!inTable) return;
    if (token.type === 'tr_open') { current = []; return; }
    if (token.type === 'tr_close') { if (current.length) rows.push(current); current = []; return; }
    if (token.type === 'th_open' || token.type === 'td_open') {
      const inline = state.tokens[index + 1];
      current.push({ token, value: inline?.type === 'inline' ? inline.content : '' });
      return;
    }
    if (token.type !== 'table_close') return;
    const width = Math.max(0, ...rows.map((row) => row.length));
    for (let column = 0; column < width; column += 1) {
      const columnCells = rows.map((row) => row[column]).filter(Boolean);
      const body = columnCells.slice(1);
      const meaningful = body.filter((cell) => cell.value.trim()).length;
      const numeric = body.filter((cell) => isNumericCell(cell.value)).length;
      // 对齐方式按整列决定：同一列里长短不一的文本不会一半居中、一半左对齐。
      const longColumn = body.some((cell) => cell.value.trim().length > LONG_CELL_LENGTH);
      const numericColumn = Boolean(numeric) && numeric * 2 >= meaningful;
      if (!numericColumn && !longColumn) continue;
      const className = longColumn ? 'ai-cell-long' : 'ai-number';
      columnCells.forEach((cell) => {
        if (cell.token.type === 'td_open' || cell.token.type === 'th_open') cell.token.attrJoin('class', className);
      });
    }
    inTable = false;
  });
});

export function renderAiMarkdown(value: string, options: AiMarkdownOptions = {}): string {
  return md.render(String(value || '').replace(/\r\n/g, '\n'), options).trim();
}
