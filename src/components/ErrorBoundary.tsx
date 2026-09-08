import { Component, type ReactNode } from 'react';
import { Button } from './ui/Button';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="auth-shell">
      <section className="auth-card app-error-card" role="alert">
        <h2>页面暂时无法显示</h2>
        <p>请重新加载后重试。若问题持续出现，请联系管理员。</p>
        <Button variant="primary" onClick={() => window.location.reload()}>重新加载</Button>
      </section>
    </main>;
  }
}
