import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { createTelemetryClient } from "@voiceassist/telemetry";
import { installVoiceFlagsDebugHelper } from "./lib/voiceFlagsDebug";

// Initialize i18n before rendering
import "./i18n";

import "./styles.css";

const telemetry = createTelemetryClient({
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  grafanaUrl: import.meta.env.VITE_GRAFANA_ENDPOINT,
  grafanaToken: import.meta.env.VITE_GRAFANA_TOKEN,
  app: "web-app",
});

telemetry.trackWebVitals();

console.log("🔍 main.tsx executing");
console.log("🔍 root element:", document.getElementById("root"));

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("❌ Root element not found!");
  document.body.innerHTML =
    '<div style="padding: 50px; font-family: system-ui;"><h1 style="color: red;">Error: Root element not found</h1><p>The div with id="root" is missing from the HTML.</p></div>';
} else {
  console.log("✅ Root element found, creating React root...");
  try {
    // Install local-only voice feature flag debug helper
    installVoiceFlagsDebugHelper();

    const root = ReactDOM.createRoot(rootElement as HTMLElement);
    console.log("✅ React root created, rendering App...");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    console.log("✅ App render called");
  } catch (error) {
    console.error("❌ Error creating React root:", error);
    document.body.innerHTML =
      '<div style="padding: 50px; font-family: system-ui;"><h1 style="color: red;">Error creating React root</h1><pre>' +
      error +
      "</pre></div>";
  }
}
