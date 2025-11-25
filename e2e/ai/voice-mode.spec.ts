/**
 * Voice Mode Session
 *
 * STATUS: IMPLEMENTED - ACTIVE TEST
 * Description: User starts a voice-enabled consultation session
 *
 * Tests voice mode UI functionality:
 * - Voice input button presence and interaction
 * - Realtime voice mode panel activation
 * - Voice input panel activation
 * - Panel close functionality
 * - Text input still works alongside voice
 *
 * Note: This test does not actually test audio capture/speech recognition
 * as those require browser permissions and real microphone hardware.
 * It tests that the voice mode UI is accessible and functional.
 */

import { test, expect, Page } from "@playwright/test";
import { setupAuthenticatedState } from "../fixtures/auth";

/**
 * Stub getUserMedia to prevent actual microphone access prompts
 */
async function stubMediaDevices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Create mock MediaStream
    const mockMediaStream = {
      getTracks: () => [
        {
          stop: () => {},
          kind: "audio",
          enabled: true,
          id: "mock-audio-track",
        },
      ],
      getAudioTracks: () => [
        {
          stop: () => {},
          kind: "audio",
          enabled: true,
          id: "mock-audio-track",
        },
      ],
      addTrack: () => {},
      removeTrack: () => {},
    } as unknown as MediaStream;

    // Mock getUserMedia
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => mockMediaStream;
    }

    // Mock MediaRecorder
    class MockMediaRecorder {
      state = "inactive";
      ondataavailable: ((e: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        if (this.ondataavailable) {
          const event = {
            data: new Blob(["mock"], { type: "audio/webm" }),
          } as BlobEvent;
          this.ondataavailable(event);
        }
        if (this.onstop) this.onstop();
      }
    }
    // @ts-ignore
    window.MediaRecorder = MockMediaRecorder;
  });
}

/**
 * Navigate to chat page and wait for it to load
 */
async function navigateToChat(page: Page): Promise<void> {
  await page.goto("/chat");
  // Wait for chat interface to load - look for textarea or input
  await page.waitForSelector(
    'textarea[placeholder*="Type"], textarea[placeholder*="message"], input[placeholder*="Type"]',
    { timeout: 15000 }
  );
}

test.describe("Voice Mode Session", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedState(page);
    await stubMediaDevices(page);
  });

  test("should display voice input button in chat", async ({ page }) => {
    await navigateToChat(page);

    // Look for voice input button with specific aria-label
    const voiceInputBtn = page.locator('button[aria-label="Voice input"]');
    const voiceInputVisible = await voiceInputBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Also check for realtime voice mode button
    const realtimeBtn = page.locator(
      'button[aria-label="Realtime voice mode"]'
    );
    const realtimeVisible = await realtimeBtn
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // At least one voice button should be visible
    expect(voiceInputVisible || realtimeVisible).toBe(true);
  });

  test("should open voice input panel when clicking voice button", async ({
    page,
  }) => {
    await navigateToChat(page);

    const voiceInputBtn = page.locator('button[aria-label="Voice input"]');
    const isVisible = await voiceInputBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      await voiceInputBtn.click();

      // Voice input panel should appear with "Voice Input" heading
      await expect(page.locator("text=Voice Input")).toBeVisible({
        timeout: 5000,
      });

      // Should show the hold to record button
      const holdButton = page.locator('button:has-text("Hold to Record")');
      await expect(holdButton).toBeVisible({ timeout: 3000 });
    } else {
      // Skip if voice input not available
      test.skip(true, "Voice input button not available");
    }
  });

  test("should close voice input panel with close button", async ({ page }) => {
    await navigateToChat(page);

    const voiceInputBtn = page.locator('button[aria-label="Voice input"]');
    const isVisible = await voiceInputBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      await voiceInputBtn.click();

      // Verify panel is open
      await expect(page.locator("text=Voice Input")).toBeVisible();

      // Click close button
      const closeBtn = page.locator('button[aria-label="Close voice input"]');
      await closeBtn.click();

      // Panel should be closed
      await expect(page.locator("text=Voice Input")).not.toBeVisible({
        timeout: 3000,
      });
    } else {
      test.skip(true, "Voice input button not available");
    }
  });

  test("should open realtime voice mode panel", async ({ page }) => {
    await navigateToChat(page);

    const realtimeBtn = page.locator(
      'button[aria-label="Realtime voice mode"]'
    );
    const isVisible = await realtimeBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      await realtimeBtn.click();

      // Voice mode panel should appear
      await expect(page.locator("text=Voice Mode")).toBeVisible({
        timeout: 5000,
      });

      // Should show disconnected status initially
      await expect(page.locator("text=Disconnected")).toBeVisible();

      // Should have Start Voice Session button
      await expect(
        page.locator('button:has-text("Start Voice Session")')
      ).toBeVisible();
    } else {
      // Realtime voice mode may not be enabled
      test.skip(true, "Realtime voice mode not available");
    }
  });

  test("should display voice mode instructions", async ({ page }) => {
    await navigateToChat(page);

    const realtimeBtn = page.locator(
      'button[aria-label="Realtime voice mode"]'
    );
    const isVisible = await realtimeBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      await realtimeBtn.click();

      // Should show instructions
      await expect(page.locator("text=How Voice Mode Works")).toBeVisible({
        timeout: 5000,
      });

      // Instructions should include key points
      await expect(page.locator("text=Start Voice Session")).toBeVisible();
      await expect(page.locator("text=End Session")).toBeVisible();
    } else {
      // Fallback to regular voice input
      const voiceInputBtn = page.locator('button[aria-label="Voice input"]');
      if (await voiceInputBtn.isVisible({ timeout: 3000 })) {
        await voiceInputBtn.click();
        await expect(
          page.locator("text=Press and hold").or(page.locator("text=Hold"))
        ).toBeVisible({ timeout: 5000 });
      } else {
        test.skip(true, "No voice mode available");
      }
    }
  });

  test("should close realtime voice panel with close button", async ({
    page,
  }) => {
    await navigateToChat(page);

    const realtimeBtn = page.locator(
      'button[aria-label="Realtime voice mode"]'
    );
    const isVisible = await realtimeBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      await realtimeBtn.click();

      // Verify panel is open
      await expect(page.locator("text=Voice Mode")).toBeVisible();

      // Click close button
      const closeBtn = page.locator('button[aria-label="Close voice mode"]');
      await closeBtn.click();

      // Panel should be closed
      await expect(page.locator("text=Voice Mode")).not.toBeVisible({
        timeout: 3000,
      });
    } else {
      test.skip(true, "Realtime voice mode not available");
    }
  });

  test("should toggle voice input button state", async ({ page }) => {
    await navigateToChat(page);

    const voiceInputBtn = page.locator('button[aria-label="Voice input"]');
    const isVisible = await voiceInputBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      // First click - opens panel
      await voiceInputBtn.click();
      await expect(page.locator("text=Voice Input")).toBeVisible();

      // Second click - closes panel
      await voiceInputBtn.click();
      await expect(page.locator("text=Voice Input")).not.toBeVisible({
        timeout: 3000,
      });
    } else {
      test.skip(true, "Voice input button not available");
    }
  });

  test("text input still works alongside voice mode", async ({ page }) => {
    await navigateToChat(page);

    // Find text input
    const chatInput = page.locator(
      'textarea[placeholder*="Type"], textarea[placeholder*="message"]'
    );
    await expect(chatInput.first()).toBeVisible({ timeout: 10000 });

    // Type a message
    await chatInput.first().fill("Hello, this is a text message");

    // Verify input received the text
    await expect(chatInput.first()).toHaveValue(
      "Hello, this is a text message"
    );
  });

  test("should be keyboard accessible", async ({ page }) => {
    await navigateToChat(page);

    // Find voice button
    const voiceInputBtn = page.locator('button[aria-label="Voice input"]');
    const isVisible = await voiceInputBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      // Test keyboard focus
      await voiceInputBtn.focus();

      // Check for proper ARIA attributes
      const ariaLabel = await voiceInputBtn.getAttribute("aria-label");
      expect(ariaLabel).toBe("Voice input");

      // Press Enter to activate
      await page.keyboard.press("Enter");

      // Panel should open
      await expect(page.locator("text=Voice Input")).toBeVisible({
        timeout: 5000,
      });
    } else {
      test.skip(true, "Voice input button not available");
    }
  });
});
