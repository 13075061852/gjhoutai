import { describe, expect, it } from 'vitest';

describe('agent butler image attachment routing', () => {
  const loadHelper = async () => {
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.GJHApp = null;
    return import('./agent-butler');
  };

  it('keeps forced current-page image uploads scoped to the active page', async () => {
    const { shouldAttachAgentSkillImages } = await loadHelper();

    expect(shouldAttachAgentSkillImages({
      activePageId: 'spectrum-analysis',
      forceCurrentPage: true,
      skillPageId: 'spectrum-analysis',
    })).toBe(true);

    expect(shouldAttachAgentSkillImages({
      activePageId: 'spectrum-analysis',
      forceCurrentPage: true,
      skillPageId: 'image-cutout',
    })).toBe(false);
  });

  it('allows cross-page image retrieval when current-page scoping is not forced', async () => {
    const { shouldAttachAgentSkillImages } = await loadHelper();

    expect(shouldAttachAgentSkillImages({
      activePageId: 'spectrum-analysis',
      forceCurrentPage: false,
      skillPageId: 'image-cutout',
    })).toBe(true);
  });
});
