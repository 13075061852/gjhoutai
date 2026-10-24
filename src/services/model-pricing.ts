import { fetchWithTimeout } from '../utils/fetch';
import bundledSnapshot from '../legacy/data/deepseek-pricing.json';
export const DEEPSEEK_OFFICIAL_SNAPSHOT = bundledSnapshot;
const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');
export type OfficialModelPrice = {
  id: string; aliases: string[]; contextLength: number | null;
  pricing: { inputCnyPerMillion: number; outputCnyPerMillion: number; cachedInputCnyPerMillion?: number;
    peak?: { inputCnyPerMillion?: number; outputCnyPerMillion?: number; cachedInputCnyPerMillion?: number } };
};
export type OfficialModelPricing = { source: string; fetchedAt: string; models: OfficialModelPrice[] };
export async function fetchOfficialDeepSeekPricing(signal?: AbortSignal): Promise<OfficialModelPricing> {
  const response = await fetchWithTimeout(`${API_BASE}/api/model-pricing?provider=deepseek`, { credentials: 'include', cache: 'no-store', signal }, 12000);
  if (!response.ok) throw new Error('官方价格同步失败');
  const data = await response.json() as OfficialModelPricing;
  if (!Array.isArray(data.models) || !data.source || !data.fetchedAt) throw new Error('官方价格数据无效');
  return data;
}
export function findOfficialModelPrice(snapshot: OfficialModelPricing, id: string): OfficialModelPrice | undefined {
  const normalize = (value: string) => value.toLowerCase().replace(/[_ ]/g, '-');
  return snapshot.models.find((model) => [model.id, ...model.aliases].some((alias) => normalize(alias) === normalize(id)));
}
