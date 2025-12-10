import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createTelemetryClient } from "@voiceassist/telemetry";
import { App } from "./App";
import i18n from "./i18n";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./styles.css";

// DEBUG: Log at the very start of app execution
console.log("===========================================");
console.log("[main.tsx] === ADMIN PANEL STARTING ===");
console.log("[main.tsx] Timestamp:", new Date().toISOString());
console.log("[main.tsx] window.location.href:", window.location.href);
console.log("[main.tsx] window.location.origin:", window.location.origin);
console.log("[main.tsx] window.location.host:", window.location.host);
console.log("[main.tsx] window.location.pathname:", window.location.pathname);
console.log("[main.tsx] document.referrer:", document.referrer);
console.log("[main.tsx] All VITE_ env vars:", Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')).map(k => `${k}=${import.meta.env[k]}`).join(', '));
console.log("===========================================");

const telemetry = createTelemetryClient({
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  grafanaUrl: import.meta.env.VITE_GRAFANA_ENDPOINT,
  grafanaToken: import.meta.env.VITE_GRAFANA_TOKEN,
  environment: import.meta.env.MODE,
  app: "admin-panel",
});

telemetry.trackWebVitals();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
