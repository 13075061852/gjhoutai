import type { AiSpectrumGallery, AiSpectrumType } from '../services/ai-analysis';
const TYPES: AiSpectrumType[] = ['DSC', 'TGA', 'FTIR'];
const fold = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s\-‐‑‒–—_]+/g, '');
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Validate both streamed data and persisted history before it can become HTML. */
export function parseSpectrumGallery(value: unknown): AiSpectrumGallery | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as AiSpectrumGallery;
  if (input.mode !== 'one_per_type' || typeof input.scopeKey !== 'string' || input.scopeKey.length > 2000 || !input.query || typeof input.query !== 'object' || Array.isArray(input.query) || !Array.isArray(input.entries) || input.entries.length > 3) return null;
  const query = { keyword: input.query.keyword || '', category: input.query.category || '', tag: input.query.tag || '' };
  if (Object.values(query).some(item => typeof item !== 'string' || item.length > 1000)) return null;
  const entries: AiSpectrumGallery['entries'] = [];
  for (const entry of input.entries) {
    if (!entry || !TYPES.includes(entry.registeredType) || typeof entry.id !== 'string' || !/^[\w-]{1,160}$/.test(entry.id) || typeof entry.title !== 'string' || entry.title.length > 4000 || typeof entry.date !== 'string' || entry.date.length > 100 || typeof entry.imageUrl !== 'string') return null;
    // Only a platform-relative URL bound to this exact id, never an external image or JS URL.
    if (!/^\/(?!\/)[^?#]*\/api\/blob\/spectrum\//.test(entry.imageUrl) || !entry.imageUrl.endsWith(`/api/blob/spectrum/${entry.id}`)) return null;
    if (entries.some(item => item.registeredType === entry.registeredType || item.id === entry.id)) return null;
    entries.push({ ...entry, typeVerified: false });
  }
  const requestedTypes = TYPES.filter(type => Array.isArray(input.requestedTypes) && input.requestedTypes.includes(type));
  if (!requestedTypes.length || entries.some(entry => !requestedTypes.includes(entry.registeredType))) return null;
  return { mode: 'one_per_type', scopeKey: input.scopeKey, query, entries, requestedTypes, missingTypes: requestedTypes.filter(type => !entries.some(entry => entry.registeredType === type)) };
}

/** Prefer a precise model query to an earlier broad/nearby search; keep independent models. */
export function selectSpectrumGalleries(values: readonly AiSpectrumGallery[], question: string): AiSpectrumGallery[] {
  const latest = new Map<string, AiSpectrumGallery>();
  for (const value of values) { const gallery = parseSpectrumGallery(value); if (gallery) latest.set(gallery.scopeKey, gallery); }
  const galleries = [...latest.values()];
  const text = fold(question);
  const relevant = galleries.filter(gallery => { const key = fold(gallery.query.keyword); return key && text.includes(key); });
  if (!relevant.length) return galleries.slice(-1);
  return relevant.filter(gallery => !relevant.some(other => other !== gallery
    && fold(other.query.keyword).length > fold(gallery.query.keyword).length
    && fold(other.query.keyword).includes(fold(gallery.query.keyword))));
}

export function spectrumImagePrefixes(galleries: readonly AiSpectrumGallery[]): string[] {
  return [...new Set(galleries.flatMap(gallery => gallery.entries.map(entry => entry.imageUrl.slice(0, entry.imageUrl.lastIndexOf('/') + 1))))];
}

/** Canonical image slots do not depend on what Markdown the model chooses to emit. */
export function renderSpectrumGalleries(galleries: readonly AiSpectrumGallery[], resolveUrl: (value: string) => string): string {
  return galleries.map(gallery => {
    const images = gallery.entries.map(entry => {
      const href = resolveUrl(entry.imageUrl);
      if (!/^(?:\/(?!\/)|https?:\/\/)/i.test(href) || /[\u0000-\u0020]/.test(href)) return '';
      const name = `${entry.title || '未命名图谱'}${entry.date ? `（${entry.date}）` : ''}`;
      return `<a class="ai-image-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="打开图片：${escape(name)}" data-spectrum-type="${entry.registeredType}"><span class="ai-image-caption">${escape(name)}</span><img class="ai-image" src="${escape(href)}" alt="${escape(name)}" loading="lazy" decoding="async"></a>`;
    }).join('');
    const missing = gallery.missingTypes.length ? `<p class="ai-spectrum-gallery-note">${gallery.missingTypes.join('、')}：当前查询未找到可用图片，不用重复类型补位。</p>` : '';
    return `<section class="ai-spectrum-gallery" aria-label="分类图谱"><h3>图谱${gallery.query.keyword ? ` · ${escape(gallery.query.keyword)}` : ''}</h3><p class="ai-spectrum-gallery-note">按登记分类各展示一张；实际类型以图像核验为准。</p>${images}${missing}</section>`;
  }).join('');
}
