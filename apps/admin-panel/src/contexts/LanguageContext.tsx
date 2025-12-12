import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  getLanguageDirection,
  isRTL,
  supportedLanguages,
  type LanguageCode,
} from "../i18n";

interface LanguageContextValue {
  currentLanguage: LanguageCode;
  direction: "ltr" | "rtl";
  isRTL: boolean;
  changeLanguage: (lang: LanguageCode) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const currentLanguage = (i18n.language || "en") as LanguageCode;
  const direction = getLanguageDirection(currentLanguage);
  const rtl = isRTL(currentLanguage);

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = currentLanguage;
    document.body.classList.toggle("rtl", rtl);
    document.body.classList.toggle("ltr", !rtl);
  }, [currentLanguage, direction, rtl]);

  const changeLanguage = async (lang: LanguageCode): Promise<void> => {
    await i18n.changeLanguage(lang);
  };

  return (
    <LanguageContext.Provider
      value={{ currentLanguage, direction, isRTL: rtl, changeLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return { ...ctx, supportedLanguages };
}
