import { FormEvent, useEffect, useState } from 'react';
import { LegacyShell } from './pages/LegacyShell';
import { authClient, type AppUser } from './services/auth';
import { hydrateCloudBackedLocalStorage, installCloudBackedLocalStorageSync } from './services/cloud-sync';
import { mountIconParkAdapter } from './utils/iconParkAdapter';

function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const user = await authClient.login(username.trim(), password);
    if (!user) {
      setError('账号或密码不正确');
      setSubmitting(false);
      return;
    }
    onAuthenticated(user);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-kicker">广俊塑料科技</div>
        <h1>后台登录</h1>
        <p>仅限管理员已分配账号的成员进入。</p>
        <form onSubmit={handleSubmit}>
          <label><span>账号</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label><span>密码</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
          {error ? <div className="auth-error">{error}</div> : null}
          <button type="submit" disabled={submitting}>{submitting ? '登录中…' : '登录'}</button>
        </form>
      </section>
    </main>
  );
}

function PasswordResetScreen({ user, onComplete }: { user: AppUser; onComplete: (user: AppUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [error, setError] = useState('');
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const ok = await authClient.changePassword(currentPassword, nextPassword);
    if (!ok) return setError('修改失败，请确认原密码正确，且新密码至少 10 位。');
    onComplete({ ...user, mustChangePassword: false });
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-kicker">首次登录</div>
        <h1>请先修改初始密码</h1>
        <p>完成后才会开放后台数据访问。</p>
        <form onSubmit={handleSubmit}>
          <label><span>当前密码</span><input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required /></label>
          <label><span>新密码</span><input value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} type="password" minLength={10} required /></label>
          {error ? <div className="auth-error">{error}</div> : null}
          <button type="submit">保存新密码</button>
        </form>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  useEffect(() => { void authClient.me().then(setUser); }, []);
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    const cleanupIcons = mountIconParkAdapter();
    void (async () => {
      await hydrateCloudBackedLocalStorage();
      installCloudBackedLocalStorageSync();
      const { bootLegacyApp, teardownLegacyApp } = await import('./legacy/bootstrap');
      if (disposed) return;
      cleanup = await bootLegacyApp();
      const topActions = document.querySelector('.top-actions');
      const accountButton = topActions?.querySelector<HTMLButtonElement>('button[aria-label="账户"]');
      if (accountButton && topActions) {
        accountButton.classList.add('top-auth-account');
        accountButton.textContent = user.displayName || user.username;
        const logoutButton = document.createElement('button');
        logoutButton.className = 'top-auth-logout';
        logoutButton.type = 'button';
        logoutButton.textContent = '退出登录';
        logoutButton.addEventListener('click', async () => {
          await authClient.logout();
          setUser(null);
        });
        topActions.appendChild(logoutButton);
      }
      if (disposed) {
        cleanup?.();
        teardownLegacyApp();
      }
    })();
    return () => {
      disposed = true;
      cleanupIcons();
      cleanup?.();
      void import('./legacy/bootstrap').then(({ teardownLegacyApp }) => teardownLegacyApp());
    };
  }, [user]);

  if (user === undefined) return <main className="auth-shell"><section className="auth-card"><p>正在验证登录状态…</p></section></main>;
  if (!user) return <LoginScreen onAuthenticated={setUser} />;
  if (user.mustChangePassword) return <PasswordResetScreen user={user} onComplete={setUser} />;
  return <LegacyShell />;
}

export default App;
