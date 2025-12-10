/**
 * Voice Mode Two-Phase Barge-In E2E Tests
 *
 * These tests use a structured audio file with distinct phases:
 * - Phase 1 (0-3.19s): User asks "Hello, what can you do?"
 * - Silence (3.19-13.19s): 10 seconds for AI to process and start speaking
 * - Phase 2 (13.19-15.4s): User interrupts with "Stop! Wait a moment please"
 *
 * This approach ensures the AI has time to generate and play audio
 * before the interruption occurs, making barge-in testing more reliable.
 *
 * Audio file: two-phase-barge-in.wav (15.4 seconds total)
 *
 * @phase E2E Reality Alignment
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import {
  waitForVoiceModeReady,
  waitForAIPlayingAudio,
  waitForAudioToStop,
  verifyBargeInWithVoiceModeDebug,
  getVoiceModeDebugState,
  setupBargeInConsoleCapture,
} from "./utils/test-setup";

import { createMetricsCollector } from "./utils/voice-test-metrics";

// Resolve auth state path relative to project root
const AUTH_STATE_PATH = path.resolve(process.cwd(), "e2e/.auth/user.json");

// Audio timeline constants (in milliseconds)
const PHASE_1_END = 3190; // End of initial question
const SILENCE_DURATION = 10000; // 10 seconds of silence
const PHASE_2_START = PHASE_1_END + SILENCE_DURATION; // ~13190ms when barge-in starts
const TOTAL_AUDIO_DURATION = 15400; // Total audio file length

test.describe("Voice Mode Two-Phase Barge-In", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["microphone"]);
  });

  /**
   * Core two-phase barge-in test
   *
   * Timeline:
   * 0-3.19s: User speaks initial question
   * 3.19-13.19s: Silence - AI should process and start speaking
   * 13.19-15.4s: User interrupts - should trigger barge-in
   */
  test("two-phase barge-in: AI plays audio, then gets interrupted", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    // Attach voice metrics collector to capture barge-in latency / quality
    const collector = createMetricsCollector(page);

    // Enable force flags for proper Silero VAD and instant barge-in
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    const consoleState = setupBargeInConsoleCapture(page);
    const testStartTime = Date.now();

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    console.log("[TEST] Page loaded, starting voice mode...");

    // Click voice mode button
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    console.log("[TEST] Voice button clicked, waiting for ready...");

    // Wait for voice mode to be ready
    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    const voiceModeStartTime = Date.now();
    console.log(`[TEST] Voice mode ready at ${voiceModeStartTime - testStartTime}ms`);

    // Get initial barge-in count
    const initialState = await getVoiceModeDebugState(page);
    const initialBargeInCount = initialState?.bargeInCount ?? 0;
    console.log(`[TEST] Initial bargeInCount: ${initialBargeInCount}`);

    // Phase 1: Wait for AI to start playing audio
    // The question plays for ~3.2s, then ~10s silence while AI processes
    // AI should start playing audio during the silence phase
    console.log("[TEST] Waiting for AI to start playing audio (Phase 1)...");

    const aiPlayingResult = await waitForAIPlayingAudio(page, 60000);

    if (!aiPlayingResult.success) {
      console.log("[TEST] ISSUE: AI never started playing audio!");
      console.log("[TEST] Debug state:", JSON.stringify(aiPlayingResult.debugState, null, 2));
      console.log("[TEST] Console logs:", consoleState.allBargeInLogs.slice(-30).join("\n"));
      expect(aiPlayingResult.success).toBe(true);
    }

    const aiPlayingTime = Date.now();
    console.log(`[TEST] AI playing audio detected at ${aiPlayingTime - voiceModeStartTime}ms after voice mode start`);
    console.log("[TEST] AI state:", {
      isPlaying: aiPlayingResult.isPlaying,
      isActuallyPlaying: aiPlayingResult.debugState?.isActuallyPlaying,
      pipelineState: aiPlayingResult.pipelineState,
    });

    // Calculate how much time until Phase 2 (barge-in audio) starts
    const timeElapsed = aiPlayingTime - voiceModeStartTime;
    const timeUntilPhase2 = Math.max(0, PHASE_2_START - timeElapsed);
    console.log(`[TEST] Time until Phase 2 (barge-in): ${timeUntilPhase2}ms`);

    // Wait for barge-in to occur
    // The barge-in audio ("Stop! Wait a moment please") should trigger around ~13s
    console.log("[TEST] Waiting for barge-in to trigger (Phase 2)...");

    const bargeInResult = await verifyBargeInWithVoiceModeDebug(
      page,
      initialBargeInCount,
      30000 // 30 second timeout - enough for Phase 2 + processing
    );

    const bargeInTime = Date.now();
    console.log(`[TEST] Barge-in check completed at ${bargeInTime - voiceModeStartTime}ms`);
    console.log("[TEST] Barge-in result:", JSON.stringify(bargeInResult, null, 2));

    if (!bargeInResult.triggered) {
      console.log("[TEST] BARGE-IN NOT TRIGGERED!");
      console.log("[TEST] Speech detected logs:", consoleState.speechDetectedLogs.join("\n"));
      console.log("[TEST] Barge-in triggered logs:", consoleState.bargeInTriggeredLogs.join("\n"));
      console.log("[TEST] Pipeline state logs:", consoleState.pipelineStateLogs.slice(-15).join("\n"));
    }

    // CRITICAL ASSERTIONS
    expect(bargeInResult.triggered).toBe(true);
    expect(bargeInResult.audioStopped).toBe(true);

    const bargeInSuccess = bargeInResult.bargeInCountIncreased || bargeInResult.pipelineTransitioned;
    expect(bargeInSuccess).toBe(true);

    console.log("[TEST] Two-phase barge-in test PASSED!");

    // === Metrics-based assertions ===
    const conv = collector.getConversationMetrics();
    console.log(
      "[Two-Phase Barge-In] Metrics summary:\n",
      collector.getSummary(),
    );

    // We expect at least one barge-in attempt and execution in this two-phase scenario
    expect(
      conv.bargeInAttempts,
      `Expected at least one barge-in attempt, got ${conv.bargeInAttempts}`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      conv.successfulBargeIns,
      `Expected at least one successful barge-in, got ${conv.successfulBargeIns}`,
    ).toBeGreaterThanOrEqual(1);

    // Barge-in latency should be reasonable; tests have overhead so we allow a
    // looser bound than production SLOs but still catch regressions.
    expect(
      conv.averageBargeInLatencyMs,
      `Average barge-in latency too high: ${conv.averageBargeInLatencyMs.toFixed(0)}ms`,
    ).toBeLessThanOrEqual(2000);

    await context.close();
  });

  /**
   * Diagnostic test with detailed timing information
   */
  test("diagnostic: two-phase audio timeline analysis", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
      localStorage.setItem("voiceassist-debug-mode", "true");
    });

    const consoleState = setupBargeInConsoleCapture(page);
    const audioPlaybackLogs: string[] = [];
    const vadLogs: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[TTAudioPlayback]")) {
        audioPlaybackLogs.push(`[${Date.now()}] ${text}`);
      }
      if (text.includes("VAD") || text.includes("vad") || text.includes("speech")) {
        vadLogs.push(`[${Date.now()}] ${text}`);
      }
    });

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    const startTime = Date.now();

    // Log state every 200ms for the duration of the audio file (plus buffer)
    const stateLog: Array<{
      timestamp: number;
      state: Awaited<ReturnType<typeof getVoiceModeDebugState>>;
    }> = [];

    const logDuration = TOTAL_AUDIO_DURATION + 10000; // Audio + 10s buffer
    while (Date.now() - startTime < logDuration) {
      const state = await getVoiceModeDebugState(page);
      stateLog.push({
        timestamp: Date.now() - startTime,
        state,
      });
      await page.waitForTimeout(200);
    }

    // Analyze timeline
    console.log("\n=== TWO-PHASE AUDIO TIMELINE ANALYSIS ===");
    console.log("Expected timeline:");
    console.log("  0-3190ms: Phase 1 - User question");
    console.log("  3190-13190ms: Silence - AI should process and speak");
    console.log("  13190-15400ms: Phase 2 - Barge-in audio");
    console.log("");

    // Find key events
    const firstSpeaking = stateLog.find((e) => e.state?.pipelineState === "speaking");
    const firstPlaying = stateLog.find((e) => e.state?.isActuallyPlaying === true);
    const firstBargeIn = stateLog.find((e) => (e.state?.bargeInCount ?? 0) > 0);
    const lastPlaying = [...stateLog].reverse().find((e) => e.state?.isActuallyPlaying === true);

    console.log("=== KEY EVENTS ===");
    console.log(`First 'speaking' state: ${firstSpeaking?.timestamp ?? "never"}ms`);
    console.log(`First isActuallyPlaying=true: ${firstPlaying?.timestamp ?? "never"}ms`);
    console.log(`First barge-in triggered: ${firstBargeIn?.timestamp ?? "never"}ms`);
    console.log(`Last isActuallyPlaying=true: ${lastPlaying?.timestamp ?? "never"}ms`);

    // Print state log with phase markers
    console.log("\n=== STATE LOG ===");
    console.log("Time(ms) | Phase | Pipeline | isActually | bargeIn");
    console.log("-".repeat(60));

    for (const entry of stateLog) {
      const t = entry.timestamp;
      const phase = t < PHASE_1_END ? "Q1" : t < PHASE_2_START ? "SIL" : "Q2";
      const s = entry.state;
      console.log(
        `${t.toString().padStart(6)} | ${phase.padEnd(5)} | ${(s?.pipelineState || "N/A").padEnd(10)} | ${String(s?.isActuallyPlaying ?? "N/A").padEnd(10)} | ${s?.bargeInCount ?? "N/A"}`
      );
    }

    // VAD activity during phases
    console.log("\n=== VAD LOGS (first 30) ===");
    for (const log of vadLogs.slice(0, 30)) {
      console.log(log);
    }

    // Audio playback logs
    console.log("\n=== AUDIO PLAYBACK LOGS (last 20) ===");
    for (const log of audioPlaybackLogs.slice(-20)) {
      console.log(log);
    }

    // Summary
    const aiPlayedDuringSilence =
      firstPlaying && firstPlaying.timestamp > PHASE_1_END && firstPlaying.timestamp < PHASE_2_START;
    const bargeInDuringPhase2 = firstBargeIn && firstBargeIn.timestamp >= PHASE_2_START - 1000;

    // === NEW: Check WebSocket message tracking arrays ===
    const wsDebugState = await page.evaluate(() => {
      const win = window as typeof window & {
        __wsMessageLog?: Array<{
          timestamp: number;
          dataType: string;
          size: number;
          preview?: string;
        }>;
        __wsMessageCount?: number;
        __wsLastMessageTime?: number;
        __tt_ws_events?: Array<{
          direction: string;
          type: string;
          timestamp: number;
        }>;
      };
      return {
        messageCount: win.__wsMessageCount || 0,
        lastMessageTime: win.__wsLastMessageTime || 0,
        messageLog: win.__wsMessageLog?.slice(-50) || [], // Last 50 messages
        ttWsEventsCount: win.__tt_ws_events?.length || 0,
        ttWsEventTypes: win.__tt_ws_events?.map((e) => e.type).slice(-30) || [],
      };
    });

    console.log("\n=== WEBSOCKET MESSAGE DELIVERY DEBUG ===");
    console.log(`Total WS messages received (onmessage calls): ${wsDebugState.messageCount}`);
    console.log(`Last message time: ${wsDebugState.lastMessageTime}`);
    console.log(`__tt_ws_events count: ${wsDebugState.ttWsEventsCount}`);
    console.log(`__tt_ws_events types: ${wsDebugState.ttWsEventTypes.join(", ")}`);
    console.log("\n=== WS MESSAGE LOG (last 50) ===");
    for (const msg of wsDebugState.messageLog) {
      console.log(
        `  ${msg.timestamp}: ${msg.dataType} (${msg.size} bytes) ${msg.preview || ""}`
      );
    }

    // === NEW: Get audio stop stack traces ===
    const audioStopStacks = await page.evaluate(() => {
      const win = window as Window & { __audioStopStacks?: string[] };
      return win.__audioStopStacks || [];
    });

    console.log("\n=== AUDIO STOP STACK TRACES ===");
    if (audioStopStacks.length === 0) {
      console.log("  (no stop() calls recorded)");
    } else {
      for (const stack of audioStopStacks) {
        console.log(`  ${stack}`);
      }
    }

    console.log("\n=== DIAGNOSTIC SUMMARY ===");
    console.log(`AI started playing during silence phase: ${aiPlayedDuringSilence ? "YES" : "NO"}`);
    console.log(`Barge-in triggered during Phase 2: ${bargeInDuringPhase2 ? "YES" : "NO"}`);
    console.log(
      `Audio playback duration: ${firstPlaying && lastPlaying ? lastPlaying.timestamp - firstPlaying.timestamp : 0}ms`
    );
    console.log(`WS messages received: ${wsDebugState.messageCount}`);
    console.log(`WS event types logged: ${wsDebugState.ttWsEventsCount}`);
    console.log(`Audio stop() calls: ${audioStopStacks.length}`);

    // This test always passes - it's for diagnostics
    expect(true).toBe(true);

    await context.close();
  });
});
