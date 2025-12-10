/**
 * Internationalization (i18n) Configuration
 *
 * This file provides the foundation for multi-language support in VoiceAssist.
 * Currently supports English (default) with scaffolding for future languages.
 *
 * @see docs/client-implementation/WEB_APP_FEATURE_SPECS.md for i18n roadmap
 */

/**
 * Supported locales for VoiceAssist
 *
 * - en: English (default) - Fully supported
 * - ar: Arabic - Planned (medical content, UI)
 * - es: Spanish - Planned (UI only initially)
 * - fr: French - Planned (UI only initially)
 */
export enum SupportedLocale {
  English = "en",
  Arabic = "ar",
  Spanish = "es",
  French = "fr",
}

/**
 * Default locale for the application
 */
export const DEFAULT_LOCALE = SupportedLocale.English;

/**
 * Locale metadata
 */
export interface LocaleMetadata {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  isRTL: boolean;
  dateFormat: string;
  timeFormat: string;
  /** Is this locale fully supported (UI + medical content)? */
  fullySupported: boolean;
}

/**
 * Locale configuration map
 */
export const LOCALE_CONFIG: Record<SupportedLocale, LocaleMetadata> = {
  [SupportedLocale.English]: {
    code: SupportedLocale.English,
    name: "English",
    nativeName: "English",
    direction: "ltr",
    isRTL: false,
    dateFormat: "MM/DD/YYYY",
    timeFormat: "h:mm A",
    fullySupported: true,
  },
  [SupportedLocale.Arabic]: {
    code: SupportedLocale.Arabic,
    name: "Arabic",
    nativeName: "العربية",
    direction: "rtl",
    isRTL: true,
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    fullySupported: false, // Planned for future
  },
  [SupportedLocale.Spanish]: {
    code: SupportedLocale.Spanish,
    name: "Spanish",
    nativeName: "Español",
    direction: "ltr",
    isRTL: false,
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    fullySupported: false, // Planned for future
  },
  [SupportedLocale.French]: {
    code: SupportedLocale.French,
    name: "French",
    nativeName: "Français",
    direction: "ltr",
    isRTL: false,
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    fullySupported: false, // Planned for future
  },
};

/**
 * Get locale metadata
 */
export function getLocaleMetadata(locale: SupportedLocale): LocaleMetadata {
  return LOCALE_CONFIG[locale];
}

/**
 * Get list of fully supported locales
 */
export function getFullySupportedLocales(): SupportedLocale[] {
  return Object.values(SupportedLocale).filter(
    (locale) => LOCALE_CONFIG[locale].fullySupported,
  );
}

/**
 * Validate if a locale is supported
 */
export function isValidLocale(locale: string): locale is SupportedLocale {
  return Object.values(SupportedLocale).includes(locale as SupportedLocale);
}

/**
 * Detect browser locale
 * Falls back to DEFAULT_LOCALE if not supported
 */
export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  const browserLang = navigator.language.split("-")[0]; // e.g., 'en-US' -> 'en'

  if (isValidLocale(browserLang)) {
    return browserLang as SupportedLocale;
  }

  return DEFAULT_LOCALE;
}

/**
 * Get text direction for a locale
 */
export function getTextDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return LOCALE_CONFIG[locale].direction;
}
