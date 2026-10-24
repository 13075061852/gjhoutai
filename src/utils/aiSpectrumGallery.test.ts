// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { AiSpectrumGallery } from '../services/ai-analysis';
import { parseSpectrumGallery, selectSpectrumGalleries, renderSpectrumGalleries, spectrumImagePrefixes } from './aiSpectrumGallery';
import { renderAiMarkdown } from './aiMarkdown';

const gallery = (keyword = '4830bkf'): AiSpectrumGallery => ({
  mode: 'one_per_type', scopeKey: keyword, query: { keyword, category: '', tag: '' },
  requestedTypes: ['DSC', 'TGA', 'FTIR'], missingTypes: [],
  entries: (['DSC', 'TGA', 'FTIR'] as const).map(type => ({ id: type.toLowerCase(), title: `长春4830BKF ${type}`, date: '2026-10-20', registeredType: type, typeVerified: false, imageUrl: `/gjhoutai/api/blob/spectrum/${type.toLowerCase()}` })),
});
const root = (html: string) => { const element = document.createElement('div'); element.innerHTML = html; return element; };

describe('canonical spectrum coverage', () => {
  it('renders one DSC, one TGA and one FTIR without any model-generated Markdown images', () => {
    const element = root(renderSpectrumGalleries([gallery()], value => value));
    expect([...element.querySelectorAll('[data-spectrum-type]')].map(node => node.getAttribute('data-spectrum-type'))).toEqual(['DSC', 'TGA', 'FTIR']);
    expect(element.querySelectorAll('img')).toHaveLength(3);
    expect(element.querySelectorAll('.ai-image-caption')).toHaveLength(3);
    expect(element.textContent).toContain('登记分类');
    expect(element.textContent).toContain('实际类型以图像核验为准');
  });
  it('suppresses duplicate model FTIRs and their own captions, not analysis, external images or code examples', () => {
    const text = '分析结论\n\n**第一张FTIR**\n\n![第一张FTIR](/gjhoutai/api/blob/spectrum/ftir)\n\n![灰份FTIR](/gjhoutai/api/blob/spectrum/ftir-ash)\n\n![外部图](https://example.com/gjhoutai/api/blob/spectrum/example)\n\n```md\n![示例](/gjhoutai/api/blob/spectrum/demo)\n```';
    const element = root(renderAiMarkdown(text, { managedSpectrumPrefixes: spectrumImagePrefixes([gallery()]) }) + renderSpectrumGalleries([gallery()], value => value));
    expect(element.querySelectorAll('.ai-spectrum-gallery img')).toHaveLength(3);
    expect(element.querySelectorAll('img')).toHaveLength(4); // Three canonical spectra + untouched external image.
    expect(element.textContent).toContain('分析结论');
    expect(element.textContent).not.toContain('第一张FTIR');
    expect(element.textContent).not.toContain('灰份FTIR');
    expect(element.querySelector('code')?.textContent).toContain('![示例]');
    expect(element.querySelector('img[src$="ftir-ash"]')).toBeNull();
  });
  it('uses the most specific model query, deduplicates retries and retains independent compared models', () => {
    const broad = gallery('4830'); const precise = gallery(); const near = gallery('4830bkx'); const second = gallery('4815NCB');
    expect(selectSpectrumGalleries([broad, precise, near], '查一下长春4830bkf的图谱').map(item => item.query.keyword)).toEqual(['4830bkf']);
    expect(selectSpectrumGalleries([precise, precise], '查4830bkf')).toHaveLength(1);
    expect(selectSpectrumGalleries([precise, second], '比较4830bkf和4815NCB').map(item => item.query.keyword)).toEqual(['4830bkf', '4815NCB']);
  });
  it('reports genuinely missing image slots without inventing a URL or substituting another FTIR', () => {
    const missing = gallery(); missing.entries = missing.entries.filter(item => item.registeredType === 'FTIR');
    const parsed = parseSpectrumGallery(missing)!;
    const element = root(renderSpectrumGalleries([parsed], value => value));
    expect(element.querySelectorAll('img')).toHaveLength(1);
    expect(element.textContent).toContain('DSC、TGA：当前查询未找到可用图片');
  });
  it('validates persisted galleries, escapes names and resolves URLs for the dev environment', () => {
    expect(parseSpectrumGallery({})).toBeNull();
    const evil = gallery(); evil.entries[0].imageUrl = 'javascript:alert(1)';
    expect(parseSpectrumGallery(evil)).toBeNull();
    const duplicate = gallery(); duplicate.entries[1].registeredType = 'DSC';
    expect(parseSpectrumGallery(duplicate)).toBeNull();
    const names = gallery(); names.entries[0].title = '<script>alert(1)</script>';
    const element = root(renderSpectrumGalleries([parseSpectrumGallery(names)!], value => `https://www.kingpolymer.com${value}`));
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('.ai-image-caption')?.textContent).toContain('<script>');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://www.kingpolymer.com/gjhoutai/api/blob/spectrum/dsc');
  });
});
