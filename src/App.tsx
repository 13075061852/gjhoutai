import { type Dispatch, type FormEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { Attention, ArrowRight, Brain, ChartHistogram, Flask, Key, Lock, PreviewClose, PreviewOpen, Shield, User } from '@icon-park/svg';
import { LegacyShell } from './pages/LegacyShell';
import { Button } from './components/ui/Button';
import { authClient, type AppUser } from './services/auth';
import { hydrateCloudBackedLocalStorage } from './services/cloud-sync';
import { normalizeSafeAvatarUrl } from './utils/avatarSecurity';
import { mountIconParkAdapter } from './utils/iconParkAdapter';

const ASSET_BASE_URL = String(import.meta.env.BASE_URL || '/');
const asset = (name: string): string => `${ASSET_BASE_URL}${name}`;

const DEPARTMENT_LABELS: Record<AppUser['department'], string> = {
  系统管理员: '系统管理员',
  研发部: '研发部',
  测试部: '测试部',
  销售部: '销售部',
  生产部: '生产部',
  生产部主管: '生产部主管',
};

type AuthIconRenderer = (props: {
  size?: string | number;
  strokeWidth?: number;
  theme?: 'outline' | 'filled' | 'two-tone' | 'multi-color';
  fill?: string | string[];
}) => string;

type AuthUserState = AppUser | null | undefined;

const AUTH_HIGHLIGHTS: ReadonlyArray<{ icon: AuthIconRenderer; title: string; note: string }> = [
  { icon: ChartHistogram, title: '物性分析', note: '批次检索、指标对比与报告导出' },
  { icon: Flask, title: '图谱与报告', note: 'DSC / TGA 图谱管理与检测报告归档' },
  { icon: Brain, title: 'Gjun AI 助手', note: '数据问答与联网检索，结论可追溯' },
];

function AuthIcon({ icon, size = 20, strokeWidth = 4, className }: { icon: AuthIconRenderer; size?: number; strokeWidth?: number; className?: string }) {
  const markup = String(icon({ theme: 'outline', size: String(size), strokeWidth })).replace(/^<\?xml[^>]*\?>/, '');
  return (
    <span
      className={['auth-icon', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function AuthBrandPanel({ headline, description }: { headline: ReactNode; description: string }) {
  return (
    <section className="auth-brand">
      <div className="auth-brand__content">
        <div className="auth-brand__logo">
          <img src={asset('logo.webp')} alt="广俊塑料科技" />
          <span className="auth-brand__names">
            <strong>广俊塑料科技</strong>
            <em>GJUN POLYMER</em>
          </span>
        </div>
        <div className="auth-brand__copy">
          <span className="auth-brand__kicker">从材料数据，到可靠决策</span>
          <h1>{headline}</h1>
          <p>{description}</p>
        </div>
        <ul className="auth-brand__features">
          {AUTH_HIGHLIGHTS.map((item) => (
            <li key={item.title}>
              <AuthIcon icon={item.icon} size={22} />
              <div>
                <strong>{item.title}</strong>
                <span>{item.note}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="auth-brand__foot">
          <AuthIcon icon={Shield} size={16} />
          <span>仅限授权成员访问 · 数据留存于公司服务器</span>
        </p>
      </div>
    </section>
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const user = await authClient.login(username.trim(), password);
      if (!user) return setError('账号或密码不正确，或登录尝试过多，请稍后重试');
      onAuthenticated(user);
    } catch {
      setError('无法连接服务器，请检查网络后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <AuthBrandPanel
        headline={<>塑料粒子<br />测试分析平台</>}
        description="物性分析、图谱管理与 AI 协作，一站式连接材料数据。"
      />
      <section className="auth-panel">
        <div className="auth-card">
          <header className="auth-card__head">
            <h2>登录工作台</h2>
            <p>使用管理员分配的工作账号登录</p>
          </header>
          <form
            className="auth-form"
            onSubmit={handleSubmit}
            aria-busy={submitting}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
            }}
          >
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="auth-username">账号</label>
              <span className="auth-field__control">
                <AuthIcon icon={User} className="auth-field__leading" />
                <input
                  id="auth-username"
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="请输入账号"
                  required
                />
              </span>
            </div>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="auth-password">密码</label>
              <span className="auth-field__control">
                <AuthIcon icon={Lock} className="auth-field__leading" />
                <input
                  id="auth-password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  className="auth-field__toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  aria-pressed={showPassword}
                >
                  <AuthIcon icon={showPassword ? PreviewClose : PreviewOpen} size={18} />
                </button>
              </span>
            </div>
            {error ? (
              <div className="auth-alert" role="alert">
                <AuthIcon icon={Attention} size={18} />
                <span>{error}</span>
              </div>
            ) : null}
            <Button type="submit" variant="primary" size="lg" className="auth-submit" loading={submitting}>
              {submitting ? '登录中…' : (
                <>
                  <span>进入工作台</span>
                  <AuthIcon icon={ArrowRight} size={18} />
                </>
              )}
            </Button>
          </form>
          <p className="auth-card__note">首次登录需修改初始密码；忘记密码请联系系统管理员。</p>
        </div>
      </section>
    </main>
  );
}

function PasswordResetScreen({ user, onComplete }: { user: AppUser; onComplete: Dispatch<SetStateAction<AuthUserState>> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (currentPassword === nextPassword) return setError('新密码不能与当前密码相同');
    setSubmitting(true);
    try {
      const ok = await authClient.changePassword(currentPassword, nextPassword);
      if (!ok) return setError('修改失败，请确认原密码正确，且新密码为 10–128 位。');
      onComplete({ ...user, mustChangePassword: false });
    } catch {
      setError('无法连接服务器，请检查网络后重试');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="auth-shell">
      <AuthBrandPanel
        headline={<>先完成一次<br />安全设置</>}
        description="首次登录需要重新设置密码。设置完成后即可进入物性分析、图谱库与 AI 工作台。"
      />
      <section className="auth-panel">
        <div className="auth-card">
          <header className="auth-card__head">
            <span className="auth-card__eyebrow">安全设置</span>
            <h2>请先修改初始密码</h2>
            <p>新密码需为 10–128 位，设置后可用于日常登录</p>
          </header>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="auth-current-password">当前密码</label>
              <span className="auth-field__control">
                <AuthIcon icon={Lock} className="auth-field__leading" />
                <input
                  id="auth-current-password"
                  name="currentPassword"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入当前密码"
                  maxLength={128}
                  required
                />
              </span>
            </div>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="auth-next-password">新密码</label>
              <span className="auth-field__control">
                <AuthIcon icon={Key} className="auth-field__leading" />
                <input
                  id="auth-next-password"
                  name="nextPassword"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="至少 10 位"
                  minLength={10}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  className="auth-field__toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  aria-pressed={showPassword}
                >
                  <AuthIcon icon={showPassword ? PreviewClose : PreviewOpen} size={18} />
                </button>
              </span>
            </div>
            {error ? (
              <div className="auth-alert" role="alert">
                <AuthIcon icon={Attention} size={18} />
                <span>{error}</span>
              </div>
            ) : null}
            <Button type="submit" variant="primary" size="lg" className="auth-submit" loading={submitting}>
              {submitting ? '保存中…' : (
                <>
                  <span>保存并进入系统</span>
                  <AuthIcon icon={ArrowRight} size={18} />
                </>
              )}
            </Button>
          </form>
          <p className="auth-card__note">请勿使用与其他平台相同的密码。</p>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<AuthUserState>(undefined);
  const [startupError, setStartupError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarUrlRef = useRef<string | null>(null);
  const accountAvatarRendererRef = useRef<((url: string | null) => void) | null>(null);
  const [hasSessionOnLoad] = useState(() => authClient.hasSessionMarker());
  const setManagedAvatarUrl = useCallback((nextUrl: string | null) => {
    const previousUrl = avatarUrlRef.current;
    if (previousUrl && previousUrl !== nextUrl) URL.revokeObjectURL(previousUrl);
    avatarUrlRef.current = nextUrl;
    setAvatarUrl(nextUrl);
  }, []);

  useEffect(() => {
    return () => {
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void authClient.me().then((nextUser) => {
      if (!disposed) setUser(nextUser);
    }).catch(() => {
      if (!disposed) setStartupError('暂时无法验证登录状态，请检查网络后重试。');
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const refreshCurrentUser = () => {
      void authClient.me(true).then((nextUser) => {
        if (!disposed) setUser(nextUser);
      }).catch(() => {
        if (!disposed) setStartupError('无法刷新账户状态，请重新验证登录。');
      });
    };
    window.addEventListener('gjh:auth-users-changed', refreshCurrentUser);
    return () => {
      disposed = true;
      window.removeEventListener('gjh:auth-users-changed', refreshCurrentUser);
    };
  }, []);
  useEffect(() => {
    if (!user || user.mustChangePassword) {
      setManagedAvatarUrl(null);
      return;
    }
    let disposed = false;
    void authClient.getAvatarUrl().then((nextUrl) => {
      if (disposed) {
        if (nextUrl) URL.revokeObjectURL(nextUrl);
        return;
      }
      setManagedAvatarUrl(nextUrl);
    }).catch(() => {
      if (!disposed) setManagedAvatarUrl(null);
    });
    return () => {
      disposed = true;
    };
  }, [user, setManagedAvatarUrl]);
  useEffect(() => {
    accountAvatarRendererRef.current?.(avatarUrl);
  }, [avatarUrl]);
  useEffect(() => {
    if (!user || user.mustChangePassword || startupError) return;
    let cleanup: (() => void) | undefined;
    let cleanupTopActionsPlacement: (() => void) | undefined;
    const events = new AbortController();
    let disposed = false;
    const cleanupIcons = mountIconParkAdapter();
    window.GJHApp = window.GJHApp || {};
    window.GJHApp.currentUser = user;
    void hydrateCloudBackedLocalStorage(events.signal).then((result) => {
      if (disposed || !result.changedKeys.length) return;
      window.GJHApp?.officeRecords?.refreshFromLocalStorage?.(result.changedKeys);
    }).catch((error) => {
      console.warn('[startup] Cloud-backed localStorage hydration failed.', error);
    });
    void (async () => {
      const legacyModule = await import('./legacy/bootstrap');
      if (disposed) return;
      const { bootLegacyApp, teardownLegacyApp } = legacyModule;
      cleanup = await bootLegacyApp();
      if (disposed) {
        cleanup?.();
        return;
      }
      document.getElementById('shell')?.classList.remove('legacy-shell-booting');
      const topActions = document.querySelector('.top-actions');
      const topActionsHome = topActions?.parentElement ?? null;
      const topActionsNextSibling = topActions?.nextSibling ?? null;
      const sidebarMobileActions = document.querySelector('[data-sidebar-mobile-actions]');
      // Tablet uses the compact rail, whose mobile action area is hidden.
      // Only move the account actions into the navigation drawer on actual phones.
      const mobileActionsQuery = window.matchMedia('(max-width: 720px)');
      const placeTopActions = () => {
        if (!topActions || !topActionsHome) return;
        if (mobileActionsQuery.matches && sidebarMobileActions) {
          sidebarMobileActions.append(topActions);
          return;
        }
        topActionsHome.insertBefore(topActions, topActionsNextSibling);
      };
      placeTopActions();
      mobileActionsQuery.addEventListener('change', placeTopActions);
      cleanupTopActionsPlacement = () => {
        mobileActionsQuery.removeEventListener('change', placeTopActions);
        if (topActions && topActionsHome) {
          topActionsHome.insertBefore(topActions, topActionsNextSibling);
        }
      };
      const accountButton = topActions?.querySelector<HTMLButtonElement>('.icon-btn');
      if (accountButton && topActions) {
        const accountWrap = document.createElement('div');
        accountWrap.className = 'top-auth-menu';
        accountButton.replaceWith(accountWrap);
        accountButton.className = 'top-auth-trigger';
        accountButton.type = 'button';
        accountButton.setAttribute('aria-haspopup', 'menu');
        accountButton.setAttribute('aria-expanded', 'false');
        accountButton.setAttribute('aria-label', '账户菜单');
        const createAccountAvatar = (url: string | null) => {
          const avatar = document.createElement('span');
          avatar.className = 'top-auth-avatar';
          avatar.setAttribute('aria-hidden', 'true');
          const safeUrl = normalizeSafeAvatarUrl(url, window.location.href);
          if (safeUrl) {
            const image = document.createElement('img');
            image.src = safeUrl;
            image.alt = '';
            avatar.append(image);
          } else {
            const icon = document.createElement('i');
            icon.className = 'ti ti-user';
            avatar.append(icon);
          }
          return avatar;
        };
        const renderAccountAvatar = (url: string | null) => {
          const label = document.createElement('span');
          label.className = 'top-auth-label';
          label.textContent = '账户';
          accountButton.replaceChildren(createAccountAvatar(url), label);
        };
        accountAvatarRendererRef.current = renderAccountAvatar;
        renderAccountAvatar(avatarUrlRef.current);
        const menu = document.createElement('div');
        menu.className = 'top-auth-panel';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        const meta = document.createElement('div');
        meta.className = 'top-auth-meta';
        const username = document.createElement('strong');
        username.textContent = user.username;
        const department = document.createElement('span');
        department.textContent = DEPARTMENT_LABELS[user.department];
        meta.append(username, department);
        menu.append(meta);
        const avatarInput = document.createElement('input');
        avatarInput.type = 'file';
        avatarInput.accept = 'image/png,image/jpeg,image/webp';
        avatarInput.hidden = true;
        const avatarButton = document.createElement('button');
        avatarButton.className = 'top-auth-menu-item';
        avatarButton.type = 'button';
        avatarButton.textContent = '添加头像';
        avatarButton.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', async () => {
          const file = avatarInput.files?.[0];
          if (!file) return;
          avatarButton.disabled = true;
          let ok = false;
          try { ok = await authClient.uploadAvatar(file); }
          catch { window.alert('头像上传失败，请检查网络和图片大小（最大 2MB）。'); }
          finally { avatarButton.disabled = false; avatarInput.value = ''; }
          if (!ok || disposed) return;
          const previewUrl = URL.createObjectURL(file);
          renderAccountAvatar(previewUrl);
          setManagedAvatarUrl(previewUrl);
        });
        const resetAvatarButton = document.createElement('button');
        resetAvatarButton.className = 'top-auth-menu-item';
        resetAvatarButton.type = 'button';
        resetAvatarButton.textContent = '恢复默认头像';
        resetAvatarButton.addEventListener('click', async () => {
          resetAvatarButton.disabled = true;
          let ok = false;
          try { ok = await authClient.clearAvatar(); }
          catch { window.alert('恢复头像失败，请稍后重试。'); }
          finally { resetAvatarButton.disabled = false; }
          if (!ok || disposed) return;
          renderAccountAvatar(null);
          setManagedAvatarUrl(null);
        });
        const logoutButton = document.createElement('button');
        logoutButton.className = 'top-auth-menu-item';
        logoutButton.type = 'button';
        logoutButton.setAttribute('role', 'menuitem');
        logoutButton.textContent = '退出登录';
        logoutButton.addEventListener('click', async () => {
          logoutButton.disabled = true;
          try {
            if (!await authClient.logout()) throw new Error('logout_failed');
            setUser(null);
            setManagedAvatarUrl(null);
            // Reload to discard account-specific legacy module state and event closures.
            window.location.reload();
          } catch {
            window.alert('退出失败，服务器尚未确认会话失效，请重试。');
            logoutButton.disabled = false;
          }
        });
        menu.append(avatarButton, resetAvatarButton, logoutButton, avatarInput);
        accountButton.addEventListener('click', () => {
          const nextOpen = menu.hidden;
          menu.hidden = !nextOpen;
          accountButton.setAttribute('aria-expanded', String(nextOpen));
        });
        document.addEventListener('click', (event) => {
          if (!accountWrap.contains(event.target as Node)) {
            menu.hidden = true;
            accountButton.setAttribute('aria-expanded', 'false');
          }
        }, { signal: events.signal });
        accountWrap.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          menu.hidden = true;
          accountButton.setAttribute('aria-expanded', 'false');
          accountButton.focus();
        }, { signal: events.signal });
        accountWrap.append(accountButton, menu);
      }
      if (disposed) {
        cleanup?.();
        teardownLegacyApp();
      }
    })().catch(() => {
      if (!disposed) setStartupError('页面初始化失败，请重新加载。');
    });
    return () => {
      disposed = true;
      events.abort();
      if (window.GJHApp) delete window.GJHApp.currentUser;
      accountAvatarRendererRef.current = null;
      cleanupTopActionsPlacement?.();
      cleanupIcons();
      cleanup?.();
      void import('./legacy/bootstrap').then(({ teardownLegacyApp }) => teardownLegacyApp());
    };
  }, [user, setManagedAvatarUrl, startupError]);

  if (startupError) return (
    <main className="auth-shell auth-shell--error">
      <section className="auth-card app-error-card" role="alert">
        <span className="auth-card__eyebrow">访问受限</span>
        <h2>暂时无法进入系统</h2>
        <p>{startupError}</p>
        <button className="ui-button ui-button--primary auth-submit" onClick={() => window.location.reload()}>重新加载</button>
      </section>
    </main>
  );
  if (user === undefined && hasSessionOnLoad) return <LegacyShell booting />;
  if (user === undefined) return (
    <main className="auth-shell">
      <AuthBrandPanel
        headline={<>塑料粒子<br />测试分析平台</>}
        description="正在与服务器确认登录状态。完成后将自动进入业务工作台。"
      />
      <section className="auth-panel">
        <div className="auth-card auth-card--status">
          <span className="auth-spinner" aria-hidden="true" />
          <h2>正在验证登录状态</h2>
          <p>请稍候，不要关闭当前页面</p>
        </div>
      </section>
    </main>
  );
  if (!user) return <LoginScreen onAuthenticated={setUser} />;
  if (user.mustChangePassword) return <PasswordResetScreen user={user} onComplete={setUser} />;
  return <LegacyShell booting />;
}

export default App;
