import { fetchWithTimeout } from '../utils/fetch';

export type BusinessProposal = {
  id: string;
  threadId: string;
  dataset: string;
  operation: 'create' | 'update' | 'delete';
  label: string;
  count: number;
  pageId: string;
  expiresAt: string;
  status: 'pending' | 'committed' | 'cancelled' | 'expired';
  changes: Array<{ id: string; before: unknown; after: unknown }>;
  submitting?: boolean;
  error?: string;
};
export type BusinessActionResult = { proposal: BusinessProposal; changedKeys?: string[]; pageId?: string; replayed?: boolean };
const BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');

export async function submitBusinessAction(id: string, threadId: string, operation: 'commit' | 'cancel'): Promise<BusinessActionResult> {
  const response = await fetchWithTimeout(`${BASE}/api/business-actions/${encodeURIComponent(id)}/${operation}`, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId }),
  }, 30_000);
  const result = await response.json().catch(() => null) as BusinessActionResult & { error?: string } | null;
  if (!response.ok || !result?.proposal?.id) throw new Error(result?.error || '操作未得到服务端确认，请重试；不会重复提交。');
  return result;
}
