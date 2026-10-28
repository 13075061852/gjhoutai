// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshBusinessData } from './refreshBusinessData';
import type { BusinessActionResult } from '../services/business-actions';
const getBatch = vi.hoisted(() => vi.fn());
vi.mock('../services/cloud-storage', () => ({ cloudStorage: { getJsonBatch: getBatch } }));
afterEach(() => { vi.clearAllMocks(); localStorage.clear(); });
const result = (dataset: string) => ({ proposal: { dataset, pageId: 'office-records', status: 'committed' } }) as BusinessActionResult;
describe('AI business writes update the real pages', () => {
  it('refreshes only changed remote state into local cache without writing stale local data back', async () => {
    const refresh = vi.fn();
    window.GJHApp = { officeRecords: { refreshFromLocalStorage: refresh } } as any;
    getBatch.mockResolvedValue({ 'gjh-ash-records-v1': JSON.stringify([{ id: 'ASH-1', name: 'AI新记录' }]) });
    await refreshBusinessData(result('ash_records'));
    expect(getBatch).toHaveBeenCalledWith(['gjh-ash-records-v1']);
    expect(JSON.parse(localStorage.getItem('gjh-ash-records-v1')!)[0].name).toBe('AI新记录');
    expect(refresh).toHaveBeenCalledWith(['gjh-ash-records-v1']);
  });
  it('reloads existing spectrum/property/report modules after the server confirms', async () => {
    const spectrum = vi.fn(), property = vi.fn(), reports = vi.fn();
    window.GJHApp = { spectrumAnalysis: { refresh: spectrum }, propertyAnalysis: { loadData: property }, inspectionReports: { refresh: reports } } as any;
    getBatch.mockResolvedValue({ 'gjh-spectrum-user-images-v2': [], 'gjh-spectrum-edits-v2': {} });
    await refreshBusinessData(result('spectrum_records'));
    await refreshBusinessData(result('property_rows'));
    await refreshBusinessData(result('inspection_reports'));
    expect(spectrum).toHaveBeenCalledOnce(); expect(property).toHaveBeenCalledOnce(); expect(reports).toHaveBeenCalledOnce();
  });
});
