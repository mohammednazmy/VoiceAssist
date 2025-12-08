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
 * Open voice mode by clicking the toggle button
 */
export async function openVoiceMode(page: Page): Promise<boolean> {
  const voiceButton = page
    .locator(
      '[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]'
    )
    .first();

  if (!(await voiceButton.isVisible())) {
    console.log("[Test] Voice button not visible");
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
    console.log("[Test] Voice mode did not activate");
    return false;
  }
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
 */
export async function waitForAISpeaking(
  page: Page,
  timeout = 30000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        // Check for speaking indicator in UI
        const speakingIndicator = document.querySelector(
          '[data-testid="ai-speaking"], [data-state="speaking"]'
        );
        if (speakingIndicator) return true;

        // Check for transcript content
        const transcript = document.querySelector('[data-testid="ai-transcript"]');
        if (transcript?.textContent && transcript.textContent.length > 0) {
          return true;
        }

        return false;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for AI to finish speaking (response complete)
 */
export async function waitForAIComplete(
  page: Page,
  timeout = 60000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        // Check for idle/listening state
        const isListening = Array.from(document.querySelectorAll("p")).some(
          (p) => p.textContent?.includes("Listening")
        );
        const isIdle = document.querySelector('[data-state="idle"]');
        return isListening || isIdle;
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
 * Set a feature flag via admin API
 */
export async function setFeatureFlag(
  page: Page,
  flagName: string,
  value: unknown
): Promise<void> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";
  const response = await page.request.post(
    `${apiBase}/api/v1/admin/feature-flags/${flagName}`,
    {
      data: {
        value,
        enabled: value !== false && value !== null,
      },
    }
  );

  if (!response.ok()) {
    console.warn(
      `[Feature Flag] Failed to set ${flagName}=${value}: ${response.status()}`
    );
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
  const response = await page.request.get(
    `${apiBase}/api/v1/admin/feature-flags/${flagName}`
  );

  if (response.ok()) {
    const data = await response.json();
    return data.value;
  }
  return undefined;
}

/**
 * Reset feature flags to defaults
 */
export async function resetFeatureFlags(page: Page): Promise<void> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";
  await page.request.post(`${apiBase}/api/v1/admin/feature-flags/reset`);
}

// ============================================================================
// Run Basic Conversation Test
// ============================================================================

/**
 * Run a basic conversation flow for testing flag combinations
 */
export async function runBasicConversationTest(page: Page): Promise<void> {
  // Navigate to app
  await page.goto("/");
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
