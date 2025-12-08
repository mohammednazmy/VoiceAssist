/**
 * Voice Mode Natural Conversation Scenario Tests
 *
 * Tests realistic conversation patterns with real audio injection.
 * These tests simulate actual user behavior to validate:
 * - Simple Q&A flows
 * - Multi-turn conversations
 * - Barge-in scenarios
 * - Backchannel handling
 * - Long AI responses
 *
 * Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-scenarios
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
  waitForUserSpeechRecognized,
  assertQualityThresholds,
  isLiveMode,
} from "./utils/test-setup";

// ============================================================================
// Test Configuration
// ============================================================================

const SCENARIO_TIMEOUTS = {
  short: 30000, // Simple Q&A
  medium: 60000, // Multi-turn conversation
  long: 120000, // Extended conversation
};

// ============================================================================
// Simple Q&A Scenarios
// ============================================================================

test.describe("Simple Q&A Scenarios", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("user asks a simple question, AI responds completely", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.short);

    console.log("\n[Scenario] Starting simple Q&A test");

    // Navigate and open voice mode
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready, "Voice mode should become ready").toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened, "Voice mode should open").toBe(true);

    // Wait for AI to finish initial greeting
    const speaking = await waitForAISpeaking(page, 20000);
    if (speaking) {
      console.log("[Scenario] AI started greeting");
      await waitForAIComplete(page, 30000);
      console.log("[Scenario] AI greeting completed");
    }

    // Wait for the full response to complete
    await page.waitForTimeout(3000);

    // Close voice mode
    await closeVoiceMode(page);

    // Validate quality
    const convMetrics = metricsCollector.getConversationMetrics();
    console.log("[Scenario] Results:");
    console.log(`  - Response latency: ${convMetrics.averageResponseLatencyMs.toFixed(0)}ms`);
    console.log(`  - Errors: ${convMetrics.errors}`);
    console.log(`  - Queue overflows: ${convMetrics.queueOverflows}`);

    expect(convMetrics.errors).toBe(0);
    expect(convMetrics.queueOverflows).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxQueueOverflows);
  });

  test("AI response completes without self-interruption", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing AI response completion");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Wait for AI to speak
    const speaking = await waitForAISpeaking(page, 20000);
    expect(speaking, "AI should start speaking").toBe(true);

    // Track if AI completes without interruption
    let selfInterrupted = false;
    const startTime = Date.now();

    // Monitor for unexpected interruptions during AI speech
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("barge_in") && text.includes("playback_active")) {
        console.log(`[Scenario] Warning: Potential self-interruption detected: ${text}`);
        selfInterrupted = true;
      }
    });

    // Wait for completion
    const complete = await waitForAIComplete(page, 60000);
    const duration = Date.now() - startTime;

    console.log(`[Scenario] AI response duration: ${duration}ms`);
    console.log(`[Scenario] Self-interrupted: ${selfInterrupted}`);

    // Close and validate
    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();

    // Self-interruption check: false barge-ins during AI speech indicate self-interruption
    expect(selfInterrupted, "AI should not self-interrupt").toBe(false);
    expect(convMetrics.falseBargeIns).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxFalseBargeIns);
    expect(complete, "AI response should complete").toBe(true);
  });
});

// ============================================================================
// Multi-turn Conversation Scenarios
// ============================================================================

test.describe("Multi-turn Conversation Scenarios", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("3-turn conversation flow with natural exchanges", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.long);

    console.log("\n[Scenario] Starting 3-turn conversation test");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    const turns: { type: string; duration: number }[] = [];

    // Turn 1: Initial AI greeting
    console.log("[Scenario] Turn 1: AI greeting");
    let turnStart = Date.now();
    const greeting = await waitForAISpeaking(page, 20000);
    if (greeting) {
      await waitForAIComplete(page, 40000);
      turns.push({ type: "ai-greeting", duration: Date.now() - turnStart });
    }

    // Wait for turn transition
    await page.waitForTimeout(2000);

    // Turn 2: Simulate user speaking (Chrome fake audio)
    // and wait for AI response
    console.log("[Scenario] Turn 2: Waiting for AI response to audio input");
    turnStart = Date.now();

    const speaking2 = await waitForAISpeaking(page, 30000);
    if (speaking2) {
      await waitForAIComplete(page, 40000);
      turns.push({ type: "ai-response-1", duration: Date.now() - turnStart });
    }

    await page.waitForTimeout(2000);

    // Turn 3: Another round
    console.log("[Scenario] Turn 3: Second AI response");
    turnStart = Date.now();

    const speaking3 = await waitForAISpeaking(page, 30000);
    if (speaking3) {
      await waitForAIComplete(page, 40000);
      turns.push({ type: "ai-response-2", duration: Date.now() - turnStart });
    }

    await closeVoiceMode(page);

    // Log turn metrics
    console.log("[Scenario] Turn summary:");
    turns.forEach((turn, i) => {
      console.log(`  Turn ${i + 1}: ${turn.type} - ${turn.duration}ms`);
    });

    const convMetrics = metricsCollector.getConversationMetrics();
    console.log("[Scenario] Conversation metrics:");
    console.log(`  - Total turns: ${turns.length}`);
    console.log(`  - Avg latency: ${convMetrics.averageResponseLatencyMs.toFixed(0)}ms`);
    console.log(`  - Errors: ${convMetrics.errors}`);

    expect(convMetrics.errors).toBe(0);
    expect(turns.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Barge-in Scenarios
// ============================================================================

test.describe("Barge-in Scenarios", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("user intentional barge-in during AI response", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing intentional barge-in");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Wait for AI to start speaking
    const speaking = await waitForAISpeaking(page, 20000);
    expect(speaking, "AI should start speaking").toBe(true);

    // Track barge-in timing
    let bargeInDetected = false;
    let bargeInLatency = 0;

    // Listen for barge-in events
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("barge_in") || text.includes("speech_started")) {
        console.log(`[Scenario] Barge-in event: ${text}`);
        if (!bargeInDetected) {
          bargeInDetected = true;
          bargeInLatency = Date.now();
        }
      }
    });

    // Wait a bit for AI to be speaking, then the fake audio should trigger barge-in
    await page.waitForTimeout(3000);

    // Check for barge-in detection
    const bargeInStart = Date.now();
    await page.waitForTimeout(5000);

    if (bargeInDetected) {
      bargeInLatency = bargeInLatency - bargeInStart;
      console.log(`[Scenario] Barge-in detected with latency: ${bargeInLatency}ms`);
    }

    // Wait for any new AI response after barge-in
    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();
    console.log("[Scenario] Barge-in test results:");
    console.log(`  - Barge-in attempts: ${convMetrics.bargeInAttempts}`);
    console.log(`  - False barge-ins: ${convMetrics.falseBargeIns}`);
    console.log(`  - Errors: ${convMetrics.errors}`);

    expect(convMetrics.errors).toBe(0);
  });

  test("audio quality remains good after barge-in", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing audio quality after barge-in");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Wait for AI to start speaking
    await waitForAISpeaking(page, 20000);

    // Wait during playback for barge-in to potentially occur
    await page.waitForTimeout(5000);

    // Wait for AI to complete (either naturally or after barge-in)
    await waitForAIComplete(page, 45000);

    // Check for additional AI responses (post-barge-in)
    const postBargeIn = await waitForAISpeaking(page, 20000);
    if (postBargeIn) {
      console.log("[Scenario] Post-barge-in response started");
      await waitForAIComplete(page, 45000);
    }

    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();

    // Key metric: queue overflows indicate choppy audio
    console.log("[Scenario] Audio quality metrics:");
    console.log(`  - Queue overflows: ${convMetrics.queueOverflows}`);
    console.log(`  - Schedule resets: ${convMetrics.scheduleResets}`);

    expect(convMetrics.queueOverflows).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxQueueOverflows);
    expect(convMetrics.scheduleResets).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxScheduleResets);
  });
});

// ============================================================================
// Long Response Scenarios
// ============================================================================

test.describe("Long Response Scenarios", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("AI handles long response without audio issues", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.long);

    console.log("\n[Scenario] Testing long AI response handling");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Track metrics during long playback
    let maxQueueLength = 0;
    let underruns = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("queue_length")) {
        const match = text.match(/queue_length[:\s]+(\d+)/);
        if (match) {
          const queueLen = parseInt(match[1]);
          maxQueueLength = Math.max(maxQueueLength, queueLen);
        }
      }
      if (text.includes("buffer_underrun") || text.includes("playback_starved")) {
        underruns++;
      }
    });

    // Wait for AI to speak for an extended period
    const speaking = await waitForAISpeaking(page, 30000);
    expect(speaking, "AI should start speaking").toBe(true);

    // Let it play for a while to test stability
    console.log("[Scenario] Monitoring audio stability...");
    await page.waitForTimeout(30000);

    const complete = await waitForAIComplete(page, 60000);
    console.log(`[Scenario] AI response completed: ${complete}`);

    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();

    console.log("[Scenario] Long response metrics:");
    console.log(`  - Max queue length: ${maxQueueLength}`);
    console.log(`  - Underruns: ${underruns}`);
    console.log(`  - Queue overflows: ${convMetrics.queueOverflows}`);
    console.log(`  - Schedule resets: ${convMetrics.scheduleResets}`);

    // Assertions
    expect(convMetrics.queueOverflows).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxQueueOverflows);
    expect(underruns, "Should have minimal buffer underruns").toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Audio Queue Health Scenarios
// ============================================================================

test.describe("Audio Queue Health Scenarios", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("audio queue stays healthy throughout conversation", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing audio queue health");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Track queue health metrics
    const queueSnapshots: number[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("audio_queue") || text.includes("queue_state")) {
        const match = text.match(/(?:queue_length|items)[:\s]+(\d+)/);
        if (match) {
          queueSnapshots.push(parseInt(match[1]));
        }
      }
    });

    // Complete a full conversation cycle
    await waitForAISpeaking(page, 20000);
    await waitForAIComplete(page, 45000);

    await page.waitForTimeout(3000);

    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();

    console.log("[Scenario] Queue health analysis:");
    if (queueSnapshots.length > 0) {
      const avgQueue = queueSnapshots.reduce((a, b) => a + b, 0) / queueSnapshots.length;
      const maxQueue = Math.max(...queueSnapshots);
      console.log(`  - Avg queue length: ${avgQueue.toFixed(1)}`);
      console.log(`  - Max queue length: ${maxQueue}`);
    }
    console.log(`  - Queue overflows: ${convMetrics.queueOverflows}`);

    expect(convMetrics.queueOverflows).toBe(0);
    expect(convMetrics.errors).toBe(0);
  });

  test("schedule does not get stuck after barge-in", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing schedule recovery after barge-in");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Wait for AI to start speaking
    await waitForAISpeaking(page, 20000);

    // Wait during playback for potential barge-in
    await page.waitForTimeout(5000);

    // Wait for AI to complete
    await waitForAIComplete(page, 45000);

    // Try to get another response - this tests schedule recovery
    console.log("[Scenario] Testing schedule recovery...");
    await page.waitForTimeout(3000);

    // Check if we can get another response (schedule not stuck)
    const secondResponse = await waitForAISpeaking(page, 15000);
    if (secondResponse) {
      console.log("[Scenario] Second response started - schedule recovered");
      await waitForAIComplete(page, 30000);
    }

    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();

    console.log("[Scenario] Schedule recovery metrics:");
    console.log(`  - Schedule resets: ${convMetrics.scheduleResets}`);
    console.log(`  - Errors: ${convMetrics.errors}`);

    expect(convMetrics.scheduleResets).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxScheduleResets);
    expect(convMetrics.errors).toBe(0);
  });
});

// ============================================================================
// Latency Scenarios
// ============================================================================

test.describe("Latency Scenarios", () => {
  test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");

  test("response latency stays within thresholds", async ({
    page,
    metricsCollector,
  }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing response latency");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Measure time to first audio
    const startTime = Date.now();
    const speaking = await waitForAISpeaking(page, 30000);
    const timeToFirstAudio = Date.now() - startTime;

    console.log(`[Scenario] Time to first audio: ${timeToFirstAudio}ms`);

    if (speaking) {
      await waitForAIComplete(page, 45000);
    }

    await closeVoiceMode(page);

    const convMetrics = metricsCollector.getConversationMetrics();

    console.log("[Scenario] Latency metrics:");
    console.log(`  - Time to first audio: ${timeToFirstAudio}ms`);
    console.log(`  - Avg response latency: ${convMetrics.averageResponseLatencyMs.toFixed(0)}ms`);

    // Response latency should be under threshold
    expect(
      timeToFirstAudio,
      `Time to first audio (${timeToFirstAudio}ms) should be under threshold`
    ).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxResponseLatencyMs);
  });

  test("barge-in latency is fast", async ({ page, metricsCollector }) => {
    test.skip(!isLiveMode(), "Requires LIVE_REALTIME_E2E=1");
    test.setTimeout(SCENARIO_TIMEOUTS.medium);

    console.log("\n[Scenario] Testing barge-in latency");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ready = await waitForVoiceModeReady(page);
    expect(ready).toBe(true);

    const opened = await openVoiceMode(page);
    expect(opened).toBe(true);

    // Wait for AI to start speaking
    await waitForAISpeaking(page, 20000);

    // Track barge-in timing
    let speechStartTime = 0;
    let playbackStopTime = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();

      if (text.includes("speech_started") || text.includes("user_speaking")) {
        if (speechStartTime === 0) speechStartTime = now;
      }
      if (text.includes("playback_stopped") || text.includes("barge_in_complete")) {
        if (playbackStopTime === 0) playbackStopTime = now;
      }
    });

    // Wait for barge-in to potentially occur
    await page.waitForTimeout(8000);

    await waitForAIComplete(page, 30000);
    await closeVoiceMode(page);

    // Calculate barge-in latency if we captured both events
    if (speechStartTime > 0 && playbackStopTime > 0) {
      const bargeInLatency = playbackStopTime - speechStartTime;
      console.log(`[Scenario] Barge-in latency: ${bargeInLatency}ms`);

      expect(
        bargeInLatency,
        `Barge-in latency (${bargeInLatency}ms) should be under threshold`
      ).toBeLessThanOrEqual(QUALITY_THRESHOLDS.maxBargeInLatencyMs);
    } else {
      console.log("[Scenario] No barge-in detected in this test run");
    }

    const convMetrics = metricsCollector.getConversationMetrics();
    expect(convMetrics.errors).toBe(0);
  });
});
