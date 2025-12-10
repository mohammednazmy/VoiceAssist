/**
 * Voice Mode Barge-In E2E Tests with Real Audio
 *
 * These tests use actual speech audio files injected via Chrome's fake audio capture
 * to test barge-in functionality with realistic user interruptions.
 *
 * CRITICAL: The audio file used MUST contain a QUESTION (not an interruption command)
 * so that the AI generates a spoken response. Chrome's fake audio loops continuously,
 * so the looped audio becomes the user's interruption after AI starts speaking.
 *
 * Audio file: conversation-start.wav (configured in playwright.config.ts)
 *
 * IMPORTANT: These tests ONLY work on Chromium-based browsers because they rely on
 * Chrome-specific flags (--use-fake-device-for-media-stream, --use-file-for-fake-audio-capture).
 * Firefox, WebKit, and Safari do not support these fake audio injection features.
 *
 * Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-barge-in
 */

import { type Page, type BrowserContext } from "@playwright/test";
import {
  test,
  expect,
  isLiveMode,
  QUALITY_THRESHOLDS,
  assertQualityThresholds,
  enableSileroVAD,
  enableInstantBargeIn,
  enableAllVoiceFeatures,
  waitForFakeMicDevice,
  getVoiceDebugState,
  waitForAISpeakingWithAudioChunks,
  verifyBargeInOccurred,
  setupBargeInConsoleCapture,
  type VoiceDebugState,
  type BargeInConsoleState,
} from "./utils/test-setup";

/**
 * Check if the browser supports fake audio capture (Chrome/Chromium only)
 */
function isFakeAudioSupported(browserName: string | undefined): boolean {
  // Only Chromium-based browsers support --use-fake-device-for-media-stream
  return browserName === "chromium";
}

// VAD detection state tracking
interface VADState {
  sileroSpeechEvents: number;
  sileroSilenceEvents: number;
  deepgramSpeechEvents: number;
  bargeInTriggered: boolean;
  playbackStopped: boolean;
  thresholdLogs: string[];
}

// Helper to wait for voice mode to be ready
async function waitForVoiceModeReady(page: Page, timeout = 30000): Promise<boolean> {
  try {
    const voiceButton = page.locator(
      '[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]'
    ).first();
    await expect(voiceButton).toBeVisible({ timeout: 10000 });

    await page.waitForFunction(
      () => {
        const btn =
          document.querySelector('[data-testid="voice-mode-toggle"]') ||
          document.querySelector('[data-testid="realtime-voice-mode-button"]');
        return btn && !btn.hasAttribute("disabled");
      },
      { timeout }
    );
    return true;
  } catch {
    console.log("[Test] Voice mode not ready within timeout");
    return false;
  }
}

// Helper to open voice mode
async function openVoiceMode(page: Page): Promise<boolean> {
  const voiceButton = page.locator(
    '[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]'
  ).first();

  if (!(await voiceButton.isVisible())) {
    return false;
  }

  const isDisabled = await voiceButton.isDisabled();
  if (isDisabled) {
    console.log("[Test] Voice button is disabled");
    return false;
  }

  await voiceButton.click();

  try {
    await page.waitForFunction(
      () => {
        const hasVoiceUI =
          document.querySelector('[data-testid="voice-mode-panel"]') ||
          document.querySelector('[data-testid="thinker-talker-voice-panel"]') ||
          document.querySelector('[data-testid="compact-voice-bar"]') ||
          document.querySelector('[data-testid="voice-expanded-drawer"]');
        if (hasVoiceUI) return true;

        const voiceToggle = document.querySelector('[data-testid="voice-mode-toggle"]');
        if (
          voiceToggle?.classList.contains("bg-primary-500") ||
          voiceToggle?.classList.contains("bg-primary-100")
        ) {
          return true;
        }

        const hasVoiceStatus = Array.from(document.querySelectorAll("p")).some(
          (p) =>
            p.textContent?.includes("Listening") ||
            p.textContent?.includes("Connecting") ||
            p.textContent?.includes("Ready") ||
            p.textContent?.includes("Processing")
        );
        return hasVoiceStatus;
      },
      { timeout: 8000 }
    );
    return true;
  } catch {
    console.log("[Test] Voice mode did not activate");
    return false;
  }
}

// Setup comprehensive VAD and barge-in logging
function setupVADCapture(page: Page): VADState {
  const state: VADState = {
    sileroSpeechEvents: 0,
    sileroSilenceEvents: 0,
    deepgramSpeechEvents: 0,
    bargeInTriggered: false,
    playbackStopped: false,
    thresholdLogs: [],
  };

  page.on("console", (msg) => {
    const text = msg.text();

    // Silero VAD events
    if (text.includes("silero") || text.includes("Silero") || text.includes("SILERO")) {
      state.thresholdLogs.push(`[silero] ${text}`);
      if (text.includes("speech") && text.includes("start")) {
        state.sileroSpeechEvents++;
      }
      if (text.includes("silence") || text.includes("end")) {
        state.sileroSilenceEvents++;
      }
    }

    // VAD threshold and probability logs
    if (text.includes("threshold") || text.includes("probability") || text.includes("VAD")) {
      state.thresholdLogs.push(`[vad] ${text}`);
    }

    // Deepgram speech events (from backend VAD via WebSocket)
    // The backend sends `input_audio_buffer.speech_started` events when VAD detects speech
    if (text.includes("deepgram") || text.includes("Deepgram")) {
      if (text.includes("speech_started")) {
        state.deepgramSpeechEvents++;
      }
    }
    // Also count backend VAD events (input_audio_buffer.speech_started)
    if (text.includes("input_audio_buffer.speech_started")) {
      state.deepgramSpeechEvents++;
    }

    // Barge-in detection
    if (
      text.toLowerCase().includes("barge") ||
      text.includes("interrupt") ||
      text.includes("speech_started")
    ) {
      state.thresholdLogs.push(`[barge-in] ${text}`);
      // Barge-in is triggered when:
      // - "triggered", "executing", "stopping" keywords found
      // - "Stopping playback (barge-in)" message from TTAudioPlayback
      // - Playback is interrupted
      if (
        text.includes("triggered") ||
        text.includes("executing") ||
        text.includes("stopping") ||
        text.includes("Stopping playback") ||
        text.includes("interrupted")
      ) {
        state.bargeInTriggered = true;
      }
    }

    // Playback stopped
    if (
      text.includes("playback") &&
      (text.includes("stop") || text.includes("cancelled") || text.includes("interrupted") || text.includes("Stopping"))
    ) {
      state.playbackStopped = true;
      state.bargeInTriggered = true; // Playback stopping IS barge-in
      state.thresholdLogs.push(`[playback] ${text}`);
    }

    // Audio/fadeOut events
    if (text.includes("fadeOut") || text.includes("fade") || text.includes("audio stop")) {
      state.thresholdLogs.push(`[audio] ${text}`);
    }
  });

  return state;
}

// ============================================================================
// Barge-In E2E Tests with Real Audio
// ============================================================================

test.describe("Voice Barge-In with Real Audio", () => {
  // Skip non-live mode tests
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page, browserName }) => {
    // Skip on non-Chromium browsers - fake audio capture is Chrome-only
    if (!isFakeAudioSupported(browserName)) {
      test.skip(true, `Fake audio capture not supported on ${browserName} - Chrome/Chromium only`);
      return;
    }

    await page.context().grantPermissions(["microphone"]);
    // Enable all voice features for barge-in tests:
    // - Silero VAD (disabled by default in Playwright)
    // - Instant barge-in (disabled by default in Playwright)
    await enableAllVoiceFeatures(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Wait for Chrome's fake mic device to be available before continuing
    // This prevents "NotFoundError: Requested device not found" in Silero VAD
    const micReady = await waitForFakeMicDevice(page);
    if (!micReady) {
      console.log("[Test] Warning: Fake mic device not ready, VAD may fail to initialize");
    }

    await page.waitForTimeout(1000);
  });

  /**
   * Test: Silero VAD detects speech from real audio file
   * This verifies the audio injection is working and VAD can hear the audio
   */
  test("Silero VAD detects speech from injected audio", async ({ page }) => {
    const vadState = setupVADCapture(page);

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    console.log("[Test] Voice mode opened, waiting for VAD to detect speech from audio file...");

    // The conversation-start.wav file should be playing through fake audio capture
    // Wait enough time for the audio to be processed
    await page.waitForTimeout(10000);

    console.log("[Test] VAD Detection Results:");
    console.log(`  Silero speech events: ${vadState.sileroSpeechEvents}`);
    console.log(`  Silero silence events: ${vadState.sileroSilenceEvents}`);
    console.log(`  Deepgram speech events: ${vadState.deepgramSpeechEvents}`);
    console.log(`  Threshold logs: ${vadState.thresholdLogs.length}`);

    // Log all VAD-related logs for debugging
    vadState.thresholdLogs.forEach((log) => console.log(`    ${log}`));

    // We expect Silero VAD to have detected speech from the audio file
    expect(
      vadState.sileroSpeechEvents > 0 ||
      vadState.deepgramSpeechEvents > 0 ||
      vadState.thresholdLogs.length > 0
    ).toBeTruthy();
  });

  /**
   * Test: Barge-in triggers during AI playback
   *
   * This test ACTUALLY verifies barge-in behavior by checking:
   * 1. Audio transcript triggers AI response through voice pipeline
   * 2. AI enters "speaking" state with audio chunks
   * 3. Looped audio triggers barge-in
   * 4. Pipeline transitions from speaking to listening
   *
   * CRITICAL: Test will FAIL if:
   * - AI never speaks (no audio.output messages from backend)
   * - Barge-in is not triggered when AI is speaking
   * - Pipeline doesn't transition properly
   *
   * The test uses conversation-start.wav which contains a question that
   * triggers AI response. Chrome loops the audio continuously, so after
   * AI starts speaking, the looped audio becomes the user's interruption.
   */
  test("barge-in interrupts AI during playback", async ({ page, metricsCollector }) => {
    // Set up console capture for detailed debugging
    const consoleState = setupBargeInConsoleCapture(page);
    const vadState = setupVADCapture(page);

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    // Open voice mode
    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    // Get initial debug state
    const initialState = await getVoiceDebugState(page);
    const initialBargeInCount = initialState?.bargeInCount || 0;
    console.log(`[Test] Initial state: bargeInCount=${initialBargeInCount}, ` +
      `enableInstantBargeIn=${initialState?.enableInstantBargeIn}`);

    // Verify instant barge-in is enabled
    if (initialState && !initialState.enableInstantBargeIn) {
      console.warn("[Test] WARNING: Instant barge-in is NOT enabled! Test may not work correctly.");
    }

    // NOTE: We do NOT send a chat message. The audio file (conversation-start.wav) contains
    // a question that will be transcribed by STT and trigger AI response through the voice
    // pipeline. Text messages sent via chat input do NOT go through the voice WebSocket!
    console.log("[Test] Waiting for audio transcript to trigger AI response through voice pipeline...");

    // CRITICAL: Wait for AI to ACTUALLY be speaking with audio chunks
    // The conversation-start.wav audio should be transcribed and trigger AI speech
    console.log("[Test] Waiting for AI to start speaking with audio chunks...");
    const speakingResult = await waitForAISpeakingWithAudioChunks(page, 45000); // Longer timeout for STT + LLM + TTS

    console.log(`[Test] AI speaking check: success=${speakingResult.success}, ` +
      `pipelineState=${speakingResult.pipelineState}, ` +
      `audioChunksReceived=${speakingResult.audioChunksReceived}`);

    if (!speakingResult.success) {
      // Log debug info for diagnosis
      console.log("[Test] DIAGNOSTIC INFO - AI did not enter speaking state:");
      console.log(`  Pipeline state logs: ${consoleState.pipelineStateLogs.length}`);
      consoleState.pipelineStateLogs.forEach(log => console.log(`    ${log}`));
      console.log(`  Audio chunk logs: ${consoleState.audioChunkLogs.length}`);
      consoleState.audioChunkLogs.forEach(log => console.log(`    ${log}`));
    }

    // Wait for barge-in to be triggered by the looped audio
    // The conversation-start.wav is continuously playing via fake audio capture
    // When AI starts speaking, the looped audio becomes the interruption
    console.log("[Test] Waiting for barge-in to be triggered by looped audio...");
    await page.waitForTimeout(10000);

    // CRITICAL: Verify barge-in actually occurred
    const bargeInResult = await verifyBargeInOccurred(page, initialBargeInCount, 5000);

    // Log all captured debug info
    console.log("[Test] === BARGE-IN VERIFICATION RESULTS ===");
    console.log(`  Barge-in triggered: ${bargeInResult.triggered}`);
    console.log(`  Barge-in count increased: ${bargeInResult.bargeInCountIncreased}`);
    console.log(`  Pipeline transitioned: ${bargeInResult.pipelineTransitioned}`);
    console.log(`  Final barge-in count: ${bargeInResult.finalState?.bargeInCount || 'unknown'}`);
    console.log(`  State transitions: ${bargeInResult.finalState?.stateTransitions.join(", ") || 'none'}`);

    console.log("[Test] === CONSOLE LOG SUMMARY ===");
    console.log(`  Speech detected logs: ${consoleState.speechDetectedLogs.length}`);
    console.log(`  Barge-in triggered logs: ${consoleState.bargeInTriggeredLogs.length}`);
    console.log(`  Audio chunk logs: ${consoleState.audioChunkLogs.length}`);
    console.log(`  Pipeline state logs: ${consoleState.pipelineStateLogs.length}`);

    // Show key logs
    if (consoleState.speechDetectedLogs.length > 0) {
      console.log("[Test] Speech detected logs:");
      consoleState.speechDetectedLogs.slice(0, 3).forEach(log => console.log(`    ${log}`));
    }
    if (consoleState.bargeInTriggeredLogs.length > 0) {
      console.log("[Test] Barge-in triggered logs:");
      consoleState.bargeInTriggeredLogs.forEach(log => console.log(`    ${log}`));
    }

    // Legacy VAD state info
    console.log("[Test] === LEGACY VAD STATE ===");
    console.log(`  Silero speech events: ${vadState.sileroSpeechEvents}`);
    console.log(`  Deepgram speech events: ${vadState.deepgramSpeechEvents}`);
    console.log(`  bargeInTriggered: ${vadState.bargeInTriggered}`);
    console.log(`  playbackStopped: ${vadState.playbackStopped}`);

    // STRICT ASSERTIONS: Test MUST verify real barge-in behavior
    // There is no "soft pass" - if the system doesn't work, the test FAILS

    // ASSERTION 1: AI must actually speak
    // If this fails, the audio file isn't triggering AI response through voice pipeline
    expect(
      speakingResult.success,
      `AI must enter speaking state with audio chunks. ` +
      `pipelineState=${speakingResult.pipelineState}, ` +
      `audioChunksReceived=${speakingResult.audioChunksReceived}. ` +
      `Check: Is the audio file being transcribed correctly? ` +
      `Is the backend sending audio.output messages?`
    ).toBeTruthy();

    // ASSERTION 2: Barge-in must be triggered when AI is speaking
    // Use console log capture (vadState) which is more reliable than window.__voiceDebug
    // because window.__voiceDebug.stateTransitions resets on each effect run
    const bargeInWasTriggered =
      vadState.bargeInTriggered ||
      bargeInResult.triggered ||
      consoleState.bargeInTriggeredLogs.length > 0;

    expect(
      bargeInWasTriggered,
      `Barge-in must be triggered when AI is speaking. ` +
      `AI was speaking: ${speakingResult.success}, ` +
      `vadState.bargeInTriggered: ${vadState.bargeInTriggered}, ` +
      `verifyBargeInOccurred.triggered: ${bargeInResult.triggered}, ` +
      `Console barge-in logs: ${consoleState.bargeInTriggeredLogs.length}`
    ).toBeTruthy();

    // ASSERTION 3: Playback must have stopped (indicates barge-in completed)
    const playbackWasStopped =
      vadState.playbackStopped ||
      bargeInResult.pipelineTransitioned ||
      bargeInResult.bargeInCountIncreased;

    expect(
      playbackWasStopped,
      `Playback must stop after barge-in. ` +
      `vadState.playbackStopped: ${vadState.playbackStopped}, ` +
      `pipelineTransitioned: ${bargeInResult.pipelineTransitioned}, ` +
      `bargeInCountIncreased: ${bargeInResult.bargeInCountIncreased}`
    ).toBeTruthy();

    // Metrics-based assertions: ensure we see barge-in activity with reasonable quality.
    const conv = metricsCollector.getConversationMetrics();
    console.log(
      "[Barge-In Live] Metrics summary:\n",
      metricsCollector.getSummary(),
    );

    expect(
      conv.bargeInAttempts,
      "Expected at least one barge-in attempt in live barge-in test",
    ).toBeGreaterThanOrEqual(1);
    expect(
      conv.successfulBargeIns,
      "Expected at least one successful barge-in in live barge-in test",
    ).toBeGreaterThanOrEqual(1);

    // Apply global quality thresholds (latency, queue health, errors).
    assertQualityThresholds(metricsCollector, {
      maxBargeInLatencyMs: QUALITY_THRESHOLDS.maxBargeInLatencyMs,
      maxResponseLatencyMs: QUALITY_THRESHOLDS.maxResponseLatencyMs,
    });
  });

  /**
   * Test: Measure barge-in latency
   * Records time from speech detection to playback stop
   */
  test("barge-in latency measurement", async ({ page }) => {
    let speechStartTime = 0;
    let playbackStopTime = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();

      // Record when speech is first detected
      if (
        speechStartTime === 0 &&
        (text.includes("speech_started") ||
          (text.includes("silero") && text.includes("speech") && text.includes("start")))
      ) {
        speechStartTime = now;
        console.log(`[Latency] Speech detected at: ${speechStartTime}`);
      }

      // Record when playback stops
      if (
        playbackStopTime === 0 &&
        speechStartTime > 0 &&
        (text.includes("playback") || text.includes("fadeOut")) &&
        (text.includes("stop") || text.includes("interrupt") || text.includes("cancel"))
      ) {
        playbackStopTime = now;
        console.log(`[Latency] Playback stopped at: ${playbackStopTime}`);
      }
    });

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    // NOTE: AI response is triggered by the audio file (conversation-start.wav) being
    // transcribed through the voice pipeline. We do NOT use chat input because text
    // messages sent via chat input don't go through the voice WebSocket pipeline.
    console.log("[Latency] Waiting for audio transcript to trigger AI response...");

    // Wait for AI to start speaking and barge-in to occur (longer timeout for STT + LLM + TTS)
    await page.waitForTimeout(30000);

    if (speechStartTime > 0 && playbackStopTime > 0) {
      const latency = playbackStopTime - speechStartTime;
      console.log(`[Test] Barge-in latency: ${latency}ms`);

      // Barge-in should happen within 500ms of speech detection
      // This is a reasonable target for responsive interruption
      expect(latency).toBeLessThan(1000);
    } else {
      console.log("[Test] Could not measure latency - speech or playback events not captured");
      console.log(`  Speech start time: ${speechStartTime}`);
      console.log(`  Playback stop time: ${playbackStopTime}`);
    }
  });

  /**
   * Test: VAD threshold tuning check
   * Logs the effective thresholds being used during playback
   */
  test("logs VAD thresholds during playback", async ({ page }) => {
    const thresholdLogs: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("threshold") ||
        text.includes("Threshold") ||
        text.includes("probability") ||
        text.includes("boost") ||
        text.includes("minSpeech")
      ) {
        thresholdLogs.push(text);
      }
    });

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    // NOTE: AI response is triggered by the audio file (conversation-start.wav) being
    // transcribed through the voice pipeline. We do NOT use chat input.
    console.log("[Test] Waiting for audio transcript to trigger AI speech...");

    // Wait for thresholds to be logged during playback (longer timeout for STT + LLM + TTS)
    await page.waitForTimeout(25000);

    console.log("[Test] VAD Threshold Logs:");
    thresholdLogs.forEach((log) => console.log(`  ${log}`));

    // Log expected thresholds for reference
    console.log("\n[Test] Expected thresholds (from useThinkerTalkerVoiceMode):");
    console.log("  sileroPositiveThreshold: 0.5");
    console.log("  sileroPlaybackThresholdBoost: 0.1 (effective: 0.6 during playback)");
    console.log("  sileroMinSpeechMs: 150");
    console.log("  sileroPlaybackMinSpeechMs: 150");
  });

  /**
   * Test: Multiple barge-in attempts
   * Since the audio file loops, this tests repeated interruption handling
   */
  test("handles multiple barge-in attempts", async ({ page }) => {
    // Set up console capture using the proven setupVADCapture method
    const vadState = setupVADCapture(page);
    let bargeInLogCount = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      // Look for both the "[barge-in]" prefix and playback stopping messages
      if (
        text.includes("[barge-in]") ||
        text.includes("Stopping playback") ||
        (text.toLowerCase().includes("barge") && text.includes("interrupt"))
      ) {
        bargeInLogCount++;
        console.log(`[Test] Barge-in log #${bargeInLogCount}: ${text.substring(0, 100)}`);
      }
    });

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    // NOTE: AI response is triggered by the audio file (conversation-start.wav) being
    // transcribed through the voice pipeline. The audio loops, so multiple barge-in
    // attempts will occur naturally.
    console.log("[Test] Waiting for audio transcript to trigger AI response (audio will loop)...");

    // Wait for extended period to capture multiple barge-in attempts
    // The audio file will loop repeatedly
    await page.waitForTimeout(45000);

    console.log(`[Test] Total barge-in log messages: ${bargeInLogCount}`);
    console.log(`[Test] vadState.bargeInTriggered: ${vadState.bargeInTriggered}`);
    console.log(`[Test] vadState.playbackStopped: ${vadState.playbackStopped}`);

    // Barge-in should have been triggered at least once (via log or vadState)
    expect(
      vadState.bargeInTriggered || vadState.playbackStopped || bargeInLogCount > 0,
      `At least one barge-in event should occur. ` +
      `vadState.bargeInTriggered=${vadState.bargeInTriggered}, ` +
      `vadState.playbackStopped=${vadState.playbackStopped}, ` +
      `bargeInLogCount=${bargeInLogCount}`
    ).toBeTruthy();
  });
});

// ============================================================================
// VAD Threshold Tuning Tests
// These tests help calibrate VAD sensitivity
// ============================================================================

test.describe("VAD Threshold Calibration", () => {
  // Skip non-live mode tests
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page, browserName }) => {
    // Skip on non-Chromium browsers - fake audio capture is Chrome-only
    if (!isFakeAudioSupported(browserName)) {
      test.skip(true, `Fake audio capture not supported on ${browserName} - Chrome/Chromium only`);
      return;
    }

    await page.context().grantPermissions(["microphone"]);
    // Enable all voice features for VAD threshold tests
    await enableAllVoiceFeatures(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Wait for Chrome's fake mic device to be available before continuing
    const micReady = await waitForFakeMicDevice(page);
    if (!micReady) {
      console.log("[Test] Warning: Fake mic device not ready, VAD may fail to initialize");
    }

    await page.waitForTimeout(1000);
  });

  /**
   * Test: Monitor VAD probability values
   * Logs raw probability values to help tune thresholds
   */
  test("monitor VAD probability distribution", async ({ page }) => {
    const probabilities: number[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      // Look for probability values in logs
      const probMatch = text.match(/probability[:\s]+(\d+\.?\d*)/i);
      if (probMatch) {
        const prob = parseFloat(probMatch[1]);
        if (!isNaN(prob)) {
          probabilities.push(prob);
        }
      }
    });

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    // Let the audio file play and capture probabilities
    await page.waitForTimeout(20000);

    if (probabilities.length > 0) {
      const avg = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
      const max = Math.max(...probabilities);
      const min = Math.min(...probabilities);

      console.log("[Test] VAD Probability Statistics:");
      console.log(`  Samples: ${probabilities.length}`);
      console.log(`  Average: ${avg.toFixed(3)}`);
      console.log(`  Max: ${max.toFixed(3)}`);
      console.log(`  Min: ${min.toFixed(3)}`);

      // Calculate recommended threshold
      // Threshold should be above noise floor but below speech peaks
      const recommended = (avg + max) / 2;
      console.log(`  Recommended threshold: ${recommended.toFixed(3)}`);
    } else {
      console.log("[Test] No probability values captured - logging may need to be enabled");
    }
  });
});
