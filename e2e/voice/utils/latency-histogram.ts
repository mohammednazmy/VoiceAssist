/**
 * LatencyHistogram
 *
 * Test-only utility for collecting and analyzing latency measurements
 * in voice mode E2E tests. Provides statistical analysis (P50/P90/P99),
 * ASCII histogram visualization, and target assertions.
 *
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 *
 * This should only be used from Playwright tests under e2e/.
 */

export interface HistogramBucket {
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number; // P50
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
  histogram: HistogramBucket[];
}

export interface LatencyTargets {
  p50?: number;
  p90?: number;
  p99?: number;
  max?: number;
}

export interface TargetAssertionResult {
  pass: boolean;
  failures: string[];
  stats: LatencyStats;
}

export class LatencyHistogram {
  private samples: number[] = [];
  private name: string;
  private bucketSize: number;

  constructor(name: string, bucketSize: number = 50) {
    this.name = name;
    this.bucketSize = bucketSize;
  }

  /**
   * Add a single latency sample.
   */
  addSample(latencyMs: number): void {
    if (latencyMs >= 0) {
      this.samples.push(latencyMs);
    }
  }

  /**
   * Add multiple latency samples.
   */
  addSamples(latencies: number[]): void {
    for (const latency of latencies) {
      this.addSample(latency);
    }
  }

  /**
   * Clear all samples.
   */
  clear(): void {
    this.samples = [];
  }

  /**
   * Get the number of samples collected.
   */
  getSampleCount(): number {
    return this.samples.length;
  }

  /**
   * Get all raw samples.
   */
  getRawSamples(): number[] {
    return [...this.samples];
  }

  /**
   * Calculate comprehensive statistics.
   */
  getStats(): LatencyStats {
    if (this.samples.length === 0) {
      return this.emptyStats();
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: this.mean(sorted),
      median: this.percentile(sorted, 50),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      stdDev: this.stdDev(sorted),
      histogram: this.buildHistogram(sorted),
    };
  }

  /**
   * Calculate a specific percentile.
   */
  getPercentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return this.percentile(sorted, p);
  }

  /**
   * Assert that latency targets are met.
   */
  assertTargets(targets: LatencyTargets): TargetAssertionResult {
    const stats = this.getStats();
    const failures: string[] = [];

    if (targets.p50 !== undefined && stats.median > targets.p50) {
      failures.push(`P50 ${stats.median.toFixed(1)}ms > target ${targets.p50}ms`);
    }
    if (targets.p90 !== undefined && stats.p90 > targets.p90) {
      failures.push(`P90 ${stats.p90.toFixed(1)}ms > target ${targets.p90}ms`);
    }
    if (targets.p99 !== undefined && stats.p99 > targets.p99) {
      failures.push(`P99 ${stats.p99.toFixed(1)}ms > target ${targets.p99}ms`);
    }
    if (targets.max !== undefined && stats.max > targets.max) {
      failures.push(`Max ${stats.max.toFixed(1)}ms > target ${targets.max}ms`);
    }

    return { pass: failures.length === 0, failures, stats };
  }

  /**
   * Format stats as ASCII histogram for test output.
   */
  formatHistogram(maxWidth: number = 40): string {
    const stats = this.getStats();

    if (stats.count === 0) {
      return `=== ${this.name} Latency Histogram ===\nNo samples collected.`;
    }

    const lines: string[] = [
      `=== ${this.name} Latency Histogram ===`,
      `Samples: ${stats.count}`,
      `Range: ${stats.min.toFixed(1)}ms - ${stats.max.toFixed(1)}ms`,
      `Mean: ${stats.mean.toFixed(1)}ms, StdDev: ${stats.stdDev.toFixed(1)}ms`,
      `P50: ${stats.median.toFixed(1)}ms, P90: ${stats.p90.toFixed(1)}ms, P99: ${stats.p99.toFixed(1)}ms`,
      "",
    ];

    if (stats.histogram.length === 0) {
      lines.push("No histogram buckets.");
      return lines.join("\n");
    }

    const maxCount = Math.max(...stats.histogram.map((b) => b.count));

    for (const bucket of stats.histogram) {
      const barLength = maxCount > 0 ? Math.round((bucket.count / maxCount) * maxWidth) : 0;
      const bar = "█".repeat(barLength);
      const label = `${bucket.min}-${bucket.max}ms`.padStart(12);
      const count = `(${bucket.count})`.padStart(6);
      const pct = `${bucket.percentage.toFixed(1)}%`.padStart(6);
      lines.push(`${label} ${bar} ${count} ${pct}`);
    }

    return lines.join("\n");
  }

  /**
   * Format a compact single-line summary.
   */
  formatSummary(): string {
    const stats = this.getStats();
    if (stats.count === 0) {
      return `${this.name}: No samples`;
    }
    return (
      `${this.name}: n=${stats.count}, ` +
      `P50=${stats.median.toFixed(0)}ms, ` +
      `P90=${stats.p90.toFixed(0)}ms, ` +
      `P99=${stats.p99.toFixed(0)}ms`
    );
  }

  /**
   * Convert to JSON for reporting.
   */
  toJSON(): object {
    return {
      name: this.name,
      ...this.getStats(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  private buildHistogram(sorted: number[]): HistogramBucket[] {
    if (sorted.length === 0) return [];

    const buckets: Map<number, number> = new Map();
    const total = sorted.length;

    for (const sample of sorted) {
      const bucketKey = Math.floor(sample / this.bucketSize) * this.bucketSize;
      buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + 1);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([min, count]) => ({
        min,
        max: min + this.bucketSize,
        count,
        percentage: (count / total) * 100,
      }));
  }

  private emptyStats(): LatencyStats {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      stdDev: 0,
      histogram: [],
    };
  }
}

// =============================================================================
// Predefined Latency Targets from V3 Plan
// =============================================================================

/**
 * Target latencies for barge-in improvements (from V3 plan).
 */
export const LATENCY_TARGETS = {
  /**
   * Time from VAD speech detection to audio mute.
   * This is the most critical metric for responsive barge-in.
   */
  bargeIn: {
    p50: 150,
    p90: 250,
    p99: 400,
    description: "Time from VAD speech detection to audio mute",
  },

  /**
   * Time To First Audio after user finishes speaking.
   * Measures how quickly the AI starts responding.
   */
  ttfa: {
    p50: 800,
    p90: 1500,
    p99: 2500,
    description: "Time To First Audio after user finishes speaking",
  },

  /**
   * End-to-end latency from user speech end to AI first word.
   * The comprehensive measure of voice conversation responsiveness.
   */
  e2e: {
    p50: 1200,
    p90: 2000,
    p99: 3500,
    description: "End-to-end from user speech end to AI first word",
  },

  /**
   * Time from barge-in start to STT transcript available.
   * Important for quick processing of user interruption.
   */
  bargeInToTranscript: {
    p50: 200,
    p90: 400,
    p99: 800,
    description: "Time from barge-in to user transcript available",
  },

  /**
   * Audio fade-out duration during barge-in.
   * Should be fast but smooth.
   */
  audioFadeOut: {
    p50: 30,
    p90: 50,
    p99: 100,
    description: "Audio fade-out duration during barge-in",
  },
} as const;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a histogram for barge-in latency measurement.
 */
export function createBargeInHistogram(): LatencyHistogram {
  return new LatencyHistogram("Barge-in", 25);
}

/**
 * Create a histogram for TTFA measurement.
 */
export function createTTFAHistogram(): LatencyHistogram {
  return new LatencyHistogram("TTFA", 100);
}

/**
 * Create a histogram for E2E latency measurement.
 */
export function createE2EHistogram(): LatencyHistogram {
  return new LatencyHistogram("End-to-End", 100);
}
