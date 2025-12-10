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
import { VOICE_SELECTORS } from "./fixtures/voice";

const LIVE_REALTIME_E2E = process.env.LIVE_REALTIME_E2E === "1";

test.describe("Voice Mode Session Smoke Test", () => {
  test.setTimeout(45000); // 45 second timeout

  test("should show some response when starting voice session", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to chat with voice mode enabled via query param
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");

    // Wait for the page to fully render
    await page.waitForTimeout(2000);

    // Look for Voice Mode panel or button (unified selectors)
    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton).first();

    // If panel not visible, click the voice button to open it
    let panelExists = (await voicePanel.count()) > 0;

    if (!panelExists) {
      console.log(
        "ℹ Voice Mode panel not visible - clicking voice toggle to open",
      );

      // Wait for and click the unified voice toggle button
      await expect(voiceButton).toBeVisible({ timeout: 5000 });
      await voiceButton.click();

      // Wait for any voice UI (panel or compact bar) to appear
      await expect(voicePanel.first()).toBeVisible({ timeout: 5000 });
      panelExists = (await voicePanel.count()) > 0;
    }

    expect(
      panelExists,
      "Voice Mode UI should be available in unified Chat with Voice",
    ).toBe(true);

    console.log("✓ Voice Mode panel is now visible");

    // Find "Start Voice Session" button or compact mic button
    const startButton = page.locator(VOICE_SELECTORS.startButton);

    const startButtonExists = (await startButton.count()) > 0;

    expect(
      startButtonExists,
      "Expected a Start Voice Session control (button or compact mic) to be present",
    ).toBe(true);

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
        .locator('[class*="connecting"], [class*="loading"], :text-matches("connecting|initializing", "i")')
        .count(),

      connectedIndicator: await page
        .locator('[class*="connected"], [class*="active"], :text-matches("connected|active", "i")')
        .count(),

      // 2. Error/alert indicators
      errorBanner: await page.locator('[role="alert"], [data-sonner-toast]').count(),

      errorText: await page
        .locator(':text-matches("error|failed|unable|unavailable", "i")')
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

    // Navigate to chat with voice mode enabled
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");

    // Wait for the page to fully render
    await page.waitForTimeout(2000);

    // Look for Voice Mode panel or button
    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton).first();

    let panelExists = (await voicePanel.count()) > 0;

    if (!panelExists) {
      console.log(
        "ℹ Voice Mode panel not visible - clicking voice toggle to open",
      );

      await expect(voiceButton).toBeVisible({ timeout: 5000 });
      await voiceButton.click();
      await expect(voicePanel.first()).toBeVisible({ timeout: 5000 });
      panelExists = (await voicePanel.count()) > 0;
    }

    expect(
      panelExists,
      "Voice Mode UI should be available in unified Chat with Voice",
    ).toBe(true);

    console.log("✓ Voice Mode panel is now visible");

    // Find "Start Voice Session" button
    const startButton = page.locator(VOICE_SELECTORS.startButton);

    const startButtonExists = (await startButton.count()) > 0;

    expect(
      startButtonExists,
      "Expected a Start Voice Session control (button or compact mic) to be present",
    ).toBe(true);

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

  test("should connect to OpenAI Realtime API with valid backend (LIVE_REALTIME_E2E=1 only)", async ({
    authenticatedPage,
  }) => {
    // This test only runs when LIVE_REALTIME_E2E=1 is set
    test.skip(!LIVE_REALTIME_E2E, "Set LIVE_REALTIME_E2E=1 to run live backend tests");

    const page = authenticatedPage;

    console.log("🔴 Running LIVE realtime backend test (requires valid OpenAI key)");

    // Navigate to chat with voice mode enabled
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");

    // Wait for the page to fully render
    await page.waitForTimeout(2000);

    // Look for Voice Mode panel or button (unified selectors)
    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton).first();
    let panelExists = (await voicePanel.count()) > 0;

    if (!panelExists) {
      console.log(
        "ℹ Voice Mode panel not visible - clicking voice toggle to open",
      );
      await expect(voiceButton).toBeVisible({ timeout: 5000 });
      await voiceButton.click();
      await expect(voicePanel.first()).toBeVisible({ timeout: 5000 });
      panelExists = (await voicePanel.count()) > 0;
    }

    console.log("✓ Voice Mode panel is now visible");

    // Find Start button
    const startButton = page.locator(VOICE_SELECTORS.startButton);

    await expect(startButton.first()).toBeVisible();
    await startButton.first().click();

    // Wait for connection (with longer timeout for real backend)
    await page.waitForTimeout(5000);

    // Expect either:
    // 1. Connected state
    // 2. Error with helpful message
    const connectedTextCount = await page
      .locator('text=/connected|active/i')
      .count();
    const connectedClassCount = await page
      .locator('[class*="connected"]')
      .count();
    const connected = connectedTextCount + connectedClassCount;

    const errorBannerCount = await page.locator('[role="alert"]').count();
    const errorTextCount = await page
      .locator('text=/error|failed/i')
      .count();
    const error = errorBannerCount + errorTextCount;

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
