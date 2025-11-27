/**
 * Voice Mode Metrics Hook - Phase 11: Analytics & Observability
 *
 * Tracks voice session metrics including:
 * - STT latency end-to-end
 * - Voice session duration
 * - Reconnection frequency
 * - Audio quality metrics
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useAnalytics } from "../lib/analytics/AnalyticsProvider";

// Voice session metrics
export interface VoiceSessionMetrics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  sttLatencies: number[];
  ttsLatencies: number[];
  reconnectionCount: number;
  errorCount: number;
  messageCount: number;
  averageSttLatency?: number;
  averageTtsLatency?: number;
  audioQuality?: AudioQualityMetrics;
}

// Audio quality metrics
export interface AudioQualityMetrics {
  sampleRate: number;
  bitDepth?: number;
  channelCount: number;
  noiseLevel?: number;
  clippingEvents: number;
}

// Latency measurement
export interface LatencyMeasurement {
  id: string;
  type: "stt" | "tts" | "roundtrip";
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
  startLatencyMeasurement: (type: "stt" | "tts" | "roundtrip") => string;
  endLatencyMeasurement: (id: string) => number | null;

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
  p95SttLatency: number;
  p95TtsLatency: number;
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

  // Keep ref in sync with state
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  // Start a new voice session
  const startSession = useCallback((): string => {
    const sessionId = generateId();
    const session: VoiceSessionMetrics = {
      sessionId,
      startTime: Date.now(),
      sttLatencies: [],
      ttsLatencies: [],
      reconnectionCount: 0,
      errorCount: 0,
      messageCount: 0,
    };

    setCurrentSession(session);
    currentSessionRef.current = session;

    trackEvent({ name: "Voice Session Started", props: { sessionId } });

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

    const completedSession: VoiceSessionMetrics = {
      ...session,
      endTime,
      duration,
      averageSttLatency: avgStt,
      averageTtsLatency: avgTts,
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
      },
    });

    trackTiming("voice", "session_duration", duration);

    return completedSession;
  }, [trackEvent, trackTiming]);

  // Start latency measurement
  const startLatencyMeasurement = useCallback(
    (type: "stt" | "tts" | "roundtrip"): string => {
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
        p95SttLatency: 0,
        p95TtsLatency: 0,
      };
    }

    const allSttLatencies = sessionsToAnalyze.flatMap((s) => s.sttLatencies);
    const allTtsLatencies = sessionsToAnalyze.flatMap((s) => s.ttsLatencies);

    const totalDuration = sessionsToAnalyze.reduce((sum, s) => {
      if (s.duration) return sum + s.duration;
      if (s.startTime) return sum + (Date.now() - s.startTime);
      return sum;
    }, 0);

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
      p95SttLatency: percentile(allSttLatencies, 95),
      p95TtsLatency: percentile(allTtsLatencies, 95),
    };
  }, [allSessions]);

  // Reset all metrics
  const resetMetrics = useCallback(() => {
    setCurrentSession(null);
    currentSessionRef.current = null;
    setAllSessions([]);
    measurementsRef.current.clear();
  }, []);

  return {
    currentSession,
    allSessions,
    startSession,
    endSession,
    startLatencyMeasurement,
    endLatencyMeasurement,
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
