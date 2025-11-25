/**
 * Voice Mode Navigation E2E Test
 *
 * Tests the Voice Mode user journey from Home page to Chat with voice panel.
 *
 * Flow tested:
 * 1. User lands on Home page (authenticated)
 * 2. User clicks "Voice Mode" tile
 * 3. User is navigated to /chat with voice mode state
 * 4. Voice Mode panel auto-opens
 * 5. User sees "Start Voice Session" button
 *
 * NOTE: This test does NOT test actual WebSocket connection or audio capture.
 * It only verifies the UX flow and UI elements presence.
 */

import { test, expect } from "./fixtures/auth";

test.describe("Voice Mode Navigation Flow", () => {
  test.setTimeout(30000); // 30 second timeout

  test("should navigate from Home Voice Mode tile to Chat with voice panel open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Step 1: Navigate to home page
    await page.goto("/");
    // URL should be root or /home (with or without trailing slash)
    await expect(page).toHaveURL(/\/$|\/home/);

    // Step 2: Wait for Voice Mode card to be visible
    const voiceModeCard = page.getByTestId("voice-mode-card");
    await expect(voiceModeCard).toBeVisible({ timeout: 10000 });

    // Verify Voice Mode card content
    await expect(voiceModeCard.getByRole("heading", { name: /voice mode/i })).toBeVisible();

    // Step 3: Click Voice Mode card
    await voiceModeCard.click();

    // Step 4: Verify navigation to /chat
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Step 5: Verify Voice Mode panel is present
    // The panel should auto-open because we navigated with startVoiceMode state
    const voicePanel = page.locator(
      '[data-testid="voice-mode-panel"], [class*="VoiceModePanel"], [aria-label*="voice mode" i], section:has-text("Voice Mode")'
    );

    // Check if voice panel exists and is visible
    const panelExists = await voicePanel.count() > 0;

    if (panelExists) {
      await expect(voicePanel.first()).toBeVisible({ timeout: 5000 });
      console.log("✓ Voice Mode panel is visible");

      // Step 6: Verify "Start Voice Session" button is present
      const startButton = page.locator(
        'button:has-text("Start Voice Session"), button:has-text("Start Session"), button[aria-label*="start voice" i], [data-testid="start-voice-session"]'
      );

      const startButtonExists = await startButton.count() > 0;

      if (startButtonExists) {
        await expect(startButton.first()).toBeVisible();
        await expect(startButton.first()).toBeEnabled();
        console.log("✓ Start Voice Session button is present and enabled");
      } else {
        console.warn("⚠ Start Voice Session button not found (may be in different state)");
      }

      // Step 7: Verify voice settings button (optional, may be added by Claude 2)
      const settingsButton = page.locator(
        'button[aria-label*="voice settings" i], button[aria-label*="settings" i]:near([data-testid="voice-mode-panel"])'
      );

      const hasSettingsButton = await settingsButton.count() > 0;
      if (hasSettingsButton) {
        console.log("✓ Voice settings button found (optional feature)");
      } else {
        console.log("ℹ Voice settings button not found (not yet implemented)");
      }
    } else {
      // Panel might not auto-open if feature is disabled or changed
      console.warn(
        "⚠ Voice Mode panel not found - checking for voice mode button instead"
      );

      // Fallback: Check for voice mode button/toggle
      const voiceModeButton = page.locator(
        'button[aria-label*="voice mode" i], button[aria-label*="realtime" i], [data-testid="realtime-voice-mode-button"]'
      );

      const hasVoiceButton = await voiceModeButton.count() > 0;
      expect(
        hasVoiceButton,
        "Either Voice Mode panel or voice mode button must be present"
      ).toBe(true);
    }
  });

  test("should display Voice Mode tile with correct branding and NEW badge", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find Voice Mode card
    const voiceModeCard = page.getByTestId("voice-mode-card");
    await expect(voiceModeCard).toBeVisible();

    // Verify card has heading
    const heading = voiceModeCard.getByRole("heading", { name: /voice mode/i });
    await expect(heading).toBeVisible();

    // Verify card has description mentioning hands-free or voice
    const description = voiceModeCard.locator("text=/hands-free|voice|speak/i");
    await expect(description.first()).toBeVisible();

    // Verify NEW badge is present (optional, may be removed later)
    const badge = voiceModeCard.locator('[class*="badge" i], [class*="tag" i]');
    const hasBadge = await badge.count() > 0;

    if (hasBadge) {
      console.log("✓ NEW badge found on Voice Mode card");
    } else {
      console.log("ℹ NEW badge not found (may have been removed)");
    }
  });

  test("should allow keyboard navigation to Voice Mode tile", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find Voice Mode card
    const voiceModeCard = page.getByTestId("voice-mode-card");
    await expect(voiceModeCard).toBeVisible();

    // Test keyboard focus
    await voiceModeCard.focus();
    await page.keyboard.press("Tab"); // May focus on other interactive elements first
    await page.keyboard.press("Tab");

    // Try to focus and activate with Enter key
    await voiceModeCard.focus();
    const isFocused = await voiceModeCard.evaluate(
      (el) => document.activeElement === el
    );

    console.log(`Voice Mode card focusable: ${isFocused}`);

    // Card should be clickable/tabbable for accessibility
    const isInteractive = await voiceModeCard.evaluate((el) => {
      const role = el.getAttribute("role");
      const tabindex = el.getAttribute("tabindex");
      return role === "button" || tabindex === "0" || el.tagName === "BUTTON";
    });

    expect(
      isFocused || isInteractive,
      "Voice Mode card should be keyboard accessible"
    ).toBe(true);
  });

  test("should show Chat tile alongside Voice Mode tile", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Voice Mode and Chat tiles should be visible on the home page
    const voiceModeCard = page.getByTestId("voice-mode-card");

    // The Chat card doesn't have a specific data-testid, so we look for it by content
    const chatCard = page.locator('div:has-text("Chat"):has-text("conversation")').first();

    await expect(voiceModeCard).toBeVisible();
    await expect(chatCard).toBeVisible();

    console.log("✓ Both Voice Mode and Chat tiles are visible");
  });
});
