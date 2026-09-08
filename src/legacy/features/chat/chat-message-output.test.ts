import { describe, expect, it } from 'vitest';
import chatSource from '../chat.ts?raw';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const chatStyles = readFileSync(new URL('../../../styles/pages/dashboard-chat.css', import.meta.url), 'utf8');
const configStyles = readFileSync(new URL('../../../styles/pages/config.css', import.meta.url), 'utf8');

describe('assistant message output', () => {
  it('renders the answer without token, cost or context metadata', () => {
    expect(chatSource).not.toContain('renderTokenUsage');
    expect(chatSource).not.toContain('ai-token-meta');
    expect(chatStyles).not.toContain('.ai-token-meta');
    expect(configStyles).not.toContain('.ai-token-meta');
  });
});
