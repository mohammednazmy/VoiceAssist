"use client";

import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { getLanguageDirection, supportedLanguages } from "@/lib/i18n";

/** Simple locale switcher for docs site */
function LocaleSwitcher({
  languages,
}: {
  languages: readonly {
    readonly code: string;
    readonly name: string;
    readonly dir?: string;
  }[];
}) {
  const [currentLang, setCurrentLang] = useState(i18n.language);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    i18n.changeLanguage(newLang);
    setCurrentLang(newLang);
  };

  return (
    <select
      value={currentLang}
      onChange={handleChange}
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.name}
        </option>
      ))}
    </select>
  );
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const direction = getLanguageDirection(i18n.language);
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.language;
  }, []);

  // Telemetry tracking (optional - only if env vars are set)
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "production"
    ) {
      // Web vitals tracking could be added here if needed
      console.log(
        "[docs-site] Telemetry disabled - using standalone docs site",
      );
    }
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
