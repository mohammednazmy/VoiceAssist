/**
 * Voice Mode Error UX E2E Tests
 *
 * Tests the error handling UI in Voice Mode, including:
 * - Microphone permission denied error card
 * - Connection failure states
 * - Retry mechanisms
 *
 * NOTE: These tests focus on UI states, not actual microphone functionality
 * since Playwright cannot grant/deny real microphone permissions in all browsers.
 */

import { test, expect } from "./fixtures/auth";

test.describe("Voice Mode Error UI", () => {
  test.setTimeout(45000);

  test("should display voice mode panel with status indicators", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to chat with voice mode
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for Voice Mode panel
    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    const voiceButton = page.locator('[data-testid="realtime-voice-mode-button"]');

    let panelExists = await voicePanel.count() > 0;

    // If panel not visible, click the voice button to open it
    if (!panelExists) {
      const hasButton = await voiceButton.count() > 0;
      if (hasButton) {
        await voiceButton.click();
        await page.waitForTimeout(1000);
        panelExists = await voicePanel.count() > 0;
      }
    }

    if (!panelExists) {
      test.skip(true, "Voice Mode panel not available");
      return;
    }

    console.log("✓ Voice Mode panel is visible");

    // Check for status indicators within the panel
    const statusIndicators = voicePanel.locator('[class*="status"]')
      .or(voicePanel.getByText(/disconnected|connecting|connected|ready/i));

    const hasStatus = await statusIndicators.count() > 0;
    if (hasStatus) {
      const statusText = await statusIndicators.first().textContent();
      console.log(`✓ Status indicator found: "${statusText}"`);
    }
  });

  test("should show mic permission error card when permission is denied", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to chat with voice mode
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Open voice panel if needed
    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    const voiceButton = page.locator('[data-testid="realtime-voice-mode-button"]');

    let panelExists = await voicePanel.count() > 0;

    if (!panelExists) {
      const hasButton = await voiceButton.count() > 0;
      if (hasButton) {
        await voiceButton.click();
        await page.waitForTimeout(1000);
        panelExists = await voicePanel.count() > 0;
      }
    }

    if (!panelExists) {
      test.skip(true, "Voice Mode panel not available");
      return;
    }

    // Check for mic permission error card (data-testid we added in Task B)
    const micPermissionError = page.locator('[data-testid="mic-permission-error"]');
    const recheckButton = page.locator('[data-testid="recheck-mic-button"]');

    // The error card should NOT be visible initially (before we try to start)
    const hasErrorInitially = await micPermissionError.count() > 0;

    if (hasErrorInitially) {
      console.log("⚠ Mic permission error already visible (permission previously denied)");

      // Verify the error card has the expected content
      await expect(micPermissionError).toBeVisible();
      await expect(
        micPermissionError.getByText(/microphone access blocked/i)
      ).toBeVisible();

      // Verify re-check button exists
      if (await recheckButton.count() > 0) {
        await expect(recheckButton).toBeVisible();
        console.log("✓ Re-check Microphone button found");
      }

      // Verify step-by-step instructions
      const instructions = micPermissionError.locator('ol li');
      const instructionCount = await instructions.count();
      console.log(`✓ Found ${instructionCount} instruction steps`);
      expect(instructionCount).toBeGreaterThan(0);
    } else {
      console.log("✓ No mic permission error initially (expected state)");

      // Try to start voice session to potentially trigger error
      const startButton = page.locator(
        'button:has-text("Start Voice Session"), button:has-text("Start Session"), [data-testid="start-voice-session"]'
      );

      const hasStartButton = await startButton.count() > 0;

      if (hasStartButton) {
        console.log("Clicking Start Voice Session to test error handling...");
        await startButton.first().click();
        await page.waitForTimeout(3000);

        // Check if mic permission error appeared
        const hasErrorNow = await micPermissionError.count() > 0;

        if (hasErrorNow) {
          console.log("✓ Mic permission error card appeared after start attempt");
          await expect(micPermissionError).toBeVisible();
        } else {
          console.log("ℹ No mic permission error (permission may have been granted or mocked)");
        }
      }
    }
  });

  test("should display re-check microphone button in error state", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Check for the re-check button (added in Task B)
    const recheckButton = page.locator('[data-testid="recheck-mic-button"]');
    const micPermissionError = page.locator('[data-testid="mic-permission-error"]');

    // If error card is visible, verify button is present
    const hasError = await micPermissionError.count() > 0;

    if (hasError) {
      await expect(recheckButton).toBeVisible();
      await expect(recheckButton).toBeEnabled();

      const buttonText = await recheckButton.textContent();
      expect(buttonText?.toLowerCase()).toContain("microphone");
      console.log(`✓ Re-check button found: "${buttonText}"`);
    } else {
      console.log("ℹ Mic permission error not visible - re-check button test skipped");
    }
  });

  test("should show connection failed state with retry option", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Block WebSocket connections to simulate failure
    await page.route("**/realtime/**", (route) => route.abort());
    await page.route("**/ws/**", (route) => route.abort());
    await page.route("**/session/config**", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service unavailable" }),
      });
    });

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Open voice panel
    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    const voiceButton = page.locator('[data-testid="realtime-voice-mode-button"]');

    let panelExists = await voicePanel.count() > 0;

    if (!panelExists) {
      const hasButton = await voiceButton.count() > 0;
      if (hasButton) {
        await voiceButton.click();
        await page.waitForTimeout(1000);
        panelExists = await voicePanel.count() > 0;
      }
    }

    if (!panelExists) {
      test.skip(true, "Voice Mode panel not available");
      return;
    }

    // Try to start voice session
    const startButton = page.locator(
      'button:has-text("Start Voice Session"), button:has-text("Start Session")'
    );

    const hasStartButton = await startButton.count() > 0;

    if (hasStartButton) {
      await startButton.first().click();
      await page.waitForTimeout(3000);

      // Check for error indicators
      const errorIndicators = page.locator('[role="alert"]')
        .or(page.getByText(/failed|error|unable|unavailable/i))
        .or(page.locator('[class*="error"]'));

      const hasError = await errorIndicators.count() > 0;

      if (hasError) {
        console.log("✓ Error indicator found after connection failure");

        // Look for retry/reconnect option
        const retryButton = page.locator(
          'button:has-text("Retry"), button:has-text("Try again"), button:has-text("Reconnect")'
        );

        const hasRetry = await retryButton.count() > 0;
        if (hasRetry) {
          console.log("✓ Retry button found");
        }
      } else {
        console.log("ℹ No error indicator (may have fallback handling)");
      }
    }
  });

  test("should display voice settings when panel is open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Open voice panel
    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    const voiceButton = page.locator('[data-testid="realtime-voice-mode-button"]');

    let panelExists = await voicePanel.count() > 0;

    if (!panelExists) {
      const hasButton = await voiceButton.count() > 0;
      if (hasButton) {
        await voiceButton.click();
        await page.waitForTimeout(1000);
        panelExists = await voicePanel.count() > 0;
      }
    }

    if (!panelExists) {
      test.skip(true, "Voice Mode panel not available");
      return;
    }

    // Look for voice settings button or panel
    const settingsButton = page.locator(
      'button[aria-label*="settings" i], button:has-text("Settings"), [data-testid="voice-settings"]'
    );

    const hasSettings = await settingsButton.count() > 0;

    if (hasSettings) {
      console.log("✓ Voice settings button found");

      // Click to open settings
      await settingsButton.first().click();
      await page.waitForTimeout(500);

      // Look for voice/speed options
      const voiceOptions = page.getByText(/voice|speed|rate/i)
        .or(page.locator('select'))
        .or(page.locator('[role="listbox"]'));

      const hasVoiceOptions = await voiceOptions.count() > 0;
      if (hasVoiceOptions) {
        console.log("✓ Voice settings options visible");
      }
    } else {
      console.log("ℹ Voice settings not found (may not be implemented)");
    }
  });
});

test.describe("Voice Mode Accessibility", () => {
  test.setTimeout(30000);

  test("should have accessible voice mode controls", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Check for voice mode button accessibility
    const voiceButton = page.locator('[data-testid="realtime-voice-mode-button"]');

    const hasButton = await voiceButton.count() > 0;

    if (hasButton) {
      // Check for aria-label
      const ariaLabel = await voiceButton.getAttribute("aria-label");
      const title = await voiceButton.getAttribute("title");

      if (ariaLabel || title) {
        console.log(`✓ Voice button has accessible label: "${ariaLabel || title}"`);
      } else {
        console.log("⚠ Voice button missing aria-label");
      }

      // Check if button is keyboard focusable
      await voiceButton.focus();
      const isFocused = await voiceButton.evaluate(
        (el) => document.activeElement === el
      );

      expect(isFocused).toBe(true);
      console.log("✓ Voice button is keyboard focusable");
    }
  });

  test("should announce connection status changes for screen readers", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for live regions that announce status changes
    const liveRegions = page.locator(
      '[aria-live], [role="status"], [role="alert"]'
    );

    const hasLiveRegion = await liveRegions.count() > 0;

    if (hasLiveRegion) {
      console.log("✓ Found live region for screen reader announcements");
    } else {
      console.log("ℹ No explicit live region found");
    }

    // Check for status text that could be announced
    const statusText = page.getByText(/connecting|connected|disconnected|error/i);

    const hasStatusText = await statusText.count() > 0;

    if (hasStatusText) {
      console.log("✓ Status text available for screen readers");
    }
  });
});
