/**
 * Voice Latency Measurement Utilities for E2E Testing
 *
 * Provides tools for measuring and validating voice mode latency metrics:
 * - Barge-in latency (speech detection → audio mute)
 * - TTFA (Time To First Audio: user speech end → AI first audio)
 * - E2E latency (user speech end → AI first word)
 *
 * Uses the __voiceTestHarness window object for accurate timing data.
 *
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

import type { Page } from "@playwright/test";
import type {
  VoiceTestHarnessState,
  AudioTimestamps,
  BargeInLogEntry,
} from "./test-setup";
import { getVoiceTestHarnessState } from "./test-setup";

// ============================================================================
// Latency Targets (from V3 plan)
// ============================================================================

/**
 * Latency targets for voice mode quality metrics.
 * These align with ChatGPT-like instant barge-in experience.
 */
export const LATENCY_TARGETS = {
  bargeIn: {
    /** P50 barge-in latency: speech detected → audio mute */
    p50: 100, // ms - ChatGPT target
    /** P90 barge-in latency */
    p90: 150, // ms
    /** P99 barge-in latency */
    p99: 250, // ms
    /** Detection to fade start (should be near-instant) */
    detectionToFade: 10, // ms
    /** Fade to silence (30ms fade + buffer) */
    fadeToSilence: 50, // ms
  },
  ttfa: {
    /** P50 Time To First Audio: user speech end → AI first audio */
    p50: 800, // ms
    /** P90 TTFA */
    p90: 1500, // ms
    /** P99 TTFA */
    p99: 2500, // ms
  },
  e2e: {
    /** P50 End-to-end latency: user speech end → AI first word */
    p50: 1200, // ms
    /** P90 E2E latency */
    p90: 2000, // ms
    /** P99 E2E latency */
    p99: 3500, // ms
  },
} as const;

// ============================================================================
// Barge-in Latency Measurement
// ============================================================================

/**
 * Barge-in latency metrics from a single barge-in event.
 */
export interface BargeInLatencyMetrics {
  /** Timestamp when speech was detected by Silero VAD */
  speechDetectedAt: number;
  /** Timestamp when fadeOut() was called */
  fadeStartedAt: number | null;
  /** Timestamp when activeSourcesCount reached 0 */
  audioSilentAt: number | null;

  /** Time from speech detection to fade start (should be <10ms) */
  detectionToFadeMs: number | null;
  /** Time from fade start to audio silent (should be <50ms) */
  fadeToSilenceMs: number | null;
  /** Total barge-in latency: speech detected → audio silent */
  totalLatencyMs: number | null;

  /** Whether audio was actually playing when barge-in triggered */
  wasPlaying: boolean;
  /** Number of active audio sources when barge-in triggered */
  activeSourcesAtTrigger: number;
}

/**
 * Measure barge-in latency from the latest barge-in event.
 *
 * @param page - The Playwright page instance
 * @returns Barge-in latency metrics, or null if no barge-in event found
 */
export async function measureBargeInLatency(
  page: Page
): Promise<BargeInLatencyMetrics | null> {
  const harness = await getVoiceTestHarnessState(page);
  if (!harness || harness.bargeInLog.length === 0) {
    return null;
  }

  const lastBargeIn = harness.bargeInLog[harness.bargeInLog.length - 1];
  const timestamps = harness.timestamps;

  // Calculate derived metrics
  const detectionToFadeMs =
    timestamps.lastFadeStarted && lastBargeIn.speechDetectedAt
      ? timestamps.lastFadeStarted - lastBargeIn.speechDetectedAt
      : null;

  const fadeToSilenceMs =
    timestamps.lastAudioSilent && timestamps.lastFadeStarted
      ? timestamps.lastAudioSilent - timestamps.lastFadeStarted
      : null;

  const totalLatencyMs =
    timestamps.lastAudioSilent && lastBargeIn.speechDetectedAt
      ? timestamps.lastAudioSilent - lastBargeIn.speechDetectedAt
      : lastBargeIn.latencyMs; // Fall back to recorded latency

  return {
    speechDetectedAt: lastBargeIn.speechDetectedAt,
    fadeStartedAt: timestamps.lastFadeStarted,
    audioSilentAt: timestamps.lastAudioSilent,
    detectionToFadeMs,
    fadeToSilenceMs,
    totalLatencyMs,
    wasPlaying: lastBargeIn.wasPlaying,
    activeSourcesAtTrigger: lastBargeIn.activeSourcesAtTrigger,
  };
}

/**
 * Measure all barge-in latencies from the barge-in log.
 *
 * @param page - The Playwright page instance
 * @returns Array of barge-in latency metrics
 */
export async function measureAllBargeInLatencies(
  page: Page
): Promise<BargeInLatencyMetrics[]> {
  const harness = await getVoiceTestHarnessState(page);
  if (!harness || harness.bargeInLog.length === 0) {
    return [];
  }

  return harness.bargeInLog.map((entry) => ({
    speechDetectedAt: entry.speechDetectedAt,
    fadeStartedAt: entry.fadeStartedAt,
    audioSilentAt: entry.audioSilentAt,
    detectionToFadeMs:
      entry.fadeStartedAt && entry.speechDetectedAt
        ? entry.fadeStartedAt - entry.speechDetectedAt
        : null,
    fadeToSilenceMs:
      entry.audioSilentAt && entry.fadeStartedAt
        ? entry.audioSilentAt - entry.fadeStartedAt
        : null,
    totalLatencyMs: entry.latencyMs,
    wasPlaying: entry.wasPlaying,
    activeSourcesAtTrigger: entry.activeSourcesAtTrigger,
  }));
}

// ============================================================================
// TTFA (Time To First Audio) Measurement
// ============================================================================

/**
 * TTFA metrics from a conversation turn.
 */
export interface TTFAMetrics {
  /** Timestamp when user speech ended */
  userSpeechEndAt: number | null;
  /** Timestamp when AI first audio chunk was scheduled */
  firstAudioAt: number | null;
  /** Time from user speech end to first AI audio */
  ttfaMs: number | null;
}

/**
 * Measure TTFA from the current test harness state.
 * Note: This requires tracking user speech end time, which may need
 * additional instrumentation in the VAD callbacks.
 *
 * @param page - The Playwright page instance
 * @returns TTFA metrics, or null if not measurable
 */
export async function measureTTFA(page: Page): Promise<TTFAMetrics | null> {
  const harness = await getVoiceTestHarnessState(page);
  if (!harness) {
    return null;
  }

  const { timestamps } = harness;

  // TTFA requires knowing when user speech ended
  // For now, use lastReset as a proxy (reset happens after barge-in)
  // TODO: Add user speech end tracking to the test harness
  const userSpeechEndAt = timestamps.lastReset;
  const firstAudioAt = timestamps.playbackStarted;

  const ttfaMs =
    firstAudioAt && userSpeechEndAt
      ? firstAudioAt - userSpeechEndAt
      : null;

  return {
    userSpeechEndAt,
    firstAudioAt,
    ttfaMs,
  };
}

// ============================================================================
// Latency Assertions
// ============================================================================

/**
 * Result of a latency assertion.
 */
export interface LatencyAssertionResult {
  /** Whether all assertions passed */
  pass: boolean;
  /** List of failed assertions with details */
  failures: string[];
  /** Actual metrics measured */
  metrics: {
    bargeInLatencyMs?: number | null;
    detectionToFadeMs?: number | null;
    fadeToSilenceMs?: number | null;
    ttfaMs?: number | null;
  };
}

/**
 * Assert that barge-in latency meets targets.
 *
 * @param page - The Playwright page instance
 * @param targets - Optional custom targets (defaults to LATENCY_TARGETS.bargeIn)
 * @returns Assertion result with pass/fail and details
 */
export async function assertBargeInLatency(
  page: Page,
  targets?: Partial<typeof LATENCY_TARGETS.bargeIn>
): Promise<LatencyAssertionResult> {
  const mergedTargets = { ...LATENCY_TARGETS.bargeIn, ...targets };
  const metrics = await measureBargeInLatency(page);

  const failures: string[] = [];

  if (!metrics) {
    return {
      pass: false,
      failures: ["No barge-in event recorded"],
      metrics: {},
    };
  }

  if (metrics.totalLatencyMs !== null) {
    if (metrics.totalLatencyMs > mergedTargets.p50) {
      failures.push(
        `Barge-in latency ${metrics.totalLatencyMs.toFixed(1)}ms exceeds P50 target ${mergedTargets.p50}ms`
      );
    }
  }

  if (metrics.detectionToFadeMs !== null) {
    if (metrics.detectionToFadeMs > mergedTargets.detectionToFade) {
      failures.push(
        `Detection-to-fade latency ${metrics.detectionToFadeMs.toFixed(1)}ms exceeds target ${mergedTargets.detectionToFade}ms`
      );
    }
  }

  if (metrics.fadeToSilenceMs !== null) {
    if (metrics.fadeToSilenceMs > mergedTargets.fadeToSilence) {
      failures.push(
        `Fade-to-silence latency ${metrics.fadeToSilenceMs.toFixed(1)}ms exceeds target ${mergedTargets.fadeToSilence}ms`
      );
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    metrics: {
      bargeInLatencyMs: metrics.totalLatencyMs,
      detectionToFadeMs: metrics.detectionToFadeMs,
      fadeToSilenceMs: metrics.fadeToSilenceMs,
    },
  };
}

/**
 * Assert that TTFA meets targets.
 *
 * @param page - The Playwright page instance
 * @param targets - Optional custom targets (defaults to LATENCY_TARGETS.ttfa)
 * @returns Assertion result with pass/fail and details
 */
export async function assertTTFA(
  page: Page,
  targets?: Partial<typeof LATENCY_TARGETS.ttfa>
): Promise<LatencyAssertionResult> {
  const mergedTargets = { ...LATENCY_TARGETS.ttfa, ...targets };
  const metrics = await measureTTFA(page);

  const failures: string[] = [];

  if (!metrics || metrics.ttfaMs === null) {
    return {
      pass: false,
      failures: ["Unable to measure TTFA - missing timestamps"],
      metrics: {},
    };
  }

  if (metrics.ttfaMs > mergedTargets.p50) {
    failures.push(
      `TTFA ${metrics.ttfaMs.toFixed(1)}ms exceeds P50 target ${mergedTargets.p50}ms`
    );
  }

  return {
    pass: failures.length === 0,
    failures,
    metrics: {
      ttfaMs: metrics.ttfaMs,
    },
  };
}

// ============================================================================
// Latency Statistics
// ============================================================================

/**
 * Calculate percentile from sorted array of numbers.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Latency statistics summary.
 */
export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p90: number;
  p99: number;
  values: number[];
}

/**
 * Calculate statistics from an array of latency values.
 */
export function calculateLatencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p90: 0,
      p99: 0,
      values: [],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    values: sorted,
  };
}

/**
 * Get comprehensive barge-in latency statistics from all recorded events.
 *
 * @param page - The Playwright page instance
 * @returns Statistics for barge-in latency metrics
 */
export async function getBargeInLatencyStats(page: Page): Promise<{
  totalLatency: LatencyStats;
  detectionToFade: LatencyStats;
  fadeToSilence: LatencyStats;
}> {
  const allLatencies = await measureAllBargeInLatencies(page);

  const totalLatencies = allLatencies
    .map((m) => m.totalLatencyMs)
    .filter((v): v is number => v !== null);

  const detectionToFadeLatencies = allLatencies
    .map((m) => m.detectionToFadeMs)
    .filter((v): v is number => v !== null);

  const fadeToSilenceLatencies = allLatencies
    .map((m) => m.fadeToSilenceMs)
    .filter((v): v is number => v !== null);

  return {
    totalLatency: calculateLatencyStats(totalLatencies),
    detectionToFade: calculateLatencyStats(detectionToFadeLatencies),
    fadeToSilence: calculateLatencyStats(fadeToSilenceLatencies),
  };
}

// ============================================================================
// Latency Report Generation
// ============================================================================

/**
 * Generate a human-readable latency report.
 *
 * @param page - The Playwright page instance
 * @returns Formatted latency report string
 */
export async function generateLatencyReport(page: Page): Promise<string> {
  const stats = await getBargeInLatencyStats(page);
  const harness = await getVoiceTestHarnessState(page);

  const lines: string[] = [
    "=== Voice Latency Report ===",
    "",
    "Barge-in Events: " + (harness?.bargeInLog.length || 0),
    "",
    "--- Total Barge-in Latency (speech → audio silent) ---",
    `  Samples: ${stats.totalLatency.count}`,
    `  P50: ${stats.totalLatency.median.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.p50}ms)`,
    `  P90: ${stats.totalLatency.p90.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.p90}ms)`,
    `  P99: ${stats.totalLatency.p99.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.p99}ms)`,
    `  Min: ${stats.totalLatency.min.toFixed(1)}ms`,
    `  Max: ${stats.totalLatency.max.toFixed(1)}ms`,
    "",
    "--- Detection → Fade Start ---",
    `  Samples: ${stats.detectionToFade.count}`,
    `  P50: ${stats.detectionToFade.median.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.detectionToFade}ms)`,
    `  Mean: ${stats.detectionToFade.mean.toFixed(1)}ms`,
    "",
    "--- Fade Start → Audio Silent ---",
    `  Samples: ${stats.fadeToSilence.count}`,
    `  P50: ${stats.fadeToSilence.median.toFixed(1)}ms (target: ${LATENCY_TARGETS.bargeIn.fadeToSilence}ms)`,
    `  Mean: ${stats.fadeToSilence.mean.toFixed(1)}ms`,
    "",
  ];

  // Add target comparison
  if (stats.totalLatency.count > 0) {
    const p50Pass = stats.totalLatency.median <= LATENCY_TARGETS.bargeIn.p50;
    const p90Pass = stats.totalLatency.p90 <= LATENCY_TARGETS.bargeIn.p90;

    lines.push("--- Target Comparison ---");
    lines.push(`  P50: ${p50Pass ? "✓ PASS" : "✗ FAIL"}`);
    lines.push(`  P90: ${p90Pass ? "✓ PASS" : "✗ FAIL"}`);
  }

  return lines.join("\n");
}

/**
 * Wait for barge-in to complete and measure its latency.
 * This is a convenience function for tests that trigger barge-in
 * and want to verify it completed within latency targets.
 *
 * @param page - The Playwright page instance
 * @param initialBargeInCount - Barge-in count before triggering
 * @param timeout - Maximum time to wait for barge-in to complete
 * @returns Object with barge-in status and latency metrics
 */
export async function waitForBargeInAndMeasure(
  page: Page,
  initialBargeInCount: number,
  timeout = 5000
): Promise<{
  completed: boolean;
  latencyMetrics: BargeInLatencyMetrics | null;
  meetsTargets: boolean;
  failures: string[];
}> {
  const startTime = Date.now();

  // Wait for barge-in count to increase
  while (Date.now() - startTime < timeout) {
    const harness = await getVoiceTestHarnessState(page);
    if (harness && harness.metrics.bargeInCount > initialBargeInCount) {
      // Barge-in triggered, now measure latency
      const latencyMetrics = await measureBargeInLatency(page);
      const assertion = await assertBargeInLatency(page);

      return {
        completed: true,
        latencyMetrics,
        meetsTargets: assertion.pass,
        failures: assertion.failures,
      };
    }
    await page.waitForTimeout(100);
  }

  return {
    completed: false,
    latencyMetrics: null,
    meetsTargets: false,
    failures: ["Barge-in did not complete within timeout"],
  };
}
