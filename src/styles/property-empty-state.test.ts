// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');
const feature = readFileSync(new URL('../legacy/features/property-analysis.ts', import.meta.url), 'utf8');

describe('property empty state', () => {
  it('uses a clean full-panel empty state without a dashed box or redundant footer', () => {
    expect(css).toMatch(/\.analysis-empty \{[^}]*flex: 1 1 auto[^}]*border: 0[^}]*background: var\(--surface\)/);
    expect(css).toContain('.analysis-panel:has(.analysis-empty) .analysis-panel-footer');
    expect(css).toContain('.analysis-panel:has(.analysis-empty) .analysis-select-field { display: none; }');
  });
  it('distinguishes no data from no matches and supports resetting filters', () => {
    expect(feature).toContain("Boolean(state.query.trim() || state.compareOnly)");
    expect(feature).toContain("'没有找到匹配数据' : '暂无物性数据'");
    expect(feature).toContain("emptyAction.dataset.analysisEmptyAction === 'reset'");
    expect(feature).toContain("state.query = '';\n          state.compareOnly = false;\n          state.page = 1;");
    expect(feature).toContain('支持 .xlsx / .xls 文件');
  });
});
