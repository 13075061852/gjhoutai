// @ts-expect-error Tests run in Node; the browser app omits @types/node.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync(new URL('./pages/config-workspace.css', import.meta.url), 'utf8');
it('distributes the three configuration tabs equally without a vacant fourth column', () => {
  expect(css).toMatch(/\.config-section-nav \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  expect(css).not.toMatch(/\.config-section-nav \{[^}]*grid-template-columns: repeat\(4,/);
});
it('uses name and ID on the left with plain capability metadata on the right, without prices', () => {
  const source = readFileSync(new URL('../legacy/features/config.ts', import.meta.url), 'utf8');
  expect(source).toContain('class="model-dropdown-option-id"');
  expect(source).not.toContain('class="model-dropdown-option-price"');
  expect(css).toMatch(/\.model-dropdown-option-body \{ display: flex; flex-direction: column/);
  expect(css).toMatch(/\.model-dropdown-option \.model-dropdown-option-meta \{[^}]*padding: 0; border: 0;[^}]*background: transparent/);
  expect(css).toContain('.model-dropdown-panel { overflow-x: hidden; }');
});
it('insets the model search icon and reserves input space without intercepting taps', () => {
  expect(css).toMatch(/\.model-dropdown-search > \.ti \{[^}]*position: absolute; left: 22px; top: 50%/);
  expect(css).toMatch(/\.model-dropdown-search > \.ti \{[^}]*pointer-events: none/);
  expect(css).toContain('padding: 0 12px 0 36px;');
  expect(css).toContain('.model-dropdown-search:focus-within > .ti { color: var(--accent); }');
});
