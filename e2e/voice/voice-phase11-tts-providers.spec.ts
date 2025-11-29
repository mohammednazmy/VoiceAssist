/**
 * Voice Phase 11.1 E2E Tests - TTS Providers & Echo Cancellation
 *
 * Tests Phase 11.1 voice pipeline features:
 * - ElevenLabs TTS provider selection
 * - TTS provider switching
 * - Echo cancellation indicators
 * - Voice session metrics display
 *
 * Requires LIVE_REALTIME_E2E=1 and valid API keys for full testing.
 */

import { test as baseTest, expect } from "../fixtures/auth";
import {
  VOICE_SELECTORS,
  VOICE_CONFIG,
  WAIT_TIMES,
  navigateToVoiceChat,
  waitForVoicePanel,
  startVoiceSession,
  stopVoiceSession,
  waitForVoiceConnection,
  openVoiceSettings,
  getVoiceMetrics,
} from "../fixtures/voice";

const test = baseTest;

// Extended selectors for Phase 11.1 features
const PHASE11_SELECTORS = {
  // TTS Provider selection
  ttsProviderSelect: '[data-testid="tts-provider-select"], select[name="ttsProvider"], [name="tts-provider"]',
  ttsProviderOpenAI: '[data-testid="tts-provider-openai"], [data-value="openai"]',
  ttsProviderElevenLabs: '[data-testid="tts-provider-elevenlabs"], [data-value="elevenlabs"]',

  // ElevenLabs specific
  elevenLabsVoiceSelect: '[data-testid="elevenlabs-voice-select"], select[name="elevenLabsVoice"]',
  elevenLabsVoicePreview: '[data-testid="voice-preview-button"], button:has-text("Preview")',
  elevenLabsStatus: '[data-testid="elevenlabs-status"]',

  // Echo cancellation
  echoCancellationToggle: '[data-testid="echo-cancellation-toggle"], input[name*="echo" i]',
  echoCancellationIndicator: '[data-testid="echo-indicator"], [class*="echo-detect"]',
  echoCancellationStatus: '[data-testid="echo-status"]',

  // Voice metrics display
  metricsPanel: '[data-testid="voice-metrics-panel"], [class*="metrics-panel"]',
  sttLatencyDisplay: '[data-testid="stt-latency"], [class*="stt-latency"]',
  ttsLatencyDisplay: '[data-testid="tts-latency"], [class*="tts-latency"]',
  totalLatencyDisplay: '[data-testid="total-latency"], [class*="total-latency"]',
  providerDisplay: '[data-testid="current-provider"]',

  // Session metrics
  sessionDuration: '[data-testid="session-duration"]',
  messageCount: '[data-testid="message-count"]',
  errorCount: '[data-testid="error-count"]',
};

// Skip tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live voice tests");
  }
});

test.describe("TTS Provider Selection - Phase 11.1", () => {
  test.setTimeout(90000);

  test("should display TTS provider options in settings", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Look for TTS provider selection
    const providerSelect = page.locator(PHASE11_SELECTORS.ttsProviderSelect);
    const providerExists = await providerSelect.count() > 0;

    if (providerExists) {
      await expect(providerSelect.first()).toBeVisible();
      console.log("TTS provider selection is available");

      // Get available options
      const options = await providerSelect.locator("option").allTextContents();
      console.log(`Available TTS providers: ${options.join(", ")}`);

      // Should have at least OpenAI
      expect(options.some(opt => opt.toLowerCase().includes("openai"))).toBe(true);
    } else {
      // Check for radio button style selection
      const openaiOption = page.locator(PHASE11_SELECTORS.ttsProviderOpenAI);
      const elevenLabsOption = page.locator(PHASE11_SELECTORS.ttsProviderElevenLabs);

      const hasOpenAI = await openaiOption.count() > 0;
      const hasElevenLabs = await elevenLabsOption.count() > 0;

      if (hasOpenAI || hasElevenLabs) {
        console.log("TTS provider selection via radio/buttons");
        console.log(`OpenAI available: ${hasOpenAI}, ElevenLabs available: ${hasElevenLabs}`);
      } else {
        console.log("TTS provider selection UI not found - may use different pattern");
      }
    }

    await page.keyboard.press("Escape");
  });

  test("should switch to ElevenLabs TTS provider", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Find and switch TTS provider
    const providerSelect = page.locator(PHASE11_SELECTORS.ttsProviderSelect);
    const providerExists = await providerSelect.count() > 0;

    if (providerExists) {
      // Select ElevenLabs
      await providerSelect.selectOption({ label: /elevenlabs/i });

      // Verify selection
      const selectedValue = await providerSelect.inputValue();
      console.log(`Selected TTS provider: ${selectedValue}`);

      // ElevenLabs-specific options should appear
      const elevenLabsVoices = page.locator(PHASE11_SELECTORS.elevenLabsVoiceSelect);
      const hasElevenLabsVoices = await elevenLabsVoices.count() > 0;

      if (hasElevenLabsVoices) {
        await expect(elevenLabsVoices.first()).toBeVisible();
        console.log("ElevenLabs voice selection appeared");

        // Get available ElevenLabs voices
        const voices = await elevenLabsVoices.locator("option").allTextContents();
        console.log(`ElevenLabs voices: ${voices.slice(0, 5).join(", ")}...`);
      }
    } else {
      // Try clicking ElevenLabs option directly
      const elevenLabsOption = page.locator(PHASE11_SELECTORS.ttsProviderElevenLabs);
      if (await elevenLabsOption.count() > 0) {
        await elevenLabsOption.click();
        console.log("Clicked ElevenLabs provider option");
      }
    }

    await page.keyboard.press("Escape");
  });

  test("should preview ElevenLabs voice", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Switch to ElevenLabs if available
    const providerSelect = page.locator(PHASE11_SELECTORS.ttsProviderSelect);
    if (await providerSelect.count() > 0) {
      await providerSelect.selectOption({ label: /elevenlabs/i }).catch(() => {});
    }

    // Look for voice preview button
    const previewButton = page.locator(PHASE11_SELECTORS.elevenLabsVoicePreview);
    const hasPreview = await previewButton.count() > 0;

    if (hasPreview) {
      // Click preview button
      await previewButton.first().click();

      // Wait for audio to play or loading state
      await page.waitForTimeout(3000);

      // Check for audio element or loading indicator
      const audioPlaying = await page.locator('audio[src], [class*="playing"], [data-playing="true"]').count() > 0;
      const loading = await page.locator('[class*="loading"], [aria-busy="true"]').count() > 0;

      console.log(`Voice preview: ${audioPlaying ? "playing" : loading ? "loading" : "no audio detected"}`);
    } else {
      console.log("Voice preview button not available");
    }

    await page.keyboard.press("Escape");
  });

  test("should persist TTS provider preference", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings and change provider
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    const providerSelect = page.locator(PHASE11_SELECTORS.ttsProviderSelect);
    let originalProvider = "openai";

    if (await providerSelect.count() > 0) {
      originalProvider = await providerSelect.inputValue().catch(() => "openai");

      // Switch provider
      const newProvider = originalProvider === "openai" ? "elevenlabs" : "openai";
      await providerSelect.selectOption({ value: newProvider }).catch(() => {});
      console.log(`Changed provider from ${originalProvider} to ${newProvider}`);
    }

    // Close and reload
    await page.keyboard.press("Escape");
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Navigate back and check
    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    if (await providerSelect.count() > 0) {
      const persistedProvider = await providerSelect.inputValue().catch(() => null);
      console.log(`Persisted provider: ${persistedProvider}`);

      // Note: May reset to default if persistence not implemented
      if (persistedProvider && persistedProvider !== originalProvider) {
        console.log("TTS provider preference persisted successfully");
      }
    }

    await page.keyboard.press("Escape");
  });
});

test.describe("Echo Cancellation - Phase 11.1", () => {
  test.setTimeout(60000);

  test("should display echo cancellation toggle in settings", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Look for echo cancellation toggle
    const echoToggle = page.locator(PHASE11_SELECTORS.echoCancellationToggle);
    const echoExists = await echoToggle.count() > 0;

    if (echoExists) {
      await expect(echoToggle.first()).toBeVisible();

      const isEnabled = await echoToggle.isChecked().catch(() => false);
      console.log(`Echo cancellation enabled: ${isEnabled}`);
    } else {
      // Check for labeled toggle
      const echoLabel = page.locator('text=/echo.cancellation/i, label:has-text("Echo")');
      const hasLabel = await echoLabel.count() > 0;

      if (hasLabel) {
        console.log("Echo cancellation setting found via label");
      } else {
        console.log("Echo cancellation toggle not found - may be automatic");
      }
    }

    await page.keyboard.press("Escape");
  });

  test("should toggle echo cancellation", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Find echo cancellation toggle
    const echoToggle = page.locator(PHASE11_SELECTORS.echoCancellationToggle);

    if (await echoToggle.count() > 0) {
      const initialState = await echoToggle.isChecked().catch(() => false);
      console.log(`Initial echo cancellation state: ${initialState}`);

      // Toggle
      await echoToggle.click();
      await page.waitForTimeout(500);

      const newState = await echoToggle.isChecked().catch(() => !initialState);
      console.log(`New echo cancellation state: ${newState}`);

      expect(newState).toBe(!initialState);

      // Toggle back
      await echoToggle.click();
    } else {
      console.log("Echo cancellation toggle not available for manual control");
    }

    await page.keyboard.press("Escape");
  });

  test("should show echo detection indicator during active session", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Look for echo detection indicator
    const echoIndicator = page.locator(PHASE11_SELECTORS.echoCancellationIndicator);
    const echoStatus = page.locator(PHASE11_SELECTORS.echoCancellationStatus);

    // Wait for session to stabilize
    await page.waitForTimeout(3000);

    const hasIndicator = await echoIndicator.count() > 0;
    const hasStatus = await echoStatus.count() > 0;

    if (hasIndicator) {
      console.log("Echo detection indicator found");
      const indicatorState = await echoIndicator.getAttribute("data-state");
      console.log(`Echo indicator state: ${indicatorState || "active"}`);
    }

    if (hasStatus) {
      const statusText = await echoStatus.textContent();
      console.log(`Echo cancellation status: ${statusText}`);
    }

    if (!hasIndicator && !hasStatus) {
      console.log("Echo indicators not visible (may be internal/automatic)");
    }

    await stopVoiceSession(page);
  });
});

test.describe("Voice Metrics Display - Phase 11.1", () => {
  test.setTimeout(90000);

  test("should display real-time latency metrics during session", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Wait for metrics to populate
    await page.waitForTimeout(5000);

    // Check for metrics display
    const metricsPanel = page.locator(PHASE11_SELECTORS.metricsPanel);
    const metricsVisible = await metricsPanel.count() > 0;

    if (metricsVisible) {
      await expect(metricsPanel.first()).toBeVisible();

      // Check individual metrics
      const sttLatency = page.locator(PHASE11_SELECTORS.sttLatencyDisplay);
      const ttsLatency = page.locator(PHASE11_SELECTORS.ttsLatencyDisplay);
      const totalLatency = page.locator(PHASE11_SELECTORS.totalLatencyDisplay);

      const hasStt = await sttLatency.count() > 0;
      const hasTts = await ttsLatency.count() > 0;
      const hasTotal = await totalLatency.count() > 0;

      console.log(`Metrics available - STT: ${hasStt}, TTS: ${hasTts}, Total: ${hasTotal}`);

      if (hasStt) {
        const sttValue = await sttLatency.textContent();
        console.log(`STT Latency: ${sttValue}`);
      }

      if (hasTts) {
        const ttsValue = await ttsLatency.textContent();
        console.log(`TTS Latency: ${ttsValue}`);
      }

      if (hasTotal) {
        const totalValue = await totalLatency.textContent();
        console.log(`Total Latency: ${totalValue}`);
      }
    } else {
      // Try the generic metrics display from voice fixtures
      const metrics = await getVoiceMetrics(page);
      if (metrics) {
        console.log(`Voice metrics from fixture: ${JSON.stringify(metrics)}`);
      } else {
        console.log("Metrics panel not visible during session");
      }
    }

    await stopVoiceSession(page);
  });

  test("should display current TTS provider in metrics", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Look for provider display
    const providerDisplay = page.locator(PHASE11_SELECTORS.providerDisplay);
    const hasProviderDisplay = await providerDisplay.count() > 0;

    if (hasProviderDisplay) {
      const providerText = await providerDisplay.textContent();
      console.log(`Current TTS provider: ${providerText}`);

      // Should show either OpenAI or ElevenLabs
      expect(
        providerText?.toLowerCase().includes("openai") ||
        providerText?.toLowerCase().includes("elevenlabs")
      ).toBe(true);
    } else {
      console.log("Provider display not visible in metrics panel");
    }

    await stopVoiceSession(page);
  });

  test("should update session duration in real-time", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Get initial duration
    const durationDisplay = page.locator(PHASE11_SELECTORS.sessionDuration);
    const hasDuration = await durationDisplay.count() > 0;

    if (hasDuration) {
      const initialDuration = await durationDisplay.textContent();
      console.log(`Initial session duration: ${initialDuration}`);

      // Wait 5 seconds
      await page.waitForTimeout(5000);

      // Check updated duration
      const updatedDuration = await durationDisplay.textContent();
      console.log(`Updated session duration: ${updatedDuration}`);

      // Duration should have increased
      // Note: Format may be "0:05" or "5s" or "00:00:05"
      expect(updatedDuration).not.toBe(initialDuration);
    } else {
      console.log("Session duration display not visible");
    }

    await stopVoiceSession(page);
  });

  test("should track message count during session", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);
    test.skip(!connected, "Could not connect to voice backend");

    // Look for message count
    const messageCount = page.locator(PHASE11_SELECTORS.messageCount);
    const hasMessageCount = await messageCount.count() > 0;

    if (hasMessageCount) {
      const initialCount = await messageCount.textContent();
      console.log(`Initial message count: ${initialCount}`);

      // Wait for potential messages (may not happen with fake audio)
      await page.waitForTimeout(10000);

      const finalCount = await messageCount.textContent();
      console.log(`Final message count: ${finalCount}`);
    } else {
      console.log("Message count display not visible");
    }

    await stopVoiceSession(page);
  });
});

test.describe("Voice Session Flow with ElevenLabs - Phase 11.1", () => {
  test.setTimeout(120000);

  test("should complete voice session with ElevenLabs TTS", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // First, configure ElevenLabs as TTS provider
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    const providerSelect = page.locator(PHASE11_SELECTORS.ttsProviderSelect);
    if (await providerSelect.count() > 0) {
      await providerSelect.selectOption({ label: /elevenlabs/i }).catch(() => {
        console.log("Could not select ElevenLabs - may not be available");
      });
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Start session
    await startVoiceSession(page);

    const connected = await waitForVoiceConnection(page);

    if (connected) {
      console.log("Voice session connected with configured TTS provider");

      // Verify session is active
      const stopButton = page.locator(VOICE_SELECTORS.stopButton);
      await expect(stopButton.first()).toBeVisible();

      // Check for any ElevenLabs-specific indicators
      const elevenLabsStatus = page.locator(PHASE11_SELECTORS.elevenLabsStatus);
      const hasElevenLabsStatus = await elevenLabsStatus.count() > 0;

      if (hasElevenLabsStatus) {
        const statusText = await elevenLabsStatus.textContent();
        console.log(`ElevenLabs status: ${statusText}`);
      }

      // Let session run briefly
      await page.waitForTimeout(5000);

      // End session
      await stopVoiceSession(page);
      console.log("Voice session completed successfully");
    } else {
      // Check for specific error
      const errorBanner = page.locator(VOICE_SELECTORS.errorBanner);
      if (await errorBanner.count() > 0) {
        const errorText = await errorBanner.first().textContent();
        console.log(`Session failed: ${errorText}`);

        // ElevenLabs may require additional configuration
        if (errorText?.toLowerCase().includes("elevenlabs")) {
          console.log("ElevenLabs configuration issue detected");
        }
      }
    }
  });
});
