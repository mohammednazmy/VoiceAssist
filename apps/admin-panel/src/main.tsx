import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createTelemetryClient } from '@voiceassist/telemetry';
import { App } from './App';
import i18n from './i18n';
import { LanguageProvider } from './contexts/LanguageContext';
import './styles.css';

const telemetry = createTelemetryClient({
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  grafanaUrl: import.meta.env.VITE_GRAFANA_ENDPOINT,
  grafanaToken: import.meta.env.VITE_GRAFANA_TOKEN,
  environment: import.meta.env.MODE,
  app: 'admin-panel',
});

telemetry.trackWebVitals();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
