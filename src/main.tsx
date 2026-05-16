import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyInitialThemeState } from './utils/themeBootstrap';
import './styles/styles.css';

async function bootstrap() {
  applyInitialThemeState();

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element #root was not found.');
  }

  ReactDOM.createRoot(rootElement).render(<App />);
}

void bootstrap();
