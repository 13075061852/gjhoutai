import { FormEvent, useEffect, useRef, useState } from 'react';
import { LegacyShell } from './pages/LegacyShell';
import { authClient, type AppUser } from './services/auth';
import { hydrateCloudBackedLocalStorage, installCloudBackedLocalStorageSync } from './services/cloud-sync';
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
          <img src="/logo.png" alt="" />
          <span>广俊塑料科技</span>
        </div>
        <div className="auth-brand-copy">
          <h1>后台管理系统</h1>
          <p>让生产、库存与业务协同更清晰</p>
        </div>
        <img className="auth-brand-image" src="/auth-factory-buildings.png" alt="" />
      </section>

      <section className="auth-panel-wrap">
        <section className="auth-card">
          <div className="auth-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 10V8a5 5 0 0 1 10 0v2" />
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M12 14v2" />
            </svg>
          </div>
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
      <img className="auth-mobile-brand-image" src="/auth-factory-buildings.png" alt="" aria-hidden="true" />
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
      <section className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-mark">
          <img src="/logo.png" alt="" />
          <span>广俊塑料科技</span>
        </div>
        <div className="auth-brand-copy">
          <h1>后台管理系统</h1>
          <p>先完成一次安全设置，再进入业务工作台</p>
        </div>
        <img className="auth-brand-image" src="/auth-factory-buildings.png" alt="" />
      </section>

      <section className="auth-panel-wrap">
        <section className="auth-card">
          <div className="auth-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3a5 5 0 0 0-5 5v2" />
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M12 14v2" />
            </svg>
          </div>
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
      <img className="auth-mobile-brand-image" src="/auth-factory-buildings.png" alt="" aria-hidden="true" />
    </main>
  );
}

function App() {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasSessionOnLoad] = useState(() => authClient.hasSessionMarker());
  useEffect(() => {
    void authClient.me().then(setUser).catch(() => {
      if (!authClient.hasSessionMarker()) setUser(null);
    });
  }, []);

  useEffect(() => {
    const refreshCurrentUser = () => {
      void authClient.me().then((nextUser) => {
        if (nextUser) setUser(nextUser);
      });
    };
    window.addEventListener('gjh:auth-users-changed', refreshCurrentUser);
    return () => window.removeEventListener('gjh:auth-users-changed', refreshCurrentUser);
  }, []);
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    void authClient.getAvatarUrl().then(setAvatarUrl);
  }, [user]);
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    const cleanupIcons = mountIconParkAdapter();
    window.GJHApp = window.GJHApp || {};
    window.GJHApp.currentUser = user;
    void (async () => {
      await hydrateCloudBackedLocalStorage();
      installCloudBackedLocalStorageSync();
      const { bootLegacyApp, teardownLegacyApp } = await import('./legacy/bootstrap');
      if (disposed) return;
      cleanup = await bootLegacyApp();
      document.getElementById('shell')?.classList.remove('legacy-shell-booting');
      const topActions = document.querySelector('.top-actions');
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
        accountButton.innerHTML = `
          <span class="top-auth-avatar" aria-hidden="true">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="" />` : '<i class="ti ti-user"></i>'}
          </span>
        `;
        const renderAccountAvatar = (url: string | null) => {
          accountButton.innerHTML = `
            <span class="top-auth-avatar" aria-hidden="true">
              ${url ? `<img src="${url}" alt="" />` : '<i class="ti ti-user"></i>'}
            </span>
          `;
        };
        const menu = document.createElement('div');
        menu.className = 'top-auth-panel';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        menu.innerHTML = `
          <div class="top-auth-meta">
            <strong>${user.username}</strong>
            <span>${DEPARTMENT_LABELS[user.department]}</span>
          </div>
        `;
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
          if (!ok) return;
          const previewUrl = URL.createObjectURL(file);
          if (avatarUrl) URL.revokeObjectURL(avatarUrl);
          renderAccountAvatar(previewUrl);
          setAvatarUrl(previewUrl);
        });
        const resetAvatarButton = document.createElement('button');
        resetAvatarButton.className = 'top-auth-menu-item';
        resetAvatarButton.type = 'button';
        resetAvatarButton.textContent = '恢复默认头像';
        resetAvatarButton.addEventListener('click', async () => {
          resetAvatarButton.disabled = true;
          const ok = await authClient.clearAvatar();
          resetAvatarButton.disabled = false;
          if (!ok) return;
          if (avatarUrl) URL.revokeObjectURL(avatarUrl);
          renderAccountAvatar(null);
          setAvatarUrl(null);
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
          setAvatarUrl(null);
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
      cleanupIcons();
      cleanup?.();
      void import('./legacy/bootstrap').then(({ teardownLegacyApp }) => teardownLegacyApp());
    };
  }, [user, avatarUrl]);

  if (user === undefined && hasSessionOnLoad) return <LegacyShell booting={false} />;
  if (user === undefined) return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-mark">
          <img src="/logo.png" alt="" />
          <span>广俊塑料科技</span>
        </div>
        <div className="auth-brand-copy">
          <h1>后台管理系统</h1>
          <p>让生产、库存与业务协同更清晰</p>
        </div>
        <img className="auth-brand-image" src="/auth-factory-buildings.png" alt="" />
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
      <img className="auth-mobile-brand-image" src="/auth-factory-buildings.png" alt="" aria-hidden="true" />
    </main>
  );
  if (!user) return <LoginScreen onAuthenticated={setUser} />;
  if (user.mustChangePassword) return <PasswordResetScreen user={user} onComplete={setUser} />;
  return <LegacyShell />;
}

export default App;
