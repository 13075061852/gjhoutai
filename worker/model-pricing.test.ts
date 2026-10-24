import { describe, expect, it, vi } from 'vitest';
import { fetchDeepSeekOfficialPricing, parseDeepSeekPricing } from './model-pricing';
const html = `<table>
<tr><td colspan="3">模型</td><td>deepseek-future<sup>(1)</sup></td><td>deepseek-pro</td></tr>
<tr><td colspan="3">模型版本</td><td>DeepSeek-Future-V5</td><td>DeepSeek-Pro-V5</td></tr>
<tr><td colspan="3">上下文长度</td><td colspan="2">1M</td></tr>
<tr><td rowspan="4">价格</td><td rowspan="2">百万tokens输入（缓存未命中）</td><td>空闲时段</td><td>1元</td><td>4.5元</td></tr>
<tr><td>高峰时段</td><td>2元</td><td>9元</td></tr>
<tr><td rowspan="2">百万tokens输出</td><td>空闲时段</td><td>4元</td><td>13.5元</td></tr>
<tr><td>高峰时段</td><td>8元</td><td>27元</td></tr>
</table>`;
describe('official DeepSeek price synchronization', () => {
  it('discovers new model columns and versions without any hardcoded model or price map', () => {
    const snapshot = parseDeepSeekPricing(html);
    expect(snapshot.models).toHaveLength(2);
    expect(snapshot.models[0]).toMatchObject({ id: 'deepseek-future', aliases: ['DeepSeek-Future-V5'], contextLength: 1000000,
      pricing: { inputCnyPerMillion: 1, outputCnyPerMillion: 4, peak: { inputCnyPerMillion: 2, outputCnyPerMillion: 8 } } });
    expect(snapshot.models[1].pricing).toMatchObject({ inputCnyPerMillion: 4.5, outputCnyPerMillion: 13.5 });
  });
  it('inherits prices for retired model IDs only when an official billing footnote explicitly documents the alias', () => {
    const snapshot = parseDeepSeekPricing(html + '<p>模型名请使用 <code>deepseek-future</code>。旧模型名 <code>deepseek-retired</code> 仍可调用，请求将由新版提供服务，并按 Flash 价格计费。</p>');
    expect(snapshot.models[0].aliases).toContain('deepseek-retired');
    expect(parseDeepSeekPricing(html).models[0].aliases).not.toContain('deepseek-retired');
  });
  it('fails closed on changed markup or missing prices rather than inventing a quote', () => {
    expect(() => parseDeepSeekPricing('<table><tr><td>unavailable</td></tr></table>')).toThrow('official_pricing_format_changed');
    expect(() => parseDeepSeekPricing(html.replace(/\d+(?:\.\d+)?元/g, '待公布'))).toThrow();
  });
  it('fetches only the fixed official page with no API key and returns provenance', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(html));
    const snapshot = await fetchDeepSeekOfficialPricing(fetcher);
    expect(snapshot.source).toBe('https://api-docs.deepseek.com/zh-cn/quick_start/pricing/');
    expect(Date.parse(snapshot.fetchedAt)).not.toBeNaN();
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Accept: 'text/html' });
  });
  it('limits upstream response size and handles upstream errors', async () => {
    await expect(fetchDeepSeekOfficialPricing(vi.fn().mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1))))).rejects.toThrow('too_large');
    await expect(fetchDeepSeekOfficialPricing(vi.fn().mockResolvedValue(new Response('', { status: 503 })))).rejects.toThrow('unavailable');
  });
});
