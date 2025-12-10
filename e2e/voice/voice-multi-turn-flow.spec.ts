/**
 * Thinker/Talker Multi-Turn Voice Flow (Scaffold)
 *
 * Goal:
 * - Exercise the unified Chat-with-Voice UI with the Thinker/Talker pipeline.
 * - Attach the VoiceMetricsCollector to capture barge-in / latency telemetry.
 * - Provide a scaffold for future multi-turn + barge-in realism tests.
 *
 * NOTE:
 * - This spec intentionally uses **soft assertions** so it is safe to run
 *   in current environments without dedicated audio fixtures.
 * - As we add deterministic audio injection and scripted utterances, we can
 *   tighten the expectations (e.g., require >=5 turns, barge-in events, etc).
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import { waitForVoiceModeReady, assertQualityThresholds } from "./utils/test-setup";
import { createMetricsCollector } from "./utils/voice-test-metrics";

// Resolve auth state path relative to project root
const AUTH_STATE_PATH = path.resolve(process.cwd(), "e2e/.auth/user.json");

test.describe("Thinker/Talker Multi-Turn Voice Flow", () => {
  test("collects voice metrics during a unified Chat-with-Voice session", async ({
    browser,
  }) => {
    // Use a dedicated context so we can control permissions cleanly
    const context = await browser.newContext({
      permissions: ["microphone"],
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    // Enable automation-friendly voice flags:
    // - Force Silero VAD on in automation
    // - Enable instant barge-in to exercise the full pipeline
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    // Attach metrics collector BEFORE navigation so we capture all logs
    const collector = createMetricsCollector(page);

    // Navigate via canonical Chat-with-Voice entry
    await page.goto("/");
    const voiceCard = page.getByTestId("chat-with-voice-card");
    await expect(voiceCard).toBeVisible({ timeout: 10000 });
    await voiceCard.click();

    // Unified chat container should now be visible
    await expect(
      page.getByTestId("unified-chat-container"),
    ).toBeVisible({ timeout: 15000 });

    // Open voice mode via unified toggle
    const voiceToggle = page.getByTestId("voice-mode-toggle");
    await expect(voiceToggle).toBeVisible({ timeout: 10000 });
    await voiceToggle.click();

    // Wait for Thinker/Talker voice mode to reach a ready/connected state
    const readyResult = await waitForVoiceModeReady(page, 30000);
    expect(
      readyResult.ready,
      `Voice mode was not ready within timeout: ${readyResult.error || "unknown error"}`,
    ).toBe(true);

    // Allow the session to run long enough that:
    // - Pipeline state transitions occur
    // - Multiple user/AI turns can happen (looped audio)
    // - Metrics collector can observe barge-in attempts if they occur
    await page.waitForTimeout(15000);

    // Gather metrics and log a human-readable summary
    const metrics = collector.getMetrics();
    const conv = collector.getConversationMetrics();
    console.log("[Multi-Turn Voice] Metrics summary:\n", collector.getSummary());

    // Assertions for multi-turn + metrics:
    // - We should see at least one state transition (idle -> connecting, etc.)
    expect(
      metrics.stateTransitions.length,
      "Expected at least one voice pipeline state transition during multi-turn scaffold test",
    ).toBeGreaterThan(0);

    // - Errors should be low-ish; current environments may produce a few benign
    //   console errors (e.g., feature flag/network flakiness), so we only
    //   assert that they are not extreme. This can be tightened later.
    expect(
      conv.errors,
      `Too many errors recorded during multi-turn scaffold test (errors=${conv.errors})`,
    ).toBeLessThanOrEqual(5);

    // - Require a meaningful multi-turn flow so we know the collector
    //   is seeing more than a single exchange.
    expect(
      conv.userUtterances,
      `Expected at least 1 user utterance in multi-turn test (got ${conv.userUtterances})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      conv.aiResponses,
      `Expected at least 1 AI response in multi-turn test (got ${conv.aiResponses})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      conv.totalTurns,
      `Expected at least 3 turns in multi-turn test (got ${conv.totalTurns})`,
    ).toBeGreaterThanOrEqual(3);

    // - Coarse latency guardrail; once we have more deterministic audio,
    //   this can be tightened further.
    if (conv.averageResponseLatencyMs > 0) {
      expect(
        conv.averageResponseLatencyMs,
        `Average response latency too high in multi-turn scaffold: ${conv.averageResponseLatencyMs.toFixed(0)}ms`,
      ).toBeLessThan(4000);
    }

    // - If barge-in attempts were observed, ensure latency is reasonable.
    if (conv.bargeInAttempts > 0 && conv.averageBargeInLatencyMs > 0) {
      expect(
        conv.averageBargeInLatencyMs,
        `Average barge-in latency too high in multi-turn test: ${conv.averageBargeInLatencyMs.toFixed(0)}ms`,
      ).toBeLessThan(2500);
    }

    // Apply shared quality thresholds with slightly relaxed queue limits for
    // multi-turn flows, which may legitimately trigger a small overflow.
    assertQualityThresholds(collector, {
      maxQueueOverflows: 3,
      maxScheduleResets: 3,
    });

    await context.close();
  });
});
