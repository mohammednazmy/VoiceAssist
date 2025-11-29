/**
 * E2E Voice Test Fixtures
 *
 * Provides voice-specific helpers and fixtures for Playwright tests.
 * Designed for live backend testing with real OpenAI Realtime API.
 */

import { test as base, Page, expect, BrowserContext } from "@playwright/test";
import { setupAuthenticatedState, mockAuthState } from "./auth";

// Voice session timeout (longer for live API calls)
export const VOICE_SESSION_TIMEOUT = 60000;

// Default wait times
export const WAIT_TIMES = {
  CONNECTION: 10000,
  TRANSCRIPT: 15000,
  AI_RESPONSE: 30000,
  UI_UPDATE: 2000,
};

/**
 * Voice test configuration from environment
 */
export const VOICE_CONFIG = {
  // Enable live backend tests (requires valid OpenAI API key)
  LIVE_REALTIME: process.env.LIVE_REALTIME_E2E === "1",
  // Base URL for API
  API_BASE_URL: process.env.API_BASE_URL || "http://localhost:8000",
};

/**
 * Voice panel selectors
 */
export const VOICE_SELECTORS = {
  // Panel and buttons
  panel: '[data-testid="voice-mode-panel"]',
  toggleButton: '[data-testid="realtime-voice-mode-button"]',
  startButton: 'button:has-text("Start Voice Session"), button:has-text("Start Session"), [data-testid="start-voice-session"]',
  stopButton: 'button:has-text("End Session"), button:has-text("Stop"), button:has-text("Disconnect"), [data-testid="end-voice-session"], [data-testid="stop-voice-session"]',
  settingsButton: '[data-testid="voice-settings-button"], button[aria-label*="settings" i]',

  // Status indicators
  connectionStatus: '[data-testid="connection-status"], text=/connecting|connected|disconnected|error/i',
  metricsDisplay: '[data-testid="voice-metrics-display"]',

  // Transcript elements
  transcriptPreview: '[data-testid="voice-transcript-preview"]',
  partialTranscript: '[data-testid="partial-transcript"], .partial-transcript',

  // Visualizers
  waveform: '[data-testid="waveform"], [class*="waveform"]',
  frequencySpectrum: '[data-testid="frequency-spectrum"]',

  // Settings modal
  settingsModal: '[data-testid="voice-settings-modal"], [role="dialog"]',
  voiceSelect: '[data-testid="voice-select"], select[name="voice"]',
  languageSelect: '[data-testid="language-select"], select[name="language"]',
  playbackSpeedSlider: '[data-testid="playback-speed"], input[name="playbackSpeed"]',
  vadSensitivitySlider: '[data-testid="vad-sensitivity"], input[name="vadSensitivity"]',
  pushToTalkToggle: '[data-testid="push-to-talk-toggle"]',

  // Chat integration
  chatTimeline: '[data-testid="chat-timeline"], [data-testid="message-list"]',
  userMessage: '[data-testid="user-message"]',
  assistantMessage: '[data-testid="assistant-message"]',

  // Error states
  errorBanner: '[data-testid="connection-error"], [data-testid="mic-permission-error"], [data-testid="failed-alert"], [data-testid="reconnecting-alert"]',
  permissionError: '[data-testid="mic-permission-error"]',
  connectionError: '[data-testid="connection-error"]',
  retryButton: 'button:has-text("Retry"), button:has-text("Try Again")',
};

/**
 * Helper to dismiss any blocking popups (analytics consent, onboarding, etc.)
 */
export async function dismissBlockingPopups(page: Page): Promise<void> {
  // Dismiss analytics consent popup
  const noThanksButton = page.locator('button:has-text("No thanks")');
  if (await noThanksButton.count() > 0) {
    await noThanksButton.click();
    await page.waitForTimeout(500);
  }

  // Dismiss any other common popups
  const dismissButtons = page.locator(
    'button:has-text("Dismiss"), button:has-text("Skip"), button:has-text("Close"), [aria-label="Close"]'
  );
  if (await dismissButtons.count() > 0) {
    await dismissButtons.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

/**
 * Helper to wait for voice panel to be ready
 */
export async function waitForVoicePanel(page: Page): Promise<void> {
  // Dismiss any blocking popups first
  await dismissBlockingPopups(page);

  const voicePanel = page.locator(VOICE_SELECTORS.panel);
  const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);

  // Check if panel is already visible
  let panelVisible = await voicePanel.count() > 0;

  if (!panelVisible) {
    // Click voice button to open panel
    await voiceButton.waitFor({ timeout: 5000 });
    await voiceButton.click();
    await voicePanel.waitFor({ timeout: 5000 });
  }

  await expect(voicePanel).toBeVisible();
}

/**
 * Helper to start a voice session
 */
export async function startVoiceSession(page: Page): Promise<void> {
  await waitForVoicePanel(page);

  const startButton = page.locator(VOICE_SELECTORS.startButton);
  await expect(startButton.first()).toBeVisible();
  await expect(startButton.first()).toBeEnabled();
  await startButton.first().click();
}

/**
 * Helper to stop a voice session
 */
export async function stopVoiceSession(page: Page): Promise<void> {
  const stopButton = page.locator(VOICE_SELECTORS.stopButton);

  if (await stopButton.count() > 0) {
    await stopButton.first().click();
    // Wait for disconnection
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
  }
}

/**
 * Helper to wait for voice session to connect
 */
export async function waitForVoiceConnection(
  page: Page,
  timeout: number = WAIT_TIMES.CONNECTION
): Promise<boolean> {
  try {
    // Wait for "Connected" status text in the connection-status element
    await page.waitForSelector(
      '[data-testid="connection-status"]:has-text("Connected")',
      { timeout }
    );
    return true;
  } catch {
    // Check if there's an error state instead
    const errorBanner = page.locator(VOICE_SELECTORS.errorBanner);
    const hasError = await errorBanner.count() > 0;
    if (hasError) {
      const errorText = await errorBanner.first().textContent().catch(() => "");
      console.log(`Voice connection failed - error: ${errorText}`);
    }

    // Also check the connection status text for debugging
    const statusText = await page.locator('[data-testid="connection-status"]').textContent().catch(() => "unknown");
    console.log(`Voice connection status: ${statusText}`);

    return false;
  }
}

/**
 * Helper to wait for transcript to appear
 */
export async function waitForTranscript(
  page: Page,
  timeout: number = WAIT_TIMES.TRANSCRIPT
): Promise<string | null> {
  try {
    // Wait for either partial or final transcript
    const transcript = await page.waitForSelector(
      `${VOICE_SELECTORS.transcriptPreview}, ${VOICE_SELECTORS.userMessage}`,
      { timeout }
    );
    return await transcript.textContent();
  } catch {
    return null;
  }
}

/**
 * Helper to wait for AI response
 */
export async function waitForAIResponse(
  page: Page,
  timeout: number = WAIT_TIMES.AI_RESPONSE
): Promise<string | null> {
  try {
    // Wait for assistant message to appear
    const response = await page.waitForSelector(
      VOICE_SELECTORS.assistantMessage,
      { timeout }
    );
    return await response.textContent();
  } catch {
    return null;
  }
}

/**
 * Helper to open voice settings modal
 */
export async function openVoiceSettings(page: Page): Promise<void> {
  await waitForVoicePanel(page);

  const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
  await settingsButton.first().click();

  // Wait for modal to appear
  await page.waitForSelector(VOICE_SELECTORS.settingsModal, { timeout: 5000 });
}

/**
 * Helper to change voice setting
 */
export async function changeVoiceSetting(
  page: Page,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
): Promise<void> {
  await openVoiceSettings(page);

  const voiceSelect = page.locator(VOICE_SELECTORS.voiceSelect);
  await voiceSelect.selectOption(voice);

  // Close modal by clicking outside or close button
  await page.keyboard.press("Escape");
}

/**
 * Helper to check if microphone permission is granted
 */
export async function checkMicPermission(page: Page): Promise<boolean> {
  try {
    const permission = await page.evaluate(async () => {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return result.state;
    });
    return permission === "granted";
  } catch {
    return false;
  }
}

/**
 * Helper to simulate keyboard shortcut
 */
export async function pressVoiceShortcut(
  page: Page,
  shortcut: "toggle" | "pushToTalk" | "escape"
): Promise<void> {
  switch (shortcut) {
    case "toggle":
      await page.keyboard.press("Control+Shift+V");
      break;
    case "pushToTalk":
      await page.keyboard.down("Space");
      break;
    case "escape":
      await page.keyboard.press("Escape");
      break;
  }
}

/**
 * Helper to release push-to-talk key
 */
export async function releasePushToTalk(page: Page): Promise<void> {
  await page.keyboard.up("Space");
}

/**
 * Helper to get voice metrics from the display
 */
export async function getVoiceMetrics(page: Page): Promise<{
  connectionTime?: number;
  sttLatency?: number;
  responseLatency?: number;
} | null> {
  try {
    const metricsDisplay = page.locator(VOICE_SELECTORS.metricsDisplay);

    if (await metricsDisplay.count() === 0) {
      return null;
    }

    // Extract metrics from the display
    const metricsText = await metricsDisplay.textContent();

    // Parse metrics (format may vary)
    const connectionMatch = metricsText?.match(/connection[:\s]+(\d+)\s*ms/i);
    const sttMatch = metricsText?.match(/stt[:\s]+(\d+)\s*ms/i);
    const responseMatch = metricsText?.match(/response[:\s]+(\d+)\s*ms/i);

    return {
      connectionTime: connectionMatch ? parseInt(connectionMatch[1]) : undefined,
      sttLatency: sttMatch ? parseInt(sttMatch[1]) : undefined,
      responseLatency: responseMatch ? parseInt(responseMatch[1]) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Helper to navigate to chat with voice mode
 */
export async function navigateToVoiceChat(page: Page): Promise<void> {
  await page.goto("/chat?mode=voice");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
}

/**
 * Extended test fixture with voice-enabled page
 * Uses fake media stream for testing without real microphone
 */
export const test = base.extend<{
  voicePage: Page;
  voiceContext: BrowserContext;
}>({
  voiceContext: async ({ browser }, use) => {
    // Create context with microphone permissions
    const context = await browser.newContext({
      permissions: ["microphone"],
    });
    await use(context);
    await context.close();
  },

  voicePage: async ({ voiceContext }, use) => {
    const page = await voiceContext.newPage();

    // Set up authenticated state BEFORE any navigation
    await page.addInitScript((authState) => {
      window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
    }, mockAuthState);

    // Track created conversation ID for consistent responses
    let createdConversationId = `e2e-conv-${Date.now()}`;

    // Comprehensive API mocking to prevent 401 errors
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      // Only intercept API calls (not Vite module requests)
      if (!url.includes("/api/") || url.includes("localhost:5173")) {
        await route.continue();
        return;
      }

      // Skip WebSocket upgrade requests
      if (route.request().headers()["upgrade"] === "websocket") {
        await route.continue();
        return;
      }

      // Parse the URL to get the pathname
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;

      // Route: GET /api/auth/me (user profile)
      if (pathname === "/api/auth/me" && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: "e2e-test-user",
              email: "test@example.com",
              name: "E2E Test User",
              role: "user",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
        return;
      }

      // Route: POST /api/auth/refresh
      if (pathname === "/api/auth/refresh" && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              accessToken: "e2e-mock-refreshed-token",
              refreshToken: "e2e-mock-refresh-token",
              expiresIn: 3600,
            },
          }),
        });
        return;
      }

      // Route: POST /api/conversations (create new conversation)
      if (pathname === "/api/conversations" && method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: createdConversationId,
              title: "Voice Test Conversation",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_id: "e2e-test-user",
            },
          }),
        });
        return;
      }

      // Route: GET /api/conversations (list conversations)
      if (pathname === "/api/conversations" && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            total: 0,
            page: 1,
            limit: 50,
          }),
        });
        return;
      }

      // Route: GET /api/conversations/:id (get single conversation)
      const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
      if (conversationMatch && method === "GET") {
        const convId = conversationMatch[1];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: convId,
              title: "Test Conversation",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_id: "e2e-test-user",
            },
          }),
        });
        return;
      }

      // Route: GET /api/conversations/:id/messages
      const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
      if (messagesMatch && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            total: 0,
            page: 1,
            limit: 50,
          }),
        });
        return;
      }

      // Route: GET /api/conversations/:id/branches
      const branchesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/branches$/);
      if (branchesMatch && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        });
        return;
      }

      // Route: GET /api/clinical-contexts/*
      if (pathname.startsWith("/api/clinical-contexts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: null }),
        });
        return;
      }

      // Route: Voice session endpoint - let it pass through to real backend
      if (pathname.includes("/api/voice/")) {
        await route.continue();
        return;
      }

      // Default: Return success for any other API endpoint
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null, success: true }),
      });
    });

    await use(page);
  },
});

export { expect } from "@playwright/test";
