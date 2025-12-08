/**
 * Voice Mode Debug & Investigation Tests
 *
 * These tests are designed to help diagnose specific issues:
 * 1. Choppy audio after barge-in
 * 2. AI self-interruption during responses
 * 3. Audio queue overflow issues
 * 4. VAD threshold sensitivity problems
 *
 * Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-debug
 */

import { expect } from "@playwright/test";
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
  isLiveMode,
} from "./utils/test-setup";

// ============================================================================
// Debug Utilities
// ============================================================================

interface AudioQueueSnapshot {
  timestamp: number;
  queueLength: number;
  scheduleTime: number;
  currentTime: number;
}

interface VADEvent {
  timestamp: number;
  type: "speech_start" | "speech_end" | "probability";
  probability?: number;
  threshold?: number;
  isPlaybackActive?: boolean;
}

interface ChunkTimingEvent {
  timestamp: number;
  chunkIndex: number;
  scheduledTime: number;
  actualTime: number;
  drift: number;
}

/**
 * Captures detailed debug data from console logs
 */
function createDebugCapture(page: import("@playwright/test").Page) {
  const audioQueueSnapshots: AudioQueueSnapshot[] = [];
  const vadEvents: VADEvent[] = [];
  const chunkTimings: ChunkTimingEvent[] = [];
  const bargeInEvents: { timestamp: number; type: string; details: string }[] = [];
  const errors: { timestamp: number; message: string }[] = [];

  page.on("console", (msg) => {
    const text = msg.text();
    const now = Date.now();

    // Audio queue state
    if (text.includes("audio_queue") || text.includes("queue_state")) {
      const queueMatch = text.match(/queue_length[:\s]+(\d+)/);
      const scheduleMatch = text.match(/schedule_time[:\s]+([\d.]+)/);
      const currentMatch = text.match(/current_time[:\s]+([\d.]+)/);

      if (queueMatch) {
        audioQueueSnapshots.push({
          timestamp: now,
          queueLength: parseInt(queueMatch[1]),
          scheduleTime: scheduleMatch ? parseFloat(scheduleMatch[1]) : 0,
          currentTime: currentMatch ? parseFloat(currentMatch[1]) : 0,
        });
      }
    }

    // VAD events
    if (text.includes("vad") || text.includes("silero")) {
      if (text.includes("speech_start")) {
        vadEvents.push({ timestamp: now, type: "speech_start" });
      } else if (text.includes("speech_end")) {
        vadEvents.push({ timestamp: now, type: "speech_end" });
      }

      const probMatch = text.match(/probability[:\s]+([\d.]+)/);
      const threshMatch = text.match(/threshold[:\s]+([\d.]+)/);
      if (probMatch) {
        vadEvents.push({
          timestamp: now,
          type: "probability",
          probability: parseFloat(probMatch[1]),
          threshold: threshMatch ? parseFloat(threshMatch[1]) : undefined,
          isPlaybackActive: text.includes("playback_active") || text.includes("during_playback"),
        });
      }
    }

    // Chunk timing
    if (text.includes("chunk_scheduled") || text.includes("chunk_played")) {
      const indexMatch = text.match(/chunk[:\s]+(\d+)/i);
      const scheduledMatch = text.match(/scheduled[:\s]+([\d.]+)/);
      const actualMatch = text.match(/actual[:\s]+([\d.]+)/);
      const driftMatch = text.match(/drift[:\s]+([-\d.]+)/);

      if (indexMatch) {
        chunkTimings.push({
          timestamp: now,
          chunkIndex: parseInt(indexMatch[1]),
          scheduledTime: scheduledMatch ? parseFloat(scheduledMatch[1]) : 0,
          actualTime: actualMatch ? parseFloat(actualMatch[1]) : 0,
          drift: driftMatch ? parseFloat(driftMatch[1]) : 0,
        });
      }
    }

    // Barge-in events
    if (text.includes("barge_in") || text.includes("interruption")) {
      bargeInEvents.push({
        timestamp: now,
        type: text.includes("start") ? "start" : text.includes("complete") ? "complete" : "event",
        details: text,
      });
    }

    // Errors
    if (msg.type() === "error" || text.includes("error") || text.includes("Error")) {
      errors.push({ timestamp: now, message: text });
    }
  });

  return {
    getAudioQueueSnapshots: () => audioQueueSnapshots,
    getVADEvents: () => vadEvents,
    getChunkTimings: () => chunkTimings,
    getBargeInEvents: () => bargeInEvents,
    getErrors: () => errors,
    getSummary: () => ({
      audioQueueSnapshots: audioQueueSnapshots.length,
      vadEvents: vadEvents.length,
      chunkTimings: chunkTimings.length,
      bargeInEvents: bargeInEvents.length,
      errors: errors.length,
    }),
  };
}

// ============================================================================
// Choppy Audio Investigation Tests
// ============================================================================

test.describe("Choppy Audio Debug Tests", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("captures audio buffer state during barge-in", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Capturing audio buffer state during barge-in");

    const debugCapture = createDebugCapture(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Wait for AI to start speaking
    await waitForAISpeaking(page, 20000);

    // Monitor for ~10 seconds during playback
    console.log("[Debug] Monitoring audio buffer state...");
    await page.waitForTimeout(10000);

    // Wait for any barge-in or completion
    await waitForAIComplete(page, 30000);

    await closeVoiceMode(page);

    // Analyze captured data
    const queueSnapshots = debugCapture.getAudioQueueSnapshots();
    const bargeInEvents = debugCapture.getBargeInEvents();
    const errors = debugCapture.getErrors();

    console.log("[Debug] Audio Buffer Analysis:");
    console.log(`  - Queue snapshots captured: ${queueSnapshots.length}`);
    console.log(`  - Barge-in events: ${bargeInEvents.length}`);
    console.log(`  - Errors: ${errors.length}`);

    if (queueSnapshots.length > 0) {
      const avgQueueLength = queueSnapshots.reduce((a, b) => a + b.queueLength, 0) / queueSnapshots.length;
      const maxQueueLength = Math.max(...queueSnapshots.map((s) => s.queueLength));
      const minQueueLength = Math.min(...queueSnapshots.map((s) => s.queueLength));

      console.log(`  - Avg queue length: ${avgQueueLength.toFixed(2)}`);
      console.log(`  - Max queue length: ${maxQueueLength}`);
      console.log(`  - Min queue length: ${minQueueLength}`);

      // Detect sudden drops (potential cause of choppy audio)
      let suddenDrops = 0;
      for (let i = 1; i < queueSnapshots.length; i++) {
        const drop = queueSnapshots[i - 1].queueLength - queueSnapshots[i].queueLength;
        if (drop > 5) {
          suddenDrops++;
          console.log(`  - Sudden drop at ${queueSnapshots[i].timestamp}: ${drop} items`);
        }
      }
      console.log(`  - Sudden drops (>5 items): ${suddenDrops}`);
    }

    if (bargeInEvents.length > 0) {
      console.log("[Debug] Barge-in events:");
      bargeInEvents.forEach((e) => console.log(`  - [${e.timestamp}] ${e.type}: ${e.details.substring(0, 100)}`));
    }

    const convMetrics = metricsCollector.getConversationMetrics();
    expect(convMetrics.queueOverflows).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxQueueOverflows);
  });

  test("analyzes chunk timing consistency", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Analyzing chunk timing consistency");

    const debugCapture = createDebugCapture(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 20000);

    // Longer monitoring period to capture chunk timing variance
    console.log("[Debug] Monitoring chunk timing...");
    await page.waitForTimeout(15000);

    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    // Analyze chunk timing
    const chunkTimings = debugCapture.getChunkTimings();

    console.log("[Debug] Chunk Timing Analysis:");
    console.log(`  - Chunks captured: ${chunkTimings.length}`);

    if (chunkTimings.length > 1) {
      // Calculate intervals between chunks
      const intervals: number[] = [];
      for (let i = 1; i < chunkTimings.length; i++) {
        intervals.push(chunkTimings[i].timestamp - chunkTimings[i - 1].timestamp);
      }

      if (intervals.length > 0) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.map((i) => Math.pow(i - avgInterval, 2)).reduce((a, b) => a + b, 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        console.log(`  - Avg interval: ${avgInterval.toFixed(2)}ms`);
        console.log(`  - Std deviation: ${stdDev.toFixed(2)}ms`);
        console.log(`  - Coefficient of variation: ${((stdDev / avgInterval) * 100).toFixed(1)}%`);

        // Flag high variance (>20% coefficient of variation = potential choppiness)
        const cv = (stdDev / avgInterval) * 100;
        if (cv > 20) {
          console.log(`  - WARNING: High timing variance detected (CV: ${cv.toFixed(1)}%)`);
        }

        // Find outliers
        const outlierThreshold = avgInterval * 0.3; // 30% variance
        const outliers = intervals.filter((i) => Math.abs(i - avgInterval) > outlierThreshold);
        console.log(`  - Outlier intervals: ${outliers.length} (${((outliers.length / intervals.length) * 100).toFixed(1)}%)`);

        // Expect reasonable timing consistency
        expect(outliers.length).toBeLessThan(intervals.length * 0.2); // Max 20% outliers
      }
    }
  });

  test("identifies queue overflow triggers", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Identifying queue overflow triggers");

    // Disable queue protection to observe natural overflow behavior
    await setFeatureFlag(page, "backend.voice_queue_overflow_protection", false);

    const debugCapture = createDebugCapture(page);
    let overflowDetected = false;
    let overflowTimestamp = 0;

    page.on("console", (msg) => {
      if (msg.text().includes("overflow") || msg.text().includes("queue_full")) {
        if (!overflowDetected) {
          overflowDetected = true;
          overflowTimestamp = Date.now();
          console.log(`[Debug] Queue overflow detected at ${overflowTimestamp}`);
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 20000);
    await page.waitForTimeout(15000);
    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    // Re-enable protection
    await setFeatureFlag(page, "backend.voice_queue_overflow_protection", true);

    const queueSnapshots = debugCapture.getAudioQueueSnapshots();

    console.log("[Debug] Queue Overflow Analysis:");
    console.log(`  - Overflow detected: ${overflowDetected}`);

    if (overflowDetected && queueSnapshots.length > 0) {
      // Find queue state leading up to overflow
      const preOverflowSnapshots = queueSnapshots.filter((s) => s.timestamp < overflowTimestamp);
      if (preOverflowSnapshots.length > 0) {
        const lastPreOverflow = preOverflowSnapshots[preOverflowSnapshots.length - 1];
        console.log(`  - Queue length before overflow: ${lastPreOverflow.queueLength}`);
      }
    }

    // Log for analysis even without overflow
    if (queueSnapshots.length > 0) {
      const maxQueue = Math.max(...queueSnapshots.map((s) => s.queueLength));
      console.log(`  - Max queue length observed: ${maxQueue}`);
    }
  });
});

// ============================================================================
// Self-Interruption Investigation Tests
// ============================================================================

test.describe("Self-Interruption Debug Tests", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("captures VAD events during AI playback", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Capturing VAD events during AI playback");

    const debugCapture = createDebugCapture(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Mark when AI starts speaking
    let aiPlaybackStart = 0;
    let aiPlaybackEnd = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();
      if (text.includes("playback_started") || text.includes("ai_speaking_start")) {
        if (aiPlaybackStart === 0) aiPlaybackStart = now;
      }
      if (text.includes("playback_stopped") || text.includes("ai_speaking_end")) {
        aiPlaybackEnd = now;
      }
    });

    await waitForAISpeaking(page, 20000);
    await page.waitForTimeout(15000);
    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    // Analyze VAD events during playback
    const vadEvents = debugCapture.getVADEvents();

    console.log("[Debug] VAD Analysis During Playback:");
    console.log(`  - Total VAD events: ${vadEvents.length}`);
    console.log(`  - Playback window: ${aiPlaybackStart} - ${aiPlaybackEnd}`);

    // Filter for events during playback
    const playbackVADEvents = vadEvents.filter(
      (e) => e.timestamp >= aiPlaybackStart && e.timestamp <= aiPlaybackEnd
    );
    console.log(`  - VAD events during playback: ${playbackVADEvents.length}`);

    // Check probability events during playback
    const probEvents = playbackVADEvents.filter((e) => e.type === "probability" && e.probability !== undefined);

    if (probEvents.length > 0) {
      console.log("[Debug] VAD Probabilities During Playback:");

      // Check if thresholds are boosted correctly
      const highProbEvents = probEvents.filter((e) => e.probability! > 0.5);
      console.log(`  - Events with prob > 0.5: ${highProbEvents.length}`);

      // Check effective threshold during playback
      const eventsWithThreshold = probEvents.filter((e) => e.threshold !== undefined);
      if (eventsWithThreshold.length > 0) {
        const avgThreshold = eventsWithThreshold.reduce((a, b) => a + b.threshold!, 0) / eventsWithThreshold.length;
        console.log(`  - Avg threshold during playback: ${avgThreshold.toFixed(3)}`);

        // Effective threshold should be boosted (default: 0.5 + 0.2 = 0.7)
        const expectedMin = QUALITY_THRESHOLDS.effectivePlaybackThreshold - 0.1;
        if (avgThreshold < expectedMin) {
          console.log(`  - WARNING: Threshold appears too low during playback (expected >= ${expectedMin})`);
        }
      }

      // Check for speech start events during playback (these could cause self-interruption)
      const speechStartsDuringPlayback = playbackVADEvents.filter((e) => e.type === "speech_start");
      console.log(`  - Speech start events during playback: ${speechStartsDuringPlayback.length}`);

      if (speechStartsDuringPlayback.length > 0) {
        console.log("  - WARNING: Speech start detected during AI playback - potential self-interruption source");
      }
    }

    const convMetrics = metricsCollector.getConversationMetrics();
    expect(convMetrics.falseBargeIns).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxFalseBargeIns);
  });

  test("verifies echo suppression effectiveness", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Testing echo suppression effectiveness");

    // Test with different echo suppression modes
    const modes = ["threshold_boost", "pause", "none"];
    const results: Record<string, { speechStarts: number; errors: number }> = {};

    for (const mode of modes) {
      console.log(`\n[Debug] Testing echo suppression mode: ${mode}`);

      await setFeatureFlag(page, "backend.voice_silero_echo_suppression_mode", mode);
      await page.waitForTimeout(500);

      let speechStartsCount = 0;

      page.on("console", (msg) => {
        if (msg.text().includes("speech_start") || msg.text().includes("speech_started")) {
          speechStartsCount++;
        }
      });

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const ready = await waitForVoiceModeReady(page);
      if (!ready) continue;

      const opened = await openVoiceMode(page);
      if (!opened) continue;

      await waitForAISpeaking(page, 20000);
      await page.waitForTimeout(10000);
      await waitForAIComplete(page, 30000);
      await closeVoiceMode(page);

      const convMetrics = metricsCollector.getConversationMetrics();
      results[mode] = {
        speechStarts: speechStartsCount,
        errors: convMetrics.errors,
      };

      console.log(`[Debug] Mode '${mode}' results: ${speechStartsCount} speech starts, ${convMetrics.errors} errors`);
    }

    // Reset to default
    await setFeatureFlag(page, "backend.voice_silero_echo_suppression_mode", "threshold_boost");

    // Compare results
    console.log("\n[Debug] Echo Suppression Comparison:");
    for (const [mode, result] of Object.entries(results)) {
      console.log(`  - ${mode}: ${result.speechStarts} speech starts, ${result.errors} errors`);
    }

    // threshold_boost should have fewer false speech starts than "none"
    if (results["threshold_boost"] && results["none"]) {
      expect(
        results["threshold_boost"].speechStarts,
        "threshold_boost should reduce false speech starts"
      ).toBeLessThanOrEqual(results["none"].speechStarts + 2); // Allow small margin
    }
  });

  test("tests threshold sensitivity impact on self-interruption", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(120000);

    console.log("\n[Debug] Testing threshold sensitivity impact");

    const thresholds = [0.3, 0.5, 0.7];
    const results: Record<number, { bargeInAttempts: number; falseBargeIns: number }> = {};

    for (const threshold of thresholds) {
      console.log(`\n[Debug] Testing threshold: ${threshold}`);

      await setFeatureFlag(page, "backend.voice_silero_positive_threshold", threshold);
      await page.waitForTimeout(500);

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const ready = await waitForVoiceModeReady(page);
      if (!ready) continue;

      const opened = await openVoiceMode(page);
      if (!opened) continue;

      await waitForAISpeaking(page, 20000);
      await page.waitForTimeout(10000);
      await waitForAIComplete(page, 30000);
      await closeVoiceMode(page);

      const convMetrics = metricsCollector.getConversationMetrics();
      results[threshold] = {
        bargeInAttempts: convMetrics.bargeInAttempts,
        falseBargeIns: convMetrics.falseBargeIns,
      };

      console.log(
        `[Debug] Threshold ${threshold}: ${convMetrics.bargeInAttempts} attempts, ${convMetrics.falseBargeIns} false`
      );
    }

    // Reset to default
    await setFeatureFlag(page, "backend.voice_silero_positive_threshold", 0.5);

    console.log("\n[Debug] Threshold Sensitivity Summary:");
    for (const [threshold, result] of Object.entries(results)) {
      console.log(`  - ${threshold}: ${result.bargeInAttempts} attempts, ${result.falseBargeIns} false barge-ins`);
    }

    // Higher threshold should generally have fewer false barge-ins
    if (results[0.7] && results[0.3]) {
      expect(
        results[0.7].falseBargeIns,
        "Higher threshold should have fewer or equal false barge-ins"
      ).toBeLessThanOrEqual(results[0.3].falseBargeIns + 1);
    }
  });
});

// ============================================================================
// Schedule Reset Investigation
// ============================================================================

test.describe("Schedule Reset Debug Tests", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("monitors schedule watchdog behavior", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Monitoring schedule watchdog behavior");

    let watchdogTriggers = 0;
    let scheduleResets = 0;
    const watchdogEvents: { timestamp: number; reason: string }[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();

      if (text.includes("watchdog")) {
        watchdogTriggers++;
        watchdogEvents.push({
          timestamp: now,
          reason: text.substring(0, 150),
        });
      }

      if (text.includes("schedule_reset") || text.includes("resetSchedule")) {
        scheduleResets++;
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 20000);
    await page.waitForTimeout(15000);
    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    console.log("[Debug] Watchdog Analysis:");
    console.log(`  - Watchdog triggers: ${watchdogTriggers}`);
    console.log(`  - Schedule resets: ${scheduleResets}`);

    if (watchdogEvents.length > 0) {
      console.log("[Debug] Watchdog events:");
      watchdogEvents.forEach((e) => console.log(`  - [${e.timestamp}] ${e.reason}`));
    }

    const convMetrics = metricsCollector.getConversationMetrics();
    expect(convMetrics.scheduleResets).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxScheduleResets);
  });

  test("tests schedule recovery after forced interruption", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Testing schedule recovery after interruption");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // First AI response
    await waitForAISpeaking(page, 20000);
    await page.waitForTimeout(3000);

    // Force interruption scenario (simulate rapid state change)
    console.log("[Debug] Simulating interruption...");
    await page.waitForTimeout(5000);

    // Check if schedule recovers for second response
    console.log("[Debug] Checking schedule recovery...");
    const secondResponse = await waitForAISpeaking(page, 20000);

    if (secondResponse) {
      console.log("[Debug] Schedule recovered - second response started");
      await waitForAIComplete(page, 30000);
    } else {
      console.log("[Debug] WARNING: Schedule may be stuck - no second response");
    }

    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();
    console.log("[Debug] Recovery metrics:");
    console.log(`  - Schedule resets: ${convMetrics.scheduleResets}`);
    console.log(`  - Errors: ${convMetrics.errors}`);

    expect(convMetrics.errors).toBe(0);
  });
});

// ============================================================================
// Backend Correlation Debug Tests
// ============================================================================

test.describe("Backend Correlation Debug Tests", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("captures WebSocket message timing", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Capturing WebSocket message timing");

    const wsMessages: { timestamp: number; type: string; size: number }[] = [];

    // Intercept WebSocket messages
    await page.route("**/ws/**", async (route) => {
      const request = route.request();
      wsMessages.push({
        timestamp: Date.now(),
        type: request.method(),
        size: (await request.postData())?.length || 0,
      });
      await route.continue();
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 20000);
    await page.waitForTimeout(10000);
    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    console.log("[Debug] WebSocket Message Analysis:");
    console.log(`  - Total messages captured: ${wsMessages.length}`);

    if (wsMessages.length > 1) {
      // Analyze message intervals
      const intervals: number[] = [];
      for (let i = 1; i < wsMessages.length; i++) {
        intervals.push(wsMessages[i].timestamp - wsMessages[i - 1].timestamp);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      console.log(`  - Avg message interval: ${avgInterval.toFixed(2)}ms`);

      // Flag large gaps (potential network issues)
      const largeGaps = intervals.filter((i) => i > 1000);
      if (largeGaps.length > 0) {
        console.log(`  - Large gaps (>1s): ${largeGaps.length}`);
      }
    }
  });

  test("logs frontend-backend timing correlation", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(90000);

    console.log("\n[Debug] Frontend-backend timing correlation");

    const frontendEvents: { timestamp: number; event: string }[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();

      // Capture key timing events
      if (
        text.includes("audio_chunk_received") ||
        text.includes("chunk_scheduled") ||
        text.includes("playback_started") ||
        text.includes("speech_detected") ||
        text.includes("barge_in")
      ) {
        frontendEvents.push({ timestamp: now, event: text.substring(0, 100) });
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    await waitForAISpeaking(page, 20000);
    await page.waitForTimeout(15000);
    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    console.log("[Debug] Frontend Event Timeline:");
    console.log(`  - Total events captured: ${frontendEvents.length}`);

    // Log first and last 5 events
    if (frontendEvents.length > 0) {
      console.log("[Debug] First 5 events:");
      frontendEvents.slice(0, 5).forEach((e) => console.log(`  - [${e.timestamp}] ${e.event}`));

      if (frontendEvents.length > 10) {
        console.log("[Debug] Last 5 events:");
        frontendEvents.slice(-5).forEach((e) => console.log(`  - [${e.timestamp}] ${e.event}`));
      }
    }

    // This test is primarily for manual analysis - no assertions
    console.log("\n[Debug] Use this data to correlate with backend logs");
    console.log("[Debug] Backend log command: journalctl -u voiceassist-server --since '5 minutes ago'");
  });
});
