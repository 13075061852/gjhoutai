import { describe, expect, it } from 'vitest';
import chatSource from '../chat.ts?raw';
import chatStyles from '../../../styles/pages/dashboard-chat.css?raw';
import configStyles from '../../../styles/pages/config.css?raw';

describe('assistant message output', () => {
  it('renders the answer without token, cost or context metadata', () => {
    expect(chatSource).not.toContain('renderTokenUsage');
    expect(chatSource).not.toContain('ai-token-meta');
    expect(chatStyles).not.toContain('.ai-token-meta');
    expect(configStyles).not.toContain('.ai-token-meta');
  });
});
