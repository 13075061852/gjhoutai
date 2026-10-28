// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');
describe('floating sidebar card', () => {
  it('uses a compact expanded width without widening the collapsed rail', () => {
    const base = readFileSync(new URL('./foundation/base.css', import.meta.url), 'utf8');
    expect(base).toContain('--sidebar:200px;');
    expect(base).toContain('.shell.sidebar-collapsed{--sidebar:72px}');
  });
  it('uses the page gutter, full border and matching panel radius without clipping the footer', () => {
    const sidebar = css.match(/\.app \.shell \.sidebar\s*\{([^}]+)\}/)?.[1] || '';
    expect(sidebar).toContain('margin: var(--workspace-page-pad) 0 var(--workspace-page-pad) var(--workspace-page-pad)');
    expect(sidebar).toContain('height: calc(100% - 2 * var(--workspace-page-pad))');
    expect(sidebar).toContain('border: 1px solid var(--sidebar-border)');
    expect(sidebar).toContain('border-radius: 10px');
    expect(sidebar).toContain('overflow: hidden');
  });
  it('keeps the mobile drawer inset and completely offscreen when closed', () => {
    const mobile = css.slice(css.indexOf('/* The phone drawer floats too;'));
    expect(mobile).toContain('@media (max-width: 720px)');
    expect(mobile).toContain('inset: var(--workspace-page-pad) auto var(--workspace-page-pad) var(--workspace-page-pad)');
    expect(mobile).toContain('margin: 0');
    expect(mobile).toContain('height: auto');
    expect(mobile).toContain('transform: translateX(calc(-100% - var(--workspace-page-pad)))');
  });
});
