/**
 * Network Monitor
 *
 * Comprehensive network monitoring for offline detection and quality assessment.
 * Uses multiple signals: Navigator.onLine, Network Information API, and
 * periodic health checks.
 *
 * Phase 9: Offline & Low-Latency Fallback Enhancement
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Network quality levels
 */
export type NetworkQuality =
  | "offline"
  | "poor"
  | "moderate"
  | "good"
  | "excellent";

/**
 * Effective connection type from Network Information API
 */
export type EffectiveConnectionType = "slow-2g" | "2g" | "3g" | "4g";

/**
 * Network status information
 */
export interface NetworkStatus {
  /** Whether device is online according to Navigator.onLine */
  isOnline: boolean;

  /** Effective connection type (from Network Information API) */
  effectiveType: EffectiveConnectionType | null;

  /** Downlink speed in Mbps */
  downlink: number | null;

  /** Round-trip time estimate in ms */
  rtt: number | null;

  /** Whether data saver is enabled */
  saveData: boolean;

  /** Computed quality level */
  quality: NetworkQuality;

  /** Last health check latency in ms */
  healthCheckLatencyMs: number | null;

  /** Time of last successful health check */
  lastHealthCheck: number | null;

  /** Whether health check endpoint is reachable */
  isHealthy: boolean;
}

/**
 * Network monitor configuration
 */
export interface NetworkMonitorConfig {
  /** Health check endpoint URL */
  healthCheckUrl: string;

  /** Health check interval in ms */
  healthCheckIntervalMs: number;

  /** Health check timeout in ms */
  healthCheckTimeoutMs: number;

  /** Latency threshold for "poor" quality (ms) */
  poorLatencyThresholdMs: number;

  /** Latency threshold for "moderate" quality (ms) */
  moderateLatencyThresholdMs: number;

  /** Latency threshold for "good" quality (ms) */
  goodLatencyThresholdMs: number;

  /** Number of consecutive failures before marking unhealthy */
  failuresBeforeUnhealthy: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: NetworkMonitorConfig = {
  healthCheckUrl: "/api/health",
  healthCheckIntervalMs: 30000, // 30 seconds
  healthCheckTimeoutMs: 5000, // 5 seconds
  poorLatencyThresholdMs: 500,
  moderateLatencyThresholdMs: 200,
  goodLatencyThresholdMs: 100,
  failuresBeforeUnhealthy: 3,
};

// ============================================================================
// NetworkConnection API Types (Navigator.connection)
// ============================================================================

interface NetworkInformation extends EventTarget {
  readonly effectiveType?: EffectiveConnectionType;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
  onchange?: ((this: NetworkInformation, ev: Event) => void) | null;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

// ============================================================================
// Network Monitor Class
// ============================================================================

type StatusChangeCallback = (status: NetworkStatus) => void;

/**
 * Network Monitor
 *
 * Monitors network connectivity and quality using multiple signals.
 */
export class NetworkMonitor {
  private config: NetworkMonitorConfig;
  private status: NetworkStatus;
  private listeners: Set<StatusChangeCallback> = new Set();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private isRunning = false;

  constructor(config: Partial<NetworkMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = this.createInitialStatus();
  }

  /**
   * Create initial status object
   */
  private createInitialStatus(): NetworkStatus {
    const connection = this.getNetworkConnection();

    return {
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      effectiveType: connection?.effectiveType ?? null,
      downlink: connection?.downlink ?? null,
      rtt: connection?.rtt ?? null,
      saveData: connection?.saveData ?? false,
      quality: navigator?.onLine ? "moderate" : "offline",
      healthCheckLatencyMs: null,
      lastHealthCheck: null,
      isHealthy: navigator?.onLine ?? true,
    };
  }

  /**
   * Get the network connection object
   */
  private getNetworkConnection(): NetworkInformation | undefined {
    if (typeof navigator === "undefined") return undefined;
    return (
      navigator.connection ??
      navigator.mozConnection ??
      navigator.webkitConnection
    );
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Set up online/offline listeners
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }

    // Set up Network Information API listener
    const connection = this.getNetworkConnection();
    if (connection) {
      connection.addEventListener("change", this.handleConnectionChange);
    }

    // Start health checks
    this.startHealthChecks();

    // Run initial check
    this.performHealthCheck();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Remove listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    const connection = this.getNetworkConnection();
    if (connection) {
      connection.removeEventListener("change", this.handleConnectionChange);
    }

    // Stop health checks
    this.stopHealthChecks();
  }

  /**
   * Subscribe to status changes
   */
  subscribe(callback: StatusChangeCallback): () => void {
    this.listeners.add(callback);

    // Immediately notify with current status
    callback(this.status);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get current status
   */
  getStatus(): NetworkStatus {
    return { ...this.status };
  }

  /**
   * Force a health check
   */
  async checkNow(): Promise<NetworkStatus> {
    await this.performHealthCheck();
    return this.getStatus();
  }

  /**
   * Handle going online
   */
  private handleOnline = (): void => {
    this.updateStatus({ isOnline: true });
    // Trigger immediate health check
    this.performHealthCheck();
  };

  /**
   * Handle going offline
   */
  private handleOffline = (): void => {
    this.updateStatus({
      isOnline: false,
      quality: "offline",
      isHealthy: false,
    });
  };

  /**
   * Handle connection info change
   */
  private handleConnectionChange = (): void => {
    const connection = this.getNetworkConnection();
    if (!connection) return;

    this.updateStatus({
      effectiveType: connection.effectiveType ?? null,
      downlink: connection.downlink ?? null,
      rtt: connection.rtt ?? null,
      saveData: connection.saveData ?? false,
    });
  };

  /**
   * Start health check interval
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckIntervalMs,
    );
  }

  /**
   * Stop health check interval
   */
  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform a health check
   */
  private async performHealthCheck(): Promise<void> {
    if (!navigator.onLine) {
      this.updateStatus({
        isOnline: false,
        quality: "offline",
        isHealthy: false,
      });
      return;
    }

    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.healthCheckTimeoutMs,
    );

    try {
      const response = await fetch(this.config.healthCheckUrl, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const latency = performance.now() - startTime;
        this.consecutiveFailures = 0;

        this.updateStatus({
          isOnline: true,
          isHealthy: true,
          healthCheckLatencyMs: latency,
          lastHealthCheck: Date.now(),
          quality: this.computeQuality(latency),
        });
      } else {
        this.handleHealthCheckFailure();
      }
    } catch {
      clearTimeout(timeoutId);
      this.handleHealthCheckFailure();
    }
  }

  /**
   * Handle health check failure
   */
  private handleHealthCheckFailure(): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.config.failuresBeforeUnhealthy) {
      this.updateStatus({
        isHealthy: false,
        quality: this.status.isOnline ? "poor" : "offline",
      });
    }
  }

  /**
   * Compute quality from latency
   */
  private computeQuality(latencyMs: number): NetworkQuality {
    if (!this.status.isOnline) return "offline";

    if (latencyMs <= this.config.goodLatencyThresholdMs) {
      return "excellent";
    }
    if (latencyMs <= this.config.moderateLatencyThresholdMs) {
      return "good";
    }
    if (latencyMs <= this.config.poorLatencyThresholdMs) {
      return "moderate";
    }
    return "poor";
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(partial: Partial<NetworkStatus>): void {
    this.status = { ...this.status, ...partial };

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(this.status);
      } catch (error) {
        console.error("[NetworkMonitor] Error in listener:", error);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalMonitor: NetworkMonitor | null = null;

/**
 * Get the global network monitor instance
 */
export function getNetworkMonitor(
  config?: Partial<NetworkMonitorConfig>,
): NetworkMonitor {
  if (!globalMonitor) {
    globalMonitor = new NetworkMonitor(config);
    globalMonitor.start();
  }
  return globalMonitor;
}

/**
 * Create a new network monitor instance
 */
export function createNetworkMonitor(
  config?: Partial<NetworkMonitorConfig>,
): NetworkMonitor {
  return new NetworkMonitor(config);
}
