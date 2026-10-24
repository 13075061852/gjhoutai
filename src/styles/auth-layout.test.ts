import { describe, expect, it } from 'vitest';
// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./pages/auth.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const login = app.slice(app.indexOf('function LoginScreen'), app.indexOf('function PasswordResetScreen'));

describe('focused authentication layout', () => {
  it('removes duplicate access badges, category numbers, and decorative separators', () => {
    expect(login).toContain('<h2>登录工作台</h2>');
    expect(login).not.toContain('WORKSPACE ACCESS');
    expect(login).not.toContain('auth-access-label');
    expect(app).not.toContain('auth-brand__edition');
    expect(app).not.toContain('auth-feature-index');
    expect(css).not.toContain('border-top: 1px solid #ffffff16');
  });
  it('keeps the form narrow on desktop and aligns a single column on tablets', () => {
    expect(css).toContain('width: min(400px, 100%); min-width: 0;');
    expect(css).toContain('@media (max-width: 980px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr;');
    expect(css).toContain('width: min(440px, 100%); gap: 24px;');
    expect(css).toContain('max(28px, calc((100vw - 440px) / 2))');
  });
  it('supports phone text sizing, touch targets, safe area, and scrolling with a keyboard', () => {
    expect(css).toContain('height: 100dvh; min-height: 0; overflow-y: auto;');
    expect(css).toContain('.auth-field__control input { font-size: 16px; }');
    expect(css).toContain('min-height: 46px; min-width: 0;');
    expect(css).toContain('height: 44px; flex: none;');
    expect(css).toContain('max(28px, env(safe-area-inset-bottom))');
  });
  it('preserves authentication, password visibility, autocomplete, and inline error feedback', () => {
    expect(login).toContain('authClient.login(username.trim(), password)');
    expect(login).toContain('autoComplete="username"');
    expect(login).toContain('autoComplete="current-password"');
    expect(login).toContain("type={showPassword ? 'text' : 'password'}");
    expect(login).toContain('aria-pressed={showPassword}');
    expect(login).toContain('className="auth-alert" role="alert"');
    expect(login).toContain('aria-busy={submitting}');
    expect(login).toContain('event.nativeEvent.isComposing');
  });
  it('retains theme variables and avoids hover movement or unnecessary motion', () => {
    expect(css).toContain('background: var(--surface); color: var(--text);');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toContain('translateX');
    expect(css).not.toContain('linear-gradient');
  });
});
