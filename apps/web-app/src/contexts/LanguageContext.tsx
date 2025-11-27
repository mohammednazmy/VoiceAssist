/**
 * Language Context
 * Provides language state and RTL support throughout the app
 *
 * Phase 9.1: Multi-language support
 */

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  supportedLanguages,
  getLanguageDirection,
  isRTL,
  type LanguageCode,
} from "../i18n";

interface LanguageContextValue {
  currentLanguage: LanguageCode;
  direction: "ltr" | "rtl";
  isRTL: boolean;
  changeLanguage: (lang: LanguageCode) => Promise<void>;
  supportedLanguages: typeof supportedLanguages;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { i18n } = useTranslation();

  const currentLanguage = (i18n.language || "en") as LanguageCode;
  const direction = getLanguageDirection(currentLanguage);
  const isRightToLeft = isRTL(currentLanguage);

  // Update document attributes when language changes
  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = currentLanguage;

    // Update body class for RTL styling
    if (isRightToLeft) {
      document.body.classList.add("rtl");
      document.body.classList.remove("ltr");
    } else {
      document.body.classList.add("ltr");
      document.body.classList.remove("rtl");
    }
  }, [currentLanguage, direction, isRightToLeft]);

  const changeLanguage = async (lang: LanguageCode) => {
    await i18n.changeLanguage(lang);
  };

  const value: LanguageContextValue = {
    currentLanguage,
    direction,
    isRTL: isRightToLeft,
    changeLanguage,
    supportedLanguages,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error(
      "useLanguageContext must be used within a LanguageProvider",
    );
  }
  return context;
}
