import { describe, expect, it } from 'vitest';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';

const readStyle = (name: string) => readFileSync(new URL(`./pages/${name}`, import.meta.url), 'utf8');

describe('theme settings styles', () => {
  it('keeps the complete theme and font card layout in its own lazy stylesheet', () => {
    const themeStyles = readStyle('theme-settings.css');

    ['.theme-grid', '.theme-settings-panel', '.font-preset-grid', '.font-card', '.theme-card', '.theme-card-swatches']
      .forEach((selector) => expect(themeStyles).toContain(selector));
  });

  it('does not depend on visiting AI call analysis to style theme settings', () => {
    const aiCallStyles = readStyle('ai-call-analysis.css');

    expect(aiCallStyles).not.toContain('.theme-card');
    expect(aiCallStyles).not.toContain('.font-card');
  });
});
