// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { workspaceSidebarMarkup, workspaceTopbarMarkup } from './workspace-markup';
import { assertTrustedLegacyMarkup } from '../../pages/LegacyShell';
import { legacyMarkup } from '../legacyMarkup';

function markupRoot(markup: string) {
  const root = document.createElement('div');
  root.innerHTML = markup;
  return root;
}

describe('workspace presentation contracts', () => {
  it('organizes all seven existing modules into three permission-aware sections', () => {
    const root = markupRoot(workspaceSidebarMarkup);
    expect(root.querySelectorAll('.sidebar-section')).toHaveLength(3);
    expect([...root.querySelectorAll('[data-page]')].map(x => x.getAttribute('data-page'))).toEqual([
      'property-analysis', 'spectrum-analysis', 'inspection-reports', 'ai-analysis',
      'office-records', 'ai-config', 'theme-settings',
    ]);
    root.querySelectorAll('[data-page]').forEach(button => {
      expect(button.getAttribute('aria-label')).toBeTruthy();
      expect(button.getAttribute('type')).toBe('button');
    });
  });

  it('uses the same brain icon for AI navigation and page title instead of a favorite star', () => {
    const root = markupRoot(legacyMarkup);
    expect(root.querySelector('[data-page="ai-analysis"] .ti-brain')).not.toBeNull();
    expect(root.querySelector('.ai-analysis-brand .ti-brain')).not.toBeNull();
    expect(root.querySelector('[data-page="ai-analysis"] .ti-sparkles, .ai-analysis-brand .ti-sparkles')).toBeNull();
  });

  it('omits navigation category captions and the footer introduction without placeholders', () => {
    const root = markupRoot(workspaceSidebarMarkup);
    expect(root.querySelector('.workspace-nav-caption, .workspace-footnote')).toBeNull();
    expect(root.textContent).not.toContain('让材料数据，成为答案');
    expect(root.textContent).not.toContain('研究与检测');
  });

  it('preserves account and responsive navigation without a second AI toggle', () => {
    const root = markupRoot(workspaceSidebarMarkup + workspaceTopbarMarkup);
    ['aiConfigNav', 'sidebarToggle', 'mobileMenuBtn', 'topVisitedPages'].forEach(id => {
      expect(root.querySelectorAll(`#${id}`)).toHaveLength(1);
    });
    expect(root.querySelector('.top-actions > .icon-btn')?.getAttribute('aria-label')).toBe('账户');
    expect(root.querySelector('[data-sidebar-mobile-actions]')).not.toBeNull();
  });

  it('removes the page introduction banner and places content directly after the topbar', () => {
    const root = markupRoot(legacyMarkup);
    expect(root.querySelector('.workspace-heading, .workspace-context, #workspaceTitle, #workspaceDescription')).toBeNull();
    expect(root.querySelector('.topbar')?.nextElementSibling?.classList.contains('content')).toBe(true);
    expect(root.querySelector('#workspaceBreadcrumb')).not.toBeNull();
  });

  it('uses the existing SVG adapter for interface icons, without symbol stand-ins', () => {
    expect(workspaceTopbarMarkup).toContain('ti ti-user');
    expect(workspaceSidebarMarkup + workspaceTopbarMarkup).not.toMatch(/[✦▾★]/u);
    expect(() => assertTrustedLegacyMarkup(legacyMarkup)).not.toThrow();
  });

  it('renders only the rewritten AI page, never the old assistant panel or toggle', () => {
    const root = markupRoot(legacyMarkup);
    expect(root.querySelector('.assistant, #askAiToggle, #chatInput, #chatSendBtn')).toBeNull();
    expect(root.querySelectorAll('[data-page="ai-analysis"]')).toHaveLength(1);
    expect(root.querySelectorAll('#aiAnalysisInput')).toHaveLength(1);
    expect(root.querySelectorAll('#aiAnalysisForm')).toHaveLength(1);
  });

  it('does not expose the removed spectrum view switch', () => {
    const root = markupRoot(legacyMarkup);
    expect(root.querySelector('.spectrum-view-switch, [data-spectrum-view]')).toBeNull();
  });

  it('keeps all composed shell IDs unique', () => {
    const root = markupRoot(legacyMarkup);
    const ids = [...root.querySelectorAll('[id]')].map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
