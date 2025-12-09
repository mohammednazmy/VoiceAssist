/**
 * useThinkerTalkerSession Hook
 *
 * Manages WebSocket connection to the Thinker/Talker voice pipeline.
 * Replaces OpenAI Realtime API with our local STT → LLM → TTS pipeline.
 *
 * Benefits over Realtime API:
 * - Unified conversation context with chat mode
 * - Full tool/RAG support in voice
 * - Custom TTS (ElevenLabs) with better voice quality
 * - Lower cost per interaction
 *
 * Pipeline:
 * 1. Deepgram streaming STT (with Whisper fallback)
 * 2. GPT-4o Thinker with tool calling
 * 3. ElevenLabs streaming TTS
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 * Enhanced: Phases 7-10 (Multilingual, Personalization, Offline, Conversation Management)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { captureVoiceError } from "../lib/sentry";
import { useAuth } from "./useAuth";
import { voiceLog } from "../lib/logger";

// Natural Conversation Flow: Phase 3.1 - Prosody Feature Extraction
import {
  ProsodyExtractor,
  createProsodyExtractor,
  type ProsodyWebSocketMessage,
} from "../lib/prosodyExtractor";

// Phase 7-10: Advanced voice barge-in hooks
import { useMultilingual } from "./useMultilingual";
import { usePersonalization } from "./usePersonalization";
import { useOfflineVADWithFallback } from "./useOfflineVAD";
import { useConversationManager } from "./useConversationManager";
import type { BargeInType as ConversationBargeInType } from "../lib/conversationManager/types";

// ============================================================================
// Types
// ============================================================================

/**
 * T/T Pipeline session configuration from backend
 */
export interface TTSessionConfig {
  session_id: string;
  pipeline_mode: "thinker_talker";
  websocket_url: string;
  voice_config: {
    voice_id: string;
    tts_model: string;
    stt_language: string;
    barge_in_enabled: boolean;
  };
}

/**
 * Connection status for T/T session
 */
export type TTConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "reconnecting"
  | "error"
  | "failed"
  | "mic_permission_denied";

/**
 * Pipeline state as reported by backend
 */
export type PipelineState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "cancelled";

/**
 * Transcript from STT
 */
export interface TTTranscript {
  text: string;
  is_final: boolean;
  timestamp: number;
  message_id?: string;
}

/**
 * Tool call in progress
 */
export interface TTToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
}

/**
 * Emotion detected from user's voice (Phase 1: Hume AI integration)
 */
export interface TTEmotionResult {
  primary_emotion: string;
  primary_confidence: number;
  secondary_emotion: string | null;
  secondary_confidence: number | null;
  valence: number; // -1 to 1 (negative to positive)
  arousal: number; // 0 to 1 (calm to excited)
  dominance: number; // 0 to 1 (submissive to dominant)
  timestamp: number;
}

/**
 * Backchannel audio trigger (Phase 2: Natural verbal cues)
 */
export interface TTBackchannelEvent {
  phrase: string; // e.g., "uh-huh", "I see", "mmhmm"
  audio: string; // Base64-encoded audio
  format: string; // Audio format (e.g., "pcm_24000")
  duration_ms: number;
}

/**
 * Thinking feedback state event (Issue 1: Unified thinking tones)
 * Coordinates frontend and backend thinking feedback systems.
 */
export interface TTThinkingStateEvent {
  /** Whether thinking feedback is active */
  isThinking: boolean;
  /** Source of thinking feedback (backend or frontend) */
  source: "backend" | "frontend";
  /** Tone style being used */
  style?: string;
  /** Volume level (0-1) */
  volume?: number;
}

/**
 * Turn-taking state prediction (Phase 5: Advanced turn management)
 */
export interface TTTurnState {
  state: "continuing" | "pausing" | "yielding" | "uncertain";
  confidence: number; // 0 to 1
  recommended_wait_ms: number;
  signals: {
    falling_intonation: boolean;
    trailing_off: boolean;
    thinking_aloud: boolean;
    continuation_cue: boolean;
  };
}

/**
 * Repair strategy event (Phase 7: Conversational repair)
 */
export interface TTRepairEvent {
  confidence: number; // 0 to 1 - AI's confidence in understanding
  needsClarification: boolean; // True if AI needs more info from user
  repairApplied: boolean; // True if a repair strategy was applied
}

/**
 * Dictation state (Phase 8: Medical dictation)
 */
export type DictationState =
  | "idle"
  | "listening"
  | "processing"
  | "paused"
  | "reviewing"
  | "saving"
  | "completed";

/**
 * Note type for dictation
 */
export type NoteType =
  | "soap"
  | "h_and_p"
  | "progress"
  | "procedure"
  | "consult"
  | "discharge"
  | "custom";

/**
 * Dictation state event (Phase 8: Medical dictation)
 */
export interface TTDictationStateEvent {
  state: DictationState;
  noteType: NoteType;
  currentSection: string;
}

/**
 * Dictation section update event (Phase 8: Medical dictation)
 */
export interface TTDictationSectionEvent {
  section: string;
  content: string;
  partialText?: string;
  wordCount: number;
  isFinal: boolean;
}

/**
 * Dictation command event (Phase 8: Medical dictation)
 */
export interface TTDictationCommandEvent {
  command: string;
  category: string;
  executed: boolean;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Patient context prompt (Phase 9: Patient context integration)
 */
export interface TTPatientContextPrompt {
  type: "info" | "alert" | "suggestion" | "question";
  category: string;
  message: string;
  priority: number;
}

/**
 * Patient context loaded event (Phase 9: Patient context integration)
 */
export interface TTPatientContextEvent {
  patientId: string;
  prompts: TTPatientContextPrompt[];
  summaries: {
    medications: string;
    allergies: string;
    conditions: string;
  };
}

/**
 * PHI alert event (Phase 9: HIPAA compliance)
 */
export interface TTPHIAlertEvent {
  alertLevel: "info" | "warning" | "critical";
  phiType: string;
  message: string;
  recommendedAction: "allow" | "mask" | "redact" | "alert" | "block";
}

/**
 * Session analytics data (Phase 10: Analytics)
 */
export interface TTSessionAnalytics {
  sessionId: string;
  userId: string | null;
  phase: string;
  mode: string;
  timing: {
    startedAt: string;
    endedAt: string | null;
    durationMs: number;
  };
  latency: {
    stt: { avgMs: number; p50Ms: number; p95Ms: number; samples: number };
    llm: { avgMs: number; p50Ms: number; p95Ms: number; samples: number };
    tts: { avgMs: number; p50Ms: number; p95Ms: number; samples: number };
    e2e: { avgMs: number; p50Ms: number; p95Ms: number; samples: number };
  };
  interactions: {
    counts: Record<string, number>;
    words: { user: number; ai: number };
    speakingTimeMs: { user: number; ai: number };
  };
  quality: {
    sttConfidence: { avg: number; samples: number };
    aiConfidence: { avg: number; samples: number };
    emotion: {
      detected: Record<string, number>;
      avgValence: number;
      avgArousal: number;
    };
    turnTaking: { smooth: number; interrupted: number; overlaps: number };
    repairs: number;
  };
  dictation: {
    noteType: string | null;
    sectionsUsed: string[];
    wordsDictated: number;
    commands: { executed: number; failed: number };
    formattingCorrections: number;
    abbreviationsExpanded: number;
    phiAlerts: number;
    durationMs: number;
  } | null;
  errors: {
    count: number;
    details: Array<{
      type: string;
      message: string;
      recoverable: boolean;
      timestamp: string;
    }>;
  };
}

/**
 * Feedback prompt (Phase 10: Feedback collection)
 */
export interface TTFeedbackPrompt {
  promptType: "rating" | "thumbs" | "comment" | "categories";
  message: string;
  options: string[] | null;
  context: Record<string, unknown>;
}

/**
 * Feedback prompts event (Phase 10: Feedback collection)
 */
export interface TTFeedbackPromptsEvent {
  prompts: TTFeedbackPrompt[];
}

/**
 * Feedback recorded event (Phase 10: Feedback collection)
 */
export interface TTFeedbackRecordedEvent {
  thumbsUp: boolean;
  messageId: string | null;
}

/**
 * Session recovery state for reconnection
 */
export interface TTSessionRecoveryState {
  /** Session ID for recovery */
  sessionId: string;
  /** Conversation ID */
  conversationId?: string;
  /** Last message sequence received */
  lastMessageSeq: number;
  /** Last audio sequence confirmed */
  lastAudioSeq: number;
  /** Partial transcript in progress */
  partialTranscript: string;
  /** Partial response in progress */
  partialResponse: string;
  /** Timestamp when state was saved */
  savedAt: number;
}

/**
 * Session recovery result from server
 */
export interface TTSessionRecoveryResult {
  /** Recovery state: none, partial, or full */
  recoveryState: "none" | "partial" | "full";
  /** Conversation ID restored */
  conversationId?: string;
  /** Partial transcript restored */
  partialTranscript: string;
  /** Partial response restored */
  partialResponse: string;
  /** Number of missed messages to replay */
  missedMessageCount: number;
}

/**
 * Phase 5.2: Transcript truncation result for audio-transcript sync
 */
export interface TTTranscriptTruncation {
  /** Text that was spoken before interruption */
  truncatedText: string;
  /** Text that was cut off */
  remainingText: string;
  /** Milliseconds into audio when interruption occurred */
  truncationPointMs: number;
  /** Last complete word before interruption */
  lastCompleteWord: string;
  /** Number of words spoken */
  wordsSpoken: number;
  /** Number of words remaining (cut off) */
  wordsRemaining: number;
  /** Timestamp when truncation occurred */
  timestamp: number;
}

/**
 * Voice metrics for performance monitoring
 */
export interface TTVoiceMetrics {
  /** Time from connect() call to ready status (ms) */
  connectionTimeMs: number | null;
  /** Time from speech end to first transcript (ms) */
  sttLatencyMs: number | null;
  /** Time from transcript to first LLM token (ms) */
  llmFirstTokenMs: number | null;
  /** Time from first LLM token to first TTS audio (ms) */
  ttsFirstAudioMs: number | null;
  /** Total time from speech end to first audio (ms) */
  totalLatencyMs: number | null;
  /** Session duration (ms) */
  sessionDurationMs: number | null;
  /** Count of user utterances */
  userUtteranceCount: number;
  /** Count of AI responses */
  aiResponseCount: number;
  /** Count of tool calls */
  toolCallCount: number;
  /** Count of barge-ins */
  bargeInCount: number;
  /** Reconnection count */
  reconnectCount: number;
  /** Session start timestamp */
  sessionStartedAt: number | null;

  // Phase 7.1: Enhanced metrics for comprehensive voice observability
  /** Time from barge-in trigger to audio mute (ms) - SLO target: P95 < 50ms */
  bargeInMuteLatencyMs: number | null;
  /** Average barge-in mute latency across session (ms) */
  avgBargeInMuteLatencyMs: number | null;
  /** Count of successful barge-ins (audio was playing) */
  successfulBargeInCount: number;
  /** Count of misfire barge-ins (no audio playing or echo triggered) */
  misfireBargeInCount: number;
  /** Time from user speech detected to first AI audio played (ms) - perceived latency */
  perceivedLatencyMs: number | null;
  /** Count of VAD events (speech segments detected) */
  vadEventCount: number;
  /** Count of truncated responses (barge-in during speech) */
  truncatedResponseCount: number;
}

/**
 * Voice settings for T/T session
 */
export interface TTVoiceSettings {
  voice_id?: string; // ElevenLabs voice ID
  language?: string; // STT language code
  barge_in_enabled?: boolean;
  tts_model?: string;
  vad_sensitivity?: number; // 0-100 from settings, converted to 0-1 for backend
}

/**
 * Hook options
 */
export interface UseThinkerTalkerSessionOptions {
  conversation_id?: string;
  voiceSettings?: TTVoiceSettings;
  onTranscript?: (transcript: TTTranscript) => void;
  /** Phase 5.2: Called when AI response is truncated during barge-in */
  onTranscriptTruncated?: (truncation: TTTranscriptTruncation) => void;
  onResponseDelta?: (delta: string, messageId: string) => void;
  onResponseComplete?: (content: string, messageId: string) => void;
  onAudioChunk?: (audioBase64: string) => void;
  onToolCall?: (toolCall: TTToolCall) => void;
  onToolResult?: (toolCall: TTToolCall) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: TTConnectionStatus) => void;
  /** Called when pipeline state changes. Reason is provided for listening state transitions. */
  onPipelineStateChange?: (state: PipelineState, reason?: string) => void;
  onMetricsUpdate?: (metrics: TTVoiceMetrics) => void;
  /** Called when user starts speaking (for barge-in) */
  onSpeechStarted?: () => void;
  /** Called when AI audio playback should stop */
  onStopPlayback?: () => void;
  /**
   * Called when AI audio should fade out quickly (Natural Conversation Flow).
   * Used for instant barge-in with smooth audio transition.
   * @param durationMs - Fade duration (default: 50ms)
   */
  onFadeOutPlayback?: (durationMs?: number) => void;
  /**
   * Called when local voice activity is detected (frontend VAD).
   * This is triggered by analyzing microphone audio levels locally,
   * without waiting for backend speech detection.
   * Used as a fallback for barge-in when backend VAD doesn't work.
   * @param rmsLevel - RMS audio level (0-1)
   */
  onLocalVoiceActivity?: (rmsLevel: number) => void;
  autoConnect?: boolean;

  // Natural Conversation Flow options
  /**
   * Enable instant barge-in using speech_started event.
   * When true, AI audio fades out immediately on any speech detection,
   * reducing barge-in latency from 200-300ms to <50ms.
   * Controlled by feature flag: backend.voice_instant_barge_in
   */
  enableInstantBargeIn?: boolean;

  /**
   * Enable prosody feature extraction for turn-taking.
   * When true, extracts pitch, energy, and speech rate from audio
   * and sends features with audio.input.complete messages.
   * Controlled by feature flag: backend.voice_prosody_extraction
   * Natural Conversation Flow: Phase 3.1
   */
  enableProsodyExtraction?: boolean;

  // Phase 7-10: Advanced options
  /** Enable multilingual detection and switching */
  enableMultilingual?: boolean;
  /** Enable adaptive personalization */
  enablePersonalization?: boolean;
  /** Enable offline VAD fallback */
  enableOfflineVAD?: boolean;
  /** Enable conversation management (sentiment, discourse) */
  enableConversationManagement?: boolean;
  /** Personalization sync endpoint */
  personalizationSyncEndpoint?: string;
  /** Callback when language is detected */
  onLanguageDetected?: (language: string, confidence: number) => void;
  /** Callback when sentiment changes */
  onSentimentChange?: (sentiment: string, confidence: number) => void;
  /** Callback when calibration completes */
  onCalibrationComplete?: (result: unknown) => void;

  // Phase 1-4: Conversational intelligence callbacks
  /** Callback when user emotion is detected (Phase 1: Hume AI) */
  onEmotionDetected?: (emotion: TTEmotionResult) => void;
  /** Callback when backchannel audio should play (Phase 2) */
  onBackchannel?: (event: TTBackchannelEvent) => void;

  // Phase 5: Turn-taking
  /** Callback when turn-taking state changes (Phase 5) */
  onTurnStateChange?: (turnState: TTTurnState) => void;

  // Phase 6: Variable response timing
  /** Callback when thinking filler is spoken (Phase 6) */
  onThinkingFiller?: (text: string, queryType: string) => void;

  // Issue 1: Unified thinking feedback
  /** Callback when thinking feedback state changes (from backend) */
  onThinkingStateChange?: (event: TTThinkingStateEvent) => void;

  // Phase 7: Conversational repair
  /** Callback when a repair strategy is applied (Phase 7) */
  onRepairStrategy?: (event: TTRepairEvent) => void;

  // Phase 8: Medical dictation
  /** Callback when dictation state changes (Phase 8) */
  onDictationState?: (event: TTDictationStateEvent) => void;
  /** Callback when dictation section is updated (Phase 8) */
  onDictationSection?: (event: TTDictationSectionEvent) => void;
  /** Callback when dictation command is executed (Phase 8) */
  onDictationCommand?: (event: TTDictationCommandEvent) => void;

  // Phase 9: Patient context integration
  /** Callback when patient context is loaded (Phase 9) */
  onPatientContextLoaded?: (event: TTPatientContextEvent) => void;
  /** Callback when PHI is detected in dictation (Phase 9) */
  onPHIAlert?: (event: TTPHIAlertEvent) => void;

  // Phase 10: Analytics and feedback
  /** Callback when analytics update is received (Phase 10) */
  onAnalyticsUpdate?: (analytics: TTSessionAnalytics) => void;
  /** Callback when session analytics ends (Phase 10) */
  onSessionEnded?: (analytics: TTSessionAnalytics) => void;
  /** Callback when feedback prompts are available (Phase 10) */
  onFeedbackPrompts?: (event: TTFeedbackPromptsEvent) => void;
  /** Callback when feedback is recorded (Phase 10) */
  onFeedbackRecorded?: (event: TTFeedbackRecordedEvent) => void;

  // WebSocket Error Recovery callbacks
  /** Callback when session is recovered after reconnection */
  onSessionRecovered?: (result: TTSessionRecoveryResult) => void;
  /** Callback when session recovery fails */
  onSessionRecoveryFailed?: (reason: string) => void;
  /** Callback when a missed message is replayed during recovery */
  onMessageReplayed?: (message: Record<string, unknown>) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a microphone permission error (fatal, no retry)
 */
function isMicPermissionError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.name === "NotAllowedError" ||
      err.name === "SecurityError" ||
      err.name === "NotFoundError"
    );
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("permission") ||
      msg.includes("not allowed") ||
      msg.includes("blocked") ||
      msg.includes("denied")
    );
  }
  return false;
}

/**
 * Get user-friendly error message for mic permission errors
 */
function getMicErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Microphone access denied. Please allow microphone access in your browser settings and reload the page.";
      case "SecurityError":
        return "Microphone blocked by browser policy. This site may need to be accessed via HTTPS.";
      case "NotFoundError":
        return "No microphone found. Please connect a microphone and try again.";
      default:
        return `Microphone error: ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : "Unknown microphone error";
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useThinkerTalkerSession(
  options: UseThinkerTalkerSessionOptions = {},
) {
  const { tokens } = useAuth();

  const isAutomation =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { webdriver?: boolean }).webdriver;

  // Extract Phase 7-10 options
  const {
    enableMultilingual = true,
    enablePersonalization = true,
    enableOfflineVAD = true,
    enableConversationManagement = true,
    personalizationSyncEndpoint,
    onLanguageDetected,
    onSentimentChange,
    onCalibrationComplete,
    // Natural Conversation Flow: Phase 3.1 - Prosody extraction
    enableProsodyExtraction = false,
  } = options;

  // Natural Conversation Flow: Phase 3.1 - Initialize prosody ref from option
  useEffect(() => {
    prosodyEnabledRef.current = enableProsodyExtraction;
    voiceLog.debug(
      `[ThinkerTalker] Prosody extraction ${enableProsodyExtraction ? "enabled" : "disabled"}`,
    );
  }, [enableProsodyExtraction]);

  // Phase 7: Multilingual support
  const multilingual = useMultilingual({
    autoDetect: enableMultilingual,
    autoSwitch: false, // User controls language switching
    enableAccentDetection: true,
    onLanguageDetected: (result) => {
      onLanguageDetected?.(result.detectedLanguage, result.confidence);
    },
  });

  // Phase 8: Personalization
  const personalization = usePersonalization({
    syncEndpoint: personalizationSyncEndpoint,
    autoAdapt: enablePersonalization,
    onCalibrationComplete: (result) => {
      onCalibrationComplete?.(result);
    },
  });

  // Sync VAD sensitivity from voiceSettings to personalization hook
  // The store uses 0-100, personalization uses 0-1
  useEffect(() => {
    if (options.voiceSettings?.vad_sensitivity !== undefined) {
      const normalizedSensitivity = options.voiceSettings.vad_sensitivity / 100;
      personalization.setVadSensitivity(normalizedSensitivity);
      voiceLog.debug(
        `[ThinkerTalker] VAD sensitivity synced: ${options.voiceSettings.vad_sensitivity}% → ${normalizedSensitivity.toFixed(2)}`,
      );
    }
  }, [
    options.voiceSettings?.vad_sensitivity,
    personalization.setVadSensitivity,
  ]);

  // Phase 9: Offline VAD fallback
  // Note: networkVADAvailable is updated via effect when status changes
  const [networkVADAvailable, setNetworkVADAvailable] = useState(false);
  const offlineVAD = useOfflineVADWithFallback({
    enabled: enableOfflineVAD,
    networkVADAvailable,
    onSpeechStart: () => {
      voiceLog.debug("[ThinkerTalker] Offline VAD: speech started");
    },
    onSpeechEnd: () => {
      voiceLog.debug("[ThinkerTalker] Offline VAD: speech ended");
    },
    onFallbackToOffline: () => {
      voiceLog.debug("[ThinkerTalker] Falling back to offline VAD");
    },
    onReturnToNetwork: () => {
      voiceLog.debug("[ThinkerTalker] Returning to network VAD");
    },
  });

  // Phase 10: Conversation management
  const conversationManager = useConversationManager({
    enableSentimentTracking: enableConversationManagement,
    enableDiscourseAnalysis: enableConversationManagement,
    onSentimentChange: (sentiment) => {
      onSentimentChange?.(sentiment.sentiment, sentiment.confidence);
    },
  });

  // State
  const [status, setStatus] = useState<TTConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [partialTranscript, setPartialTranscript] = useState<string>("");
  // Phase 5.1: Streaming AI response text for progressive display
  const [partialAIResponse, setPartialAIResponse] = useState<string>("");
  // Phase 5.2: Transcript truncation result from barge-in
  const [lastTruncation, setLastTruncation] =
    useState<TTTranscriptTruncation | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  // Ref to track pipeline state for use in closures (avoids stale closure bug)
  const pipelineStateRef = useRef<PipelineState>("idle");
  const [currentToolCalls, setCurrentToolCalls] = useState<TTToolCall[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Natural Conversation Flow: Phase 3.2 - Continuation detection state
  const [isContinuationExpected, setIsContinuationExpected] = useState(false);
  const continuationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Metrics state
  const [metrics, setMetrics] = useState<TTVoiceMetrics>({
    connectionTimeMs: null,
    sttLatencyMs: null,
    llmFirstTokenMs: null,
    ttsFirstAudioMs: null,
    totalLatencyMs: null,
    sessionDurationMs: null,
    userUtteranceCount: 0,
    aiResponseCount: 0,
    toolCallCount: 0,
    bargeInCount: 0,
    reconnectCount: 0,
    sessionStartedAt: null,
    // Phase 7.1: Enhanced metrics
    bargeInMuteLatencyMs: null,
    avgBargeInMuteLatencyMs: null,
    successfulBargeInCount: 0,
    misfireBargeInCount: 0,
    perceivedLatencyMs: null,
    vadEventCount: 0,
    truncatedResponseCount: 0,
  });

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<
    ScriptProcessorNode | AudioWorkletNode | null
  >(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const intentionalDisconnectRef = useRef(false);
  const fatalErrorRef = useRef(false);

  // Binary protocol state (negotiated with server)
  const binaryProtocolEnabledRef = useRef(false);
  const audioSequenceRef = useRef(0);

  // Negotiated feature flags (confirmed by server)
  const negotiatedFeaturesRef = useRef<Set<string>>(new Set());
  const [negotiatedFeatures, setNegotiatedFeatures] = useState<string[]>([]);

  // Sequence validation state (for message ordering guarantees)
  const expectedSequenceRef = useRef(0);
  const reorderBufferRef = useRef<Map<number, Record<string, unknown>>>(
    new Map(),
  );
  const MAX_REORDER_BUFFER = 50; // Max messages to buffer for reordering

  // Timing refs for latency tracking
  const connectStartTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const speechEndTimeRef = useRef<number | null>(null);
  const firstTranscriptTimeRef = useRef<number | null>(null);
  const firstLLMTokenTimeRef = useRef<number | null>(null);
  // Track when last audio chunk was received (for barge-in detection)
  // If audio was received recently (<3s), we might still be "speaking" from user's perspective
  const lastAudioChunkTimeRef = useRef<number | null>(null);

  // Phase 7.1: Barge-in metrics tracking
  const bargeInStartTimeRef = useRef<number | null>(null);
  const bargeInMuteLatenciesRef = useRef<number[]>([]);

  // Ref for local voice activity callback (used in audio processor closure)
  const onLocalVoiceActivityRef = useRef<
    ((rmsLevel: number) => void) | undefined
  >(undefined);

  // Session recovery state (WebSocket Error Recovery)
  const sessionIdRef = useRef<string | null>(null);
  const recoveryEnabledRef = useRef<boolean>(false);

  // Natural Conversation Flow: Phase 3.1 - Prosody Extraction
  const prosodyExtractorRef = useRef<ProsodyExtractor | null>(null);
  const prosodyEnabledRef = useRef<boolean>(false);
  const lastProsodyFeaturesRef = useRef<ProsodyWebSocketMessage | null>(null);
  const isRecoveredSessionRef = useRef<boolean>(false);
  const lastMessageSeqRef = useRef<number>(0);
  const lastAudioSeqRef = useRef<number>(0);
  const partialTranscriptAccumRef = useRef<string>("");
  const partialResponseAccumRef = useRef<string>("");

  // LocalStorage key for session recovery
  const RECOVERY_STORAGE_KEY = "voiceassist_ws_recovery_state";
  const RECOVERY_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Save session recovery state to localStorage
   */
  const saveRecoveryState = useCallback(() => {
    if (!sessionIdRef.current || !recoveryEnabledRef.current) return;

    const state: TTSessionRecoveryState = {
      sessionId: sessionIdRef.current,
      conversationId: options.conversation_id,
      lastMessageSeq: lastMessageSeqRef.current,
      lastAudioSeq: lastAudioSeqRef.current,
      partialTranscript: partialTranscriptAccumRef.current,
      partialResponse: partialResponseAccumRef.current,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(state));
      voiceLog.debug(
        `[ThinkerTalker] Recovery state saved: seq=${state.lastMessageSeq}`,
      );
    } catch (err) {
      voiceLog.warn("[ThinkerTalker] Failed to save recovery state:", err);
    }
  }, [options.conversation_id]);

  /**
   * Load session recovery state from localStorage
   */
  const loadRecoveryState = useCallback((): TTSessionRecoveryState | null => {
    try {
      const stored = localStorage.getItem(RECOVERY_STORAGE_KEY);
      if (!stored) return null;

      const state: TTSessionRecoveryState = JSON.parse(stored);

      // Check if state is expired
      const age = Date.now() - state.savedAt;
      if (age > RECOVERY_TTL_MS) {
        voiceLog.debug("[ThinkerTalker] Recovery state expired");
        localStorage.removeItem(RECOVERY_STORAGE_KEY);
        return null;
      }

      // Check if conversation ID matches (if provided)
      if (
        options.conversation_id &&
        state.conversationId !== options.conversation_id
      ) {
        voiceLog.debug("[ThinkerTalker] Recovery state conversation mismatch");
        localStorage.removeItem(RECOVERY_STORAGE_KEY);
        return null;
      }

      voiceLog.debug(
        `[ThinkerTalker] Recovery state loaded: session=${state.sessionId}, seq=${state.lastMessageSeq}`,
      );
      return state;
    } catch (err) {
      voiceLog.warn("[ThinkerTalker] Failed to load recovery state:", err);
      return null;
    }
  }, [options.conversation_id]);

  /**
   * Clear session recovery state from localStorage
   */
  const clearRecoveryState = useCallback(() => {
    try {
      localStorage.removeItem(RECOVERY_STORAGE_KEY);
      voiceLog.debug("[ThinkerTalker] Recovery state cleared");
    } catch (err) {
      voiceLog.warn("[ThinkerTalker] Failed to clear recovery state:", err);
    }
  }, []);

  // Refs for callback functions (avoid circular dependencies)
  const connectRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const disconnectRef = useRef<() => void>(() => {});
  const updateStatusRef = useRef<(status: TTConnectionStatus) => void>(
    () => {},
  );
  const handleMessageRef = useRef<(message: Record<string, unknown>) => void>(
    () => {},
  );
  const handleMessageWithSequenceRef = useRef<
    (message: Record<string, unknown>) => void
  >(() => {});
  const statusRef = useRef<TTConnectionStatus>(status);

  // Constants for reconnection
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 300;
  const MAX_RECONNECT_DELAY = 30000;

  // Constants for heartbeat
  const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds between pings
  const HEARTBEAT_TIMEOUT_MS = 5000; // 5 seconds to receive pong

  // Heartbeat refs
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const lastPongTimeRef = useRef<number>(Date.now());
  const pendingPingTimeRef = useRef<number | null>(null);

  /**
   * Calculate reconnection delay with exponential backoff
   */
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    return Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY,
    );
  }, []);

  /**
   * Schedule automatic reconnection
   */
  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current || fatalErrorRef.current) {
      return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      voiceLog.error("[ThinkerTalker] Max reconnect attempts reached");
      updateStatusRef.current("failed");
      return;
    }

    const delay = calculateReconnectDelay(reconnectAttempts);
    voiceLog.debug(
      `[ThinkerTalker] Scheduling reconnect attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
    );

    updateStatusRef.current("reconnecting");

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts((prev) => prev + 1);
      connectRef.current();
    }, delay);
  }, [reconnectAttempts, calculateReconnectDelay]);

  /**
   * Start heartbeat ping/pong to detect zombie connections
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      return; // Already running
    }

    voiceLog.debug("[ThinkerTalker] Starting heartbeat");
    lastPongTimeRef.current = Date.now();

    heartbeatIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      // Check if we received pong from previous ping
      const timeSinceLastPong = Date.now() - lastPongTimeRef.current;

      if (timeSinceLastPong > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        voiceLog.warn(
          `[ThinkerTalker] Heartbeat timeout - no pong for ${timeSinceLastPong}ms, closing zombie connection`,
        );
        // Close with custom code to indicate heartbeat failure
        wsRef.current.close(4000, "Heartbeat timeout");
        return;
      }

      // Send ping
      const pingTime = Date.now();
      pendingPingTimeRef.current = pingTime;
      wsRef.current.send(
        JSON.stringify({
          type: "ping",
          ts: pingTime,
        }),
      );
      voiceLog.debug("[ThinkerTalker] Heartbeat ping sent");
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  /**
   * Stop heartbeat
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      pendingPingTimeRef.current = null;
      voiceLog.debug("[ThinkerTalker] Heartbeat stopped");
    }
  }, []);

  /**
   * Update metrics and notify callback
   */
  const updateMetrics = useCallback(
    (updates: Partial<TTVoiceMetrics>) => {
      setMetrics((prev) => {
        const updated = { ...prev, ...updates };
        options.onMetricsUpdate?.(updated);
        return updated;
      });
    },
    [options],
  );

  /**
   * Update status and notify callback
   */
  const updateStatus = useCallback(
    (newStatus: TTConnectionStatus) => {
      statusRef.current = newStatus;
      setStatus(newStatus);
      options.onConnectionChange?.(newStatus);

      if (newStatus === "ready" && connectStartTimeRef.current) {
        const connectionTime = Date.now() - connectStartTimeRef.current;
        sessionStartTimeRef.current = Date.now();
        updateMetrics({
          connectionTimeMs: connectionTime,
          sessionStartedAt: sessionStartTimeRef.current,
        });
        voiceLog.debug(
          `[ThinkerTalker] Connection ready in ${connectionTime}ms`,
        );
      }
    },
    [options, updateMetrics],
  );

  // Keep ref updated
  updateStatusRef.current = updateStatus;

  // Keep refs in sync
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Update network VAD availability when status changes
  useEffect(() => {
    setNetworkVADAvailable(status === "connected" || status === "ready");
  }, [status]);

  /**
   * Handle errors
   */
  const handleError = useCallback(
    (err: Error) => {
      voiceLog.error("[ThinkerTalker] Error:", err);
      setError(err);
      updateStatus("error");
      options.onError?.(err);

      captureVoiceError(err, {
        status: statusRef.current,
        conversationId: options.conversation_id,
        breadcrumb: "thinker_talker_error",
      });
    },
    [options, updateStatus],
  );

  /**
   * Drain the reorder buffer, processing messages in sequence order.
   * Called after processing an in-order message to check if buffered
   * messages can now be processed.
   */
  const drainReorderBuffer = useCallback(() => {
    const buffer = reorderBufferRef.current;
    let drained = 0;

    while (buffer.has(expectedSequenceRef.current)) {
      const msg = buffer.get(expectedSequenceRef.current)!;
      buffer.delete(expectedSequenceRef.current);
      expectedSequenceRef.current++;
      drained++;

      // Process the buffered message (call handleMessage directly)
      handleMessageRef.current(msg);
    }

    if (drained > 0) {
      voiceLog.debug(
        `[ThinkerTalker] Drained ${drained} messages from reorder buffer`,
      );
    }
  }, []);

  /**
   * Handle incoming WebSocket messages with sequence validation.
   * Ensures messages are processed in order, buffering out-of-order
   * messages for later processing.
   *
   * Sequence validation provides:
   * - Guaranteed message ordering
   * - Dropped message detection
   * - Out-of-order message buffering
   */
  const handleMessageWithSequence = useCallback(
    (message: Record<string, unknown>) => {
      const seq = message.seq as number | undefined;

      // If no sequence number, process immediately (legacy/control messages)
      if (seq === undefined) {
        handleMessageRef.current(message);
        return;
      }

      const expected = expectedSequenceRef.current;
      const msgType = message.type as string;

      if (seq === expected) {
        // In order - process immediately and drain buffer
        handleMessageRef.current(message);

        // For batch messages, the batch handler already updates expectedSequenceRef
        // to account for all messages in the batch. For regular messages, increment by 1.
        if (msgType !== "batch") {
          expectedSequenceRef.current = seq + 1;
        }
        drainReorderBuffer();
      } else if (seq > expected) {
        // Out of order - buffer for later
        if (reorderBufferRef.current.size < MAX_REORDER_BUFFER) {
          reorderBufferRef.current.set(seq, message);
          voiceLog.debug(
            `[ThinkerTalker] Buffered out-of-order message seq=${seq}, expected=${expected}`,
          );
        } else {
          voiceLog.warn(
            `[ThinkerTalker] Reorder buffer full (${MAX_REORDER_BUFFER}), dropping message seq=${seq}`,
          );
        }

        // Check for large gaps which might indicate dropped messages
        const gap = seq - expected;
        if (gap > 10) {
          voiceLog.warn(
            `[ThinkerTalker] Large sequence gap detected: expected=${expected}, got=${seq}, gap=${gap}`,
          );
        }
      } else {
        // Old message (seq < expected) - already processed, ignore
        voiceLog.debug(
          `[ThinkerTalker] Ignoring old message seq=${seq}, expected=${expected}`,
        );
      }
    },
    [drainReorderBuffer],
  );

  /**
   * Handle incoming WebSocket messages from T/T pipeline
   */
  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      const msgType = message.type as string;

      // Debug: Log speech and state messages for tracing
      if (msgType.includes("speech") || msgType.includes("state")) {
        console.log(`[ThinkerTalker] RECEIVED message: ${msgType}`, message);
      }

      switch (msgType) {
        case "session.ready": {
          voiceLog.debug("[ThinkerTalker] Session ready");
          updateStatus("ready");

          // Capture session ID and recovery state
          const sessionId = message.session_id as string;
          const recoveryEnabled = message.recovery_enabled as boolean;
          sessionIdRef.current = sessionId;
          recoveryEnabledRef.current = recoveryEnabled || false;

          if (recoveryEnabled) {
            voiceLog.info(
              `[ThinkerTalker] Session recovery enabled: ${sessionId}`,
            );
          }

          // Start heartbeat monitoring for zombie connection detection
          startHeartbeat();
          break;
        }

        case "session.init.ack": {
          // Protocol negotiation response from server
          const features = (message.features as string[]) || [];
          const protocolVersion = message.protocol_version as string;

          voiceLog.debug(
            `[ThinkerTalker] Protocol negotiated: version=${protocolVersion}, features=${features.join(", ")}`,
          );

          // Store negotiated features
          negotiatedFeaturesRef.current = new Set(features);
          setNegotiatedFeatures(features);

          // Enable binary protocol if negotiated
          if (features.includes("binary_audio")) {
            binaryProtocolEnabledRef.current = true;
            audioSequenceRef.current = 0;
            voiceLog.info("[ThinkerTalker] Binary audio protocol enabled");
          }

          // Log other enabled features
          if (features.includes("audio_prebuffering")) {
            voiceLog.info("[ThinkerTalker] Audio prebuffering enabled");
          }
          if (features.includes("adaptive_chunking")) {
            voiceLog.info("[ThinkerTalker] Adaptive chunking enabled");
          }
          if (features.includes("session_persistence")) {
            voiceLog.info("[ThinkerTalker] Session persistence enabled");
          }
          if (features.includes("graceful_degradation")) {
            voiceLog.info("[ThinkerTalker] Graceful degradation enabled");
          }
          break;
        }

        // ================================================================
        // WebSocket Error Recovery Message Handlers
        // ================================================================

        case "session.resume.ack": {
          // Session recovery succeeded
          const recoveryResult: TTSessionRecoveryResult = {
            recoveryState: message.recovery_state as
              | "none"
              | "partial"
              | "full",
            conversationId: message.conversation_id as string | undefined,
            partialTranscript: (message.partial_transcript as string) || "",
            partialResponse: (message.partial_response as string) || "",
            missedMessageCount: (message.missed_message_count as number) || 0,
          };

          voiceLog.info(
            `[ThinkerTalker] Session recovered: state=${recoveryResult.recoveryState}, ` +
              `missed=${recoveryResult.missedMessageCount}`,
          );

          // Restore partial state
          if (recoveryResult.partialTranscript) {
            setPartialTranscript(recoveryResult.partialTranscript);
            partialTranscriptAccumRef.current =
              recoveryResult.partialTranscript;
          }
          if (recoveryResult.partialResponse) {
            partialResponseAccumRef.current = recoveryResult.partialResponse;
          }

          isRecoveredSessionRef.current = true;
          options.onSessionRecovered?.(recoveryResult);
          break;
        }

        case "session.resume.nak": {
          // Session recovery failed
          const reason = message.reason as string;
          voiceLog.warn(`[ThinkerTalker] Session recovery failed: ${reason}`);

          // Clear stale recovery state
          clearRecoveryState();
          isRecoveredSessionRef.current = false;

          options.onSessionRecoveryFailed?.(reason);
          break;
        }

        case "message.replay": {
          // Replayed message from recovery
          const originalMessage = message.original as Record<string, unknown>;
          voiceLog.debug(
            `[ThinkerTalker] Message replay: type=${originalMessage.type}`,
          );

          // Process the replayed message
          handleMessageRef.current(originalMessage);
          options.onMessageReplayed?.(originalMessage);
          break;
        }

        case "audio.resume": {
          // Audio resume info for checkpointing
          const resumeFromSeq = message.resume_from_seq as number;
          voiceLog.debug(
            `[ThinkerTalker] Audio resume from seq=${resumeFromSeq}`,
          );

          // Update last confirmed audio sequence
          lastAudioSeqRef.current = resumeFromSeq;
          break;
        }

        case "batch": {
          // Message batching: server sent multiple messages in one frame
          const batchedMessages =
            (message.messages as Array<Record<string, unknown>>) || [];
          const batchCount = message.count as number;

          voiceLog.debug(
            `[ThinkerTalker] Received batch of ${batchCount} messages`,
          );

          // Process each message in the batch (bypassing sequence validation
          // since batch wrapper's seq was already validated, and individual
          // messages within a batch are guaranteed to be in order)
          for (const batchedMsg of batchedMessages) {
            handleMessageRef.current(batchedMsg);
          }

          // Update expected sequence based on last message in batch
          if (batchedMessages.length > 0) {
            const lastMsg = batchedMessages[batchedMessages.length - 1];
            const lastSeq = lastMsg.seq as number | undefined;
            if (lastSeq !== undefined) {
              expectedSequenceRef.current = lastSeq + 1;
            }
          }
          break;
        }

        case "audio.output.meta": {
          // Metadata for binary audio frames
          const format = message.format as string;
          const isFinal = message.is_final as boolean;
          const sequence = message.sequence as number;

          voiceLog.debug(
            `[ThinkerTalker] Audio meta: seq=${sequence}, format=${format}, final=${isFinal}`,
          );
          break;
        }

        case "transcript.delta": {
          // Partial transcript from STT
          // NOTE: Each partial is the FULL current hypothesis, not an incremental delta
          // So we REPLACE the partial transcript, not accumulate
          const text = message.text as string;
          const seq = message.seq as number | undefined;

          // Track sequence number for recovery
          if (seq !== undefined) {
            lastMessageSeqRef.current = seq;
          }

          if (text) {
            // Replace, don't accumulate - each partial is the full hypothesis
            setPartialTranscript(text);
            // Track for recovery
            partialTranscriptAccumRef.current = text;
            const preview =
              text.length > 200 ? `${text.slice(0, 200)}...` : text;
            voiceLog.info(
              `[ThinkerTalker] User transcript (partial): "${preview}"`,
            );

            options.onTranscript?.({
              text,
              is_final: false,
              timestamp: Date.now(),
            });
          }
          break;
        }

        case "transcript.complete": {
          // Final transcript from STT
          const text = message.text as string;
          const messageId = message.message_id as string | undefined;
          const seq = message.seq as number | undefined;

          // Track sequence number for recovery
          if (seq !== undefined) {
            lastMessageSeqRef.current = seq;
          }

          setTranscript(text);
          setPartialTranscript("");
          // Phase 5.1: Clear partial AI response as new response will start
          setPartialAIResponse("");
          // Clear transcript accumulator on completion
          partialTranscriptAccumRef.current = "";

          // Track STT latency
          const now = Date.now();
          const duration = speechEndTimeRef.current
            ? now - speechEndTimeRef.current
            : 0;
          const sttLatency = speechEndTimeRef.current
            ? now - speechEndTimeRef.current
            : null;
          firstTranscriptTimeRef.current = now;
          updateMetrics({
            sttLatencyMs: sttLatency,
            userUtteranceCount: metrics.userUtteranceCount + 1,
          });
          if (sttLatency !== null) {
            voiceLog.debug(`[ThinkerTalker] STT latency: ${sttLatency}ms`);
          }

          // Phase 7: Detect language from transcript
          if (enableMultilingual && text) {
            multilingual.detectLanguage(text);
          }

          // Phase 10: Process utterance for sentiment/discourse
          if (enableConversationManagement && text) {
            conversationManager.processUtterance(text, duration);
          }

          const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
          voiceLog.info(
            `[ThinkerTalker] User transcript (final): "${preview}"`,
          );

          options.onTranscript?.({
            text,
            is_final: true,
            timestamp: now,
            message_id: messageId,
          });
          break;
        }

        case "transcript.truncated": {
          // Phase 5.2: Audio-transcript synchronization
          // When user barges in, backend sends truncation info for clean text cutoff
          const truncatedText = message.truncated_text as string;
          const remainingText = message.remaining_text as string;
          const truncationPointMs = message.truncation_point_ms as number;
          const lastCompleteWord = message.last_complete_word as string;
          const wordsSpoken = message.words_spoken as number;
          const wordsRemaining = message.words_remaining as number;
          const timestamp = message.timestamp as number;

          voiceLog.debug(
            `[ThinkerTalker] Transcript truncated: "${truncatedText.slice(0, 30)}..." at ${truncationPointMs}ms`,
            { wordsSpoken, wordsRemaining, lastCompleteWord },
          );

          setLastTruncation({
            truncatedText,
            remainingText,
            truncationPointMs,
            lastCompleteWord,
            wordsSpoken,
            wordsRemaining,
            timestamp,
          });

          // Also update the partial AI response to show only what was spoken
          setPartialAIResponse(truncatedText);

          // Phase 7.1: Track barge-in mute latency
          if (bargeInStartTimeRef.current) {
            const muteLatency = Date.now() - bargeInStartTimeRef.current;
            bargeInMuteLatenciesRef.current.push(muteLatency);

            // Calculate average
            const avgLatency =
              bargeInMuteLatenciesRef.current.reduce((a, b) => a + b, 0) /
              bargeInMuteLatenciesRef.current.length;

            updateMetrics({
              bargeInMuteLatencyMs: muteLatency,
              avgBargeInMuteLatencyMs: avgLatency,
              truncatedResponseCount: metrics.truncatedResponseCount + 1,
            });

            voiceLog.debug(
              `[ThinkerTalker] Barge-in mute latency: ${muteLatency}ms (avg: ${avgLatency.toFixed(1)}ms)`,
            );
            bargeInStartTimeRef.current = null;
          }

          options.onTranscriptTruncated?.({
            truncatedText,
            remainingText,
            truncationPointMs,
            lastCompleteWord,
            wordsSpoken,
            wordsRemaining,
            timestamp,
          });
          break;
        }

        case "response.delta": {
          // Streaming LLM response token
          const delta = message.delta as string;
          const messageId = message.message_id as string;
          const seq = message.seq as number | undefined;

          // Track sequence number for recovery
          if (seq !== undefined) {
            lastMessageSeqRef.current = seq;
          }

          // Track accumulated response for recovery
          if (delta) {
            partialResponseAccumRef.current += delta;
            // Phase 5.1: Update state for progressive UI display
            setPartialAIResponse((prev) => prev + delta);
            const preview =
              delta.length > 200 ? `${delta.slice(0, 200)}...` : delta;
            voiceLog.info(`[ThinkerTalker] AI response delta: "${preview}"`);
          }

          // Track time to first LLM token
          if (!firstLLMTokenTimeRef.current && firstTranscriptTimeRef.current) {
            firstLLMTokenTimeRef.current = Date.now();
            const llmLatency =
              firstLLMTokenTimeRef.current - firstTranscriptTimeRef.current;
            updateMetrics({ llmFirstTokenMs: llmLatency });
            voiceLog.debug(`[ThinkerTalker] LLM first token: ${llmLatency}ms`);
          }

          options.onResponseDelta?.(delta, messageId);
          break;
        }

        case "response.complete": {
          // Complete LLM response
          // Backend sends "text", not "content"
          const content = (message.text || message.content || "") as string;
          const messageId = message.message_id as string;
          const seq = message.seq as number | undefined;

          // Track sequence number for recovery
          if (seq !== undefined) {
            lastMessageSeqRef.current = seq;
          }

          // Clear response accumulator on completion
          partialResponseAccumRef.current = "";
          // Phase 5.1: Clear partial AI response state
          setPartialAIResponse("");

          const preview =
            content.length > 200 ? `${content.slice(0, 200)}...` : content;
          voiceLog.info(`[ThinkerTalker] AI response complete: "${preview}"`);

          updateMetrics({ aiResponseCount: metrics.aiResponseCount + 1 });
          options.onResponseComplete?.(content, messageId);
          break;
        }

        case "response.filler": {
          // Phase 6: Thinking filler before complex response
          // e.g., "Hmm, let me think about that..."
          const fillerText = message.text as string;
          const queryType = message.query_type as string;

          voiceLog.debug(
            `[ThinkerTalker] Thinking filler: "${fillerText}" (query_type=${queryType})`,
          );

          // Notify callback if provided
          options.onThinkingFiller?.(fillerText, queryType);
          break;
        }

        case "response.repair": {
          // Phase 7: Repair strategy was applied due to low confidence
          const confidence = message.confidence as number;
          const needsClarification = message.needs_clarification as boolean;
          const repairApplied = message.repair_applied as boolean;

          voiceLog.debug(
            `[ThinkerTalker] Repair strategy: confidence=${confidence.toFixed(2)}, ` +
              `needs_clarification=${needsClarification}, repair_applied=${repairApplied}`,
          );

          // Notify callback if provided
          options.onRepairStrategy?.({
            confidence,
            needsClarification,
            repairApplied,
          });
          break;
        }

        // ================================================================
        // Phase 8: Medical Dictation Message Handlers
        // ================================================================

        case "dictation.state": {
          // Phase 8: Dictation state change
          const dictationState: TTDictationStateEvent = {
            state: message.state as DictationState,
            noteType: message.note_type as NoteType,
            currentSection: message.current_section as string,
          };

          voiceLog.debug(
            `[ThinkerTalker] Dictation state: ${dictationState.state}, ` +
              `section=${dictationState.currentSection}`,
          );

          options.onDictationState?.(dictationState);
          break;
        }

        case "dictation.section_update": {
          // Phase 8: Dictation section content update
          const sectionEvent: TTDictationSectionEvent = {
            section: message.section as string,
            content: message.content as string,
            partialText: message.partial_text as string | undefined,
            wordCount: message.word_count as number,
            isFinal: message.is_final as boolean,
          };

          voiceLog.debug(
            `[ThinkerTalker] Dictation section update: ${sectionEvent.section}, ` +
              `words=${sectionEvent.wordCount}, final=${sectionEvent.isFinal}`,
          );

          options.onDictationSection?.(sectionEvent);
          break;
        }

        case "dictation.section_change": {
          // Phase 8: Navigation to different section
          voiceLog.debug(
            `[ThinkerTalker] Dictation section change: ` +
              `${message.previous_section} -> ${message.current_section}`,
          );

          // Emit as a state event with the new section
          options.onDictationState?.({
            state: "listening",
            noteType: "soap", // Default, actual value would come from session
            currentSection: message.current_section as string,
          });
          break;
        }

        case "dictation.command": {
          // Phase 8: Voice command executed
          const commandEvent: TTDictationCommandEvent = {
            command: message.command as string,
            category: message.category as string,
            executed: message.executed as boolean,
            message: message.message as string,
            data: message.data as Record<string, unknown>,
          };

          voiceLog.debug(
            `[ThinkerTalker] Dictation command: ${commandEvent.command}, ` +
              `executed=${commandEvent.executed}`,
          );

          options.onDictationCommand?.(commandEvent);
          break;
        }

        // ================================================================
        // Phase 9: Patient Context & PHI Monitoring Handlers
        // ================================================================

        case "patient.context_loaded": {
          // Phase 9: Patient context loaded for dictation
          const contextEvent: TTPatientContextEvent = {
            patientId: message.patient_id as string,
            prompts: (
              (message.prompts as Array<Record<string, unknown>>) || []
            ).map((p) => ({
              type: p.type as "info" | "alert" | "suggestion" | "question",
              category: p.category as string,
              message: p.message as string,
              priority: p.priority as number,
            })),
            summaries: message.summaries as {
              medications: string;
              allergies: string;
              conditions: string;
            },
          };

          voiceLog.debug(
            `[ThinkerTalker] Patient context loaded: ${contextEvent.patientId}, ` +
              `${contextEvent.prompts.length} prompts`,
          );

          options.onPatientContextLoaded?.(contextEvent);
          break;
        }

        case "phi.alert": {
          // Phase 9: PHI detected in dictation
          const phiEvent: TTPHIAlertEvent = {
            alertLevel: message.alert_level as "info" | "warning" | "critical",
            phiType: message.phi_type as string,
            message: message.message as string,
            recommendedAction: message.recommended_action as
              | "allow"
              | "mask"
              | "redact"
              | "alert"
              | "block",
          };

          voiceLog.debug(
            `[ThinkerTalker] PHI alert: ${phiEvent.alertLevel} - ${phiEvent.phiType}, ` +
              `action=${phiEvent.recommendedAction}`,
          );

          // Log warning for critical PHI alerts
          if (phiEvent.alertLevel === "critical") {
            voiceLog.warn(
              `[ThinkerTalker] CRITICAL PHI alert: ${phiEvent.message}`,
            );
          }

          options.onPHIAlert?.(phiEvent);
          break;
        }

        // ================================================================
        // Phase 10: Analytics & Feedback Message Handlers
        // ================================================================

        case "analytics.update": {
          // Phase 10: Periodic analytics update
          const analyticsData = message as unknown as TTSessionAnalytics;

          voiceLog.debug(
            `[ThinkerTalker] Analytics update: phase=${analyticsData.phase}, ` +
              `duration=${analyticsData.timing?.durationMs?.toFixed(0) || 0}ms`,
          );

          options.onAnalyticsUpdate?.(analyticsData);
          break;
        }

        case "analytics.session_ended": {
          // Phase 10: Final session analytics
          const finalAnalytics = message as unknown as TTSessionAnalytics;

          voiceLog.debug(
            `[ThinkerTalker] Session ended: duration=${finalAnalytics.timing?.durationMs?.toFixed(0) || 0}ms, ` +
              `utterances=${finalAnalytics.interactions?.counts?.user_utterances || 0}`,
          );

          options.onSessionEnded?.(finalAnalytics);
          break;
        }

        case "feedback.prompts": {
          // Phase 10: Feedback prompts available
          const promptsData = message.prompts as Array<Record<string, unknown>>;
          const feedbackEvent: TTFeedbackPromptsEvent = {
            prompts: (promptsData || []).map((p) => ({
              promptType: p.prompt_type as
                | "rating"
                | "thumbs"
                | "comment"
                | "categories",
              message: p.message as string,
              options: p.options as string[] | null,
              context: (p.context || {}) as Record<string, unknown>,
            })),
          };

          voiceLog.debug(
            `[ThinkerTalker] Feedback prompts: ${feedbackEvent.prompts.length} prompts available`,
          );

          options.onFeedbackPrompts?.(feedbackEvent);
          break;
        }

        case "feedback.recorded": {
          // Phase 10: Feedback recorded confirmation
          const recordedEvent: TTFeedbackRecordedEvent = {
            thumbsUp: message.thumbs_up as boolean,
            messageId: (message.message_id as string) || null,
          };

          voiceLog.debug(
            `[ThinkerTalker] Feedback recorded: thumbs_up=${recordedEvent.thumbsUp}`,
          );

          options.onFeedbackRecorded?.(recordedEvent);
          break;
        }

        case "audio.output": {
          // TTS audio chunk (base64)
          const audioBase64 = message.audio as string;
          const isFinal = message.is_final as boolean;

          console.log("[ThinkerTalkerSession] audio.output received", {
            hasAudio: !!audioBase64,
            audioLength: audioBase64?.length || 0,
            isFinal,
            hasOnAudioChunk: !!options.onAudioChunk,
          });

          // Track time to first audio
          if (speechEndTimeRef.current && !metrics.ttsFirstAudioMs) {
            const totalLatency = Date.now() - speechEndTimeRef.current;
            const ttsLatency = firstLLMTokenTimeRef.current
              ? Date.now() - firstLLMTokenTimeRef.current
              : null;
            updateMetrics({
              ttsFirstAudioMs: ttsLatency,
              totalLatencyMs: totalLatency,
            });
            console.log(
              `[ThinkerTalkerSession] Total latency: ${totalLatency}ms`,
            );
            voiceLog.debug(`[ThinkerTalker] Total latency: ${totalLatency}ms`);
          }

          if (audioBase64) {
            const now = Date.now();
            console.log(
              `[BARGE-IN-DEBUG] Audio chunk received at ${now}, length=${audioBase64.length}`,
            );
            // Track when audio was received (for barge-in detection fallback)
            lastAudioChunkTimeRef.current = now;
            options.onAudioChunk?.(audioBase64);
          } else {
            console.log(
              "[ThinkerTalkerSession] No audio data in chunk (is_final marker?)",
            );
          }
          break;
        }

        case "tool.call": {
          // Tool being called
          const toolCall: TTToolCall = {
            id: (message.tool_id || message.tool_call_id) as string,
            name: (message.tool_name || message.name) as string,
            arguments: (message.arguments || {}) as Record<string, unknown>,
            status: "running",
          };

          setCurrentToolCalls((prev) => [...prev, toolCall]);
          updateMetrics({ toolCallCount: metrics.toolCallCount + 1 });
          options.onToolCall?.(toolCall);
          break;
        }

        case "tool.result": {
          // Tool result received
          const toolCallId = message.tool_call_id as string;
          const result = message.result;

          setCurrentToolCalls((prev) =>
            prev.map((tc) =>
              tc.id === toolCallId
                ? { ...tc, status: "completed", result }
                : tc,
            ),
          );

          const updatedToolCall = currentToolCalls.find(
            (tc) => tc.id === toolCallId,
          );
          if (updatedToolCall) {
            options.onToolResult?.({
              ...updatedToolCall,
              status: "completed",
              result,
            });
          }
          break;
        }

        case "voice.state": {
          // Pipeline state update
          const state = message.state as PipelineState;
          const reason = message.reason as string | undefined;
          const prevState = pipelineStateRef.current;
          console.log(
            `[BARGE-IN-DEBUG] Pipeline state change: ${prevState} -> ${state} (reason=${reason})`,
          );
          setPipelineState(state);
          pipelineStateRef.current = state; // Update ref for closure access
          options.onPipelineStateChange?.(state, reason);

          if (state === "listening") {
            setIsSpeaking(false);
            // Only stop audio playback if this is an actual barge-in (user interrupted)
            // Normal completion (reason !== "barge_in") should let audio finish playing
            if (prevState === "speaking" && reason === "barge_in") {
              voiceLog.info(
                "[ThinkerTalker] Barge-in detected - stopping playback",
              );
              options.onStopPlayback?.();
            } else if (prevState === "speaking") {
              voiceLog.info(
                "[ThinkerTalker] State changed to listening (natural completion) - audio continues playing",
              );
            }
          } else if (state === "speaking") {
            setIsSpeaking(true);
          }
          break;
        }

        case "pipeline.state": {
          const state = message.state as PipelineState;
          const prevState = pipelineStateRef.current;
          console.log(
            `[BARGE-IN-DEBUG] Pipeline state (backend): ${prevState} -> ${state}`,
          );
          pipelineStateRef.current = state;
          setPipelineState(state);
          options.onPipelineStateChange?.(state);
          // Keep speaking flag aligned for UI/tests
          if (state === "speaking") {
            setIsSpeaking(true);
          } else if (state === "listening") {
            setIsSpeaking(false);
          }
          break;
        }

        case "input_audio_buffer.speech_started": {
          setIsSpeaking(true);
          setPartialTranscript("");

          // Phase 8: Record barge-in event
          const vadConfidence = (message.vad_confidence as number) || 0.8;
          // Use ref to get current state (avoids stale closure bug)
          const currentPipelineState = pipelineStateRef.current;
          if (enablePersonalization) {
            personalization.recordBargeIn(
              "hard_barge", // Will be determined by duration
              0, // Duration not known yet
              vadConfidence,
              { aiWasSpeaking: currentPipelineState === "speaking" },
            );
          }

          // Natural Conversation Flow: Instant Barge-In
          // When enabled, immediately fade out AI audio on speech detection.
          // This reduces barge-in latency from 200-300ms to <50ms.
          // Feature flag: backend.voice_instant_barge_in
          //
          // IMPORTANT: Backend state can be "listening" even when frontend is still
          // playing audio from buffer. We use two conditions:
          // 1. Backend reports "speaking" state (primary)
          // 2. Audio was received recently (<3s ago) as fallback
          const now = Date.now();
          const recentAudioMs = lastAudioChunkTimeRef.current
            ? now - lastAudioChunkTimeRef.current
            : Infinity;
          const audioRecentlyReceived = recentAudioMs < 3000; // 3 second window

          // Debug logging for E2E test inspection
          console.log(
            `[BARGE-IN-DEBUG] Speech detected - pipelineState=${currentPipelineState}, ` +
              `enableInstantBargeIn=${options.enableInstantBargeIn}, ` +
              `recentAudioMs=${recentAudioMs}, audioRecentlyReceived=${audioRecentlyReceived}`,
          );
          voiceLog.debug(
            `[ThinkerTalker] Speech detected - pipelineState=${currentPipelineState}, ` +
              `enableInstantBargeIn=${options.enableInstantBargeIn}, ` +
              `recentAudioMs=${recentAudioMs}`,
          );

          // Trigger barge-in if backend says "speaking" OR we received audio recently
          const shouldBargeIn =
            options.enableInstantBargeIn &&
            (currentPipelineState === "speaking" || audioRecentlyReceived);

          // Always log barge-in evaluation result for debugging
          console.log(
            `[BARGE-IN-DEBUG] shouldBargeIn=${shouldBargeIn} (enableInstantBargeIn=${options.enableInstantBargeIn}, ` +
              `isSpeaking=${currentPipelineState === "speaking"}, audioRecentlyReceived=${audioRecentlyReceived})`,
          );

          if (shouldBargeIn) {
            console.log(
              `[BARGE-IN-DEBUG] TRIGGERING BARGE-IN: fading out audio (state=${currentPipelineState}, recentAudioMs=${recentAudioMs})`,
            );
            voiceLog.info(
              `[ThinkerTalker] Instant barge-in: fading out AI audio ` +
                `(state=${currentPipelineState}, recentAudioMs=${recentAudioMs})`,
            );

            // 1. Fade out audio locally for immediate feedback
            if (options.onFadeOutPlayback) {
              options.onFadeOutPlayback(50);
            } else {
              options.onStopPlayback?.();
            }

            // 2. Send barge_in signal to backend to cancel response generation
            // This stops the backend from sending more audio chunks
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "barge_in" }));
            }

            // Clear the audio timestamp to prevent repeated barge-ins
            lastAudioChunkTimeRef.current = null;

            // Update barge-in metrics
            updateMetrics({ bargeInCount: metrics.bargeInCount + 1 });
          }

          // Always notify for barge-in handling (for other components)
          options.onSpeechStarted?.();

          // NOTE: When instant barge-in is disabled, barge-in is handled by
          // the backend based on actual transcript content, not VAD events.
          // This prevents false interruptions from background noise/TTS echo.
          break;
        }

        case "input_audio_buffer.speech_stopped":
          setIsSpeaking(false);
          speechEndTimeRef.current = Date.now();
          // Reset timing refs for next utterance
          firstTranscriptTimeRef.current = null;
          firstLLMTokenTimeRef.current = null;
          break;

        case "heartbeat":
        case "pong": {
          // Track pong response for heartbeat monitoring
          lastPongTimeRef.current = Date.now();

          // Calculate RTT if we have a pending ping
          if (pendingPingTimeRef.current) {
            const rtt = Date.now() - pendingPingTimeRef.current;
            pendingPingTimeRef.current = null;
            voiceLog.debug(`[ThinkerTalker] Pong received, RTT: ${rtt}ms`);

            // Warn on high RTT (>500ms)
            if (rtt > 500) {
              voiceLog.warn(
                `[ThinkerTalker] High connection latency detected: ${rtt}ms`,
              );
            }
          }
          break;
        }

        case "error": {
          const errorCode = message.code as string;
          const errorMessage = message.message as string;
          const recoverable = message.recoverable as boolean;

          const err = new Error(`${errorCode}: ${errorMessage}`);
          if (recoverable) {
            voiceLog.warn("[ThinkerTalker] Recoverable error:", errorMessage);
            // Don't update status for recoverable errors
          } else {
            handleError(err);
          }
          break;
        }

        // ================================================================
        // Phase 4: Barge-in Latency Optimization
        // ================================================================

        case "barge_in.initiated": {
          // Phase 4: Immediate acknowledgment that backend received barge-in
          // This is sent BEFORE any async cancellation operations complete
          // Allows frontend to optimistically transition to listening state
          const backendTimestamp = message.timestamp as number;
          const latencyMs = Date.now() - backendTimestamp * 1000;

          voiceLog.info(
            `[ThinkerTalker] Barge-in initiated by backend (latency: ${latencyMs.toFixed(0)}ms)`,
          );

          // Immediately stop audio playback (optimistic transition)
          // This happens before the full barge-in flow completes
          if (options.onFadeOutPlayback) {
            // Use fast 30ms fade for smooth but instant stop
            options.onFadeOutPlayback(30);
          } else {
            options.onStopPlayback?.();
          }

          // Track barge-in latency in metrics
          updateMetrics({
            bargeInCount: metrics.bargeInCount + 1,
          });

          break;
        }

        // ================================================================
        // Phase 1-4: Conversational Intelligence Message Handlers
        // ================================================================

        case "emotion.detected": {
          // Phase 1: Emotion detected from Hume AI
          const emotionResult: TTEmotionResult = {
            primary_emotion: message.primary_emotion as string,
            primary_confidence: message.primary_confidence as number,
            secondary_emotion: (message.secondary_emotion as string) || null,
            secondary_confidence:
              (message.secondary_confidence as number) || null,
            valence: message.valence as number,
            arousal: message.arousal as number,
            dominance: message.dominance as number,
            timestamp: Date.now(),
          };

          voiceLog.debug(
            `[ThinkerTalker] Emotion detected: ${emotionResult.primary_emotion} ` +
              `(conf=${emotionResult.primary_confidence.toFixed(2)}, ` +
              `valence=${emotionResult.valence.toFixed(2)})`,
          );

          options.onEmotionDetected?.(emotionResult);
          break;
        }

        case "backchannel.trigger": {
          // Phase 2: Backchannel audio to play
          const backchannelEvent: TTBackchannelEvent = {
            phrase: message.phrase as string,
            audio: message.audio as string,
            format: message.format as string,
            duration_ms: message.duration_ms as number,
          };

          voiceLog.debug(
            `[ThinkerTalker] Backchannel: "${backchannelEvent.phrase}" ` +
              `(${backchannelEvent.duration_ms}ms)`,
          );

          options.onBackchannel?.(backchannelEvent);
          break;
        }

        case "turn.state": {
          // Phase 5: Turn-taking state update
          const turnState: TTTurnState = {
            state: message.state as
              | "continuing"
              | "pausing"
              | "yielding"
              | "uncertain",
            confidence: message.confidence as number,
            recommended_wait_ms: message.recommended_wait_ms as number,
            signals: message.signals as {
              falling_intonation: boolean;
              trailing_off: boolean;
              thinking_aloud: boolean;
              continuation_cue: boolean;
            },
          };

          voiceLog.debug(
            `[ThinkerTalker] Turn state: ${turnState.state} ` +
              `(conf=${turnState.confidence.toFixed(2)})`,
          );

          options.onTurnStateChange?.(turnState);
          break;
        }

        // ================================================================
        // Issue 3: Turn Management Events (via Event Bus)
        // ================================================================

        case "turn.taken": {
          // AI has taken the conversational turn (started speaking)
          const reason = message.reason as string;
          voiceLog.debug(`[ThinkerTalker] Turn taken by AI: reason=${reason}`);

          // Update turn state to indicate AI has the turn
          options.onTurnStateChange?.({
            state: "yielding",
            confidence: 1.0,
            recommended_wait_ms: 0,
            signals: {
              falling_intonation: false,
              trailing_off: false,
              thinking_aloud: false,
              continuation_cue: false,
            },
          });
          break;
        }

        case "turn.yielded": {
          // AI has yielded the turn back to the user (finished speaking)
          const reason = message.reason as string;
          voiceLog.debug(
            `[ThinkerTalker] Turn yielded by AI: reason=${reason}`,
          );

          // If it was a barge-in, the user interrupted
          if (reason === "user_barge_in") {
            voiceLog.info("[ThinkerTalker] User barge-in acknowledged");
          }

          // Update turn state to indicate user has the turn
          options.onTurnStateChange?.({
            state: "continuing",
            confidence: 1.0,
            recommended_wait_ms: 0,
            signals: {
              falling_intonation: true,
              trailing_off: false,
              thinking_aloud: false,
              continuation_cue: false,
            },
          });
          break;
        }

        // ================================================================
        // Natural Conversation Flow: Phase 3.2 - Continuation Detection
        // ================================================================

        case "turn.continuation_expected": {
          // Backend detected that user is likely to continue speaking
          // Show visual indicator and extend silence threshold
          const probability = message.probability as number;
          const reason = message.reason as string;
          const waitMs = message.wait_ms as number;

          voiceLog.debug(
            `[ThinkerTalker] Continuation expected: probability=${probability.toFixed(2)}, reason=${reason}, wait=${waitMs}ms`,
          );

          // Set continuation state to true
          setIsContinuationExpected(true);

          // Clear any existing timeout
          if (continuationTimeoutRef.current) {
            clearTimeout(continuationTimeoutRef.current);
          }

          // Auto-clear after the wait period + buffer
          continuationTimeoutRef.current = setTimeout(() => {
            setIsContinuationExpected(false);
            voiceLog.debug("[ThinkerTalker] Continuation indicator cleared");
          }, waitMs + 500);

          break;
        }

        // ================================================================
        // Issue 4: Progressive Response / Filler Events (via Event Bus)
        // ================================================================

        case "filler.triggered": {
          // A thinking filler has been selected and will be spoken
          const fillerText = message.text as string;
          const domain = message.domain as string;
          const queryType = message.query_type as string;

          voiceLog.debug(
            `[ThinkerTalker] Filler triggered: "${fillerText}" (domain=${domain}, query_type=${queryType})`,
          );

          // Notify via existing callback
          options.onThinkingFiller?.(fillerText, queryType);
          break;
        }

        case "filler.played": {
          // A thinking filler has finished playing
          const fillerText = message.text as string;
          const durationMs = message.duration_ms as number;

          voiceLog.debug(
            `[ThinkerTalker] Filler played: "${fillerText}" (${durationMs}ms)`,
          );
          break;
        }

        // ================================================================
        // Issue 1: Unified Thinking Feedback Message Handlers
        // ================================================================

        case "thinking.started": {
          // Backend started thinking feedback - notify frontend to avoid dual tones
          const thinkingEvent: TTThinkingStateEvent = {
            isThinking: true,
            source: (message.source as "backend" | "frontend") || "backend",
            style: message.style as string | undefined,
            volume: message.volume as number | undefined,
          };

          voiceLog.debug(
            `[ThinkerTalker] Thinking started: source=${thinkingEvent.source}, ` +
              `style=${thinkingEvent.style || "default"}`,
          );

          options.onThinkingStateChange?.(thinkingEvent);
          break;
        }

        case "thinking.stopped": {
          // Backend stopped thinking feedback
          const thinkingEvent: TTThinkingStateEvent = {
            isThinking: false,
            source: (message.source as "backend" | "frontend") || "backend",
          };

          voiceLog.debug(
            `[ThinkerTalker] Thinking stopped: source=${thinkingEvent.source}`,
          );

          options.onThinkingStateChange?.(thinkingEvent);
          break;
        }

        default:
          voiceLog.debug("[ThinkerTalker] Unhandled message type:", msgType);
      }
    },
    [
      options,
      updateStatus,
      updateMetrics,
      handleError,
      metrics,
      currentToolCalls,
      startHeartbeat,
      enableMultilingual,
      multilingual,
      enablePersonalization,
      personalization,
      enableConversationManagement,
      conversationManager,
      pipelineState,
      clearRecoveryState,
    ],
  );

  // Keep refs updated
  handleMessageRef.current = handleMessage;
  handleMessageWithSequenceRef.current = handleMessageWithSequence;
  onLocalVoiceActivityRef.current = options.onLocalVoiceActivity;

  /**
   * Initialize WebSocket connection to T/T pipeline
   */
  const initializeWebSocket = useCallback(
    (conversationId?: string): Promise<WebSocket> => {
      return new Promise((resolve, reject) => {
        // Check for auth token
        const accessToken = tokens?.accessToken;
        if (!accessToken) {
          reject(
            new Error("Not authenticated - please log in to use voice mode"),
          );
          return;
        }

        // Build WebSocket URL with auth token
        const apiBase = import.meta.env.VITE_API_URL || "";
        const wsProtocol = apiBase.startsWith("https") ? "wss" : "ws";
        const wsHost = apiBase.replace(/^https?:\/\//, "");
        const wsUrl = `${wsProtocol}://${wsHost}/api/voice/pipeline-ws?token=${encodeURIComponent(accessToken)}`;

        voiceLog.debug(
          `[ThinkerTalker] Connecting to WebSocket (token present)`,
        );

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          voiceLog.debug("[ThinkerTalker] WebSocket connected");

          // Reset binary protocol state
          binaryProtocolEnabledRef.current = false;
          audioSequenceRef.current = 0;

          // Reset sequence validation state
          expectedSequenceRef.current = 0;
          reorderBufferRef.current.clear();

          // Check for recovery state
          const recoveryState = loadRecoveryState();

          if (recoveryState) {
            // Attempt session resume
            voiceLog.info(
              `[ThinkerTalker] Attempting session resume: ${recoveryState.sessionId}`,
            );
            const resumeMessage = {
              type: "session.resume",
              session_id: recoveryState.sessionId,
              last_message_seq: recoveryState.lastMessageSeq,
              last_audio_seq: recoveryState.lastAudioSeq,
            };
            ws.send(JSON.stringify(resumeMessage));
          }

          // Send session initialization message with feature negotiation
          const initMessage = {
            type: "session.init",
            protocol_version: "2.0",
            conversation_id: conversationId || null,
            voice_settings: options.voiceSettings || {},
            // Request all WebSocket optimization and reliability features
            // Server will confirm which ones are enabled via feature flags
            features: [
              "binary_audio", // Phase 1 WS Reliability: Binary frames
              "message_batching", // Message batching for efficiency
              "audio_prebuffering", // WS Latency: Jitter buffer
              "adaptive_chunking", // WS Latency: Network-aware chunks
              "session_persistence", // Phase 2 WS Reliability: Redis sessions
              "graceful_degradation", // Phase 3 WS Reliability: Fallback handling
            ],
          };
          ws.send(JSON.stringify(initMessage));

          updateStatus("connected");
          resolve(ws);
        };

        ws.onerror = (event) => {
          voiceLog.error("[ThinkerTalker] WebSocket error:", event);
          reject(new Error("WebSocket connection failed"));
        };

        ws.onclose = (event) => {
          voiceLog.debug(
            `[ThinkerTalker] WebSocket closed: ${event.code} ${event.reason}`,
          );

          // Check for auth-related close codes (1008 = Policy Violation, typically auth failure)
          const isAuthError = event.code === 1008;

          if (isAuthError) {
            // Don't reconnect on auth errors - user needs to re-login
            voiceLog.warn(
              "[ThinkerTalker] WebSocket closed due to auth error - not reconnecting",
            );
            fatalErrorRef.current = true;
            handleError(
              new Error(
                event.reason || "Authentication failed - please log in again",
              ),
            );
            updateStatus("error");
            return;
          }

          if (!intentionalDisconnectRef.current) {
            scheduleReconnect();
          } else {
            updateStatus("disconnected");
          }
        };

        ws.onmessage = (event) => {
          // Debug: Log all incoming message types
          const isBlob = event.data instanceof Blob;
          const isArrayBuffer = event.data instanceof ArrayBuffer;
          const dataType = isBlob
            ? "Blob"
            : isArrayBuffer
              ? "ArrayBuffer"
              : typeof event.data;
          if (isBlob || isArrayBuffer) {
            console.log(
              `[ThinkerTalker] Binary WS message received: type=${dataType}, size=${event.data instanceof Blob ? event.data.size : (event.data as ArrayBuffer).byteLength}`,
            );
          }

          // Handle binary frames (audio data with 5-byte header)
          if (event.data instanceof Blob) {
            event.data.arrayBuffer().then((buffer) => {
              const data = new Uint8Array(buffer);
              console.log(
                `[ThinkerTalker] Binary frame parsed: length=${data.length}, frameType=${data[0]}`,
              );
              if (data.length >= 5) {
                const frameType = data[0];
                const sequence = new DataView(data.buffer).getUint32(1, false);
                const audioData = data.slice(5);

                if (frameType === 0x02) {
                  // AUDIO_OUTPUT binary frame
                  console.log(
                    `[ThinkerTalker] AUDIO_OUTPUT frame: seq=${sequence}, audioBytes=${audioData.length}`,
                  );
                  voiceLog.debug(
                    `[ThinkerTalker] Binary audio: seq=${sequence}, ${audioData.length} bytes`,
                  );

                  // Convert to base64 for existing audio handling
                  const base64 = btoa(
                    String.fromCharCode.apply(null, Array.from(audioData)),
                  );
                  options.onAudioChunk?.(base64);
                } else {
                  console.log(
                    `[ThinkerTalker] Unknown binary frameType: ${frameType}`,
                  );
                }
              }
            });
            return;
          }

          // Handle text frames (JSON messages) with sequence validation
          try {
            const message = JSON.parse(event.data);
            // DEBUG: Log ALL incoming WebSocket messages to trace message delivery
            const msgType = message.type as string;
            if (
              msgType &&
              (msgType.includes("speech") ||
                msgType.includes("state") ||
                msgType.includes("voice"))
            ) {
              console.log(
                `[ThinkerTalker] WS RAW message: ${msgType}`,
                message,
              );
            }

            // Expose WS events to automation for Playwright integration tests
            if (isAutomation && typeof window !== "undefined") {
              const globalWindow = window as typeof window & {
                __tt_ws_events?: Array<{
                  direction: "received";
                  type: string;
                  timestamp: number;
                  data: unknown;
                }>;
              };
              if (!globalWindow.__tt_ws_events) {
                globalWindow.__tt_ws_events = [];
              }
              if (globalWindow.__tt_ws_events.length < 500) {
                globalWindow.__tt_ws_events.push({
                  direction: "received",
                  type: msgType || "unknown",
                  timestamp: Date.now(),
                  data: message,
                });
              }
            }
            handleMessageWithSequenceRef.current(message);
          } catch (err) {
            voiceLog.error("[ThinkerTalker] Failed to parse message:", err);
          }
        };

        // Connection timeout
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);
      });
    },
    [
      tokens,
      options.voiceSettings,
      updateStatus,
      scheduleReconnect,
      loadRecoveryState,
    ],
  );

  /**
   * Initialize microphone and audio streaming
   */
  const initializeAudioStreaming = useCallback(async (ws: WebSocket) => {
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // 16kHz for STT
          channelCount: 1,
        },
      });
    } catch (err) {
      if (isMicPermissionError(err)) {
        const friendlyMessage = getMicErrorMessage(err);
        const micError = new Error(friendlyMessage);
        (micError as Error & { isFatal: boolean }).isFatal = true;
        throw micError;
      }
      throw new Error(
        `Failed to access microphone: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    mediaStreamRef.current = stream;

    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const bufferSize = 2048;
      const scriptProcessor = audioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );
      processorNodeRef.current = scriptProcessor;

      // Natural Conversation Flow: Phase 3.1 - Initialize prosody extractor
      if (prosodyEnabledRef.current && !prosodyExtractorRef.current) {
        prosodyExtractorRef.current = createProsodyExtractor({
          sampleRate: 16000,
          minVoiceActivity: 0.3,
        });
        voiceLog.debug("[ThinkerTalker] Prosody extractor initialized");
      }

      let audioChunkCount = 0;

      // Local VAD state for barge-in detection
      let lastVoiceActivityTime = 0;
      const VOICE_ACTIVITY_DEBOUNCE_MS = 100; // Debounce to avoid rapid-fire callbacks
      const VOICE_ACTIVITY_THRESHOLD = 0.02; // RMS threshold for voice detection (adjusted for echo cancellation)

      scriptProcessor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        if (isAutomation && pipelineStateRef.current !== "listening") {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);

        // Calculate RMS for local voice activity detection
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);

        // NOTE: RMS-based local VAD disabled - replaced by Silero VAD in useThinkerTalkerVoiceMode
        // Silero VAD uses a neural network model which is much more accurate than RMS threshold
        // The code below is kept for reference/debugging but the callback is disabled
        const now = Date.now();
        if (
          rms > VOICE_ACTIVITY_THRESHOLD &&
          now - lastVoiceActivityTime > VOICE_ACTIVITY_DEBOUNCE_MS
        ) {
          lastVoiceActivityTime = now;
          // Debug: Log when RMS threshold exceeded (Silero VAD handles actual barge-in)
          // console.log(`[ThinkerTalker] RMS threshold exceeded: rms=${rms.toFixed(4)}`);
          // DISABLED: Silero VAD now handles local voice activity detection
          // onLocalVoiceActivityRef.current?.(rms);
        }

        // Natural Conversation Flow: Phase 3.1 - Extract prosody features
        if (prosodyEnabledRef.current && prosodyExtractorRef.current) {
          const prosodyFeatures =
            prosodyExtractorRef.current.process(inputData);
          if (prosodyFeatures) {
            lastProsodyFeaturesRef.current = prosodyFeatures;
          }
        }

        // Convert float32 to PCM16
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        if (binaryProtocolEnabledRef.current) {
          // Binary protocol: send raw PCM with 5-byte header
          // Header: [type:1][sequence:4] + audio data
          const sequence = audioSequenceRef.current++;
          const header = new Uint8Array(5);
          header[0] = 0x01; // AUDIO_INPUT frame type
          new DataView(header.buffer).setUint32(1, sequence, false); // big-endian

          // Combine header and audio
          const pcmBytes = new Uint8Array(pcm16.buffer);
          const frame = new Uint8Array(5 + pcmBytes.length);
          frame.set(header, 0);
          frame.set(pcmBytes, 5);

          ws.send(frame.buffer);

          audioChunkCount++;
          if (audioChunkCount % 500 === 0) {
            voiceLog.debug(
              `[ThinkerTalker] Binary audio chunk #${audioChunkCount}, seq=${sequence}`,
            );
          }
        } else {
          // Legacy JSON protocol: base64 encode and send
          const uint8 = new Uint8Array(pcm16.buffer);
          const base64 = btoa(String.fromCharCode(...uint8));

          ws.send(
            JSON.stringify({
              type: "audio.input",
              audio: base64,
            }),
          );

          audioChunkCount++;
          if (audioChunkCount % 500 === 0) {
            voiceLog.debug(`[ThinkerTalker] Audio chunk #${audioChunkCount}`);
          }
        }
      };

      // Connect nodes
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(scriptProcessor);
      scriptProcessor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      voiceLog.debug("[ThinkerTalker] Audio streaming initialized");
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        `Failed to initialize audio processing: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, []);

  /**
   * Connect to T/T pipeline
   */
  const connect = useCallback(async () => {
    if (
      statusRef.current === "connected" ||
      statusRef.current === "connecting"
    ) {
      voiceLog.warn("[ThinkerTalker] Already connected or connecting");
      return;
    }

    if (fatalErrorRef.current) {
      voiceLog.warn("[ThinkerTalker] Cannot connect - fatal error");
      return;
    }

    try {
      updateStatus("connecting");
      setError(null);
      connectStartTimeRef.current = Date.now();
      intentionalDisconnectRef.current = false;

      // Reset metrics
      setMetrics({
        connectionTimeMs: null,
        sttLatencyMs: null,
        llmFirstTokenMs: null,
        ttsFirstAudioMs: null,
        totalLatencyMs: null,
        sessionDurationMs: null,
        userUtteranceCount: 0,
        aiResponseCount: 0,
        toolCallCount: 0,
        bargeInCount: 0,
        reconnectCount: reconnectAttempts,
        sessionStartedAt: null,
      });

      // Initialize WebSocket
      const ws = await initializeWebSocket(options.conversation_id);
      wsRef.current = ws;

      // Initialize audio streaming
      await initializeAudioStreaming(ws);

      // Reset reconnect attempts on success
      setReconnectAttempts(0);

      voiceLog.debug("[ThinkerTalker] Connected successfully");
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to connect");

      if (
        (err as Error & { isFatal?: boolean })?.isFatal ||
        isMicPermissionError(err)
      ) {
        fatalErrorRef.current = true;
        setError(error);
        updateStatus("mic_permission_denied");
        options.onError?.(error);

        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        return;
      }

      handleError(error);

      if (status === "reconnecting") {
        scheduleReconnect();
      }
    }
  }, [
    updateStatus,
    initializeWebSocket,
    initializeAudioStreaming,
    handleError,
    scheduleReconnect,
    options,
    reconnectAttempts,
    status,
  ]);

  // Keep ref updated
  connectRef.current = connect;

  /**
   * Disconnect from T/T pipeline
   */
  const disconnect = useCallback(() => {
    if (
      statusRef.current === "disconnected" &&
      !wsRef.current &&
      !mediaStreamRef.current &&
      !audioContextRef.current
    ) {
      return;
    }

    voiceLog.debug("[ThinkerTalker] Disconnecting...");
    intentionalDisconnectRef.current = true;

    // Save recovery state for potential reconnection (if not intentional)
    if (recoveryEnabledRef.current) {
      saveRecoveryState();
    }

    // Track cleaned resources for debugging
    const cleanedResources: string[] = [];

    // 1. Stop heartbeat first
    stopHeartbeat();
    cleanedResources.push("heartbeat");

    // 2. Close WebSocket - remove handlers first to prevent callbacks
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "Intentional disconnect");
      }
      wsRef.current = null;
      cleanedResources.push("websocket");
    }

    // 3. Stop microphone tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
      cleanedResources.push("mediaStream");
    }

    // 4. Cleanup audio processor
    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      processorNodeRef.current = null;
      cleanedResources.push("audioProcessor");
    }

    // 5. Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Ignore errors on close
      });
      audioContextRef.current = null;
      cleanedResources.push("audioContext");
    }

    // 6. Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
      cleanedResources.push("reconnectTimeout");
    }

    voiceLog.debug(
      `[ThinkerTalker] Cleanup complete: ${cleanedResources.join(", ")}`,
    );

    // Calculate session duration
    if (sessionStartTimeRef.current) {
      const sessionDuration = Date.now() - sessionStartTimeRef.current;
      updateMetrics({ sessionDurationMs: sessionDuration });
      sessionStartTimeRef.current = null;
    }

    // Reset timing refs
    connectStartTimeRef.current = null;
    speechEndTimeRef.current = null;
    firstTranscriptTimeRef.current = null;
    firstLLMTokenTimeRef.current = null;
    lastAudioChunkTimeRef.current = null;

    setReconnectAttempts(0);
    updateStatus("disconnected");
    setTranscript("");
    setPartialTranscript("");
    setIsSpeaking(false);
    setPipelineState("idle");
    pipelineStateRef.current = "idle"; // Update ref for closure access
    setCurrentToolCalls([]);
  }, [updateStatus, updateMetrics, stopHeartbeat, saveRecoveryState]);

  // Keep ref updated
  disconnectRef.current = disconnect;

  /**
   * Send barge-in signal to interrupt AI response
   */
  const bargeIn = useCallback(
    (bargeInType: ConversationBargeInType = "hard_barge") => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return { shouldInterrupt: false };
      }

      // Phase 10: Check with conversation manager if barge-in should be allowed
      if (enableConversationManagement) {
        const result = conversationManager.handleBargeIn({
          id: `bi_${Date.now()}`,
          type: bargeInType,
          timestamp: Date.now(),
          duration: 0, // Duration not known at this point
          vadConfidence: personalization.vadSensitivity || 0.5,
          aiWasSpeaking: pipelineState === "speaking",
        });

        if (!result.shouldInterrupt) {
          voiceLog.debug(
            "[ThinkerTalker] Barge-in blocked by conversation manager:",
            result.message,
          );
          return result;
        }
      }

      voiceLog.debug("[ThinkerTalker] Sending barge-in signal");

      // Phase 7.1: Track barge-in metrics
      const bargeInTime = Date.now();
      bargeInStartTimeRef.current = bargeInTime;
      const isSuccessful = pipelineState === "speaking";

      wsRef.current.send(JSON.stringify({ type: "barge_in" }));

      // Update barge-in metrics
      const metricsUpdate: Partial<TTVoiceMetrics> = {
        bargeInCount: metrics.bargeInCount + 1,
      };

      if (isSuccessful) {
        metricsUpdate.successfulBargeInCount =
          metrics.successfulBargeInCount + 1;
      } else {
        // Misfire: barge-in triggered when AI wasn't speaking (possible echo or false positive)
        metricsUpdate.misfireBargeInCount = metrics.misfireBargeInCount + 1;
      }

      updateMetrics(metricsUpdate);
      return { shouldInterrupt: true };
    },
    [
      updateMetrics,
      metrics.bargeInCount,
      metrics.successfulBargeInCount,
      metrics.misfireBargeInCount,
      enableConversationManagement,
      conversationManager,
      pipelineState,
      personalization.vadSensitivity,
    ],
  );

  /**
   * Send text message (fallback mode)
   */
  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      voiceLog.warn("[ThinkerTalker] WebSocket not connected");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        content: text,
      }),
    );
  }, []);

  /**
   * Phase 2: Send VAD state to backend for hybrid decision-making
   * This allows the backend to combine Silero VAD confidence with Deepgram events
   * for more accurate barge-in and speech detection.
   */
  const sendVADState = useCallback(
    (vadState: {
      silero_confidence: number;
      is_speaking: boolean;
      speech_duration_ms: number;
      is_playback_active: boolean;
      effective_threshold: number;
    }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          type: "vad.state",
          ...vadState,
        }),
      );
    },
    [],
  );

  /**
   * Reset fatal error state
   */
  const resetFatalError = useCallback(() => {
    if (fatalErrorRef.current) {
      voiceLog.debug("[ThinkerTalker] Resetting fatal error state");
      fatalErrorRef.current = false;
      setError(null);
      updateStatus("disconnected");
    }
  }, [updateStatus]);

  /**
   * Commit audio buffer (manual end of speech)
   * Natural Conversation Flow: Phase 3.1 - Include prosody features
   */
  const commitAudio = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Build message with optional prosody features
    const message: {
      type: string;
      prosody_features?: ProsodyWebSocketMessage;
    } = { type: "audio.input.complete" };

    // Include prosody features if enabled and available
    if (prosodyEnabledRef.current && lastProsodyFeaturesRef.current) {
      message.prosody_features = lastProsodyFeaturesRef.current;
      voiceLog.debug(
        "[ThinkerTalker] Sending prosody features with audio.input.complete:",
        lastProsodyFeaturesRef.current.pitch_contour,
        "pitch:",
        lastProsodyFeaturesRef.current.pitch,
        "energy_decay:",
        lastProsodyFeaturesRef.current.energy_decay,
      );
    }

    wsRef.current.send(JSON.stringify(message));

    // Reset prosody features for next utterance
    if (prosodyExtractorRef.current) {
      prosodyExtractorRef.current.reset();
    }
    lastProsodyFeaturesRef.current = null;
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (options.autoConnect) {
      connect();
    }

    return () => {
      disconnectRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.autoConnect]);

  // Expose debug state to window for E2E tests
  // This allows Playwright tests to query actual barge-in state
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Track state transitions for debug/test inspection
    const stateTransitions: string[] = [];
    const prevStateRef = { current: pipelineState };

    // Create debug object on window
    const debug = {
      get pipelineState() {
        return pipelineState;
      },
      get lastAudioChunkTimeMs() {
        return lastAudioChunkTimeRef.current;
      },
      get audioRecentlyReceived() {
        if (!lastAudioChunkTimeRef.current) return false;
        return Date.now() - lastAudioChunkTimeRef.current < 3000;
      },
      get recentAudioMs() {
        if (!lastAudioChunkTimeRef.current) return Infinity;
        return Date.now() - lastAudioChunkTimeRef.current;
      },
      get enableInstantBargeIn() {
        return options.enableInstantBargeIn;
      },
      get bargeInCount() {
        return metrics.bargeInCount;
      },
      get successfulBargeInCount() {
        return metrics.successfulBargeInCount;
      },
      get status() {
        return status;
      },
      stateTransitions,
      isConnected: status === "connected" || status === "ready",
    };

    // Extend existing window type for TypeScript
    (window as unknown as { __voiceDebug?: typeof debug }).__voiceDebug = debug;

    // Track state transitions
    if (prevStateRef.current !== pipelineState) {
      const transition = `${prevStateRef.current}->${pipelineState}`;
      stateTransitions.push(transition);
      prevStateRef.current = pipelineState;
      voiceLog.debug(
        `[ThinkerTalker] Pipeline state transition: ${transition}`,
      );
    }

    return () => {
      // Cleanup on unmount
      if (typeof window !== "undefined") {
        delete (window as unknown as { __voiceDebug?: typeof debug })
          .__voiceDebug;
      }
    };
  }, [
    pipelineState,
    status,
    metrics.bargeInCount,
    metrics.successfulBargeInCount,
    options.enableInstantBargeIn,
  ]);

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is now hidden
        voiceLog.debug("[ThinkerTalker] Tab hidden, pausing heartbeat");
        stopHeartbeat();
      } else {
        // Tab is now visible
        voiceLog.debug("[ThinkerTalker] Tab visible, checking connection");

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Connection still open - send immediate ping to verify
          voiceLog.debug("[ThinkerTalker] Sending verification ping");
          wsRef.current.send(
            JSON.stringify({
              type: "ping",
              ts: Date.now(),
            }),
          );
          // Resume heartbeat
          startHeartbeat();
        } else if (
          statusRef.current === "connected" ||
          statusRef.current === "ready"
        ) {
          // Was connected but WebSocket is no longer open - connection died while hidden
          voiceLog.warn(
            "[ThinkerTalker] Connection lost while tab was hidden, triggering reconnect",
          );
          // Don't set intentional disconnect - allow reconnection
          intentionalDisconnectRef.current = false;
          scheduleReconnect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startHeartbeat, stopHeartbeat, scheduleReconnect]);

  return {
    // State
    status,
    error,
    transcript,
    partialTranscript,
    partialAIResponse, // Phase 5.1: Streaming AI response for progressive display
    lastTruncation, // Phase 5.2: Last truncation result from barge-in
    isSpeaking,
    pipelineState,
    currentToolCalls,
    metrics,

    // Actions
    connect,
    disconnect,
    bargeIn,
    sendMessage,
    commitAudio,
    resetFatalError,
    sendVADState, // Phase 2: VAD Confidence Sharing

    // Derived state
    isConnected: status === "connected" || status === "ready",
    isConnecting: status === "connecting",
    isReady: status === "ready",
    isMicPermissionDenied: status === "mic_permission_denied",
    canSend: status === "connected" || status === "ready",
    isProcessing: pipelineState === "processing",
    isListening: pipelineState === "listening",

    // Natural Conversation Flow: Phase 3.2 - Continuation Detection
    isContinuationExpected,

    // Phase 7: Multilingual
    multilingual: {
      currentLanguage: multilingual.currentLanguage,
      currentAccent: multilingual.currentAccent,
      detectedLanguage: multilingual.detectedLanguage,
      detectionConfidence: multilingual.detectionConfidence,
      isRtl: multilingual.isRtl,
      setLanguage: multilingual.setLanguage,
      setAccent: multilingual.setAccent,
      availableLanguages: multilingual.availableLanguages,
      availableAccents: multilingual.availableAccents,
      vadAdjustments: multilingual.vadAdjustments,
    },

    // Phase 8: Personalization
    personalization: {
      isCalibrated: personalization.isCalibrated,
      isCalibrating: personalization.isCalibrating,
      vadSensitivity: personalization.vadSensitivity,
      behaviorStats: personalization.behaviorStats,
      runCalibration: personalization.runCalibration,
      cancelCalibration: personalization.cancelCalibration,
      setVadSensitivity: personalization.setVadSensitivity,
      getRecommendedVadThreshold: personalization.getRecommendedVadThreshold,
    },

    // Phase 9: Offline VAD
    offlineVAD: {
      isListening: offlineVAD.isListening,
      isSpeaking: offlineVAD.isSpeaking,
      isUsingOfflineVAD: offlineVAD.isUsingOfflineVAD,
      currentEnergy: offlineVAD.currentEnergy,
      startListening: offlineVAD.startListening,
      stopListening: offlineVAD.stopListening,
      forceOffline: offlineVAD.forceOffline,
      forceNetwork: offlineVAD.forceNetwork,
      reset: offlineVAD.reset,
    },

    // Phase 10: Conversation Management
    conversationManager: {
      sentiment: conversationManager.sentiment,
      discourse: conversationManager.discourse,
      recommendations: conversationManager.recommendations,
      suggestedFollowUps: conversationManager.suggestedFollowUps,
      activeToolCalls: conversationManager.activeToolCalls,
      registerToolCall: conversationManager.registerToolCall,
      updateToolCallStatus: conversationManager.updateToolCallStatus,
    },

    // WebSocket Feature Flags (negotiated with server)
    negotiatedFeatures,
    hasFeature: (feature: string) => negotiatedFeaturesRef.current.has(feature),
    featureFlags: {
      binaryAudio: negotiatedFeaturesRef.current.has("binary_audio"),
      messageBatching: negotiatedFeaturesRef.current.has("message_batching"),
      audioPrebuffering:
        negotiatedFeaturesRef.current.has("audio_prebuffering"),
      adaptiveChunking: negotiatedFeaturesRef.current.has("adaptive_chunking"),
      sessionPersistence: negotiatedFeaturesRef.current.has(
        "session_persistence",
      ),
      gracefulDegradation: negotiatedFeaturesRef.current.has(
        "graceful_degradation",
      ),
    },
  };
}

export default useThinkerTalkerSession;
