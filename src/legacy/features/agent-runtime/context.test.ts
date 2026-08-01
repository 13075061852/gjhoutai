import { describe, expect, it } from 'vitest';
import { buildAgentContextSnapshot } from './context';

describe('agent context snapshot', () => {
  it('keeps capability context while omitting credentials, confirmation tokens, and image payloads', () => {
    const snapshot = buildAgentContextSnapshot({
      agentButler: {
        getProjectManifest: () => ({ pages: [{ id: 'dashboard' }], apiKey: 'secret-key' }),
        buildContext: () => '业务页面上下文',
        getImages: () => [{ name: 'chart', dataUrl: 'data:image/png;base64,raw-image', authorization: 'Bearer secret' }],
      },
    }, { question: '分析当前页面', activePageId: 'dashboard' });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).toContain('dashboard');
    expect(serialized).toContain('业务页面上下文');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('Bearer secret');
    expect(serialized).not.toContain('data:image/png;base64,raw-image');
  });
});
