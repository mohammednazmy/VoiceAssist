/**
 * Offline Module Types
 *
 * Type definitions for offline VAD, TTS caching,
 * and fallback orchestration.
 *
 * Phase 9: Offline & Low-Latency Fallback
 */

// ============================================================================
// VAD Types
// ============================================================================

/**
 * VAD processing mode (0=quality, 3=aggressive)
 */
export type VADMode = 0 | 1 | 2 | 3;

/**
 * Frame duration in milliseconds
 */
export type FrameDuration = 10 | 20 | 30;

/**
 * Result from VAD audio frame processing
 */
export interface VADFrameResult {
  /** Whether speech was detected in this frame */
  isSpeech: boolean;

  /** RMS energy level (0-1) */
  energy: number;

  /** Zero-crossing rate (0-1) */
  zeroCrossingRate: number;

  /** Processing timestamp */
  timestamp: number;
}

/**
 * VAD speech segment event
 */
export interface VADSpeechSegment {
  /** Segment start timestamp */
  startTime: number;

  /** Segment end timestamp */
  endTime: number;

  /** Duration in milliseconds */
  duration: number;

  /** Average energy during segment */
  averageEnergy: number;

  /** Peak energy during segment */
  peakEnergy: number;
}

/**
 * VAD configuration
 */
export interface VADConfig {
  /** VAD mode (0=quality, 3=aggressive) */
  mode: VADMode;

  /** Frame duration in ms */
  frameDuration: FrameDuration;

  /** Target sample rate */
  sampleRate: number;

  /** Energy threshold for speech detection */
  energyThreshold: number;

  /** Zero-crossing rate threshold */
  zcrThreshold: number;

  /** Minimum consecutive speech frames for detection */
  minSpeechFrames: number;

  /** Minimum consecutive silence frames for end detection */
  minSilenceFrames: number;
}

/**
 * Default VAD configuration
 */
export const DEFAULT_VAD_CONFIG: VADConfig = {
  mode: 2,
  frameDuration: 20,
  sampleRate: 16000,
  energyThreshold: 0.02,
  zcrThreshold: 0.3,
  minSpeechFrames: 3,
  minSilenceFrames: 10,
};

// ============================================================================
// TTS Cache Types
// ============================================================================

/**
 * TTS cache entry
 */
export interface TTSCacheEntry {
  /** Unique cache key */
  key: string;

  /** Original text */
  text: string;

  /** Voice identifier */
  voice: string;

  /** Cached audio data */
  audioBuffer: ArrayBuffer;

  /** Creation timestamp */
  createdAt: number;

  /** Last access timestamp */
  lastAccessedAt: number;

  /** Access count for LRU */
  accessCount: number;

  /** Audio duration in seconds */
  duration: number;

  /** Size in bytes */
  sizeBytes: number;
}

/**
 * TTS cache configuration
 */
export interface TTSCacheConfig {
  /** Maximum cache size in MB */
  maxSizeMB: number;

  /** Maximum entry age in ms */
  maxAge: number;

  /** Whether to preload common phrases */
  cacheCommonPhrases: boolean;

  /** Database name for IndexedDB */
  dbName: string;

  /** Store name for IndexedDB */
  storeName: string;
}

/**
 * Default TTS cache configuration
 */
export const DEFAULT_TTS_CACHE_CONFIG: TTSCacheConfig = {
  maxSizeMB: 50,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  cacheCommonPhrases: true,
  dbName: "voiceassist_tts_cache",
  storeName: "cache",
};

/**
 * TTS cache statistics
 */
export interface TTSCacheStats {
  /** Number of cached entries */
  entryCount: number;

  /** Total size in MB */
  sizeMB: number;

  /** Cache hit rate */
  hitRate: number;

  /** Total cache hits */
  totalHits: number;

  /** Total cache misses */
  totalMisses: number;

  /** Oldest entry age in ms */
  oldestEntryAge: number;

  /** Most accessed entry */
  mostAccessedEntry: string | null;
}

/**
 * Common phrases to preload for responsive TTS
 */
export const COMMON_TTS_PHRASES = [
  // English acknowledgments
  "I'm listening",
  "Go ahead",
  "Please continue",
  "I understand",
  "Let me think about that",
  "One moment please",
  "Certainly",
  "Of course",
  "I see",
  "Got it",

  // Transitions
  "Here's what I found",
  "Let me help you with that",
  "I'll look into that",
  "Good question",

  // Prompts
  "Could you repeat that?",
  "I didn't quite catch that",
  "Can you clarify?",

  // Arabic phrases
  "أنا أستمع",
  "تفضل",
  "أفهم",
  "لحظة من فضلك",
  "حسناً",
  "بالتأكيد",
] as const;

// ============================================================================
// Fallback Orchestration Types
// ============================================================================

/**
 * Network connectivity status
 */
export type NetworkStatus = "online" | "offline" | "slow" | "unknown";

/**
 * Fallback mode
 */
export type FallbackMode = "normal" | "offline" | "low-latency";

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /** Enable automatic fallback */
  autoFallback: boolean;

  /** Network check interval in ms */
  networkCheckInterval: number;

  /** Latency threshold for slow network (ms) */
  slowNetworkThreshold: number;

  /** Timeout for network check (ms) */
  networkCheckTimeout: number;

  /** Enable TTS caching */
  enableTTSCache: boolean;

  /** Enable offline VAD */
  enableOfflineVAD: boolean;

  /** Endpoint for network health check */
  healthCheckEndpoint: string | null;
}

/**
 * Default fallback configuration
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  autoFallback: true,
  networkCheckInterval: 5000,
  slowNetworkThreshold: 500,
  networkCheckTimeout: 3000,
  enableTTSCache: true,
  enableOfflineVAD: true,
  healthCheckEndpoint: null,
};

/**
 * Fallback state
 */
export interface FallbackState {
  /** Current network status */
  networkStatus: NetworkStatus;

  /** Current fallback mode */
  mode: FallbackMode;

  /** Whether using cached TTS */
  usingCachedTTS: boolean;

  /** Whether using offline VAD */
  usingOfflineVAD: boolean;

  /** Last successful network request timestamp */
  lastSuccessfulRequest: number | null;

  /** Current network latency (ms) */
  currentLatency: number | null;

  /** Number of consecutive failures */
  consecutiveFailures: number;
}

/**
 * Fallback event types
 */
export type FallbackEventType =
  | "network_change"
  | "mode_change"
  | "cache_hit"
  | "cache_miss"
  | "vad_switch"
  | "latency_update";

/**
 * Fallback event
 */
export interface FallbackEvent {
  type: FallbackEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Fallback event callback
 */
export type FallbackEventCallback = (event: FallbackEvent) => void;

// ============================================================================
// Offline VAD Hook Types
// ============================================================================

/**
 * Options for useOfflineVAD hook
 */
export interface UseOfflineVADOptions {
  /** Enable the VAD */
  enabled?: boolean;

  /** VAD mode */
  mode?: VADMode;

  /** Frame duration */
  frameDuration?: FrameDuration;

  /** Callback when speech starts */
  onSpeechStart?: () => void;

  /** Callback when speech ends */
  onSpeechEnd?: (segment: VADSpeechSegment) => void;

  /** Callback for each processed frame */
  onFrame?: (result: VADFrameResult) => void;
}

/**
 * Return type for useOfflineVAD hook
 */
export interface UseOfflineVADReturn {
  /** Whether VAD is currently listening */
  isListening: boolean;

  /** Whether speech is currently detected */
  isSpeaking: boolean;

  /** Current energy level */
  currentEnergy: number;

  /** Start listening on a media stream */
  startListening: (stream: MediaStream) => Promise<void>;

  /** Stop listening */
  stopListening: () => void;

  /** Reset VAD state */
  reset: () => void;
}
