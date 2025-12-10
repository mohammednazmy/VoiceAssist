/**
 * useLanguage Hook
 * Manages language state and RTL support
 *
 * Phase 9.1: Multi-language support
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  supportedLanguages,
  getLanguageDirection,
  isRTL,
  type LanguageCode,
} from "../i18n";

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language as LanguageCode;
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

    return () => {
      document.body.classList.remove("rtl", "ltr");
    };
  }, [currentLanguage, direction, isRightToLeft]);

  const changeLanguage = (langCode: LanguageCode) => {
    i18n.changeLanguage(langCode);
  };

  const getLanguageName = (langCode: string) => {
    return (
      supportedLanguages.find((l) => l.code === langCode)?.name || langCode
    );
  };

  return {
    currentLanguage,
    direction,
    isRTL: isRightToLeft,
    changeLanguage,
    getLanguageName,
    supportedLanguages,
  };
}
