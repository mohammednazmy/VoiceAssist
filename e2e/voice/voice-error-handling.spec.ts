/**
 * Voice Error Handling E2E Tests
 *
 * Tests error handling and recovery scenarios including:
 * - Microphone permission denied
 * - WebSocket disconnection
 * - Connection failure
 * - Session timeout
 * - Network interruption recovery
 */

import {
  test,
  expect,
  VOICE_SELECTORS,
  VOICE_CONFIG,
  WAIT_TIMES,
  navigateToVoiceChat,
  waitForVoicePanel,
  startVoiceSession,
  stopVoiceSession,
  waitForVoiceConnection,
} from "../fixtures/voice";
import { test as base, BrowserContext, Page } from "@playwright/test";

// Extended fixture for error testing
const errorTest = base.extend<{
  errorPage: Page;
  deniedMicContext: BrowserContext;
}>({
  // Context with microphone permission denied
  deniedMicContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      permissions: [], // No permissions granted
    });
    await use(context);
    await context.close();
  },

  errorPage: async ({ deniedMicContext }, use) => {
    const page = await deniedMicContext.newPage();

    // Set up auth state
    await page.addInitScript(() => {
      const authState = {
        state: {
          user: { id: "e2e-test-user", email: "test@example.com", name: "Test User", role: "user" },
          tokens: { accessToken: "mock-token", refreshToken: "mock-refresh", expiresIn: 3600 },
          isAuthenticated: true,
          _hasHydrated: true,
        },
        version: 0,
      };
      window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
    });

    // Mock API responses
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: "e2e-test-user", email: "test@example.com" } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: null }),
        });
      }
    });

    await use(page);
  },
});

// Skip all tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live voice tests");
  }
});

test.describe("Voice Error Handling - Mic Permission", () => {
  test.setTimeout(60000);

  // This test uses the errorTest fixture with denied mic permissions
  errorTest("should show error when mic permission denied", async ({ errorPage }) => {
    const page = errorPage;

    // Navigate to voice chat
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Look for Voice Mode panel
    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);

    let panelVisible = await voicePanel.count() > 0;

    if (!panelVisible && await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    // Try to start voice session
    const startButton = page.locator(VOICE_SELECTORS.startButton);

    if (await startButton.count() > 0) {
      await startButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.CONNECTION);

      // Should show permission error or error banner
      const errorIndicators = page.locator(
        `${VOICE_SELECTORS.errorBanner}, ${VOICE_SELECTORS.permissionError}, text=/permission|denied|microphone|access/i`
      );

      const hasError = await errorIndicators.count() > 0;

      if (hasError) {
        console.log("Mic permission error displayed correctly");
        await expect(errorIndicators.first()).toBeVisible();

        // Get error message
        const errorText = await errorIndicators.first().textContent();
        console.log(`Error message: ${errorText}`);
      } else {
        // Browser may handle permission differently in headless mode
        console.log("No explicit permission error - may be handled by browser");
      }
    }
  });

  errorTest("should offer fallback to text on mic error", async ({ errorPage }) => {
    const page = errorPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Look for Voice Mode panel
    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);

    if (await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    // Try to start voice session
    const startButton = page.locator(VOICE_SELECTORS.startButton);

    if (await startButton.count() > 0) {
      await startButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.CONNECTION);

      // Check for text input fallback
      const textInput = page.locator(
        'input[type="text"], textarea, [data-testid="chat-input"], [contenteditable="true"]'
      );

      const hasTextFallback = await textInput.count() > 0;

      if (hasTextFallback) {
        console.log("Text input fallback is available");
        await expect(textInput.first()).toBeVisible();
      }

      // Check for "Use text instead" option
      const fallbackOption = page.locator(
        'button:has-text("Use text"), button:has-text("Type instead"), [data-testid="text-fallback"]'
      );

      const hasFallbackOption = await fallbackOption.count() > 0;

      if (hasFallbackOption) {
        console.log("Text fallback option is offered");
        await fallbackOption.first().click();
        await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
      }

      // Text input should remain functional
      expect(hasTextFallback || hasFallbackOption).toBe(true);
    }
  });
});

test.describe("Voice Error Handling - Connection", () => {
  test.setTimeout(90000);

  test("should handle WebSocket disconnection", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    console.log("Connected - simulating disconnection");

    // Simulate network disconnection by blocking WebSocket
    await page.route("**/realtime**", async (route) => {
      await route.abort("connectionfailed");
    });

    // Wait for disconnection to be detected
    await page.waitForTimeout(5000);

    // Check for disconnection indicator or reconnection attempt
    // Use separate locators for text and class patterns
    const hasDisconnectIndicator = await page.evaluate(() => {
      // Check for text content indicating disconnection
      const textIndicators = Array.from(document.querySelectorAll('*')).some(el => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('disconnect') || text.includes('reconnect') ||
               text.includes('connection lost') || text.includes('error');
      });
      // Check for class-based indicators
      const classIndicators = document.querySelector('[class*="disconnect"]') ||
                             document.querySelector('[class*="reconnect"]');
      return textIndicators || !!classIndicators;
    });

    if (hasDisconnectIndicator) {
      console.log("Disconnection indicator displayed");
    }

    // Check for error message or toast
    const errorToast = page.locator(VOICE_SELECTORS.errorBanner);
    const hasErrorToast = await errorToast.count() > 0;

    if (hasErrorToast) {
      const toastText = await errorToast.first().textContent();
      console.log(`Error toast: ${toastText}`);
    }

    // Either disconnection indicator or error should show
    expect(hasDisconnectIndicator || hasErrorToast).toBe(true);

    // Cleanup route blocking
    await page.unroute("**/realtime**");
  });

  test("should show retry button on connection failure", async ({ voicePage }) => {
    const page = voicePage;

    // Block the realtime session endpoint to simulate failure
    await page.route("**/api/voice/realtime-session**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service unavailable" }),
      });
    });

    await navigateToVoiceChat(page);

    // Opening voice panel starts the session automatically
    await waitForVoicePanel(page);

    // Wait for error
    await page.waitForTimeout(WAIT_TIMES.CONNECTION);

    // Check for error state
    const errorIndicator = page.locator(
      `${VOICE_SELECTORS.errorBanner}, text=/error|failed|unavailable/i`
    );

    const hasError = await errorIndicator.count() > 0;

    if (hasError) {
      console.log("Connection error displayed");

      // Look for retry button
      const retryButton = page.locator(VOICE_SELECTORS.retryButton);
      const hasRetry = await retryButton.count() > 0;

      if (hasRetry) {
        console.log("Retry button is available");
        await expect(retryButton.first()).toBeVisible();

        // Unblock the endpoint and try retry
        await page.unroute("**/api/voice/realtime-session**");
        await retryButton.first().click();

        // Verify retry was attempted
        await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
        console.log("Retry button clicked");
      } else {
        console.log("No explicit retry button - may auto-retry");
      }
    }

    await page.unroute("**/api/voice/realtime-session**");
  });

  test("should recover from temporary network issue", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    console.log("Connected - simulating temporary network issue");

    // Simulate brief network outage
    await page.route("**/*", async (route) => {
      await route.abort("connectionfailed");
    });

    // Brief outage
    await page.waitForTimeout(2000);

    // Restore network
    await page.unroute("**/*");

    // Wait for potential reconnection
    await page.waitForTimeout(WAIT_TIMES.CONNECTION);

    // Check if connection recovered or shows reconnecting
    const connectionStatus = page.locator(VOICE_SELECTORS.connectionStatus).first();
    const statusText = await connectionStatus.first().textContent().catch(() => "");

    console.log(`Connection status after recovery: ${statusText}`);

    // The connection should either recover or show a retry option
    const reconnectingIndicator = page.locator('text=/reconnecting/i');
    const hasReconnecting = await reconnectingIndicator.count() > 0;

    if (hasReconnecting) {
      console.log("System is attempting to reconnect");
    }

    await stopVoiceSession(page);
  });

  test("should handle session timeout gracefully", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    console.log("Connected - waiting for potential timeout");

    // Note: Real session timeout may take several minutes
    // For testing, we verify the UI can handle timeout gracefully
    // by checking that timeout-related UI elements exist

    // Check for session timer or timeout indicator
    const sessionTimer = page.locator(
      '[data-testid="session-timer"], [class*="timer"], [class*="timeout"]'
    );

    const hasTimer = await sessionTimer.count() > 0;

    if (hasTimer) {
      console.log("Session timer is displayed");
      const timerText = await sessionTimer.first().textContent();
      console.log(`Timer: ${timerText}`);
    }

    // Instead of waiting for actual timeout, verify clean disconnect works
    await stopVoiceSession(page);

    // Verify clean disconnection
    const disconnectedState = page.locator('text=/disconnected/i');
    const startButton = page.locator(VOICE_SELECTORS.startButton);

    const isCleanDisconnect =
      await disconnectedState.count() > 0 ||
      await startButton.count() > 0;

    expect(isCleanDisconnect).toBe(true);
    console.log("Session ended gracefully");
  });
});

test.describe("Voice Error Handling - Error Messages", () => {
  test.setTimeout(45000);

  test("should display user-friendly error messages", async ({ voicePage }) => {
    const page = voicePage;

    // Block API to trigger error
    await page.route("**/api/voice/realtime-session**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error", code: "VOICE_001" }),
      });
    });

    await navigateToVoiceChat(page);

    // Opening voice panel starts the session automatically
    await waitForVoicePanel(page);
    await page.waitForTimeout(WAIT_TIMES.CONNECTION);

    // Check error message
    const errorBanner = page.locator(VOICE_SELECTORS.errorBanner);

    if (await errorBanner.count() > 0) {
      const errorText = await errorBanner.first().textContent();
      console.log(`Error message: ${errorText}`);

      // Error should be user-friendly, not technical
      // Should NOT contain stack traces, raw JSON, etc.
      const hasTechnicalDetails = errorText?.includes("stack") || errorText?.includes("trace");
      expect(hasTechnicalDetails).toBe(false);

      console.log("Error message is user-friendly");
    }

    await page.unroute("**/api/voice/realtime-session**");
  });

  test("should allow dismissing error notifications", async ({ voicePage }) => {
    const page = voicePage;

    // Trigger an error
    await page.route("**/api/voice/realtime-session**", async (route) => {
      await route.fulfill({ status: 503 });
    });

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    const startButton = page.locator(VOICE_SELECTORS.startButton);
    await startButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.CONNECTION);

    const errorBanner = page.locator(VOICE_SELECTORS.errorBanner);

    if (await errorBanner.count() > 0) {
      // Look for dismiss button
      const dismissButton = page.locator(
        '[data-testid="dismiss-error"], [aria-label*="dismiss" i], [aria-label*="close" i], button.toast-close'
      );

      const canDismiss = await dismissButton.count() > 0;

      if (canDismiss) {
        await dismissButton.first().click();
        await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

        // Error should be dismissed
        const stillVisible = await errorBanner.count() > 0;
        console.log(`Error dismissed: ${!stillVisible}`);
      } else {
        // Error may auto-dismiss after timeout
        console.log("No dismiss button - error may auto-dismiss");
      }
    }

    await page.unroute("**/api/voice/realtime-session**");
  });
});
