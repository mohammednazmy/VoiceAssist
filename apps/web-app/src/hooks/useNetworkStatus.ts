/**
 * useNetworkStatus Hook
 *
 * React hook for monitoring network connectivity and quality.
 * Integrates with the NetworkMonitor for real-time status updates.
 *
 * Phase 9: Offline & Low-Latency Fallback Enhancement
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getNetworkMonitor,
  type NetworkMonitorConfig,
  type NetworkStatus,
  type NetworkQuality,
} from "../lib/offline/networkMonitor";

// ============================================================================
// Types
// ============================================================================

export interface UseNetworkStatusOptions {
  /** Custom config for the network monitor */
  config?: Partial<NetworkMonitorConfig>;

  /** Enable the hook (default: true) */
  enabled?: boolean;
}

export interface UseNetworkStatusReturn extends NetworkStatus {
  /** Whether network is suitable for voice (good or excellent quality) */
  isSuitableForVoice: boolean;

  /** Whether should fall back to offline mode */
  shouldUseOffline: boolean;

  /** Force an immediate network check */
  checkNow: () => Promise<NetworkStatus>;

  /** Quality as a numeric score (0-4) */
  qualityScore: number;
}

// ============================================================================
// Quality Score Mapping
// ============================================================================

const QUALITY_SCORES: Record<NetworkQuality, number> = {
  offline: 0,
  poor: 1,
  moderate: 2,
  good: 3,
  excellent: 4,
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for monitoring network status
 */
export function useNetworkStatus(
  options: UseNetworkStatusOptions = {},
): UseNetworkStatusReturn {
  const { config, enabled = true } = options;

  // Get the network monitor (singleton)
  const monitor = useMemo(() => {
    if (!enabled) return null;
    return getNetworkMonitor(config);
  }, [config, enabled]);

  // Subscribe to monitor updates using useSyncExternalStore for best performance
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!monitor) return () => {};
      return monitor.subscribe(() => callback());
    },
    [monitor],
  );

  const getSnapshot = useCallback(() => {
    if (!monitor) {
      return defaultStatus;
    }
    return monitor.getStatus();
  }, [monitor]);

  const getServerSnapshot = useCallback(() => defaultStatus, []);

  // Use sync external store for optimal performance
  const status = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Check now function
  const checkNow = useCallback(async (): Promise<NetworkStatus> => {
    if (!monitor) return defaultStatus;
    return monitor.checkNow();
  }, [monitor]);

  // Computed values
  const qualityScore = QUALITY_SCORES[status.quality];
  const isSuitableForVoice =
    qualityScore >= QUALITY_SCORES.good && status.isHealthy;
  const shouldUseOffline =
    !status.isOnline ||
    !status.isHealthy ||
    qualityScore < QUALITY_SCORES.moderate;

  return {
    ...status,
    isSuitableForVoice,
    shouldUseOffline,
    checkNow,
    qualityScore,
  };
}

// ============================================================================
// Default Status
// ============================================================================

const defaultStatus: NetworkStatus = {
  isOnline: true,
  effectiveType: null,
  downlink: null,
  rtt: null,
  saveData: false,
  quality: "moderate",
  healthCheckLatencyMs: null,
  lastHealthCheck: null,
  isHealthy: true,
};

// ============================================================================
// Simple Online Status Hook
// ============================================================================

/**
 * Simple hook that only tracks online/offline status
 * Use this when you don't need full network quality monitoring
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

// ============================================================================
// Export Types
// ============================================================================

export type { NetworkStatus, NetworkQuality, NetworkMonitorConfig };

export default useNetworkStatus;
