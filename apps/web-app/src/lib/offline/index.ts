/**
 * Offline Module
 *
 * Exports for offline VAD, TTS caching, and fallback orchestration.
 *
 * Phase 9: Offline & Low-Latency Fallback
 */

// Types
export * from "./types";

// WebRTC VAD
export {
  WebRTCVADProcessor,
  VADAudioManager,
  createVADProcessor,
  createVADAudioManager,
} from "./webrtcVAD";

// TTS Cache
export { TTSCacheManager, createTTSCacheManager } from "./ttsCacheManager";

// Fallback Orchestration
export {
  OfflineFallbackManager,
  createOfflineFallbackManager,
} from "./offlineFallback";
