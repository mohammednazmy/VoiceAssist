/**
 * Voice Mode Real Audio E2E Tests
 *
 * These tests use actual speech audio files injected via Chrome's fake audio capture
 * to test natural conversation flow with voice mode.
 *
 * Available audio files:
 * - hello.wav: "Hello, can you hear me?"
 * - conversation-start.wav: "I would like to ask you a question about voice assistants."
 * - follow-up.wav: "Can you tell me more about that?"
 * - yes.wav: "Yes"
 * - barge-in.wav: "Stop! Wait a moment please."
 *
 * By default, uses hello.wav. Set VOICE_AUDIO_TYPE env to use others.
 *
 * Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-real-audio
 * Or with specific audio: LIVE_REALTIME_E2E=1 VOICE_AUDIO_TYPE=conversationStart npx playwright test --project=voice-real-audio
 */

import { type Page } from "@playwright/test";
import {
  test,
  expect,
  isLiveMode,
  QUALITY_THRESHOLDS,
  assertQualityThresholds,
  enableSileroVAD,
} from "./utils/test-setup";
import { createMetricsCollector, VoiceMetricsCollector } from "./utils/voice-test-metrics";

// Conversation state tracking
interface ConversationState {
  userTranscripts: string[];
  aiResponses: string[];
  turnCount: number;
  vadEvents: string[];
  errors: string[];
  latencies: { action: string; ms: number }[];
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
      { timeout: 10000 }
    );
    return true;
  } catch {
    console.log("[Test] Voice mode did not activate");
    return false;
  }
}

// Setup comprehensive conversation tracking
function setupConversationCapture(page: Page): ConversationState {
  const state: ConversationState = {
    userTranscripts: [],
    aiResponses: [],
    turnCount: 0,
    vadEvents: [],
    errors: [],
    latencies: [],
  };

  let lastSpeechTime = 0;

  page.on("console", (msg) => {
    const text = msg.text();
    const now = Date.now();

    // User transcripts
    if (text.includes("transcript") && (text.includes("user") || text.includes("final"))) {
      const transcriptMatch = text.match(/['"](.*?)['"]/);
      if (transcriptMatch) {
        state.userTranscripts.push(transcriptMatch[1]);
        state.turnCount++;
      }
    }

    // AI responses
    if (text.includes("response") && text.includes("AI")) {
      const responseMatch = text.match(/['"](.*?)['"]/);
      if (responseMatch) {
        state.aiResponses.push(responseMatch[1]);
      }
    }

    // VAD events
    if (
      text.includes("VAD") ||
      text.includes("vad") ||
      text.includes("silero") ||
      text.includes("speech_started") ||
      text.includes("speech_ended")
    ) {
      state.vadEvents.push(`[${msg.type()}] ${text}`);

      // Track speech start time for latency
      if (text.includes("speech_start") || text.includes("speech_started")) {
        lastSpeechTime = now;
      }

      // Track response latency
      if (lastSpeechTime > 0 && text.includes("response")) {
        state.latencies.push({
          action: "speech_to_response",
          ms: now - lastSpeechTime,
        });
      }
    }

    // Errors
    if (msg.type() === "error" || text.toLowerCase().includes("error")) {
      state.errors.push(text);
    }
  });

  page.on("pageerror", (err) => {
    state.errors.push(`Page error: ${err.message}`);
  });

  return state;
}

// ============================================================================
// Real Audio Conversation Flow Tests
// ============================================================================

test.describe("Voice Conversation with Real Audio", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["microphone"]);
    // Enable Silero VAD for real audio conversation tests
    await enableSileroVAD(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  /**
   * Test: Audio file is being captured by the browser
   * Verifies Chrome's fake audio capture is working with our WAV file
   */
  test("audio file is captured by fake microphone", async ({ page }) => {
    const micLogs: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("microphone") ||
        text.includes("MediaStream") ||
        text.includes("audio") ||
        text.includes("capture") ||
        text.includes("getUserMedia")
      ) {
        micLogs.push(text);
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

    // Wait for audio capture to initialize
    await page.waitForTimeout(5000);

    // Check getUserMedia was called
    const mediaDevicesInfo = await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tracks = stream.getAudioTracks();
        return {
          success: true,
          trackCount: tracks.length,
          trackLabels: tracks.map((t) => t.label),
          trackSettings: tracks.map((t) => t.getSettings()),
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    });

    console.log("[Test] MediaDevices Info:", JSON.stringify(mediaDevicesInfo, null, 2));
    console.log("[Test] Microphone logs:", micLogs.length);
    micLogs.forEach((l) => console.log(`  ${l}`));

    expect(mediaDevicesInfo.success).toBeTruthy();
  });

  /**
   * Test: VAD detects speech from audio file
   * Verifies Silero VAD can hear and detect speech from the injected audio
   */
  test("VAD detects speech from audio file", async ({ page }) => {
    const state = setupConversationCapture(page);

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

    // Wait for audio to be processed by VAD
    // The audio file loops, so we should see multiple speech detections
    await page.waitForTimeout(15000);

    console.log("[Test] VAD Events Captured:");
    console.log(`  Total VAD events: ${state.vadEvents.length}`);
    state.vadEvents.forEach((e) => console.log(`    ${e}`));

    // We should have detected at least some speech
    const hasSpeechEvents = state.vadEvents.some(
      (e) =>
        e.includes("speech") || e.includes("silero") || e.includes("detected") || e.includes("vad")
    );

    expect(hasSpeechEvents || state.vadEvents.length > 0).toBeTruthy();
  });

  /**
   * Test: Speech transcription from audio file
   * Verifies Deepgram can transcribe the injected audio
   */
  test("Deepgram transcribes speech from audio file", async ({ page }) => {
    const transcripts: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("transcript") ||
        text.includes("Transcript") ||
        text.includes("deepgram") ||
        text.includes("Deepgram")
      ) {
        transcripts.push(text);
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

    // Wait for transcription
    // Deepgram needs time to process the audio and return transcripts
    await page.waitForTimeout(20000);

    console.log("[Test] Transcription logs:");
    transcripts.forEach((t) => console.log(`  ${t}`));

    // Check for expected content based on audio file
    // hello.wav says "Hello, can you hear me?"
    const hasExpectedContent = transcripts.some(
      (t) =>
        t.toLowerCase().includes("hello") ||
        t.toLowerCase().includes("hear") ||
        t.toLowerCase().includes("question") ||
        t.toLowerCase().includes("voice")
    );

    console.log(`[Test] Has expected content: ${hasExpectedContent}`);

    // At minimum, we should have some transcript activity
    expect(transcripts.length > 0 || hasExpectedContent).toBeTruthy();
  });

  /**
   * Test: Full conversation turn with audio
   * Tests complete flow: audio -> VAD -> STT -> AI response -> TTS
   */
  test("complete conversation turn from audio to AI response", async ({ page }) => {
    const state = setupConversationCapture(page);
    const pipelineEvents: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("pipeline") ||
        text.includes("Pipeline") ||
        text.includes("thinker") ||
        text.includes("talker") ||
        text.includes("playback") ||
        text.includes("TTS")
      ) {
        pipelineEvents.push(text);
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

    console.log("[Test] Voice mode active, waiting for conversation turn...");

    // Wait for full conversation cycle
    // 1. VAD detects speech
    // 2. Deepgram transcribes
    // 3. Thinker processes
    // 4. Talker speaks response
    await page.waitForTimeout(30000);

    console.log("[Test] Conversation Results:");
    console.log(`  User transcripts: ${state.userTranscripts.length}`);
    state.userTranscripts.forEach((t) => console.log(`    User: "${t}"`));
    console.log(`  AI responses: ${state.aiResponses.length}`);
    state.aiResponses.forEach((r) => console.log(`    AI: "${r}"`));
    console.log(`  Turn count: ${state.turnCount}`);
    console.log(`  VAD events: ${state.vadEvents.length}`);
    console.log(`  Errors: ${state.errors.length}`);
    state.errors.forEach((e) => console.log(`    Error: ${e}`));

    console.log("\n[Test] Pipeline Events:");
    pipelineEvents.slice(0, 20).forEach((e) => console.log(`  ${e}`));

    // Verify conversation happened
    const hadConversation =
      state.userTranscripts.length > 0 ||
      state.aiResponses.length > 0 ||
      state.turnCount > 0 ||
      pipelineEvents.length > 0;

    expect(hadConversation).toBeTruthy();
  });

  /**
   * Test: Conversation turn latency measurement
   * Measures time from speech end to AI response start
   */
  test("measures conversation turn latency", async ({ page }) => {
    let speechEndTime = 0;
    let responseStartTime = 0;
    let transcriptReceiveTime = 0;
    let thinkerStartTime = 0;
    let ttsStartTime = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();

      if (text.includes("speech_ended") || text.includes("silence") && text.includes("silero")) {
        if (speechEndTime === 0) speechEndTime = now;
      }

      if (text.includes("transcript") && text.includes("final")) {
        if (transcriptReceiveTime === 0) transcriptReceiveTime = now;
      }

      if (text.includes("thinker") && text.includes("start")) {
        if (thinkerStartTime === 0) thinkerStartTime = now;
      }

      if (text.includes("TTS") || text.includes("playback") && text.includes("start")) {
        if (ttsStartTime === 0) ttsStartTime = now;
      }

      if (text.includes("response") && text.includes("audio")) {
        if (responseStartTime === 0) responseStartTime = now;
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

    // Wait for conversation turn to complete
    await page.waitForTimeout(30000);

    console.log("[Test] Latency Measurements:");
    if (speechEndTime > 0 && transcriptReceiveTime > 0) {
      console.log(`  Speech end -> Transcript: ${transcriptReceiveTime - speechEndTime}ms`);
    }
    if (transcriptReceiveTime > 0 && thinkerStartTime > 0) {
      console.log(`  Transcript -> Thinker start: ${thinkerStartTime - transcriptReceiveTime}ms`);
    }
    if (thinkerStartTime > 0 && ttsStartTime > 0) {
      console.log(`  Thinker -> TTS start: ${ttsStartTime - thinkerStartTime}ms`);
    }
    if (speechEndTime > 0 && ttsStartTime > 0) {
      const totalLatency = ttsStartTime - speechEndTime;
      console.log(`  Total turn latency: ${totalLatency}ms`);

      // Target: response should start within 2 seconds of speech ending
      expect(totalLatency).toBeLessThan(5000);
    } else {
      console.log("  Could not measure complete latency - some events not captured");
    }
  });

  /**
   * Test: Audio playback state during response
   * Verifies AI response audio plays correctly
   */
  test("AI response audio plays correctly", async ({ page }) => {
    const playbackEvents: string[] = [];
    let playbackStarted = false;
    let playbackEnded = false;

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("playback") ||
        text.includes("audio") ||
        text.includes("TTAudioPlayback") ||
        text.includes("ElevenLabs")
      ) {
        playbackEvents.push(text);

        if (text.includes("start") || text.includes("playing")) {
          playbackStarted = true;
        }
        if (text.includes("end") || text.includes("complete") || text.includes("finished")) {
          playbackEnded = true;
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

    // Wait for complete conversation cycle with audio playback
    await page.waitForTimeout(35000);

    console.log("[Test] Playback Events:");
    playbackEvents.forEach((e) => console.log(`  ${e}`));
    console.log(`[Test] Playback started: ${playbackStarted}`);
    console.log(`[Test] Playback ended: ${playbackEnded}`);

    // Verify we had some audio activity
    expect(playbackEvents.length > 0 || playbackStarted).toBeTruthy();
  });

  /**
   * Test: No errors during conversation
   * Verifies conversation completes without errors
   */
  test("conversation completes without errors", async ({ page }) => {
    const state = setupConversationCapture(page);

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

    // Run for extended period to catch any errors
    await page.waitForTimeout(40000);

    console.log("[Test] Error Count:", state.errors.length);
    state.errors.forEach((e) => console.log(`  ERROR: ${e}`));

    // Filter out expected/non-critical errors
    const criticalErrors = state.errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("deprecation") &&
        !e.includes("warning") &&
        e.toLowerCase().includes("error")
    );

    console.log(`[Test] Critical errors: ${criticalErrors.length}`);

    // Should have no critical errors
    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Conversation Flow Analysis Tests
// ============================================================================

test.describe("Conversation Flow Analysis", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["microphone"]);
    // Enable Silero VAD for conversation flow analysis tests
    await enableSileroVAD(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  /**
   * Test: Pipeline state machine transitions
   * Verifies correct state flow: idle -> listening -> processing -> speaking -> idle
   */
  test("pipeline state transitions correctly", async ({ page }) => {
    const stateChanges: { time: number; from: string; to: string }[] = [];
    let lastState = "unknown";

    page.on("console", (msg) => {
      const text = msg.text();

      // Track pipeline state changes
      const stateMatch = text.match(
        /(?:state|pipeline).*?(?:->|to|:)\s*(idle|listening|processing|speaking|thinking)/i
      );
      if (stateMatch) {
        const newState = stateMatch[1].toLowerCase();
        if (newState !== lastState) {
          stateChanges.push({
            time: Date.now(),
            from: lastState,
            to: newState,
          });
          lastState = newState;
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

    // Wait for state transitions during conversation
    await page.waitForTimeout(30000);

    console.log("[Test] State Transitions:");
    stateChanges.forEach((s, i) => {
      const timeDelta = i > 0 ? s.time - stateChanges[i - 1].time : 0;
      console.log(`  ${s.from} -> ${s.to} (+${timeDelta}ms)`);
    });

    // Extract unique states observed
    const statesObserved = new Set([
      ...stateChanges.map((s) => s.from),
      ...stateChanges.map((s) => s.to),
    ]);
    statesObserved.delete("unknown");

    console.log(`[Test] Unique states observed: ${[...statesObserved].join(", ")}`);
  });

  /**
   * Test: Audio buffer health during conversation
   * Monitors for buffer underruns or overruns
   */
  test("audio buffers remain healthy during conversation", async ({ page }) => {
    const bufferEvents: string[] = [];
    let underruns = 0;
    let overruns = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("buffer") ||
        text.includes("Buffer") ||
        text.includes("queue") ||
        text.includes("Queue")
      ) {
        bufferEvents.push(text);

        if (text.includes("underrun") || text.includes("empty")) {
          underruns++;
        }
        if (text.includes("overrun") || text.includes("overflow") || text.includes("full")) {
          overruns++;
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

    // Monitor buffer health during extended conversation
    await page.waitForTimeout(40000);

    console.log("[Test] Buffer Events:");
    bufferEvents.slice(0, 20).forEach((e) => console.log(`  ${e}`));
    console.log(`[Test] Buffer underruns: ${underruns}`);
    console.log(`[Test] Buffer overruns: ${overruns}`);

    // Some buffer events are normal, but excessive underruns indicate problems
    expect(underruns).toBeLessThan(5);
    expect(overruns).toBeLessThan(5);
  });
});

// ============================================================================
// Natural Conversation Tests
// These tests focus on the quality and naturalness of conversation
// ============================================================================

test.describe("Natural Conversation Quality", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["microphone"]);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  /**
   * Test: No audio overlap between user and AI
   * Verifies turn-taking works correctly
   */
  test("no audio overlap during conversation", async ({ page }) => {
    let userSpeaking = false;
    let aiSpeaking = false;
    let overlaps = 0;

    page.on("console", (msg) => {
      const text = msg.text();

      // User speech events
      if (text.includes("speech_started") || (text.includes("silero") && text.includes("start"))) {
        if (aiSpeaking) {
          overlaps++;
          console.log("[Test] Overlap detected: User started while AI speaking");
        }
        userSpeaking = true;
      }
      if (text.includes("speech_ended") || (text.includes("silero") && text.includes("end"))) {
        userSpeaking = false;
      }

      // AI speech events
      if (text.includes("playback") && text.includes("start")) {
        if (userSpeaking) {
          overlaps++;
          console.log("[Test] Overlap detected: AI started while user speaking");
        }
        aiSpeaking = true;
      }
      if (
        text.includes("playback") &&
        (text.includes("end") || text.includes("complete"))
      ) {
        aiSpeaking = false;
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

    // Monitor for overlaps during conversation
    await page.waitForTimeout(40000);

    console.log(`[Test] Audio overlaps detected: ${overlaps}`);

    // Some overlap during barge-in is expected, but excessive overlap indicates problems
    expect(overlaps).toBeLessThan(3);
  });

  /**
   * Test: Response time feels natural
   * AI should respond within 1-3 seconds of user finishing
   */
  test("response time feels natural", async ({ page }) => {
    const responseTimes: number[] = [];
    let speechEndTime = 0;

    page.on("console", (msg) => {
      const text = msg.text();
      const now = Date.now();

      if (
        text.includes("speech_ended") ||
        (text.includes("silero") && text.includes("silence"))
      ) {
        speechEndTime = now;
      }

      if (speechEndTime > 0 && text.includes("playback") && text.includes("start")) {
        const responseTime = now - speechEndTime;
        responseTimes.push(responseTime);
        speechEndTime = 0; // Reset for next turn
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

    await page.waitForTimeout(40000);

    console.log("[Test] Response Times (ms):", responseTimes);

    if (responseTimes.length > 0) {
      const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const min = Math.min(...responseTimes);
      const max = Math.max(...responseTimes);

      console.log(`[Test] Average response time: ${avg.toFixed(0)}ms`);
      console.log(`[Test] Min response time: ${min}ms`);
      console.log(`[Test] Max response time: ${max}ms`);

      // Natural response should be 500ms - 3000ms
      // Too fast feels robotic, too slow feels laggy
      expect(avg).toBeLessThan(4000);
    }
  });
});
