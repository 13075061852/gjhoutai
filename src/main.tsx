import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyInitialThemeState } from './utils/themeBootstrap';
import './styles/styles.css';
import './styles/layout/responsive.css';

async function bootstrap() {
  applyInitialThemeState();

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element #root was not found.');
  }

  ReactDOM.createRoot(rootElement).render(<ErrorBoundary><App /></ErrorBoundary>);
}

void bootstrap();
