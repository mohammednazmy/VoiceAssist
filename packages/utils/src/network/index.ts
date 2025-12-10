/**
 * Network Utilities
 *
 * Network resilience and connection quality management.
 *
 * Phase 6: Edge Case Hardening
 */

export {
  NetworkResilienceManager,
  createNetworkResilienceManager,
  DEFAULT_NETWORK_CONFIG,
  type NetworkQuality,
  type NetworkMetrics,
  type NetworkResilienceConfig,
  type DegradationStrategy,
  type NetworkEvent,
  type NetworkEventType,
  type NetworkEventCallback,
} from "./networkResilienceManager";
