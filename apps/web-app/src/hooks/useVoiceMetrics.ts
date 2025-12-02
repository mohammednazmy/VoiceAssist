/**
 * Voice Mode Metrics Hook - Phase 11: Analytics & Observability
 *
 * Tracks voice session metrics including:
 * - STT latency end-to-end
 * - Voice session duration
 * - Reconnection frequency
 * - Audio quality metrics
 * - Browser performance metrics (Phase 3 enhancements)
 * - Network quality assessment
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useAnalytics } from "../lib/analytics/AnalyticsProvider";
import {
  getNetworkQuality,
  getBrowserPerformance,
  getAudioContextMetrics,
  type NetworkQualityMetrics,
  type BrowserPerformanceMetrics,
  type AudioContextMetrics,
} from "../lib/voiceTelemetry";

// Voice session metrics
export interface VoiceSessionMetrics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  sttLatencies: number[];
  ttsLatencies: number[];
  ttfaLatencies: number[]; // Time to first audio
  reconnectionCount: number;
  errorCount: number;
  messageCount: number;
  averageSttLatency?: number;
  averageTtsLatency?: number;
  averageTtfaLatency?: number;
  audioQuality?: AudioQualityMetrics;
  browserPerformance?: BrowserPerformanceMetrics;
  networkQuality?: NetworkQualityMetrics;
  audioContext?: AudioContextMetrics;
}

// Audio quality metrics
export interface AudioQualityMetrics {
  sampleRate: number;
  bitDepth?: number;
  channelCount: number;
  noiseLevel?: number;
  clippingEvents: number;
  packetLoss?: number;
  jitterMs?: number;
}

// Latency measurement
export interface LatencyMeasurement {
  id: string;
  type: "stt" | "tts" | "ttfa" | "roundtrip" | "connection";
  startTime: number;
  endTime?: number;
  duration?: number;
}

// Voice metrics state
export interface UseVoiceMetricsReturn {
  // Current session metrics
  currentSession: VoiceSessionMetrics | null;
  allSessions: VoiceSessionMetrics[];

  // Session lifecycle
  startSession: () => string;
  endSession: () => VoiceSessionMetrics | null;

  // Latency tracking
  startLatencyMeasurement: (
    type: "stt" | "tts" | "ttfa" | "roundtrip" | "connection",
  ) => string;
  endLatencyMeasurement: (id: string) => number | null;

  // Browser metrics
  recordBrowserPerformance: () => void;
  recordNetworkQuality: () => void;
  setAudioContext: (ctx: AudioContext) => void;

  // Event tracking
  recordReconnection: () => void;
  recordError: (errorType: string) => void;
  recordMessage: () => void;
  recordAudioQuality: (metrics: Partial<AudioQualityMetrics>) => void;

  // Aggregated metrics
  getAverageLatencies: () => { stt: number; tts: number };
  getSessionStats: () => SessionStats;

  // Reset
  resetMetrics: () => void;
}

// Session statistics
export interface SessionStats {
  totalSessions: number;
  totalDuration: number;
  averageSessionDuration: number;
  totalMessages: number;
  totalErrors: number;
  totalReconnections: number;
  averageSttLatency: number;
  averageTtsLatency: number;
  averageTtfaLatency: number;
  p95SttLatency: number;
  p95TtsLatency: number;
  p95TtfaLatency: number;
  networkQuality: NetworkQualityMetrics | null;
  browserPerformance: BrowserPerformanceMetrics | null;
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function useVoiceMetrics(): UseVoiceMetricsReturn {
  const { trackEvent, trackTiming } = useAnalytics();

  // Current session
  const [currentSession, setCurrentSession] =
    useState<VoiceSessionMetrics | null>(null);
  const currentSessionRef = useRef<VoiceSessionMetrics | null>(null);

  // Historical sessions (in-memory, could be persisted)
  const [allSessions, setAllSessions] = useState<VoiceSessionMetrics[]>([]);

  // Active latency measurements
  const measurementsRef = useRef<Map<string, LatencyMeasurement>>(new Map());

  // Audio context reference for metrics
  const audioContextRef = useRef<AudioContext | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  // Start a new voice session
  const startSession = useCallback((): string => {
    const sessionId = generateId();
    const networkQuality = getNetworkQuality();
    const browserPerformance = getBrowserPerformance();

    const session: VoiceSessionMetrics = {
      sessionId,
      startTime: Date.now(),
      sttLatencies: [],
      ttsLatencies: [],
      ttfaLatencies: [],
      reconnectionCount: 0,
      errorCount: 0,
      messageCount: 0,
      networkQuality,
      browserPerformance,
    };

    setCurrentSession(session);
    currentSessionRef.current = session;

    trackEvent({
      name: "Voice Session Started",
      props: {
        sessionId,
        networkQuality: networkQuality.quality,
        effectiveType: networkQuality.effectiveType,
        memoryUsagePercent: browserPerformance.memoryUsagePercent,
      },
    });

    return sessionId;
  }, [trackEvent]);

  // End current session
  const endSession = useCallback((): VoiceSessionMetrics | null => {
    const session = currentSessionRef.current;
    if (!session) return null;

    const endTime = Date.now();
    const duration = endTime - session.startTime;

    // Calculate averages
    const avgStt =
      session.sttLatencies.length > 0
        ? session.sttLatencies.reduce((a, b) => a + b, 0) /
          session.sttLatencies.length
        : undefined;

    const avgTts =
      session.ttsLatencies.length > 0
        ? session.ttsLatencies.reduce((a, b) => a + b, 0) /
          session.ttsLatencies.length
        : undefined;

    const avgTtfa =
      session.ttfaLatencies.length > 0
        ? session.ttfaLatencies.reduce((a, b) => a + b, 0) /
          session.ttfaLatencies.length
        : undefined;

    // Get final metrics
    const finalNetworkQuality = getNetworkQuality();
    const finalBrowserPerformance = getBrowserPerformance();
    const audioContextMetrics = getAudioContextMetrics(audioContextRef.current);

    const completedSession: VoiceSessionMetrics = {
      ...session,
      endTime,
      duration,
      averageSttLatency: avgStt,
      averageTtsLatency: avgTts,
      averageTtfaLatency: avgTtfa,
      networkQuality: finalNetworkQuality,
      browserPerformance: finalBrowserPerformance,
      audioContext: audioContextMetrics,
    };

    // Add to history
    setAllSessions((prev) => [...prev, completedSession]);
    setCurrentSession(null);
    currentSessionRef.current = null;

    // Track analytics
    trackEvent({
      name: "Voice Session Ended",
      props: {
        sessionId: session.sessionId,
        duration,
        messageCount: session.messageCount,
        errorCount: session.errorCount,
        reconnectionCount: session.reconnectionCount,
        avgSttLatency: Math.round(avgStt || 0),
        avgTtsLatency: Math.round(avgTts || 0),
        avgTtfaLatency: Math.round(avgTtfa || 0),
        networkQuality: finalNetworkQuality.quality,
        memoryUsagePercent: finalBrowserPerformance.memoryUsagePercent,
      },
    });

    trackTiming("voice", "session_duration", duration);
    if (avgTtfa) {
      trackTiming("voice", "ttfa_latency", avgTtfa);
    }

    return completedSession;
  }, [trackEvent, trackTiming]);

  // Start latency measurement
  const startLatencyMeasurement = useCallback(
    (type: "stt" | "tts" | "ttfa" | "roundtrip" | "connection"): string => {
      const id = generateId();
      const measurement: LatencyMeasurement = {
        id,
        type,
        startTime: performance.now(),
      };

      measurementsRef.current.set(id, measurement);
      return id;
    },
    [],
  );

  // End latency measurement
  const endLatencyMeasurement = useCallback(
    (id: string): number | null => {
      const measurement = measurementsRef.current.get(id);
      if (!measurement) return null;

      const endTime = performance.now();
      const duration = endTime - measurement.startTime;

      measurementsRef.current.delete(id);

      // Record in current session
      if (currentSessionRef.current) {
        if (measurement.type === "stt") {
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  sttLatencies: [...prev.sttLatencies, duration],
                }
              : null,
          );
        } else if (measurement.type === "tts") {
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  ttsLatencies: [...prev.ttsLatencies, duration],
                }
              : null,
          );
        } else if (measurement.type === "ttfa") {
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  ttfaLatencies: [...prev.ttfaLatencies, duration],
                }
              : null,
          );
        }
      }

      // Track timing analytics
      trackTiming("voice", `${measurement.type}_latency`, duration);

      return duration;
    },
    [trackTiming],
  );

  // Record reconnection
  const recordReconnection = useCallback(() => {
    if (!currentSessionRef.current) return;

    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            reconnectionCount: prev.reconnectionCount + 1,
          }
        : null,
    );

    trackEvent({
      name: "Voice Reconnection",
      props: { sessionId: currentSessionRef.current.sessionId },
    });
  }, [trackEvent]);

  // Record error
  const recordError = useCallback(
    (errorType: string) => {
      if (!currentSessionRef.current) return;

      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              errorCount: prev.errorCount + 1,
            }
          : null,
      );

      trackEvent({
        name: "Voice Error",
        props: {
          sessionId: currentSessionRef.current.sessionId,
          errorType,
        },
      });
    },
    [trackEvent],
  );

  // Record message
  const recordMessage = useCallback(() => {
    if (!currentSessionRef.current) return;

    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            messageCount: prev.messageCount + 1,
          }
        : null,
    );
  }, []);

  // Record audio quality
  const recordAudioQuality = useCallback(
    (metrics: Partial<AudioQualityMetrics>) => {
      if (!currentSessionRef.current) return;

      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              audioQuality: {
                sampleRate:
                  metrics.sampleRate || prev.audioQuality?.sampleRate || 16000,
                channelCount:
                  metrics.channelCount || prev.audioQuality?.channelCount || 1,
                clippingEvents:
                  (prev.audioQuality?.clippingEvents || 0) +
                  (metrics.clippingEvents || 0),
                bitDepth: metrics.bitDepth || prev.audioQuality?.bitDepth,
                noiseLevel: metrics.noiseLevel || prev.audioQuality?.noiseLevel,
              },
            }
          : null,
      );
    },
    [],
  );

  // Get average latencies across all sessions
  const getAverageLatencies = useCallback(() => {
    const allSttLatencies = allSessions.flatMap((s) => s.sttLatencies);
    const allTtsLatencies = allSessions.flatMap((s) => s.ttsLatencies);

    // Include current session
    if (currentSessionRef.current) {
      allSttLatencies.push(...currentSessionRef.current.sttLatencies);
      allTtsLatencies.push(...currentSessionRef.current.ttsLatencies);
    }

    return {
      stt:
        allSttLatencies.length > 0
          ? allSttLatencies.reduce((a, b) => a + b, 0) / allSttLatencies.length
          : 0,
      tts:
        allTtsLatencies.length > 0
          ? allTtsLatencies.reduce((a, b) => a + b, 0) / allTtsLatencies.length
          : 0,
    };
  }, [allSessions]);

  // Get comprehensive session stats
  const getSessionStats = useCallback((): SessionStats => {
    const sessionsToAnalyze = currentSessionRef.current
      ? [...allSessions, currentSessionRef.current]
      : allSessions;

    if (sessionsToAnalyze.length === 0) {
      return {
        totalSessions: 0,
        totalDuration: 0,
        averageSessionDuration: 0,
        totalMessages: 0,
        totalErrors: 0,
        totalReconnections: 0,
        averageSttLatency: 0,
        averageTtsLatency: 0,
        averageTtfaLatency: 0,
        p95SttLatency: 0,
        p95TtsLatency: 0,
        p95TtfaLatency: 0,
        networkQuality: null,
        browserPerformance: null,
      };
    }

    const allSttLatencies = sessionsToAnalyze.flatMap((s) => s.sttLatencies);
    const allTtsLatencies = sessionsToAnalyze.flatMap((s) => s.ttsLatencies);
    const allTtfaLatencies = sessionsToAnalyze.flatMap((s) => s.ttfaLatencies);

    const totalDuration = sessionsToAnalyze.reduce((sum, s) => {
      if (s.duration) return sum + s.duration;
      if (s.startTime) return sum + (Date.now() - s.startTime);
      return sum;
    }, 0);

    // Get latest network and browser metrics
    const latestSession = sessionsToAnalyze[sessionsToAnalyze.length - 1];

    return {
      totalSessions: sessionsToAnalyze.length,
      totalDuration,
      averageSessionDuration: totalDuration / sessionsToAnalyze.length,
      totalMessages: sessionsToAnalyze.reduce(
        (sum, s) => sum + s.messageCount,
        0,
      ),
      totalErrors: sessionsToAnalyze.reduce((sum, s) => sum + s.errorCount, 0),
      totalReconnections: sessionsToAnalyze.reduce(
        (sum, s) => sum + s.reconnectionCount,
        0,
      ),
      averageSttLatency:
        allSttLatencies.length > 0
          ? allSttLatencies.reduce((a, b) => a + b, 0) / allSttLatencies.length
          : 0,
      averageTtsLatency:
        allTtsLatencies.length > 0
          ? allTtsLatencies.reduce((a, b) => a + b, 0) / allTtsLatencies.length
          : 0,
      averageTtfaLatency:
        allTtfaLatencies.length > 0
          ? allTtfaLatencies.reduce((a, b) => a + b, 0) /
            allTtfaLatencies.length
          : 0,
      p95SttLatency: percentile(allSttLatencies, 95),
      p95TtsLatency: percentile(allTtsLatencies, 95),
      p95TtfaLatency: percentile(allTtfaLatencies, 95),
      networkQuality: latestSession.networkQuality || null,
      browserPerformance: latestSession.browserPerformance || null,
    };
  }, [allSessions]);

  // Reset all metrics
  const resetMetrics = useCallback(() => {
    setCurrentSession(null);
    currentSessionRef.current = null;
    setAllSessions([]);
    measurementsRef.current.clear();
    audioContextRef.current = null;
  }, []);

  // Record browser performance snapshot
  const recordBrowserPerformance = useCallback(() => {
    if (!currentSessionRef.current) return;

    const performance = getBrowserPerformance();
    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            browserPerformance: performance,
          }
        : null,
    );
  }, []);

  // Record network quality snapshot
  const recordNetworkQuality = useCallback(() => {
    if (!currentSessionRef.current) return;

    const quality = getNetworkQuality();
    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            networkQuality: quality,
          }
        : null,
    );
  }, []);

  // Set audio context for metrics collection
  const setAudioContext = useCallback((ctx: AudioContext) => {
    audioContextRef.current = ctx;

    // Record audio context metrics
    if (currentSessionRef.current) {
      const metrics = getAudioContextMetrics(ctx);
      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              audioContext: metrics,
            }
          : null,
      );
    }
  }, []);

  return {
    currentSession,
    allSessions,
    startSession,
    endSession,
    startLatencyMeasurement,
    endLatencyMeasurement,
    recordBrowserPerformance,
    recordNetworkQuality,
    setAudioContext,
    recordReconnection,
    recordError,
    recordMessage,
    recordAudioQuality,
    getAverageLatencies,
    getSessionStats,
    resetMetrics,
  };
}

export default useVoiceMetrics;
