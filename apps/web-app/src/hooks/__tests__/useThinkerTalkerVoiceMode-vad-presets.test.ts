/**
 * VAD preset + sensitivity mapping tests
 *
 * Covers the pure helper that maps VAD presets and the user's VAD
 * sensitivity slider into Silero threshold/minSpeechMs settings.
 */

import { describe, it, expect } from "vitest";
import { mapVadPresetAndSensitivityToSileroParams } from "../useThinkerTalkerVoiceMode";

describe("mapVadPresetAndSensitivityToSileroParams", () => {
  it("produces more conservative settings for relaxed preset than balanced", () => {
    const base = { positiveThreshold: 0.4, minSpeechMs: 100 };

    const balanced = mapVadPresetAndSensitivityToSileroParams(base, {
      vadPreset: "balanced",
      vadSensitivity: 50,
      personalizedVadThreshold: null,
      vadCustomEnergyThresholdDb: -35,
      vadCustomSilenceDurationMs: 500,
    });

    const relaxed = mapVadPresetAndSensitivityToSileroParams(base, {
      vadPreset: "relaxed",
      vadSensitivity: 50,
      personalizedVadThreshold: null,
      vadCustomEnergyThresholdDb: -25,
      vadCustomSilenceDurationMs: 800,
    });

    // Relaxed preset should generally require stronger evidence
    expect(relaxed.minSpeechMs).toBeGreaterThanOrEqual(balanced.minSpeechMs);
    expect(relaxed.positiveThreshold).toBeGreaterThanOrEqual(
      balanced.positiveThreshold,
    );
  });

  it("honors personalized threshold when provided", () => {
    const base = { positiveThreshold: 0.5, minSpeechMs: 120 };

    const result = mapVadPresetAndSensitivityToSileroParams(base, {
      vadPreset: "balanced",
      vadSensitivity: 50,
      personalizedVadThreshold: 0.3,
      vadCustomEnergyThresholdDb: -35,
      vadCustomSilenceDurationMs: 500,
    });

    // With neutral sensitivity (50), personalized threshold should be used directly
    expect(result.positiveThreshold).toBeCloseTo(0.3, 3);
  });
});

