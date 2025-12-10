/**
 * useRTL Hook
 * Dedicated RTL support for Voice Mode v4.1
 *
 * Provides RTL-aware utilities for chat components.
 * Reference: docs/voice/rtl-support-guide.md
 */

import { useMemo, useCallback } from "react";

// RTL language codes
const RTL_LANGUAGES = new Set(["ar", "ur", "he", "fa", "ps"]);

export interface RTLInfo {
  isRTL: boolean;
  dir: "rtl" | "ltr";
  textAlign: "right" | "left";
  flexDirection: "row-reverse" | "row";
  marginStart: "marginRight" | "marginLeft";
  marginEnd: "marginLeft" | "marginRight";
  paddingStart: "paddingRight" | "paddingLeft";
  paddingEnd: "paddingLeft" | "paddingRight";
}

export interface UseRTLReturn extends RTLInfo {
  getDir: (text?: string) => "rtl" | "ltr";
  formatMixedContent: (text: string) => string;
  getAriaLabel: (englishLabel: string, rtlLabel: string) => string;
  getLayoutClasses: (baseClasses: string) => string;
}

/**
 * Check if a language code is RTL
 */
export function isRTLLanguage(languageCode?: string): boolean {
  if (!languageCode) return false;
  // Handle locale codes like "ar-SA" -> "ar"
  const baseLang = languageCode.split("-")[0].toLowerCase();
  return RTL_LANGUAGES.has(baseLang);
}

/**
 * Detect RTL from text content using Unicode detection
 */
export function detectRTLFromText(text: string): boolean {
  if (!text) return false;

  // Check for RTL Unicode ranges
  // Arabic: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF
  // Hebrew: \u0590-\u05FF
  // Persian/Urdu: Uses Arabic script
  const rtlPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0590-\u05FF]/;
  const ltrPattern = /[A-Za-z]/;

  const rtlMatch = text.match(rtlPattern);
  const ltrMatch = text.match(ltrPattern);

  // If has RTL characters, check if they appear before LTR
  if (rtlMatch && ltrMatch) {
    return text.indexOf(rtlMatch[0]) < text.indexOf(ltrMatch[0]);
  }

  return !!rtlMatch;
}

/**
 * useRTL Hook
 *
 * Provides comprehensive RTL support utilities for components.
 *
 * @param languageCode - Current language code
 * @returns RTL utilities and state
 */
export function useRTL(languageCode?: string): UseRTLReturn {
  const isRTL = useMemo(() => isRTLLanguage(languageCode), [languageCode]);

  const rtlInfo: RTLInfo = useMemo(
    () => ({
      isRTL,
      dir: isRTL ? "rtl" : "ltr",
      textAlign: isRTL ? "right" : "left",
      flexDirection: isRTL ? "row-reverse" : "row",
      marginStart: isRTL ? "marginRight" : "marginLeft",
      marginEnd: isRTL ? "marginLeft" : "marginRight",
      paddingStart: isRTL ? "paddingRight" : "paddingLeft",
      paddingEnd: isRTL ? "paddingLeft" : "paddingRight",
    }),
    [isRTL],
  );

  /**
   * Get direction for specific text (useful for mixed content)
   */
  const getDir = useCallback(
    (text?: string): "rtl" | "ltr" => {
      if (text) {
        return detectRTLFromText(text) ? "rtl" : "ltr";
      }
      return rtlInfo.dir;
    },
    [rtlInfo.dir],
  );

  /**
   * Format mixed RTL/LTR content with Unicode isolates
   *
   * Wraps LTR content (numbers, English) in isolate marks when in RTL context.
   * This ensures proper rendering of mixed content.
   */
  const formatMixedContent = useCallback(
    (text: string): string => {
      if (!isRTL) return text;

      // Wrap numbers and English text in LTR isolates
      // \u2066 = Left-to-right isolate
      // \u2069 = Pop directional isolate
      return text.replace(
        /(\d+|[A-Za-z]+(?:\s+[A-Za-z]+)*)/g,
        "\u2066$1\u2069",
      );
    },
    [isRTL],
  );

  /**
   * Get appropriate ARIA label based on direction
   */
  const getAriaLabel = useCallback(
    (englishLabel: string, rtlLabel: string): string => {
      return isRTL ? rtlLabel : englishLabel;
    },
    [isRTL],
  );

  /**
   * Get Tailwind classes with RTL variants applied
   */
  const getLayoutClasses = useCallback(
    (baseClasses: string): string => {
      if (!isRTL) return baseClasses;

      // Add RTL-specific class overrides
      const rtlMappings: Record<string, string> = {
        "flex-row": "flex-row-reverse",
        "ml-": "mr-",
        "mr-": "ml-",
        "pl-": "pr-",
        "pr-": "pl-",
        "text-left": "text-right",
        "text-right": "text-left",
        "left-": "right-",
        "right-": "left-",
        "rounded-l-": "rounded-r-",
        "rounded-r-": "rounded-l-",
        "border-l-": "border-r-",
        "border-r-": "border-l-",
      };

      let result = baseClasses;
      for (const [ltr, rtl] of Object.entries(rtlMappings)) {
        result = result.replace(new RegExp(ltr, "g"), rtl);
      }

      return result;
    },
    [isRTL],
  );

  return {
    ...rtlInfo,
    getDir,
    formatMixedContent,
    getAriaLabel,
    getLayoutClasses,
  };
}

/**
 * Hook for per-message RTL detection
 *
 * Useful for chat interfaces where each message may have different direction.
 */
export function useMessageRTL(
  content: string,
  messageLanguage?: string,
): RTLInfo {
  return useMemo(() => {
    // If explicit language is provided, use it
    if (messageLanguage) {
      const isRTL = isRTLLanguage(messageLanguage);
      return {
        isRTL,
        dir: isRTL ? "rtl" : "ltr",
        textAlign: isRTL ? "right" : "left",
        flexDirection: isRTL ? "row-reverse" : "row",
        marginStart: isRTL ? "marginRight" : "marginLeft",
        marginEnd: isRTL ? "marginLeft" : "marginRight",
        paddingStart: isRTL ? "paddingRight" : "paddingLeft",
        paddingEnd: isRTL ? "paddingLeft" : "paddingRight",
      };
    }

    // Otherwise, detect from content
    const isRTL = detectRTLFromText(content);
    return {
      isRTL,
      dir: isRTL ? "rtl" : "ltr",
      textAlign: isRTL ? "right" : "left",
      flexDirection: isRTL ? "row-reverse" : "row",
      marginStart: isRTL ? "marginRight" : "marginLeft",
      marginEnd: isRTL ? "marginLeft" : "marginRight",
      paddingStart: isRTL ? "paddingRight" : "paddingLeft",
      paddingEnd: isRTL ? "paddingLeft" : "paddingRight",
    };
  }, [content, messageLanguage]);
}

export default useRTL;
