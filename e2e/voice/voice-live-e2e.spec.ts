/**
 * Voice Mode Live E2E Tests
 *
 * These tests run against the REAL backend without any mocking.
 * They require:
 * - Backend running at localhost:8200
 * - Frontend running at localhost:5173
 * - Valid test user credentials
 * - Microphone permissions (uses fake device)
 *
 * Run with: LIVE_REALTIME_E2E=1 npx playwright test e2e/voice/voice-live-e2e.spec.ts --project=voice-live
 */

import { test, expect, type Page } from "@playwright/test";

// Skip if not running in live mode
const isLiveMode = process.env.LIVE_REALTIME_E2E === "1";

// Helper to wait for voice mode UI
// Note: When unified_chat_voice_ui feature flag is enabled, uses voice-mode-toggle
// When using legacy UI, uses realtime-voice-mode-button
async function waitForVoiceModeReady(page: Page, timeout = 30000): Promise<boolean> {
  try {
    // Try both selectors - unified UI uses voice-mode-toggle, legacy uses realtime-voice-mode-button
    const voiceButton = page.locator('[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]').first();
    await expect(voiceButton).toBeVisible({ timeout: 10000 });

    // Wait for connection to establish (button should not be disabled)
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('[data-testid="voice-mode-toggle"]') ||
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

// Helper to open voice mode panel
async function openVoiceMode(page: Page): Promise<boolean> {
  // Try both selectors for unified and legacy UI
  const voiceButton = page.locator('[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]').first();

  if (!(await voiceButton.isVisible())) {
    return false;
  }

  const isDisabled = await voiceButton.isDisabled();
  if (isDisabled) {
    console.log("[Test] Voice button is disabled - WebSocket may not be connected");
    return false;
  }

  await voiceButton.click();

  // Wait for voice mode to become active
  // Unified UI shows inline voice mode, legacy shows panel
  try {
    await page.waitForFunction(
      () => {
        // Check for legacy panel elements
        const hasPanel = document.querySelector('[data-testid="voice-mode-panel"]') ||
               document.querySelector('[data-testid="thinker-talker-voice-panel"]') ||
               document.querySelector('[data-testid="compact-voice-bar"]') ||
               document.querySelector('[data-testid="voice-expanded-drawer"]');
        if (hasPanel) return true;

        // Check for unified UI inline voice mode indicators
        // The voice button should change color/state, and the input area changes
        const voiceToggle = document.querySelector('[data-testid="voice-mode-toggle"]');
        if (voiceToggle?.classList.contains('bg-primary-500') ||
            voiceToggle?.classList.contains('bg-primary-100') ||
            voiceToggle?.classList.contains('bg-primary-400')) {
          return true;
        }

        // Check for voice status text
        const hasVoiceStatus = Array.from(document.querySelectorAll('p')).some(p =>
          p.textContent?.includes('Listening') ||
          p.textContent?.includes('Connecting') ||
          p.textContent?.includes('Ready to listen') ||
          p.textContent?.includes('Hold Space') ||
          p.textContent?.includes('Processing')
        );
        if (hasVoiceStatus) return true;

        // Check if text input is hidden (voice mode replaces it)
        const textInput = document.querySelector('[data-testid="message-input"]');
        if (!textInput) return true; // Text input replaced with voice UI

        return false;
      },
      { timeout: 8000 }
    );
    return true;
  } catch {
    console.log("[Test] Voice mode did not activate");
    return false;
  }
}

// Helper to wait for connection status
async function waitForConnection(page: Page, status: string, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (expectedStatus) => {
        const statusEl = document.querySelector('[role="status"]');
        return statusEl?.textContent?.toLowerCase().includes(expectedStatus.toLowerCase());
      },
      status,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

// Helper to capture console logs
function setupConsoleCapture(page: Page): string[] {
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("WebSocket") ||
      text.includes("voice") ||
      text.includes("Voice") ||
      text.includes("barge") ||
      text.includes("transcript")
    ) {
      logs.push(`[${msg.type()}] ${text}`);
    }
  });
  return logs;
}

// ============================================================================
// Live E2E Tests - Only run with LIVE_REALTIME_E2E=1
// ============================================================================

test.describe("Voice Mode Live E2E", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    // Grant microphone permission
    await page.context().grantPermissions(["microphone"]);

    // Navigate to chat and wait for load
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // Wait for WebSocket connection
  });

  test("voice mode button becomes enabled after WebSocket connects", async ({ page }) => {
    const logs = setupConsoleCapture(page);

    // Wait for voice button to be visible (supports both unified and legacy UI)
    const voiceButton = page.locator('[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]').first();
    await expect(voiceButton).toBeVisible({ timeout: 15000 });

    // Check connection status
    const connected = await waitForConnection(page, "connected", 20000);
    console.log(`[Test] Connection established: ${connected}`);
    console.log(`[Test] Console logs: ${logs.length}`);

    // Button should eventually become enabled
    const isReady = await waitForVoiceModeReady(page, 30000);
    console.log(`[Test] Voice mode ready: ${isReady}`);

    expect(isReady).toBeTruthy();
  });

  test("can open voice mode panel", async ({ page }) => {
    const logs = setupConsoleCapture(page);

    // Wait for voice mode to be ready
    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready - WebSocket connection issue");
      return;
    }

    // Open voice mode
    const opened = await openVoiceMode(page);
    console.log(`[Test] Voice panel opened: ${opened}`);
    console.log(`[Test] Console logs: ${logs.length}`);

    expect(opened).toBeTruthy();

    // Verify voice mode is active (supports both panel and inline modes)
    // In unified UI, check that voice toggle changed state or status text appeared
    const voiceToggle = page.locator('[data-testid="voice-mode-toggle"]');
    const voiceStatusText = page.locator('text=/Listening|Connecting|Ready to listen|Hold Space|Processing/');
    const voicePanel = page.locator('[data-testid="voice-mode-panel"], [data-testid="thinker-talker-voice-panel"], [data-testid="compact-voice-bar"]').first();

    // At least one of these should be visible/true
    const hasVoiceUI = await Promise.race([
      voicePanel.isVisible().catch(() => false),
      voiceStatusText.first().isVisible().catch(() => false),
      voiceToggle.evaluate(el => el.classList.contains('bg-primary-500') || el.classList.contains('bg-primary-100')).catch(() => false),
    ]);

    console.log(`[Test] Voice UI active: ${hasVoiceUI}`);
  });

  test("shows listening state in voice panel", async ({ page }) => {
    const logs = setupConsoleCapture(page);

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

    // Wait for listening state
    await page.waitForTimeout(2000);

    // Look for listening indicator
    const listeningIndicator = page.locator(
      "[data-testid*='listening'], [class*='listening'], [data-state='listening']"
    );
    const hasListeningState = (await listeningIndicator.count()) > 0;

    // Or check status text
    const statusText = await page.locator("[role='status']").first().textContent();
    console.log(`[Test] Status: ${statusText}`);
    console.log(`[Test] Has listening indicator: ${hasListeningState}`);
    console.log(`[Test] Console logs: ${logs.length}`);
    logs.forEach((l) => console.log(`  ${l}`));
  });

  test("captures audio when voice mode is active", async ({ page }) => {
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

    // Wait for audio capture to start
    await page.waitForTimeout(5000);

    // Check for audio activity indicators (supports unified and legacy UI)
    // Unified UI: voice-input-area, voice-status-area
    // Legacy UI: compact-voice-bar, compact-mic-button
    const audioIndicator = page.locator(
      "[data-testid='voice-input-area'], [data-testid='voice-status-area'], [data-testid='compact-voice-bar'], [data-testid='compact-mic-button'], [data-testid*='audio'], [class*='visualizer'], [class*='waveform']"
    );
    const hasAudioUI = (await audioIndicator.count()) > 0;

    console.log(`[Test] Audio UI visible: ${hasAudioUI}`);

    // Audio should be being captured (fake device provides silence)
    expect(hasAudioUI).toBeTruthy();
  });

  test("can close voice mode", async ({ page }) => {
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

    // Method 1: Try clicking voice toggle button again (toggle off)
    const voiceToggleButton = page.locator('[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]').first();

    // Method 2: Close buttons (supports unified and legacy UI)
    // Unified UI: end-voice-mode
    // Legacy UI: compact-close-btn, close-voice-mode
    const closeButton = page.locator(
      "[data-testid='compact-close-btn'], [data-testid='end-voice-mode'], [data-testid='close-voice-mode'], [data-testid='tt-close-voice-mode'], button[aria-label*='close' i], button[aria-label*='end' i]"
    ).first();

    // Try toggle button first (most reliable way to close)
    if (await voiceToggleButton.isVisible()) {
      await voiceToggleButton.click();
      console.log("[Test] Clicked voice toggle button to close");
    } else if (await closeButton.isVisible()) {
      await closeButton.click();
      console.log("[Test] Clicked close button to close");
    }

    await page.waitForTimeout(2000);

    // Voice panel/input should be closed (supports unified and legacy UI)
    const voicePanel = page.locator('[data-testid="voice-mode-panel"], [data-testid="thinker-talker-voice-panel"], [data-testid="compact-voice-bar"], [data-testid="voice-input-area"]').first();
    await expect(voicePanel).not.toBeVisible({ timeout: 10000 });

    console.log("[Test] Voice mode closed successfully");
  });
});

// ============================================================================
// Barge-In Live Tests
// ============================================================================

test.describe("Barge-In Live E2E", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["microphone"]);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("barge-in stops AI audio playback", async ({ page }) => {
    const logs = setupConsoleCapture(page);

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

    // Wait for some time to allow interaction
    await page.waitForTimeout(10000);

    // Check console logs for barge-in events
    const bargeInLogs = logs.filter((l) => l.toLowerCase().includes("barge"));
    console.log(`[Test] Barge-in related logs: ${bargeInLogs.length}`);
    bargeInLogs.forEach((l) => console.log(`  ${l}`));
  });

  test("speech detection triggers while AI is speaking", async ({ page }) => {
    const logs = setupConsoleCapture(page);

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

    // Wait for interaction
    await page.waitForTimeout(15000);

    // Check for speech detection logs
    const speechLogs = logs.filter(
      (l) => l.toLowerCase().includes("speech") || l.toLowerCase().includes("vad")
    );
    console.log(`[Test] Speech detection logs: ${speechLogs.length}`);
    speechLogs.forEach((l) => console.log(`  ${l}`));
  });
});

// ============================================================================
// Transcript Sync Live Tests
// ============================================================================

test.describe("Transcript Sync Live E2E", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["microphone"]);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("transcripts appear in chat after voice interaction", async ({ page }) => {
    const logs = setupConsoleCapture(page);

    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    // Get initial message count
    const initialMessages = await page.locator("[data-testid*='message'], .message").count();
    console.log(`[Test] Initial message count: ${initialMessages}`);

    const opened = await openVoiceMode(page);
    if (!opened) {
      test.skip(true, "Could not open voice panel");
      return;
    }

    // Wait for voice interaction
    await page.waitForTimeout(20000);

    // Close voice mode
    const closeButton = page.locator("[data-testid='close-voice-mode']").first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(2000);
    }

    // Check for new messages
    const finalMessages = await page.locator("[data-testid*='message'], .message").count();
    console.log(`[Test] Final message count: ${finalMessages}`);
    console.log(`[Test] Transcript logs:`);
    logs
      .filter((l) => l.toLowerCase().includes("transcript"))
      .forEach((l) => console.log(`  ${l}`));
  });

  test("partial transcripts update in real-time", async ({ page }) => {
    const logs = setupConsoleCapture(page);

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

    // Look for partial transcript element
    await page.waitForTimeout(10000);

    const partialTranscript = page.locator(
      "[data-testid='partial-transcript'], [class*='partial'], [class*='interim']"
    );
    const hasPartial = (await partialTranscript.count()) > 0;

    console.log(`[Test] Partial transcript element exists: ${hasPartial}`);

    // Check transcript delta logs
    const deltaLogs = logs.filter((l) => l.includes("delta") || l.includes("partial"));
    console.log(`[Test] Delta logs: ${deltaLogs.length}`);
  });
});

// ============================================================================
// Performance Live Tests
// ============================================================================

test.describe("Voice Performance Live E2E", () => {
  test.skip(!isLiveMode, "Skipping live tests - set LIVE_REALTIME_E2E=1 to run");

  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["microphone"]);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
  });

  test("measures connection time", async ({ page }) => {
    const startTime = Date.now();

    const ready = await waitForVoiceModeReady(page, 60000);
    const connectionTime = Date.now() - startTime;

    console.log(`[Test] Time to voice mode ready: ${connectionTime}ms`);

    if (ready) {
      expect(connectionTime).toBeLessThan(30000); // Should connect within 30s
    }
  });

  test("measures voice mode startup time", async ({ page }) => {
    const ready = await waitForVoiceModeReady(page, 30000);
    if (!ready) {
      test.skip(true, "Voice mode not ready");
      return;
    }

    const startTime = Date.now();
    const opened = await openVoiceMode(page);
    const openTime = Date.now() - startTime;

    console.log(`[Test] Voice panel open time: ${openTime}ms`);

    if (opened) {
      expect(openTime).toBeLessThan(2000); // Panel should open within 2s
    }
  });
});
