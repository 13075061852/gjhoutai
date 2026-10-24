export const DEEPSEEK_PRICING_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
type PriceAmounts = { inputCnyPerMillion?: number; outputCnyPerMillion?: number; cachedInputCnyPerMillion?: number };
type Pricing = PriceAmounts & { peak?: PriceAmounts };
const text = (html: string) => html.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const span = (attributes: string, name: string) => Math.max(1, Math.min(32, Number(attributes.match(new RegExp(`${name}=["']?(\\d+)`, 'i'))?.[1]) || 1));

function tableRows(html: string) {
  const grid: string[][] = [];
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 128);
  rows.forEach((row, r) => {
    grid[r] ||= [];
    let column = 0;
    for (const cell of row[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      while (grid[r][column] !== undefined) column += 1;
      if (column > 64) throw new Error('pricing_table_too_large');
      const width = span(cell[1], 'colspan');
      const height = span(cell[1], 'rowspan');
      for (let y = r; y < r + height; y += 1) {
        grid[y] ||= [];
        for (let x = column; x < column + width; x += 1) grid[y][x] = text(cell[2]);
      }
      column += width;
    }
  });
  return grid;
}

export function parseDeepSeekPricing(html: string) {
  const models: Array<{ id: string; aliases: string[]; contextLength: number | null; pricing: Pricing & { currency: string; unit: string } }> = [];
  for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = tableRows(table[0]);
    const header = rows.find((row) => row.some((cell) => cell === '模型') && row.some((cell) => /^deepseek[-\w.]+$/i.test(cell)));
    if (!header) continue;
    header.forEach((id, column) => {
      if (!/^deepseek[-\w.]+$/i.test(id)) return;
      const version = rows.find((row) => row.some((cell) => cell === '模型版本'))?.[column];
      const pricing: Pricing = {};
      for (const row of rows) {
        const label = row.slice(0, column).join(' ');
        if (!/百万\s*tokens/i.test(label)) continue;
        const kind = /输入/.test(label) ? (/未命中/.test(label) ? 'inputCnyPerMillion' : /命中/.test(label) ? 'cachedInputCnyPerMillion' : 'inputCnyPerMillion') : /输出/.test(label) ? 'outputCnyPerMillion' : '';
        if (!kind) continue;
        const amount = String(row[column] || '').match(/^\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)\s*元?\s*$/);
        if (!amount) continue;
        const target = /高峰/.test(label) ? (pricing.peak ||= {}) : pricing;
        target[kind] = Number(amount[1]);
      }
      if (pricing.inputCnyPerMillion === undefined || pricing.outputCnyPerMillion === undefined) return;
      const context = rows.find((row) => row.some((cell) => cell === '上下文长度'))?.[column] || '';
      const length = context.match(/^(\d+(?:\.\d+)?)\s*([MK])?$/i);
      models.push({ id, aliases: version ? [version] : [], contextLength: length ? Number(length[1]) * (/m/i.test(length[2]) ? 1e6 : /k/i.test(length[2]) ? 1e3 : 1) : null, pricing: { ...pricing, currency: 'CNY', unit: 'million_tokens' } });
    });
  }
  // Only inherit prices for retired IDs when the official footnote explicitly
  // names their replacement and states that they use its billing rate.
  for (const paragraph of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (!/仍可调用/.test(paragraph[1]) || !/按[^<。]*价格计费/.test(text(paragraph[1]))) continue;
    const replacement = paragraph[1].match(/模型名请使用\s*<code[^>]*>([^<]+)<\/code>/)?.[1];
    const model = models.find((entry) => entry.id === replacement);
    const retired = paragraph[1].match(/旧模型名([\s\S]*?)仍可调用/)?.[1];
    if (!model || !retired) continue;
    for (const code of retired.matchAll(/<code[^>]*>([^<]+)<\/code>/gi)) {
      if (!model.aliases.includes(code[1])) model.aliases.push(code[1]);
    }
  }
  if (!models.length) throw new Error('official_pricing_format_changed');
  return { provider: 'deepseek', source: DEEPSEEK_PRICING_SOURCE, fetchedAt: new Date().toISOString(), models };
}

export async function fetchDeepSeekOfficialPricing(fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(DEEPSEEK_PRICING_SOURCE, { signal: controller.signal, redirect: 'error', headers: { Accept: 'text/html' } });
    if (!response.ok || !response.body) throw new Error('official_pricing_unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error('official_pricing_too_large'); }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally { reader.releaseLock(); }
    return parseDeepSeekPricing(html);
  } finally { clearTimeout(timer); }
}
