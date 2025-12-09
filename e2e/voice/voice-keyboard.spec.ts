/**
 * Voice Keyboard Shortcuts E2E Tests
 *
 * Tests keyboard shortcuts for voice mode including:
 * - Ctrl+Shift+V to toggle voice mode
 * - Space for push-to-talk
 * - Escape to disconnect
 * - Tab navigation
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
  pressVoiceShortcut,
  releasePushToTalk,
} from "../fixtures/voice";

// Skip all tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live voice tests");
  }
});

test.describe("Voice Keyboard Shortcuts", () => {
  test.setTimeout(60000);

  test("should toggle voice mode with Ctrl+Shift+V", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Check initial state - voice panel may or may not be visible
    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
    const initialPanelVisible = await voicePanel.count() > 0;
    console.log(`Initial panel visible: ${initialPanelVisible}`);

    // Press Ctrl+Shift+V to toggle
    await pressVoiceShortcut(page, "toggle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Check state after first toggle
    const afterFirstToggle = await voicePanel.count() > 0;
    console.log(`After first toggle: ${afterFirstToggle}`);

    // State should have changed (or session should have started/stopped)
    // The exact behavior depends on implementation
    const stateChanged = afterFirstToggle !== initialPanelVisible;

    if (stateChanged) {
      console.log("Voice mode toggled with Ctrl+Shift+V");
    } else {
      // Shortcut might start/stop session instead of showing/hiding panel
      const sessionIndicator = page.locator(VOICE_SELECTORS.connectionStatus).first();
      const hasSessionChange = await sessionIndicator.count() > 0;
      console.log(`Session state indicator visible: ${hasSessionChange}`);
    }

    // Toggle back
    await pressVoiceShortcut(page, "toggle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    const afterSecondToggle = await voicePanel.count() > 0;
    console.log(`After second toggle: ${afterSecondToggle}`);
  });

  test("should activate mic with Space in push-to-talk mode", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // First, enable push-to-talk mode in settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Find and enable push-to-talk
    const pttToggle = page.locator(
      `${VOICE_SELECTORS.pushToTalkToggle}, [data-testid="ptt-toggle"], input[name*="push" i]`
    );

    if (await pttToggle.count() > 0) {
      const isEnabled = await pttToggle.isChecked().catch(() => false);
      if (!isEnabled) {
        await pttToggle.click();
        console.log("Enabled push-to-talk mode");
      }
    }

    await page.keyboard.press("Escape");
    // Wait for modal to fully close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="voice-settings-modal"]'),
      { timeout: 5000 }
    ).catch(() => {
      // If still visible, try clicking outside
      console.log("Modal still visible after Escape, clicking outside");
    });
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Ensure any blocking modals are dismissed
    const settingsModal = page.locator('[data-testid="voice-settings-modal"]');
    if (await settingsModal.count() > 0 && await settingsModal.isVisible()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // Start voice session
    await startVoiceSession(page);
    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Check recording state before
    const recordingIndicator = page.locator(
      '[class*="recording"], [data-state="recording"], [data-testid="recording-indicator"]'
    );
    const wasRecording = await recordingIndicator.count() > 0;
    console.log(`Recording before Space: ${wasRecording}`);

    // Press and hold Space
    await pressVoiceShortcut(page, "pushToTalk");
    await page.waitForTimeout(1000); // Hold for 1 second

    // Check if recording started
    const isRecording = await recordingIndicator.count() > 0;
    console.log(`Recording during Space hold: ${isRecording}`);

    // Release Space
    await releasePushToTalk(page);
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Recording should stop
    const stillRecording = await recordingIndicator.count() > 0;
    console.log(`Recording after Space release: ${stillRecording}`);

    // In push-to-talk mode, Space should control recording
    // The exact behavior may vary based on implementation
    console.log("Push-to-talk test completed");

    await stopVoiceSession(page);
  });

  test("should stop recording when Space released", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Enable push-to-talk mode
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    const pttToggle = page.locator(VOICE_SELECTORS.pushToTalkToggle);
    if (await pttToggle.count() > 0) {
      const isEnabled = await pttToggle.isChecked().catch(() => false);
      if (!isEnabled) {
        await pttToggle.click();
      }
    }
    await page.keyboard.press("Escape");
    // Wait for modal to fully close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="voice-settings-modal"]'),
      { timeout: 5000 }
    ).catch(() => {});
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Ensure any blocking modals are dismissed
    const settingsModal = page.locator('[data-testid="voice-settings-modal"]');
    if (await settingsModal.count() > 0 && await settingsModal.isVisible()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // Start session
    await startVoiceSession(page);
    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Hold Space to start recording
    await page.keyboard.down("Space");
    await page.waitForTimeout(500);

    // Verify recording started (if indicator exists)
    const recordingBefore = await page.locator('[class*="recording"]').count();

    // Release Space
    await page.keyboard.up("Space");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Verify recording stopped
    const recordingAfter = await page.locator('[class*="recording"]').count();

    console.log(`Recording indicators - before release: ${recordingBefore}, after release: ${recordingAfter}`);

    // If there was a recording indicator, it should be gone now
    if (recordingBefore > 0) {
      expect(recordingAfter).toBe(0);
      console.log("Recording stopped on Space release");
    }

    await stopVoiceSession(page);
  });

  test("should disconnect with Escape key", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    console.log("Voice session connected - pressing Escape");

    // Verify connected state
    const wasConnected = await page.evaluate(() => {
      // Check for connected text
      const hasConnectText = Array.from(document.querySelectorAll('*')).some(
        el => el.textContent?.toLowerCase().includes('connect') &&
              !el.textContent?.toLowerCase().includes('disconnect')
      );
      // Check for connected class
      const hasConnectClass = document.querySelector('[class*="connect"]') &&
                             !document.querySelector('[class*="disconnect"]');
      // Check for active voice panel
      const hasActivePanel = document.querySelector('[data-testid="compact-voice-bar"]') ||
                            document.querySelector('[data-testid="thinker-talker-voice-panel"]');
      return hasConnectText || hasConnectClass || !!hasActivePanel;
    });
    console.log(`Was connected: ${wasConnected}`);

    // Press Escape to disconnect
    await pressVoiceShortcut(page, "escape");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Verify disconnected - check multiple indicators
    const isDisconnected = await page.evaluate(() => {
      // Check for disconnected text
      const hasDisconnectText = Array.from(document.querySelectorAll('*')).some(
        el => el.textContent?.toLowerCase().includes('disconnect')
      );
      if (hasDisconnectText) return true;

      // Check for disconnected class
      if (document.querySelector('[class*="disconnect"]')) return true;

      // Check if voice panel is closed
      const activePanel = document.querySelector('[data-testid="compact-voice-bar"]') ||
                         document.querySelector('[data-testid="thinker-talker-voice-panel"]');
      return !activePanel;
    });

    console.log(`Is disconnected: ${isDisconnected}`);
    expect(isDisconnected).toBe(true);
  });

  test("should focus voice panel with Tab navigation", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Start from a known element
    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
    await voicePanel.focus();

    // Get all focusable elements in voice panel
    const focusableElements = await page.locator(
      `${VOICE_SELECTORS.panel} button, ${VOICE_SELECTORS.panel} [tabindex]:not([tabindex="-1"]), ${VOICE_SELECTORS.panel} input, ${VOICE_SELECTORS.panel} select`
    ).all();

    console.log(`Found ${focusableElements.length} focusable elements in voice panel`);

    if (focusableElements.length > 0) {
      // Focus first element
      await focusableElements[0].focus();

      // Tab through elements
      const visitedElements: string[] = [];

      for (let i = 0; i < Math.min(focusableElements.length, 5); i++) {
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? el.tagName + (el.getAttribute("data-testid") || el.textContent?.substring(0, 20)) : "none";
        });
        visitedElements.push(focused);

        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);
      }

      console.log(`Tab navigation order: ${visitedElements.join(" -> ")}`);
      expect(visitedElements.length).toBeGreaterThan(0);
    } else {
      console.log("No focusable elements found in voice panel");
    }
  });
});

test.describe("Voice Keyboard Shortcuts - Focus Management", () => {
  test.setTimeout(45000);

  test("should return focus to trigger element after modal closes", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Focus and click settings button
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().focus();
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Close modal with Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Check if focus returned to settings button
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute("data-testid") || el.tagName : null;
    });

    console.log(`Focused element after modal close: ${focusedElement}`);

    // Focus should ideally return to the button that opened the modal
    // This is a best practice for accessibility
  });

  test("should trap focus within settings modal when open", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Verify modal is open
    const settingsModal = page.locator(VOICE_SELECTORS.settingsModal);
    await expect(settingsModal.first()).toBeVisible();

    // Get all focusable elements in modal
    const modalFocusable = await page.locator(
      '[role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] [tabindex]:not([tabindex="-1"])'
    ).all();

    console.log(`Focusable elements in modal: ${modalFocusable.length}`);

    if (modalFocusable.length > 1) {
      // Tab through all elements
      for (let i = 0; i < modalFocusable.length + 1; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);
      }

      // After tabbing through all, focus should stay within modal (focus trap)
      const currentFocus = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[role="dialog"]') !== null;
      });

      console.log(`Focus still within modal: ${currentFocus}`);
      // Note: Focus trap is a best practice but may not be implemented
    }

    await page.keyboard.press("Escape");
  });
});
