import { describe, expect, it } from 'vitest';
// @ts-expect-error Tests run in Node; browser app intentionally omits Node typings.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./pages/ai-analysis.css', import.meta.url), 'utf8');
const businessCss = readFileSync(new URL('./pages/ai-business-actions.css', import.meta.url), 'utf8');
import { legacyMarkup } from '../legacy/legacyMarkup';

describe('redesigned AI conversation layout', () => {
  it('aligns history and conversation header dividers with explicit border-box heights', () => {
    expect(css).toMatch(/\.ai-analysis-toolbar \{[^}]*height: 64px;[^}]*min-height: 64px;[^}]*box-sizing: border-box;/);
    expect(css).toMatch(/\.ai-analysis-history-head \{[^}]*height: 64px;[^}]*min-height: 64px;[^}]*box-sizing: border-box;/);
    expect(css).toMatch(/\.ai-analysis-toolbar,\s*\.ai-analysis-history-head \{ height: 56px; min-height: 56px; padding: 5px 16px;/);
  });
  it('widens welcome, messages and composer using one aligned desktop width', () => {
    expect(css).toContain('--ai-conversation-width: 1040px;');
    expect(css).toContain('max-width: var(--ai-conversation-width); margin-block: auto;');
    expect(css).toContain('calc((100% - var(--ai-conversation-width)) / 2)');
    expect(css).toContain('max-width: calc(var(--ai-conversation-width) + 56px); margin-inline: auto;');
  });
  it('uses available flex height rather than stacking viewport-height cards', () => {
    expect(css).toContain('.content:has(> .ai-analysis-page.active)');
    expect(css).toContain('flex: 1 1 0');
    expect(css).not.toContain('height: calc(100vh');
    expect(css).not.toContain('min-height: 380px');
    expect(css).not.toContain('.ai-analysis-side');
  });
  it('keeps mobile prompts vertical and inside the empty state', () => {
    expect(css).toContain('.ai-analysis-samples { grid-template-columns: minmax(0, 1fr)');
    expect(css).not.toContain('.ai-analysis-sample { flex: 0 0 auto; max-width: 260px');
    expect(legacyMarkup).toContain('id="aiAnalysisHistoryBtn"');
    expect(legacyMarkup).toContain('<dialog class="ai-analysis-history"');
    expect(legacyMarkup).not.toContain('试试这个问题');
  });
  it('gives the input its own sizing contract with safe areas and a short placeholder', () => {
    expect(css).toContain('.ai-analysis-composer .ai-analysis-input');
    expect(css).toContain('min-height: 34px');
    expect(css).toContain('font-size: 16px');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(legacyMarkup).toContain('placeholder="描述你想完成的任务…"');
    expect(legacyMarkup).toContain('aria-describedby="aiAnalysisInputHint"');
    expect(legacyMarkup).toContain('aria-label="发送问题"');
  });
  it('aligns composer controls with touch-size targets and passive capability hints', () => {
    expect(css).toContain('width: 44px; height: 44px');
    expect(css).toContain('.ai-analysis-composer .ai-analysis-send:disabled');
    expect(css).toContain('.ai-analysis-capability');
    expect(css).toContain('.ai-analysis-context { display: inline-flex; flex: 1; align-items: center; flex-wrap: wrap');
    expect(legacyMarkup).toContain('按需查询平台数据和联网搜索');
    expect(legacyMarkup).not.toContain('ai-analysis-context-divider');
  });
  it('centres the welcome group safely between the toolbar and composer', () => {
    expect(css).toMatch(/\.ai-analysis-welcome\s*\{[^}]*margin-block: auto/);
    expect(css).toMatch(/\.ai-analysis-empty\s*\{[^}]*flex: 1 1 0;[^}]*align-items: flex-start;[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.ai-analysis-compose-area\s*\{[^}]*flex: 0 0 auto/);
  });
  it('follows the reference with a quiet canvas, centred tasks and flat composer controls', () => {
    expect(legacyMarkup).toContain('今天想完成什么？');
    expect(legacyMarkup).not.toContain('从一个问题开始');
    expect(css).not.toContain('--ai-canvas');
    expect(css).toMatch(/\.ai-analysis-shell\s*\{[^}]*background: var\(--surface\)/);
    expect(legacyMarkup).not.toContain('aiAnalysisModelStatus');
    expect(css).not.toContain('.ai-analysis-status');
    expect(css).toContain('align-items: flex-start; justify-content: center');
    expect(css).toContain('.ai-analysis-sample > .ti { display: block');
    expect(css).toContain('.ai-analysis-send::before');
    expect(css).toContain('.ai-analysis-keyboard-hint { display: none; }');
    expect(css).toContain('box-shadow: none');
    expect(css).toContain('.ai-analysis-state { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-left: 0;');
  });
  it('uses readable confirmation tables without nested vertical JSON scrolling', () => {
    expect(businessCss).toMatch(/\.ai-business-table-scroll\s*\{[^}]*max-width: 100%;[^}]*overflow-x: auto/);
    expect(businessCss).toContain('.ai-business-table-scroll:focus-visible');
    expect(businessCss).toMatch(/\.ai-business-table :is\(th, td\)\s*\{[^}]*text-align: center;[^}]*vertical-align: middle/);
    expect(businessCss).toContain('font-variant-numeric: tabular-nums');
    expect(businessCss).toMatch(/\.ai-business-table\s*\{[^}]*border-collapse: separate;[^}]*border-spacing: 0/);
    expect(businessCss).toMatch(/\.ai-business-table caption\s*\{[^}]*border-bottom: 1px solid var\(--border-2\)/);
    expect(businessCss).toMatch(/\.ai-business-table :is\(th, td\)\s*\{[^}]*border-bottom: 1px solid var\(--border-2\);[^}]*border-right: 1px solid var\(--border-2\)/);
    expect(businessCss).toContain('position: sticky; left: 0;');
    expect(businessCss).toContain('@media (max-width: 720px)');
    expect(businessCss).toContain('@media (max-width: 480px)');
    expect(businessCss).not.toContain('.ai-business-change pre');
    expect(businessCss).not.toContain('max-height: 280px');
  });
  it('keeps evidence compact, tables scrollable and reduced-motion supported', () => {
    expect(css).toContain('.ai-analysis-text table { display: table; width: 100%');
    expect(css).toContain('.ai-analysis-text .markdown-table-wrap');
    expect(css).toContain('overflow-x: auto; overscroll-behavior-x: contain');
    expect(css).toContain('table-layout: auto');
    expect(css).toContain('.ai-code-head');
    expect(css).toContain('.ai-analysis-text blockquote');
    expect(css).toContain('.ai-analysis-text td.ai-number');
    expect(css).toContain('.ai-analysis-text td.ai-number { text-align: center;');
    expect(css).toMatch(/\.ai-analysis-text :is\(th, td\) \{[^}]*text-align: center;/);
    expect(css).toContain('.ai-analysis-text td.ai-cell-long { text-align: left;');
    expect(css).toMatch(/\.ai-analysis-text th \{[^}]*text-align: center;[^}]*border-bottom: 1px solid var\(--border-2\)/);
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('html[data-reduced-motion="1"]');
    expect(css).not.toContain('gradient(');
  });
});
