/**
 * RTL (Right-to-Left) Support Utilities for Voice Mode v4
 *
 * Provides utilities for handling RTL languages (Arabic, Hebrew, Urdu, Persian)
 * including text direction detection, CSS helpers, and component props.
 *
 * Phase 2 Deliverable: Multilingual > RAG + RTL
 *
 * @example
 * ```typescript
 * import { detectTextDirection, getRtlProps, RTL_LANGUAGES } from '@/utils/rtl-support';
 *
 * const direction = detectTextDirection('مرحبا بالعالم');
 * // => 'rtl'
 *
 * const props = getRtlProps(direction);
 * // => { dir: 'rtl', className: 'text-right', style: { direction: 'rtl' } }
 * ```
 */

/**
 * Languages that use RTL script
 */
export const RTL_LANGUAGES = [
  "ar", // Arabic
  "he", // Hebrew
  "fa", // Persian/Farsi
  "ur", // Urdu
  "yi", // Yiddish
  "ps", // Pashto
  "sd", // Sindhi
  "ug", // Uyghur
] as const;

export type RtlLanguage = (typeof RTL_LANGUAGES)[number];

/**
 * Text direction
 */
export type TextDirection = "ltr" | "rtl";

/**
 * RTL-aware component props
 */
export interface RtlProps {
  dir: TextDirection;
  className: string;
  style: React.CSSProperties;
}

/**
 * RTL CSS class mappings for common properties
 */
export const RTL_CLASS_MAP = {
  // Text alignment
  "text-left": "text-right",
  "text-right": "text-left",

  // Padding
  "pl-": "pr-",
  "pr-": "pl-",
  "ps-": "pe-",
  "pe-": "ps-",

  // Margin
  "ml-": "mr-",
  "mr-": "ml-",
  "ms-": "me-",
  "me-": "ms-",

  // Flex
  "justify-start": "justify-end",
  "justify-end": "justify-start",
  "items-start": "items-end",
  "items-end": "items-start",

  // Position
  "left-": "right-",
  "right-": "left-",

  // Border
  "border-l-": "border-r-",
  "border-r-": "border-l-",
  "rounded-l-": "rounded-r-",
  "rounded-r-": "rounded-l-",

  // Transforms
  "translate-x-": "-translate-x-",
  "-translate-x-": "translate-x-",
} as const;

/**
 * Unicode ranges for RTL scripts
 */
const RTL_UNICODE_RANGES = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x0800, 0x083f], // Samaritan
  [0x0840, 0x085f], // Mandaic
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew Presentation Forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
] as const;

/**
 * Check if a character code is in an RTL range
 */
function isRtlCharCode(charCode: number): boolean {
  return RTL_UNICODE_RANGES.some(
    ([start, end]) => charCode >= start && charCode <= end,
  );
}

/**
 * Detect the predominant text direction of a string
 * Uses character analysis to determine if text is RTL or LTR
 *
 * @param text - Text to analyze
 * @param defaultDirection - Direction to return if text is ambiguous (default: 'ltr')
 * @returns 'rtl' if text is predominantly RTL, 'ltr' otherwise
 */
export function detectTextDirection(
  text: string,
  defaultDirection: TextDirection = "ltr",
): TextDirection {
  if (!text || text.trim().length === 0) {
    return defaultDirection;
  }

  let rtlCount = 0;
  let ltrCount = 0;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);

    if (isRtlCharCode(charCode)) {
      rtlCount++;
    } else if (
      (charCode >= 0x0041 && charCode <= 0x005a) || // A-Z
      (charCode >= 0x0061 && charCode <= 0x007a) // a-z
    ) {
      ltrCount++;
    }
  }

  // Return RTL if more RTL chars than LTR, otherwise default
  if (rtlCount > ltrCount) {
    return "rtl";
  }

  return ltrCount > 0 ? "ltr" : defaultDirection;
}

/**
 * Check if a language code is RTL
 *
 * @param langCode - Language code (e.g., 'ar', 'en')
 * @returns true if the language uses RTL script
 */
export function isRtlLanguage(langCode: string): boolean {
  const normalizedCode = langCode.toLowerCase().split("-")[0];
  return (RTL_LANGUAGES as readonly string[]).includes(normalizedCode);
}

/**
 * Get the text direction for a given language code
 *
 * @param langCode - Language code (e.g., 'ar', 'en', 'ar-SA')
 * @returns 'rtl' for RTL languages, 'ltr' otherwise
 */
export function getLanguageDirection(langCode: string): TextDirection {
  return isRtlLanguage(langCode) ? "rtl" : "ltr";
}

/**
 * Get RTL-aware props for a component
 *
 * @param direction - Text direction ('rtl' or 'ltr')
 * @returns Props object with dir, className, and style
 */
export function getRtlProps(direction: TextDirection): RtlProps {
  const isRtl = direction === "rtl";

  return {
    dir: direction,
    className: isRtl ? "rtl text-right" : "ltr text-left",
    style: {
      direction,
      textAlign: isRtl ? "right" : "left",
    },
  };
}

/**
 * Convert LTR CSS classes to RTL equivalents
 *
 * @param classes - Space-separated CSS classes
 * @param direction - Target direction
 * @returns Converted CSS classes
 */
export function convertClassesForDirection(
  classes: string,
  direction: TextDirection,
): string {
  if (direction === "ltr") {
    return classes;
  }

  let converted = classes;

  for (const [ltr, rtl] of Object.entries(RTL_CLASS_MAP)) {
    // Create regex that matches the class with optional value (e.g., pl-4)
    const regex = new RegExp(`\\b${ltr.replace("-", "-")}(\\d+)?\\b`, "g");
    converted = converted.replace(regex, (match, value) => {
      return value !== undefined ? `${rtl}${value}` : rtl.replace(/-$/, "");
    });
  }

  return converted;
}

/**
 * Bidirectional text wrapper component props
 */
export interface BidiTextProps {
  text: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  forceDirection?: TextDirection;
}

/**
 * Get CSS custom properties for RTL-aware components
 *
 * @param direction - Text direction
 * @returns CSS custom properties object
 */
export function getRtlCssVars(
  direction: TextDirection,
): Record<string, string> {
  const isRtl = direction === "rtl";

  return {
    "--text-direction": direction,
    "--text-align": isRtl ? "right" : "left",
    "--flex-direction": isRtl ? "row-reverse" : "row",
    "--float-start": isRtl ? "right" : "left",
    "--float-end": isRtl ? "left" : "right",
    "--margin-start": isRtl ? "margin-right" : "margin-left",
    "--margin-end": isRtl ? "margin-left" : "margin-right",
    "--padding-start": isRtl ? "padding-right" : "padding-left",
    "--padding-end": isRtl ? "padding-left" : "padding-right",
    "--border-start": isRtl ? "border-right" : "border-left",
    "--border-end": isRtl ? "border-left" : "border-right",
    "--transform-origin": isRtl ? "right center" : "left center",
  };
}

/**
 * Format mixed LTR/RTL text with proper Unicode control characters
 *
 * @param text - Text that may contain mixed direction content
 * @param baseDirection - Base direction of the container
 * @returns Text with proper bidi embedding characters
 */
export function formatBidiText(
  text: string,
  baseDirection: TextDirection = "ltr",
): string {
  // Unicode directional control characters
  const LRE = "\u202A"; // Left-to-Right Embedding
  const RLE = "\u202B"; // Right-to-Left Embedding
  const PDF = "\u202C"; // Pop Directional Formatting
  const _LRM = "\u200E"; // Left-to-Right Mark (reserved for future use)
  const _RLM = "\u200F"; // Right-to-Left Mark (reserved for future use)

  const detectedDirection = detectTextDirection(text);

  // If directions match, no embedding needed
  if (detectedDirection === baseDirection) {
    return text;
  }

  // Embed text in opposite direction
  if (detectedDirection === "rtl") {
    return `${RLE}${text}${PDF}`;
  }

  return `${LRE}${text}${PDF}`;
}

/**
 * Check if text contains any RTL characters
 *
 * @param text - Text to check
 * @returns true if text contains RTL characters
 */
export function containsRtlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isRtlCharCode(text.charCodeAt(i))) {
      return true;
    }
  }
  return false;
}

/**
 * Get icon flip transform for RTL
 * Some icons should be flipped in RTL (arrows, etc.)
 *
 * @param direction - Text direction
 * @returns CSS transform value
 */
export function getIconFlip(direction: TextDirection): string {
  return direction === "rtl" ? "scaleX(-1)" : "none";
}

/**
 * React hook-compatible direction detector
 * Returns direction based on text content or language code
 *
 * @param content - Text content or language code
 * @param isLanguageCode - Whether content is a language code
 * @returns Text direction
 */
export function getDirection(
  content: string,
  isLanguageCode: boolean = false,
): TextDirection {
  if (isLanguageCode) {
    return getLanguageDirection(content);
  }
  return detectTextDirection(content);
}

/**
 * Style object for RTL-aware flex container
 */
export function getRtlFlexStyles(
  direction: TextDirection,
  reverse: boolean = false,
): React.CSSProperties {
  const isRtl = direction === "rtl";
  const shouldReverse = isRtl !== reverse; // XOR logic

  return {
    display: "flex",
    flexDirection: shouldReverse ? "row-reverse" : "row",
  };
}

/**
 * Get logical CSS properties (margin-inline-start, etc.)
 * For browsers that support CSS logical properties
 */
export function getLogicalStyles(
  startValue: string | number,
  endValue: string | number,
): React.CSSProperties {
  return {
    marginInlineStart: startValue,
    marginInlineEnd: endValue,
    paddingInlineStart: startValue,
    paddingInlineEnd: endValue,
  };
}

/**
 * Utility to combine RTL-aware class names
 *
 * @param direction - Text direction
 * @param baseClasses - Base CSS classes
 * @param rtlClasses - Classes to add for RTL
 * @param ltrClasses - Classes to add for LTR
 * @returns Combined class string
 */
export function cn(
  direction: TextDirection,
  baseClasses: string,
  rtlClasses: string = "",
  ltrClasses: string = "",
): string {
  const directionClasses = direction === "rtl" ? rtlClasses : ltrClasses;
  return `${baseClasses} ${directionClasses}`.trim();
}

export default {
  RTL_LANGUAGES,
  detectTextDirection,
  isRtlLanguage,
  getLanguageDirection,
  getRtlProps,
  convertClassesForDirection,
  getRtlCssVars,
  formatBidiText,
  containsRtlChars,
  getIconFlip,
  getDirection,
  getRtlFlexStyles,
  getLogicalStyles,
  cn,
};
