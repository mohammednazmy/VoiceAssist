/**
 * classifyBargeIn Unit Tests
 *
 * Tests barge-in classification logic including:
 * - Backchannel detection (12 languages)
 * - Soft barge detection
 * - Hard barge detection
 * - Duration-based classification
 * - Fuzzy matching tolerance
 *
 * Phase 8.1 - Testing Strategy: Unit Tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  classifyBargeIn,
  isLikelyBackchannel,
  getBackchannelPhrases,
  getSoftBargeKeywords,
  type ClassificationInput,
} from "../classifyBargeIn";
import { DEFAULT_BARGE_IN_CONFIG, type BargeInConfig } from "../types";

// Mock voiceLog to avoid console output during tests
vi.mock("../../../lib/logger", () => ({
  voiceLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("classifyBargeIn", () => {
  const config = DEFAULT_BARGE_IN_CONFIG;

  const createInput = (
    overrides: Partial<ClassificationInput> = {},
  ): ClassificationInput => ({
    transcript: "",
    durationMs: 300,
    language: "en",
    aiWasPlaying: true,
    vadConfidence: 0.8,
    ...overrides,
  });

  describe("backchannel detection", () => {
    it('should classify "uh huh" as backchannel', () => {
      const input = createInput({
        transcript: "uh huh",
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.matchedPhrase).toBe("uh huh");
    });

    it('should classify "yeah" as backchannel', () => {
      const input = createInput({
        transcript: "yeah",
        durationMs: 150,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify "mm hmm" as backchannel', () => {
      const input = createInput({
        transcript: "mm hmm",
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it('should classify "okay" as backchannel', () => {
      const input = createInput({
        transcript: "okay",
        durationMs: 180,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it("should NOT classify backchannel if duration exceeds max", () => {
      const input = createInput({
        transcript: "uh huh",
        durationMs: 600, // Exceeds backchannelMaxDuration (500ms)
      });
      const result = classifyBargeIn(input, config);

      // Should be hard_barge due to duration
      expect(result.classification).not.toBe("backchannel");
    });

    it("should use fuzzy matching for STT errors", () => {
      const input = createInput({
        transcript: "uh hu", // Missing 'h' - Levenshtein distance = 1
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
      expect(result.matchDistance).toBe(1);
    });

    it('should handle case insensitivity ("UH HUH" → backchannel)', () => {
      const input = createInput({
        transcript: "UH HUH",
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });
  });

  describe("multilingual backchannel detection", () => {
    it("should detect Arabic backchannel (نعم)", () => {
      const input = createInput({
        transcript: "نعم",
        durationMs: 200,
        language: "ar",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it("should detect Spanish backchannel (sí)", () => {
      const input = createInput({
        transcript: "sí",
        durationMs: 200,
        language: "es",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it("should detect French backchannel (oui)", () => {
      const input = createInput({
        transcript: "oui",
        durationMs: 200,
        language: "fr",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it("should detect German backchannel (ja)", () => {
      const input = createInput({
        transcript: "ja",
        durationMs: 200,
        language: "de",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it("should detect Chinese backchannel (嗯)", () => {
      const input = createInput({
        transcript: "嗯",
        durationMs: 200,
        language: "zh",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });

    it("should detect Japanese backchannel (はい)", () => {
      const input = createInput({
        transcript: "はい",
        durationMs: 200,
        language: "ja",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("backchannel");
    });
  });

  describe("soft barge detection", () => {
    it('should classify "wait" as soft_barge', () => {
      const input = createInput({
        transcript: "wait",
        durationMs: 250,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("soft_barge");
      expect(result.matchedPhrase).toBe("wait");
    });

    it('should classify "hold on" as soft_barge', () => {
      const input = createInput({
        transcript: "hold on",
        durationMs: 300,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("soft_barge");
    });

    it('should classify "one moment" as soft_barge', () => {
      const input = createInput({
        transcript: "one moment",
        durationMs: 350,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("soft_barge");
    });

    it('should classify "pause" as soft_barge', () => {
      const input = createInput({
        transcript: "pause",
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("soft_barge");
    });

    it("should detect Arabic soft barge (انتظر)", () => {
      const input = createInput({
        transcript: "انتظر",
        durationMs: 250,
        language: "ar",
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("soft_barge");
    });
  });

  describe("hard barge detection", () => {
    it("should classify sustained speech (>300ms) as hard_barge", () => {
      const input = createInput({
        transcript: "actually I wanted to ask about something else",
        durationMs: 500,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("hard_barge");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify longer duration with higher confidence", () => {
      const shortInput = createInput({
        transcript: "I have a question",
        durationMs: 400,
      });
      const longInput = createInput({
        transcript: "I have a question about something very important",
        durationMs: 800,
      });

      const shortResult = classifyBargeIn(shortInput, config);
      const longResult = classifyBargeIn(longInput, config);

      expect(longResult.confidence).toBeGreaterThan(shortResult.confidence);
    });

    it("should treat speech when AI not playing as hard_barge", () => {
      const input = createInput({
        transcript: "hello",
        durationMs: 200,
        aiWasPlaying: false, // AI was not playing
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("hard_barge");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("unclear classification", () => {
    it("should return unclear for empty transcript with short duration", () => {
      const input = createInput({
        transcript: "",
        durationMs: 50, // Very short
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("unclear");
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("should return unclear for ambiguous short speech", () => {
      const input = createInput({
        transcript: "um",
        durationMs: 80,
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("unclear");
    });

    it("should lean soft_barge with moderate VAD confidence", () => {
      const input = createInput({
        transcript: "hmm I see",
        durationMs: 200,
        vadConfidence: 0.6, // Moderate confidence
      });
      const result = classifyBargeIn(input, config);

      expect(result.classification).toBe("soft_barge");
    });
  });

  describe("confidence scoring", () => {
    it("should have high confidence for exact backchannel match", () => {
      const input = createInput({
        transcript: "uh huh",
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should have lower confidence for fuzzy backchannel match", () => {
      const input = createInput({
        transcript: "uh hu", // Fuzzy match
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.confidence).toBeLessThan(0.9);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it("should include match distance for fuzzy matches", () => {
      const input = createInput({
        transcript: "uh hu",
        durationMs: 200,
      });
      const result = classifyBargeIn(input, config);

      expect(result.matchDistance).toBeDefined();
      expect(result.matchDistance).toBeGreaterThan(0);
    });
  });
});

describe("isLikelyBackchannel", () => {
  const backchannelPhrases = DEFAULT_BARGE_IN_CONFIG.backchannelPhrases;

  it("should return true for exact English backchannel", () => {
    expect(isLikelyBackchannel("uh huh", "en", backchannelPhrases)).toBe(true);
    expect(isLikelyBackchannel("yeah", "en", backchannelPhrases)).toBe(true);
    expect(isLikelyBackchannel("okay", "en", backchannelPhrases)).toBe(true);
  });

  it("should be case insensitive", () => {
    expect(isLikelyBackchannel("YEAH", "en", backchannelPhrases)).toBe(true);
    expect(isLikelyBackchannel("Okay", "en", backchannelPhrases)).toBe(true);
  });

  it("should return false for non-backchannel phrases", () => {
    expect(isLikelyBackchannel("hello", "en", backchannelPhrases)).toBe(false);
    expect(
      isLikelyBackchannel("I have a question", "en", backchannelPhrases),
    ).toBe(false);
  });

  it("should return true when phrase is contained in longer text", () => {
    // Short phrases like "yeah" should be detected when contained
    expect(isLikelyBackchannel("yeah okay", "en", backchannelPhrases)).toBe(
      true,
    );
  });
});

describe("getBackchannelPhrases", () => {
  it("should return English backchannel phrases", () => {
    const phrases = getBackchannelPhrases("en", DEFAULT_BARGE_IN_CONFIG);
    expect(phrases).toContain("uh huh");
    expect(phrases).toContain("yeah");
    expect(phrases).toContain("mm hmm");
    expect(phrases).toContain("okay");
  });

  it("should return Arabic backchannel phrases", () => {
    const phrases = getBackchannelPhrases("ar", DEFAULT_BARGE_IN_CONFIG);
    expect(phrases).toContain("نعم");
    expect(phrases).toContain("اها");
  });

  it("should return empty array for unknown language", () => {
    const phrases = getBackchannelPhrases(
      "unknown" as any,
      DEFAULT_BARGE_IN_CONFIG,
    );
    expect(phrases).toEqual([]);
  });
});

describe("getSoftBargeKeywords", () => {
  it("should return English soft barge keywords", () => {
    const keywords = getSoftBargeKeywords("en");
    expect(keywords).toContain("wait");
    expect(keywords).toContain("hold on");
    expect(keywords).toContain("pause");
    expect(keywords).toContain("stop");
  });

  it("should return Arabic soft barge keywords", () => {
    const keywords = getSoftBargeKeywords("ar");
    expect(keywords).toContain("انتظر");
    expect(keywords).toContain("لحظة");
  });

  it("should return empty array for unknown language", () => {
    const keywords = getSoftBargeKeywords("unknown" as any);
    expect(keywords).toEqual([]);
  });
});
