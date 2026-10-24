import { describe, expect, it } from 'vitest';
import bootstrapSource from './bootstrap.ts?raw';

describe('legacy bootstrap loading order', () => {
  it('boots navigation without loading the removed assistant', () => {
    const coreLoader = bootstrapSource.match(/async function loadCoreLegacyFeatures[\s\S]*?\n}\n/)?.[0] || '';
    expect(coreLoader).toContain("import('./shell/navigation')");
    expect(coreLoader).not.toContain("import('./features/chat')");
    expect(coreLoader).not.toContain("import('./features/agent-butler')");
    expect(bootstrapSource).not.toContain('startAssistantFeatures');
    expect(bootstrapSource).not.toContain("import('./features/chat')");
    expect(bootstrapSource).not.toContain("import('./features/agent-butler')");
  });

  it('resets lazy feature initialization during teardown', () => {
    expect(bootstrapSource).toContain('resetLegacyPageFeatures()');
  });
});
