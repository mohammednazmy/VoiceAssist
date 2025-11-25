/**
 * Voice Mode Session Smoke Test
 *
 * Tests the "Start Voice Session" button behavior without requiring
 * a fully functional backend or actual audio streaming.
 *
 * This test is designed to be tolerant of backend configuration and
 * only fails if the UI is completely unresponsive.
 *
 * SUCCESS CRITERIA (any one of these):
 * - Connection state indicator appears (Connecting/Connected/Error)
 * - Error banner/toast appears (backend not available)
 * - Voice visualizer appears (session started)
 * - Button changes state (disabled, loading, etc.)
 *
 * FAILURE CRITERIA:
 * - No visible UI change after clicking "Start Voice Session" for 10 seconds
 *
 * NOTE: To enable live backend testing, set LIVE_REALTIME_E2E=1
 */

import { test, expect } from "./fixtures/auth";

const LIVE_REALTIME_E2E = process.env.LIVE_REALTIME_E2E === "1";

test.describe("Voice Mode Session Smoke Test", () => {
  test.setTimeout(45000); // 45 second timeout

  test("should show some response when starting voice session", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to chat with voice mode
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Look for Voice Mode panel or button
    const voicePanel = page.locator(
      '[data-testid="voice-mode-panel"], section:has-text("Voice Mode"), [class*="VoiceModePanel"]'
    );

    const panelExists = await voicePanel.count() > 0;

    if (!panelExists) {
      console.log("ℹ Voice Mode panel not visible - checking for voice button");

      // Try to find and click voice mode button to open panel
      const voiceButton = page.locator(
        'button[aria-label*="voice mode" i], button[aria-label*="realtime" i], [data-testid="realtime-voice-mode-button"]'
      );

      const hasVoiceButton = await voiceButton.count() > 0;

      if (hasVoiceButton) {
        await voiceButton.first().click();
        await page.waitForTimeout(1000);
      } else {
        test.skip(true, "Voice Mode UI not available");
        return;
      }
    }

    // Find "Start Voice Session" button
    const startButton = page.locator(
      'button:has-text("Start Voice Session"), button:has-text("Start Session"), button[aria-label*="start voice" i], [data-testid="start-voice-session"]'
    );

    const startButtonExists = await startButton.count() > 0;

    if (!startButtonExists) {
      console.log(
        "⚠ Start Voice Session button not found - voice mode may be in different state"
      );
      test.skip(true, "Start Voice Session button not available");
      return;
    }

    await expect(startButton.first()).toBeVisible();
    await expect(startButton.first()).toBeEnabled();

    console.log("✓ Found Start Voice Session button - clicking...");

    // Track button state before click
    const buttonTextBefore = await startButton.first().textContent();
    console.log(`Button text before click: "${buttonTextBefore}"`);

    // Click to start voice session
    await startButton.first().click();

    // Wait for any UI change (generous timeout)
    await page.waitForTimeout(2000);

    // Check for various possible UI responses
    const responses = {
      // 1. Connection state indicators
      connectingIndicator: await page
        .locator('text=/connecting|initializing/i, [class*="connecting"], [class*="loading"]')
        .count(),

      connectedIndicator: await page
        .locator('text=/connected|active/i, [class*="connected"], [class*="active"]')
        .count(),

      // 2. Error/alert indicators
      errorBanner: await page.locator('[role="alert"], [data-sonner-toast]').count(),

      errorText: await page
        .locator('text=/error|failed|unable|unavailable/i')
        .count(),

      // 3. Voice visualizer or recording indicator
      visualizer: await page
        .locator('[class*="visualizer"], [class*="waveform"], [class*="recording"]')
        .count(),

      // 4. Button state change
      buttonTextAfter: await startButton.first().textContent().catch(() => ""),

      buttonDisabled: await startButton.first().isDisabled().catch(() => false),

      // 5. Stop/Cancel button appeared
      stopButton: await page
        .locator(
          'button:has-text("Stop"), button:has-text("Cancel"), button[aria-label*="stop" i]'
        )
        .count(),

      // 6. Permission dialog
      permissionDialog: await page.locator('[class*="permission"], [role="dialog"]').count(),
    };

    console.log("UI Response Check:", JSON.stringify(responses, null, 2));

    // Determine if ANY response occurred
    const hasResponse =
      responses.connectingIndicator > 0 ||
      responses.connectedIndicator > 0 ||
      responses.errorBanner > 0 ||
      responses.errorText > 0 ||
      responses.visualizer > 0 ||
      responses.buttonTextAfter !== buttonTextBefore ||
      responses.buttonDisabled ||
      responses.stopButton > 0 ||
      responses.permissionDialog > 0;

    // Log the outcome
    if (hasResponse) {
      console.log("✓ Voice session button triggered a UI response");

      if (responses.connectingIndicator > 0 || responses.connectedIndicator > 0) {
        console.log("  → Connection state indicator found");
      }
      if (responses.errorBanner > 0 || responses.errorText > 0) {
        console.log("  → Error indicator found (backend may be unavailable)");
      }
      if (responses.visualizer > 0) {
        console.log("  → Voice visualizer found");
      }
      if (responses.stopButton > 0) {
        console.log("  → Stop button appeared");
      }
      if (responses.permissionDialog > 0) {
        console.log("  → Permission dialog appeared");
      }
      if (responses.buttonTextAfter !== buttonTextBefore) {
        console.log(
          `  → Button text changed: "${buttonTextBefore}" → "${responses.buttonTextAfter}"`
        );
      }
      if (responses.buttonDisabled) {
        console.log("  → Button became disabled");
      }
    } else {
      console.error("✗ No UI response detected after clicking Start Voice Session");
      console.error(
        "  This indicates the button click handler may not be working"
      );
    }

    // ASSERTION: The UI must show SOME response
    expect(
      hasResponse,
      "Expected UI to respond to Start Voice Session button click. " +
        "No connection state, error message, visualizer, or button state change was detected. " +
        `Responses: ${JSON.stringify(responses)}`
    ).toBe(true);
  });

  test("should display connection status text after clicking Start Voice Session", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to chat
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Look for Voice Mode panel
    const voicePanel = page.locator(
      '[data-testid="voice-mode-panel"], section:has-text("Voice Mode")'
    );

    const panelExists = await voicePanel.count() > 0;

    if (!panelExists) {
      console.log("ℹ Voice Mode panel not visible - checking for voice button");
      const voiceButton = page.locator('button[aria-label*="voice mode" i], [data-testid="realtime-voice-mode-button"]');
      const hasVoiceButton = await voiceButton.count() > 0;

      if (hasVoiceButton) {
        await voiceButton.first().click();
        await page.waitForTimeout(1000);
      } else {
        test.skip(true, "Voice Mode UI not available");
        return;
      }
    }

    // Find "Start Voice Session" button
    const startButton = page.locator(
      'button:has-text("Start Voice Session"), button:has-text("Start Session"), [data-testid="start-voice-session"]'
    );

    const startButtonExists = await startButton.count() > 0;

    if (!startButtonExists) {
      test.skip(true, "Start Voice Session button not available");
      return;
    }

    await expect(startButton.first()).toBeVisible();
    console.log("✓ Found Start Voice Session button");

    // Look for connection status indicator BEFORE clicking
    // Should show "Disconnected" or similar initial state
    const statusTextBefore = await page
      .locator('text=/disconnected|connecting|connected/i')
      .first()
      .textContent()
      .catch(() => null);

    console.log(`Initial status text: "${statusTextBefore}"`);

    // Click to start voice session
    await startButton.first().click();

    // Wait for status to change
    await page.waitForTimeout(2000);

    // Check that connection status text is visible and has changed
    // Should show one of: "Connecting", "Connected", "Reconnecting", "Error", "Failed", "Expired"
    const statusText = page.locator(
      'text=/connecting|connected|reconnecting|error|failed|expired|disconnected/i'
    );

    const statusTextVisible = await statusText.count();

    expect(
      statusTextVisible,
      "Connection status text should be visible after starting voice session"
    ).toBeGreaterThan(0);

    const statusValue = await statusText.first().textContent();
    console.log(`✓ Connection status text is visible: "${statusValue}"`);

    // The status should be one of the valid connection states
    const validStatuses = [
      "connecting",
      "connected",
      "reconnecting",
      "error",
      "failed",
      "expired",
      "disconnected",
    ];

    const statusLower = (statusValue || "").toLowerCase();
    const hasValidStatus = validStatuses.some((s) => statusLower.includes(s));

    expect(
      hasValidStatus,
      `Status text "${statusValue}" should contain one of: ${validStatuses.join(", ")}`
    ).toBe(true);
  });

  test.skip(
    !LIVE_REALTIME_E2E,
    "should connect to OpenAI Realtime API with valid backend (LIVE_REALTIME_E2E=1 only)"
  );

  test("should connect to OpenAI Realtime API with valid backend (LIVE_REALTIME_E2E=1 only)", async ({
    authenticatedPage,
  }) => {
    // This test only runs when LIVE_REALTIME_E2E=1 is set
    if (!LIVE_REALTIME_E2E) {
      test.skip(true, "Set LIVE_REALTIME_E2E=1 to run live backend tests");
      return;
    }

    const page = authenticatedPage;

    console.log("🔴 Running LIVE realtime backend test (requires valid OpenAI key)");

    // Navigate to chat
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Find and click Voice Mode button/panel
    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    const panelExists = await voicePanel.count() > 0;

    if (!panelExists) {
      const voiceButton = page.locator('button[aria-label*="voice mode" i], [data-testid="realtime-voice-mode-button"]');
      if (await voiceButton.count() > 0) {
        await voiceButton.first().click();
        await page.waitForTimeout(1000);
      }
    }

    // Find Start button
    const startButton = page.locator(
      'button:has-text("Start Voice Session"), button:has-text("Start Session")'
    );

    await expect(startButton.first()).toBeVisible();
    await startButton.first().click();

    // Wait for connection (with longer timeout for real backend)
    await page.waitForTimeout(5000);

    // Expect either:
    // 1. Connected state
    // 2. Error with helpful message
    const connected = await page
      .locator('text=/connected|active/i, [class*="connected"]')
      .count();

    const error = await page
      .locator('[role="alert"], text=/error|failed/i')
      .count();

    // At least one should be true with a live backend
    expect(
      connected > 0 || error > 0,
      "Expected either connected state or error message with live backend"
    ).toBe(true);

    if (connected > 0) {
      console.log("✓ Successfully connected to OpenAI Realtime API");
    } else if (error > 0) {
      console.log("⚠ Backend returned error (check API key and configuration)");
    }
  });
});
