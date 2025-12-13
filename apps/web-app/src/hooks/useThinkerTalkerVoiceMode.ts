/**
 * Thinker/Talker Voice Mode Hook
 *
 * Unified hook that combines T/T session management with audio playback.
 * This is the main entry point for voice mode using the Thinker/Talker pipeline.
 *
 * Provides:
 * - WebSocket connection to T/T pipeline
 * - Microphone capture and streaming
 * - Streaming audio playback
 * - Barge-in handling
 * - Integration with conversation store
 * - Metrics tracking
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useThinkerTalkerSession,
  type TTConnectionStatus,
  type PipelineState,
  type TTTranscript,
  type TTToolCall,
  type TTVoiceMetrics,
  type TTVoiceSettings,
  type TTEmotionResult,
  type TTBackchannelEvent,
  type TTThinkingStateEvent,
  type TTTranscriptTruncation,
  type TTAdvancedSettings,
  type TTBargeInClassification,
} from "./useThinkerTalkerSession";
import {
  useTTAudioPlayback,
  type TTPlaybackState,
  type AudioChunkData,
} from "./useTTAudioPlayback";
import { useBackchannelAudio } from "./useBackchannelAudio";
import { useBargeInPromptAudio } from "./useBargeInPromptAudio";
import { useSileroVAD } from "./useSileroVAD";
import { useAECFeedback, type AECQuality } from "./useAECFeedback";
import { useNetworkQuality } from "./useNetworkQuality";
import {
  useUnifiedConversationStore,
  type MessageSource,
} from "../stores/unifiedConversationStore";
import { useAuthStore } from "../stores/authStore";
import {
  VAD_PRESET_OPTIONS,
  useVoiceSettingsStore,
  type VADPresetType,
} from "../stores/voiceSettingsStore";
import { useAuth } from "./useAuth";
import { useFeatureFlag } from "./useExperiment";
import {
  VoiceActivityDetector,
  DEFAULT_VAD_CONFIG,
} from "../utils/vad";
import { voiceLog } from "../lib/logger";

// Import type for canonical voice state mapping helper
import type { VoiceState } from "../stores/unifiedConversationStore";

// ============================================================================
// Types
// ============================================================================

export interface TTVoiceModeOptions {
  /** Conversation ID for context */
  conversation_id?: string;
  /** Voice settings */
  voiceSettings?: TTVoiceSettings;
  /** Enable long-form document reading mode for this voice session */
  readingModeEnabled?: boolean;
  /** Reading speed preference for TTS */
  readingSpeed?: "slow" | "normal" | "fast";
  /** Reading detail preference (short summary vs full detail) */
  readingDetail?: "short" | "full";
  /** Voice-level PHI policy ("clinical" for normal, "demo" for PHI-conscious) */
  phiMode?: "clinical" | "demo";
  /** Volume for playback (0-1) */
  volume?: number;
  /** Auto-connect when hook mounts */
  autoConnect?: boolean;
  /** Callback when user transcript is received */
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  /** Callback when AI response is received */
  onAIResponse?: (text: string, isFinal: boolean) => void;
  /** Callback when a tool is called */
  onToolCall?: (toolCall: TTToolCall) => void;
  /** Callback when metrics are updated */
  onMetricsUpdate?: (metrics: TTVoiceMetrics) => void;
  /** Callback when user emotion is detected (Phase 1: Hume AI) */
  onEmotionDetected?: (emotion: TTEmotionResult) => void;
  /** Enable backchannel audio playback (Phase 2) */
  enableBackchannel?: boolean;
  /** Callback when backchannel plays (Phase 2) */
  onBackchannelPlay?: (phrase: string) => void;
  /** Phase 6.3: Callback when network quality degrades to poor */
  onNetworkDegraded?: (info: {
    quality: string;
    rttMs: number | null;
    recommendation: string;
  }) => void;
  /** Phase 6.3: Callback when network quality recovers from poor */
  onNetworkRecovered?: (info: {
    quality: string;
    rttMs: number | null;
  }) => void;

  // Silero VAD Feature Flag Options
  // These are controlled via admin panel feature flags (backend.voice_silero_*)

  /**
   * Enable/disable Silero VAD entirely
   * Feature flag: backend.voice_silero_vad_enabled
   * Default: true
   */
  sileroVADEnabled?: boolean;

  /**
   * Echo suppression mode during AI playback
   * Feature flag: backend.voice_silero_echo_suppression_mode
   * Default: "threshold_boost"
   */
  sileroEchoSuppressionMode?: "none" | "pause" | "threshold_boost";

  /**
   * Base speech detection threshold (0-1)
   * Feature flag: backend.voice_silero_positive_threshold
   * Default: 0.5
   */
  sileroPositiveThreshold?: number;

  /**
   * Threshold boost added during AI playback
   * Feature flag: backend.voice_silero_playback_threshold_boost
   * Default: 0.2
   */
  sileroPlaybackThresholdBoost?: number;

  /**
   * Minimum speech duration in ms
   * Feature flag: backend.voice_silero_min_speech_ms
   * Default: 150
   */
  sileroMinSpeechMs?: number;

  /**
   * Minimum speech duration during AI playback in ms
   * Feature flag: backend.voice_silero_playback_min_speech_ms
   * Default: 200
   */
  sileroPlaybackMinSpeechMs?: number;
}

interface SileroFlagConfig {
  enabled: boolean;
  echoSuppressionMode: "none" | "pause" | "threshold_boost";
  positiveThreshold: number;
  playbackThresholdBoost: number;
  minSpeechMs: number;
  playbackMinSpeechMs: number;
  confidenceSharing: boolean;
  /** Backend-driven barge-in quality preset: responsive, balanced, smooth */
  qualityPreset: "responsive" | "balanced" | "smooth";
}

interface EchoPolicy {
  playbackThresholdBoost: number;
  playbackMinSpeechMs: number;
}

// Grace period after playback starts during which speech detection
// events are likely to be TTS echo and should not trigger barge-in.
// Kept short to preserve responsiveness while avoiding early misfires.
const PLAYBACK_ECHO_GRACE_MS = 350;

function getEchoPolicyForAecQuality(
  basePlaybackThresholdBoost: number,
  basePlaybackMinSpeechMs: number,
  quality: AECQuality,
): EchoPolicy {
  // NOTE: AEC-aware tuning should never make barge-in feel unresponsive.
  // These adjustments are intentionally small and are further clamped
  // downstream so that even on "poor" AEC devices, local VAD can still
  // detect barge-in quickly and let backend rollback handle misfires.
  switch (quality) {
    case "fair":
      return {
        playbackThresholdBoost: Math.min(
          basePlaybackThresholdBoost + 0.02,
          0.5,
        ),
        playbackMinSpeechMs: basePlaybackMinSpeechMs + 25,
      };
    case "poor":
      return {
        playbackThresholdBoost: Math.min(
          basePlaybackThresholdBoost + 0.03,
          0.5,
        ),
        playbackMinSpeechMs: basePlaybackMinSpeechMs + 50,
      };
    case "excellent":
    case "good":
    case "unknown":
    default:
      return {
        playbackThresholdBoost: basePlaybackThresholdBoost,
        playbackMinSpeechMs: basePlaybackMinSpeechMs,
      };
  }
}

/**
 * Pure helper to map backend pipeline state into the canonical
 * frontend voice state used by the unified conversation store.
 *
 * This is intentionally side-effect free and is covered by unit
 * tests to avoid needing to render the full hook in Vitest.
 */
export function mapPipelineStateToVoiceState(
  state: PipelineState,
): VoiceState {
  switch (state) {
    case "listening":
      return "listening";
    case "processing":
      return "processing";
    case "speaking":
      // Frontend voice state uses "responding" for AI speech
      return "responding";
    case "cancelled":
    case "idle":
      return "idle";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

export interface TTVoiceModeReturn {
  // Connection State
  connectionStatus: TTConnectionStatus;
  pipelineState: PipelineState;
  isConnected: boolean;
  isConnecting: boolean;
  isReady: boolean;
  isMicPermissionDenied: boolean;

  // Audio State
  playbackState: TTPlaybackState;
  isPlaying: boolean;
  isSpeaking: boolean;
  isListening: boolean;

  // Transcription
  partialTranscript: string;
  finalTranscript: string;
  /** Phase 5.1: Streaming AI response text for progressive display */
  partialAIResponse: string;
  /** Phase 5.2: Last truncation result from barge-in */
  lastTruncation: TTTranscriptTruncation | null;

  // Tool Calls
  currentToolCalls: TTToolCall[];

  // Metrics
  metrics: TTVoiceMetrics;
  ttfaMs: number | null;

  // Error
  error: Error | null;

  // Phase 1: Emotion Detection
  currentEmotion: TTEmotionResult | null;

  // Phase 2: Backchanneling
  backchannelPhrase: string | null;
  isBackchanneling: boolean;

  // Issue 1: Unified thinking feedback
  /** Source of thinking feedback ("backend" when server is handling tones) */
  thinkingSource: "backend" | "frontend";

  // Local VAD (Silero)
  /** Whether Silero VAD is actively listening for speech */
  isSileroVADActive: boolean;
  /** Whether Silero VAD is loading/initializing */
  isSileroVADLoading: boolean;

  // Phase 1: Echo-Aware VAD
  /** Whether AI playback is active (echo suppression may be engaged) */
  isSileroVADEchoSuppressed: boolean;
  /** Current effective VAD threshold (may be boosted during playback) */
  sileroVADEffectiveThreshold: number;

  // Phase 2: VAD Confidence Sharing
  /** Current speech probability from Silero VAD (0-1) */
  sileroVADConfidence: number;
  /** Current speech duration in milliseconds */
  sileroVADSpeechDurationMs: number;

  /**
   * Whether a local RMS-based VAD fallback is currently active because Silero VAD
   * is unavailable (e.g., blocked assets / unsupported environment).
   */
  isFallbackVADActive: boolean;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  bargeIn: (playVoicePrompt?: boolean) => void;
  sendTextMessage: (text: string) => void;
  setVolume: (volume: number) => void;
  resetError: () => void;

  /**
   * Play a barge-in voice prompt using ElevenLabs TTS.
   * Uses the same voice as the main AI responses for consistency.
   * Pass to BargeInFeedback's onPlayVoicePrompt prop.
   */
  playBargeInPrompt: (text?: string) => Promise<void>;

  /** Whether barge-in prompts are ready (pre-cached) */
  isBargeInPromptReady: boolean;

  // Natural Conversation Flow: Phase 1 - Manual Override Controls
  /** Whether microphone is muted */
  isMuted: boolean;
  /** Toggle microphone mute state */
  toggleMute: () => void;
  /** Force AI to respond immediately (ends user turn) */
  forceReply: () => void;
  /** Immediately stop AI speech (without voice prompt) */
  stopAI: () => void;

  // Natural Conversation Flow: Phase 3.2 - Continuation Detection
  /** Whether the system expects the user to continue speaking */
  isContinuationExpected: boolean;

  // Natural Conversation Flow: Phase 6 - Network-Adaptive Behavior
  /** Current network quality level */
  networkQuality: "excellent" | "good" | "fair" | "poor" | "unknown";
  /** RTT latency in milliseconds (null if unknown) */
  networkRttMs: number | null;
  /** Phase 6.3: Whether network is in degraded state (poor quality) */
  isNetworkDegraded: boolean;

  /** Whether backend recommends push-to-talk due to high background noise */
  pushToTalkRecommended: boolean;
}

// ============================================================================
// Helper Functions (exported for testing)
// ============================================================================

/**
 * Maps VAD preset + sensitivity + personalized threshold into Silero-positiveThreshold/minSpeechMs parameters.
 * Exported for unit testing.
 */
export function mapVadPresetAndSensitivityToSileroParams(
  baseConfig: { positiveThreshold: number; minSpeechMs: number },
  options: {
    vadPreset: VADPresetType;
    vadSensitivity?: number | null;
    personalizedVadThreshold?: number | null;
    vadCustomEnergyThresholdDb: number;
    vadCustomSilenceDurationMs: number;
  },
): { positiveThreshold: number; minSpeechMs: number } {
  const sensitivity = options.vadSensitivity ?? 50;
  const normalized = (sensitivity - 50) / 50;

  const preset =
    VAD_PRESET_OPTIONS.find((p) => p.value === options.vadPreset) ??
    VAD_PRESET_OPTIONS.find((p) => p.value === "balanced")!;

  const presetEnergyDb =
    options.vadPreset === "custom"
      ? options.vadCustomEnergyThresholdDb
      : preset.energyThresholdDb;

  const rawFromPreset = (presetEnergyDb + 50) / 30;
  const normalizedFromPreset = Math.min(0.9, Math.max(0.1, rawFromPreset));

  const hasPersonalized =
    typeof options.personalizedVadThreshold === "number" &&
    Number.isFinite(options.personalizedVadThreshold) &&
    options.personalizedVadThreshold > 0;

  const baseThresholdRaw = hasPersonalized
    ? (options.personalizedVadThreshold as number)
    : normalizedFromPreset || baseConfig.positiveThreshold;

  const baseThreshold = Math.min(0.6, Math.max(0.25, baseThresholdRaw));

  const baseMinSpeechMs =
    options.vadPreset === "custom"
      ? Math.max(50, Math.min(500, options.vadCustomSilenceDurationMs))
      : preset.minSpeechDurationMs || baseConfig.minSpeechMs;

  const maxThresholdDelta = 0.12;
  const maxMinSpeechDeltaMs = 80;

  const adjustedThreshold = Math.min(
    0.6,
    Math.max(0.25, baseThreshold - normalized * maxThresholdDelta),
  );

  const adjustedMinSpeechMs = Math.min(
    140,
    Math.max(
      50,
      Math.round(baseMinSpeechMs - normalized * maxMinSpeechDeltaMs),
    ),
  );

  return {
    positiveThreshold: adjustedThreshold,
    minSpeechMs: adjustedMinSpeechMs,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useThinkerTalkerVoiceMode(
  options: TTVoiceModeOptions = {},
): TTVoiceModeReturn {
  const {
    conversation_id,
    voiceSettings,
    volume = 1,
    autoConnect = false,
    readingModeEnabled = false,
    readingSpeed = "normal",
    readingDetail = "full",
    phiMode = "clinical",
    onUserTranscript,
    onAIResponse,
    onToolCall,
    onMetricsUpdate,
    onEmotionDetected,
    enableBackchannel = true,
    onBackchannelPlay,
    // Silero VAD Feature Flag Options (sane defaults).
    // Note: overly aggressive local VAD tuning can cause echo-triggered barge-ins
    // that prematurely cancel AI playback (truncated/choppy responses).
    sileroVADEnabled = true,
    sileroEchoSuppressionMode = "threshold_boost",
    sileroPositiveThreshold = 0.45,
    sileroPlaybackThresholdBoost = 0.2,
    sileroMinSpeechMs = 160,
    sileroPlaybackMinSpeechMs = 200,
  } = options;

  // Detect automated browser environments (Playwright/WebDriver) to dial down noisy hooks
  const isAutomation =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { webdriver?: boolean }).webdriver;

  // Allow tests to explicitly enable Silero VAD even in automation
  // Tests can set localStorage.setItem('voiceassist-force-silero-vad', 'true')
  const forceSileroVAD =
    typeof window !== "undefined" &&
    window.localStorage?.getItem("voiceassist-force-silero-vad") === "true";

  // Allow tests to explicitly enable instant barge-in even in automation
  // Tests can set localStorage.setItem('voiceassist-force-instant-barge-in', 'true')
  // This is important for E2E tests that need to test the full barge-in pipeline
  const forceInstantBargeIn =
    typeof window !== "undefined" &&
    window.localStorage?.getItem("voiceassist-force-instant-barge-in") ===
      "true";

  const { apiClient } = useAuth();

  const defaultSileroConfig: SileroFlagConfig = useMemo(
    () => ({
      // Silero VAD is primary for barge-in detection - always enabled by default
      // forceSileroVAD can override if sileroVADEnabled is false
      enabled: forceSileroVAD || sileroVADEnabled,
      echoSuppressionMode: sileroEchoSuppressionMode,
      positiveThreshold: sileroPositiveThreshold,
      playbackThresholdBoost: sileroPlaybackThresholdBoost,
      minSpeechMs: sileroMinSpeechMs,
      playbackMinSpeechMs: sileroPlaybackMinSpeechMs,
      confidenceSharing: true,
      qualityPreset: "balanced",
    }),
    [
      sileroEchoSuppressionMode,
      sileroMinSpeechMs,
      sileroPlaybackMinSpeechMs,
      sileroPlaybackThresholdBoost,
      sileroPositiveThreshold,
      sileroVADEnabled,
      forceSileroVAD,
    ],
  );

  const [sileroFlags, setSileroFlags] =
    useState<SileroFlagConfig>(defaultSileroConfig);
  const [sileroFlagsLoaded, setSileroFlagsLoaded] = useState(false);

  // User-specific VAD preferences from settings store
  const {
    vadSensitivity,
    vadPreset,
    vadCustomEnergyThresholdDb,
    vadCustomSilenceDurationMs,
    enableOfflineFallback,
    vadCalibrated,
    personalizedVadThreshold,
    enableBehaviorLearning,
    storeTranscriptHistory,
    setVadCalibrated,
    setLastCalibrationDate,
    setPersonalizedVadThreshold,
  } = useVoiceSettingsStore((state) => ({
    vadSensitivity: state.vadSensitivity,
    vadPreset: state.vadPreset,
    vadCustomEnergyThresholdDb: state.vadCustomEnergyThresholdDb,
    vadCustomSilenceDurationMs: state.vadCustomSilenceDurationMs,
    enableOfflineFallback: state.enableOfflineFallback,
    vadCalibrated: state.vadCalibrated,
    personalizedVadThreshold: state.personalizedVadThreshold,
    enableBehaviorLearning: state.enableBehaviorLearning,
    storeTranscriptHistory: state.storeTranscriptHistory,
    setVadCalibrated: state.setVadCalibrated,
    setLastCalibrationDate: state.setLastCalibrationDate,
    setPersonalizedVadThreshold: state.setPersonalizedVadThreshold,
  }));

  // Phase 1: Emotion state
  const [currentEmotion, setCurrentEmotion] = useState<TTEmotionResult | null>(
    null,
  );

  // Issue 1: Unified thinking feedback - track source
  const [thinkingSource, setThinkingSource] = useState<"backend" | "frontend">(
    "frontend",
  );

  // Natural Conversation Flow: Phase 1 - Manual Override Controls
  const [isMuted, setIsMuted] = useState(false);

  // AEC capability classification (excellent/good/fair/poor/unknown)
  const [aecQuality, setAecQuality] = useState<AECQuality>("unknown");
  const aecQualityRef = useRef<AECQuality>("unknown");

  // Refs for Silero VAD barge-in (avoid stale closures and debouncing)
  const lastBargeInTimeRef = useRef<number>(0);
  // Base debounce; actual value is derived from barge-in quality preset
  // so that "responsive"/"balanced"/"smooth" presets feel consistent
  // with backend HybridVAD thresholds.
  const BASE_BARGE_IN_DEBOUNCE_MS = 200;

  // Deduplication guard for final AI responses. Tracks the most recent
  // normalized response text so that duplicate completions do not show
  // up twice in the chat UI. Normalization is intentionally aggressive
  // (case/punctuation/whitespace), and this state is in-memory only.
  const lastFinalResponseRef = useRef<{
    normalizedText: string;
    timestamp: number;
  } | null>(null);

  // Ref to track "natural completion" mode - when backend has finished TTS generation
  // but local audio buffer is still draining. In this state, any speech_started events
  // from backend VAD are likely speaker echo (the AI's own audio being picked up by mic)
  // and should NOT trigger barge-in.
  const naturalCompletionModeRef = useRef<boolean>(false);

  // Track when playback most recently started for echo-aware barge-in.
  // Used to ignore very early speech_start events that are likely TTS echo.
  const lastPlaybackStartAtRef = useRef<number | null>(null);

  // Ref to track previous pipeline state for detecting speaking -> listening transitions
  const previousPipelineStateRef = useRef<PipelineState | null>(null);

  // Ref for sileroVAD to avoid including entire object in effect dependencies
  // Declared early so it can be used in audioPlayback callbacks
  const sileroVADRef = useRef<ReturnType<typeof useSileroVAD> | null>(null);
  const sileroRollbackTimeoutRef = useRef<number | null>(null);
  const localBargeInConfirmTimeoutRef = useRef<number | null>(null);
  // Track if we've started VAD to avoid multiple starts
  const vadStartedRef = useRef(false);
  const [sileroUnavailable, setSileroUnavailable] = useState(false);
  const fallbackVadRef = useRef<VoiceActivityDetector | null>(null);
  const fallbackVadStreamRef = useRef<MediaStream | null>(null);
  const [isFallbackVADActive, setIsFallbackVADActive] = useState(false);
  const clearSileroRollbackTimeout = useCallback(() => {
    if (sileroRollbackTimeoutRef.current) {
      clearTimeout(sileroRollbackTimeoutRef.current);
      sileroRollbackTimeoutRef.current = null;
    }
  }, []);
  const clearLocalBargeInConfirmTimeout = useCallback(() => {
    if (localBargeInConfirmTimeoutRef.current) {
      clearTimeout(localBargeInConfirmTimeoutRef.current);
      localBargeInConfirmTimeoutRef.current = null;
    }
  }, []);

  // Get store actions
  const {
    setVoiceConnectionStatus,
    setVoiceState,
    setPartialTranscript,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
  } = useUnifiedConversationStore();

  // Get auth token for API calls
  const tokens = useAuthStore((state) => state.tokens);
  const getAccessToken = useCallback(
    () => tokens?.accessToken || null,
    [tokens],
  );

  // Derive barge-in debounce from quality preset so that
  // frontend Silero and backend HybridVAD share a coherent
  // "responsiveness" profile.
  const bargeInDebounceMs = useMemo(() => {
    switch (sileroFlags.qualityPreset) {
      case "balanced":
        return BASE_BARGE_IN_DEBOUNCE_MS;
      case "smooth":
        return BASE_BARGE_IN_DEBOUNCE_MS + 100;
      case "responsive":
      default:
        return Math.max(100, BASE_BARGE_IN_DEBOUNCE_MS - 50);
    }
  }, [sileroFlags.qualityPreset]);

  // Track last backend barge-in classification for UI/analytics.
  const [lastBargeInClassification, setLastBargeInClassification] =
    useState<TTBargeInClassification | null>(null);

  useEffect(() => {
    if (isAutomation) {
      // In automation, skip network flag fetch to reduce noise and rate limits
      setSileroFlagsLoaded(true);
      return;
    }

    let cancelled = false;
    const parseNumberFlag = (
      flag: { value?: unknown; default_value?: unknown } | null,
      fallback: number,
    ): number => {
      const raw =
        typeof flag?.value === "number"
          ? flag.value
          : typeof flag?.value === "string"
            ? Number.parseFloat(flag.value)
            : undefined;
      const defaultRaw =
        typeof flag?.default_value === "number"
          ? flag.default_value
          : typeof flag?.default_value === "string"
            ? Number.parseFloat(flag.default_value)
            : undefined;
      if (Number.isFinite(raw)) return raw as number;
      if (Number.isFinite(defaultRaw)) return defaultRaw as number;
      return fallback;
    };

    const parseBooleanFlag = (
      flag: { enabled?: boolean; value?: unknown } | null,
      fallback: boolean,
    ): boolean => {
      if (typeof flag?.enabled === "boolean") return flag.enabled;
      if (typeof flag?.value === "boolean") return flag.value;
      if (typeof flag?.value === "string") return flag.value === "true";
      return fallback;
    };

    const loadSileroFlags = async () => {
      if (!apiClient) {
        setSileroFlags(defaultSileroConfig);
        setSileroFlagsLoaded(true);
        return;
      }

      try {
        const flagNames = [
          "backend.voice_silero_vad_enabled",
          "backend.voice_silero_echo_suppression_mode",
          "backend.voice_silero_positive_threshold",
          "backend.voice_silero_playback_threshold_boost",
          "backend.voice_silero_min_speech_ms",
          "backend.voice_silero_playback_min_speech_ms",
          "backend.voice_silero_vad_confidence_sharing",
          "backend.voice_barge_in_quality_preset",
        ];

        const responses = await Promise.all(
          flagNames.map(async (name) => {
            try {
              return await apiClient.getFeatureFlag(name);
            } catch (err) {
              voiceLog.debug(
                `[TTVoiceMode] Failed to fetch feature flag ${name}:`,
                err,
              );
              return null;
            }
          }),
        );

        if (cancelled) return;

        const byName = Object.fromEntries(
          responses
            .filter((f): f is NonNullable<typeof f> => f !== null && typeof f === "object" && "name" in f)
            .map((flag) => [flag.name, flag]),
        );

        const echoModeRaw =
          byName["backend.voice_silero_echo_suppression_mode"];
        const echoMode =
          typeof echoModeRaw?.value === "string" &&
          ["pause", "threshold_boost", "none"].includes(
            echoModeRaw.value as string,
          )
            ? (echoModeRaw.value as SileroFlagConfig["echoSuppressionMode"])
            : defaultSileroConfig.echoSuppressionMode;

        const qualityRaw = byName["backend.voice_barge_in_quality_preset"];
        const quality =
          typeof qualityRaw?.value === "string" &&
          ["responsive", "balanced", "smooth"].includes(
            qualityRaw.value as string,
          )
            ? (qualityRaw.value as SileroFlagConfig["qualityPreset"])
            : defaultSileroConfig.qualityPreset;

        // For the enabled flag, respect local overrides (forceSileroVAD or
        // sileroVADEnabled prop) even if backend says false. This allows
        // developers and users to force-enable VAD for testing/debugging.
        const backendEnabledFlag = parseBooleanFlag(
          byName["backend.voice_silero_vad_enabled"] ?? null,
          true, // Default to true if flag not found
        );
        // Local override: if forceSileroVAD is set or sileroVADEnabled prop
        // is explicitly true, always enable VAD regardless of backend flag
        const effectiveEnabled =
          defaultSileroConfig.enabled || backendEnabledFlag;

        setSileroFlags({
          enabled: effectiveEnabled,
          echoSuppressionMode: echoMode,
          positiveThreshold: parseNumberFlag(
            byName["backend.voice_silero_positive_threshold"] ?? null,
            defaultSileroConfig.positiveThreshold,
          ),
          playbackThresholdBoost: parseNumberFlag(
            byName["backend.voice_silero_playback_threshold_boost"] ?? null,
            defaultSileroConfig.playbackThresholdBoost,
          ),
          minSpeechMs: parseNumberFlag(
            byName["backend.voice_silero_min_speech_ms"] ?? null,
            defaultSileroConfig.minSpeechMs,
          ),
          playbackMinSpeechMs: parseNumberFlag(
            byName["backend.voice_silero_playback_min_speech_ms"] ?? null,
            defaultSileroConfig.playbackMinSpeechMs,
          ),
          confidenceSharing: parseBooleanFlag(
            byName["backend.voice_silero_vad_confidence_sharing"] ?? null,
            defaultSileroConfig.confidenceSharing,
          ),
          qualityPreset: quality,
        });
      } catch (err) {
        if (!cancelled) {
          voiceLog.warn(
            "[TTVoiceMode] Failed to load Silero VAD flags, using defaults",
            err,
          );
          setSileroFlags(defaultSileroConfig);
        }
      } finally {
        if (!cancelled) {
          setSileroFlagsLoaded(true);
        }
      }
    };

    loadSileroFlags();

    return () => {
      cancelled = true;
    };
  }, [apiClient, defaultSileroConfig]);

  // Phase 2: Backchannel audio hook
  const backchannelAudio = useBackchannelAudio({
    volume: volume * 0.6, // Backchannels at 60% of main volume
    enabled: enableBackchannel,
    onPlayStart: (phrase) => {
      voiceLog.debug(`[TTVoiceMode] Backchannel playing: "${phrase}"`);
      onBackchannelPlay?.(phrase);
    },
    onPlayEnd: (phrase) => {
      voiceLog.debug(`[TTVoiceMode] Backchannel ended: "${phrase}"`);
    },
  });

  // Barge-in prompt audio hook - uses ElevenLabs TTS for consistent voice
  const bargeInPromptAudio = useBargeInPromptAudio({
    voiceId: voiceSettings?.voice_id,
    language:
      (voiceSettings?.language as
        | "en"
        | "ar"
        | "es"
        | "fr"
        | "de"
        | "zh"
        | "ja"
        | "ko"
        | "pt"
        | "ru"
        | "hi"
        | "tr") || "en",
    provider: "elevenlabs",
    autoPreload: true,
    volume: volume * 0.8, // Slightly lower than main voice
    getAccessToken,
  });

  // Natural Conversation Flow: Phase 4.3 - AEC Feedback Loop
  // Monitors AEC convergence state and adjusts VAD threshold accordingly
  const aecFeedback = useAECFeedback({
    enabled: sileroFlags.enabled, // Only enable when VAD is enabled
    pollingIntervalMs: 500, // Poll every 500ms
    convergenceThresholdDb: 10, // ERLE > 10dB indicates good AEC convergence
    onAECStateChange: (state) => {
      voiceLog.debug(
        `[TTVoiceMode] AEC state changed: converged=${state.isConverged}, ` +
          `erle=${state.erleDb?.toFixed(1) ?? "N/A"}dB, quality=${state.quality}`,
      );

      // Track AEC quality category for capability-aware barge-in policies
      setAecQuality(state.quality);
      aecQualityRef.current = state.quality;

      // Update Silero VAD's AEC state
      const vad = sileroVADRef.current;
      if (vad) {
        vad.setAECConverged(state.isConverged);
      }
    },
  });

  // Natural Conversation Flow: Phase 6 - Network-Adaptive Behavior
  // Monitors network quality and adjusts prebuffer size accordingly
  const networkQuality = useNetworkQuality({
    enabled: !isAutomation,
    updateInterval: 10000, // Poll every 10 seconds
    enablePing: !isAutomation,
  });

  // Phase 6.3: Graceful degradation state
  const [isNetworkDegraded, setIsNetworkDegraded] = useState(false);
  const previousNetworkQualityRef = useRef<string>(
    networkQuality.metrics.quality,
  );

  // Backend-driven recommendation to switch to push-to-talk in high-noise environments
  const [pushToTalkRecommended, setPushToTalkRecommended] = useState(false);

  // Phase 6.3: Monitor network quality changes for degradation
  useEffect(() => {
    const quality = networkQuality.metrics.quality;
    const previousQuality = previousNetworkQualityRef.current;

    // Detect degradation: transition to "poor" or sustained poor quality
    if (quality === "poor" && !isNetworkDegraded) {
      setIsNetworkDegraded(true);
      voiceLog.warn(
        `[TTVoiceMode] Network degraded to poor (RTT: ${networkQuality.metrics.rttMs}ms)`,
      );
      // Notify options callback if provided
      options.onNetworkDegraded?.({
        quality,
        rttMs: networkQuality.metrics.rttMs,
        recommendation:
          "Consider using headphones or moving to a better network",
      });
    }

    // Detect recovery: transition from "poor" to better quality
    if (
      isNetworkDegraded &&
      quality !== "poor" &&
      quality !== "unknown" &&
      previousQuality === "poor"
    ) {
      setIsNetworkDegraded(false);
      voiceLog.info(
        `[TTVoiceMode] Network recovered to ${quality} (RTT: ${networkQuality.metrics.rttMs}ms)`,
      );
      options.onNetworkRecovered?.({
        quality,
        rttMs: networkQuality.metrics.rttMs,
      });
    }

    previousNetworkQualityRef.current = quality;
  }, [
    networkQuality.metrics.quality,
    networkQuality.metrics.rttMs,
    isNetworkDegraded,
    options,
  ]);

  // Feature flag for adaptive prebuffering
  const { isEnabled: adaptivePrebufferEnabled } = useFeatureFlag(
    "backend.voice_adaptive_prebuffer",
  );

  // Local debug flag: simple TTS playback mode.
  // To avoid accidentally degrading audio quality in normal dev usage,
  // this lab mode now requires TWO localStorage flags:
  //   - voiceassist_enable_tts_lab_mode === "true"
  //   - voiceassist_simple_tts_playback === "true"
  //
  // This ensures previous one-off debugging sessions that set only
  // voiceassist_simple_tts_playback no longer force simple playback.
  const simplePlaybackDebug =
    typeof window !== "undefined" &&
    window.localStorage?.getItem("voiceassist_enable_tts_lab_mode") ===
      "true" &&
    window.localStorage?.getItem("voiceassist_simple_tts_playback") ===
      "true";

  // Audio playback hook
  const audioPlayback = useTTAudioPlayback({
    volume,
    // Enable prebuffering for smoother audio playback - prevents choppy audio
    // by buffering chunks before starting playback. In simple debug mode we
    // let the scheduler run with minimal buffering to better observe raw PCM.
    enablePrebuffering: !simplePlaybackDebug,
    // Use a smaller prebuffer to reduce perceived latency while still
    // avoiding gaps from network jitter. In simple debug mode, fall back to
    // the hook's default chunk count.
    prebufferChunks: simplePlaybackDebug ? undefined : 2,
    // Disable crossfade while we debug choppiness; this trades a tiny click
    // risk for more predictable audio scheduling.
    enableCrossfade: false,
    // Natural Conversation Flow: Phase 6 - Network-Adaptive Prebuffering
    enableAdaptivePrebuffer: adaptivePrebufferEnabled && !simplePlaybackDebug,
    networkQuality: networkQuality.metrics.quality,
    // Debug: clamp scheduler in simple playback mode
    simpleMode: simplePlaybackDebug,
    onPlaybackStart: () => {
      voiceLog.info(
        "[TTVoiceMode] Playback started - enabling echo suppression",
      );
      lastPlaybackStartAtRef.current = Date.now();
      startSpeaking();
      // Phase 1: Use echo-aware VAD API instead of pausing entirely.
      // Also ensure Silero VAD is actively listening so local barge-in
      // can mute playback within <100ms even if earlier startup logic
      // was skipped or delayed.
      //
      // The setPlaybackActive method applies echo suppression based on echoSuppressionMode:
      // - "threshold_boost": VAD stays active with higher threshold (default, recommended)
      // - "pause": VAD pauses entirely (original behavior)
      // - "none": No suppression
      const vad = sileroVADRef.current;
      if (vad) {
        if (!vad.isListening) {
          voiceLog.info(
            "[TTVoiceMode] Starting Silero VAD on playback for instant barge-in",
          );
          // Fire-and-forget; errors are handled by useSileroVAD onError path
          void vad.start();
        }
        vad.setPlaybackActive(true);
      }
    },
    onPlaybackEnd: () => {
      voiceLog.info(
        "[TTVoiceMode] Playback ended - disabling echo suppression",
      );
      stopSpeaking();
      // Clear natural completion mode - audio has finished draining
      // Now real user speech can trigger barge-in again
      naturalCompletionModeRef.current = false;
      // Phase 1: Notify VAD that playback ended
      // VAD will handle the mode-specific logic (resume if paused, restore threshold, etc.)
      const vad = sileroVADRef.current;
      if (vad) {
        vad.setPlaybackActive(false);
      }
    },
    onPlaybackInterrupted: () => {
      voiceLog.info(
        "[TTVoiceMode] Playback interrupted (barge-in) - disabling echo suppression",
      );
      stopSpeaking();
      // Clear natural completion mode on barge-in
      naturalCompletionModeRef.current = false;
      // Phase 1: Notify VAD that playback ended due to barge-in
      const vad = sileroVADRef.current;
      if (vad) {
        vad.setPlaybackActive(false);
      }
    },
    onError: (err) => {
      voiceLog.error("[TTVoiceMode] Audio playback error:", err);
    },
  });

  const { isEnabled: confidenceFlagEnabled } = useFeatureFlag(
    "backend.voice_silero_vad_confidence_sharing",
    {
      skip: !sileroFlagsLoaded,
    },
  );

  const resolvedSileroConfig = useMemo(
    () => {
      // Start from backend/flag-driven values
      let config = {
        enabled: sileroFlags.enabled,
        echoSuppressionMode: sileroFlags.echoSuppressionMode,
        positiveThreshold: sileroFlags.positiveThreshold,
        playbackThresholdBoost: sileroFlags.playbackThresholdBoost,
        minSpeechMs: sileroFlags.minSpeechMs,
        playbackMinSpeechMs: sileroFlags.playbackMinSpeechMs,
      };

      // Apply barge-in quality preset to adjust thresholds for different
      // conversational modes. The underlying base values are tuned for
      // highly responsive dictation; presets move them toward more
      // conservative settings when desired.
      switch (sileroFlags.qualityPreset) {
        case "balanced":
          config = {
            ...config,
            positiveThreshold: Math.min(
              0.85,
              Math.max(0.25, config.positiveThreshold + 0.04),
            ),
            playbackThresholdBoost: Math.min(
              0.5,
              Math.max(0, config.playbackThresholdBoost + 0.01),
            ),
            minSpeechMs: config.minSpeechMs + 30,
            playbackMinSpeechMs: config.playbackMinSpeechMs + 20,
          };
          break;
        case "smooth":
          config = {
            ...config,
            positiveThreshold: Math.min(
              0.85,
              Math.max(0.25, config.positiveThreshold + 0.07),
            ),
            playbackThresholdBoost: Math.min(
              0.5,
              Math.max(0, config.playbackThresholdBoost + 0.02),
            ),
            minSpeechMs: config.minSpeechMs + 60,
            playbackMinSpeechMs: config.playbackMinSpeechMs + 40,
          };
          break;
        case "responsive":
        default:
          // Keep dictation-optimized base config
          break;
      }

      // Safety floors: keep local VAD echo-robust during playback.
      // Extremely low thresholds/short durations create echo-triggered
      // barge-ins that prematurely cancel AI playback.
      //
      // In explicit E2E test mode we allow more aggressive tuning so tests can
      // force instant barge-in behavior.
      const MIN_POSITIVE_THRESHOLD = 0.35;
      const MIN_MIN_SPEECH_MS = 120;
      const MIN_PLAYBACK_THRESHOLD_BOOST = 0.12;
      const MIN_PLAYBACK_MIN_SPEECH_MS = 140;

      if (!forceInstantBargeIn) {
        config = {
          ...config,
          positiveThreshold: Math.max(
            config.positiveThreshold,
            MIN_POSITIVE_THRESHOLD,
          ),
          minSpeechMs: Math.max(config.minSpeechMs, MIN_MIN_SPEECH_MS),
          playbackThresholdBoost: Math.max(
            config.playbackThresholdBoost,
            MIN_PLAYBACK_THRESHOLD_BOOST,
          ),
          playbackMinSpeechMs: Math.max(
            config.playbackMinSpeechMs,
            MIN_PLAYBACK_MIN_SPEECH_MS,
          ),
        };
      }

      return {
        ...config,
        confidenceSharing:
          sileroFlags.confidenceSharing &&
          (sileroFlagsLoaded ? confidenceFlagEnabled : true),
      };
    },
    [
      confidenceFlagEnabled,
      sileroFlags.confidenceSharing,
      sileroFlags.echoSuppressionMode,
      sileroFlags.enabled,
      sileroFlags.minSpeechMs,
      sileroFlags.playbackMinSpeechMs,
      sileroFlags.playbackThresholdBoost,
      sileroFlags.positiveThreshold,
      sileroFlags.qualityPreset,
      sileroFlagsLoaded,
      forceInstantBargeIn,
    ],
  );

  // Map per-user VAD sensitivity slider (0-100) into safe Silero ranges.
  // Uses the exported helper function defined at module level.
  //  - Higher sensitivity → lower positive threshold, shorter minSpeechMs
  //  - Lower sensitivity  → higher positive threshold, longer minSpeechMs
  const userAdjustedSileroConfig = useMemo(() => {
    const mapped = mapVadPresetAndSensitivityToSileroParams(
      {
        positiveThreshold: resolvedSileroConfig.positiveThreshold,
        minSpeechMs: resolvedSileroConfig.minSpeechMs,
      },
      {
        vadPreset,
        vadSensitivity,
        personalizedVadThreshold,
        vadCustomEnergyThresholdDb,
        vadCustomSilenceDurationMs,
      },
    );

    return {
      ...resolvedSileroConfig,
      positiveThreshold: mapped.positiveThreshold,
      minSpeechMs: mapped.minSpeechMs,
    };
  }, [
    resolvedSileroConfig,
    vadSensitivity,
    personalizedVadThreshold,
    vadPreset,
    vadCustomEnergyThresholdDb,
    vadCustomSilenceDurationMs,
  ]);

  // Advanced settings sent to backend for analytics and adaptive behavior.
  // These mirror TTSessionConfig personalization fields.
  const advancedSettings: TTAdvancedSettings = useMemo(
    () => ({
      vad_sensitivity: vadSensitivity ?? 50,
      personalized_vad_threshold: personalizedVadThreshold ?? null,
      enable_behavior_learning: enableBehaviorLearning,
      store_transcript_history: storeTranscriptHistory,
      vad_preset: vadPreset,
      vad_custom_energy_threshold_db:
        vadPreset === "custom" ? vadCustomEnergyThresholdDb : null,
      vad_custom_silence_duration_ms:
        vadPreset === "custom" ? vadCustomSilenceDurationMs : null,
      // Document reading & PHI-conscious voice controls
      reading_mode_enabled: readingModeEnabled,
      reading_speed: readingSpeed,
      reading_detail: readingDetail,
      phi_mode: phiMode,
    }),
    [
      vadSensitivity,
      personalizedVadThreshold,
      enableBehaviorLearning,
      storeTranscriptHistory,
      vadPreset,
      vadCustomEnergyThresholdDb,
      vadCustomSilenceDurationMs,
      readingModeEnabled,
      readingSpeed,
      readingDetail,
      phiMode,
    ],
  );

  const { isEnabled: aecCapabilityTuningEnabled } = useFeatureFlag(
    "backend.voice_aec_capability_tuning",
    {
      skip: !sileroFlagsLoaded,
    },
  );

  // AEC-aware echo policy for playback-time thresholds (guarded by feature flag)
  const echoPolicy = useMemo(() => {
    const baseBoost = userAdjustedSileroConfig.playbackThresholdBoost;
    const baseMinSpeech = userAdjustedSileroConfig.playbackMinSpeechMs;

    // Start from either the raw values or the AEC-adjusted policy.
    const policy = aecCapabilityTuningEnabled
      ? getEchoPolicyForAecQuality(baseBoost, baseMinSpeech, aecQuality)
      : {
          playbackThresholdBoost: baseBoost,
          playbackMinSpeechMs: baseMinSpeech,
        };

    // Clamp echo-related tuning so local VAD stays responsive but
    // doesn't become so permissive that speaker echo triggers barge-in.
    const MIN_PLAYBACK_THRESHOLD_BOOST = 0.12;
    const MAX_PLAYBACK_THRESHOLD_BOOST = 0.5;
    const MIN_PLAYBACK_MIN_SPEECH_MS = 140;
    const MAX_PLAYBACK_MIN_SPEECH_MS = 500;

    return {
      playbackThresholdBoost: Math.max(
        MIN_PLAYBACK_THRESHOLD_BOOST,
        Math.min(policy.playbackThresholdBoost, MAX_PLAYBACK_THRESHOLD_BOOST),
      ),
      playbackMinSpeechMs: Math.max(
        MIN_PLAYBACK_MIN_SPEECH_MS,
        Math.min(policy.playbackMinSpeechMs, MAX_PLAYBACK_MIN_SPEECH_MS),
      ),
    };
  }, [
    aecCapabilityTuningEnabled,
    userAdjustedSileroConfig.playbackThresholdBoost,
    userAdjustedSileroConfig.playbackMinSpeechMs,
    aecQuality,
  ]);

  // Debug logging for echo policy during testing (low frequency, on config changes)
  useEffect(() => {
    voiceLog.debug("[TTVoiceMode] Echo policy updated", {
      aecQuality,
      aecCapabilityTuningEnabled,
      playbackThresholdBoost: echoPolicy.playbackThresholdBoost,
      playbackMinSpeechMs: echoPolicy.playbackMinSpeechMs,
    });
  }, [aecQuality, aecCapabilityTuningEnabled, echoPolicy.playbackThresholdBoost, echoPolicy.playbackMinSpeechMs]);

  // Handle Silero engine errors to trigger graceful fallback to RMS-based VAD.
  const handleSileroError = useCallback(
    (err: Error) => {
      voiceLog.error("[TTVoiceMode] Silero VAD error:", err);

      if (!enableOfflineFallback) {
        voiceLog.warn(
          "[TTVoiceMode] Offline VAD fallback disabled; relying on backend VAD only",
        );
        return;
      }

      if (sileroUnavailable) {
        return;
      }

      voiceLog.warn(
        "[TTVoiceMode] Silero VAD unavailable - enabling RMS-based VAD fallback",
      );
      setSileroUnavailable(true);

      const vad = sileroVADRef.current;
      if (vad) {
        try {
          vad.stop();
        } catch (stopErr) {
          voiceLog.debug(
            "[TTVoiceMode] Error while stopping Silero VAD after failure",
            stopErr,
          );
        }
      }
    },
    [enableOfflineFallback, sileroUnavailable],
  );

  // T/T session hook
  const session = useThinkerTalkerSession({
    conversation_id,
    voiceSettings,
    advancedSettings,
    autoConnect,

    // Handle transcripts
    // NOTE: Message addition is handled by parent component via onUserTranscript callback
    // to avoid duplicate messages in the chat
    onTranscript: (transcript: TTTranscript) => {
      // CRITICAL: If we receive actual transcript text, the user is speaking.
      // This is REAL speech, not speaker echo. Clear natural completion mode
      // so that speech_started events are properly handled.
      // This fixes the bug where second turn speech is ignored because the
      // system thinks it's still in natural completion mode from the first turn.
      if (transcript.text && transcript.text.length > 0) {
        if (naturalCompletionModeRef.current) {
          voiceLog.info(
            "[TTVoiceMode] Clearing natural completion mode - real transcript received",
          );
        }
        naturalCompletionModeRef.current = false;
      }

      if (transcript.is_final) {
        // Final transcript - notify parent (which handles message addition)
        setPartialTranscript("");
        onUserTranscript?.(transcript.text, true);
      } else {
        // Partial transcript
        setPartialTranscript(transcript.text);
        onUserTranscript?.(transcript.text, false);
      }
    },

    // Handle streaming response
    // IMPORTANT: Do NOT reset audio playback on each response.delta. Audio
    // streams are driven by audio.output/meta / binary frames, and resetting
    // here on every token (especially when message_id is missing) can cause
    // choppy or truncated audio. We rely on audio-level signals such as
    // onNewAudioStream and pipeline state transitions to reset playback.
    onResponseDelta: (delta: string, _messageId: string) => {
      onAIResponse?.(delta, false);
    },

    // Handle complete response
    // NOTE: Message addition is handled by parent component via onAIResponse callback
    // to avoid duplicate messages in the chat. We also apply an in-memory
    // dedup guard here to suppress duplicate final responses that can occur
    // due to backend race conditions.
    onResponseComplete: (content: string, _messageId: string) => {
      // Normalize text for deduplication (lowercase, strip punctuation, collapse spaces)
      const raw = content || "";
      const lowered = raw.trim().toLowerCase();
      let cleanedChars = "";
      for (let i = 0; i < lowered.length; i++) {
        const ch = lowered[i]!;
        if (/[a-z0-9]/.test(ch)) {
          cleanedChars += ch;
        } else if (/\s/.test(ch)) {
          cleanedChars += " ";
        }
        // Ignore punctuation/symbols for dedup purposes
      }
      const normalized = cleanedChars.split(/\s+/).filter(Boolean).join(" ");
      const now = Date.now();

      const last = lastFinalResponseRef.current;
      if (
        last &&
        last.normalizedText === normalized &&
        now - last.timestamp < 8000
      ) {
        voiceLog.warn(
          "[TTVoiceMode] Duplicate final response detected, suppressing duplicate chat entry",
        );
        return;
      }

      lastFinalResponseRef.current = {
        normalizedText: normalized,
        timestamp: now,
      };

      onAIResponse?.(content, true);
    },

    // Surface KB context in unified store when KB tools complete
    onToolResult: (toolCall: TTToolCall) => {
      try {
        if (
          (toolCall.name === "kb_search" ||
            toolCall.name === "knowledge_base_query") &&
          toolCall.status === "completed" &&
          toolCall.result &&
          typeof toolCall.result === "object"
        ) {
          const result = toolCall.result as {
            sources?: Array<{
              id?: string;
              title?: string;
              category?: string;
            }>;
          };
          const sources = Array.isArray(result.sources)
            ? result.sources
                .filter(
                  (s): s is { id?: string; title: string; category?: string } =>
                    s !== null &&
                    s !== undefined &&
                    typeof s.title === "string" &&
                    s.title.trim().length > 0,
                )
                .map((s) => ({
                  id: s.id,
                  title: s.title.trim(),
                  category: s.category,
                }))
            : [];

          useUnifiedConversationStore.setState({
            lastKbContext:
              sources.length > 0
                ? {
                    toolName: toolCall.name,
                    sources,
                  }
                : null,
          });
        }
      } catch (err) {
        voiceLog.debug(
          "[TTVoiceMode] Failed to update KB context from tool result",
          err,
        );
      }
    },

    // Handle audio chunks
    onAudioChunk: (audioData: AudioChunkData) => {
      const isBinary = audioData instanceof Uint8Array;
      const audioLength = isBinary ? audioData.byteLength : audioData.length;
      voiceLog.debug("[TTVoiceMode] Audio chunk received", {
        dataType: isBinary ? "binary" : "base64",
        audioLength,
      });
      // E2E Debug: Track audio chunk flow
      if (typeof window !== "undefined") {
        const win = window as Window & {
          __tt_audio_debug?: Array<{
            timestamp: number;
            event: string;
            length: number;
            playbackState: string;
            isPlaying: boolean;
          }>;
        };
        if (!win.__tt_audio_debug) {
          win.__tt_audio_debug = [];
        }
        win.__tt_audio_debug.push({
          timestamp: Date.now(),
          event: "onAudioChunk_called",
          length: audioLength,
          playbackState: audioPlayback.playbackState,
          isPlaying: audioPlayback.isPlaying,
        });
        console.log("[TTVoiceMode] onAudioChunk called", {
          dataType: isBinary ? "binary" : "base64",
          audioLength,
          playbackState: audioPlayback.playbackState,
          isPlaying: audioPlayback.isPlaying,
        });
      }
      audioPlayback.queueAudioChunk(audioData);
    },

    // Handle new audio stream detection (duplicate response protection)
    onNewAudioStream: () => {
      voiceLog.warn(
        "[TTVoiceMode] New audio stream detected - resetting playback to prevent overlapping voices",
      );
      audioPlayback.reset();
    },

    // Handle tool calls
    onToolCall: (toolCall: TTToolCall) => {
      onToolCall?.(toolCall);
    },

    // Handle connection changes
    onConnectionChange: (status: TTConnectionStatus) => {
      voiceLog.debug(`[TTVoiceMode] Connection status: ${status}`);

      const mapStatus = (): typeof lastVoiceStoreStatusRef.current => {
        if (status === "connected" || status === "ready") return "connected";
        if (status === "connecting") return "connecting";
        if (status === "reconnecting") return "reconnecting";
        if (
          status === "error" ||
          status === "failed" ||
          status === "mic_permission_denied"
        ) {
          return "error";
        }
        return "disconnected";
      };

      const mappedStatus = mapStatus();

      // Map T/T status to store status
      if (lastVoiceStoreStatusRef.current !== mappedStatus) {
        lastVoiceStoreStatusRef.current = mappedStatus;
        setVoiceConnectionStatus(mappedStatus);
      }
    },

    // Handle pipeline state changes
    onPipelineStateChange: (state: PipelineState, reason?: string) => {
      const prevState = previousPipelineStateRef.current;
      voiceLog.debug(
        `[TTVoiceMode] Pipeline state: ${prevState} -> ${state}, reason: ${reason}`,
      );

      // Map backend pipeline state into canonical voice state
      const mappedVoiceState = mapPipelineStateToVoiceState(state);
      setVoiceState(mappedVoiceState);

      switch (state) {
        case "listening":
          startListening();
          clearSileroRollbackTimeout();
          // Signal end of audio stream when backend transitions to listening
          // This allows isPlaying to reset when all queued audio finishes
          // Note: Don't call reset() here - that would cut off audio mid-playback
          // during natural completion. reset() is called in "processing" state instead.
          audioPlayback.endStream();

          // CRITICAL: Clear natural completion mode when barge-in causes transition
          // This handles the case where backend sends listening -> listening (reason=barge_in)
          // or speaking -> listening (reason=barge_in)
          if (reason === "barge_in") {
            voiceLog.info(
              "[TTVoiceMode] Clearing natural completion mode due to barge_in transition",
            );
            naturalCompletionModeRef.current = false;
          }
          // CRITICAL: Enter natural completion mode ONLY when transitioning
          // from "speaking" to "listening" with reason "natural".
          // This means backend finished TTS generation and local audio buffer
          // may still be draining. During this window, speech_started events
          // from backend VAD are likely speaker echo (the AI's TTS being picked up
          // by the mic) and should NOT trigger barge-in.
          // We check prevState === "speaking" to avoid triggering on:
          // - Initial connection state (prevState is null)
          // - Other transitions like processing -> listening
          else if (prevState === "speaking" && reason === "natural") {
            voiceLog.info(
              "[TTVoiceMode] Natural completion mode: speaking -> listening, allowing audio to drain",
            );
            naturalCompletionModeRef.current = true;
          }
          break;
        case "processing":
          stopListening();
          clearSileroRollbackTimeout();
          // Clear natural completion mode - new utterance being processed
          naturalCompletionModeRef.current = false;
          // Reset audio when starting to process new utterance
          // This prevents audio overlap from stale responses
          audioPlayback.reset();
          break;
        case "speaking":
          // Clear natural completion mode - backend is actively generating TTS
          // Barge-in during speaking state should work normally
          naturalCompletionModeRef.current = false;
          break;
        case "cancelled":
        case "idle":
          clearSileroRollbackTimeout();
          // Signal end of stream in terminal states
          // Let any playing audio finish naturally
          audioPlayback.endStream();
          break;
        case "error":
          clearSileroRollbackTimeout();
          // In error state, stop any local listening/speaking indicators.
          stopListening();
          stopSpeaking();
          break;
      }

      // Update previous state ref for next transition
      previousPipelineStateRef.current = state;
    },

    // Handle speech events for barge-in
    // This is triggered by backend Deepgram VAD when it detects user speech
    onSpeechStarted: () => {
      voiceLog.info("[TTVoiceMode] Backend VAD: User speech detected");
      startListening();

      // Ignore very-early speech_start events that fire immediately after
      // playback begins; these are likely the AI's own audio leaking into
      // the mic rather than true user speech.
      const nowMs = Date.now();
      const lastPlaybackStartAt = lastPlaybackStartAtRef.current;
      if (
        lastPlaybackStartAt &&
        nowMs - lastPlaybackStartAt < PLAYBACK_ECHO_GRACE_MS
      ) {
        voiceLog.debug(
          `[TTVoiceMode] Backend VAD speech_start ignored ` +
            `(${nowMs - lastPlaybackStartAt}ms since playback start < ${PLAYBACK_ECHO_GRACE_MS}ms grace window)`,
        );
        return;
      }

      // CRITICAL: Skip barge-in if in natural completion mode
      // During natural completion (backend finished TTS, local audio draining),
      // speech_started events are likely speaker echo (AI's TTS picked up by mic)
      // NOT real user speech. Wait until audio fully drains before allowing barge-in.
      if (naturalCompletionModeRef.current) {
        voiceLog.info(
          "[TTVoiceMode] Backend VAD ignored: in natural completion mode (likely speaker echo)",
        );
        return;
      }

      // CRITICAL: Trigger barge-in if AI is currently speaking.
      // Use real-time playback refs via getDebugState() rather than the
      // state-derived isPlaying flag, which can be a few frames behind.
      const playbackDebug = audioPlayback.getDebugState();
      const isActuallyPlaying =
        playbackDebug.isPlayingRef ||
        playbackDebug.activeSourcesCount > 0 ||
        playbackDebug.queueLength > 0;

      // Cross-check with local Silero VAD to avoid backend-only
      // misfires. Require Silero to also see sustained speech
      // during playback before treating this as a real barge-in.
      const silero = sileroVADRef.current;
      const sileroSpeaking = !!silero?.isSpeaking;
      const sileroProb = silero?.lastSpeechProbability ?? 0;
      const sileroDurationMs = silero?.speechDurationMs ?? 0;
      const playbackMinSpeechMs = resolvedSileroConfig.playbackMinSpeechMs;
      const positiveThreshold = resolvedSileroConfig.positiveThreshold;

      const sileroConfirmsSpeech =
        sileroSpeaking &&
        sileroProb >= positiveThreshold &&
        sileroDurationMs >= playbackMinSpeechMs;

      voiceLog.debug(
        `[TTVoiceMode] Backend VAD playback check: ` +
          `isPlayingRef=${playbackDebug.isPlayingRef}, ` +
          `activeSources=${playbackDebug.activeSourcesCount}, ` +
          `queueLength=${playbackDebug.queueLength}, ` +
          `stateIsPlaying=${audioPlayback.isPlaying}, ` +
          `sileroSpeaking=${sileroSpeaking}, ` +
          `sileroProb=${sileroProb.toFixed(3)}, ` +
          `sileroDurationMs=${sileroDurationMs}, ` +
          `sileroThreshold=${positiveThreshold}, ` +
          `sileroPlaybackMinMs=${playbackMinSpeechMs}, ` +
          `sileroConfirmsSpeech=${sileroConfirmsSpeech}`,
      );

      // IMPORTANT: During AI playback, backend speech_start can be triggered
      // by TTS leakage/echo. Require local Silero confirmation before we
      // treat this as a real barge-in.
      if (!isActuallyPlaying) {
        voiceLog.debug(
          "[TTVoiceMode] Backend VAD speech_start ignored - audio not actually playing",
        );
        return;
      }

      if (!sileroConfirmsSpeech) {
        voiceLog.info(
          "[TTVoiceMode] Backend VAD ignored: no local Silero confirmation during playback (likely echo)",
        );
        return;
      }

      // Debounce to prevent multiple rapid barge-ins
      const now = Date.now();
      if (now - lastBargeInTimeRef.current < bargeInDebounceMs) {
        voiceLog.info("[TTVoiceMode] Backend VAD barge-in debounced");
        return;
      }
      lastBargeInTimeRef.current = now;

      voiceLog.info(
        "[TTVoiceMode] Backend VAD barge-in: user speaking while AI playing",
      );
      // Fade out audio immediately for smooth transition
      // Use short duration to keep mute latency <100ms
      audioPlayback.fadeOut(30);
      // Notify backend to cancel response generation
      session.bargeIn();
    },

    onStopPlayback: () => {
      // Stop audio playback on barge-in
      audioPlayback.stop();
    },

    // Natural Conversation Flow: Instant barge-in with smooth fade
    onFadeOutPlayback: (durationMs?: number) => {
      // Fade out audio for smooth barge-in transition (default 50ms)
      audioPlayback.fadeOut(durationMs);
    },

    // Local VAD-based barge-in detection
    // This provides instant barge-in when the backend's Deepgram VAD doesn't fire
    // (e.g., due to TTS echo or continuous speech mode)
    onLocalVoiceActivity: (rmsLevel: number) => {
      const nowMs = Date.now();
      const lastPlaybackStartAt = lastPlaybackStartAtRef.current;
      if (
        lastPlaybackStartAt &&
        nowMs - lastPlaybackStartAt < PLAYBACK_ECHO_GRACE_MS
      ) {
        voiceLog.debug(
          `[TTVoiceMode] Local VAD speech ignored ` +
            `(${nowMs - lastPlaybackStartAt}ms since playback start < ${PLAYBACK_ECHO_GRACE_MS}ms grace window)`,
        );
        return;
      }

      if (naturalCompletionModeRef.current) {
        return;
      }

      // Only trigger barge-in if audio is currently playing.
      // Use debugState so we don't miss very recent playback starts that
      // haven't updated the React state yet.
      const debugState = audioPlayback.getDebugState();
      const isActuallyPlaying =
        debugState.isPlayingRef ||
        debugState.activeSourcesCount > 0 ||
        debugState.queueLength > 0;

      if (isActuallyPlaying) {
        const now = Date.now();
        if (now - lastBargeInTimeRef.current < bargeInDebounceMs) {
          return;
        }
        lastBargeInTimeRef.current = now;

        voiceLog.info(
          `[TTVoiceMode] Local VAD barge-in: rms=${rmsLevel.toFixed(
            3,
          )}, stopping playback (isPlayingRef=${debugState.isPlayingRef}, ` +
            `activeSources=${debugState.activeSourcesCount}, queue=${debugState.queueLength})`,
        );
        // Fade out audio immediately
        // Use short duration to keep mute latency <100ms
        audioPlayback.fadeOut(30);
        // Notify backend to cancel response generation
        session.bargeIn();
      }
    },

    // Enable instant barge-in by default for responsive interruption
    // NOTE: Instant barge-in at the low-level session layer has been
    // causing overly aggressive fade-outs based on backend VAD echo
    // (see BARGE-IN-DEBUG logs). We now rely on the higher-level
    // echo-aware barge-in logic in this hook instead.
    enableInstantBargeIn: false,

    // Handle metrics
    onMetricsUpdate: (metrics: TTVoiceMetrics) => {
      onMetricsUpdate?.(metrics);
    },

    // Backend high-noise recommendation (suggest push-to-talk)
    onPushToTalkRecommended: () => {
      setPushToTalkRecommended(true);
    },

    // Phase 1: Handle emotion detection from Hume AI
    onEmotionDetected: (emotion: TTEmotionResult) => {
      voiceLog.debug(
        `[TTVoiceMode] Emotion detected: ${emotion.primary_emotion} ` +
          `(conf=${emotion.primary_confidence.toFixed(2)})`,
      );
      setCurrentEmotion(emotion);
      onEmotionDetected?.(emotion);
    },

    // Phase 2: Handle backchannel audio playback
    onBackchannel: (event: TTBackchannelEvent) => {
      voiceLog.debug(`[TTVoiceMode] Backchannel received: "${event.phrase}"`);
      backchannelAudio.playBackchannel(event);
    },

    // Issue 1: Handle unified thinking feedback state from backend
    onThinkingStateChange: (event: TTThinkingStateEvent) => {
      voiceLog.debug(
        `[TTVoiceMode] Thinking state: isThinking=${event.isThinking}, source=${event.source}`,
      );
      if (event.isThinking && event.source === "backend") {
        // Backend is handling thinking feedback - disable frontend audio
        setThinkingSource("backend");
      } else if (!event.isThinking) {
        // Thinking stopped - revert to frontend control
        setThinkingSource("frontend");
      }
    },

    // Phase 3: Backend barge-in classification (backchannel/soft/hard).
    // Store the latest classification and optionally play a short
    // "I'm listening" prompt for hard barges to confirm the turn switch.
    onBargeInClassified: (result: TTBargeInClassification) => {
      setLastBargeInClassification(result);
      voiceLog.debug("[TTVoiceMode] Barge-in classified", {
        classification: result.classification,
        intent: result.intent,
        confidence: result.confidence,
        action: result.action,
      });

      if (
        result.classification === "hard_barge" &&
        result.action === "stop" &&
        bargeInPromptAudio.isReady
      ) {
        // Fire and forget; failures are logged inside the hook
        void bargeInPromptAudio.playPrompt();
      }
    },
  });

  // Refs for Silero VAD callbacks (avoid stale closures)
  const audioPlaybackRef = useRef(audioPlayback);
  const sessionRef = useRef(session);

  // Keep refs updated
  useEffect(() => {
    audioPlaybackRef.current = audioPlayback;
    sessionRef.current = session;
  });

  // Shared handler for local VAD speech start events (Silero or fallback RMS).
  // Triggers barge-in when AI is actively speaking.
  const handleLocalVADSpeechStart = useCallback(() => {
    voiceLog.debug("[TTVoiceMode] Local VAD: Speech started");

    // E2E Test Harness: Record speech detection timestamp
    const speechDetectedAt = performance.now();

    // Ignore very-early speech_start events that fire immediately after
    // playback begins; these are likely the AI's own audio leaking into
    // the mic rather than true user speech.
    const nowMs = Date.now();
    const lastPlaybackStartAt = lastPlaybackStartAtRef.current;
    if (
      lastPlaybackStartAt &&
      nowMs - lastPlaybackStartAt < PLAYBACK_ECHO_GRACE_MS
    ) {
      voiceLog.debug(
        `[TTVoiceMode] Local VAD speech_start ignored ` +
          `(${nowMs - lastPlaybackStartAt}ms since playback start < ${PLAYBACK_ECHO_GRACE_MS}ms grace window)`,
      );
      return;
    }

    // During natural completion (backend finished generating TTS but local audio
    // may still be draining), treat VAD speech_start events as likely echo and
    // do not trigger barge-in.
    if (naturalCompletionModeRef.current) {
      voiceLog.debug(
        "[TTVoiceMode] Local VAD speech_start ignored: in natural completion mode",
      );
      return;
    }

    // Debounce to prevent multiple rapid barge-ins
    if (nowMs - lastBargeInTimeRef.current < bargeInDebounceMs) {
      voiceLog.debug("[TTVoiceMode] Local VAD: Barge-in debounced");
      return;
    }

    // Use real-time playback refs for accurate state
    const debugState = audioPlaybackRef.current.getDebugState();
    const isActuallyPlaying =
      debugState.isPlayingRef ||
      debugState.activeSourcesCount > 0 ||
      debugState.queueLength > 0;

    // E2E Debug: Always log to console for test visibility
    console.log(
      `[TTVoiceMode] BARGE_IN_CHECK: isPlayingRef=${debugState.isPlayingRef}, activeSourcesCount=${debugState.activeSourcesCount}, stateIsPlaying=${audioPlaybackRef.current.isPlaying}, willTrigger=${isActuallyPlaying}`,
    );

    voiceLog.debug(
      `[TTVoiceMode] Local VAD: Checking playback state - isPlayingRef=${debugState.isPlayingRef}, activeSourcesCount=${debugState.activeSourcesCount}, stateIsPlaying=${audioPlaybackRef.current.isPlaying}`,
    );

    if (!isActuallyPlaying) {
      return;
    }

    // Confirm speech briefly to reduce echo-triggered misfires.
    clearLocalBargeInConfirmTimeout();
    const CONFIRM_MS = 120;
    localBargeInConfirmTimeoutRef.current = window.setTimeout(() => {
      // If another barge-in happened in the interim, skip.
      const now = Date.now();
      if (now - lastBargeInTimeRef.current < bargeInDebounceMs) {
        return;
      }

      // Re-check playback state (audio may have ended)
      const playbackNow = audioPlaybackRef.current.getDebugState();
      const stillPlaying =
        playbackNow.isPlayingRef ||
        playbackNow.activeSourcesCount > 0 ||
        playbackNow.queueLength > 0;
      if (!stillPlaying) {
        return;
      }

      const silero = sileroVADRef.current;
      const shouldRequireSileroConfirmation =
        resolvedSileroConfig.enabled && !sileroUnavailable && !!silero;

      if (shouldRequireSileroConfirmation) {
        const prob = silero.lastSpeechProbability ?? 0;
        const durationMs = silero.speechDurationMs ?? 0;
        const threshold = silero.effectiveThreshold ?? 0.5;
        const requiredDurationMs = silero.isPlaybackActive
          ? echoPolicy.playbackMinSpeechMs
          : resolvedSileroConfig.minSpeechMs;

        const confirmsSpeech =
          silero.isSpeaking &&
          prob >= threshold &&
          durationMs >= requiredDurationMs;

        if (!confirmsSpeech) {
          voiceLog.debug(
            `[TTVoiceMode] Local VAD barge-in suppressed (echo suspected): ` +
              `prob=${prob.toFixed(3)}, threshold=${threshold.toFixed(3)}, ` +
              `durationMs=${durationMs}, requiredMs=${requiredDurationMs}`,
          );
          return;
        }
      }

      console.log(
        "[TTVoiceMode] BARGE_IN_TRIGGERED: user speaking while AI playing",
      );
      voiceLog.info(
        "[TTVoiceMode] Local VAD barge-in: user speaking while AI playing",
      );
      lastBargeInTimeRef.current = now;

      // Start fade immediately
      audioPlaybackRef.current.fadeOut(30);
      // Notify backend to cancel response generation
      sessionRef.current.bargeIn();

      // E2E Test Harness: Record barge-in event for latency measurement
      if (typeof window !== "undefined") {
        const harness = (window as unknown as {
          __voiceTestHarness?: {
            recordBargeIn: (speechDetectedAt: number) => void;
          };
        }).__voiceTestHarness;
        if (harness?.recordBargeIn) {
          harness.recordBargeIn(speechDetectedAt);
        }
      }

      // Rollback guard: if no transcript or pipeline transition in 500ms, resume
      clearSileroRollbackTimeout();
      const MISFIRE_ROLLBACK_MS = 500;
      sileroRollbackTimeoutRef.current = window.setTimeout(() => {
        const sessionSnapshot = sessionRef.current;
        if (
          sessionSnapshot?.pipelineState === "speaking" &&
          !sessionSnapshot.partialTranscript
        ) {
          voiceLog.warn(
            "[TTVoiceMode] Local VAD barge-in rollback (no transcript within 500ms)",
          );
          // Clear natural completion mode - we're recovering from a false barge-in
          // and need to allow new speech processing
          naturalCompletionModeRef.current = false;
          audioPlaybackRef.current.reset();
        }
      }, MISFIRE_ROLLBACK_MS);
    }, CONFIRM_MS);
  }, [
    bargeInDebounceMs,
    clearLocalBargeInConfirmTimeout,
    clearSileroRollbackTimeout,
    echoPolicy.playbackMinSpeechMs,
    resolvedSileroConfig.enabled,
    resolvedSileroConfig.minSpeechMs,
    sileroUnavailable,
  ]);

  // Track last mapped connection status to avoid redundant store updates
  const lastVoiceStoreStatusRef = useRef<
    "connected" | "connecting" | "reconnecting" | "error" | "disconnected"
  >("disconnected");

  // Silero VAD for reliable local voice activity detection
  // Uses neural network model (much more accurate than RMS threshold)
  // Phase 1: Echo-aware mode keeps VAD active during AI playback with elevated threshold
  // All parameters are now configurable via feature flags (backend.voice_silero_*)
  const sileroVAD = useSileroVAD({
    // Master enable/disable via feature flag (backend.voice_silero_vad_enabled)
    // When false or when the engine is marked unavailable, VAD will not initialize.
    enabled: resolvedSileroConfig.enabled && !sileroUnavailable,

    onSpeechStart: () => {
      voiceLog.debug("[TTVoiceMode] Silero VAD: Speech started");
      handleLocalVADSpeechStart();
    },
    onSpeechEnd: (audio) => {
      voiceLog.debug(
        `[TTVoiceMode] Silero VAD: Speech ended, audio length: ${audio.length}`,
      );
    },
    onVADMisfire: () => {
      voiceLog.debug("[TTVoiceMode] Silero VAD: Misfire (speech too short)");
    },
    onError: (error) => {
      voiceLog.debug("[TTVoiceMode] Silero VAD: Error reported", error);
      handleSileroError(error);
    },
    // Don't auto-start - we'll start when connected
    autoStart: false,

    // Speech detection thresholds (configurable via feature flags)
    // backend.voice_silero_positive_threshold (default: 0.5), adjusted by user sensitivity
    positiveSpeechThreshold: userAdjustedSileroConfig.positiveThreshold,
    // Negative threshold is typically 70% of positive threshold
    negativeSpeechThreshold: userAdjustedSileroConfig.positiveThreshold * 0.7,
    // backend.voice_silero_min_speech_ms (default: 150), adjusted by user sensitivity
    minSpeechMs: userAdjustedSileroConfig.minSpeechMs,

    // Echo Cancellation settings (configurable via feature flags)
    // backend.voice_silero_echo_suppression_mode (default: "threshold_boost")
    echoSuppressionMode: resolvedSileroConfig.echoSuppressionMode,
    // backend.voice_silero_playback_threshold_boost (default: 0.2)
    playbackThresholdBoost: echoPolicy.playbackThresholdBoost,
    // backend.voice_silero_playback_min_speech_ms (default: 200)
    playbackMinSpeechMs: echoPolicy.playbackMinSpeechMs,
    enableConfidenceStreaming: resolvedSileroConfig.confidenceSharing,
  });

  // Keep sileroVAD ref updated for use in effects
  sileroVADRef.current = sileroVAD;

  // Phase 2: VAD Confidence Sharing - Stream VAD state to backend
  // This allows the backend to make hybrid VAD decisions using both
  // frontend Silero VAD and backend Deepgram VAD
  useEffect(() => {
    // Only stream when connected and user is speaking
    if (
      !session.isConnected ||
      !sileroVAD.isSpeaking ||
      !resolvedSileroConfig.confidenceSharing
    ) {
      return;
    }

    // Send VAD state immediately when speech starts
    const vad = sileroVADRef.current;
    if (vad) {
      const state = vad.getVADState();
      session.sendVADState({
        ...state,
        aec_quality: aecQualityRef.current,
        personalized_threshold: personalizedVadThreshold ?? null,
      });
    }

    // Continue streaming at 100ms intervals during speech
    const intervalId = window.setInterval(() => {
      const vadState = sileroVADRef.current?.getVADState();
      if (sileroVADRef.current?.isSpeaking && vadState) {
        sessionRef.current?.sendVADState({
          ...vadState,
          aec_quality: aecQualityRef.current,
          personalized_threshold: personalizedVadThreshold ?? null,
        });
      }
    }, 100);

    // Cleanup interval when speech ends or disconnected
    return () => {
      clearInterval(intervalId);
    };
  }, [
    session.isConnected,
    sileroVAD.isSpeaking,
    resolvedSileroConfig.confidenceSharing,
    personalizedVadThreshold,
  ]);

  // RMS-based VAD helper as a fallback when Silero is unavailable.
  // Running multiple mic VADs concurrently increases echo-misfire risk,
  // which can prematurely cancel AI playback (truncated responses).
  useEffect(() => {
    if (!session.isConnected || !enableOfflineFallback) {
      return;
    }

    // Only run the RMS fallback when Silero is unavailable/disabled.
    if (!sileroUnavailable && resolvedSileroConfig.enabled) {
      return;
    }

    if (isAutomation) {
      // Avoid extra getUserMedia calls in automated test environments
      return;
    }

    if (fallbackVadRef.current) {
      return;
    }

    let cancelled = false;

    const startFallback = async () => {
      try {
        const sensitivity = vadSensitivity ?? 50;
        const energyThreshold =
          0.01 + (sensitivity / 100) * (0.05 - 0.01); // 0.01–0.05

        const vadConfig = {
          ...DEFAULT_VAD_CONFIG,
          energyThreshold,
          minSpeechDuration: 200,
          maxSilenceDuration: 1000,
        };

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const vad = new VoiceActivityDetector(vadConfig);
        fallbackVadRef.current = vad;
        fallbackVadStreamRef.current = stream;

        vad.on("speechStart", () => {
          handleLocalVADSpeechStart();
        });

        await vad.connect(stream);
        setIsFallbackVADActive(true);
        voiceLog.info(
          "[TTVoiceMode] RMS-based VAD helper started (RMS VAD co-running with Silero)",
        );
      } catch (err) {
        voiceLog.error(
          "[TTVoiceMode] Failed to start RMS-based VAD fallback",
          err,
        );
      }
    };

    void startFallback();

    return () => {
      cancelled = true;
      if (fallbackVadRef.current) {
        fallbackVadRef.current.disconnect();
        fallbackVadRef.current = null;
      }
      if (fallbackVadStreamRef.current) {
        fallbackVadStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        fallbackVadStreamRef.current = null;
      }
      if (isFallbackVADActive) {
        setIsFallbackVADActive(false);
      }
    };
  }, [
    session.isConnected,
    enableOfflineFallback,
    resolvedSileroConfig.enabled,
    sileroUnavailable,
    isAutomation,
    vadSensitivity,
    handleLocalVADSpeechStart,
    isFallbackVADActive,
  ]);

  // Start/stop Silero VAD based on connection status
  // IMPORTANT: Avoid depending on sileroVAD state directly as that causes the effect
  // to re-run when VAD state changes, potentially destroying the VAD during barge-in
  // or speech detection.
  useEffect(() => {
    const vad = sileroVADRef.current;
    if (!vad) return;

    if (
      session.isConnected &&
      !vadStartedRef.current &&
      !sileroUnavailable &&
      resolvedSileroConfig.enabled
    ) {
      voiceLog.debug("[TTVoiceMode] Starting Silero VAD (connected)");
      vadStartedRef.current = true;
      vad.start();

      // Auto-run Silero ambient noise calibration on first successful start so
      // adaptive thresholds are tuned to the current environment. Results are
      // stored in voiceSettingsStore for visibility and future tuning.
      if (
        !isAutomation &&
        !vadCalibrated &&
        !vad.isCalibrated &&
        !vad.isCalibrating
      ) {
        void (async () => {
          try {
            voiceLog.info(
              "[TTVoiceMode] Running initial Silero noise calibration...",
            );
            await vad.calibrateNoise();
            setVadCalibrated(true);
            setLastCalibrationDate(Date.now());
            setPersonalizedVadThreshold(vad.adaptiveThreshold);
          } catch (err) {
            voiceLog.warn(
              "[TTVoiceMode] Silero noise calibration failed (continuing with base thresholds)",
              err,
            );
          }
        })();
      }
    } else if (
      (!session.isConnected ||
        sileroUnavailable ||
        !resolvedSileroConfig.enabled) &&
      vadStartedRef.current
    ) {
      voiceLog.debug("[TTVoiceMode] Stopping Silero VAD (disconnected)");
      vadStartedRef.current = false;
      vad.stop();
    }
  }, [
    session.isConnected,
    sileroUnavailable,
    resolvedSileroConfig.enabled,
    isAutomation,
    vadCalibrated,
    setVadCalibrated,
    setLastCalibrationDate,
    setPersonalizedVadThreshold,
  ]);

  // Natural Conversation Flow: Phase 4.3 - Start/stop AEC monitoring based on connection
  // AEC monitoring helps detect when echo cancellation is still learning the acoustic path
  // During convergence, VAD threshold is boosted to prevent echo-triggered false positives
  useEffect(() => {
    if (isAutomation) {
      return;
    }

    // Avoid restarting if the boolean didn't actually change
    const wasConnected = lastVoiceStoreStatusRef.current === "connected";
    if (wasConnected === session.isConnected) {
      return;
    }

    if (session.isConnected) {
      voiceLog.debug("[TTVoiceMode] Starting AEC monitoring (connected)");
      aecFeedback.startMonitoring();
    } else {
      voiceLog.debug("[TTVoiceMode] Stopping AEC monitoring (disconnected)");
      aecFeedback.stopMonitoring();
    }
  }, [session.isConnected, aecFeedback]);

  // Barge-in handler - combines session signal with audio stop
  // Optionally plays "I'm listening" prompt using ElevenLabs for consistent voice
  const bargeIn = useCallback(
    (playVoicePrompt = false) => {
      voiceLog.debug("[TTVoiceMode] Barge-in triggered");
      audioPlayback.stop();
      session.bargeIn();

      // Play barge-in prompt if requested (uses ElevenLabs TTS for consistent voice)
      if (playVoicePrompt && bargeInPromptAudio.isReady) {
        bargeInPromptAudio.playPrompt();
      }
    },
    [audioPlayback, session, bargeInPromptAudio],
  );

  // Enhanced disconnect that stops audio
  const disconnect = useCallback(() => {
    voiceLog.debug("[TTVoiceMode] Disconnecting");
    audioPlayback.reset();
    session.disconnect();
  }, [audioPlayback, session]);

  // Natural Conversation Flow: Phase 1 - Manual Override Controls
  /**
   * Toggle microphone mute state.
   * When muted, VAD stops listening but connection remains active.
   */
  const toggleMute = useCallback(() => {
    const vad = sileroVADRef.current;
    if (!vad) return;

    if (isMuted) {
      // Unmute: resume VAD
      voiceLog.debug("[TTVoiceMode] Unmuting microphone");
      vad.start();
      setIsMuted(false);
    } else {
      // Mute: pause VAD
      voiceLog.debug("[TTVoiceMode] Muting microphone");
      vad.pause();
      setIsMuted(true);
    }
  }, [isMuted]);

  /**
   * Force AI to respond immediately by ending user turn.
   * Commits current audio buffer and triggers AI processing.
   */
  const forceReply = useCallback(() => {
    voiceLog.debug("[TTVoiceMode] Force reply triggered");
    session.commitAudio();
  }, [session]);

  /**
   * Immediately stop AI speech without playing a voice prompt.
   * More aggressive than bargeIn with playVoicePrompt=false.
   */
  const stopAI = useCallback(() => {
    voiceLog.debug("[TTVoiceMode] Stop AI triggered");
    audioPlayback.stop();
    session.bargeIn();
  }, [audioPlayback, session]);

  // Enhanced connect that pre-warms audio
  const connect = useCallback(async () => {
    voiceLog.debug("[TTVoiceMode] Connecting with audio pre-warm");
    // Pre-warm AudioContext before connecting to reduce latency
    await audioPlayback.warmup();
    return session.connect();
  }, [audioPlayback, session]);

  // Cleanup on unmount only - use ref to avoid re-running on audioPlayback object changes
  useEffect(() => {
    return () => {
      clearSileroRollbackTimeout();
      // Use ref to get latest audioPlayback without triggering effect re-runs
      audioPlaybackRef.current.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSileroRollbackTimeout]); // audioPlayback excluded - use ref instead

  // E2E Test Debug Exposure - Exposes combined voice mode state for Playwright tests
  // This extends window.__voiceDebug with audio playback state that's only available here
  // (useThinkerTalkerSession doesn't have access to audioPlayback hook)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Create or extend the voiceModeDebug object with audio playback state
    const voiceModeDebug = {
      // Audio playback state (not available in useThinkerTalkerSession's __voiceDebug)
      // NOTE: isPlaying is derived from React state and may be stale
      // Use getPlaybackDebugState() for accurate real-time ref values
      isPlaying: audioPlayback.isPlaying,
      playbackState: audioPlayback.playbackState,
      ttfaMs: audioPlayback.ttfaMs,
      queueLength: audioPlayback.queueLength,
      queueDurationMs: audioPlayback.queueDurationMs,

      // Combined state useful for tests
      pipelineState: session.pipelineState,
      isConnected: session.isConnected,
      isSpeaking: session.isSpeaking,
      isListening: session.isListening,

      // Barge-in related
      bargeInCount: session.metrics.bargeInCount,
      successfulBargeInCount: session.metrics.successfulBargeInCount,

      // Silero VAD state
      isSileroVADActive: sileroVAD.isListening,
      sileroVADConfidence: sileroVAD.lastSpeechProbability,

      // Fallback VAD state
      isFallbackVADActive,

      // Transcripts
      partialTranscript: session.partialTranscript,
      partialAIResponse: session.partialAIResponse,

      // Helper to check if AI is actively playing audio (key for barge-in tests)
      // NOTE: Uses state-derived isPlaying which may be stale. For real-time checks,
      // use getPlaybackDebugState().isPlayingRef || getPlaybackDebugState().activeSourcesCount > 0
      get isAIPlayingAudio() {
        return audioPlayback.isPlaying && session.pipelineState === "speaking";
      },

      // Real-time playback debug state (reads directly from refs, not React state)
      // Use this for accurate E2E testing - React state can be stale
      getPlaybackDebugState: () => audioPlayback.getDebugState(),

      // Convenience: Check if audio is actually playing via refs
      get isActuallyPlaying() {
        const debugState = audioPlayback.getDebugState();
        return debugState.isPlayingRef || debugState.activeSourcesCount > 0;
      },

      // Test-only controls (exposed for Playwright)
      stopAI: () => stopAI(),
      bargeIn: () => bargeIn(false),
      forceReply: () => forceReply(),
    };

    // Expose for E2E tests
    (
      window as unknown as { __voiceModeDebug?: typeof voiceModeDebug }
    ).__voiceModeDebug = voiceModeDebug;

    // E2E Test Harness: Comprehensive test state for accurate validation
    // This exposes historical state tracking and timestamps for latency measurement
    // Unlike __voiceModeDebug which uses React state, this uses refs for real-time accuracy
    interface BargeInLogEntry {
      timestamp: number;
      speechDetectedAt: number;
      fadeStartedAt: number | null;
      audioSilentAt: number | null;
      latencyMs: number | null;
      wasPlaying: boolean;
      activeSourcesAtTrigger: number;
    }

    const voiceTestHarness = {
      // Historical audio tracking (not just snapshots)
      audioHistory: audioPlayback.audioHistory,

      // Timestamped events for latency measurement
      timestamps: {
        ...audioPlayback.timestamps,
        // Add VAD timestamps
        lastSpeechDetected: sileroVAD.isSpeaking ? performance.now() : null,
      },

      // Barge-in event log (for debugging test failures)
      bargeInLog: [] as BargeInLogEntry[],

      // Helper to record barge-in event
      recordBargeIn: (speechDetectedAt: number) => {
        const debugState = audioPlayback.getDebugState();
        const timestamps = audioPlayback.timestamps;
        const entry: BargeInLogEntry = {
          timestamp: performance.now(),
          speechDetectedAt,
          fadeStartedAt: timestamps.lastFadeStarted,
          audioSilentAt: timestamps.lastAudioSilent,
          latencyMs: timestamps.lastFadeStarted
            ? timestamps.lastFadeStarted - speechDetectedAt
            : null,
          wasPlaying: debugState.isPlayingRef || debugState.activeSourcesCount > 0,
          activeSourcesAtTrigger: debugState.activeSourcesCount,
        };
        voiceTestHarness.bargeInLog.push(entry);
        // Keep only last 20 entries to prevent memory leak
        if (voiceTestHarness.bargeInLog.length > 20) {
          voiceTestHarness.bargeInLog.shift();
        }
        return entry;
      },

      // Quick access to latest barge-in latency
      get lastBargeInLatencyMs(): number | null {
        const last = voiceTestHarness.bargeInLog[voiceTestHarness.bargeInLog.length - 1];
        return last?.latencyMs ?? null;
      },

      // Convenience: Was audio EVER playing this session?
      get wasEverPlaying(): boolean {
        return audioPlayback.audioHistory.wasEverPlaying;
      },

      // Convenience: Get playback state from refs (not React state)
      getPlaybackState: () => audioPlayback.getDebugState(),

      // Pipeline state for multi-turn tracking
      pipelineState: session.pipelineState,

      // Transcript tracking
      lastTranscriptComplete: session.transcript || null,
      partialTranscript: session.partialTranscript,

      // Session metrics
      metrics: session.metrics,

      // Test-only helper to force a barge-in (used when automation audio fails to trigger)
      triggerBargeIn: () => {
        const now = performance.now();
        audioPlaybackRef.current.fadeOut(30);
        sessionRef.current.bargeIn();
        try {
          voiceTestHarness.recordBargeIn(now);
        } catch {
          // Ignore if record fails
        }
      },
    };

    // Expose test harness for E2E tests
    (
      window as unknown as { __voiceTestHarness?: typeof voiceTestHarness }
    ).__voiceTestHarness = voiceTestHarness;

    // Debug logging removed to reduce console spam - this effect runs very frequently
    // due to its large dependency array. Use __voiceModeDebug in browser console instead.

    return () => {
      if (typeof window !== "undefined") {
        delete (
          window as unknown as { __voiceModeDebug?: typeof voiceModeDebug }
        ).__voiceModeDebug;
        delete (
          window as unknown as { __voiceTestHarness?: typeof voiceTestHarness }
        ).__voiceTestHarness;
      }
    };
  }, [
    audioPlayback.isPlaying,
    audioPlayback.playbackState,
    audioPlayback.ttfaMs,
    audioPlayback.queueLength,
    audioPlayback.queueDurationMs,
    audioPlayback.audioHistory,
    audioPlayback.timestamps,
    session.pipelineState,
    session.isConnected,
    session.isSpeaking,
    session.isListening,
    session.metrics.bargeInCount,
    session.metrics.successfulBargeInCount,
    session.partialTranscript,
    session.partialAIResponse,
    session.transcript,
    session.metrics,
    sileroVAD.isListening,
    sileroVAD.lastSpeechProbability,
    sileroVAD.isSpeaking,
  ]);

  // Memoized return value
  return useMemo(
    () => ({
      // Connection State
      connectionStatus: session.status,
      pipelineState: session.pipelineState,
      isConnected: session.isConnected,
      isConnecting: session.isConnecting,
      isReady: session.isReady,
      isMicPermissionDenied: session.isMicPermissionDenied,

      // Audio State
      playbackState: audioPlayback.playbackState,
      isPlaying: audioPlayback.isPlaying,
      isSpeaking: session.isSpeaking,
      isListening: session.isListening,

      // Transcription
      partialTranscript: session.partialTranscript,
      finalTranscript: session.transcript,
      partialAIResponse: session.partialAIResponse, // Phase 5.1
      lastTruncation: session.lastTruncation, // Phase 5.2

      // Tool Calls
      currentToolCalls: session.currentToolCalls,

      // Metrics
      metrics: session.metrics,
      ttfaMs: audioPlayback.ttfaMs,

      // Error
      error: session.error,

      // Phase 1: Emotion Detection
      currentEmotion,

      // Phase 2: Backchanneling
      backchannelPhrase: backchannelAudio.currentPhrase,
      isBackchanneling: backchannelAudio.isPlaying,

      // Issue 1: Unified thinking feedback
      thinkingSource,

      // Local VAD (Silero)
      isSileroVADActive: sileroVAD.isListening,
      isSileroVADLoading: sileroVAD.isLoading,

      // Phase 1: Echo-Aware VAD
      isSileroVADEchoSuppressed: sileroVAD.isPlaybackActive,
      sileroVADEffectiveThreshold: sileroVAD.effectiveThreshold,

      // Phase 2: VAD Confidence Sharing
      sileroVADConfidence: sileroVAD.lastSpeechProbability,
      sileroVADSpeechDurationMs: sileroVAD.speechDurationMs,

      // Fallback VAD status (for debugging / observability)
      isFallbackVADActive,

      // Phase 3: Last backend barge-in classification (for UX differentiation)
      lastBargeInClassification,

      // Actions
      connect,
      disconnect,
      bargeIn,
      sendTextMessage: session.sendMessage,
      setVolume: audioPlayback.setVolume,
      resetError: session.resetFatalError,

      // Barge-in prompt audio (uses ElevenLabs for consistent voice)
      playBargeInPrompt: bargeInPromptAudio.playPrompt,
      isBargeInPromptReady: bargeInPromptAudio.isReady,

      // Natural Conversation Flow: Phase 1 - Manual Override Controls
      isMuted,
      toggleMute,
      forceReply,
      stopAI,

      // Natural Conversation Flow: Phase 3.2 - Continuation Detection
      isContinuationExpected: session.isContinuationExpected,

      // Natural Conversation Flow: Phase 6 - Network-Adaptive Behavior
      networkQuality: networkQuality.metrics.quality,
      networkRttMs: networkQuality.metrics.rttMs,
      isNetworkDegraded, // Phase 6.3
      pushToTalkRecommended,
    }),
    [
      session,
      audioPlayback,
      backchannelAudio,
      bargeInPromptAudio,
      sileroVAD,
      currentEmotion,
      thinkingSource,
      isMuted,
      connect,
      disconnect,
      bargeIn,
      toggleMute,
      forceReply,
      stopAI,
      networkQuality.metrics.quality,
      networkQuality.metrics.rttMs,
      isNetworkDegraded,
      isFallbackVADActive,
      lastBargeInClassification,
      pushToTalkRecommended,
    ],
  );
}

export default useThinkerTalkerVoiceMode;
