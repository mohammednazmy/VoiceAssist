import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  en: {
    translation: {
      nav: {
        docs: "Docs",
        architecture: "Architecture",
        api: "API",
        github: "GitHub",
      },
    },
  },
  ar: {
    translation: {
      nav: {
        docs: "التوثيق",
        architecture: "الهندسة",
        api: "واجهات البرمجة",
        github: "جيت هاب",
      },
    },
  },
};

export const supportedLanguages = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: supportedLanguages.map((l) => l.code),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export function getLanguageDirection(langCode: string): "ltr" | "rtl" {
  const lang = supportedLanguages.find((lang) => lang.code === langCode);
  return (lang?.dir as "ltr" | "rtl") || "ltr";
}

export default i18n;
