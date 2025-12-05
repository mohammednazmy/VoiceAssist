/**
 * Unit tests for RTL (Right-to-Left) Support Utilities
 *
 * Phase 3: Testing - Voice Mode v4
 */

import { describe, it, expect } from "vitest";
import {
  detectTextDirection,
  isRtlLanguage,
  getLanguageDirection,
  getRtlProps,
  convertClassesForDirection,
  formatBidiText,
  containsRtlChars,
  getIconFlip,
  getDirection,
  getRtlFlexStyles,
  cn,
  RTL_LANGUAGES,
} from "../rtl-support";

describe("RTL Support Utilities", () => {
  describe("detectTextDirection", () => {
    it("should detect Arabic text as RTL", () => {
      expect(detectTextDirection("مرحبا بالعالم")).toBe("rtl");
      expect(detectTextDirection("السلام عليكم")).toBe("rtl");
    });

    it("should detect Hebrew text as RTL", () => {
      expect(detectTextDirection("שלום עולם")).toBe("rtl");
    });

    it("should detect English text as LTR", () => {
      expect(detectTextDirection("Hello World")).toBe("ltr");
      expect(detectTextDirection("This is a test")).toBe("ltr");
    });

    it("should use default direction for empty text", () => {
      expect(detectTextDirection("")).toBe("ltr");
      expect(detectTextDirection("   ")).toBe("ltr");
      expect(detectTextDirection("", "rtl")).toBe("rtl");
    });

    it("should handle mixed content by majority", () => {
      // More Arabic than English
      expect(detectTextDirection("مرحبا Hello")).toBe("rtl");
      // More English than Arabic
      expect(detectTextDirection("Hello World مرحبا")).toBe("ltr");
    });

    it("should handle numbers and symbols", () => {
      expect(detectTextDirection("12345")).toBe("ltr");
      expect(detectTextDirection("!@#$%")).toBe("ltr");
    });
  });

  describe("isRtlLanguage", () => {
    it("should return true for RTL language codes", () => {
      expect(isRtlLanguage("ar")).toBe(true);
      expect(isRtlLanguage("he")).toBe(true);
      expect(isRtlLanguage("fa")).toBe(true);
      expect(isRtlLanguage("ur")).toBe(true);
    });

    it("should return false for LTR language codes", () => {
      expect(isRtlLanguage("en")).toBe(false);
      expect(isRtlLanguage("es")).toBe(false);
      expect(isRtlLanguage("zh")).toBe(false);
      expect(isRtlLanguage("hi")).toBe(false);
    });

    it("should handle locale codes with region", () => {
      expect(isRtlLanguage("ar-SA")).toBe(true);
      expect(isRtlLanguage("ar-EG")).toBe(true);
      expect(isRtlLanguage("en-US")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isRtlLanguage("AR")).toBe(true);
      expect(isRtlLanguage("Ar")).toBe(true);
    });
  });

  describe("getLanguageDirection", () => {
    it("should return rtl for RTL languages", () => {
      expect(getLanguageDirection("ar")).toBe("rtl");
      expect(getLanguageDirection("he")).toBe("rtl");
      expect(getLanguageDirection("ur")).toBe("rtl");
    });

    it("should return ltr for LTR languages", () => {
      expect(getLanguageDirection("en")).toBe("ltr");
      expect(getLanguageDirection("fr")).toBe("ltr");
      expect(getLanguageDirection("zh")).toBe("ltr");
    });
  });

  describe("getRtlProps", () => {
    it("should return correct props for RTL", () => {
      const props = getRtlProps("rtl");
      expect(props.dir).toBe("rtl");
      expect(props.className).toContain("rtl");
      expect(props.className).toContain("text-right");
      expect(props.style.direction).toBe("rtl");
      expect(props.style.textAlign).toBe("right");
    });

    it("should return correct props for LTR", () => {
      const props = getRtlProps("ltr");
      expect(props.dir).toBe("ltr");
      expect(props.className).toContain("ltr");
      expect(props.className).toContain("text-left");
      expect(props.style.direction).toBe("ltr");
      expect(props.style.textAlign).toBe("left");
    });
  });

  describe("convertClassesForDirection", () => {
    it("should convert LTR classes to RTL equivalents", () => {
      expect(convertClassesForDirection("text-left", "rtl")).toBe("text-right");
      expect(convertClassesForDirection("pl-4", "rtl")).toBe("pr-4");
      expect(convertClassesForDirection("ml-2", "rtl")).toBe("mr-2");
    });

    it("should not modify classes for LTR direction", () => {
      expect(convertClassesForDirection("text-left pl-4", "ltr")).toBe(
        "text-left pl-4",
      );
    });

    it("should handle multiple classes", () => {
      const result = convertClassesForDirection("text-left pl-4 ml-2", "rtl");
      expect(result).toContain("text-right");
      expect(result).toContain("pr-4");
      expect(result).toContain("mr-2");
    });
  });

  describe("containsRtlChars", () => {
    it("should return true for text with RTL characters", () => {
      expect(containsRtlChars("Hello مرحبا")).toBe(true);
      expect(containsRtlChars("שלום")).toBe(true);
    });

    it("should return false for text without RTL characters", () => {
      expect(containsRtlChars("Hello World")).toBe(false);
      expect(containsRtlChars("12345")).toBe(false);
    });
  });

  describe("formatBidiText", () => {
    it("should wrap RTL text in LTR context", () => {
      const result = formatBidiText("مرحبا", "ltr");
      expect(result).toContain("\u202B"); // RLE
      expect(result).toContain("\u202C"); // PDF
    });

    it("should wrap LTR text in RTL context", () => {
      const result = formatBidiText("Hello", "rtl");
      expect(result).toContain("\u202A"); // LRE
      expect(result).toContain("\u202C"); // PDF
    });

    it("should not wrap text when directions match", () => {
      expect(formatBidiText("Hello", "ltr")).toBe("Hello");
      expect(formatBidiText("مرحبا", "rtl")).toBe("مرحبا");
    });
  });

  describe("getIconFlip", () => {
    it("should return scaleX(-1) for RTL", () => {
      expect(getIconFlip("rtl")).toBe("scaleX(-1)");
    });

    it("should return none for LTR", () => {
      expect(getIconFlip("ltr")).toBe("none");
    });
  });

  describe("getDirection", () => {
    it("should detect direction from text", () => {
      expect(getDirection("مرحبا")).toBe("rtl");
      expect(getDirection("Hello")).toBe("ltr");
    });

    it("should get direction from language code when flagged", () => {
      expect(getDirection("ar", true)).toBe("rtl");
      expect(getDirection("en", true)).toBe("ltr");
    });
  });

  describe("getRtlFlexStyles", () => {
    it("should return row-reverse for RTL", () => {
      const styles = getRtlFlexStyles("rtl");
      expect(styles.flexDirection).toBe("row-reverse");
    });

    it("should return row for LTR", () => {
      const styles = getRtlFlexStyles("ltr");
      expect(styles.flexDirection).toBe("row");
    });

    it("should handle reverse parameter", () => {
      expect(getRtlFlexStyles("ltr", true).flexDirection).toBe("row-reverse");
      expect(getRtlFlexStyles("rtl", true).flexDirection).toBe("row");
    });
  });

  describe("cn utility", () => {
    it("should combine base and direction-specific classes", () => {
      const result = cn("rtl", "base-class", "rtl-class", "ltr-class");
      expect(result).toContain("base-class");
      expect(result).toContain("rtl-class");
      expect(result).not.toContain("ltr-class");
    });

    it("should include LTR classes for LTR direction", () => {
      const result = cn("ltr", "base-class", "rtl-class", "ltr-class");
      expect(result).toContain("base-class");
      expect(result).not.toContain("rtl-class");
      expect(result).toContain("ltr-class");
    });
  });

  describe("RTL_LANGUAGES constant", () => {
    it("should include common RTL languages", () => {
      expect(RTL_LANGUAGES).toContain("ar");
      expect(RTL_LANGUAGES).toContain("he");
      expect(RTL_LANGUAGES).toContain("fa");
      expect(RTL_LANGUAGES).toContain("ur");
    });

    it("should not include LTR languages", () => {
      expect(RTL_LANGUAGES).not.toContain("en");
      expect(RTL_LANGUAGES).not.toContain("zh");
    });
  });
});
