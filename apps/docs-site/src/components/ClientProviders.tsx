"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { createTelemetryClient } from "@voiceassist/telemetry";
import i18n, { getLanguageDirection, supportedLanguages } from "@/lib/i18n";
import { LocaleSwitcher } from "@voiceassist/ui";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const direction = getLanguageDirection(i18n.language);
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.language;
  }, []);

  useEffect(() => {
    const telemetry = createTelemetryClient({
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      grafanaUrl: process.env.NEXT_PUBLIC_GRAFANA_ENDPOINT,
      grafanaToken: process.env.NEXT_PUBLIC_GRAFANA_TOKEN,
      environment: process.env.NODE_ENV,
      app: "docs-site",
    });

    telemetry.trackWebVitals();
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Localized Docs
        </div>
        <LocaleSwitcher languages={supportedLanguages} />
      </div>
      {children}
    </I18nextProvider>
  );
}
