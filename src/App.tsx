import { type Dispatch, type FormEvent, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { LegacyShell } from './pages/LegacyShell';
import { authClient, type AppUser } from './services/auth';
import { hydrateCloudBackedLocalStorage } from './services/cloud-sync';
import { normalizeSafeAvatarUrl } from './utils/avatarSecurity';
import { mountIconParkAdapter } from './utils/iconParkAdapter';

const DEPARTMENT_LABELS: Record<AppUser['department'], string> = {
  系统管理员: '系统管理员',
  研发部: '研发部',
  测试部: '测试部',
  销售部: '销售部',
  生产部: '生产部',
  生产部主管: '生产部主管',
};

type AuthParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hue: number;
};

type AuthUserState = AppUser | null | undefined;

function AuthParticleTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = canvas?.parentElement;
    if (!canvas || !shell) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrame = 0;
    let particles: AuthParticle[] = [];
    let width = 0;
    let height = 0;
    let lastX = 0;
    let lastY = 0;
    let hasLastPoint = false;

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const addParticle = (x: number, y: number, intensity = 1) => {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.9 * intensity,
        vy: (Math.random() - 0.5) * 0.9 * intensity - 0.15,
        size: 1.2 + Math.random() * 2.6,
        life: 0,
        maxLife: 28 + Math.random() * 24,
        hue: 208 + Math.random() * 16,
      });
      if (particles.length > 110) particles.shift();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches || !finePointer.matches) return;
      const rect = shell.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (!hasLastPoint) {
        lastX = x;
        lastY = y;
        hasLastPoint = true;
      }
      const distance = Math.hypot(x - lastX, y - lastY);
      const steps = Math.min(6, Math.max(1, Math.floor(distance / 12)));
      for (let step = 0; step < steps; step += 1) {
        const progress = step / steps;
        addParticle(lastX + (x - lastX) * progress, lastY + (y - lastY) * progress, Math.min(1.8, 0.8 + distance / 80));
      }
      lastX = x;
      lastY = y;
    };

    const handlePointerLeave = () => {
      hasLastPoint = false;
    };

    const render = () => {
      context.clearRect(0, 0, width, height);
      particles = particles.filter((particle) => particle.life < particle.maxLife);
      for (const particle of particles) {
        particle.life += 1;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        const progress = particle.life / particle.maxLife;
        const alpha = (1 - progress) * 0.55;
        context.beginPath();
        context.fillStyle = `hsla(${particle.hue}, 95%, ${68 + progress * 10}%, ${alpha})`;
        context.arc(particle.x, particle.y, particle.size * (1 - progress * 0.35), 0, Math.PI * 2);
        context.fill();
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    render();
    window.addEventListener('resize', resize);
    shell.addEventListener('pointermove', handlePointerMove);
    shell.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      shell.removeEventListener('pointermove', handlePointerMove);
      shell.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-particle-trail" aria-hidden="true" />;
}

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
      <AuthParticleTrail />
      <section className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-mark">
          <img src="/logo.webp" alt="" />
          <span>广俊塑料科技</span>
        </div>
        <div className="auth-brand-copy">
          <h1>后台管理系统</h1>
          <p>让生产、库存与业务协同更清晰</p>
        </div>
        <img className="auth-brand-image" src="/auth-factory-buildings.webp" alt="" />
      </section>

      <section className="auth-panel-wrap">
        <section className="auth-card">
          <div className="auth-card-heading">
            <h2>欢迎回来</h2>
            <p>仅限已授权成员访问</p>
          </div>
          <form onSubmit={handleSubmit}>
            <label>
              <span>账号</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label>
              <span>密码</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
            <button type="submit" disabled={submitting}>{submitting ? '登录中…' : '登录'}</button>
          </form>
        </section>
      </section>
      <img className="auth-mobile-brand-image" src="/auth-factory-buildings.webp" alt="" aria-hidden="true" />
    </main>
  );
}

function PasswordResetScreen({ user, onComplete }: { user: AppUser; onComplete: Dispatch<SetStateAction<AuthUserState>> }) {
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
      <section className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-mark">
          <img src="/logo.webp" alt="" />
          <span>广俊塑料科技</span>
        </div>
        <div className="auth-brand-copy">
          <h1>后台管理系统</h1>
          <p>先完成一次安全设置，再进入业务工作台</p>
        </div>
        <img className="auth-brand-image" src="/auth-factory-buildings.webp" alt="" />
      </section>

      <section className="auth-panel-wrap">
        <section className="auth-card">
          <div className="auth-card-heading">
            <h2>请先修改初始密码</h2>
            <p>首次登录需要完成安全设置</p>
          </div>
          <form onSubmit={handleSubmit}>
            <label><span>当前密码</span><input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required /></label>
            <label><span>新密码</span><input value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} type="password" minLength={10} required /></label>
            {error ? <div className="auth-error">{error}</div> : null}
            <button type="submit">保存新密码</button>
          </form>
        </section>
      </section>
      <img className="auth-mobile-brand-image" src="/auth-factory-buildings.webp" alt="" aria-hidden="true" />
    </main>
  );
}

function App() {
  const [user, setUser] = useState<AuthUserState>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarUrlRef = useRef<string | null>(null);
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
      if (!disposed && !authClient.hasSessionMarker()) setUser(null);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const refreshCurrentUser = () => {
      void authClient.me().then((nextUser) => {
        if (!disposed && nextUser) setUser(nextUser);
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
    });
    return () => {
      disposed = true;
    };
  }, [user, setManagedAvatarUrl]);
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let cleanup: (() => void) | undefined;
    let cleanupTopActionsPlacement: (() => void) | undefined;
    let disposed = false;
    const cleanupIcons = mountIconParkAdapter();
    window.GJHApp = window.GJHApp || {};
    window.GJHApp.currentUser = user;
    void (async () => {
      const [legacyModule] = await Promise.all([
        import('./legacy/bootstrap'),
        hydrateCloudBackedLocalStorage(),
      ]);
      if (disposed) return;
      const { bootLegacyApp, teardownLegacyApp } = legacyModule;
      cleanup = await bootLegacyApp();
      document.getElementById('shell')?.classList.remove('legacy-shell-booting');
      const topActions = document.querySelector('.top-actions');
      const topActionsHome = topActions?.parentElement ?? null;
      const topActionsNextSibling = topActions?.nextSibling ?? null;
      const sidebarMobileActions = document.querySelector('[data-sidebar-mobile-actions]');
      const mobileActionsQuery = window.matchMedia('(max-width: 980px)');
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
          accountButton.replaceChildren(createAccountAvatar(url));
        };
        renderAccountAvatar(avatarUrl);
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
          const ok = await authClient.uploadAvatar(file);
          avatarButton.disabled = false;
          avatarInput.value = '';
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
          const ok = await authClient.clearAvatar();
          resetAvatarButton.disabled = false;
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
          await authClient.logout();
          setUser(null);
          setManagedAvatarUrl(null);
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
        });
        accountWrap.append(accountButton, menu);
      }
      if (disposed) {
        cleanup?.();
        teardownLegacyApp();
      }
    })();
    return () => {
      disposed = true;
      cleanupTopActionsPlacement?.();
      cleanupIcons();
      cleanup?.();
      void import('./legacy/bootstrap').then(({ teardownLegacyApp }) => teardownLegacyApp());
    };
  }, [user, avatarUrl, setManagedAvatarUrl]);

  if (user === undefined && hasSessionOnLoad) return <LegacyShell booting />;
  if (user === undefined) return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-mark">
          <img src="/logo.webp" alt="" />
          <span>广俊塑料科技</span>
        </div>
        <div className="auth-brand-copy">
          <h1>后台管理系统</h1>
          <p>让生产、库存与业务协同更清晰</p>
        </div>
        <img className="auth-brand-image" src="/auth-factory-buildings.webp" alt="" />
      </section>
      <section className="auth-panel-wrap">
        <section className="auth-card auth-card-loading">
          <div className="auth-card-icon" aria-hidden="true">
            <span className="auth-spinner" />
          </div>
          <div className="auth-card-heading">
            <h2>正在验证登录状态</h2>
            <p>请稍候</p>
          </div>
        </section>
      </section>
      <img className="auth-mobile-brand-image" src="/auth-factory-buildings.webp" alt="" aria-hidden="true" />
    </main>
  );
  if (!user) return <LoginScreen onAuthenticated={setUser} />;
  if (user.mustChangePassword) return <PasswordResetScreen user={user} onComplete={setUser} />;
  return <LegacyShell booting />;
}

export default App;
