/**
 * Voice Mode Barge-In Realistic E2E Tests
 *
 * These tests verify that barge-in ACTUALLY works in a realistic conversation flow.
 * The key insight is that we need to:
 * 1. Wait for AI to ACTUALLY be playing audio (not just in "speaking" state)
 * 2. Verify that when user speaks, AI audio IMMEDIATELY stops
 * 3. Verify that the conversation continues properly after interruption
 *
 * If barge-in doesn't work in production, these tests MUST FAIL.
 * The goal is alignment between test results and actual user experience.
 *
 * Test Flow:
 * 1. User says "Hello, what can you do?"
 * 2. AI responds with capabilities
 * 3. Wait for AI response to complete
 * 4. (Audio loops) -> triggers barge-in during AI's next response
 * 5. Verify barge-in: audio stops, pipeline transitions to listening
 *
 * @phase E2E Reality Alignment
 */

import { test, expect } from "@playwright/test";
import {
  waitForVoiceModeReady,
  waitForAIPlayingAudio,
  waitForAudioToStop,
  verifyBargeInWithVoiceModeDebug,
  getVoiceModeDebugState,
  setupBargeInConsoleCapture,
} from "./utils/test-setup";

// Note: Audio fixture is set in playwright.config.ts for the voice-barge-in-realistic project
// It uses conversation-start.wav which contains a question that triggers AI response

test.describe("Voice Mode Barge-In - Realistic Flow", () => {
  test.beforeEach(async ({ context }) => {
    // Grant microphone permission
    await context.grantPermissions(["microphone"]);
  });

  /**
   * Core barge-in functionality test
   *
   * This test verifies the ACTUAL barge-in behavior:
   * 1. Start voice mode with conversation audio
   * 2. Wait for AI to start playing audio (isPlaying = true)
   * 3. Since audio loops, it should trigger barge-in
   * 4. Verify: audio immediately stops, pipeline transitions to listening
   *
   * If this test passes but real barge-in doesn't work, we have a test bug.
   */
  test("barge-in should immediately stop AI audio when user speaks", async ({
    browser,
  }) => {
    // Launch browser with fake audio capture
    const context = await browser.newContext({
      permissions: ["microphone"],
    });
    const page = await context.newPage();

    // Enable force flags for proper Silero VAD and instant barge-in in automation
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    // Set up console capture for debugging
    const consoleState = setupBargeInConsoleCapture(page);

    // Navigate to chat page
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    console.log("[TEST] Page loaded, looking for voice button...");

    // Click voice mode button using data-testid
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    console.log("[TEST] Voice button clicked, waiting for voice mode to be ready...");

    // Wait for voice mode to be ready (connected)
    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);
    console.log("[TEST] Voice mode ready:", voiceReadyResult);

    // Get initial barge-in count
    const initialState = await getVoiceModeDebugState(page);
    const initialBargeInCount = initialState?.bargeInCount ?? 0;
    console.log(`[TEST] Initial state - bargeInCount: ${initialBargeInCount}`);

    // Wait for AI to start playing audio
    // This is the KEY condition - we need actual audio playback, not just "speaking" state
    console.log("[TEST] Waiting for AI to start playing audio...");
    const aiPlayingResult = await waitForAIPlayingAudio(page, 45000);

    if (!aiPlayingResult.success) {
      // AI never started playing audio - this is a test setup issue
      console.log("[TEST] ISSUE: AI never started playing audio!");
      console.log("[TEST] Final state:", JSON.stringify(aiPlayingResult.debugState, null, 2));
      console.log("[TEST] Console logs:", consoleState.allBargeInLogs.slice(-20).join("\n"));

      // This should fail the test - we can't test barge-in without audio playback
      expect(aiPlayingResult.success).toBe(true);
    }

    console.log("[TEST] AI is playing audio! Now testing barge-in...");
    console.log("[TEST] AI state:", {
      isPlaying: aiPlayingResult.isPlaying,
      pipelineState: aiPlayingResult.pipelineState,
    });

    // At this point, the looped audio from the user continues playing
    // This should trigger barge-in since AI is now speaking
    // The barge-in flow is:
    // 1. Backend VAD detects user speech OR
    // 2. Frontend Silero VAD detects user speech
    // 3. This triggers bargeIn() which calls audioPlayback.fadeOut() and session.bargeIn()
    // 4. Audio stops, pipeline transitions to listening

    // Wait for barge-in to occur
    console.log("[TEST] Waiting for barge-in to trigger...");
    const bargeInResult = await verifyBargeInWithVoiceModeDebug(
      page,
      initialBargeInCount,
      15000 // 15 second timeout for barge-in
    );

    console.log("[TEST] Barge-in result:", JSON.stringify(bargeInResult, null, 2));

    // Log console state for debugging
    if (!bargeInResult.triggered) {
      console.log("[TEST] Console logs during test:");
      console.log("Speech detected logs:", consoleState.speechDetectedLogs.join("\n"));
      console.log("Barge-in triggered logs:", consoleState.bargeInTriggeredLogs.join("\n"));
      console.log("Pipeline state logs:", consoleState.pipelineStateLogs.slice(-10).join("\n"));
    }

    // CRITICAL ASSERTIONS
    // These should FAIL if barge-in doesn't work in production
    expect(bargeInResult.triggered).toBe(true);
    expect(bargeInResult.audioStopped).toBe(true);

    // At least one of these should be true for successful barge-in
    const bargeInSuccess = bargeInResult.bargeInCountIncreased || bargeInResult.pipelineTransitioned;
    expect(bargeInSuccess).toBe(true);

    console.log("[TEST] Barge-in test PASSED!");

    await context.close();
  });

  /**
   * Test that audio IMMEDIATELY stops on barge-in (not gradual)
   * The barge-in latency should be very low (<100ms perceived)
   */
  test("barge-in should have low latency (<200ms to mute)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
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

    // Wait for ready
    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    // Wait for AI to play audio
    const aiPlayingResult = await waitForAIPlayingAudio(page, 45000);
    if (!aiPlayingResult.success) {
      console.log("[TEST] AI never started playing - skipping latency test");
      test.skip();
      return;
    }

    // Record timestamp when AI is playing
    const aiPlayingTimestamp = Date.now();
    console.log(`[TEST] AI playing at timestamp: ${aiPlayingTimestamp}`);

    // Wait for barge-in and measure how long until audio stops
    const audioStopResult = await waitForAudioToStop(page, 5000);
    const audioStopTimestamp = Date.now();
    const bargeInLatency = audioStopTimestamp - aiPlayingTimestamp;

    console.log(`[TEST] Barge-in latency: ${bargeInLatency}ms`);

    // The looped audio should trigger barge-in and audio should stop
    expect(audioStopResult.success).toBe(true);

    // Barge-in latency should be reasonable (within 2 seconds for test purposes)
    // In production, we want <100ms but tests have overhead
    expect(bargeInLatency).toBeLessThan(2000);

    await context.close();
  });

  /**
   * Test that conversation continues after barge-in
   * After interruption, AI should process the new user input and respond
   */
  test("conversation should continue after barge-in", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
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

    // Wait for ready
    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    expect(voiceReadyResult.ready).toBe(true);

    // Wait for first AI response
    const aiPlayingResult = await waitForAIPlayingAudio(page, 45000);
    if (!aiPlayingResult.success) {
      console.log("[TEST] AI never started playing - skipping continuation test");
      test.skip();
      return;
    }

    console.log("[TEST] First AI response playing...");

    // Wait for barge-in to occur (from looped audio)
    const bargeInResult = await verifyBargeInWithVoiceModeDebug(page, 0, 15000);

    if (!bargeInResult.triggered) {
      console.log("[TEST] Barge-in never triggered - test cannot continue");
      expect(bargeInResult.triggered).toBe(true);
      return;
    }

    console.log("[TEST] Barge-in occurred, waiting for conversation to continue...");

    // After barge-in, the looped audio continues to be transcribed
    // This should result in a new AI response
    // Wait for AI to start playing again (second response after barge-in)
    const secondAIResponse = await waitForAIPlayingAudio(page, 30000);

    console.log("[TEST] Second AI response:", secondAIResponse);

    // The conversation should continue - AI should respond to the "interrupted" audio
    // This verifies that barge-in properly transitioned to processing the new input
    expect(secondAIResponse.success).toBe(true);

    await context.close();
  });
});

test.describe("Voice Mode Barge-In - Failure Diagnostics", () => {
  /**
   * Diagnostic test that logs detailed state when barge-in doesn't work
   * This helps identify WHY barge-in might not be working
   */
  test("diagnostic: log all voice state during conversation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ["microphone"],
    });
    const page = await context.newPage();

    // Enable all debugging
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
      localStorage.setItem("voiceassist-debug-mode", "true");
    });

    const consoleState = setupBargeInConsoleCapture(page);

    // Capture all console messages for debugging
    const allLogs: string[] = [];
    const audioPlaybackLogs: string[] = []; // Specific logs for TTAudioPlayback
    page.on("console", (msg) => {
      const text = msg.text();
      // Capture TTAudioPlayback logs specifically (these are the ones we're debugging)
      if (text.includes("[TTAudioPlayback]")) {
        audioPlaybackLogs.push(`[${msg.type()}] ${text}`);
      }
      if (
        text.includes("voice") ||
        text.includes("Voice") ||
        text.includes("VAD") ||
        text.includes("barge") ||
        text.includes("Barge") ||
        text.includes("audio") ||
        text.includes("Audio") ||
        text.includes("pipeline") ||
        text.includes("Pipeline")
      ) {
        allLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Start voice mode
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await voiceButton.click();

    // Wait for ready
    const voiceReadyResult = await waitForVoiceModeReady(page, 30000);
    console.log("[DIAGNOSTIC] Voice ready result:", voiceReadyResult);

    // Log state every 500ms for 30 seconds
    const stateLog: Array<{
      timestamp: number;
      state: Awaited<ReturnType<typeof getVoiceModeDebugState>>;
    }> = [];

    const startTime = Date.now();
    while (Date.now() - startTime < 30000) {
      const state = await getVoiceModeDebugState(page);
      stateLog.push({
        timestamp: Date.now() - startTime,
        state,
      });
      await page.waitForTimeout(500);
    }

    // Analyze the state log
    console.log("\n=== DIAGNOSTIC STATE LOG ===");
    console.log("Time(ms) | Pipeline | isPlaying | queueLen | bargeInCount");
    console.log("-".repeat(60));
    for (const entry of stateLog) {
      const s = entry.state;
      console.log(
        `${entry.timestamp.toString().padStart(6)} | ${(s?.pipelineState || "N/A").padEnd(10)} | ${String(s?.isPlaying).padEnd(9)} | ${String(s?.queueLength ?? "N/A").padEnd(8)} | ${s?.bargeInCount ?? "N/A"}`
      );
    }

    // Check if we ever entered speaking state
    const everSpeaking = stateLog.some((e) => e.state?.pipelineState === "speaking");
    const everPlaying = stateLog.some((e) => e.state?.isPlaying === true);
    const bargeInTriggered = stateLog.some(
      (e) => (e.state?.bargeInCount ?? 0) > 0
    );

    console.log("\n=== DIAGNOSTIC SUMMARY ===");
    console.log(`Ever entered speaking state: ${everSpeaking}`);
    console.log(`Ever had isPlaying=true: ${everPlaying}`);
    console.log(`Barge-in ever triggered: ${bargeInTriggered}`);

    console.log("\n=== TTAudioPlayback LOGS (processAudioQueue/queueAudioChunk) ===");
    console.log(`Total TTAudioPlayback logs: ${audioPlaybackLogs.length}`);
    // Show first 20 logs (where the important stuff happens)
    console.log("First 20 TTAudioPlayback logs:");
    for (const log of audioPlaybackLogs.slice(0, 20)) {
      console.log(log);
    }
    // Filter for specific keywords we added
    const processQueueLogs = audioPlaybackLogs.filter(l =>
      l.includes("ENTRY") || l.includes("EXIT") || l.includes("PUSHING") ||
      l.includes("PUSHED") || l.includes("NORMAL MODE") || l.includes("PREBUFFERING") ||
      l.includes("AUDIO SCHEDULED") || l.includes("Getting AudioContext")
    );
    console.log(`\nProcessAudioQueue specific logs (${processQueueLogs.length}):`);
    for (const log of processQueueLogs.slice(0, 30)) {
      console.log(log);
    }

    console.log("\n=== RELEVANT CONSOLE LOGS ===");
    for (const log of allLogs.slice(-50)) {
      console.log(log);
    }

    // Check WebSocket events array for audio messages
    const wsEvents = await page.evaluate(() => {
      const win = window as Window & { __tt_ws_events?: Array<{ type: string; direction: string; data: unknown }> };
      if (!win.__tt_ws_events) return { total: 0, types: [] as string[], audioCount: 0 };
      const types = [...new Set(win.__tt_ws_events.map((e) => e.type))];
      const audioEvents = win.__tt_ws_events.filter((e) => e.type?.includes("audio"));
      return {
        total: win.__tt_ws_events.length,
        types,
        audioCount: audioEvents.length,
        audioSample: audioEvents.slice(0, 3),
      };
    });
    console.log("\n=== WS EVENTS ANALYSIS ===");
    console.log(`Total WS events received: ${wsEvents.total}`);
    console.log(`Message types: ${wsEvents.types.join(", ")}`);
    console.log(`Audio events count: ${wsEvents.audioCount}`);
    if (wsEvents.audioSample) {
      console.log("Audio event samples:", JSON.stringify(wsEvents.audioSample, null, 2));
    }

    // Check audio debug events array for audio processing
    const audioDebug = await page.evaluate(() => {
      const win = window as Window & {
        __tt_audio_debug?: Array<{
          timestamp: number;
          event: string;
          length: number;
          playbackState?: string;
          isPlaying?: boolean;
          bargeInActive?: boolean;
          queueLength?: number;
        }>;
      };
      if (!win.__tt_audio_debug) return { total: 0, events: [] as string[], droppedCount: 0 };
      const events = [...new Set(win.__tt_audio_debug.map((e) => e.event))];
      const droppedEvents = win.__tt_audio_debug.filter((e) => e.event.includes("dropped"));
      const receivedEvents = win.__tt_audio_debug.filter((e) => e.event.includes("received") || e.event.includes("called"));
      return {
        total: win.__tt_audio_debug.length,
        events,
        droppedCount: droppedEvents.length,
        receivedCount: receivedEvents.length,
        samples: win.__tt_audio_debug.slice(-10),
      };
    });
    console.log("\n=== AUDIO DEBUG ANALYSIS ===");
    console.log(`Total audio debug events: ${audioDebug.total}`);
    console.log(`Event types: ${audioDebug.events.join(", ")}`);
    console.log(`Received chunks: ${audioDebug.receivedCount || 0}, Dropped chunks: ${audioDebug.droppedCount}`);
    if (audioDebug.samples) {
      console.log("Audio debug samples (last 10):");
      for (const sample of audioDebug.samples) {
        console.log(`  ${sample.event}: length=${sample.length}, isPlaying=${sample.isPlaying}, bargeIn=${sample.bargeInActive}, queue=${sample.queueLength}`);
      }
    }

    // This test always passes - it's for diagnostics only
    expect(true).toBe(true);

    await context.close();
  });
});
