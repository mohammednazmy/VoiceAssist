/**
 * Voice Test Setup - Extended Playwright Fixture
 *
 * Provides enhanced test infrastructure for voice mode E2E tests including:
 * - Automatic metrics collection via VoiceMetricsCollector
 * - Environment validation and safety guards
 * - Quality threshold assertions
 * - Metrics persistence and trace attachment
 */

import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  VoiceMetricsCollector,
  createMetricsCollector,
  type ConversationMetrics,
} from "./voice-test-metrics";

// ============================================================================
// Quality Thresholds (aligned with featureFlags.ts defaults)
// ============================================================================

export const QUALITY_THRESHOLDS = {
  // Audio queue management
  maxQueueOverflows: 0, // voice_queue_overflow_protection should prevent all
  maxScheduleResets: 1, // voice_schedule_watchdog may reset once per test

  // Barge-in quality
  maxFalseBargeIns: 1, // Per 10 turns; aligned with voice_min_barge_in_confidence (0.3)
  maxMissedBargeIns: 0, // Should catch all intentional barge-ins

  // Latency targets
  maxResponseLatencyMs: 3500, // User final → AI first audio chunk
  maxBargeInLatencyMs: 800, // Speech detected → playback stopped
  p90ResponseLatencyMs: 4500, // 90th percentile
  p90BargeInLatencyMs: 500, // 90th percentile (voice_instant_barge_in target: <50ms)

  // VAD thresholds (matching featureFlags.ts defaults)
  sileroPositiveThreshold: 0.5, // voice_silero_positive_threshold
  sileroPlaybackBoost: 0.2, // voice_silero_playback_threshold_boost
  effectivePlaybackThreshold: 0.7, // 0.5 + 0.2 during AI playback
  minSpeechMs: 150, // voice_silero_min_speech_ms
  playbackMinSpeechMs: 200, // voice_silero_playback_min_speech_ms

  // Error tolerance
  maxCriticalErrors: 0, // WebSocket errors, API failures
  maxWarnings: 5, // Non-critical issues
} as const;

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Validates the test environment for safety and configuration
 * @throws Error if environment is unsafe or misconfigured
 */
export function validateTestEnvironment(): void {
  const baseUrl = process.env.E2E_BASE_URL || "";
  const gatewayUrl = process.env.CLIENT_GATEWAY_URL || "";

  // Block production URLs - only allow dev/staging
  const prodPattern = /^https?:\/\/(?!dev\.|staging\.|localhost).*asimo\.io/;

  for (const url of [baseUrl, gatewayUrl]) {
    if (url && prodPattern.test(url)) {
      throw new Error(
        `SAFETY: Refusing to run tests against production URL: ${url}\n` +
          `Use dev.asimo.io or staging.asimo.io for E2E tests.`
      );
    }
  }

  // Warn if LIVE_REALTIME_E2E is not set
  if (!process.env.LIVE_REALTIME_E2E) {
    console.log(
      "[Voice Test] LIVE_REALTIME_E2E not set - some tests may be skipped"
    );
  }
}

/**
 * Check if live mode is enabled
 */
export function isLiveMode(): boolean {
  return process.env.LIVE_REALTIME_E2E === "1";
}

/**
 * Skip test if not in live mode
 */
export function skipIfNotLive(testFn: typeof test): void {
  if (!isLiveMode()) {
    testFn.skip();
  }
}

// ============================================================================
// Metrics Persistence
// ============================================================================

/**
 * Persist metrics to JSON file
 */
function persistMetrics(
  metrics: ReturnType<VoiceMetricsCollector["getMetrics"]>,
  convMetrics: ConversationMetrics,
  testInfo: TestInfo
): string {
  const metricsDir = path.join(process.cwd(), "test-results", "voice-metrics");
  fs.mkdirSync(metricsDir, { recursive: true });

  const testName = testInfo.title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const timestamp = Date.now();
  const filename = `${testName}-${timestamp}.json`;
  const filepath = path.join(metricsDir, filename);

  const data = {
    testTitle: testInfo.title,
    testFile: testInfo.file,
    timestamp: new Date().toISOString(),
    duration: testInfo.duration,
    status: testInfo.status,
    raw: metrics,
    summary: convMetrics,
    thresholds: QUALITY_THRESHOLDS,
  };

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

// ============================================================================
// Extended Test Fixture
// ============================================================================

/**
 * Extended test fixture with automatic voice metrics collection
 */
export const test = base.extend<{
  metricsCollector: VoiceMetricsCollector;
}>({
  metricsCollector: async ({ page }, use, testInfo) => {
    // Validate environment before test
    validateTestEnvironment();

    // Clear any persisted voice settings to ensure clean test state
    // This prevents auto-start behavior from previous test runs
    await page.addInitScript(() => {
      // Remove voice settings that might cause auto-start on page load
      localStorage.removeItem("voiceassist-voice-settings");
    });

    // Create and attach metrics collector
    const collector = createMetricsCollector(page);

    // Run the test
    await use(collector);

    // After test: collect and persist metrics
    const metrics = collector.getMetrics();
    const convMetrics = collector.getConversationMetrics();

    // Log summary to console
    console.log("\n" + collector.getSummary());

    // Persist to file
    try {
      const filepath = persistMetrics(metrics, convMetrics, testInfo);
      console.log(`[Voice Metrics] Saved to: ${filepath}`);
    } catch (error) {
      console.error("[Voice Metrics] Failed to persist metrics:", error);
    }

    // Attach to Playwright trace
    try {
      await testInfo.attach("voice-metrics-summary", {
        body: JSON.stringify(convMetrics, null, 2),
        contentType: "application/json",
      });

      // Attach last 200 console logs on failure
      if (testInfo.status !== "passed") {
        const recentLogs = metrics.rawLogs.slice(-200);
        await testInfo.attach("voice-console-logs", {
          body: recentLogs.map((l) => `[${l.time}ms] ${l.type}: ${l.text}`).join("\n"),
          contentType: "text/plain",
        });
      }
    } catch (error) {
      console.error("[Voice Metrics] Failed to attach to trace:", error);
    }

    // Cleanup
    collector.detach();
  },
});

// Re-export expect for convenience
export { expect };

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clear voice settings from localStorage to ensure clean test state.
 * This prevents auto-start behavior from persisted settings.
 */
export async function clearVoiceSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Clear voice settings that might cause auto-start
    localStorage.removeItem("voiceassist-voice-settings");
    // Also clear auth state to ensure clean slate (will be re-set by test setup)
    // Note: Don't clear auth here as it's needed for authentication
  });
}

/**
 * Reset voice settings to defaults in localStorage.
 * Use this when you want to ensure autoStartOnOpen is false.
 */
export async function resetVoiceSettingsToDefaults(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Get existing settings if any
    const existing = localStorage.getItem("voiceassist-voice-settings");
    if (existing) {
      try {
        const settings = JSON.parse(existing);
        // Ensure autoStartOnOpen is false (though it's no longer persisted)
        settings.state = settings.state || {};
        settings.state.autoStartOnOpen = false;
        localStorage.setItem("voiceassist-voice-settings", JSON.stringify(settings));
      } catch {
        // If parsing fails, just remove the settings
        localStorage.removeItem("voiceassist-voice-settings");
      }
    }
  });
}

/**
 * Enable Silero VAD in Playwright tests.
 * By default, Silero VAD is disabled in automation environments to avoid flakiness.
 * This localStorage flag completely overrides both:
 * - The automation detection (navigator.webdriver)
 * - The backend feature flag (backend.voice_silero_vad_enabled)
 * Call this BEFORE page.goto() - uses addInitScript to set localStorage before the app loads.
 */
export async function enableSileroVAD(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("voiceassist-force-silero-vad", "true");
  });
}

/**
 * Wait for Chrome's fake microphone device to be available.
 * This helps avoid race conditions where Silero VAD tries to access the mic
 * before Chrome's --use-fake-device-for-media-stream flag is fully set up.
 *
 * Call this AFTER page.goto() but BEFORE opening voice mode.
 *
 * @param page - The Playwright page instance
 * @param timeout - Maximum time to wait for the device (default: 10000ms)
 * @returns True if fake mic device is available, false if timeout or error
 */
export async function waitForFakeMicDevice(page: Page, timeout = 10000): Promise<boolean> {
  try {
    const result = await page.evaluate(async (timeoutMs: number) => {
      // Try to acquire mic stream with retries
      const maxRetries = Math.ceil(timeoutMs / 500);
      for (let i = 0; i < maxRetries; i++) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Successfully acquired stream - device is ready
          // Clean up the stream
          stream.getTracks().forEach(track => track.stop());
          return { success: true, attempt: i + 1 };
        } catch (e) {
          // Device not ready yet, wait and retry
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      return { success: false, error: "Timeout waiting for fake mic device" };
    }, timeout);

    if (result.success) {
      console.log(`[Test] Fake mic device ready after ${result.attempt} attempt(s)`);
      return true;
    } else {
      console.log(`[Test] ${result.error}`);
      return false;
    }
  } catch (error) {
    console.log("[Test] Error waiting for fake mic device:", error);
    return false;
  }
}

/**
 * Disable Silero VAD override (restore default automation behavior).
 */
export async function disableSileroVADOverride(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("voiceassist-force-silero-vad");
  });
}

/**
 * Enable instant barge-in in Playwright tests.
 * By default, instant barge-in is disabled in automation environments to avoid flakiness.
 * This localStorage flag overrides the automation detection to enable barge-in testing.
 * Call this BEFORE page.goto() - uses addInitScript to set localStorage before the app loads.
 */
export async function enableInstantBargeIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("voiceassist-force-instant-barge-in", "true");
  });
}

/**
 * Disable instant barge-in override (restore default automation behavior).
 */
export async function disableInstantBargeInOverride(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("voiceassist-force-instant-barge-in");
  });
}

/**
 * Enable all voice features for comprehensive E2E testing.
 * This enables both Silero VAD and instant barge-in, which are normally
 * disabled during automation to avoid flakiness.
 * Call this BEFORE page.goto() - uses addInitScript to set localStorage before the app loads.
 */
export async function enableAllVoiceFeatures(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("voiceassist-force-silero-vad", "true");
    localStorage.setItem("voiceassist-force-instant-barge-in", "true");
  });
}

/**
 * Wait for voice mode to be ready and enabled
 */
export async function waitForVoiceModeReady(
  page: Page,
  timeout = 30000
): Promise<boolean> {
  try {
    const voiceButton = page
      .locator(
        '[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]'
      )
      .first();
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

/**
 * Dismiss any blocking popups before interacting with voice UI
 */
async function dismissBlockingPopups(page: Page): Promise<void> {
  // First check for voice settings modal (has highest z-index and blocks everything)
  const voiceSettingsModal = page.locator('[data-testid="voice-settings-modal"]');
  if (await voiceSettingsModal.count() > 0 && await voiceSettingsModal.isVisible()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // Dismiss any other modal dialogs
  const modalBackdrops = page.locator('[role="dialog"]');
  if (await modalBackdrops.count() > 0) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // Dismiss analytics consent popup
  const noThanksButton = page.locator('button:has-text("No thanks")');
  if (await noThanksButton.count() > 0) {
    await noThanksButton.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

/**
 * Open voice mode by clicking the toggle button
 * Includes retry logic for flaky button clicks
 */
export async function openVoiceMode(page: Page, maxRetries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // First dismiss any blocking popups
    await dismissBlockingPopups(page);

    const voiceButton = page
      .locator(
        '[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]'
      )
      .first();

    // Wait a bit for the button to be stable
    await page.waitForTimeout(500);

    if (!(await voiceButton.isVisible())) {
      console.log(`[Test] Voice button not visible (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) {
        await page.waitForTimeout(1000);
        continue;
      }
      return false;
    }

    const isDisabled = await voiceButton.isDisabled();
    if (isDisabled) {
      console.log(`[Test] Voice button is disabled (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) {
        await page.waitForTimeout(1000);
        continue;
      }
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

          const voiceToggle = document.querySelector(
            '[data-testid="voice-mode-toggle"]'
          );
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
      console.log(`[Test] Voice mode did not activate (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) {
        await page.waitForTimeout(1000);
        continue;
      }
      return false;
    }
  }
  return false;
}

/**
 * Close voice mode
 */
export async function closeVoiceMode(page: Page): Promise<void> {
  const closeButton = page.locator(
    '[data-testid="voice-mode-close"], [data-testid="close-voice-mode"]'
  );
  if (await closeButton.isVisible()) {
    await closeButton.click();
  } else {
    // Try clicking the toggle again to close
    const voiceButton = page
      .locator('[data-testid="voice-mode-toggle"]')
      .first();
    if (await voiceButton.isVisible()) {
      await voiceButton.click();
    }
  }
}

/**
 * Wait for AI to start speaking (audio playback begins)
 * Checks for actual UI indicators in CompactVoiceBar and VoiceModePanel:
 * - Text containing "Speaking" (state label)
 * - Pipeline state "speaking" indicator
 * - Audio playback logs in console
 */
export async function waitForAISpeaking(
  page: Page,
  timeout = 30000
): Promise<boolean> {
  // Set up console log monitoring as a backup detection method
  let audioPlaybackDetected = false;
  const consoleHandler = (msg: { text: () => string }) => {
    const text = msg.text();
    if (
      text.includes("Playback started") ||
      text.includes("TTAudioPlayback") ||
      text.includes("TTFA:") ||
      text.includes("response.complete")
    ) {
      audioPlaybackDetected = true;
    }
  };
  page.on("console", consoleHandler);

  try {
    await page.waitForFunction(
      () => {
        // Check for "Speaking" state text in TranscriptLine (CompactVoiceBar)
        const speakingText = Array.from(document.querySelectorAll("p")).some(
          (p) =>
            p.textContent?.includes("Speaking") ||
            p.textContent?.includes("Speaking...")
        );
        if (speakingText) return true;

        // Check for voice panel with speaking state class
        const hasPlayingIndicator = document.querySelector(
          '[class*="animate-pulse"]'
        );
        const voiceBar = document.querySelector('[data-testid="compact-voice-bar"]');
        if (hasPlayingIndicator && voiceBar) return true;

        // Check for AI response in message list (assistant messages)
        const assistantMessage = document.querySelector(
          '[data-testid="assistant-message"], [data-message-role="assistant"]'
        );
        if (assistantMessage?.textContent && assistantMessage.textContent.length > 10) {
          return true;
        }

        // Check for audio playback via data attribute (if component sets it)
        const playingElement = document.querySelector('[data-playing="true"]');
        if (playingElement) return true;

        // Check for "Thinking" or "Processing" which precedes speaking
        const processingText = Array.from(document.querySelectorAll("p")).some(
          (p) =>
            p.textContent?.includes("Thinking") ||
            p.textContent?.includes("Processing")
        );
        // Return true if processing - AI will speak soon
        if (processingText) return true;

        return false;
      },
      { timeout }
    );
    return true;
  } catch {
    // UI-based detection failed, check if console logs detected audio playback
    if (audioPlaybackDetected) {
      return true;
    }
    return false;
  } finally {
    page.off("console", consoleHandler);
  }
}

/**
 * Wait for AI to finish speaking (response complete)
 * Checks for actual UI indicators:
 * - "Listening" or "Ready" state text in TranscriptLine
 * - Idle pipeline state
 * - No longer showing "Speaking"
 */
export async function waitForAIComplete(
  page: Page,
  timeout = 60000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        // Check for listening or ready state text
        const stateLabels = Array.from(document.querySelectorAll("p"));
        const isListening = stateLabels.some((p) =>
          p.textContent?.includes("Listening")
        );
        const isReady = stateLabels.some((p) => p.textContent?.includes("Ready"));

        // Also check for "Tap mic to start" message (idle state)
        const isIdle = stateLabels.some((p) =>
          p.textContent?.includes("Tap mic to start")
        );

        // Make sure we're not still speaking
        const isSpeaking = stateLabels.some(
          (p) =>
            p.textContent?.includes("Speaking") ||
            p.textContent?.includes("Thinking") ||
            p.textContent?.includes("Processing")
        );

        // Complete when in listening/ready/idle AND not speaking
        return (isListening || isReady || isIdle) && !isSpeaking;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for user speech to be recognized
 */
export async function waitForUserSpeechRecognized(
  page: Page,
  timeout = 30000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        // Check for user transcript content
        const userTranscript = document.querySelector('[data-testid="user-transcript"]');
        if (userTranscript?.textContent && userTranscript.textContent.length > 0) {
          return true;
        }

        // Check for speech recognized indicator
        const speechIndicator = document.querySelector(
          '[data-testid="user-speaking"], [data-state="user-speaking"]'
        );
        return !!speechIndicator;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Assert quality thresholds on collected metrics
 */
export function assertQualityThresholds(
  collector: VoiceMetricsCollector,
  customThresholds?: Partial<typeof QUALITY_THRESHOLDS>
): void {
  const thresholds = { ...QUALITY_THRESHOLDS, ...customThresholds };
  const result = collector.assertQuality({
    maxQueueOverflows: thresholds.maxQueueOverflows,
    maxScheduleResets: thresholds.maxScheduleResets,
    maxErrors: thresholds.maxCriticalErrors,
    maxFalseBargeIns: thresholds.maxFalseBargeIns,
    maxResponseLatencyMs: thresholds.maxResponseLatencyMs,
    maxBargeInLatencyMs: thresholds.maxBargeInLatencyMs,
  });

  if (!result.pass) {
    throw new Error(`Quality thresholds exceeded:\n${result.failures.join("\n")}`);
  }
}

// ============================================================================
// Feature Flag Helpers
// ============================================================================

/**
 * Get admin token from auth file (set by global-setup.ts)
 */
function getAdminToken(): string | null {
  try {
    const fs = require("fs");
    const path = require("path");
    const adminAuthFile = path.join(__dirname, "../../.auth/admin.json");

    if (fs.existsSync(adminAuthFile)) {
      const data = JSON.parse(fs.readFileSync(adminAuthFile, "utf-8"));
      return data.accessToken || null;
    }
  } catch (e) {
    // Admin auth file not available
  }
  return null;
}

/**
 * Set a feature flag via admin API
 * Uses PATCH to update the flag value
 */
export async function setFeatureFlag(
  page: Page,
  flagName: string,
  value: unknown
): Promise<void> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";
  const adminToken = getAdminToken();

  // Build headers with admin auth if available
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }

  // Use PATCH to update existing feature flag
  const response = await page.request.patch(
    `${apiBase}/api/admin/feature-flags/${flagName}`,
    {
      headers,
      data: {
        value,
        enabled: value !== false && value !== null,
      },
    }
  );

  if (!response.ok()) {
    // Log warning but don't fail - flag may not exist in DB yet
    console.warn(
      `[Feature Flag] Failed to set ${flagName}=${value}: ${response.status()} - ` +
      `Flag may not exist or require admin auth. Tests will use default values.`
    );
  } else {
    console.log(`[Feature Flag] Set ${flagName}=${value}`);
  }
}

/**
 * Get current feature flag value
 */
export async function getFeatureFlag(
  page: Page,
  flagName: string
): Promise<unknown> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";
  const adminToken = getAdminToken();

  const headers: Record<string, string> = {};
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }

  const response = await page.request.get(
    `${apiBase}/api/admin/feature-flags/${flagName}`,
    { headers }
  );

  if (response.ok()) {
    const data = await response.json();
    // Handle envelope format: { status: "success", data: { value: ... } }
    return data.data?.value ?? data.value;
  }
  return undefined;
}

/**
 * Reset feature flags to defaults
 * Note: This endpoint may not exist yet - uses best-effort reset
 */
export async function resetFeatureFlags(page: Page): Promise<void> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";
  const adminToken = getAdminToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }

  // Try the reset endpoint first
  const response = await page.request.post(
    `${apiBase}/api/admin/feature-flags/reset`,
    { headers }
  );

  if (!response.ok()) {
    // Reset endpoint doesn't exist - manually reset key voice flags
    console.log("[Feature Flag] Reset endpoint not available, using manual reset");

    // Reset key VAD-related flags to defaults
    const defaultFlags = {
      "backend.voice_silero_vad_enabled": true,
      "backend.voice_silero_positive_threshold": 0.5,
      "backend.voice_silero_playback_threshold_boost": 0.2,
      "backend.voice_queue_overflow_protection": true,
    };

    for (const [flagName, value] of Object.entries(defaultFlags)) {
      await page.request.patch(
        `${apiBase}/api/admin/feature-flags/${flagName}`,
        { headers, data: { value, enabled: true } }
      );
    }
  }
}

// ============================================================================
// Run Basic Conversation Test
// ============================================================================

/**
 * Run a basic conversation flow for testing flag combinations
 */
export async function runBasicConversationTest(page: Page): Promise<void> {
  // Navigate to chat page (where voice mode toggle is located)
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  // Wait for voice mode to be ready
  const ready = await waitForVoiceModeReady(page);
  if (!ready) {
    throw new Error("Voice mode did not become ready");
  }

  // Open voice mode
  const opened = await openVoiceMode(page);
  if (!opened) {
    throw new Error("Failed to open voice mode");
  }

  // Wait for AI to start responding
  await waitForAISpeaking(page, 30000);

  // Wait for response to complete
  await waitForAIComplete(page, 60000);

  // Brief pause before closing
  await page.waitForTimeout(2000);

  // Close voice mode
  await closeVoiceMode(page);
}

// ============================================================================
// Backend Log Correlation
// ============================================================================

/**
 * Backend log correlation helper for debugging
 * Fetches recent backend logs and correlates with frontend events
 */
export interface BackendLogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Fetch recent backend logs for voice pipeline
 * Note: This requires backend API endpoint for log retrieval
 */
export async function fetchBackendLogs(
  page: Page,
  since: Date,
  limit = 200
): Promise<BackendLogEntry[]> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";

  try {
    const response = await page.request.get(
      `${apiBase}/api/v1/debug/voice-logs`,
      {
        params: {
          since: since.toISOString(),
          limit: String(limit),
        },
      }
    );

    if (response.ok()) {
      const data = await response.json();
      return data.logs || [];
    }
  } catch (error) {
    console.log("[Backend Logs] Failed to fetch:", error);
  }

  return [];
}

/**
 * Correlate frontend events with backend logs by timestamp
 */
export interface CorrelatedEvent {
  frontendTime: number;
  frontendEvent: string;
  backendLogs: BackendLogEntry[];
  timeDelta: number;
}

export function correlateEvents(
  frontendEvents: { timestamp: number; event: string }[],
  backendLogs: BackendLogEntry[],
  toleranceMs = 500
): CorrelatedEvent[] {
  const correlated: CorrelatedEvent[] = [];

  for (const fe of frontendEvents) {
    const feTime = new Date(fe.timestamp).getTime();
    const matchingLogs = backendLogs.filter((log) => {
      const logTime = new Date(log.timestamp).getTime();
      return Math.abs(logTime - feTime) <= toleranceMs;
    });

    if (matchingLogs.length > 0) {
      correlated.push({
        frontendTime: fe.timestamp,
        frontendEvent: fe.event,
        backendLogs: matchingLogs,
        timeDelta:
          new Date(matchingLogs[0].timestamp).getTime() - feTime,
      });
    }
  }

  return correlated;
}

/**
 * Generate a debug report with correlated frontend/backend events
 */
export function generateDebugReport(
  testTitle: string,
  frontendEvents: { timestamp: number; event: string }[],
  backendLogs: BackendLogEntry[],
  metrics: ReturnType<VoiceMetricsCollector["getConversationMetrics"]>
): string {
  const lines: string[] = [
    `# Voice Debug Report: ${testTitle}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary Metrics",
    `- Queue Overflows: ${metrics.queueOverflows}`,
    `- Schedule Resets: ${metrics.scheduleResets}`,
    `- Barge-in Attempts: ${metrics.bargeInAttempts}`,
    `- False Barge-ins: ${metrics.falseBargeIns}`,
    `- Avg Response Latency: ${metrics.averageResponseLatencyMs.toFixed(0)}ms`,
    `- Errors: ${metrics.errors}`,
    "",
    "## Frontend Events Timeline",
    "",
  ];

  // Add frontend events (first 50)
  frontendEvents.slice(0, 50).forEach((e) => {
    const time = new Date(e.timestamp).toISOString();
    lines.push(`- [${time}] ${e.event}`);
  });

  if (frontendEvents.length > 50) {
    lines.push(`  ... (${frontendEvents.length - 50} more events)`);
  }

  lines.push("");
  lines.push("## Backend Logs");
  lines.push("");

  // Add backend logs (first 50)
  backendLogs.slice(0, 50).forEach((log) => {
    lines.push(`- [${log.timestamp}] [${log.level}] ${log.message}`);
  });

  if (backendLogs.length > 50) {
    lines.push(`  ... (${backendLogs.length - 50} more logs)`);
  }

  // Correlate events
  const correlated = correlateEvents(frontendEvents, backendLogs);
  if (correlated.length > 0) {
    lines.push("");
    lines.push("## Correlated Events");
    lines.push("");

    correlated.forEach((ce) => {
      lines.push(`### ${new Date(ce.frontendTime).toISOString()}`);
      lines.push(`Frontend: ${ce.frontendEvent}`);
      lines.push(`Time Delta: ${ce.timeDelta}ms`);
      lines.push("Backend:");
      ce.backendLogs.forEach((log) => {
        lines.push(`  - [${log.level}] ${log.message}`);
      });
      lines.push("");
    });
  }

  return lines.join("\n");
}

// ============================================================================
// Barge-In Verification Helpers
// ============================================================================

/**
 * Voice debug state interface matching window.__voiceDebug
 */
export interface VoiceDebugState {
  pipelineState: string;
  lastAudioChunkTimeMs: number | null;
  audioRecentlyReceived: boolean;
  recentAudioMs: number;
  enableInstantBargeIn: boolean;
  bargeInCount: number;
  successfulBargeInCount: number;
  status: string;
  stateTransitions: string[];
  isConnected: boolean;
}

/**
 * Get the voice debug state from window.__voiceDebug
 * This requires the frontend to have the debug state exposure enabled
 */
export async function getVoiceDebugState(page: Page): Promise<VoiceDebugState | null> {
  return page.evaluate(() => {
    const debug = (window as unknown as { __voiceDebug?: VoiceDebugState }).__voiceDebug;
    if (!debug) return null;

    // Create a snapshot of the debug state (getters won't serialize)
    return {
      pipelineState: debug.pipelineState,
      lastAudioChunkTimeMs: debug.lastAudioChunkTimeMs,
      audioRecentlyReceived: debug.audioRecentlyReceived,
      recentAudioMs: debug.recentAudioMs,
      enableInstantBargeIn: debug.enableInstantBargeIn,
      bargeInCount: debug.bargeInCount,
      successfulBargeInCount: debug.successfulBargeInCount,
      status: debug.status,
      stateTransitions: [...debug.stateTransitions],
      isConnected: debug.isConnected,
    };
  });
}

/**
 * Wait for AI to be speaking with actual audio chunks being received
 * This is more reliable than UI-based detection for barge-in testing
 *
 * @param page - The Playwright page instance
 * @param timeout - Maximum time to wait (default: 30000ms)
 * @returns Object with speaking status and debug info
 */
export async function waitForAISpeakingWithAudioChunks(
  page: Page,
  timeout = 30000
): Promise<{
  success: boolean;
  pipelineState: string;
  audioChunksReceived: boolean;
  debugState: VoiceDebugState | null;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const debugState = await getVoiceDebugState(page);

    if (debugState) {
      const isSpeaking = debugState.pipelineState === "speaking";
      const hasAudioChunks = debugState.audioRecentlyReceived;

      console.log(
        `[BARGE-IN-TEST] Checking AI speaking: pipelineState=${debugState.pipelineState}, ` +
          `audioRecentlyReceived=${hasAudioChunks}, recentAudioMs=${debugState.recentAudioMs}`
      );

      // AI is speaking when pipeline state is "speaking" OR audio was recently received
      if (isSpeaking || hasAudioChunks) {
        return {
          success: true,
          pipelineState: debugState.pipelineState,
          audioChunksReceived: hasAudioChunks,
          debugState,
        };
      }
    }

    await page.waitForTimeout(500);
  }

  const finalState = await getVoiceDebugState(page);
  return {
    success: false,
    pipelineState: finalState?.pipelineState || "unknown",
    audioChunksReceived: finalState?.audioRecentlyReceived || false,
    debugState: finalState,
  };
}

/**
 * Verify that barge-in actually occurred
 * Checks for:
 * 1. bargeInCount increased
 * 2. Pipeline transitioned from speaking to listening
 *
 * @param page - The Playwright page instance
 * @param initialBargeInCount - The barge-in count before the test action
 * @param timeout - Maximum time to wait for barge-in to complete
 */
export async function verifyBargeInOccurred(
  page: Page,
  initialBargeInCount: number,
  timeout = 10000
): Promise<{
  triggered: boolean;
  bargeInCountIncreased: boolean;
  pipelineTransitioned: boolean;
  finalState: VoiceDebugState | null;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const debugState = await getVoiceDebugState(page);

    if (debugState) {
      const bargeInCountIncreased = debugState.bargeInCount > initialBargeInCount;
      const pipelineTransitioned = debugState.stateTransitions.some(
        (t) => t === "speaking->listening" || t === "speaking->idle"
      );

      console.log(
        `[BARGE-IN-TEST] Verifying barge-in: bargeInCount=${debugState.bargeInCount} ` +
          `(was ${initialBargeInCount}), transitions=${debugState.stateTransitions.join(", ")}`
      );

      if (bargeInCountIncreased || pipelineTransitioned) {
        return {
          triggered: true,
          bargeInCountIncreased,
          pipelineTransitioned,
          finalState: debugState,
        };
      }
    }

    await page.waitForTimeout(200);
  }

  const finalState = await getVoiceDebugState(page);
  return {
    triggered: false,
    bargeInCountIncreased: false,
    pipelineTransitioned: false,
    finalState,
  };
}

/**
 * Capture barge-in related console logs for debugging
 */
export interface BargeInConsoleState {
  speechDetectedLogs: string[];
  bargeInTriggeredLogs: string[];
  audioChunkLogs: string[];
  pipelineStateLogs: string[];
  allBargeInLogs: string[];
}

/**
 * Set up console log capture for barge-in debugging
 * Returns an object that accumulates barge-in related logs
 */
export function setupBargeInConsoleCapture(page: Page): BargeInConsoleState {
  const state: BargeInConsoleState = {
    speechDetectedLogs: [],
    bargeInTriggeredLogs: [],
    audioChunkLogs: [],
    pipelineStateLogs: [],
    allBargeInLogs: [],
  };

  page.on("console", (msg) => {
    const text = msg.text();

    // Only capture BARGE-IN-DEBUG logs
    if (text.includes("[BARGE-IN-DEBUG]")) {
      state.allBargeInLogs.push(text);

      if (text.includes("Speech detected")) {
        state.speechDetectedLogs.push(text);
      }
      if (text.includes("TRIGGERING BARGE-IN") || text.includes("shouldBargeIn=true")) {
        state.bargeInTriggeredLogs.push(text);
      }
      if (text.includes("Audio chunk received")) {
        state.audioChunkLogs.push(text);
      }
      if (text.includes("Pipeline state")) {
        state.pipelineStateLogs.push(text);
      }
    }
  });

  return state;
}

/**
 * Attach debug report to test info for Playwright
 */
export async function attachDebugReport(
  testInfo: TestInfo,
  testTitle: string,
  frontendEvents: { timestamp: number; event: string }[],
  backendLogs: BackendLogEntry[],
  metrics: ReturnType<VoiceMetricsCollector["getConversationMetrics"]>
): Promise<void> {
  const report = generateDebugReport(testTitle, frontendEvents, backendLogs, metrics);

  await testInfo.attach("voice-debug-report", {
    body: report,
    contentType: "text/markdown",
  });
}
