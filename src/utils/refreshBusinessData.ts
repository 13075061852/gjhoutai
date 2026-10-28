import { cloudStorage } from '../services/cloud-storage';
import { getLegacyApp } from '../legacy/core/app-context';
import type { BusinessActionResult } from '../services/business-actions';

const KEYS: Record<string, string[]> = {
  ash_records: ['gjh-ash-records-v1'], office_records: ['gjh-office-records-v1'],
  spectrum_records: ['gjh-spectrum-user-images-v2', 'gjh-spectrum-edits-v2'],
  report_ranges: ['gjh-property-report-ranges-v1'],
};
/** Refresh only affected keys, NEVER write an old local snapshot back over an AI commit. */
export async function refreshBusinessData(result: BusinessActionResult): Promise<void> {
  const keys = KEYS[result.proposal.dataset] || [];
  if (keys.length) {
    const values = await cloudStorage.getJsonBatch(keys);
    for (const key of keys) {
      if (values[key] == null) throw new Error('服务器数据刷新不完整');
      localStorage.setItem(key, typeof values[key] === 'string' ? values[key] as string : JSON.stringify(values[key]));
    }
  }
  const app = getLegacyApp();
  const dataset = result.proposal.dataset;
  if (dataset === 'ash_records' || dataset === 'office_records') {
    app?.officeRecords?.refreshFromLocalStorage?.(keys);
    // Navigation retains warm business DOM; refresh that hidden DOM too, not only its arrays.
    app?.officeRecords?.render?.('office-records');
  }
  if (dataset === 'spectrum_records') await app?.spectrumAnalysis?.refresh?.();
  if (dataset === 'property_rows') await app?.propertyAnalysis?.loadData?.();
  if (dataset === 'report_ranges') { app?.propertyAnalysis?.loadReportRanges?.(); app?.propertyAnalysis?.render?.(); }
  if (dataset === 'inspection_reports') await app?.inspectionReports?.refresh?.();
  window.dispatchEvent(new CustomEvent('gjh:business-data-changed', { detail: { dataset, keys, pageId: result.proposal.pageId } }));
}
