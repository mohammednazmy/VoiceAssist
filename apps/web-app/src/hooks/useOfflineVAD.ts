/**
 * useOfflineVAD Hook
 *
 * React hook for lightweight on-device voice activity detection.
 * Uses energy-based analysis for offline operation.
 *
 * Phase 9: Offline & Low-Latency Fallback
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WebRTCVADProcessor, VADAudioManager } from "../lib/offline/webrtcVAD";
import type {
  UseOfflineVADOptions,
  UseOfflineVADReturn,
  VADSpeechSegment,
  VADFrameResult,
  VADConfig,
} from "../lib/offline/types";
import { DEFAULT_VAD_CONFIG } from "../lib/offline/types";

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for offline VAD
 */
export function useOfflineVAD(
  options: UseOfflineVADOptions = {},
): UseOfflineVADReturn {
  const {
    enabled = true,
    mode = 2,
    frameDuration = 20,
    onSpeechStart,
    onSpeechEnd,
    onFrame,
  } = options;

  // State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentEnergy, setCurrentEnergy] = useState(0);

  // Refs
  const processorRef = useRef<WebRTCVADProcessor | null>(null);
  const managerRef = useRef<VADAudioManager | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Callback refs to avoid stale closures
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onFrameRef = useRef(onFrame);

  // Update callback refs
  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
    onFrameRef.current = onFrame;
  }, [onSpeechStart, onSpeechEnd, onFrame]);

  // Initialize processor
  useEffect(() => {
    if (!enabled) return;

    const config: Partial<VADConfig> = {
      mode,
      frameDuration,
    };

    const processor = new WebRTCVADProcessor(config);

    // Set up callbacks
    processor.setCallbacks({
      onSpeechStart: () => {
        setIsSpeaking(true);
        onSpeechStartRef.current?.();
      },
      onSpeechEnd: (segment: VADSpeechSegment) => {
        setIsSpeaking(false);
        onSpeechEndRef.current?.(segment);
      },
      onFrame: (result: VADFrameResult) => {
        setCurrentEnergy(result.energy);
        onFrameRef.current?.(result);
      },
    });

    processorRef.current = processor;
    managerRef.current = new VADAudioManager(processor);

    return () => {
      managerRef.current?.stop();
      processorRef.current?.reset();
      processorRef.current = null;
      managerRef.current = null;
    };
  }, [enabled, mode, frameDuration]);

  // Start listening
  const startListening = useCallback(
    async (stream: MediaStream) => {
      if (!managerRef.current || !enabled) {
        return;
      }

      try {
        streamRef.current = stream;
        await managerRef.current.start(stream);
        setIsListening(true);
      } catch (error) {
        console.error("[useOfflineVAD] Failed to start:", error);
        throw error;
      }
    },
    [enabled],
  );

  // Stop listening
  const stopListening = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.stop();
    }

    streamRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
    setCurrentEnergy(0);
  }, []);

  // Reset VAD state
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }

    setIsSpeaking(false);
    setCurrentEnergy(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.stop();
    };
  }, []);

  return {
    isListening,
    isSpeaking,
    currentEnergy,
    startListening,
    stopListening,
    reset,
  };
}

// ============================================================================
// Hook with Network Fallback
// ============================================================================

export interface UseOfflineVADWithFallbackOptions extends UseOfflineVADOptions {
  /** Whether network VAD is available (from external source like WebSocket) */
  networkVADAvailable?: boolean;

  /** Use network monitor for automatic detection (overrides networkVADAvailable) */
  useNetworkMonitor?: boolean;

  /** Minimum quality level required for network VAD ("moderate" | "good" | "excellent") */
  minNetworkQuality?: "moderate" | "good" | "excellent";

  /** Delay before returning to network after it recovers (ms) */
  networkRecoveryDelayMs?: number;

  /** Callback when falling back to offline */
  onFallbackToOffline?: () => void;

  /** Callback when returning to network VAD */
  onReturnToNetwork?: () => void;

  /** Callback when network quality changes */
  onNetworkQualityChange?: (quality: string, isHealthy: boolean) => void;
}

export interface UseOfflineVADWithFallbackReturn extends UseOfflineVADReturn {
  /** Whether currently using offline VAD */
  isUsingOfflineVAD: boolean;

  /** Whether network is available (from monitor or external) */
  networkAvailable: boolean;

  /** Current network quality if using monitor */
  networkQuality: string | null;

  /** Force switch to offline mode */
  forceOffline: () => void;

  /** Force switch to network mode (if available) */
  forceNetwork: () => void;

  /** Get reason for current mode */
  modeReason:
    | "forced_offline"
    | "network_unavailable"
    | "poor_quality"
    | "user_preference"
    | "network_vad";
}

/**
 * Hook that automatically falls back to offline VAD when network is unavailable
 * Enhanced with network monitoring integration
 */
export function useOfflineVADWithFallback(
  options: UseOfflineVADWithFallbackOptions = {},
): UseOfflineVADWithFallbackReturn {
  const {
    networkVADAvailable: externalNetworkVADAvailable = true,
    useNetworkMonitor = false,
    minNetworkQuality = "moderate",
    networkRecoveryDelayMs = 2000,
    onFallbackToOffline,
    onReturnToNetwork,
    onNetworkQualityChange,
    ...vadOptions
  } = options;

  // State
  const [isUsingOfflineVAD, setIsUsingOfflineVAD] = useState(false);
  const [forcedMode, setForcedMode] = useState<"offline" | "network" | null>(
    null,
  );
  const [networkQuality, setNetworkQuality] = useState<string | null>(null);
  const [modeReason, setModeReason] =
    useState<UseOfflineVADWithFallbackReturn["modeReason"]>("network_vad");

  // Recovery timer ref
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Network status (lazy import to avoid issues in SSR)
  const [networkStatus, setNetworkStatus] = useState({
    isOnline: true,
    isHealthy: true,
    quality: "moderate" as string,
  });

  // Use network monitor if enabled
  useEffect(() => {
    if (!useNetworkMonitor) return;

    // Dynamically import to avoid SSR issues
    import("./useNetworkStatus").then(({ useNetworkStatus }) => {
      // This is a hack - we can't call hooks dynamically
      // Instead, we'll subscribe directly to the monitor
      import("../lib/offline/networkMonitor").then(({ getNetworkMonitor }) => {
        const monitor = getNetworkMonitor();
        const unsubscribe = monitor.subscribe((status) => {
          setNetworkStatus({
            isOnline: status.isOnline,
            isHealthy: status.isHealthy,
            quality: status.quality,
          });
          setNetworkQuality(status.quality);
          onNetworkQualityChange?.(status.quality, status.isHealthy);
        });
        return unsubscribe;
      });
    });
  }, [useNetworkMonitor, onNetworkQualityChange]);

  // Determine if network is available
  const networkAvailable = useNetworkMonitor
    ? networkStatus.isOnline && networkStatus.isHealthy
    : externalNetworkVADAvailable;

  // Determine if quality is sufficient
  const qualityScores: Record<string, number> = {
    offline: 0,
    poor: 1,
    moderate: 2,
    good: 3,
    excellent: 4,
  };
  const minQualityScore = qualityScores[minNetworkQuality] || 2;
  const currentQualityScore = qualityScores[networkStatus.quality] || 2;
  const qualitySufficient = currentQualityScore >= minQualityScore;

  // Core offline VAD hook - always enabled when using offline mode
  const offlineVAD = useOfflineVAD({
    ...vadOptions,
    enabled: isUsingOfflineVAD,
  });

  // Callback refs
  const onFallbackToOfflineRef = useRef(onFallbackToOffline);
  const onReturnToNetworkRef = useRef(onReturnToNetwork);

  useEffect(() => {
    onFallbackToOfflineRef.current = onFallbackToOffline;
    onReturnToNetworkRef.current = onReturnToNetwork;
  }, [onFallbackToOffline, onReturnToNetwork]);

  // Handle mode changes based on network and preferences
  useEffect(() => {
    // If forced, respect that
    if (forcedMode === "offline") {
      if (!isUsingOfflineVAD) {
        setIsUsingOfflineVAD(true);
        setModeReason("forced_offline");
      }
      return;
    }

    if (forcedMode === "network" && networkAvailable) {
      if (isUsingOfflineVAD) {
        setIsUsingOfflineVAD(false);
        setModeReason("network_vad");
      }
      return;
    }

    // Clear any pending recovery timer
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }

    // Network not available - immediately fall back
    if (!networkAvailable) {
      if (!isUsingOfflineVAD) {
        setIsUsingOfflineVAD(true);
        setModeReason("network_unavailable");
        onFallbackToOfflineRef.current?.();
      }
      return;
    }

    // Network available but quality insufficient
    if (useNetworkMonitor && !qualitySufficient) {
      if (!isUsingOfflineVAD) {
        setIsUsingOfflineVAD(true);
        setModeReason("poor_quality");
        onFallbackToOfflineRef.current?.();
      }
      return;
    }

    // Network available and quality sufficient - return to network with delay
    if (isUsingOfflineVAD && networkAvailable && qualitySufficient) {
      recoveryTimerRef.current = setTimeout(() => {
        setIsUsingOfflineVAD(false);
        setModeReason("network_vad");
        onReturnToNetworkRef.current?.();
      }, networkRecoveryDelayMs);
    }
  }, [
    networkAvailable,
    qualitySufficient,
    useNetworkMonitor,
    forcedMode,
    isUsingOfflineVAD,
    networkRecoveryDelayMs,
  ]);

  // Cleanup recovery timer
  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
      }
    };
  }, []);

  // Force offline mode
  const forceOffline = useCallback(() => {
    setForcedMode("offline");
    if (!isUsingOfflineVAD) {
      setIsUsingOfflineVAD(true);
      setModeReason("forced_offline");
      onFallbackToOfflineRef.current?.();
    }
  }, [isUsingOfflineVAD]);

  // Force network mode
  const forceNetwork = useCallback(() => {
    setForcedMode("network");
    if (isUsingOfflineVAD && networkAvailable) {
      setIsUsingOfflineVAD(false);
      setModeReason("network_vad");
      onReturnToNetworkRef.current?.();
    }
  }, [isUsingOfflineVAD, networkAvailable]);

  return {
    ...offlineVAD,
    isUsingOfflineVAD,
    networkAvailable,
    networkQuality: useNetworkMonitor ? networkQuality : null,
    forceOffline,
    forceNetwork,
    modeReason,
  };
}

// ============================================================================
// Utility Hook for TTS Cache
// ============================================================================

export interface UseTTSCacheOptions {
  /** Maximum cache size in MB */
  maxSizeMB?: number;

  /** Voice identifier for caching */
  voice: string;

  /** TTS function to call on cache miss */
  ttsFunction: (text: string) => Promise<ArrayBuffer>;
}

export interface UseTTSCacheReturn {
  /** Get TTS audio (from cache or fresh) */
  getTTS: (text: string) => Promise<ArrayBuffer>;

  /** Preload common phrases */
  preload: () => Promise<void>;

  /** Check if text is cached */
  isCached: (text: string) => boolean;

  /** Cache statistics */
  stats: {
    entryCount: number;
    sizeMB: number;
    hitRate: number;
  };

  /** Clear cache */
  clear: () => Promise<void>;
}

/**
 * Hook for TTS caching with automatic cache-or-fetch logic
 */
export function useTTSCache(options: UseTTSCacheOptions): UseTTSCacheReturn {
  const { voice, ttsFunction, maxSizeMB = 50 } = options;

  const [stats, setStats] = useState({
    entryCount: 0,
    sizeMB: 0,
    hitRate: 0,
  });

  // Use a simple in-memory cache for the hook
  const cacheRef = useRef<Map<string, ArrayBuffer>>(new Map());
  const statsRef = useRef({ hits: 0, misses: 0 });

  // Get TTS with caching
  const getTTS = useCallback(
    async (text: string): Promise<ArrayBuffer> => {
      const key = `${voice}:${text.toLowerCase().trim()}`;
      const cached = cacheRef.current.get(key);

      if (cached) {
        statsRef.current.hits++;
        updateStats();
        return cached;
      }

      statsRef.current.misses++;
      const audio = await ttsFunction(text);
      cacheRef.current.set(key, audio);
      updateStats();
      return audio;
    },
    [voice, ttsFunction],
  );

  // Update stats
  const updateStats = useCallback(() => {
    let totalSize = 0;
    for (const buffer of cacheRef.current.values()) {
      totalSize += buffer.byteLength;
    }

    const total = statsRef.current.hits + statsRef.current.misses;

    setStats({
      entryCount: cacheRef.current.size,
      sizeMB: totalSize / (1024 * 1024),
      hitRate: total > 0 ? statsRef.current.hits / total : 0,
    });
  }, []);

  // Preload common phrases
  const preload = useCallback(async () => {
    const commonPhrases = [
      "I'm listening",
      "Go ahead",
      "Please continue",
      "I understand",
      "One moment please",
    ];

    for (const phrase of commonPhrases) {
      const key = `${voice}:${phrase.toLowerCase().trim()}`;
      if (!cacheRef.current.has(key)) {
        try {
          const audio = await ttsFunction(phrase);
          cacheRef.current.set(key, audio);
        } catch (error) {
          console.warn(`[useTTSCache] Failed to preload: ${phrase}`, error);
        }
      }
    }

    updateStats();
  }, [voice, ttsFunction, updateStats]);

  // Check if cached
  const isCached = useCallback(
    (text: string): boolean => {
      const key = `${voice}:${text.toLowerCase().trim()}`;
      return cacheRef.current.has(key);
    },
    [voice],
  );

  // Clear cache
  const clear = useCallback(async () => {
    cacheRef.current.clear();
    statsRef.current = { hits: 0, misses: 0 };
    updateStats();
  }, [updateStats]);

  return {
    getTTS,
    preload,
    isCached,
    stats,
    clear,
  };
}

export default useOfflineVAD;
