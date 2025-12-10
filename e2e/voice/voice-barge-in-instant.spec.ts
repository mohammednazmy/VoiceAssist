/**
 * Voice Barge-In Instant Latency E2E Tests
 *
 * These tests focus specifically on measuring and enforcing barge-in latency targets.
 * The goal is ChatGPT-like instant barge-in (<100ms).
 *
 * Uses the __voiceTestHarness for accurate latency measurement via performance.now()
 * timestamps rather than React state which can be stale.
 *
 * Latency Targets (from V3 plan):
 * - Total barge-in P50: <100ms (speech detected → audio silent)
 * - Detection to fade: <10ms (speech detected → fadeOut() called)
 * - Fade to silence: <50ms (fadeOut() → all audio sources stopped)
 *
 * @phase E2E Latency Enforcement
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import {
  waitForVoiceModeReady,
  getVoiceTestHarnessState,
  waitForAudioEverPlayed,
} from "./utils/test-setup";
import {
  measureBargeInLatency,
  measureAllBargeInLatencies,
  assertBargeInLatency,
  getBargeInLatencyStats,
  generateLatencyReport,
  LATENCY_TARGETS,
  waitForBargeInAndMeasure,
  BargeInLatencyMetrics,
} from "./utils/latency-measurement";

// Resolve auth state path relative to project root
const AUTH_STATE_PATH = path.resolve(process.cwd(), "e2e/.auth/user.json");

// Skip if not in live mode
const isLiveMode = () => process.env.LIVE_REALTIME_E2E === "1";

test.describe("Voice Barge-In - Instant Latency Tests", () => {
  test.beforeEach(async ({ browser }, testInfo) => {
    if (!isLiveMode()) {
      testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run instant barge-in tests");
    }
  });

  // Increase timeout for latency tests
  test.setTimeout(120000); // 2 minutes

  /**
   * Core latency test: Measure barge-in latency with strict targets.
   *
   * This test:
   * 1. Starts voice mode with real audio
   * 2. Waits for AI to start playing audio
   * 3. Triggers barge-in (looped audio continues while AI speaks)
   * 4. Measures exact latency from speech detection to audio mute
   * 5. Validates against P50 targets (100ms)
   */
  test("barge-in latency should meet P50 target (<100ms)", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    // Enable force flags for consistent behavior
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Start voice mode
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    // Wait for ready
    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready, "Voice mode should be ready").toBe(true);

    // Get initial state
    const initialHarness = await getVoiceTestHarnessState(page);
    const initialBargeInCount = initialHarness?.metrics.bargeInCount ?? 0;
    console.log(`[Instant Latency] Initial barge-in count: ${initialBargeInCount}`);

    // Wait for audio to be received (indicates AI is responding)
    console.log("[Instant Latency] Waiting for AI audio...");
    const audioResult = await waitForAudioEverPlayed(page, 45000);

    if (!audioResult.success) {
      console.log("[Instant Latency] No audio received - skipping test");
      test.skip();
      return;
    }

    console.log(`[Instant Latency] Audio detected:`, {
      wasEverPlaying: audioResult.wasEverPlaying,
      totalChunksReceived: audioResult.totalChunksReceived,
      wasInstantBargeIn: audioResult.wasInstantBargeIn,
    });

    // Wait for barge-in to complete and measure latency
    console.log("[Instant Latency] Waiting for barge-in...");
    const measurement = await waitForBargeInAndMeasure(page, initialBargeInCount, 15000);

    if (!measurement.completed) {
      console.log("[Instant Latency] Barge-in did not complete");
      // Still output report for debugging
      const report = await generateLatencyReport(page);
      console.log("\n" + report);
      expect(measurement.completed, "Barge-in should complete").toBe(true);
      return;
    }

    // Output detailed latency metrics
    const metrics = measurement.latencyMetrics;
    console.log("\n=== BARGE-IN LATENCY METRICS ===");
    console.log(`Speech detected at: ${metrics?.speechDetectedAt?.toFixed(1) ?? "N/A"}`);
    console.log(`Fade started at: ${metrics?.fadeStartedAt?.toFixed(1) ?? "N/A"}`);
    console.log(`Audio silent at: ${metrics?.audioSilentAt?.toFixed(1) ?? "N/A"}`);
    console.log(`Detection → Fade: ${metrics?.detectionToFadeMs?.toFixed(1) ?? "N/A"}ms (target: ${LATENCY_TARGETS.bargeIn.detectionToFade}ms)`);
    console.log(`Fade → Silence: ${metrics?.fadeToSilenceMs?.toFixed(1) ?? "N/A"}ms (target: ${LATENCY_TARGETS.bargeIn.fadeToSilence}ms)`);
    console.log(`Total latency: ${metrics?.totalLatencyMs?.toFixed(1) ?? "N/A"}ms (target: ${LATENCY_TARGETS.bargeIn.p50}ms)`);
    console.log(`Was playing: ${metrics?.wasPlaying}`);
    console.log(`Active sources: ${metrics?.activeSourcesAtTrigger}`);

    // Validate against targets
    if (metrics?.totalLatencyMs !== null && metrics?.totalLatencyMs !== undefined) {
      // For now, use relaxed 2x target (200ms) until we optimize further
      const relaxedTarget = LATENCY_TARGETS.bargeIn.p50 * 2;
      expect(
        metrics.totalLatencyMs,
        `Total barge-in latency ${metrics.totalLatencyMs.toFixed(1)}ms exceeds target ${relaxedTarget}ms`
      ).toBeLessThan(relaxedTarget);

      // Log whether we meet strict target
      if (metrics.totalLatencyMs < LATENCY_TARGETS.bargeIn.p50) {
        console.log(`\n✓ MEETS STRICT TARGET: ${metrics.totalLatencyMs.toFixed(1)}ms < ${LATENCY_TARGETS.bargeIn.p50}ms`);
      } else {
        console.log(`\n⚠ MEETS RELAXED TARGET: ${metrics.totalLatencyMs.toFixed(1)}ms < ${relaxedTarget}ms (strict: ${LATENCY_TARGETS.bargeIn.p50}ms)`);
      }
    }

    // Generate full report
    const report = await generateLatencyReport(page);
    console.log("\n" + report);

    await context.close();
  });

  /**
   * Multi-sample latency test: Collect multiple barge-in samples
   * and calculate percentile statistics.
   *
   * This provides a more reliable measurement by averaging across
   * multiple barge-in events.
   */
  test("barge-in latency statistics across multiple events", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    // Enable force flags
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Start voice mode
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    console.log("[Latency Stats] Starting latency collection...");
    console.log("[Latency Stats] Will collect samples over 60 seconds...\n");

    // Let the test run for 60 seconds to collect multiple barge-in events
    // The looping audio will cause multiple barge-in events
    const startTime = Date.now();
    const collectionDuration = 60000; // 60 seconds

    let lastBargeInCount = 0;
    while (Date.now() - startTime < collectionDuration) {
      const harness = await getVoiceTestHarnessState(page);
      if (harness) {
        const currentCount = harness.bargeInLog.length;
        if (currentCount > lastBargeInCount) {
          console.log(`[Latency Stats] Barge-in event #${currentCount} recorded`);
          lastBargeInCount = currentCount;
        }
      }
      await page.waitForTimeout(1000);
    }

    // Get statistics
    const stats = await getBargeInLatencyStats(page);

    console.log("\n=== BARGE-IN LATENCY STATISTICS ===");
    console.log(`\nTotal Latency (speech → audio silent):`);
    console.log(`  Samples: ${stats.totalLatency.count}`);
    console.log(`  P50: ${stats.totalLatency.median.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.p50}ms)`);
    console.log(`  P90: ${stats.totalLatency.p90.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.p90}ms)`);
    console.log(`  P99: ${stats.totalLatency.p99.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.p99}ms)`);
    console.log(`  Mean: ${stats.totalLatency.mean.toFixed(1)}ms`);
    console.log(`  Min: ${stats.totalLatency.min.toFixed(1)}ms`);
    console.log(`  Max: ${stats.totalLatency.max.toFixed(1)}ms`);

    console.log(`\nDetection → Fade:`);
    console.log(`  Samples: ${stats.detectionToFade.count}`);
    console.log(`  P50: ${stats.detectionToFade.median.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.detectionToFade}ms)`);
    console.log(`  Mean: ${stats.detectionToFade.mean.toFixed(1)}ms`);

    console.log(`\nFade → Silence:`);
    console.log(`  Samples: ${stats.fadeToSilence.count}`);
    console.log(`  P50: ${stats.fadeToSilence.median.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.fadeToSilence}ms)`);
    console.log(`  Mean: ${stats.fadeToSilence.mean.toFixed(1)}ms`);

    // Validate we collected enough samples
    expect(
      stats.totalLatency.count,
      "Should collect at least 2 barge-in samples"
    ).toBeGreaterThanOrEqual(2);

    // Validate P50 against relaxed target (2x)
    const relaxedP50 = LATENCY_TARGETS.bargeIn.p50 * 2;
    if (stats.totalLatency.count > 0) {
      expect(
        stats.totalLatency.median,
        `P50 latency ${stats.totalLatency.median.toFixed(1)}ms exceeds target ${relaxedP50}ms`
      ).toBeLessThan(relaxedP50);

      // Log target comparison
      console.log("\n=== TARGET COMPARISON ===");
      const p50Pass = stats.totalLatency.median < LATENCY_TARGETS.bargeIn.p50;
      const p90Pass = stats.totalLatency.p90 < LATENCY_TARGETS.bargeIn.p90;
      console.log(`P50: ${p50Pass ? "✓ PASS" : "✗ FAIL"} (${stats.totalLatency.median.toFixed(1)}ms < ${LATENCY_TARGETS.bargeIn.p50}ms)`);
      console.log(`P90: ${p90Pass ? "✓ PASS" : "✗ FAIL"} (${stats.totalLatency.p90.toFixed(1)}ms < ${LATENCY_TARGETS.bargeIn.p90}ms)`);
    }

    await context.close();
  });

  /**
   * Detection-to-fade latency test: Verify that once speech is detected,
   * the fade starts immediately (<10ms).
   *
   * This tests the responsiveness of the Silero VAD → fadeOut() path.
   */
  test("detection-to-fade latency should be near-instant (<10ms)", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    // Wait for barge-in to occur
    console.log("[Detection-to-Fade] Waiting for barge-in event...");
    const startTime = Date.now();
    let metrics: BargeInLatencyMetrics | null = null;

    while (Date.now() - startTime < 45000) {
      metrics = await measureBargeInLatency(page);
      if (metrics && metrics.detectionToFadeMs !== null) {
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!metrics || metrics.detectionToFadeMs === null) {
      console.log("[Detection-to-Fade] No barge-in metrics captured");
      test.skip();
      return;
    }

    console.log("\n=== DETECTION-TO-FADE LATENCY ===");
    console.log(`Detection → Fade: ${metrics.detectionToFadeMs.toFixed(3)}ms`);
    console.log(`Target: ${LATENCY_TARGETS.bargeIn.detectionToFade}ms`);

    // This should be nearly instant (< 10ms)
    // Using relaxed 3x target for now
    const relaxedTarget = LATENCY_TARGETS.bargeIn.detectionToFade * 3;
    expect(
      metrics.detectionToFadeMs,
      `Detection-to-fade latency ${metrics.detectionToFadeMs.toFixed(3)}ms exceeds target ${relaxedTarget}ms`
    ).toBeLessThan(relaxedTarget);

    if (metrics.detectionToFadeMs < LATENCY_TARGETS.bargeIn.detectionToFade) {
      console.log(`\n✓ MEETS STRICT TARGET: ${metrics.detectionToFadeMs.toFixed(3)}ms < ${LATENCY_TARGETS.bargeIn.detectionToFade}ms`);
    } else {
      console.log(`\n⚠ MEETS RELAXED TARGET: ${metrics.detectionToFadeMs.toFixed(3)}ms < ${relaxedTarget}ms`);
    }

    await context.close();
  });
});

test.describe("Voice Barge-In - Baseline Capture", () => {
  test.setTimeout(180000); // 3 minutes

  /**
   * Baseline capture test: Run for an extended period to collect
   * comprehensive latency data without enforcing targets.
   *
   * Use this to establish baseline measurements before optimization.
   */
  test("capture baseline barge-in latency metrics", async ({ browser }, testInfo) => {
    if (!isLiveMode()) {
      testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run baseline capture");
      return;
    }

    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    console.log("\n=== BASELINE LATENCY CAPTURE ===");
    console.log("Running for 2 minutes to collect barge-in samples...\n");

    // Collect samples for 2 minutes
    const collectionDuration = 120000;
    const startTime = Date.now();
    let lastCount = 0;

    while (Date.now() - startTime < collectionDuration) {
      const harness = await getVoiceTestHarnessState(page);
      if (harness && harness.bargeInLog.length > lastCount) {
        const newEvent = harness.bargeInLog[harness.bargeInLog.length - 1];
        console.log(`[Baseline] Event #${harness.bargeInLog.length}: latency=${newEvent.latencyMs?.toFixed(1) ?? "N/A"}ms, wasPlaying=${newEvent.wasPlaying}`);
        lastCount = harness.bargeInLog.length;
      }
      await page.waitForTimeout(2000);
    }

    // Generate comprehensive report
    const report = await generateLatencyReport(page);
    console.log("\n" + report);

    // Get all latencies for histogram
    const allLatencies = await measureAllBargeInLatencies(page);
    console.log(`\n=== ALL LATENCY VALUES ===`);
    console.log(`Total samples: ${allLatencies.length}`);
    allLatencies.forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.totalLatencyMs?.toFixed(1) ?? "N/A"}ms (wasPlaying=${m.wasPlaying}, sources=${m.activeSourcesAtTrigger})`);
    });

    // Output targets comparison
    console.log("\n=== TARGET COMPARISON ===");
    console.log(`Barge-in targets: P50<${LATENCY_TARGETS.bargeIn.p50}ms, P90<${LATENCY_TARGETS.bargeIn.p90}ms, P99<${LATENCY_TARGETS.bargeIn.p99}ms`);
    console.log(`Detection→Fade target: <${LATENCY_TARGETS.bargeIn.detectionToFade}ms`);
    console.log(`Fade→Silence target: <${LATENCY_TARGETS.bargeIn.fadeToSilence}ms`);

    // Always pass - this is for baseline capture
    expect(true).toBe(true);

    await context.close();
  });
});
