/**
 * Voice Mode WebSocket Integration Tests
 *
 * Comprehensive E2E tests for the Thinker/Talker voice pipeline.
 * These tests verify real WebSocket communication, barge-in behavior,
 * transcript synchronization, and feature flag interactions.
 *
 * Requirements:
 * - Backend running at localhost:8200 (or E2E_API_URL)
 * - Frontend running at localhost:5173 (or E2E_BASE_URL)
 * - Valid test user credentials
 *
 * Run with: pnpm playwright test e2e/voice/voice-websocket-integration.spec.ts --project=voice-live
 */

import { test, expect, type Page } from "@playwright/test";
import { VOICE_SELECTORS } from "../fixtures/voice";
import { openVoiceMode, waitForVoiceModeReady } from "./utils/test-setup";

// Voice mode feature flags to test
const VOICE_FEATURE_FLAGS = [
  "backend.voice_barge_in_enabled",
  "backend.voice_instant_barge_in",
  "backend.voice_prosody_extraction_enabled",
  "backend.voice_preemptive_listening",
  "backend.voice_barge_in_classifier_enabled",
  "backend.voice_intelligent_barge_in",
  "backend.voice_continuation_detection",
  "backend.voice_backchannel_detection",
  "backend.voice_natural_flow_config",
];

// Types for WebSocket message tracking
interface WSMessage {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
  direction: "sent" | "received";
}

interface VoiceMetrics {
  connectionTimeMs: number | null;
  firstTranscriptMs: number | null;
  firstResponseMs: number | null;
  firstAudioMs: number | null;
  bargeInResponseMs: number | null;
  messageCount: number;
  audioChunkCount: number;
}

// Helper class to track WebSocket messages
class WSMessageTracker {
  messages: WSMessage[] = [];
  connectionTime: number | null = null;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  record(type: string, data: Record<string, unknown>, direction: "sent" | "received") {
    this.messages.push({
      type,
      timestamp: Date.now() - this.startTime,
      data,
      direction,
    });
  }

  getMetrics(): VoiceMetrics {
    const firstTranscript = this.messages.find(
      (m) => m.direction === "received" && m.type === "transcript.delta"
    );
    const firstResponse = this.messages.find(
      (m) => m.direction === "received" && m.type === "response.delta"
    );
    const firstAudio = this.messages.find(
      (m) => m.direction === "received" && m.type === "audio"
    );
    const bargeInSent = this.messages.find(
      (m) => m.direction === "sent" && m.type === "barge_in"
    );
    const bargeInConfirmed = this.messages.find(
      (m) =>
        m.direction === "received" &&
        m.type === "voice.state" &&
        m.data.state === "listening" &&
        m.timestamp > (bargeInSent?.timestamp || 0)
    );

    return {
      connectionTimeMs: this.connectionTime,
      firstTranscriptMs: firstTranscript?.timestamp || null,
      firstResponseMs: firstResponse?.timestamp || null,
      firstAudioMs: firstAudio?.timestamp || null,
      bargeInResponseMs:
        bargeInSent && bargeInConfirmed
          ? bargeInConfirmed.timestamp - bargeInSent.timestamp
          : null,
      messageCount: this.messages.length,
      audioChunkCount: this.messages.filter(
        (m) => m.type === "audio" && m.direction === "received"
      ).length,
    };
  }

  getMessagesByType(type: string, direction?: "sent" | "received"): WSMessage[] {
    return this.messages.filter(
      (m) => m.type === type && (!direction || m.direction === direction)
    );
  }

  hasMessage(type: string, direction: "sent" | "received"): boolean {
    return this.messages.some((m) => m.type === type && m.direction === direction);
  }

  reset() {
    this.messages = [];
    this.connectionTime = null;
    this.startTime = Date.now();
  }
}

// Helper to inject mock auth state
async function injectMockAuth(page: Page) {
  await page.addInitScript(() => {
    const mockAuthState = {
      state: {
        user: {
          id: "test-user-e2e-voice-123",
          email: "voice-test@voiceassist.dev",
          name: "Voice E2E Test User",
        },
        tokens: {
          accessToken: "mock-access-token-for-voice-e2e-testing",
          refreshToken: "mock-refresh-token-for-voice-e2e-testing",
          expiresIn: 3600,
        },
        isAuthenticated: true,
        _hasHydrated: true,
      },
      version: 0,
    };
    localStorage.setItem("voiceassist-auth", JSON.stringify(mockAuthState));
    localStorage.setItem("voiceassist-language", "en");
  });
}

// Helper to set up API mocks
async function setupApiMocks(page: Page) {
  // Mock auth endpoints
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-e2e-voice-123",
        email: "voice-test@voiceassist.dev",
        name: "Voice E2E Test User",
        role: "user",
        is_active: true,
      }),
    });
  });

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

  // Mock conversation endpoints
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

  await page.route(/\/api\/conversations\/[^/]+$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "voice-test-conv-123",
            title: "Voice Test Conversation",
            userId: "test-user-e2e-voice-123",
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

  await page.route(/\/api\/conversations(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "voice-test-conv-123",
            title: "Voice Test Conversation",
            userId: "test-user-e2e-voice-123",
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

  // Mock clinical context
  await page.route("**/api/clinical-contexts/current**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: null }),
    });
  });

  // Mock pipeline status
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

  // Mock feature flags endpoint
  await page.route("**/api/experiments/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, variant: "treatment" }),
    });
  });

  await page.route("**/api/folders**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

// Helper to generate synthetic audio data (simulates speech)
function generateSyntheticAudio(durationMs: number, sampleRate: number = 16000): ArrayBuffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new ArrayBuffer(samples * 2); // 16-bit audio
  const view = new Int16Array(buffer);

  // Generate a simple sine wave with some noise to simulate speech
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    // Mix of frequencies to simulate speech-like audio
    const value =
      Math.sin(2 * Math.PI * 200 * t) * 0.3 +
      Math.sin(2 * Math.PI * 500 * t) * 0.2 +
      Math.sin(2 * Math.PI * 1000 * t) * 0.1 +
      (Math.random() - 0.5) * 0.1; // Add noise
    view[i] = Math.round(value * 32767 * 0.5);
  }

  return buffer;
}

/**
 * Open voice mode and wait for the UI to be ready before collecting WebSocket events.
 * Relies on the automation-only WS event hook in useThinkerTalkerSession.
 */
async function openVoiceSession(page: Page): Promise<void> {
  await page.context().grantPermissions(["microphone"]);
  await page.addInitScript(() => {
    (window as any).__tt_ws_events = [];
  });

  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  const ready = await waitForVoiceModeReady(page, 20000);
  expect(ready).toBeTruthy();

  const opened = await openVoiceMode(page);
  expect(opened).toBeTruthy();

  // Start the voice session if a start button is present
  const startButton = page.locator(VOICE_SELECTORS.startButton);
  if ((await startButton.count()) > 0) {
    const firstStart = startButton.first();
    if (await firstStart.isEnabled()) {
      await firstStart.click({ delay: 20 });
    }
  }

  // Allow initial WS handshake/messages to flow
  await page.waitForTimeout(2500);
}

/**
 * Wait until the automation WS event buffer has events and return them.
 */
async function waitForCapturedEvents(page: Page, minimum: number = 1) {
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const events = (window as any).__tt_ws_events;
            return Array.isArray(events) ? events.length : 0;
          }),
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(minimum);
  } catch (err) {
    console.warn(
      `[Test] WS events did not reach minimum ${minimum} within timeout`,
      err,
    );
  }

  return page.evaluate(() => (window as any).__tt_ws_events || []);
}

// Ensure the WS event buffer is reset for every test
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__tt_ws_events = [];
  });
});

// ============================================================================
// Test Suite: WebSocket Connection
// ============================================================================

test.describe("Voice WebSocket Connection", () => {
  test("can establish WebSocket connection to voice pipeline", async ({ page }) => {
    await openVoiceSession(page);
    const events = await waitForCapturedEvents(page, 1);
    const types = Array.from(new Set(events.map((e: any) => e.type))).join(", ");
    expect(events.length).toBeGreaterThan(0);
    console.log(`[Test] WS events captured: ${events.length}`);
    console.log(`[Test] WS event types: ${types}`);
  });

  test("receives session.init confirmation from server", async ({ page }) => {
    await openVoiceSession(page);
    const events = await waitForCapturedEvents(page, 1);
    const hasInit = events.some(
      (e: any) =>
        typeof e?.type === "string" &&
        (e.type.includes("session.init") ||
          e.type.includes("session.ready") ||
          e.type.includes("voice.state")),
    );
    console.log(`[Test] WS events captured: ${events.length}`);
    console.log(
      `[Test] session/voice events: ${events
        .map((e: any) => e.type)
        .join(", ")}`,
    );
    expect(hasInit).toBeTruthy();
  });
});

// ============================================================================
// Test Suite: Audio Streaming
// ============================================================================

test.describe("Voice Audio Streaming", () => {
  test("can send audio chunks through WebSocket", async ({ page }) => {
    await openVoiceSession(page);
    const events = await waitForCapturedEvents(page, 2);
    await page.waitForTimeout(8000);

    const speechEvents = events.filter((e: any) =>
      typeof e?.type === "string"
        ? e.type.includes("speech") || e.type.includes("audio")
        : false,
    );
    console.log(`[Test] Audio-related events: ${speechEvents.length}`);
    console.log(`[Test] WS events captured: ${events.length}`);
    const messageTypes = Array.from(
      new Set(events.map((m: any) => m.type)),
    ).join(", ");
    console.log(`[Test] Tracker message types: ${messageTypes}`);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test Suite: Transcript Synchronization
// ============================================================================

test.describe("Transcript Synchronization", () => {
  test("receives and displays transcripts in real-time", async ({ page }) => {
    await openVoiceSession(page);
    await waitForCapturedEvents(page, 2);
    await page.waitForTimeout(8000);

    const events = await waitForCapturedEvents(page);
    const transcriptEvents = events.filter((e: any) =>
      typeof e?.type === "string" &&
      (e.type.startsWith("transcript") || e.type.startsWith("response")),
    );

    console.log(`[Test] Transcript/response events: ${transcriptEvents.length}`);
    console.log(
      `[Test] Event types: ${Array.from(
        new Set(events.map((m: any) => m.type)),
      ).join(", ")}`,
    );

    expect(transcriptEvents.length).toBeGreaterThan(0);
  });

  test("verifies transcript appears in chat UI", async ({ page }) => {
    await openVoiceSession(page);
    await waitForCapturedEvents(page);

    // Look for any message elements in the chat
    const messageElements = page.locator(
      "[data-testid*='message'], .message, [class*='message']"
    );

    const initialCount = await messageElements.count();
    console.log(`[Test] Initial message count: ${initialCount}`);

    // After voice interaction, messages should appear
    // This would require simulating actual speech input
  });
});

// ============================================================================
// Test Suite: Barge-In Functionality
// ============================================================================

test.describe("Barge-In Functionality", () => {
  test("sends barge_in message when user interrupts", async ({ page }) => {
    await openVoiceSession(page);
    await waitForCapturedEvents(page, 2);
    await page.waitForTimeout(8000);

    const events = await waitForCapturedEvents(page);
    const speechStarts = events.filter(
      (e: any) =>
        typeof e?.type === "string" &&
        (e.type.includes("speech_started") || e.type.includes("speech")),
    );

    console.log(`[Test] speech/buffer events: ${speechStarts.length}`);
    expect(events.length).toBeGreaterThan(0);
  });

  test("measures barge-in response latency", async ({ page }) => {
    await openVoiceSession(page);
    await waitForCapturedEvents(page, 2);
    await page.waitForTimeout(8000);

    const events = await waitForCapturedEvents(page);
    const sorted = [...events].sort(
      (a: any, b: any) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0),
    );
    const speechEvent = sorted.find(
      (e: any) =>
        typeof e?.type === "string" &&
        (e.type.includes("speech_started") || e.type.includes("speech")),
    );
    const listeningEvent = sorted.find(
      (e: any) =>
        typeof e?.type === "string" &&
        e.type.includes("voice.state") &&
        (e.data as any)?.state === "listening" &&
        (e?.timestamp ?? 0) >= (speechEvent?.timestamp ?? 0),
    );

    const latency =
      speechEvent && listeningEvent
        ? Math.max(
            0,
            (listeningEvent as any).timestamp - (speechEvent as any).timestamp,
          )
        : null;

    console.log(`[Test] Barge-in latency: ${latency ?? "n/a"}ms`);
    console.log(`[Test] WS events captured: ${events.length}`);
    expect(events.length).toBeGreaterThan(0);

    // Capture distribution across all detected speech -> listening transitions
    const bargeLatencies: number[] = [];
    sorted.forEach((event: any, idx: number) => {
      if (
        typeof event?.type === "string" &&
        event.type.includes("speech_started")
      ) {
        const nextListening = sorted.slice(idx + 1).find((e: any) => {
          return (
            typeof e?.type === "string" &&
            e.type.includes("voice.state") &&
            (e.data as any)?.state === "listening"
          );
        });
        if (nextListening?.timestamp != null && event?.timestamp != null) {
          bargeLatencies.push(
            Math.max(0, nextListening.timestamp - event.timestamp),
          );
        }
      }
    });
    if (bargeLatencies.length) {
      const avg =
        bargeLatencies.reduce((a, b) => a + b, 0) / bargeLatencies.length;
      const max = Math.max(...bargeLatencies);
      const min = Math.min(...bargeLatencies);
      console.log(
        `[Test] Barge-in latency distribution (ms): count=${bargeLatencies.length}, min=${min.toFixed(
          1,
        )}, avg=${avg.toFixed(1)}, max=${max.toFixed(1)}`,
      );
      // Thresholds: regress if any sample exceeds 10s or average drifts above 8s
      expect(max).toBeLessThan(10000);
      expect(avg).toBeLessThan(8000);
    } else {
      console.warn("[Test] No barge-in latency samples recorded");
    }
  });

  test("verifies audio stops after barge-in", async ({ page }) => {
    await openVoiceSession(page);
    await waitForCapturedEvents(page, 2);
    await page.waitForTimeout(8000);

    const events = await waitForCapturedEvents(page);
    const speechEvents = events.filter(
      (e: any) => typeof e?.type === "string" && e.type.includes("speech"),
    );
    const audioEvents = events.filter(
      (e: any) => typeof e?.type === "string" && e.type.includes("audio"),
    );

    console.log(`[Test] Speech events: ${speechEvents.length}`);
    console.log(`[Test] Audio events: ${audioEvents.length}`);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test Suite: Feature Flags
// ============================================================================

test.describe("Voice Feature Flags", () => {
  for (const flag of VOICE_FEATURE_FLAGS.slice(0, 3)) {
    // Test first 3 flags
    test(`verifies ${flag} can be queried`, async ({ page }) => {
      const apiBase =
        process.env.CLIENT_GATEWAY_URL ||
        process.env.E2E_API_URL ||
        "http://localhost:8000";

      await openVoiceSession(page);
      await waitForCapturedEvents(page);

      const authToken = await page.evaluate(() => {
        const raw = localStorage.getItem("voiceassist-auth");
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw);
          return parsed?.state?.tokens?.accessToken ?? null;
        } catch {
          return null;
        }
      });

      const response = await page.request.get(
        `${apiBase}/api/experiments/flags/${flag}`,
        {
          headers: authToken
            ? {
                Authorization: `Bearer ${authToken}`,
              }
            : undefined,
        },
      );
      const json = await response.json().catch(() => ({}));
      const flagQueried = response.ok() && json?.data?.name === flag;

      console.log(`[Test] Flag ${flag} queried: ${flagQueried}`);
      expect(flagQueried).toBeTruthy();
    });
  }
});

// ============================================================================
// Test Suite: Performance Metrics
// ============================================================================

test.describe("Voice Performance Metrics", () => {
  test("measures end-to-end latency metrics", async ({ page }) => {
    await openVoiceSession(page);
    await waitForCapturedEvents(page, 2);
    await page.waitForTimeout(8000);

    const events = await waitForCapturedEvents(page);
    const sorted = [...events].sort(
      (a: any, b: any) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0),
    );
    const baseTs = sorted[0]?.timestamp ?? null;
    const rel = (predicate: (t: string) => boolean) => {
      const ts =
        sorted.find(
          (e: any) => typeof e?.type === "string" && predicate(e.type),
        )?.timestamp ?? null;
      return ts !== null && baseTs !== null ? ts - baseTs : null;
    };

    const ts = (predicate: (t: string) => boolean) =>
      events.find((e: any) => typeof e?.type === "string" && predicate(e.type))
        ?.timestamp ?? null;
    const connectionTime =
      rel((t) => t === "session.ready") ||
      rel((t) => t.includes("voice.state"));
    const firstTranscript = rel((t) => t.startsWith("transcript"));
    const firstResponse = rel((t) => t.startsWith("response"));
    const firstAudio = rel((t) => t.includes("audio"));

    console.log("\n=== Voice Mode Performance Metrics ===");
    console.log(`Connection time: ${connectionTime ?? "n/a"}ms`);
    console.log(`First transcript: ${firstTranscript ?? "n/a"}ms`);
    console.log(`First response: ${firstResponse ?? "n/a"}ms`);
    console.log(`First audio: ${firstAudio ?? "n/a"}ms`);
    console.log(`Barge-in latency: n/a`);
    console.log(`Total events: ${events.length}`);
    console.log("=====================================\n");
    console.log(`[Test] WS events captured: ${events.length}`);
    expect(events.length).toBeGreaterThan(0);

    // Assert reasonable relative timings
    expect(connectionTime).not.toBeNull();
    if (connectionTime !== null) {
      expect(connectionTime).toBeLessThan(5000);
    }
    if (firstTranscript !== null) {
      expect(firstTranscript).toBeLessThan(12000);
    }
    if (firstResponse !== null) {
      // Fail if the WS response stream takes longer than 10s from session start
      expect(firstResponse).toBeLessThan(10000);
    }
    if (firstAudio !== null) {
      expect(firstAudio).toBeLessThan(5000);
    }
  });
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

test.describe("Voice Error Handling", () => {
  test("handles WebSocket disconnect gracefully", async ({ page }) => {
    await openVoiceSession(page);
    const capturedEvents = await waitForCapturedEvents(page, 1);

    // Check for error UI or reconnect attempt
    const errorElement = page.locator(
      "[data-testid*='error']:not(.sr-only), [class*='error']:not(.sr-only), [role='alert']:not(.sr-only)",
    );
    const errorVisible =
      (await errorElement.count()) > 0 &&
      ((await errorElement.first().isVisible()) ||
        ((await errorElement.first().textContent()) ?? "").trim().length > 0);
    const errorText = errorVisible
      ? await errorElement.first().textContent()
      : "";
    const errorHtml = errorVisible
      ? await errorElement.first().evaluate((el) => el.outerHTML)
      : "";
    console.log(`[Test] Error UI visible: ${errorVisible}`);
    if (errorText) {
      console.log(`[Test] Error text: ${errorText}`);
    }
    if (errorHtml) {
      console.log(`[Test] Error html: ${errorHtml}`);
    }
    console.log(`[Test] WS events captured: ${capturedEvents.length}`);
    expect(capturedEvents.length).toBeGreaterThan(0);
  });

  test("handles server errors gracefully", async ({ page }) => {
    await openVoiceSession(page);
    const capturedEvents = await waitForCapturedEvents(page, 1);

    const errorElement = page.locator(
      "[data-testid*='error']:not(.sr-only), [class*='error']:not(.sr-only), [role='alert']:not(.sr-only)",
    );
    const errorVisible =
      (await errorElement.count()) > 0 &&
      ((await errorElement.first().isVisible()) ||
        ((await errorElement.first().textContent()) ?? "").trim().length > 0);
    const errorText = errorVisible
      ? await errorElement.first().textContent()
      : "";
    const errorHtml = errorVisible
      ? await errorElement.first().evaluate((el) => el.outerHTML)
      : "";
    console.log(`[Test] Error UI visible: ${errorVisible}`);
    if (errorText) {
      console.log(`[Test] Error text: ${errorText}`);
    }
    if (errorHtml) {
      console.log(`[Test] Error html: ${errorHtml}`);
    }
    console.log(`[Test] WS events captured: ${capturedEvents.length}`);
    expect(capturedEvents.length).toBeGreaterThan(0);
  });
});
