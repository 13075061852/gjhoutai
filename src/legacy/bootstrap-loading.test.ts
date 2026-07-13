import { describe, expect, it } from 'vitest';
import bootstrapSource from './bootstrap.ts?raw';

describe('legacy bootstrap loading order', () => {
  it('does not block navigation rendering on assistant features', () => {
    const coreLoader = bootstrapSource.match(/async function loadCoreLegacyFeatures[\s\S]*?\n}\n/)?.[0] || '';
    expect(coreLoader).toContain("import('./shell/navigation')");
    expect(coreLoader).not.toContain("import('./features/chat')");
    expect(coreLoader).not.toContain("import('./features/agent-butler')");
    expect(bootstrapSource).toContain('startAssistantFeatures(version)');
  });

  it('resets lazy feature initialization during teardown', () => {
    expect(bootstrapSource).toContain('resetLegacyPageFeatures()');
  });
});
