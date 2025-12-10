/**
 * Voice Timeout Configuration
 *
 * Centralized timeout constants for voice features.
 * All timeouts are in milliseconds unless otherwise noted.
 *
 * Phase: Voice Feature Hardening
 */

// ============================================================================
// Timeout Constants
// ============================================================================

export const VOICE_TIMEOUTS = {
  // -------------------------------------------------------------------------
  // Connection Phase
  // -------------------------------------------------------------------------

  /** Time to establish WebSocket connection (ms) */
  WS_CONNECT_MS: 10_000,

  /** Time to receive session.ready after WebSocket connects (ms) */
  SESSION_INIT_MS: 5_000,

  /** Total time from connect() call to ready state (ms) */
  TOTAL_CONNECT_MS: 15_000,

  // -------------------------------------------------------------------------
  // Operation Timeouts
  // -------------------------------------------------------------------------

  /** Time to receive first audio byte after speaking ends (TTFA target) (ms) */
  FIRST_AUDIO_MS: 3_000,

  /** Time to receive first STT transcript after speech detected (ms) */
  FIRST_TRANSCRIPT_MS: 5_000,

  /** Time to receive first LLM token after transcript (ms) */
  LLM_FIRST_TOKEN_MS: 8_000,

  /** Time to receive first TTS audio after first LLM token (ms) */
  TTS_FIRST_AUDIO_MS: 2_000,

  // -------------------------------------------------------------------------
  // Heartbeat & Connection Quality
  // -------------------------------------------------------------------------

  /** Interval between heartbeat pings (ms) */
  HEARTBEAT_INTERVAL_MS: 15_000,

  /** Time to receive pong response before considering connection dead (ms) */
  HEARTBEAT_TIMEOUT_MS: 5_000,

  /** RTT threshold for warning about poor connection (ms) */
  RTT_WARNING_THRESHOLD_MS: 500,

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  /** Time before showing idle warning to user (ms) - 4 minutes */
  IDLE_WARNING_MS: 240_000,

  /** Time before auto-disconnecting idle session (ms) - 5 minutes */
  IDLE_DISCONNECT_MS: 300_000,

  /** Maximum session duration before auto-disconnect (ms) - 30 minutes */
  MAX_SESSION_MS: 1_800_000,

  // -------------------------------------------------------------------------
  // Reconnection
  // -------------------------------------------------------------------------

  /** Base delay for reconnection attempts (ms) */
  RECONNECT_BASE_MS: 300,

  /** Maximum delay between reconnection attempts (ms) */
  RECONNECT_MAX_MS: 30_000,

  /** Maximum number of reconnection attempts */
  RECONNECT_MAX_ATTEMPTS: 5,

  // -------------------------------------------------------------------------
  // Audio Processing
  // -------------------------------------------------------------------------

  /** Debounce time for audio chunk processing (ms) */
  AUDIO_CHUNK_DEBOUNCE_MS: 10,

  /** Time to wait before finalizing speech after silence (ms) */
  SPEECH_END_SILENCE_MS: 800,

  /** Maximum time to wait for additional speech (ms) */
  UTTERANCE_END_MS: 1_500,

  // -------------------------------------------------------------------------
  // UI/UX
  // -------------------------------------------------------------------------

  /** Time to show barge-in indicator (ms) */
  BARGE_IN_INDICATOR_MS: 2_000,

  /** Debounce time for UI state updates (ms) */
  UI_UPDATE_DEBOUNCE_MS: 50,

  /** Time to wait before showing "connecting" spinner (ms) */
  CONNECTING_DELAY_MS: 300,
} as const;

// Type for timeout keys
export type VoiceTimeoutKey = keyof typeof VOICE_TIMEOUTS;

// ============================================================================
// SLO Thresholds
// ============================================================================

export const VOICE_SLO_THRESHOLDS = {
  /** Total time to first audio - target (ms) */
  TTFA_TARGET_MS: 200,

  /** Total time to first audio - warning threshold (ms) */
  TTFA_WARNING_MS: 250,

  /** Total time to first audio - critical threshold (ms) */
  TTFA_CRITICAL_MS: 400,

  /** STT latency - target (ms) */
  STT_TARGET_MS: 150,

  /** STT latency - warning threshold (ms) */
  STT_WARNING_MS: 200,

  /** STT latency - critical threshold (ms) */
  STT_CRITICAL_MS: 400,

  /** Connection time - target (ms) */
  CONNECTION_TARGET_MS: 300,

  /** Connection time - warning threshold (ms) */
  CONNECTION_WARNING_MS: 400,

  /** Connection time - critical threshold (ms) */
  CONNECTION_CRITICAL_MS: 750,
} as const;

// Type for SLO threshold keys
export type VoiceSLOThresholdKey = keyof typeof VOICE_SLO_THRESHOLDS;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Custom error for voice timeouts
 */
export class VoiceTimeoutError extends Error {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`Voice operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = "VoiceTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Execute a promise with a timeout
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operation - Name of the operation (for error message)
 * @returns The result of the promise
 * @throws VoiceTimeoutError if the timeout is exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new VoiceTimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Calculate reconnection delay with exponential backoff
 *
 * @param attempt - The current attempt number (0-based)
 * @returns The delay in milliseconds
 */
export function calculateReconnectDelay(attempt: number): number {
  return Math.min(
    VOICE_TIMEOUTS.RECONNECT_BASE_MS * Math.pow(2, attempt),
    VOICE_TIMEOUTS.RECONNECT_MAX_MS,
  );
}

/**
 * Check if a latency value exceeds SLO thresholds
 *
 * @param metric - The SLO metric to check (e.g., "TTFA", "STT", "CONNECTION")
 * @param actualMs - The actual latency in milliseconds
 * @returns Object with violation info
 */
export function checkSLOViolation(
  metric: "TTFA" | "STT" | "CONNECTION",
  actualMs: number,
): {
  isViolation: boolean;
  severity: "ok" | "warning" | "critical";
  thresholdMs: number;
} {
  const targetKey = `${metric}_TARGET_MS` as VoiceSLOThresholdKey;
  const warningKey = `${metric}_WARNING_MS` as VoiceSLOThresholdKey;
  const criticalKey = `${metric}_CRITICAL_MS` as VoiceSLOThresholdKey;

  const target = VOICE_SLO_THRESHOLDS[targetKey];
  const warning = VOICE_SLO_THRESHOLDS[warningKey];
  const critical = VOICE_SLO_THRESHOLDS[criticalKey];

  if (actualMs >= critical) {
    return { isViolation: true, severity: "critical", thresholdMs: critical };
  }
  if (actualMs >= warning) {
    return { isViolation: true, severity: "warning", thresholdMs: warning };
  }
  if (actualMs >= target) {
    return { isViolation: false, severity: "ok", thresholdMs: target };
  }

  return { isViolation: false, severity: "ok", thresholdMs: target };
}

/**
 * Format a timeout duration for display
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2.5s", "150ms")
 */
export function formatTimeoutDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}
