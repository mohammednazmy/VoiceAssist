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
} from "./useThinkerTalkerSession";
import { useTTAudioPlayback, type TTPlaybackState } from "./useTTAudioPlayback";
import { useBackchannelAudio } from "./useBackchannelAudio";
import { useBargeInPromptAudio } from "./useBargeInPromptAudio";
import { useSileroVAD } from "./useSileroVAD";
import { useUnifiedConversationStore } from "../stores/unifiedConversationStore";
import { useAuthStore } from "../stores/authStore";
import { useAuth } from "./useAuth";
import { useFeatureFlag } from "./useExperiment";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface TTVoiceModeOptions {
  /** Conversation ID for context */
  conversation_id?: string;
  /** Voice settings */
  voiceSettings?: TTVoiceSettings;
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
    onUserTranscript,
    onAIResponse,
    onToolCall,
    onMetricsUpdate,
    onEmotionDetected,
    enableBackchannel = true,
    onBackchannelPlay,
    // Silero VAD Feature Flag Options (with defaults matching documentation)
    sileroVADEnabled = true,
    sileroEchoSuppressionMode = "threshold_boost",
    sileroPositiveThreshold = 0.5,
    sileroPlaybackThresholdBoost = 0.2,
    sileroMinSpeechMs = 150,
    sileroPlaybackMinSpeechMs = 200,
  } = options;

  const { apiClient } = useAuth();

  const defaultSileroConfig: SileroFlagConfig = useMemo(
    () => ({
      enabled: sileroVADEnabled,
      echoSuppressionMode: sileroEchoSuppressionMode,
      positiveThreshold: sileroPositiveThreshold,
      playbackThresholdBoost: sileroPlaybackThresholdBoost,
      minSpeechMs: sileroMinSpeechMs,
      playbackMinSpeechMs: sileroPlaybackMinSpeechMs,
      confidenceSharing: true,
    }),
    [
      sileroEchoSuppressionMode,
      sileroMinSpeechMs,
      sileroPlaybackMinSpeechMs,
      sileroPlaybackThresholdBoost,
      sileroPositiveThreshold,
      sileroVADEnabled,
    ],
  );

  const [sileroFlags, setSileroFlags] =
    useState<SileroFlagConfig>(defaultSileroConfig);
  const [sileroFlagsLoaded, setSileroFlagsLoaded] = useState(false);

  // Phase 1: Emotion state
  const [currentEmotion, setCurrentEmotion] = useState<TTEmotionResult | null>(
    null,
  );

  // Issue 1: Unified thinking feedback - track source
  const [thinkingSource, setThinkingSource] = useState<"backend" | "frontend">(
    "frontend",
  );

  // Refs for Silero VAD barge-in (avoid stale closures and debouncing)
  const lastBargeInTimeRef = useRef<number>(0);
  const BARGE_IN_DEBOUNCE_MS = 500; // Prevent multiple rapid barge-ins

  // Ref for sileroVAD to avoid including entire object in effect dependencies
  // Declared early so it can be used in audioPlayback callbacks
  const sileroVADRef = useRef<ReturnType<typeof useSileroVAD> | null>(null);
  const sileroRollbackTimeoutRef = useRef<number | null>(null);
  // Track if we've started VAD to avoid multiple starts
  const vadStartedRef = useRef(false);
  const clearSileroRollbackTimeout = useCallback(() => {
    if (sileroRollbackTimeoutRef.current) {
      clearTimeout(sileroRollbackTimeoutRef.current);
      sileroRollbackTimeoutRef.current = null;
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

  useEffect(() => {
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
            .filter((f): f is { name: string } & Record<string, unknown> => !!f)
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

        setSileroFlags({
          enabled: parseBooleanFlag(
            byName["backend.voice_silero_vad_enabled"] ?? null,
            defaultSileroConfig.enabled,
          ),
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

  // Track current response for streaming
  let currentResponseId: string | null = null;

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

  // Audio playback hook
  const audioPlayback = useTTAudioPlayback({
    volume,
    onPlaybackStart: () => {
      voiceLog.info(
        "[TTVoiceMode] Playback started - enabling echo suppression",
      );
      startSpeaking();
      // Phase 1: Use echo-aware VAD API instead of pausing entirely
      // The setPlaybackActive method applies echo suppression based on echoSuppressionMode:
      // - "threshold_boost": VAD stays active with higher threshold (default, recommended)
      // - "pause": VAD pauses entirely (original behavior)
      // - "none": No suppression
      const vad = sileroVADRef.current;
      if (vad) {
        vad.setPlaybackActive(true);
      }
    },
    onPlaybackEnd: () => {
      voiceLog.info(
        "[TTVoiceMode] Playback ended - disabling echo suppression",
      );
      stopSpeaking();
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
    () => ({
      enabled: sileroFlags.enabled,
      echoSuppressionMode: sileroFlags.echoSuppressionMode,
      positiveThreshold: sileroFlags.positiveThreshold,
      playbackThresholdBoost: sileroFlags.playbackThresholdBoost,
      minSpeechMs: sileroFlags.minSpeechMs,
      playbackMinSpeechMs: sileroFlags.playbackMinSpeechMs,
      confidenceSharing:
        sileroFlags.confidenceSharing &&
        (sileroFlagsLoaded ? confidenceFlagEnabled : true),
    }),
    [
      confidenceFlagEnabled,
      sileroFlags.confidenceSharing,
      sileroFlags.echoSuppressionMode,
      sileroFlags.enabled,
      sileroFlags.minSpeechMs,
      sileroFlags.playbackMinSpeechMs,
      sileroFlags.playbackThresholdBoost,
      sileroFlags.positiveThreshold,
      sileroFlagsLoaded,
    ],
  );

  // T/T session hook
  const session = useThinkerTalkerSession({
    conversation_id,
    voiceSettings,
    autoConnect,

    // Handle transcripts
    // NOTE: Message addition is handled by parent component via onUserTranscript callback
    // to avoid duplicate messages in the chat
    onTranscript: (transcript: TTTranscript) => {
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
    onResponseDelta: (delta: string, messageId: string) => {
      if (messageId !== currentResponseId) {
        // New response - just track it, don't reset audio here
        // Audio reset already happens in onPipelineStateChange("processing")
        // Resetting here causes race conditions with arriving audio chunks
        voiceLog.debug(`[TTVoiceMode] New response started: ${messageId}`);
        currentResponseId = messageId;
      }
      onAIResponse?.(delta, false);
    },

    // Handle complete response
    // NOTE: Message addition is handled by parent component via onAIResponse callback
    // to avoid duplicate messages in the chat
    onResponseComplete: (content: string, _messageId: string) => {
      currentResponseId = null;
      onAIResponse?.(content, true);
    },

    // Handle audio chunks
    onAudioChunk: (audioBase64: string) => {
      voiceLog.debug("[TTVoiceMode] Audio chunk received", {
        audioLength: audioBase64.length,
      });
      audioPlayback.queueAudioChunk(audioBase64);
    },

    // Handle tool calls
    onToolCall: (toolCall: TTToolCall) => {
      onToolCall?.(toolCall);
    },

    // Handle connection changes
    onConnectionChange: (status: TTConnectionStatus) => {
      voiceLog.debug(`[TTVoiceMode] Connection status: ${status}`);

      // Map T/T status to store status
      if (status === "connected" || status === "ready") {
        setVoiceConnectionStatus("connected");
      } else if (status === "connecting") {
        setVoiceConnectionStatus("connecting");
      } else if (status === "reconnecting") {
        setVoiceConnectionStatus("reconnecting");
      } else if (
        status === "error" ||
        status === "failed" ||
        status === "mic_permission_denied"
      ) {
        setVoiceConnectionStatus("error");
      } else {
        setVoiceConnectionStatus("disconnected");
      }
    },

    // Handle pipeline state changes
    onPipelineStateChange: (state: PipelineState) => {
      voiceLog.debug(`[TTVoiceMode] Pipeline state: ${state}`);

      switch (state) {
        case "listening":
          setVoiceState("listening");
          startListening();
          clearSileroRollbackTimeout();
          // Signal end of audio stream when backend transitions to listening
          // This allows isPlaying to reset when all queued audio finishes
          // Note: Don't call reset() here - that would cut off audio mid-playback
          // during natural completion. reset() is called in "processing" state instead.
          audioPlayback.endStream();
          break;
        case "processing":
          setVoiceState("processing");
          stopListening();
          clearSileroRollbackTimeout();
          // Reset audio when starting to process new utterance
          // This prevents audio overlap from stale responses
          audioPlayback.reset();
          break;
        case "speaking":
          setVoiceState("responding");
          break;
        case "cancelled":
        case "idle":
          setVoiceState("idle");
          clearSileroRollbackTimeout();
          // Signal end of stream in terminal states
          // Let any playing audio finish naturally
          audioPlayback.endStream();
          break;
      }
    },

    // Handle speech events for barge-in
    // This is triggered by backend Deepgram VAD when it detects user speech
    onSpeechStarted: () => {
      voiceLog.info("[TTVoiceMode] Backend VAD: User speech detected");
      startListening();

      // CRITICAL: Trigger barge-in if AI is currently speaking
      // Backend Deepgram VAD is more reliable than local Silero VAD during playback
      // because it's server-side and not affected by speaker echo
      if (audioPlayback.isPlaying) {
        // Debounce to prevent multiple rapid barge-ins
        const now = Date.now();
        if (now - lastBargeInTimeRef.current < BARGE_IN_DEBOUNCE_MS) {
          voiceLog.info("[TTVoiceMode] Backend VAD barge-in debounced");
          return;
        }
        lastBargeInTimeRef.current = now;

        voiceLog.info(
          "[TTVoiceMode] Backend VAD barge-in: user speaking while AI playing",
        );
        // Fade out audio immediately for smooth transition
        audioPlayback.fadeOut(50);
        // Notify backend to cancel response generation
        session.bargeIn();
      }
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
      // Only trigger barge-in if audio is currently playing
      if (audioPlayback.isPlaying) {
        voiceLog.info(
          `[TTVoiceMode] Local VAD barge-in: rms=${rmsLevel.toFixed(3)}, stopping playback`,
        );
        // Fade out audio immediately
        audioPlayback.fadeOut(50);
        // Notify backend to cancel response generation
        session.bargeIn();
      }
    },

    // Enable instant barge-in for reduced latency
    enableInstantBargeIn: true,

    // Handle metrics
    onMetricsUpdate: (metrics: TTVoiceMetrics) => {
      onMetricsUpdate?.(metrics);
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
  });

  // Refs for Silero VAD callbacks (avoid stale closures)
  const audioPlaybackRef = useRef(audioPlayback);
  const sessionRef = useRef(session);

  // Keep refs updated
  useEffect(() => {
    audioPlaybackRef.current = audioPlayback;
    sessionRef.current = session;
  });

  // Silero VAD for reliable local voice activity detection
  // Uses neural network model (much more accurate than RMS threshold)
  // Phase 1: Echo-aware mode keeps VAD active during AI playback with elevated threshold
  // All parameters are now configurable via feature flags (backend.voice_silero_*)
  const sileroVAD = useSileroVAD({
    // Master enable/disable via feature flag (backend.voice_silero_vad_enabled)
    // When false, VAD will not initialize - provides rollback lever if issues occur
    enabled: resolvedSileroConfig.enabled,

    onSpeechStart: () => {
      voiceLog.debug("[TTVoiceMode] Silero VAD: Speech started");

      // Debounce to prevent multiple rapid barge-ins
      const now = Date.now();
      if (now - lastBargeInTimeRef.current < BARGE_IN_DEBOUNCE_MS) {
        voiceLog.debug("[TTVoiceMode] Silero VAD: Barge-in debounced");
        return;
      }

      // Trigger barge-in if AI is currently speaking (audio playing)
      if (audioPlaybackRef.current.isPlaying) {
        voiceLog.info(
          "[TTVoiceMode] Silero VAD barge-in: user speaking while AI playing",
        );
        lastBargeInTimeRef.current = now;
        // Phase 4: Start fade immediately (don't wait for speech confirmation)
        // 30ms fade is nearly instant but avoids audio pop
        audioPlaybackRef.current.fadeOut(30);
        // Notify backend to cancel response generation
        sessionRef.current.bargeIn();
        // Rollback guard: if no transcript or pipeline transition in 500ms, resume
        clearSileroRollbackTimeout();
        sileroRollbackTimeoutRef.current = window.setTimeout(() => {
          const sessionSnapshot = sessionRef.current;
          if (
            sessionSnapshot?.pipelineState === "speaking" &&
            !sessionSnapshot.partialTranscript
          ) {
            voiceLog.warn(
              "[TTVoiceMode] Silero VAD barge-in rollback (no transcript within 500ms)",
            );
            audioPlaybackRef.current.reset();
          }
        }, 500);
      }
    },
    onSpeechEnd: (audio) => {
      voiceLog.debug(
        `[TTVoiceMode] Silero VAD: Speech ended, audio length: ${audio.length}`,
      );
    },
    onVADMisfire: () => {
      voiceLog.debug("[TTVoiceMode] Silero VAD: Misfire (speech too short)");
    },
    // Don't auto-start - we'll start when connected
    autoStart: false,

    // Speech detection thresholds (configurable via feature flags)
    // backend.voice_silero_positive_threshold (default: 0.5)
    positiveSpeechThreshold: resolvedSileroConfig.positiveThreshold,
    // Negative threshold is typically 70% of positive threshold
    negativeSpeechThreshold: resolvedSileroConfig.positiveThreshold * 0.7,
    // backend.voice_silero_min_speech_ms (default: 150)
    minSpeechMs: resolvedSileroConfig.minSpeechMs,

    // Echo Cancellation settings (configurable via feature flags)
    // backend.voice_silero_echo_suppression_mode (default: "threshold_boost")
    echoSuppressionMode: resolvedSileroConfig.echoSuppressionMode,
    // backend.voice_silero_playback_threshold_boost (default: 0.2)
    playbackThresholdBoost: resolvedSileroConfig.playbackThresholdBoost,
    // backend.voice_silero_playback_min_speech_ms (default: 200)
    playbackMinSpeechMs: resolvedSileroConfig.playbackMinSpeechMs,
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
      session.sendVADState(vad.getVADState());
    }

    // Continue streaming at 100ms intervals during speech
    const intervalId = window.setInterval(() => {
      const vadState = sileroVADRef.current?.getVADState();
      if (sileroVADRef.current?.isSpeaking && vadState) {
        sessionRef.current?.sendVADState(vadState);
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
  ]);

  // Start/stop Silero VAD based on connection status
  // IMPORTANT: Only depend on session.isConnected - do NOT depend on sileroVAD state
  // as that causes the effect to re-run when VAD state changes, potentially destroying
  // the VAD during barge-in or speech detection.
  useEffect(() => {
    const vad = sileroVADRef.current;
    if (!vad) return;

    if (session.isConnected && !vadStartedRef.current) {
      voiceLog.debug("[TTVoiceMode] Starting Silero VAD (connected)");
      vadStartedRef.current = true;
      vad.start();
    } else if (!session.isConnected && vadStartedRef.current) {
      voiceLog.debug("[TTVoiceMode] Stopping Silero VAD (disconnected)");
      vadStartedRef.current = false;
      vad.stop();
    }
  }, [session.isConnected]);

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

  // Enhanced connect that pre-warms audio
  const connect = useCallback(async () => {
    voiceLog.debug("[TTVoiceMode] Connecting with audio pre-warm");
    // Pre-warm AudioContext before connecting to reduce latency
    await audioPlayback.warmup();
    return session.connect();
  }, [audioPlayback, session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSileroRollbackTimeout();
      audioPlayback.reset();
    };
  }, [audioPlayback, clearSileroRollbackTimeout]);

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
    }),
    [
      session,
      audioPlayback,
      backchannelAudio,
      bargeInPromptAudio,
      sileroVAD,
      currentEmotion,
      thinkingSource,
      connect,
      disconnect,
      bargeIn,
    ],
  );
}

export default useThinkerTalkerVoiceMode;
