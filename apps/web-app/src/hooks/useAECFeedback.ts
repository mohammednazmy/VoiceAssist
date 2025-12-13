/**
 * AEC Feedback Hook
 *
 * Monitors Acoustic Echo Cancellation (AEC) state via WebRTC stats API.
 * Provides feedback to VAD to prevent false speech detection from echo.
 *
 * When AEC is not converged (still learning the echo path), the VAD
 * threshold should be boosted to prevent echo-triggered barge-in.
 *
 * Natural Conversation Flow: Phase 4.3 - AEC Feedback Loop
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export type AECQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

export interface AECState {
  /** Whether AEC has converged (learned the echo path) */
  isConverged: boolean;
  /** Echo return loss enhancement in dB (higher = better) */
  erleDb: number | null;
  /** Categorical quality level derived from ERLE */
  quality: AECQuality;
  /** Whether AEC is active/processing */
  isActive: boolean;
  /** Last update timestamp */
  lastUpdateMs: number;
  /** Error message if stats unavailable */
  error: string | null;
}

export interface UseAECFeedbackOptions {
  /** Whether AEC feedback is enabled */
  enabled?: boolean;
  /** Polling interval in ms (default: 500ms) */
  pollingIntervalMs?: number;
  /** ERLE threshold to consider AEC converged (default: 10dB) */
  convergenceThresholdDb?: number;
  /** RTCPeerConnection to monitor (if using WebRTC) */
  peerConnection?: RTCPeerConnection | null;
  /** MediaStreamTrack to get AEC stats from */
  audioTrack?: MediaStreamTrack | null;
  /** Callback when AEC state changes */
  onAECStateChange?: (state: AECState) => void;
}

export interface UseAECFeedbackReturn {
  /** Current AEC state */
  aecState: AECState;
  /** Whether AEC is converged (shorthand) */
  isAECConverged: boolean;
  /** VAD threshold boost recommended based on AEC state */
  vadThresholdBoost: number;
  /** Start monitoring AEC */
  startMonitoring: (
    peerConnection?: RTCPeerConnection,
    audioTrack?: MediaStreamTrack,
  ) => void;
  /** Stop monitoring AEC */
  stopMonitoring: () => void;
  /** Whether monitoring is active */
  isMonitoring: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: Required<
  Omit<
    UseAECFeedbackOptions,
    "peerConnection" | "audioTrack" | "onAECStateChange"
  >
> = {
  enabled: true,
  pollingIntervalMs: 500,
  convergenceThresholdDb: 10, // ERLE > 10dB indicates good AEC convergence
};

// VAD boost when AEC is not converged (prevents echo-triggered speech detection)
const AEC_NOT_CONVERGED_VAD_BOOST = 0.1;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAECFeedback(
  options: UseAECFeedbackOptions = {},
): UseAECFeedbackReturn {
  const {
    enabled = DEFAULT_OPTIONS.enabled,
    pollingIntervalMs = DEFAULT_OPTIONS.pollingIntervalMs,
    convergenceThresholdDb = DEFAULT_OPTIONS.convergenceThresholdDb,
    peerConnection: initialPeerConnection = null,
    audioTrack: initialAudioTrack = null,
    onAECStateChange,
  } = options;

  // State
  const [aecState, setAECState] = useState<AECState>({
    isConverged: true, // Default to converged (assume good AEC)
    erleDb: null,
    quality: "unknown",
    isActive: false,
    lastUpdateMs: 0,
    error: null,
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(
    initialPeerConnection,
  );
  const audioTrackRef = useRef<MediaStreamTrack | null>(initialAudioTrack);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const onAECStateChangeRef = useRef(onAECStateChange);

  // Keep callback ref updated
  useEffect(() => {
    onAECStateChangeRef.current = onAECStateChange;
  }, [onAECStateChange]);

  // ==========================================================================
  // Stats Polling
  // ==========================================================================

  /**
   * Poll RTCPeerConnection stats for AEC information
   */
  const pollStats = useCallback(async () => {
    const pc = peerConnectionRef.current;
    const track = audioTrackRef.current;

    if (!pc && !track) {
      // No WebRTC connection or track available
      return;
    }

    try {
      let erleValue: number | null = null;
      let aecActive = false;

      // Try to get stats from RTCPeerConnection
      if (pc && pc.connectionState === "connected") {
        const stats = await pc.getStats();

        stats.forEach((report) => {
          // Look for inbound-rtp stats with AEC info
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            // Some browsers expose echo return loss metrics
            const inboundReport = report as Record<string, unknown>;
            if (typeof inboundReport.echoReturnLoss === "number") {
              erleValue = inboundReport.echoReturnLoss;
              aecActive = true;
            }
            if (typeof inboundReport.echoReturnLossEnhancement === "number") {
              erleValue = inboundReport.echoReturnLossEnhancement;
              aecActive = true;
            }
          }

          // Look for media-source stats with AEC info
          if (report.type === "media-source" && report.kind === "audio") {
            const mediaReport = report as Record<string, unknown>;
            if (typeof mediaReport.echoReturnLoss === "number") {
              erleValue = mediaReport.echoReturnLoss;
              aecActive = true;
            }
          }
        });
      }

      // Calculate convergence state
      const isConverged =
        erleValue === null
          ? true // If we can't get ERLE, assume converged
          : erleValue >= convergenceThresholdDb;

      const quality = getAECQuality(erleValue);

      const newState: AECState = {
        isConverged,
        erleDb: erleValue,
        quality,
        isActive: aecActive,
        lastUpdateMs: Date.now(),
        error: null,
      };

      // Update state and notify callback
      setAECState((prev) => {
        if (
          prev.isConverged !== newState.isConverged ||
          prev.erleDb !== newState.erleDb ||
          prev.isActive !== newState.isActive ||
          prev.quality !== newState.quality
        ) {
          onAECStateChangeRef.current?.(newState);
          return newState;
        }
        return prev;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      voiceLog.debug(`[AECFeedback] Error polling stats: ${errorMessage}`);

      setAECState((prev) => ({
        ...prev,
        error: errorMessage,
        lastUpdateMs: Date.now(),
      }));
    }
  }, [convergenceThresholdDb]);

  // ==========================================================================
  // Control Methods
  // ==========================================================================

  /**
   * Start monitoring AEC state
   */
  const startMonitoring = useCallback(
    (pc?: RTCPeerConnection, track?: MediaStreamTrack) => {
      if (!enabled) {
        voiceLog.debug("[AECFeedback] AEC feedback disabled, not starting");
        return;
      }

      // Update refs if provided
      if (pc) peerConnectionRef.current = pc;
      if (track) audioTrackRef.current = track;

      // Stop existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      // Start polling
      pollingIntervalRef.current = setInterval(pollStats, pollingIntervalMs);
      setIsMonitoring(true);

      voiceLog.debug(
        `[AECFeedback] Started monitoring (interval=${pollingIntervalMs}ms)`,
      );

      // Initial poll
      pollStats();
    },
    [enabled, pollStats, pollingIntervalMs],
  );

  /**
   * Stop monitoring AEC state
   */
  const stopMonitoring = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    setIsMonitoring(false);

    // Reset to default state
    setAECState({
      isConverged: true,
      erleDb: null,
      quality: "unknown",
      isActive: false,
      lastUpdateMs: Date.now(),
      error: null,
    });

    voiceLog.debug("[AECFeedback] Stopped monitoring");
  }, []);

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Auto-start if peer connection provided
  useEffect(() => {
    if (enabled && initialPeerConnection) {
      startMonitoring(initialPeerConnection, initialAudioTrack || undefined);
    }
  }, [enabled, initialPeerConnection, initialAudioTrack, startMonitoring]);

  // ==========================================================================
  // Return Value
  // ==========================================================================

  // Calculate VAD threshold boost based on AEC state
  const vadThresholdBoost = aecState.isConverged
    ? 0
    : AEC_NOT_CONVERGED_VAD_BOOST;

  return {
    aecState,
    isAECConverged: aecState.isConverged,
    vadThresholdBoost,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if WebRTC AEC stats are available in this browser
 */
export function isAECStatsSupported(): boolean {
  // RTCPeerConnection.getStats() is widely supported, but AEC-specific
  // stats (echoReturnLoss, echoReturnLossEnhancement) are non-standard
  // and only available in some browsers
  return typeof RTCPeerConnection !== "undefined";
}

/**
 * Get a rough AEC quality score based on ERLE
 * @param erleDb Echo Return Loss Enhancement in dB
 * @returns Quality score: "excellent" | "good" | "fair" | "poor" | "unknown"
 */
export function getAECQuality(
  erleDb: number | null,
): AECQuality {
  if (erleDb === null) return "unknown";
  if (erleDb >= 20) return "excellent";
  if (erleDb >= 10) return "good";
  if (erleDb >= 5) return "fair";
  return "poor";
}

export default useAECFeedback;
