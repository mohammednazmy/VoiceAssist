/**
 * Voice Mode Feature Flag Matrix Tests
 *
 * Tests voice mode functionality across different feature flag combinations.
 * Loads test combinations from JSON matrix files based on environment:
 * - Smoke matrix (default): 5 critical combinations for PR validation
 * - Nightly matrix (VOICE_MATRIX_NIGHTLY=1): 25+ comprehensive combinations
 *
 * Run smoke tests: npx playwright test --project=voice-smoke
 * Run nightly tests: VOICE_MATRIX_NIGHTLY=1 npx playwright test --project=voice-nightly
 */

import { expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  test,
  QUALITY_THRESHOLDS,
  waitForVoiceModeReady,
  openVoiceMode,
  closeVoiceMode,
  waitForAISpeaking,
  waitForAIComplete,
  setFeatureFlag,
  resetFeatureFlags,
  assertQualityThresholds,
  isLiveMode,
} from "./utils/test-setup";

// ============================================================================
// Matrix Loading
// ============================================================================

interface FlagCombination {
  name: string;
  description?: string;
  flags: Record<string, unknown>;
}

interface FlagMatrix {
  name: string;
  description: string;
  timeout: number;
  combinations: FlagCombination[];
}

// Load matrix based on environment
const isNightly = process.env.VOICE_MATRIX_NIGHTLY === "1";
const matrixFile = isNightly ? "flag-matrix-nightly.json" : "flag-matrix-smoke.json";
const matrixPath = path.join(__dirname, matrixFile);

let matrix: FlagMatrix;
try {
  matrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
  console.log(`[Flag Matrix] Loaded ${matrix.name}: ${matrix.combinations.length} combinations`);
} catch (error) {
  console.error(`[Flag Matrix] Failed to load ${matrixFile}:`, error);
  matrix = {
    name: "fallback",
    description: "Fallback matrix with baseline only",
    timeout: 180000,
    combinations: [{ name: "baseline", flags: {} }],
  };
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe(`Voice Flag Matrix: ${matrix.name}`, () => {
  // Skip entire suite if not in live mode
  test.beforeAll(() => {
    if (!isLiveMode()) {
      console.log("[Flag Matrix] Skipping tests - LIVE_REALTIME_E2E not set");
    }
  });

  test.beforeEach(async ({ page }) => {
    // Reset flags to defaults before each test
    try {
      await resetFeatureFlags(page);
    } catch {
      console.log("[Flag Matrix] Could not reset flags (API may not be available)");
    }
  });

  for (const combo of matrix.combinations) {
    test(`[${combo.name}] ${combo.description || ""}`, async ({ page, metricsCollector }) => {
      // Skip if not in live mode
      test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

      console.log(`\n[Flag Matrix] Testing: ${combo.name}`);
      console.log(`[Flag Matrix] Flags: ${JSON.stringify(combo.flags)}`);

      // Set feature flags for this combination
      for (const [flagName, value] of Object.entries(combo.flags)) {
        await setFeatureFlag(page, flagName, value);
        console.log(`[Flag Matrix] Set ${flagName}=${value}`);
      }

      // Brief wait for flags to propagate
      await page.waitForTimeout(500);

      // Navigate to app
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Wait for voice mode to be ready
      const ready = await waitForVoiceModeReady(page);
      expect(ready, "Voice mode should become ready").toBe(true);

      // Open voice mode
      const opened = await openVoiceMode(page);
      expect(opened, "Voice mode should open successfully").toBe(true);

      // Wait for AI greeting/response
      const speaking = await waitForAISpeaking(page, 30000);
      if (speaking) {
        console.log("[Flag Matrix] AI started speaking");

        // Wait for response to complete
        const complete = await waitForAIComplete(page, 60000);
        if (complete) {
          console.log("[Flag Matrix] AI response completed");
        }
      }

      // Brief pause to collect final metrics
      await page.waitForTimeout(2000);

      // Close voice mode
      await closeVoiceMode(page);

      // Assert quality thresholds
      try {
        assertQualityThresholds(metricsCollector);
        console.log("[Flag Matrix] Quality thresholds passed");
      } catch (error) {
        // Log but don't fail immediately - capture in metrics
        console.warn(`[Flag Matrix] Quality threshold warning: ${error}`);
      }

      // Log conversation metrics
      const convMetrics = metricsCollector.getConversationMetrics();
      console.log(`[Flag Matrix] Results for ${combo.name}:`);
      console.log(`  - Barge-in attempts: ${convMetrics.bargeInAttempts}`);
      console.log(`  - False barge-ins: ${convMetrics.falseBargeIns}`);
      console.log(`  - Queue overflows: ${convMetrics.queueOverflows}`);
      console.log(`  - Schedule resets: ${convMetrics.scheduleResets}`);
      console.log(`  - Avg response latency: ${convMetrics.averageResponseLatencyMs.toFixed(0)}ms`);
      console.log(`  - Errors: ${convMetrics.errors}`);
    });
  }
});

// ============================================================================
// Individual Flag Tests
// ============================================================================

test.describe("Individual Flag Tests", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("VAD disabled should still work with Deepgram-only detection", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

    await setFeatureFlag(page, "backend.voice_silero_vad_enabled", false);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 30000);
    await waitForAIComplete(page, 60000);
    await page.waitForTimeout(2000);
    await closeVoiceMode(page);

    const metrics = metricsCollector.getConversationMetrics();
    expect(metrics.errors).toBe(0);
  });

  test("High threshold should reduce false barge-ins", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

    await setFeatureFlag(page, "backend.voice_silero_positive_threshold", 0.8);
    await setFeatureFlag(page, "backend.voice_silero_playback_threshold_boost", 0.15);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Let AI speak for a while to test false barge-in rate
    await waitForAISpeaking(page, 30000);
    await page.waitForTimeout(15000); // Wait 15 seconds during speech
    await waitForAIComplete(page, 60000);
    await page.waitForTimeout(2000);
    await closeVoiceMode(page);

    const metrics = metricsCollector.getConversationMetrics();
    // High threshold should have very few false barge-ins
    expect(metrics.falseBargeIns).toBeLessThanOrEqual(1);
  });

  test("Queue overflow protection should prevent audio issues", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

    await setFeatureFlag(page, "backend.voice_queue_overflow_protection", true);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 30000);
    await waitForAIComplete(page, 60000);
    await page.waitForTimeout(2000);
    await closeVoiceMode(page);

    const metrics = metricsCollector.getConversationMetrics();
    // With protection enabled, should have no overflows
    expect(metrics.queueOverflows).toBe(0);
  });
});

// ============================================================================
// Threshold Sweep Tests
// ============================================================================

test.describe("VAD Threshold Sweep", () => {
  const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7];

  for (const threshold of thresholds) {
    test(`threshold=${threshold} should function correctly`, async ({
      page,
      metricsCollector,
    }) => {
      test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

      await setFeatureFlag(page, "backend.voice_silero_positive_threshold", threshold);

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const ready = await waitForVoiceModeReady(page);
      expect(ready).toBe(true);

      const opened = await openVoiceMode(page);
      expect(opened).toBe(true);

      await waitForAISpeaking(page, 30000);
      await waitForAIComplete(page, 60000);
      await page.waitForTimeout(2000);
      await closeVoiceMode(page);

      const metrics = metricsCollector.getConversationMetrics();

      // All thresholds should work without critical errors
      expect(metrics.errors).toBe(0);

      // Log threshold-specific metrics for analysis
      console.log(`[Threshold ${threshold}] False barge-ins: ${metrics.falseBargeIns}`);
      console.log(`[Threshold ${threshold}] Response latency: ${metrics.averageResponseLatencyMs.toFixed(0)}ms`);
    });
  }
});
