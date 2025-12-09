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
 * Updated to match actual component data-testid attributes
 */
export const VOICE_SELECTORS = {
  // Panel and buttons - support multiple possible testids for resilience
  panel: '[data-testid="voice-mode-panel"], [data-testid="thinker-talker-voice-panel"], [data-testid="compact-voice-bar"], [data-testid="voice-expanded-drawer"]',
  toggleButton: '[data-testid="voice-mode-toggle"], [data-testid="realtime-voice-mode-button"]',
  // Voice mode auto-starts, so start button may not exist - also try compact mic button
  startButton: 'button:has-text("Start Voice Session"), button:has-text("Start Session"), [data-testid="start-voice-session"], [data-testid="compact-mic-button"]',
  // Close/stop buttons - include compact bar close button
  stopButton: 'button:has-text("End Session"), button:has-text("Stop"), button:has-text("Disconnect"), [data-testid="end-voice-session"], [data-testid="stop-voice-session"], [data-testid="close-voice-mode"], [data-testid="compact-close-btn"]',
  settingsButton: '[data-testid="voice-settings-button"], [data-testid="compact-settings-btn"], button[aria-label*="settings" i]',

  // Status indicators - use actual testids from ConnectionStatusIndicator
  connectionStatus: '[data-testid="connection-status-indicator"], [data-testid="connection-status"]',
  metricsDisplay: '[data-testid="voice-metrics-display"]',

  // Transcript elements
  transcriptPreview: '[data-testid="voice-transcript-preview"]',
  partialTranscript: '[data-testid="partial-transcript"], .partial-transcript',

  // Visualizers
  waveform: '[data-testid="waveform"], [class*="waveform"]',
  frequencySpectrum: '[data-testid="frequency-spectrum"]',

  // Settings modal - use actual testids from VoiceModeSettings.tsx
  settingsModal: '[data-testid="voice-settings-modal"], [role="dialog"]',
  voiceSelect: '[data-testid="voice-select"], select[name="voice"]',
  languageSelect: '[data-testid="language-select"], select[name="language"]',
  playbackSpeedSlider: '[data-testid="playback-speed"], input[name="playbackSpeed"]',
  vadSensitivitySlider: '[data-testid="vad-sensitivity-slider"], [data-testid="vad-sensitivity"], input[name="vadSensitivity"]',
  pushToTalkToggle: '[data-testid="push-to-talk-toggle"]',
  closeSettingsButton: '[data-testid="close-settings"], [data-testid="done-button"]',
  autoStartCheckbox: '[data-testid="auto-start-checkbox"]',
  keyboardShortcutsCheckbox: '[data-testid="keyboard-shortcuts-checkbox"]',

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
 * Helper to dismiss any blocking popups (analytics consent, onboarding, modals, etc.)
 */
export async function dismissBlockingPopups(page: Page): Promise<void> {
  // First check for voice settings modal (has highest z-index and blocks everything)
  const voiceSettingsModal = page.locator('[data-testid="voice-settings-modal"]');
  if (await voiceSettingsModal.count() > 0 && await voiceSettingsModal.isVisible()) {
    // Close with Escape key
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // If still there, click outside
    if (await voiceSettingsModal.isVisible()) {
      await page.locator('body').click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // Dismiss any other modal dialogs
  const modalBackdrops = page.locator('[role="dialog"]');
  if (await modalBackdrops.count() > 0) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

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

  const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
  const voiceButton = page.locator(VOICE_SELECTORS.toggleButton).first();

  // Check if panel is already visible
  let panelVisible = await voicePanel.isVisible().catch(() => false);

  if (!panelVisible) {
    // Wait for voice button to be visible and enabled
    try {
      await voiceButton.waitFor({ timeout: 15000 });
    } catch {
      // If voice button not found, try waiting for page to fully load
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);
      await voiceButton.waitFor({ timeout: 15000 });
    }

    // Click to open the panel
    await voiceButton.click();

    // Wait for any voice panel variant to appear
    await page.waitForFunction(
      () => {
        return (
          document.querySelector('[data-testid="voice-mode-panel"]') ||
          document.querySelector('[data-testid="thinker-talker-voice-panel"]') ||
          document.querySelector('[data-testid="compact-voice-bar"]') ||
          document.querySelector('[data-testid="voice-expanded-drawer"]')
        );
      },
      { timeout: 10000 }
    );
  }

  await expect(voicePanel).toBeVisible();
}

/**
 * Helper to start a voice session
 * Note: The Thinker/Talker voice mode auto-starts when the panel opens,
 * so this function opens the panel and waits for the session to connect.
 */
export async function startVoiceSession(page: Page): Promise<void> {
  await waitForVoicePanel(page);

  // The voice mode auto-starts when the panel is opened.
  // First check if there's a start button (for backwards compatibility)
  const startButton = page.locator(VOICE_SELECTORS.startButton);
  const hasStartButton = await startButton.count() > 0;

  if (hasStartButton && await startButton.first().isVisible()) {
    await startButton.first().click();
  }

  // Wait for the voice session to connect (auto-start or manual start)
  // Look for indicators that the session is active
  await page.waitForFunction(
    () => {
      // Check for various connection indicators
      const statusEl = document.querySelector('[data-testid="connection-status"]');
      const connectingOrConnected =
        statusEl?.textContent?.toLowerCase()?.includes('connect') ||
        statusEl?.textContent?.toLowerCase()?.includes('listen');

      // Also check for compact bar status
      const compactBar = document.querySelector('[data-testid="compact-voice-bar"]');
      const hasListeningIndicator = !!document.querySelector('[data-testid="voice-listening-indicator"]');

      // Check for any status text indicating active session
      const statusTexts = Array.from(document.querySelectorAll('p, span')).some(
        el => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('listen') || text.includes('ready') ||
                 text.includes('connect') || text.includes('processing');
        }
      );

      return connectingOrConnected || compactBar || hasListeningIndicator || statusTexts;
    },
    { timeout: 15000 }
  ).catch(() => {
    console.log('[Voice] Session did not reach connected state within timeout');
  });

  // Brief pause for UI to stabilize
  await page.waitForTimeout(1000);
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
 * Checks multiple indicators since the voice UI varies
 */
export async function waitForVoiceConnection(
  page: Page,
  timeout: number = WAIT_TIMES.CONNECTION
): Promise<boolean> {
  try {
    // Wait for any indicator that voice mode is active and connected
    await page.waitForFunction(
      () => {
        // Check for connection status element
        const statusEl = document.querySelector('[data-testid="connection-status"]');
        if (statusEl?.textContent?.toLowerCase().includes('connect')) {
          return true;
        }

        // Check for listening/ready state in any text
        const stateIndicators = Array.from(document.querySelectorAll('p, span, div')).some(
          el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('listening') || text.includes('ready') ||
                   text.includes('connected') || text.includes('processing');
          }
        );
        if (stateIndicators) return true;

        // Check for compact voice bar (indicates voice mode is active)
        if (document.querySelector('[data-testid="compact-voice-bar"]')) {
          return true;
        }

        // Check for voice mode panel with active state
        const voicePanel = document.querySelector('[data-testid="thinker-talker-voice-panel"]');
        if (voicePanel) return true;

        return false;
      },
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

    // Debug: log what elements exist
    const hasCompactBar = await page.locator('[data-testid="compact-voice-bar"]').count() > 0;
    const hasTTPanel = await page.locator('[data-testid="thinker-talker-voice-panel"]').count() > 0;
    console.log(`Voice connection debug: compact-bar=${hasCompactBar}, tt-panel=${hasTTPanel}`);

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
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

  // Wait for the voice button to be ready (indicates chat page is fully loaded)
  try {
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton).first();
    await voiceButton.waitFor({ timeout: 15000 });
  } catch {
    console.log("[Voice] Voice button not found after navigation - page may not have voice enabled");
  }
}

/**
 * Extended test fixture with voice-enabled page
 * Uses fake media stream for testing without real microphone
 * Uses auth state from global-setup.ts for live backend tests
 */
export const test = base.extend<{
  voicePage: Page;
  voiceContext: BrowserContext;
}>({
  voiceContext: async ({ browser }, use) => {
    // Try to load auth state from file (created by global-setup.ts)
    const authFile = require("path").join(__dirname, "../.auth/user.json");
    let storageState: Record<string, unknown> | undefined;

    try {
      if (require("fs").existsSync(authFile)) {
        storageState = JSON.parse(require("fs").readFileSync(authFile, "utf-8"));
      }
    } catch (e) {
      console.log("[Voice Fixture] Could not load auth state, will use mock");
    }

    // Create context with microphone permissions and auth state
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: storageState || undefined,
    });
    await use(context);
    await context.close();
  },

  voicePage: async ({ voiceContext }, use) => {
    const page = await voiceContext.newPage();

    // Only set up API mocking for non-live tests
    const isLiveMode = VOICE_CONFIG.LIVE_REALTIME;

    if (!isLiveMode) {
      // Set up mock auth state for non-live tests
      await page.addInitScript((authState) => {
        if (!window.localStorage.getItem("voiceassist-auth")) {
          window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
        }
      }, mockAuthState);

      // Track created conversation ID for consistent responses
      let createdConversationId = `e2e-conv-${Date.now()}`;

      // API mocking only for non-live mode
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
    }

    await use(page);
  },
});

export { expect } from "@playwright/test";
