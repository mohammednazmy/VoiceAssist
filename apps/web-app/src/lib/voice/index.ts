/**
 * Voice Module
 *
 * Unified voice processing module for VoiceAssist.
 * Provides transport abstraction, adaptive bitrate control,
 * and echo cancellation monitoring.
 *
 * Phase: WebSocket Advanced Features
 */

// Transport layer
export * from "./transports";

// Adaptive bitrate
export {
  AdaptiveBitrateController,
  createAdaptiveBitrateController,
  type AdaptiveBitrateConfig,
  type AudioQualityLevel,
  type AudioQualityProfile,
  type AudioCodec,
  type QualityChangeEvent,
  type QualityChangeHandler,
  DEFAULT_QUALITY_PROFILES,
  DEFAULT_NETWORK_QUALITY_MAPPING,
  DEFAULT_ADAPTIVE_BITRATE_CONFIG,
  createEncoderConfig,
  resampleAudio,
  floatToPcm16,
  pcm16ToFloat,
} from "./AdaptiveBitrateController";

// AEC monitoring
export {
  AECMonitor,
  createAECMonitor,
  type AECState,
  type AECMetrics,
  type AECMonitorConfig,
  type AECEventType,
  type AECEvent,
  type AECEventHandler,
} from "./AECMonitor";

// Transport session hook
export {
  useTransportSession,
  createTransportSessionConfig,
  type TransportSessionConfig,
  type TransportSessionState,
  type TransportSessionCallbacks,
  type UseTransportSessionOptions,
} from "./useTransportSession";
