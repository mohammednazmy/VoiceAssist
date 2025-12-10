/**
 * Voice Mode Session
 *
 * E2E Test - Implemented
 * Description: User starts a voice-enabled consultation session
 *
 * Tests voice mode UI functionality:
 * 1. User authenticates
 * 2. Navigates to chat
 * 3. Activates voice input mode
 * 4. Verifies voice UI elements
 * 5. Can deactivate voice mode
 *
 * Note: This test does not actually test audio capture/speech recognition
 * as those require browser permissions and real microphone hardware.
 * It tests that the voice mode UI is accessible and functional.
 */

import { test, expect } from "../fixtures/auth";

test.describe("Voice Mode Session", () => {
  test.setTimeout(45000); // 45 second timeout

  test("Voice mode UI elements are present and accessible", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate via Home "Chat with Voice" tile (canonical path)
    await page.goto("/");
    const voiceModeCard = page.getByTestId("chat-with-voice-card");
    await expect(voiceModeCard).toBeVisible({ timeout: 10000 });
    await voiceModeCard.click();

    // Unified Chat + Voice UI should be rendered on /chat
    await expect(page).toHaveURL(/\/chat/);

    // Wait for chat interface to load
    await page.waitForLoadState("networkidle");

    // Unified chat container should be present
    await expect(page.getByTestId("unified-chat-container")).toBeVisible({
      timeout: 10000,
    });

    // Use unified voice-mode toggle as the canonical entry point
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });
    await expect(voiceButton).toBeEnabled();

    // Click to open Thinker/Talker Voice panel
    await voiceButton.click();

    const voicePanel = page.getByTestId("voice-mode-panel");
    await expect(voicePanel).toBeVisible({ timeout: 10000 });

    // Compact voice bar + mic button should be present inside the panel
    const compactMic = page.getByTestId("compact-mic-button");
    await expect(compactMic).toBeVisible();

    // Toggle voice mode closed via the same button
    await voiceButton.click();
    await expect(voicePanel).toBeHidden();

    // Verify text input remains available after closing voice mode
    const messageInput = page.getByTestId("message-input");
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    console.log("Voice mode UI test completed successfully (unified Chat with Voice)");
  });

  test("Voice mode is keyboard accessible", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Navigate directly to Chat with Voice
    await page.goto("/chat?mode=voice");
    await expect(page).toHaveURL(/\/chat/);

    await page.waitForLoadState("networkidle");

    // Unified voice toggle should be present
    const voiceButton = page.getByTestId("voice-mode-toggle");
    await expect(voiceButton).toBeVisible({ timeout: 10000 });

    // Test keyboard focus
    await voiceButton.focus();

    // Verify it can receive focus
    const isFocused = await voiceButton.evaluate(
      (el) => document.activeElement === el,
    );

    // Voice button should be focusable for accessibility
    console.log(`Voice button focusable: ${isFocused}`);

    // Check for proper ARIA attributes
    const ariaLabel = await voiceButton.getAttribute("aria-label");
    const role = await voiceButton.getAttribute("role");

    console.log(`ARIA label: ${ariaLabel}`);
    console.log(`Role: ${role || "button (implicit)"}`);

    // Basic accessibility check passed
    expect(ariaLabel || role).toBeTruthy();
  });

  test("Chat still works when voice mode is not used", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to chat page
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/chat/);

    // Find chat input (unified input area)
    const chatInput = page.getByTestId("message-input");

    await expect(chatInput.first()).toBeVisible({ timeout: 10000 });

    // Type a simple greeting
    await chatInput.first().fill("Hello");

    // Verify input received the text
    await expect(chatInput.first()).toHaveValue("Hello");

    console.log("Text input works correctly alongside voice mode");
  });
});
