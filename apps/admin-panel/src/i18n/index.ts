import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ar from "./locales/ar.json";

export const supportedLanguages = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
] as const;

export type LanguageCode = (typeof supportedLanguages)[number]["code"];

export const resources = { en: { translation: en }, ar: { translation: ar } };

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: supportedLanguages.map((l) => l.code),
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "voiceassist-admin-language",
    },
    interpolation: { escapeValue: false },
  });

export function getLanguageDirection(langCode: string): "ltr" | "rtl" {
  const lang = supportedLanguages.find((l) => l.code === langCode);
  return (lang?.dir as "ltr" | "rtl") || "ltr";
}

export function isRTL(langCode: string): boolean {
  return getLanguageDirection(langCode) === "rtl";
}

export default i18n;
