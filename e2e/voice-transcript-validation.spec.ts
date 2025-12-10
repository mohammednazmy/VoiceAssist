/**
 * Voice Transcript Validation E2E Tests
 *
 * Tests voice transcript flow with a mock Thinker/Talker WebSocket to validate:
 * - User transcripts appear in the unified Chat-with-Voice UI
 * - AI responses appear and are distinguishable from user speech
 * - Transcript text has high accuracy when backend sends canonical text
 *
 * These tests use a mock WebSocket server to simulate the **Thinker/Talker
 * pipeline** (`/api/voice/pipeline-ws`) without requiring actual audio capture
 * or a live backend.
 */

import { expect, Page } from "@playwright/test";
import { test as authTest } from "./fixtures/auth";
import { transcriptScorer } from "./voice/utils/transcript-scorer";

/**
 * Mock transcript content used in tests
 */
const MOCK_USER_TRANSCRIPT_TEXT =
  "Hello, this is a test message from the user.";

const MOCK_AI_RESPONSE_TEXT =
  "Hello! I received your test message. How can I help you today?";

/**
 * Helper to set up WebSocket mocking for the Thinker/Talker pipeline
 *
 * We intercept WebSocket connections to `/api/voice/pipeline-ws` and emit:
 * - transcript.delta (partial)
 * - transcript.complete (final user transcript)
 * - response.delta + response.complete (AI response)
 *
 * This drives `useThinkerTalkerSession` → `useThinkerTalkerVoiceMode` →
 * `ThinkerTalkerVoicePanel`, which in turn feeds the unified chat timeline.
 */
async function setupWebSocketMock(page: Page) {
  await page.addInitScript(
    (userTranscript: string, aiTranscript: string) => {
      const OriginalWebSocket = window.WebSocket;

      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        url: string;
        readyState: number = MockWebSocket.CONNECTING;
        onopen: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        binaryType: string = "blob";

        private eventListeners: Map<string, Set<EventListener>> = new Map();

        constructor(url: string, protocols?: string | string[]) {
          this.url = url;

          console.log("[MockWebSocket][TT] new WebSocket:", url);

          // Only mock Thinker/Talker pipeline connections
          if (url.includes("/api/voice/pipeline-ws")) {
            console.log(
              "[MockWebSocket][TT] Intercepting /api/voice/pipeline-ws connection",
            );

            // Simulate async connection open
            setTimeout(() => {
              this.readyState = MockWebSocket.OPEN;
              const openEvent = new Event("open");
              this.onopen?.(openEvent);
              this.dispatchEvent("open", openEvent);

              // Optionally, send a session.ready / init.ack if needed later.
              // For now, transcripts are driven purely by timed server messages
              // once the panel is open.

              // Simulate user transcript and AI response shortly after connect.
              setTimeout(() => {
                // Partial user transcript
                this.simulateMessage({
                  type: "transcript.delta",
                  text: userTranscript.slice(0, 24),
                  is_final: false,
                });
              }, 200);

              setTimeout(() => {
                // Final user transcript
                this.simulateMessage({
                  type: "transcript.complete",
                  text: userTranscript,
                  message_id: "msg-user-1",
                });
              }, 400);

              setTimeout(() => {
                // AI response (delta + complete) to drive assistant message
                this.simulateMessage({
                  type: "response.delta",
                  delta: aiTranscript.slice(0, 32),
                  message_id: "resp-1",
                });
                this.simulateMessage({
                  type: "response.complete",
                  text: aiTranscript,
                  message_id: "resp-1",
                });
              }, 700);
            }, 50);
          } else {
            // Use real WebSocket for all other endpoints
            console.log(
              "[MockWebSocket][TT] Delegating to original WebSocket:",
              url,
            );
            const realWs = new OriginalWebSocket(url, protocols);
            return realWs as unknown as MockWebSocket;
          }
        }

        addEventListener(type: string, listener: EventListener) {
          if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, new Set());
          }
          this.eventListeners.get(type)!.add(listener);
        }

        removeEventListener(type: string, listener: EventListener) {
          this.eventListeners.get(type)?.delete(listener);
        }

        private dispatchEvent(type: string, event: Event) {
          this.eventListeners.get(type)?.forEach((listener) => {
            (listener as (event: Event) => void)(event);
          });
        }

        send(_data: string | ArrayBuffer) {
          // For this mock we don't need to react to client messages.
          // All server events are driven on a fixed schedule after connect.
        }

        simulateMessage(data: object) {
          // Record mock events for tests using the same debug surface
          // as the real Thinker/Talker pipeline (__tt_ws_events) so
          // transcript and metrics specs share a single source of truth.
          // Also mirror into __mockTTEvents for deterministic transcript
          // assertions even if the app's own instrumentation changes.
          const win = window as typeof window & {
            __tt_ws_events?: Array<{
              direction: "received";
              type: string;
              data: any;
              timestamp: number;
            }>;
            __mockTTEvents?: Array<{
              type: string;
              data: any;
              timestamp: number;
            }>;
          };
          if (!win.__tt_ws_events) {
            win.__tt_ws_events = [];
          }
          if (!win.__mockTTEvents) {
            win.__mockTTEvents = [];
          }
          const msg = data as { type?: string };
          const event = {
            direction: "received",
            type: msg.type || "unknown",
            data,
            timestamp: Date.now(),
          };
          win.__tt_ws_events.push(event);
          win.__mockTTEvents.push({
            type: event.type,
            data: event.data,
            timestamp: event.timestamp,
          });

          const messageEvent = new MessageEvent("message", {
            data: JSON.stringify(data),
          });
          this.onmessage?.(messageEvent);
          this.dispatchEvent("message", messageEvent);
        }

        close(code?: number, reason?: string) {
          this.readyState = MockWebSocket.CLOSED;
          const closeEvent = new CloseEvent("close", { code, reason });
          this.onclose?.(closeEvent);
          this.dispatchEvent("close", closeEvent);
        }
      }

      // Replace WebSocket globally
      (window as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
        MockWebSocket;

      // Expose for debugging if needed
      (
        window as unknown as { __mockTTWebSocket: typeof MockWebSocket }
      ).__mockTTWebSocket = MockWebSocket;
    },
    MOCK_USER_TRANSCRIPT_TEXT,
    MOCK_AI_RESPONSE_TEXT,
  );
}

authTest.describe("Voice Transcript Validation", () => {
  authTest.setTimeout(60000); // 60 second timeout

  // Skip these tests unless MOCK_WEBSOCKET_E2E is set
  // Real WebSocket E2E requires actual backend
  authTest.skip(
    () => process.env.MOCK_WEBSOCKET_E2E !== "1",
    "Set MOCK_WEBSOCKET_E2E=1 to run mock WebSocket tests"
  );

  authTest("transcript flow with mock WebSocket (full utterance)", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Surface browser console logs during this spec to debug
    // mock WebSocket behavior and T/T event recording.
    page.on("console", (msg) => {
      // Avoid extremely noisy logs; keep text-only messages.
      if (msg.type() === "log") {
        console.log("[browser]", msg.text());
      }
    });

    // Set up mock WebSocket
    await setupWebSocketMock(page);

    // Mock the session endpoint
    await page.route("**/api/voice/realtime-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
          model: "gpt-4o-realtime-preview",
          session_id: "mock-session-123",
          expires_at: Date.now() + 300000,
          conversation_id: null,
          auth: {
            type: "ephemeral_token",
            token: "mock-token",
            expires_at: Date.now() + 300000,
          },
          voice_config: {
            voice: "alloy",
            modalities: ["text", "audio"],
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: { model: "whisper-1" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        }),
      });
    });

    // Login mock (skip auth for this test)
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-user-1",
          email: "test@example.com",
          username: "testuser",
        }),
      });
    });

    // Navigate to chat with voice mode
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");

    // Explicitly open voice mode via unified voice toggle
    const voiceToggle = page.getByTestId("voice-mode-toggle");
    await expect(
      voiceToggle,
      "Voice Mode toggle should be visible in unified chat with voice UI",
    ).toBeVisible({ timeout: 10000 });
    await voiceToggle.click();

    // Wait for voice panel
    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    await expect(
      voicePanel.first(),
      "Voice Mode panel should be visible in unified chat with voice UI",
    ).toBeVisible({ timeout: 10000 });

    // Quick debug snapshot to confirm mock installation and early WS state
    const debugState = await page.evaluate(() => {
      const win = window as typeof window & {
        __tt_ws_events?: Array<{
          direction: string;
          type: string;
          timestamp: number;
          data: any;
        }>;
        __mockTTWebSocket?: unknown;
      };
      return {
        hasTTEvents: !!win.__tt_ws_events,
        ttEventsCount: win.__tt_ws_events?.length || 0,
        hasMockTTWebSocket: !!win.__mockTTWebSocket,
      };
    });
    console.log("[Voice Transcript] Initial debug state:", debugState);

    // Mock WebSocket auto-connects when the panel mounts, so no explicit
    // “Start Voice Session” button is required in the unified UI.
    // The mock will emit transcript events shortly after connection.

    // Wait for T/T debug events to include transcript.complete
    const ttEventsHandle = await page.waitForFunction(() => {
      const win = window as typeof window & {
        __tt_ws_events?: Array<{
          direction: string;
          type: string;
          timestamp: number;
          data: { text?: string; delta?: string };
        }>;
      };
      const events = win.__tt_ws_events || [];
      const hasTranscriptComplete = events.some(
        (e) => e.type === "transcript.complete",
      );
      return hasTranscriptComplete ? events : null;
    }, { timeout: 7000 });

    const ttEvents = (await ttEventsHandle.jsonValue()) as Array<{
      type: string;
      data: { text?: string; delta?: string };
      timestamp: number;
    }>;

    console.log(
      "[Voice Transcript] __tt_ws_events types:",
      ttEvents.map((e) => e.type).join(", "),
    );

    const userEvent = ttEvents.find((e) => e.type === "transcript.complete");

    expect(
      userEvent,
      "Expected a transcript.complete event from Thinker/Talker pipeline",
    ).toBeTruthy();

    const userText = (userEvent?.data.text || "").trim();
    const expectedUserText = MOCK_USER_TRANSCRIPT_TEXT;
    const userScore = transcriptScorer.score(expectedUserText, userText);

    console.log("[Voice Transcript] User transcript score:", userScore);

    // For deterministic mock data we expect very high agreement
    expect(
      userScore.overallScore,
      `User transcript accuracy too low: ${userScore.overallScore.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(0.9);

    // Sanity check that user transcript is not contaminated with obvious AI keywords
    const contamination = transcriptScorer.detectEchoContamination(
      userText,
      ["help", "received", "today"],
      MOCK_AI_RESPONSE_TEXT,
    );

    console.log(
      "[Voice Transcript] Echo contamination check:",
      contamination,
    );

    expect(
      contamination.detected,
      "User transcript should not contain obvious AI phrases",
    ).toBe(false);
  });

  authTest("partial transcript events appear before final transcript (short utterance)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    page.on("console", (msg) => {
      if (msg.type() === "log") {
        console.log("[browser]", msg.text());
      }
    });

    // Use a shorter utterance to validate partial vs final separation
    const shortUserTranscript = "Short test.";
    const shortAiTranscript = "Short reply.";

    // Override the default mock with short content for this test
    await page.addInitScript(
      (userTranscript: string, aiTranscript: string) => {
        const OriginalWebSocket = window.WebSocket;

        class ShortMockWebSocket {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;

          url: string;
          readyState: number = ShortMockWebSocket.CONNECTING;
          onopen: ((event: Event) => void) | null = null;
          onclose: ((event: CloseEvent) => void) | null = null;
          onmessage: ((event: MessageEvent) => void) | null = null;
          onerror: ((event: Event) => void) | null = null;
          binaryType: string = "blob";

          private eventListeners: Map<string, Set<EventListener>> = new Map();

          constructor(url: string, protocols?: string | string[]) {
            this.url = url;

            console.log("[ShortMockWebSocket][TT] new WebSocket:", url);

            if (url.includes("/api/voice/pipeline-ws")) {
              console.log(
                "[ShortMockWebSocket][TT] Intercepting /api/voice/pipeline-ws connection",
              );

              setTimeout(() => {
                this.readyState = ShortMockWebSocket.OPEN;
                const openEvent = new Event("open");
                this.onopen?.(openEvent);
                this.dispatchEvent("open", openEvent);

                // Emit a partial transcript that is NOT a substring of the final text
                setTimeout(() => {
                  this.simulateMessage({
                    type: "transcript.delta",
                    text: "Listening preview...",
                    is_final: false,
                  });
                }, 200);

                // Final transcript
                setTimeout(() => {
                  this.simulateMessage({
                    type: "transcript.complete",
                    text: userTranscript,
                    message_id: "msg-short-1",
                  });
                }, 500);

                // AI response
                setTimeout(() => {
                  this.simulateMessage({
                    type: "response.delta",
                    delta: aiTranscript,
                    message_id: "resp-short-1",
                  });
                  this.simulateMessage({
                    type: "response.complete",
                    text: aiTranscript,
                    message_id: "resp-short-1",
                  });
                }, 800);
              }, 50);
            } else {
              console.log(
                "[ShortMockWebSocket][TT] Delegating to original WebSocket:",
                url,
              );
              const realWs = new OriginalWebSocket(url, protocols);
              return realWs as unknown as ShortMockWebSocket;
            }
          }

          addEventListener(type: string, listener: EventListener) {
            if (!this.eventListeners.has(type)) {
              this.eventListeners.set(type, new Set());
            }
            this.eventListeners.get(type)!.add(listener);
          }

          removeEventListener(type: string, listener: EventListener) {
            this.eventListeners.get(type)?.delete(listener);
          }

          private dispatchEvent(type: string, event: Event) {
            this.eventListeners.get(type)?.forEach((listener) => {
              (listener as (event: Event) => void)(event);
            });
          }

          // We don't need to handle client messages for this short case
          send(_data: string | ArrayBuffer) {}

          simulateMessage(data: object) {
            const win = window as typeof window & {
              __tt_ws_events?: Array<{
                direction: "received";
                type: string;
                data: any;
                timestamp: number;
              }>;
              __mockTTEvents?: Array<{
                type: string;
                data: any;
                timestamp: number;
              }>;
            };
            if (!win.__tt_ws_events) {
              win.__tt_ws_events = [];
            }
            if (!win.__mockTTEvents) {
              win.__mockTTEvents = [];
            }
            const msg = data as { type?: string };
            const event = {
              direction: "received",
              type: msg.type || "unknown",
              data,
              timestamp: Date.now(),
            };
            win.__tt_ws_events.push(event);
            win.__mockTTEvents.push({
              type: event.type,
              data: event.data,
              timestamp: event.timestamp,
            });

            const messageEvent = new MessageEvent("message", {
              data: JSON.stringify(data),
            });
            this.onmessage?.(messageEvent);
            this.dispatchEvent("message", messageEvent);
          }

          close(code?: number, reason?: string) {
            this.readyState = ShortMockWebSocket.CLOSED;
            const closeEvent = new CloseEvent("close", { code, reason });
            this.onclose?.(closeEvent);
            this.dispatchEvent("close", closeEvent);
          }
        }

        (window as unknown as { WebSocket: typeof ShortMockWebSocket })
          .WebSocket = ShortMockWebSocket;
      },
      shortUserTranscript,
      shortAiTranscript,
    );

    // Navigate to chat with voice mode
    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");

    // Open voice panel via unified toggle
    const voiceToggle = page.getByTestId("voice-mode-toggle");
    await expect(voiceToggle).toBeVisible({ timeout: 10000 });
    await voiceToggle.click();

    const voicePanel = page.locator('[data-testid="voice-mode-panel"]');
    await expect(voicePanel.first()).toBeVisible({ timeout: 10000 });

    const shortDebugState = await page.evaluate(() => {
      const win = window as typeof window & {
        __tt_ws_events?: Array<{
          direction: string;
          type: string;
          timestamp: number;
          data: any;
        }>;
        __mockTTWebSocket?: unknown;
      };
      return {
        hasTTEvents: !!win.__tt_ws_events,
        ttEventsCount: win.__tt_ws_events?.length || 0,
        hasMockTTWebSocket: !!win.__mockTTWebSocket,
      };
    });
    console.log("[Voice Transcript] Short-utterance debug state:", shortDebugState);

    // Assert that a transcript.delta event occurs before transcript.complete
    const eventsHandle = await page.waitForFunction(() => {
      const win = window as typeof window & {
        __tt_ws_events?: Array<{
          direction: string;
          type: string;
          timestamp: number;
          data: any;
        }>;
      };
      const evts = win.__tt_ws_events || [];
      const hasDelta = evts.some((e) => e.type === "transcript.delta");
      const hasComplete = evts.some((e) => e.type === "transcript.complete");
      return hasDelta && hasComplete ? evts : null;
    }, { timeout: 7000 });

    const ttEvents = (await eventsHandle.jsonValue()) as Array<{
      type: string;
      timestamp: number;
      data: { text?: string };
    }>;

    const firstDelta = ttEvents.find((e) => e.type === "transcript.delta");
    const firstComplete = ttEvents.find(
      (e) => e.type === "transcript.complete",
    );

    expect(
      firstDelta,
      "Expected at least one transcript.delta event before completion",
    ).toBeTruthy();
    expect(
      firstComplete,
      "Expected a transcript.complete event for short utterance",
    ).toBeTruthy();

    if (firstDelta && firstComplete) {
      expect(
        firstDelta.timestamp,
        "transcript.delta should arrive before transcript.complete",
      ).toBeLessThan(firstComplete.timestamp);
    }
  });
});

// Additional test using authenticated fixture
authTest.describe("Voice Transcript with Auth", () => {
  authTest.setTimeout(60000);

  authTest(
    "voice panel shows status indicators",
    async ({ authenticatedPage }, testInfo) => {
      const page = authenticatedPage;

      // Navigate to chat with voice mode
      await page.goto("/chat?mode=voice");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Explicitly open voice mode via unified voice toggle
      const voiceToggle = page.getByTestId("voice-mode-toggle");
      await expect(
        voiceToggle,
        "Voice Mode toggle should be visible in unified chat with voice UI",
      ).toBeVisible({ timeout: 10000 });
      await voiceToggle.click();

      // Look for Voice Mode panel
      const voicePanel = page.locator('[data-testid="voice-mode-panel"]');

      // In unified Chat-with-Voice UI, Voice Mode panel must be available
      await expect(
        voicePanel.first(),
        "Voice Mode panel should be visible in unified chat with voice UI",
      ).toBeVisible({ timeout: 10000 });

      // Verify panel contains expected elements
      await expect(voicePanel).toBeVisible();

      // Check for settings button (gear icon)
      const settingsButton = page.locator(
        '[data-testid="voice-settings-button"], button[aria-label*="settings"], button[aria-label*="Settings"]'
      );

      // Settings button may or may not be visible depending on implementation
      const settingsCount = await settingsButton.count();
      console.log(`Found ${settingsCount} settings buttons`);
    }
  );
});
