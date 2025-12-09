/**
 * Network Quality Monitor Hook
 *
 * Monitors network conditions and provides quality metrics for
 * adaptive audio chunk sizing and pre-buffering decisions.
 *
 * WebSocket Latency Optimization Feature
 * Feature Flag: backend.voice_ws_adaptive_chunking
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

export interface NetworkMetrics {
  /** Estimated round-trip time in milliseconds */
  rttMs: number | null;
  /** Download speed estimate in Mbps */
  downlinkMbps: number | null;
  /** Effective connection type (4g, 3g, 2g, slow-2g) */
  effectiveType: string | null;
  /** Whether the device is saving data */
  saveData: boolean;
  /** Computed network quality based on metrics */
  quality: NetworkQuality;
  /** Recommended audio chunk size in samples */
  recommendedChunkSize: number;
}

export interface UseNetworkQualityOptions {
  /** Enable monitoring (default: true) */
  enabled?: boolean;
  /** Update interval in milliseconds (default: 5000) */
  updateInterval?: number;
  /** Enable ping-based RTT measurement (default: true) */
  enablePing?: boolean;
  /** Ping endpoint URL (default: /health) */
  pingEndpoint?: string;
}

export interface UseNetworkQualityReturn {
  /** Current network metrics */
  metrics: NetworkMetrics;
  /** Whether monitoring is active */
  isMonitoring: boolean;
  /** Force an update of network metrics */
  refresh: () => Promise<void>;
  /** Start monitoring */
  start: () => void;
  /** Stop monitoring */
  stop: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Audio chunk size recommendations based on network quality.
 * Values are in samples at 16kHz.
 */
const CHUNK_SIZE_MAP: Record<NetworkQuality, number> = {
  excellent: 1024, // 64ms - minimize latency
  good: 2048, // 128ms - balanced (default)
  fair: 2048, // 128ms - balanced
  poor: 4096, // 256ms - reduce overhead
  unknown: 2048, // Default to balanced
};

/**
 * RTT thresholds for quality classification (ms)
 */
const RTT_THRESHOLDS = {
  excellent: 50, // < 50ms
  good: 150, // < 150ms
  fair: 300, // < 300ms
  // > 300ms = poor
};

/**
 * Downlink thresholds for quality classification (Mbps)
 */
const DOWNLINK_THRESHOLDS = {
  excellent: 10, // > 10 Mbps
  good: 5, // > 5 Mbps
  fair: 1, // > 1 Mbps
  // < 1 Mbps = poor
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get network quality from RTT measurement
 */
function getQualityFromRtt(rttMs: number): NetworkQuality {
  if (rttMs < RTT_THRESHOLDS.excellent) return "excellent";
  if (rttMs < RTT_THRESHOLDS.good) return "good";
  if (rttMs < RTT_THRESHOLDS.fair) return "fair";
  return "poor";
}

/**
 * Get network quality from downlink speed
 */
function getQualityFromDownlink(downlinkMbps: number): NetworkQuality {
  if (downlinkMbps > DOWNLINK_THRESHOLDS.excellent) return "excellent";
  if (downlinkMbps > DOWNLINK_THRESHOLDS.good) return "good";
  if (downlinkMbps > DOWNLINK_THRESHOLDS.fair) return "fair";
  return "poor";
}

/**
 * Get network quality from effective connection type
 */
function getQualityFromEffectiveType(type: string): NetworkQuality {
  switch (type) {
    case "4g":
      return "good";
    case "3g":
      return "fair";
    case "2g":
    case "slow-2g":
      return "poor";
    default:
      return "unknown";
  }
}

/**
 * Combine multiple quality indicators into a single quality rating
 */
function combineQuality(
  ...qualities: (NetworkQuality | null)[]
): NetworkQuality {
  const validQualities = qualities.filter(
    (q): q is NetworkQuality => q !== null && q !== "unknown",
  );

  if (validQualities.length === 0) return "unknown";

  // Use worst quality from available metrics (conservative approach)
  const qualityOrder: NetworkQuality[] = [
    "excellent",
    "good",
    "fair",
    "poor",
    "unknown",
  ];
  let worstIndex = 0;

  for (const q of validQualities) {
    const index = qualityOrder.indexOf(q);
    if (index > worstIndex) {
      worstIndex = index;
    }
  }

  return qualityOrder[worstIndex];
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useNetworkQuality(
  options: UseNetworkQualityOptions = {},
): UseNetworkQualityReturn {
  const {
    enabled = true,
    updateInterval = 5000,
    enablePing = true,
    pingEndpoint = "/health",
  } = options;

  // State
  const [metrics, setMetrics] = useState<NetworkMetrics>({
    rttMs: null,
    downlinkMbps: null,
    effectiveType: null,
    saveData: false,
    quality: "unknown",
    recommendedChunkSize: CHUNK_SIZE_MAP.unknown,
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  /**
   * Measure RTT using a ping to the health endpoint
   */
  const measureRtt = useCallback(async (): Promise<number | null> => {
    if (!enablePing) return null;

    try {
      // Prefer explicit API base; fall back to gateway when running from Vite dev server
      const apiBase =
        import.meta.env.VITE_API_URL ||
        (typeof window !== "undefined" &&
        window.location.origin.includes("localhost:5173")
          ? "http://localhost:8000"
          : window.location.origin || "");
      const start = performance.now();

      const response = await fetch(`${apiBase}${pingEndpoint}`, {
        // Use GET to align with API gateway health endpoint and avoid HEAD 405s
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return null;

      const end = performance.now();
      return end - start;
    } catch {
      return null;
    }
  }, [enablePing, pingEndpoint]);

  /**
   * Get metrics from Navigator Network Information API
   */
  const getNavigatorMetrics = useCallback(() => {
    // Check if Network Information API is available
    // @ts-expect-error - Navigator.connection is not in all TypeScript libs
    const connection = navigator.connection as
      | {
          effectiveType?: string;
          downlink?: number;
          rtt?: number;
          saveData?: boolean;
        }
      | undefined;

    if (!connection) {
      return {
        effectiveType: null,
        downlinkMbps: null,
        navigatorRtt: null,
        saveData: false,
      };
    }

    return {
      effectiveType: connection.effectiveType ?? null,
      downlinkMbps: connection.downlink ?? null,
      navigatorRtt: connection.rtt ?? null,
      saveData: connection.saveData ?? false,
    };
  }, []);

  /**
   * Update all network metrics
   */
  const updateMetrics = useCallback(async () => {
    if (!mountedRef.current) return;

    // Get Navigator API metrics
    const navMetrics = getNavigatorMetrics();

    // Measure RTT with ping
    const pingRtt = await measureRtt();

    // Use ping RTT if available, otherwise fall back to Navigator RTT
    const rttMs = pingRtt ?? navMetrics.navigatorRtt;

    // Determine quality from available metrics
    const rttQuality = rttMs !== null ? getQualityFromRtt(rttMs) : null;
    const downlinkQuality =
      navMetrics.downlinkMbps !== null
        ? getQualityFromDownlink(navMetrics.downlinkMbps)
        : null;
    const effectiveTypeQuality = navMetrics.effectiveType
      ? getQualityFromEffectiveType(navMetrics.effectiveType)
      : null;

    // Combine qualities (conservative approach)
    const quality = combineQuality(
      rttQuality,
      downlinkQuality,
      effectiveTypeQuality,
    );

    // Get recommended chunk size based on quality
    const recommendedChunkSize = CHUNK_SIZE_MAP[quality];

    if (mountedRef.current) {
      setMetrics({
        rttMs,
        downlinkMbps: navMetrics.downlinkMbps,
        effectiveType: navMetrics.effectiveType,
        saveData: navMetrics.saveData,
        quality,
        recommendedChunkSize,
      });
    }
  }, [getNavigatorMetrics, measureRtt]);

  /**
   * Start monitoring
   */
  const start = useCallback(() => {
    if (!enabled || isMonitoring) return;

    setIsMonitoring(true);
    updateMetrics();

    intervalRef.current = setInterval(updateMetrics, updateInterval);
  }, [enabled, isMonitoring, updateMetrics, updateInterval]);

  /**
   * Stop monitoring
   */
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  /**
   * Force refresh metrics
   */
  const refresh = useCallback(async () => {
    await updateMetrics();
  }, [updateMetrics]);

  // Auto-start on mount if enabled
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      start();
    }

    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [enabled, start, stop]);

  // Listen for network change events
  useEffect(() => {
    // @ts-expect-error - Navigator.connection is not in all TypeScript libs
    const connection = navigator.connection;
    if (!connection) return;

    const handleChange = () => {
      updateMetrics();
    };

    connection.addEventListener("change", handleChange);
    return () => {
      connection.removeEventListener("change", handleChange);
    };
  }, [updateMetrics]);

  return {
    metrics,
    isMonitoring,
    refresh,
    start,
    stop,
  };
}

export default useNetworkQuality;
