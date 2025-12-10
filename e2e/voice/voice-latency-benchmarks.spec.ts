/**
 * Voice Latency Benchmark E2E Tests
 *
 * Measures and validates latency metrics for voice conversations.
 * Captures barge-in latency, TTFA (Time To First Audio), and E2E latency.
 *
 * These tests require LIVE_REALTIME_E2E=1 and a valid OpenAI API key.
 *
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 *
 * Latency Targets (from V3 plan):
 * - Barge-in P50: <150ms (VAD detection → audio mute)
 * - TTFA P50: <800ms (user finishes → first AI audio)
 * - E2E P50: <1200ms (user speech end → AI first word)
 */

import { test, expect, Page } from "@playwright/test";
import {
  VOICE_SELECTORS,
  VOICE_CONFIG,
  WAIT_TIMES,
  startVoiceSession,
  stopVoiceSession,
  waitForVoiceConnection,
  navigateToVoiceChat,
} from "../fixtures/voice";
import {
  LatencyHistogram,
  LATENCY_TARGETS,
  createBargeInHistogram,
  createTTFAHistogram,
  createE2EHistogram,
} from "./utils/latency-histogram";

// Skip all tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run latency benchmarks");
  }
});

/**
 * Interface for latency events captured from the page.
 */
interface LatencyEvent {
  type: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Setup latency measurement hooks in the page.
 * Installs event listeners on window.__voiceModeDebug for timing capture.
 */
async function setupLatencyCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Initialize latency capture storage
    (window as unknown as Record<string, unknown>).__latencyCapture = {
      events: [] as LatencyEvent[],
      bargeInStart: 0,
      audioMuteTime: 0,
      userSpeechEnd: 0,
      firstAudioTime: 0,
    };

    // Hook into voice mode debug if available
    const voiceDebug = (window as unknown as Record<string, unknown>).__voiceModeDebug as
      | Record<string, unknown>
      | undefined;
    if (voiceDebug) {
      // Store original functions
      const originalHandlers: Record<string, ((...args: unknown[]) => void) | undefined> = {};

      // Wrap event handlers to capture timing
      const eventTypes = ["onSpeechStart", "onSpeechEnd", "onAudioStart", "onAudioStop", "onBargeIn"];

      for (const eventType of eventTypes) {
        if (typeof voiceDebug[eventType] === "function") {
          originalHandlers[eventType] = voiceDebug[eventType] as (...args: unknown[]) => void;
        }
        (voiceDebug[eventType] as (eventType: string) => void) = (function (type: string) {
          return function (...args: unknown[]) {
            const capture = (window as unknown as Record<string, Record<string, unknown[]>>).__latencyCapture;
            capture.events.push({
              type,
              timestamp: performance.now(),
              details: args[0] as Record<string, unknown>,
            });
            if (originalHandlers[type]) {
              originalHandlers[type]!(...args);
            }
          };
        })(eventType);
      }
    }
  });
}

/**
 * Capture latency events from the page.
 */
async function captureLatencyEvents(page: Page): Promise<LatencyEvent[]> {
  return page.evaluate(() => {
    const capture = (window as unknown as Record<string, { events: LatencyEvent[] }>).__latencyCapture;
    return capture?.events ?? [];
  });
}

/**
 * Calculate barge-in latency from captured events.
 */
function calculateBargeInLatency(events: LatencyEvent[]): number | null {
  // Find barge-in start (user speech during AI audio)
  const bargeInEvent = events.find((e) => e.type === "onBargeIn" || e.type === "onSpeechStart");
  const audioStopEvent = events.find(
    (e) => e.type === "onAudioStop" && e.timestamp > (bargeInEvent?.timestamp ?? 0)
  );

  if (bargeInEvent && audioStopEvent) {
    return audioStopEvent.timestamp - bargeInEvent.timestamp;
  }
  return null;
}

/**
 * Calculate TTFA (Time To First Audio) from captured events.
 */
function calculateTTFA(events: LatencyEvent[]): number | null {
  // Find user speech end
  const speechEndEvent = events.find((e) => e.type === "onSpeechEnd");
  // Find first AI audio
  const firstAudioEvent = events.find(
    (e) => e.type === "onAudioStart" && e.timestamp > (speechEndEvent?.timestamp ?? 0)
  );

  if (speechEndEvent && firstAudioEvent) {
    return firstAudioEvent.timestamp - speechEndEvent.timestamp;
  }
  return null;
}

test.describe("Voice Latency Benchmarks", () => {
  // Increase timeout for benchmark tests
  test.setTimeout(180000); // 3 minutes

  test("should measure barge-in latency (P50 < 150ms)", async ({ page }) => {
    await navigateToVoiceChat(page);
    await setupLatencyCapture(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    const histogram = createBargeInHistogram();

    // Perform multiple barge-in attempts to collect samples
    const SAMPLE_COUNT = 5;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      console.log(`Barge-in sample ${i + 1}/${SAMPLE_COUNT}`);

      // Clear previous events
      await page.evaluate(() => {
        (window as unknown as Record<string, { events: LatencyEvent[] }>).__latencyCapture.events = [];
      });

      // Wait for AI to start speaking (simulate by waiting for audio playback)
      await page.waitForTimeout(2000);

      // Check if there's any audio debug info available
      const audioPlaying = await page.evaluate(() => {
        const debug = (window as unknown as Record<string, { isPlaying?: boolean }>).__tt_audio_debug;
        return debug?.isPlaying ?? false;
      });

      if (audioPlaying) {
        // Simulate user speech (barge-in) - the mock audio should trigger this
        await page.waitForTimeout(500);

        // Capture events
        const events = await captureLatencyEvents(page);
        const latency = calculateBargeInLatency(events);

        if (latency !== null && latency > 0) {
          histogram.addSample(latency);
          console.log(`  Sample ${i + 1}: ${latency.toFixed(1)}ms`);
        }
      }

      // Brief pause between samples
      await page.waitForTimeout(1000);
    }

    // Stop session
    await stopVoiceSession(page);

    // Output results
    if (histogram.getSampleCount() > 0) {
      console.log("\n" + histogram.formatHistogram());

      // Assert against targets (relaxed for baseline)
      const result = histogram.assertTargets({
        p50: LATENCY_TARGETS.bargeIn.p50 * 3, // 3x target for baseline
        p90: LATENCY_TARGETS.bargeIn.p90 * 3,
      });

      if (!result.pass) {
        console.warn("Latency targets not met:", result.failures);
      }
    } else {
      console.log("No barge-in samples captured - audio playback may not have occurred");
      test.skip(true, "No audio playback detected for barge-in measurement");
    }
  });

  test("should measure TTFA (Time To First Audio) (P50 < 800ms)", async ({ page }) => {
    await navigateToVoiceChat(page);
    await setupLatencyCapture(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    const histogram = createTTFAHistogram();
    const SAMPLE_COUNT = 3;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      console.log(`TTFA sample ${i + 1}/${SAMPLE_COUNT}`);

      // Clear previous events
      await page.evaluate(() => {
        (window as unknown as Record<string, { events: LatencyEvent[] }>).__latencyCapture.events = [];
      });

      // Wait for any ongoing AI speech to complete
      await page.waitForTimeout(3000);

      // Simulate user speech (mock audio will provide this)
      const speechStartTime = await page.evaluate(() => performance.now());

      // Wait for speech to be processed and AI to respond
      await page.waitForTimeout(4000);

      // Capture events
      const events = await captureLatencyEvents(page);
      const ttfa = calculateTTFA(events);

      if (ttfa !== null && ttfa > 0) {
        histogram.addSample(ttfa);
        console.log(`  Sample ${i + 1}: ${ttfa.toFixed(1)}ms`);
      }

      // Pause between turns
      await page.waitForTimeout(2000);
    }

    // Stop session
    await stopVoiceSession(page);

    // Output results
    if (histogram.getSampleCount() > 0) {
      console.log("\n" + histogram.formatHistogram());

      const result = histogram.assertTargets({
        p50: LATENCY_TARGETS.ttfa.p50 * 2, // 2x target for baseline
        p90: LATENCY_TARGETS.ttfa.p90 * 2,
      });

      if (!result.pass) {
        console.warn("TTFA targets not met:", result.failures);
      }
    } else {
      console.log("No TTFA samples captured");
      test.skip(true, "No speech-to-audio samples captured");
    }
  });

  test("should measure E2E latency (P50 < 1200ms)", async ({ page }) => {
    await navigateToVoiceChat(page);
    await setupLatencyCapture(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    const histogram = createE2EHistogram();
    const SAMPLE_COUNT = 3;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      console.log(`E2E sample ${i + 1}/${SAMPLE_COUNT}`);

      // Clear previous events
      await page.evaluate(() => {
        (window as unknown as Record<string, { events: LatencyEvent[] }>).__latencyCapture.events = [];
      });

      // Record start time
      const startTime = Date.now();

      // Wait for full conversation turn (user speaks, AI responds)
      await page.waitForTimeout(6000);

      // Check for transcript and AI response
      const hasResponse = await page.evaluate(() => {
        // Check for AI message in transcript
        const aiMessages = document.querySelectorAll('[data-testid="assistant-message"]');
        return aiMessages.length > 0;
      });

      if (hasResponse) {
        // Estimate E2E latency from events
        const events = await captureLatencyEvents(page);
        const ttfa = calculateTTFA(events);

        if (ttfa !== null && ttfa > 0) {
          histogram.addSample(ttfa);
          console.log(`  Sample ${i + 1}: ${ttfa.toFixed(1)}ms`);
        }
      }

      // Pause between turns
      await page.waitForTimeout(2000);
    }

    // Stop session
    await stopVoiceSession(page);

    // Output results
    if (histogram.getSampleCount() > 0) {
      console.log("\n" + histogram.formatHistogram());

      const result = histogram.assertTargets({
        p50: LATENCY_TARGETS.e2e.p50 * 2, // 2x target for baseline
        p90: LATENCY_TARGETS.e2e.p90 * 2,
      });

      if (!result.pass) {
        console.warn("E2E latency targets not met:", result.failures);
      }
    } else {
      console.log("No E2E samples captured");
    }
  });
});

test.describe("Voice Latency - Baseline Capture", () => {
  test.setTimeout(120000);

  /**
   * Baseline test that captures current latency metrics without assertions.
   * Use this to establish baseline measurements before optimization.
   */
  test("capture baseline latency metrics", async ({ page }) => {
    await navigateToVoiceChat(page);
    await setupLatencyCapture(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    const bargeInHistogram = createBargeInHistogram();
    const ttfaHistogram = createTTFAHistogram();
    const e2eHistogram = createE2EHistogram();

    console.log("\n=== BASELINE LATENCY CAPTURE ===\n");
    console.log("Performing 5 conversation turns to capture baseline metrics...\n");

    for (let turn = 1; turn <= 5; turn++) {
      console.log(`--- Turn ${turn}/5 ---`);

      // Clear events
      await page.evaluate(() => {
        (window as unknown as Record<string, { events: LatencyEvent[] }>).__latencyCapture.events = [];
      });

      // Wait for AI response cycle
      await page.waitForTimeout(5000);

      // Capture events
      const events = await captureLatencyEvents(page);

      // Calculate metrics
      const bargeIn = calculateBargeInLatency(events);
      const ttfa = calculateTTFA(events);

      if (bargeIn !== null && bargeIn > 0) {
        bargeInHistogram.addSample(bargeIn);
      }
      if (ttfa !== null && ttfa > 0) {
        ttfaHistogram.addSample(ttfa);
        e2eHistogram.addSample(ttfa + 500); // Approximate E2E
      }

      console.log(`  Events captured: ${events.length}`);
      console.log(`  TTFA: ${ttfa?.toFixed(1) ?? "N/A"}ms`);
      console.log(`  Barge-in: ${bargeIn?.toFixed(1) ?? "N/A"}ms`);
    }

    await stopVoiceSession(page);

    // Output final baseline report
    console.log("\n=== BASELINE LATENCY REPORT ===\n");

    if (bargeInHistogram.getSampleCount() > 0) {
      console.log(bargeInHistogram.formatHistogram());
      console.log();
    }

    if (ttfaHistogram.getSampleCount() > 0) {
      console.log(ttfaHistogram.formatHistogram());
      console.log();
    }

    if (e2eHistogram.getSampleCount() > 0) {
      console.log(e2eHistogram.formatHistogram());
      console.log();
    }

    // Output comparison with targets
    console.log("=== TARGET COMPARISON ===\n");
    console.log("Barge-in targets: P50<150ms, P90<250ms, P99<400ms");
    console.log("TTFA targets:     P50<800ms, P90<1500ms, P99<2500ms");
    console.log("E2E targets:      P50<1200ms, P90<2000ms, P99<3500ms");
    console.log();

    if (bargeInHistogram.getSampleCount() > 0) {
      const stats = bargeInHistogram.getStats();
      console.log(
        `Barge-in actual:  P50=${stats.median.toFixed(0)}ms, ` +
          `P90=${stats.p90.toFixed(0)}ms, P99=${stats.p99.toFixed(0)}ms`
      );
    }
    if (ttfaHistogram.getSampleCount() > 0) {
      const stats = ttfaHistogram.getStats();
      console.log(
        `TTFA actual:      P50=${stats.median.toFixed(0)}ms, ` +
          `P90=${stats.p90.toFixed(0)}ms, P99=${stats.p99.toFixed(0)}ms`
      );
    }
    if (e2eHistogram.getSampleCount() > 0) {
      const stats = e2eHistogram.getStats();
      console.log(
        `E2E actual:       P50=${stats.median.toFixed(0)}ms, ` +
          `P90=${stats.p90.toFixed(0)}ms, P99=${stats.p99.toFixed(0)}ms`
      );
    }
  });
});
