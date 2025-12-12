/**
 * Unified Conversation Store
 *
 * Central state management for the unified chat/voice interface.
 * Manages input mode, voice state, messages, and audio playback.
 *
 * This store is used when the unified_chat_voice_ui feature flag is enabled.
 */

import { create } from "zustand";
import type { ChatMessage } from "../types";
import type { VoicePipelineState } from "@voiceassist/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Source of the message input
 */
export type MessageSource = "text" | "voice" | "system";

/**
 * Voice mode interaction type
 */
export type VoiceModeType = "always-on" | "push-to-talk";

/**
 * Voice connection status
 */
export type VoiceConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Voice mode state machine states
 */
export type VoiceState = VoicePipelineState;

/**
 * Audio playback state
 */
export type PlaybackState = "idle" | "playing" | "paused";

/**
 * Extended message with voice metadata
 */
export interface UnifiedMessage extends ChatMessage {
  /** Source of the message input */
  source: MessageSource;
  /** Voice-specific metadata */
  voiceMetadata?: {
    /** URL to audio file */
    audioUrl?: string;
    /** Audio duration in seconds */
    duration?: number;
    /** Transcription confidence score */
    transcriptConfidence?: number;
    /** Whether audio was auto-played */
    wasAutoPlayed?: boolean;
  };
  /** Client-generated ID for optimistic updates */
  clientId?: string;
  /** Whether message is being streamed */
  isStreaming?: boolean;
}

/**
 * Audio queue item for playback management
 */
export interface AudioQueueItem {
  messageId: string;
  audioUrl: string;
  priority: number;
}

/**
 * Connection error with retry info
 */
export interface ConnectionError {
  code: string;
  message: string;
  timestamp: number;
  retryCount: number;
}

// ============================================================================
// Store Interface
// ============================================================================

interface UnifiedConversationState {
  // -------------------------------------------------------------------------
  // Conversation State
  // -------------------------------------------------------------------------
  /** Current conversation ID */
  conversationId: string | null;
  /** All messages in the conversation */
  messages: UnifiedMessage[];
  /** Whether AI is typing/generating */
  isTyping: boolean;
  /** Lightweight KB context attached to the last assistant answer, if any */
  lastKbContext?: {
    toolName: string;
    sources: {
      id?: string;
      title: string;
      category?: string;
    }[];
  } | null;

  // -------------------------------------------------------------------------
  // Input Mode State
  // -------------------------------------------------------------------------
  /** Current input mode */
  inputMode: "text" | "voice";
  /** Voice interaction type */
  voiceModeType: VoiceModeType;
  /** Whether voice mode is active */
  voiceModeActive: boolean;

  // -------------------------------------------------------------------------
  // Voice State Machine
  // -------------------------------------------------------------------------
  /** Current voice state */
  voiceState: VoiceState;
  /** Whether user is currently speaking */
  isListening: boolean;
  /** Whether AI is currently speaking */
  isSpeaking: boolean;
  /** Partial transcript during voice input */
  partialTranscript: string;
  /** Voice connection status */
  voiceConnectionStatus: VoiceConnectionStatus;
  /** Last voice error */
  voiceError: ConnectionError | null;

  // -------------------------------------------------------------------------
  // Audio Playback State
  // -------------------------------------------------------------------------
  /** Current playback state */
  playbackState: PlaybackState;
  /** Currently playing message ID */
  currentlyPlayingMessageId: string | null;
  /** Audio playback queue */
  audioQueue: AudioQueueItem[];
  /** Whether auto-play is enabled (voice mode only) */
  autoPlayEnabled: boolean;

  // -------------------------------------------------------------------------
  // Chat Connection State
  // -------------------------------------------------------------------------
  /** Chat WebSocket connection status */
  chatConnectionStatus:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "error";
  /** Last chat error */
  chatError: ConnectionError | null;

  // -------------------------------------------------------------------------
  // Actions - Conversation
  // -------------------------------------------------------------------------
  /** Set the current conversation */
  setConversation: (conversationId: string | null) => void;
  /** Add a message to the conversation */
  addMessage: (
    message: Omit<UnifiedMessage, "id" | "createdAt" | "sessionId"> & {
      id?: string;
    },
  ) => UnifiedMessage;
  /** Update an existing message */
  updateMessage: (id: string, updates: Partial<UnifiedMessage>) => void;
  /** Remove a message */
  removeMessage: (id: string) => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Set all messages at once (for batch loading, prevents multiple re-renders) */
  setMessages: (messages: UnifiedMessage[]) => void;
  /** Set typing state */
  setTyping: (isTyping: boolean) => void;
  /** Update message with streaming content */
  appendStreamingContent: (messageId: string, content: string) => void;

  // -------------------------------------------------------------------------
  // Actions - Input Mode
  // -------------------------------------------------------------------------
  /** Set input mode (text or voice) */
  setInputMode: (mode: "text" | "voice") => void;
  /** Set voice mode type (always-on or push-to-talk) */
  setVoiceModeType: (type: VoiceModeType) => void;
  /** Toggle voice mode on/off */
  toggleVoiceMode: () => void;
  /** Activate voice mode */
  activateVoiceMode: () => void;
  /** Deactivate voice mode */
  deactivateVoiceMode: () => void;

  // -------------------------------------------------------------------------
  // Actions - Voice State
  // -------------------------------------------------------------------------
  /** Set voice state machine state */
  setVoiceState: (state: VoiceState) => void;
  /** Start listening (user speaking) */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Start AI speaking */
  startSpeaking: () => void;
  /** Stop AI speaking */
  stopSpeaking: () => void;
  /** Set partial transcript */
  setPartialTranscript: (transcript: string) => void;
  /** Clear partial transcript */
  clearPartialTranscript: () => void;
  /** Set voice connection status */
  setVoiceConnectionStatus: (status: VoiceConnectionStatus) => void;
  /** Set voice error */
  setVoiceError: (error: ConnectionError | null) => void;

  // -------------------------------------------------------------------------
  // Actions - Audio Playback
  // -------------------------------------------------------------------------
  /** Set playback state */
  setPlaybackState: (state: PlaybackState) => void;
  /** Set currently playing message */
  setCurrentlyPlayingMessage: (messageId: string | null) => void;
  /** Add to audio queue */
  addToAudioQueue: (item: AudioQueueItem) => void;
  /** Remove from audio queue */
  removeFromAudioQueue: (messageId: string) => void;
  /** Clear audio queue */
  clearAudioQueue: () => void;
  /** Set auto-play enabled */
  setAutoPlayEnabled: (enabled: boolean) => void;
  /** Play next in queue */
  playNextInQueue: () => AudioQueueItem | null;

  // -------------------------------------------------------------------------
  // Actions - Chat Connection
  // -------------------------------------------------------------------------
  /** Set chat connection status */
  setChatConnectionStatus: (
    status:
      | "disconnected"
      | "connecting"
      | "connected"
      | "reconnecting"
      | "error",
  ) => void;
  /** Set chat error */
  setChatError: (error: ConnectionError | null) => void;

  // -------------------------------------------------------------------------
  // Actions - Reset
  // -------------------------------------------------------------------------
  /** Reset all state */
  reset: () => void;
  /** Reset voice state only */
  resetVoiceState: () => void;
}

// ============================================================================
// Default State
// ============================================================================

const defaultState = {
  // Conversation
  conversationId: null,
  messages: [],
  isTyping: false,
  lastKbContext: null,

  // Input Mode
  inputMode: "text" as const,
  voiceModeType: "push-to-talk" as VoiceModeType,
  voiceModeActive: false,

  // Voice State
  voiceState: "idle" as VoiceState,
  isListening: false,
  isSpeaking: false,
  partialTranscript: "",
  voiceConnectionStatus: "disconnected" as VoiceConnectionStatus,
  voiceError: null,

  // Audio Playback
  playbackState: "idle" as PlaybackState,
  currentlyPlayingMessageId: null,
  audioQueue: [],
  autoPlayEnabled: true,

  // Chat Connection
  chatConnectionStatus: "disconnected" as const,
  chatError: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useUnifiedConversationStore = create<UnifiedConversationState>()(
  (set, get) => ({
    ...defaultState,

    // ---------------------------------------------------------------------------
    // Conversation Actions
    // ---------------------------------------------------------------------------

    setConversation: (conversationId) => {
      set({ conversationId, messages: [] });
    },

    addMessage: (message) => {
      const id =
        message.id ??
        `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Prevent duplicate messages with the same ID
      const existingMessages = get().messages;
      if (existingMessages.some((m) => m.id === id)) {
        // Message already exists, return the existing one
        return existingMessages.find((m) => m.id === id) as UnifiedMessage;
      }

      const newMessage: UnifiedMessage = {
        ...message,
        id,
        sessionId: get().conversationId ?? "",
        createdAt: new Date().toISOString(),
        source: message.source ?? "text",
      };

      set((state) => ({
        messages: [...state.messages, newMessage],
      }));

      return newMessage;
    },

    updateMessage: (id, updates) => {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg,
        ),
      }));
    },

    removeMessage: (id) => {
      set((state) => ({
        messages: state.messages.filter((msg) => msg.id !== id),
      }));
    },

    clearMessages: () => {
      set({ messages: [] });
    },

    setMessages: (messages) => {
      set({ messages });
    },

    setTyping: (isTyping) => {
      set({ isTyping });
    },

    appendStreamingContent: (messageId, content) => {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: msg.content + content }
            : msg,
        ),
      }));
    },

    // ---------------------------------------------------------------------------
    // Input Mode Actions
    // ---------------------------------------------------------------------------

    setInputMode: (inputMode) => {
      set({ inputMode });
    },

    setVoiceModeType: (voiceModeType) => {
      set({ voiceModeType });
    },

    toggleVoiceMode: () => {
      const current = get().voiceModeActive;
      if (current) {
        get().deactivateVoiceMode();
      } else {
        get().activateVoiceMode();
      }
    },

    activateVoiceMode: () => {
      set({
        voiceModeActive: true,
        inputMode: "voice",
        voiceState: "connecting",
      });
    },

    deactivateVoiceMode: () => {
      set({
        voiceModeActive: false,
        inputMode: "text",
        voiceState: "idle",
        isListening: false,
        isSpeaking: false,
        partialTranscript: "",
      });
      // Stop any playing audio
      get().clearAudioQueue();
      get().setPlaybackState("idle");
      get().setCurrentlyPlayingMessage(null);
    },

    // ---------------------------------------------------------------------------
    // Voice State Actions
    // ---------------------------------------------------------------------------

    setVoiceState: (voiceState) => {
      set((state) => {
        const { voiceModeActive, voiceConnectionStatus } = state;
        let nextState: VoiceState = voiceState;

        // If voice mode is not active, keep state in idle/error/cancelled only
        if (!voiceModeActive) {
          if (
            nextState === "listening" ||
            nextState === "processing" ||
            nextState === "responding" ||
            nextState === "speaking" ||
            nextState === "connecting"
          ) {
            nextState = "idle";
          }
        }

        // If connection is not established, avoid active pipeline states
        if (
          voiceConnectionStatus === "disconnected" ||
          voiceConnectionStatus === "error"
        ) {
          if (
            nextState === "listening" ||
            nextState === "processing" ||
            nextState === "responding" ||
            nextState === "speaking" ||
            nextState === "connecting"
          ) {
            nextState = voiceConnectionStatus === "error" ? "error" : "idle";
          }
        } else if (
          voiceConnectionStatus === "connecting" ||
          voiceConnectionStatus === "reconnecting"
        ) {
          if (
            nextState === "listening" ||
            nextState === "processing" ||
            nextState === "responding" ||
            nextState === "speaking"
          ) {
            nextState = "connecting";
          }
        }

        return { ...state, voiceState: nextState };
      });
    },

    startListening: () => {
      set((state) => {
        // Only allow listening when voice mode is active and connection is healthy
        if (
          !state.voiceModeActive ||
          state.voiceConnectionStatus === "disconnected" ||
          state.voiceConnectionStatus === "error"
        ) {
          return state;
        }

        return {
          ...state,
          isListening: true,
          voiceState: "listening",
        };
      });
    },

    stopListening: () => {
      set((state) => {
        const hasTranscript = state.partialTranscript.length > 0;
        const canProcess =
          state.voiceModeActive &&
          state.voiceConnectionStatus !== "disconnected" &&
          state.voiceConnectionStatus !== "error";

        const nextState: VoiceState =
          hasTranscript && canProcess ? "processing" : "idle";

        return {
          ...state,
          isListening: false,
          voiceState: nextState,
        };
      });
    },

    startSpeaking: () => {
      set((state) => {
        // Only allow speaking when voice mode is active and connection is healthy
        if (
          !state.voiceModeActive ||
          state.voiceConnectionStatus === "disconnected" ||
          state.voiceConnectionStatus === "error"
        ) {
          return state;
        }

        return {
          ...state,
          isSpeaking: true,
          voiceState: "responding",
        };
      });
    },

    stopSpeaking: () => {
      const { voiceModeType, voiceModeActive } = get();
      set({
        isSpeaking: false,
        // In always-on mode, return to listening; in PTT, return to idle
        voiceState:
          voiceModeActive && voiceModeType === "always-on"
            ? "listening"
            : "idle",
      });
    },

    setPartialTranscript: (partialTranscript) => {
      set({ partialTranscript });
    },

    clearPartialTranscript: () => {
      set({ partialTranscript: "" });
    },

    setVoiceConnectionStatus: (voiceConnectionStatus) => {
      set((state) => {
        const next: Partial<UnifiedConversationState> = {
          voiceConnectionStatus,
        };

        // Update voice state based on connection
        if (voiceConnectionStatus === "connected") {
          next.voiceState =
            state.voiceModeActive && state.voiceModeType === "always-on"
              ? "listening"
              : "idle";
        } else if (
          voiceConnectionStatus === "disconnected" ||
          voiceConnectionStatus === "error"
        ) {
          next.voiceState =
            voiceConnectionStatus === "error" ? "error" : "idle";
          next.isListening = false;
          next.isSpeaking = false;
        } else if (
          voiceConnectionStatus === "connecting" ||
          voiceConnectionStatus === "reconnecting"
        ) {
          // While (re)connecting, keep voiceState in connecting/idle/error only
          if (
            state.voiceState === "listening" ||
            state.voiceState === "processing" ||
            state.voiceState === "responding" ||
            state.voiceState === "speaking"
          ) {
            next.voiceState = "connecting";
          }
        }

        return { ...state, ...next };
      });
    },

    setVoiceError: (voiceError) => {
      set((state) => ({
        ...state,
        voiceError,
        voiceState: voiceError ? "error" : "idle",
        // In error state, never keep local listening/speaking indicators on.
        // Guards in setVoiceConnectionStatus already enforce this on
        // disconnect; this ensures the same invariant when errors are
        // surfaced directly via setVoiceError.
        isListening: voiceError ? false : state.isListening,
        isSpeaking: voiceError ? false : state.isSpeaking,
      }));
    },

    // ---------------------------------------------------------------------------
    // Audio Playback Actions
    // ---------------------------------------------------------------------------

    setPlaybackState: (playbackState) => {
      set({ playbackState });
    },

    setCurrentlyPlayingMessage: (currentlyPlayingMessageId) => {
      set({ currentlyPlayingMessageId });
    },

    addToAudioQueue: (item) => {
      set((state) => ({
        audioQueue: [...state.audioQueue, item].sort(
          (a, b) => b.priority - a.priority,
        ),
      }));
    },

    removeFromAudioQueue: (messageId) => {
      set((state) => ({
        audioQueue: state.audioQueue.filter(
          (item) => item.messageId !== messageId,
        ),
      }));
    },

    clearAudioQueue: () => {
      set({ audioQueue: [] });
    },

    setAutoPlayEnabled: (autoPlayEnabled) => {
      set({ autoPlayEnabled });
    },

    playNextInQueue: () => {
      const { audioQueue } = get();
      if (audioQueue.length === 0) return null;

      const nextItem = audioQueue[0];
      set((state) => ({
        audioQueue: state.audioQueue.slice(1),
        currentlyPlayingMessageId: nextItem.messageId,
        playbackState: "playing",
      }));

      return nextItem;
    },

    // ---------------------------------------------------------------------------
    // Chat Connection Actions
    // ---------------------------------------------------------------------------

    setChatConnectionStatus: (chatConnectionStatus) => {
      set({ chatConnectionStatus });
    },

    setChatError: (chatError) => {
      set({ chatError });
    },

    // ---------------------------------------------------------------------------
    // Reset Actions
    // ---------------------------------------------------------------------------

    reset: () => {
      set({ ...defaultState });
    },

    resetVoiceState: () => {
      set({
        voiceState: "idle",
        isListening: false,
        isSpeaking: false,
        partialTranscript: "",
        voiceConnectionStatus: "disconnected",
        voiceError: null,
        playbackState: "idle",
        currentlyPlayingMessageId: null,
        audioQueue: [],
      });
    },
  }),
);

// ============================================================================
// Selectors (for performance optimization)
// ============================================================================

/**
 * Select only input mode state
 */
export const selectInputMode = (state: UnifiedConversationState) => ({
  inputMode: state.inputMode,
  voiceModeType: state.voiceModeType,
  voiceModeActive: state.voiceModeActive,
});

/**
 * Select only voice state
 */
export const selectVoiceState = (state: UnifiedConversationState) => ({
  voiceState: state.voiceState,
  isListening: state.isListening,
  isSpeaking: state.isSpeaking,
  partialTranscript: state.partialTranscript,
  voiceConnectionStatus: state.voiceConnectionStatus,
  voiceError: state.voiceError,
});

/**
 * Select only playback state
 */
export const selectPlaybackState = (state: UnifiedConversationState) => ({
  playbackState: state.playbackState,
  currentlyPlayingMessageId: state.currentlyPlayingMessageId,
  audioQueue: state.audioQueue,
  autoPlayEnabled: state.autoPlayEnabled,
});

/**
 * Select unified connection status
 */
export const selectConnectionStatus = (state: UnifiedConversationState) => {
  const { chatConnectionStatus, voiceConnectionStatus, voiceModeActive } =
    state;

  // If voice mode is not active, only consider chat connection
  if (!voiceModeActive) {
    return chatConnectionStatus;
  }

  // If either is connected, we're connected
  if (
    chatConnectionStatus === "connected" ||
    voiceConnectionStatus === "connected"
  ) {
    return "connected";
  }

  // If either is reconnecting, we're reconnecting
  if (
    chatConnectionStatus === "reconnecting" ||
    voiceConnectionStatus === "reconnecting"
  ) {
    return "reconnecting";
  }

  // If either is connecting, we're connecting
  if (
    chatConnectionStatus === "connecting" ||
    voiceConnectionStatus === "connecting"
  ) {
    return "connecting";
  }

  // If either has error, show error
  if (chatConnectionStatus === "error" || voiceConnectionStatus === "error") {
    return "error";
  }

  return "disconnected";
};
