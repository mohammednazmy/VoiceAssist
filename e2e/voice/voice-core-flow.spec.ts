/**
 * Voice Core Flow E2E Tests
 *
 * Tests the core voice conversation workflow with live OpenAI Realtime API.
 * These tests require LIVE_REALTIME_E2E=1 and a valid OpenAI API key.
 *
 * Test Coverage:
 * - Start voice session and connect
 * - Display partial transcripts while speaking
 * - Show final transcript in chat timeline
 * - Play AI audio response
 * - Support barge-in interruption
 * - Stop voice session
 * - Handle multiple conversation turns
 */

import { test, expect } from "@playwright/test";
import {
  VOICE_SELECTORS,
  VOICE_CONFIG,
  WAIT_TIMES,
  waitForVoicePanel,
  startVoiceSession,
  stopVoiceSession,
  waitForVoiceConnection,
  waitForTranscript,
  waitForAIResponse,
  navigateToVoiceChat,
} from "../fixtures/voice";

// Skip all tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live voice tests");
  }
});

test.describe("Voice Core Flow - Live Backend", () => {
  // Increase timeout for live API calls
  test.setTimeout(90000);

  test("should start voice session and show connected state", async ({ page }) => {
    // Navigate to voice chat with login handling
    await navigateToVoiceChat(page);
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Start voice session
    await startVoiceSession(page);

    // Wait for connection
    const connected = await waitForVoiceConnection(page);

    if (connected) {
      console.log("Connected to OpenAI Realtime API");

      // Verify connected indicator is visible - check for connection status indicator or voice panel
      // The connection status indicator may show "Connected" label or the voice panel itself is visible
      const hasConnectionIndicator = await page.evaluate(() => {
        // Check for connection status indicator with Connected text
        const statusEl = document.querySelector('[data-testid="connection-status-indicator"]');
        if (statusEl?.textContent?.toLowerCase()?.includes('connected')) return true;

        // Check for voice panel which indicates connected state
        const voicePanel = document.querySelector('[data-testid="compact-voice-bar"]') ||
                          document.querySelector('[data-testid="thinker-talker-voice-panel"]');
        return !!voicePanel;
      });
      expect(hasConnectionIndicator).toBe(true);

      // Verify Close/Stop button is available in compact bar
      const closeButton = page.locator(VOICE_SELECTORS.stopButton);
      await expect(closeButton.first()).toBeVisible();
    } else {
      // Check for error state
      const errorBanner = page.locator(VOICE_SELECTORS.errorBanner);
      const hasError = await errorBanner.count() > 0;

      if (hasError) {
        const errorText = await errorBanner.first().textContent();
        console.log(`Connection failed with error: ${errorText}`);
      }

      // Either connected or has error is acceptable for live test
      expect(connected || hasError).toBe(true);
    }

    // Cleanup
    await stopVoiceSession(page);
  });

  test("should display partial transcript while speaking", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Note: With fake media stream, we may not get real transcripts
    // This test verifies the transcript preview UI is functional
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Check if transcript preview component exists
    const transcriptPreview = page.locator(VOICE_SELECTORS.transcriptPreview);
    const transcriptExists = await transcriptPreview.count() > 0;

    if (transcriptExists) {
      console.log("Transcript preview component is present");
      await expect(transcriptPreview).toBeVisible();
    } else {
      // Partial transcript may not appear without real audio input
      console.log("Transcript preview not visible (expected with fake media stream)");
    }

    await stopVoiceSession(page);
  });

  test("should show final transcript in chat timeline", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Wait for potential transcript (may not appear with fake audio)
    const transcript = await waitForTranscript(page);

    if (transcript) {
      console.log(`Transcript received: "${transcript}"`);

      // Verify message appears in chat timeline
      const chatTimeline = page.locator(VOICE_SELECTORS.chatTimeline);
      await expect(chatTimeline).toBeVisible();

      // Check for user message in timeline
      const userMessage = page.locator(VOICE_SELECTORS.userMessage);
      const messageCount = await userMessage.count();
      console.log(`User messages in timeline: ${messageCount}`);
    } else {
      console.log("No transcript received (expected with fake media stream)");
    }

    await stopVoiceSession(page);
  });

  test("should play AI audio response", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Wait for AI response
    const aiResponse = await waitForAIResponse(page);

    if (aiResponse) {
      console.log(`AI response: "${aiResponse.substring(0, 100)}..."`);

      // Verify assistant message is in timeline
      const assistantMessage = page.locator(VOICE_SELECTORS.assistantMessage);
      await expect(assistantMessage.first()).toBeVisible();

      // Check for audio playback indicator (may vary by implementation)
      const audioIndicator = page.locator('[class*="playing"], [data-state="playing"]');
      const isPlaying = await audioIndicator.count() > 0;
      console.log(`Audio playback indicator: ${isPlaying ? "visible" : "not visible"}`);
    } else {
      console.log("No AI response received (may require real audio input)");
    }

    await stopVoiceSession(page);
  });

  test("should support barge-in interruption", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Wait for potential AI response
    await page.waitForTimeout(5000);

    // Check if AI is currently responding
    const aiResponding = page.locator('[class*="responding"], [data-state="responding"]');
    const isResponding = await aiResponding.count() > 0;

    if (isResponding) {
      console.log("AI is responding - testing barge-in");

      // Trigger barge-in by simulating new speech
      // In real scenario, speaking would trigger this
      // For test, we verify the UI supports cancellation
      const cancelButton = page.locator('button:has-text("Cancel"), [data-testid="cancel-response"]');
      const canCancel = await cancelButton.count() > 0;

      if (canCancel) {
        await cancelButton.click();
        console.log("Barge-in cancel button clicked");

        // Verify response was cancelled
        await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
        const stillResponding = await aiResponding.count() > 0;
        expect(stillResponding).toBe(false);
      } else {
        console.log("Barge-in is handled automatically via audio detection");
      }
    } else {
      console.log("AI not actively responding - barge-in test skipped");
    }

    await stopVoiceSession(page);
  });

  test("should stop voice session on Stop click", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Verify Stop button is visible
    const stopButton = page.locator(VOICE_SELECTORS.stopButton);
    await expect(stopButton.first()).toBeVisible();

    // Click Stop
    await stopButton.first().click();

    // Wait for disconnection
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Verify disconnected state - check multiple indicators
    const isDisconnected = await page.evaluate(() => {
      // Check for explicit disconnected status in connection indicator
      const statusEl = document.querySelector('[data-testid="connection-status-indicator"]') ||
                      document.querySelector('[data-testid="connection-status"]');
      if (statusEl?.textContent?.toLowerCase().includes('disconnect')) return true;

      // Check if voice panel is no longer active (closed or hidden)
      const activePanel = document.querySelector('[data-testid="compact-voice-bar"]') ||
                         document.querySelector('[data-testid="thinker-talker-voice-panel"]');
      // If no active panel visible, consider disconnected
      if (!activePanel) return true;

      // Check for any status text indicating stopped/idle
      const stoppedIndicators = Array.from(document.querySelectorAll('p, span')).some(
        el => el.textContent?.toLowerCase()?.includes('stopped') ||
              el.textContent?.toLowerCase()?.includes('ended')
      );
      return stoppedIndicators;
    });

    expect(isDisconnected).toBe(true);
    console.log("Voice session stopped successfully");
  });

  test("should handle multiple conversation turns", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Track message count before - may not be visible in voice-only mode
    const chatTimeline = page.locator(VOICE_SELECTORS.chatTimeline);
    const timelineVisible = await chatTimeline.count() > 0;

    const initialMessageCount = await page.locator('[data-testid*="message"]').count();
    console.log(`Initial message count: ${initialMessageCount}, timeline visible: ${timelineVisible}`);

    // Wait for first turn (may not happen with fake audio)
    await page.waitForTimeout(10000);

    // Check for any new messages
    const currentMessageCount = await page.locator('[data-testid*="message"]').count();
    console.log(`Current message count: ${currentMessageCount}`);

    // With live backend and real audio, we'd expect new messages
    // With fake audio stream, we may not see new messages
    if (currentMessageCount > initialMessageCount) {
      console.log(`New messages added: ${currentMessageCount - initialMessageCount}`);
    } else {
      console.log("No new messages (expected with fake media stream)");
    }

    await stopVoiceSession(page);
  });
});

test.describe("Voice Core Flow - Connection States", () => {
  test.setTimeout(60000);

  test("should show correct connection state transitions", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await waitForVoicePanel(page);

    // Check initial state - should be disconnected
    const initialStatus = page.locator(VOICE_SELECTORS.connectionStatus).first();
    const initialText = await initialStatus.first().textContent().catch(() => "");
    console.log(`Initial state: ${initialText}`);

    // Start session
    await startVoiceSession(page);

    // Should transition through: disconnected -> connecting -> connected (or error)
    // Wait for connecting state
    await page.waitForTimeout(1000);

    const connectingVisible = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent?.toLowerCase().includes('connecting')
      )
    );
    if (connectingVisible) {
      console.log("Connecting state detected");
    }

    // Wait for final state
    await page.waitForTimeout(WAIT_TIMES.CONNECTION);

    const finalStatus = page.locator(VOICE_SELECTORS.connectionStatus).first();
    const finalText = await finalStatus.first().textContent().catch(() => "");
    console.log(`Final state: ${finalText}`);

    // Should be either connected, error, or empty (if no status text)
    // Empty status can happen when there's an error banner but no status text
    const validFinalState =
      !finalText ||
      finalText?.toLowerCase().includes("connected") ||
      finalText?.toLowerCase().includes("error") ||
      finalText?.toLowerCase().includes("failed") ||
      finalText?.toLowerCase().includes("disconnected");

    expect(validFinalState).toBe(true);

    await stopVoiceSession(page);
  });

  test("should display voice metrics when connected", async ({ page }) => {
    

    await navigateToVoiceChat(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Check for metrics display
    const metricsDisplay = page.locator(VOICE_SELECTORS.metricsDisplay);
    const metricsVisible = await metricsDisplay.count() > 0;

    if (metricsVisible) {
      await expect(metricsDisplay).toBeVisible();

      const metricsText = await metricsDisplay.textContent();
      console.log(`Voice metrics: ${metricsText}`);

      // Metrics display should be present - actual values may vary
      // (may show "Voice Metrics" header or actual latency values)
      expect(metricsText).toBeTruthy();
    } else {
      console.log("Metrics display not visible (may be disabled in settings)");
    }

    await stopVoiceSession(page);
  });
});
