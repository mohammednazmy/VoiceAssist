/**
 * Voice KB Tool Results E2E Test
 *
 * Verifies that:
 * - A Thinker/Talker voice session can be opened with mocked backend.
 * - A mocked knowledge_base_query tool call + result over the WebSocket
 *   populates the voice drawer with KB Answer + sources.
 * - Clicking the "open in documents" icon on a KB source navigates to
 *   `/documents/:id`.
 *
 * This test uses a mocked WebSocket implementation and API routes, so it
 * does not require a live backend.
 */

import { test, expect, type Page } from "@playwright/test";
import { VOICE_SELECTORS } from "../fixtures/voice";
import { openVoiceMode, waitForVoiceModeReady } from "./utils/test-setup";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Programmatically log in via backend API and seed auth state.
 *
 * Uses E2E_EMAIL / E2E_PASSWORD from e2e/.env.e2e, falling back to
 * mo@asimo.io / uL8-p9rp when not provided.
 */
async function injectAuthFromApi(page: Page) {
  const apiBase = process.env.API_URL || "http://localhost:8000";
  const email = process.env.E2E_EMAIL || "mo@asimo.io";
  const password = process.env.E2E_PASSWORD || "uL8-p9rp";

  const loginResp = await page.request.post(`${apiBase}/api/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });

  if (!loginResp.ok()) {
    throw new Error(
      `KB voice E2E login failed (${loginResp.status()}): ${await loginResp.text()}`,
    );
  }

  const tokens = (await loginResp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    role?: string;
  };

  // Fetch user profile for a realistic auth store state
  const meResp = await page.request.get(`${apiBase}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  let user: {
    id: string;
    email: string;
    full_name?: string;
    name?: string;
    is_active?: boolean;
    is_admin?: boolean;
    admin_role?: string;
    nextcloud_user_id?: string | null;
    created_at?: string;
    last_login?: string;
  };

  if (meResp.ok()) {
    user = (await meResp.json()) as typeof user;
  } else {
    const nowIso = new Date().toISOString();
    user = {
      id: "e2e-voice-kb-user",
      email,
      full_name: "Voice KB E2E User",
      is_active: true,
      is_admin: true,
      admin_role: "admin",
      nextcloud_user_id: null,
      created_at: nowIso,
      last_login: nowIso,
    };
  }

  const now = new Date().toISOString();

  const authState = {
    state: {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name ?? user.name ?? email,
        is_active: user.is_active ?? true,
        is_admin: user.is_admin ?? true,
        admin_role: user.admin_role ?? tokens.role ?? "admin",
        nextcloud_user_id: user.nextcloud_user_id ?? null,
        created_at: user.created_at ?? now,
        last_login: user.last_login ?? now,
      },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in ?? 3600,
      },
      isAuthenticated: true,
      _hasHydrated: true,
    },
    version: 0,
  };

  await page.addInitScript((state) => {
    window.localStorage.setItem("voiceassist-auth", JSON.stringify(state));
    window.localStorage.setItem("voiceassist-language", "en");
  }, authState);
}

async function setupApiMocks(page: Page) {
  // /api/users/me
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-e2e-kb-voice",
        email: "voice-kb-test@voiceassist.dev",
        name: "Voice KB Test User",
        role: "user",
        is_active: true,
      }),
    });
  });

  // Token refresh
  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "mock-refreshed-access-token",
        refresh_token: "mock-refreshed-refresh-token",
        expires_in: 3600,
      }),
    });
  });

  // Conversations list + create
  await page.route(/\/api\/conversations(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "voice-kb-test-conv-123",
            title: "Voice KB Test Conversation",
            userId: "test-user-e2e-kb-voice",
            archived: false,
            messageCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [], total: 0, page: 1, pageSize: 20 },
        }),
      });
    }
  });

  // Conversation details
  await page.route(/\/api\/conversations\/[^/]+$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "voice-kb-test-conv-123",
            title: "Voice KB Test Conversation",
            userId: "test-user-e2e-kb-voice",
            archived: false,
            messageCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Conversation messages
  await page.route("**/api/conversations/*/messages**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 50 },
      }),
    });
  });

  // Clinical context
  await page.route("**/api/clinical-contexts/current**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: null }),
    });
  });

  // Voice pipeline status
  await page.route("**/api/voice/pipeline/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pipeline_available: true,
        mode: "thinker_talker",
        components: {
          stt: { streaming_available: true, primary_provider: "deepgram" },
          tts: { available: true, provider: "elevenlabs" },
          llm: { model: "gpt-4o-mini" },
        },
        settings: { barge_in_enabled: true, target_latency_ms: 1000 },
        active_sessions: 0,
      }),
    });
  });

  // Feature flags
  await page.route("**/api/experiments/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, variant: "treatment" }),
    });
  });
}

async function setupMockWebSocket(page: Page) {
  await page.addInitScript(() => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState: number = MockWebSocket.OPEN;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        const win = window as unknown as {
          __lastVoiceWS?: MockWebSocket | null;
          OriginalWebSocket?: typeof WebSocket;
        };
        win.__lastVoiceWS = this;

        // Simulate async open
        setTimeout(() => {
          this.onopen?.(new Event("open"));
        }, 0);
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        // Track sent messages for debugging if needed
        const win = window as unknown as {
          __wsSentMessages?: Array<string | ArrayBufferLike | Blob | ArrayBufferView>;
        };
        if (!win.__wsSentMessages) {
          win.__wsSentMessages = [];
        }
        win.__wsSentMessages.push(data);
      }

      close(code?: number, reason?: string): void {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(
          new CloseEvent("close", {
            code: code ?? 1000,
            reason: reason ?? "Mock close",
          }),
        );
      }

      // Helper used from tests to inject messages
      _dispatchMessage(payload: unknown): void {
        const data =
          typeof payload === "string" ? payload : JSON.stringify(payload);
        this.onmessage?.(
          new MessageEvent("message", {
            data,
          }),
        );
      }
    }

    // Expose helper + override global WebSocket
    const win = window as unknown as {
      MockWebSocket?: typeof MockWebSocket;
      __lastVoiceWS?: MockWebSocket | null;
      OriginalWebSocket?: typeof WebSocket;
    };
    win.MockWebSocket = MockWebSocket;
    win.__lastVoiceWS = null;
    win.OriginalWebSocket = window.WebSocket;
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });
}

async function openVoiceSessionWithMocks(page: Page): Promise<void> {
  await page.context().grantPermissions(["microphone"]);
  await injectAuthFromApi(page);
  await setupApiMocks(page);
  await setupMockWebSocket(page);

  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  const { ready } = await waitForVoiceModeReady(page, 30000);
  expect(ready).toBeTruthy();

  const opened = await openVoiceMode(page);
  expect(opened).toBeTruthy();

  // Ensure voice panel is visible
  const panel = page.locator(VOICE_SELECTORS.panel);
  await expect(panel.first()).toBeVisible();

  // Expand the drawer to show tool calls
  const expandButton = page.locator('[data-testid="compact-expand-btn"]');
  if (await expandButton.count()) {
    await expandButton.first().click();
  }

  // Wait for the drawer itself to appear
  await expect(
    page.locator('[data-testid="voice-expanded-drawer"]'),
  ).toBeVisible();
}

async function injectKBToolMessages(page: Page) {
  // Use the mocked WebSocket to simulate a knowledge_base_query tool call/result
  await page.evaluate(() => {
    const win = window as unknown as {
      __lastVoiceWS?: { _dispatchMessage: (payload: unknown) => void } | null;
    };
    const ws = win.__lastVoiceWS;
    if (!ws) {
      throw new Error("Mock WebSocket not initialized");
    }

    const toolCallId = "kb-tool-1";

    ws._dispatchMessage({
      type: "tool.call",
      tool_id: toolCallId,
      tool_name: "knowledge_base_query",
      arguments: {
        question: "What is the DKA protocol?",
      },
    });

    ws._dispatchMessage({
      type: "tool.result",
      tool_id: toolCallId,
      tool_name: "knowledge_base_query",
      result: {
        answer: "DKA is treated with IV fluids, insulin, and careful electrolyte management.",
        sources: [
          {
            id: "doc-123",
            title: "Hospital DKA protocol",
            category: "guideline",
          },
          {
            id: "doc-456",
            title: "Insulin titration quick guide",
            category: "policy",
          },
        ],
      },
      citations: [],
    });
  });
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Voice KB tool results", () => {
  test("renders KB answer and navigates to document from KB source", async ({
    page,
  }) => {
    await openVoiceSessionWithMocks(page);

    // Inject mocked knowledge_base_query tool call/result
    await injectKBToolMessages(page);

    const drawer = page.locator('[data-testid="voice-expanded-drawer"]');
    await expect(drawer).toBeVisible();

    // The KB result should eventually appear in the tool calls display
    await expect(
      drawer.getByText("KB Answer", { exact: false }),
    ).toBeVisible();
    await expect(
      drawer.getByText(
        "DKA is treated with IV fluids, insulin, and careful electrolyte management.",
      ),
    ).toBeVisible();

    await expect(drawer.getByText("Hospital DKA protocol")).toBeVisible();
    await expect(
      drawer.getByText("Insulin titration quick guide"),
    ).toBeVisible();

    // Click "open in documents" icon for the first source
    const openButtons = drawer.getAllByRole("button", {
      name: /Open document/i,
    });
    await expect(openButtons.first()).toBeVisible();
    await openButtons.first().click();

    // Navigation should reflect the KB document route with the first source id
    await expect(page).toHaveURL(/\/documents\/doc-123$/);
  });
});
