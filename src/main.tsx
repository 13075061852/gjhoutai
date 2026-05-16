import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyInitialThemeState } from './utils/themeBootstrap';
import { hydrateCloudBackedLocalStorage, installCloudBackedLocalStorageSync } from './services/cloud-sync';
import './styles/styles.css';

async function bootstrap() {
  await hydrateCloudBackedLocalStorage();
  installCloudBackedLocalStorageSync();
  applyInitialThemeState();

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element #root was not found.');
  }

  ReactDOM.createRoot(rootElement).render(<App />);
}

void bootstrap();
