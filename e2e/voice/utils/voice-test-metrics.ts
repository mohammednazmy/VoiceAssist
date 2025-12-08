/**
 * Voice Test Metrics Capture Framework
 *
 * Provides comprehensive logging and metrics capture for voice mode E2E tests.
 * Captures VAD events, audio playback state, barge-in events, and state transitions.
 */

import type { Page, ConsoleMessage } from "@playwright/test";

// ============================================================================
// Types
// ============================================================================

export interface VADEvent {
  time: number;
  type: "speech_start" | "speech_end" | "silence" | "probability";
  source: "silero" | "deepgram" | "hybrid";
  probability?: number;
  threshold?: number;
  isPlayback?: boolean;
}

export interface AudioEvent {
  time: number;
  type:
    | "chunk_received"
    | "chunk_scheduled"
    | "playback_start"
    | "playback_stop"
    | "playback_interrupted"
    | "fadeout_start"
    | "fadeout_complete"
    | "queue_overflow"
    | "schedule_reset";
  queueLength?: number;
  queueDurationMs?: number;
  scheduledAheadMs?: number;
  chunkId?: string;
}

export interface BargeInEvent {
  time: number;
  type: "triggered" | "classified" | "executed" | "cancelled";
  classification?: "backchannel" | "soft_barge" | "hard_barge" | "unclear";
  vadConfidence?: number;
  transcript?: string;
  latencyMs?: number;
}

export interface TranscriptEvent {
  time: number;
  type: "user_partial" | "user_final" | "ai_partial" | "ai_final" | "ai_truncated";
  text: string;
  isFinal: boolean;
}

export interface StateTransition {
  time: number;
  from: string;
  to: string;
  trigger?: string;
}

export interface VoiceTestMetrics {
  startTime: number;
  vadEvents: VADEvent[];
  audioEvents: AudioEvent[];
  bargeInEvents: BargeInEvent[];
  transcriptEvents: TranscriptEvent[];
  stateTransitions: StateTransition[];
  errors: Array<{ time: number; message: string }>;
  rawLogs: Array<{ time: number; type: string; text: string }>;
}

export interface ConversationMetrics {
  totalTurns: number;
  userUtterances: number;
  aiResponses: number;
  bargeInAttempts: number;
  successfulBargeIns: number;
  falseBargeIns: number;
  audioInterruptions: number;
  averageResponseLatencyMs: number;
  averageBargeInLatencyMs: number;
  queueOverflows: number;
  scheduleResets: number;
  errors: number;
}

// ============================================================================
// Metrics Collector Class
// ============================================================================

export class VoiceMetricsCollector {
  private metrics: VoiceTestMetrics;
  private page: Page | null = null;
  private consoleHandler: ((msg: ConsoleMessage) => void) | null = null;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  private createEmptyMetrics(): VoiceTestMetrics {
    return {
      startTime: Date.now(),
      vadEvents: [],
      audioEvents: [],
      bargeInEvents: [],
      transcriptEvents: [],
      stateTransitions: [],
      errors: [],
      rawLogs: [],
    };
  }

  /**
   * Attach to a Playwright page and start collecting metrics
   */
  attach(page: Page): void {
    this.page = page;
    this.metrics = this.createEmptyMetrics();

    this.consoleHandler = (msg: ConsoleMessage) => {
      this.processConsoleMessage(msg);
    };

    page.on("console", this.consoleHandler);

    page.on("pageerror", (error) => {
      this.metrics.errors.push({
        time: this.getRelativeTime(),
        message: `Page error: ${error.message}`,
      });
    });
  }

  /**
   * Detach from the page and stop collecting
   */
  detach(): void {
    if (this.page && this.consoleHandler) {
      this.page.off("console", this.consoleHandler);
    }
    this.page = null;
    this.consoleHandler = null;
  }

  /**
   * Reset metrics for a new test
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Get the current timestamp relative to start
   */
  private getRelativeTime(): number {
    return Date.now() - this.metrics.startTime;
  }

  /**
   * Process a console message and extract relevant metrics
   */
  private processConsoleMessage(msg: ConsoleMessage): void {
    const text = msg.text();
    const time = this.getRelativeTime();
    const type = msg.type();

    // Store raw log for debugging
    this.metrics.rawLogs.push({ time, type, text });

    // Handle errors
    if (type === "error") {
      this.metrics.errors.push({ time, message: text });
    }

    // Parse VAD events
    this.parseVADEvents(text, time);

    // Parse audio events
    this.parseAudioEvents(text, time);

    // Parse barge-in events
    this.parseBargeInEvents(text, time);

    // Parse transcript events
    this.parseTranscriptEvents(text, time);

    // Parse state transitions
    this.parseStateTransitions(text, time);
  }

  private parseVADEvents(text: string, time: number): void {
    // Silero VAD events
    if (text.includes("[SileroVAD]") || text.includes("silero")) {
      if (text.includes("speech") && (text.includes("start") || text.includes("detected"))) {
        this.metrics.vadEvents.push({
          time,
          type: "speech_start",
          source: "silero",
          isPlayback: text.includes("playback") || text.includes("Playback"),
        });
      }
      if (text.includes("silence") || text.includes("speech") && text.includes("end")) {
        this.metrics.vadEvents.push({
          time,
          type: "speech_end",
          source: "silero",
        });
      }
      // Extract probability if present
      const probMatch = text.match(/probability[:\s]+(\d+\.?\d*)/i);
      if (probMatch) {
        const threshMatch = text.match(/threshold[:\s]+(\d+\.?\d*)/i);
        this.metrics.vadEvents.push({
          time,
          type: "probability",
          source: "silero",
          probability: parseFloat(probMatch[1]),
          threshold: threshMatch ? parseFloat(threshMatch[1]) : undefined,
          isPlayback: text.includes("playback") || text.includes("Playback"),
        });
      }
    }

    // Deepgram VAD events
    if (text.includes("speech_started") || text.includes("SpeechStarted")) {
      this.metrics.vadEvents.push({
        time,
        type: "speech_start",
        source: "deepgram",
      });
    }

    // Backend VAD events
    if (text.includes("Backend VAD") || text.includes("backend.*vad")) {
      if (text.includes("speech") && text.includes("detect")) {
        this.metrics.vadEvents.push({
          time,
          type: "speech_start",
          source: "deepgram",
        });
      }
    }
  }

  private parseAudioEvents(text: string, time: number): void {
    // Audio playback events
    if (text.includes("[TTAudioPlayback]") || text.includes("playback")) {
      if (text.includes("start") && !text.includes("speech")) {
        this.metrics.audioEvents.push({
          time,
          type: "playback_start",
        });
      }
      if (text.includes("stop") || text.includes("Stopping")) {
        const isBageIn = text.includes("barge") || text.includes("interrupt");
        this.metrics.audioEvents.push({
          time,
          type: isBageIn ? "playback_interrupted" : "playback_stop",
        });
      }
      if (text.includes("fadeOut") || text.includes("fade")) {
        const isComplete = text.includes("complete") || text.includes("finished");
        this.metrics.audioEvents.push({
          time,
          type: isComplete ? "fadeout_complete" : "fadeout_start",
        });
      }

      // Queue metrics
      const queueMatch = text.match(/queue.*?(\d+)\s*chunks?/i);
      const durationMatch = text.match(/(\d+\.?\d*)\s*ms.*queue/i);
      if (queueMatch || durationMatch) {
        this.metrics.audioEvents.push({
          time,
          type: "chunk_scheduled",
          queueLength: queueMatch ? parseInt(queueMatch[1]) : undefined,
          queueDurationMs: durationMatch ? parseFloat(durationMatch[1]) : undefined,
        });
      }

      // Queue overflow
      if (text.includes("overflow") || text.includes("trimming")) {
        this.metrics.audioEvents.push({
          time,
          type: "queue_overflow",
        });
      }

      // Schedule reset
      if (text.includes("schedule") && text.includes("reset")) {
        this.metrics.audioEvents.push({
          time,
          type: "schedule_reset",
        });
      }
    }

    // Watchdog events
    if (text.includes("Watchdog") || text.includes("watchdog")) {
      if (text.includes("stuck") || text.includes("reset")) {
        this.metrics.audioEvents.push({
          time,
          type: "schedule_reset",
        });
      }
    }
  }

  private parseBargeInEvents(text: string, time: number): void {
    const lowerText = text.toLowerCase();

    if (lowerText.includes("barge")) {
      // Barge-in triggered
      if (lowerText.includes("triggered") || lowerText.includes("detecting")) {
        const confMatch = text.match(/confidence[:\s]+(\d+\.?\d*)/i);
        this.metrics.bargeInEvents.push({
          time,
          type: "triggered",
          vadConfidence: confMatch ? parseFloat(confMatch[1]) : undefined,
        });
      }

      // Barge-in classified
      if (lowerText.includes("classif")) {
        let classification: BargeInEvent["classification"];
        if (lowerText.includes("backchannel")) classification = "backchannel";
        else if (lowerText.includes("soft")) classification = "soft_barge";
        else if (lowerText.includes("hard")) classification = "hard_barge";
        else classification = "unclear";

        this.metrics.bargeInEvents.push({
          time,
          type: "classified",
          classification,
        });
      }

      // Barge-in executed
      if (lowerText.includes("execut") || lowerText.includes("stopping playback")) {
        this.metrics.bargeInEvents.push({
          time,
          type: "executed",
        });
      }

      // Barge-in cancelled (misfire rollback)
      if (lowerText.includes("cancel") || lowerText.includes("rollback") || lowerText.includes("misfire")) {
        this.metrics.bargeInEvents.push({
          time,
          type: "cancelled",
        });
      }
    }
  }

  private parseTranscriptEvents(text: string, time: number): void {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("transcript") || lowerText.includes("response")) {
      // User transcripts
      if (lowerText.includes("user")) {
        const isFinal = text.includes("final") || text.includes("Final");
        const textMatch = text.match(/['"](.*?)['"]/);
        this.metrics.transcriptEvents.push({
          time,
          type: isFinal ? "user_final" : "user_partial",
          text: textMatch ? textMatch[1] : "",
          isFinal,
        });
      }

      // AI transcripts
      if (
        lowerText.includes("ai") ||
        lowerText.includes("assistant") ||
        lowerText.includes("response")
      ) {
        const isFinal = text.includes("final") || text.includes("complete");
        const isTruncated = text.includes("truncat");
        const textMatch = text.match(/['"](.*?)['"]/);
        this.metrics.transcriptEvents.push({
          time,
          type: isTruncated ? "ai_truncated" : (isFinal ? "ai_final" : "ai_partial"),
          text: textMatch ? textMatch[1] : "",
          isFinal: isFinal || isTruncated,
        });
      }
    }
  }

  private parseStateTransitions(text: string, time: number): void {
    // Pipeline state transitions
    const stateMatch = text.match(/(?:state|pipeline|pipelineState).*?(?:->|to|:)\s*(idle|listening|processing|speaking|thinking)/i);
    if (stateMatch) {
      const newState = stateMatch[1].toLowerCase();
      const lastTransition = this.metrics.stateTransitions[this.metrics.stateTransitions.length - 1];
      const from = lastTransition ? lastTransition.to : "unknown";

      if (from !== newState) {
        this.metrics.stateTransitions.push({
          time,
          from,
          to: newState,
        });
      }
    }

    // Voice mode state
    if (text.includes("Voice state") || text.includes("voiceState")) {
      const states = ["idle", "connecting", "listening", "speaking", "processing"];
      for (const state of states) {
        if (text.includes(state)) {
          const lastTransition = this.metrics.stateTransitions[this.metrics.stateTransitions.length - 1];
          const from = lastTransition ? lastTransition.to : "unknown";
          if (from !== state) {
            this.metrics.stateTransitions.push({
              time,
              from,
              to: state,
            });
          }
          break;
        }
      }
    }
  }

  // ============================================================================
  // Public API - Get Metrics
  // ============================================================================

  /**
   * Get all collected metrics
   */
  getMetrics(): VoiceTestMetrics {
    return { ...this.metrics };
  }

  /**
   * Get computed conversation metrics
   */
  getConversationMetrics(): ConversationMetrics {
    const metrics = this.metrics;

    // Count user utterances (final transcripts)
    const userUtterances = metrics.transcriptEvents.filter(
      (e) => e.type === "user_final"
    ).length;

    // Count AI responses
    const aiResponses = metrics.transcriptEvents.filter(
      (e) => e.type === "ai_final" || e.type === "ai_truncated"
    ).length;

    // Barge-in analysis
    const bargeInAttempts = metrics.bargeInEvents.filter(
      (e) => e.type === "triggered"
    ).length;
    const successfulBargeIns = metrics.bargeInEvents.filter(
      (e) => e.type === "executed"
    ).length;
    const falseBargeIns = metrics.bargeInEvents.filter(
      (e) => e.type === "cancelled"
    ).length;

    // Audio interruptions
    const audioInterruptions = metrics.audioEvents.filter(
      (e) => e.type === "playback_interrupted"
    ).length;

    // Queue issues
    const queueOverflows = metrics.audioEvents.filter(
      (e) => e.type === "queue_overflow"
    ).length;
    const scheduleResets = metrics.audioEvents.filter(
      (e) => e.type === "schedule_reset"
    ).length;

    // Calculate latencies
    const responseTimes: number[] = [];
    const bargeInTimes: number[] = [];

    // Response latency: time from user_final to ai_partial
    let lastUserFinal = 0;
    for (const event of metrics.transcriptEvents) {
      if (event.type === "user_final") {
        lastUserFinal = event.time;
      } else if (event.type === "ai_partial" && lastUserFinal > 0) {
        responseTimes.push(event.time - lastUserFinal);
        lastUserFinal = 0;
      }
    }

    // Barge-in latency: time from triggered to executed
    let lastTrigger = 0;
    for (const event of metrics.bargeInEvents) {
      if (event.type === "triggered") {
        lastTrigger = event.time;
      } else if (event.type === "executed" && lastTrigger > 0) {
        bargeInTimes.push(event.time - lastTrigger);
        lastTrigger = 0;
      }
    }

    const avgResponse = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const avgBargeIn = bargeInTimes.length > 0
      ? bargeInTimes.reduce((a, b) => a + b, 0) / bargeInTimes.length
      : 0;

    return {
      totalTurns: Math.max(userUtterances, aiResponses),
      userUtterances,
      aiResponses,
      bargeInAttempts,
      successfulBargeIns,
      falseBargeIns,
      audioInterruptions,
      averageResponseLatencyMs: avgResponse,
      averageBargeInLatencyMs: avgBargeIn,
      queueOverflows,
      scheduleResets,
      errors: metrics.errors.length,
    };
  }

  /**
   * Get VAD events during playback only
   */
  getPlaybackVADEvents(): VADEvent[] {
    return this.metrics.vadEvents.filter((e) => e.isPlayback);
  }

  /**
   * Get a summary for logging
   */
  getSummary(): string {
    const conv = this.getConversationMetrics();
    const lines = [
      "=== Voice Test Metrics Summary ===",
      `Duration: ${this.getRelativeTime()}ms`,
      `Turns: ${conv.totalTurns} (user: ${conv.userUtterances}, AI: ${conv.aiResponses})`,
      `Barge-ins: ${conv.bargeInAttempts} attempts, ${conv.successfulBargeIns} successful, ${conv.falseBargeIns} cancelled`,
      `Audio: ${conv.audioInterruptions} interruptions, ${conv.queueOverflows} overflows, ${conv.scheduleResets} resets`,
      `Latency: ${conv.averageResponseLatencyMs.toFixed(0)}ms avg response, ${conv.averageBargeInLatencyMs.toFixed(0)}ms avg barge-in`,
      `Errors: ${conv.errors}`,
      `State transitions: ${this.metrics.stateTransitions.length}`,
      `Raw logs: ${this.metrics.rawLogs.length}`,
    ];
    return lines.join("\n");
  }

  /**
   * Assert that certain quality criteria are met
   */
  assertQuality(options: {
    maxQueueOverflows?: number;
    maxScheduleResets?: number;
    maxErrors?: number;
    maxFalseBargeIns?: number;
    maxResponseLatencyMs?: number;
    maxBargeInLatencyMs?: number;
  }): { pass: boolean; failures: string[] } {
    const conv = this.getConversationMetrics();
    const failures: string[] = [];

    if (options.maxQueueOverflows !== undefined && conv.queueOverflows > options.maxQueueOverflows) {
      failures.push(`Queue overflows: ${conv.queueOverflows} > ${options.maxQueueOverflows}`);
    }

    if (options.maxScheduleResets !== undefined && conv.scheduleResets > options.maxScheduleResets) {
      failures.push(`Schedule resets: ${conv.scheduleResets} > ${options.maxScheduleResets}`);
    }

    if (options.maxErrors !== undefined && conv.errors > options.maxErrors) {
      failures.push(`Errors: ${conv.errors} > ${options.maxErrors}`);
    }

    if (options.maxFalseBargeIns !== undefined && conv.falseBargeIns > options.maxFalseBargeIns) {
      failures.push(`False barge-ins: ${conv.falseBargeIns} > ${options.maxFalseBargeIns}`);
    }

    if (options.maxResponseLatencyMs !== undefined && conv.averageResponseLatencyMs > options.maxResponseLatencyMs) {
      failures.push(`Response latency: ${conv.averageResponseLatencyMs.toFixed(0)}ms > ${options.maxResponseLatencyMs}ms`);
    }

    if (options.maxBargeInLatencyMs !== undefined && conv.averageBargeInLatencyMs > options.maxBargeInLatencyMs) {
      failures.push(`Barge-in latency: ${conv.averageBargeInLatencyMs.toFixed(0)}ms > ${options.maxBargeInLatencyMs}ms`);
    }

    return {
      pass: failures.length === 0,
      failures,
    };
  }
}

// ============================================================================
// Factory function for easy use in tests
// ============================================================================

/**
 * Create and attach a metrics collector to a page
 */
export function createMetricsCollector(page: Page): VoiceMetricsCollector {
  const collector = new VoiceMetricsCollector();
  collector.attach(page);
  return collector;
}
