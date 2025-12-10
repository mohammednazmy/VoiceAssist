/**
 * Full Duplex Types
 *
 * Type definitions for full duplex voice communication.
 * Supports simultaneous speaking, audio mixing, and overlap handling.
 *
 * Phase 6: Full Duplex Experience
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Active stream indicator
 */
export type ActiveStream = "user" | "ai" | "both" | "none";

/**
 * Overlap resolution mode
 */
export type OverlapMode = "user_priority" | "ai_priority" | "intelligent";

/**
 * Duplex state
 */
export interface DuplexState {
  /** Whether user is speaking */
  userSpeaking: boolean;

  /** Whether AI is speaking */
  aiSpeaking: boolean;

  /** Whether overlap is occurring */
  isOverlap: boolean;

  /** Duration of current overlap in ms */
  overlapDuration: number;

  /** Which stream is currently active */
  activeStream: ActiveStream;

  /** Whether a tool call is in progress */
  toolCallInProgress: boolean;

  /** Current AI audio volume (0-1) */
  aiVolume: number;

  /** Current sidetone volume (0-1) */
  sidetoneVolume: number;
}

/**
 * Full duplex configuration
 */
export interface FullDuplexConfig {
  /** How to resolve overlapping speech */
  overlapMode: OverlapMode;

  /** Maximum allowed overlap duration in ms */
  maxOverlapDuration: number;

  /** Whether to blend audio during overlap */
  blendOverlapAudio: boolean;

  /** Enable sidetone (user hears their own voice) */
  enableSidetone: boolean;

  /** Sidetone volume level (0-1) */
  sidetoneVolume: number;

  /** VAD confidence threshold to interrupt AI */
  interruptThreshold: number;

  /** VAD confidence below this treated as backchannel */
  acknowledgmentThreshold: number;

  /** Don't interrupt during tool execution */
  respectToolCallBoundaries: boolean;

  /** Fade duration for AI audio ducking in ms */
  duckingFadeDuration: number;

  /** Ducked volume level (0-1) */
  duckedVolume: number;

  /** Delay before starting overlap resolution in ms */
  overlapDetectionDelay: number;
}

/**
 * Default full duplex configuration
 */
export const DEFAULT_FULL_DUPLEX_CONFIG: FullDuplexConfig = {
  overlapMode: "intelligent",
  maxOverlapDuration: 500,
  blendOverlapAudio: true,
  enableSidetone: false,
  sidetoneVolume: 0.1,
  interruptThreshold: 0.7,
  acknowledgmentThreshold: 0.4,
  respectToolCallBoundaries: true,
  duckingFadeDuration: 100,
  duckedVolume: 0.2,
  overlapDetectionDelay: 50,
};

// ============================================================================
// Audio Mixer Types
// ============================================================================

/**
 * Audio channel configuration
 */
export interface AudioChannelConfig {
  /** Channel ID */
  id: string;

  /** Volume level (0-1) */
  volume: number;

  /** Pan position (-1 to 1, 0 = center) */
  pan: number;

  /** Whether channel is muted */
  muted: boolean;

  /** Whether to apply gain control */
  enableAGC: boolean;
}

/**
 * Mixer state
 */
export interface MixerState {
  /** User audio channel */
  userChannel: AudioChannelConfig;

  /** AI audio channel */
  aiChannel: AudioChannelConfig;

  /** Master volume (0-1) */
  masterVolume: number;

  /** Whether mixer is active */
  isActive: boolean;
}

/**
 * Default mixer state
 */
export const DEFAULT_MIXER_STATE: MixerState = {
  userChannel: {
    id: "user",
    volume: 1.0,
    pan: 0,
    muted: false,
    enableAGC: true,
  },
  aiChannel: {
    id: "ai",
    volume: 1.0,
    pan: 0,
    muted: false,
    enableAGC: false,
  },
  masterVolume: 1.0,
  isActive: false,
};

// ============================================================================
// Overlap Handler Types
// ============================================================================

/**
 * Overlap event
 */
export interface OverlapEvent {
  /** When overlap started */
  startTime: number;

  /** Duration in ms */
  duration: number;

  /** VAD confidence when overlap started */
  vadConfidence: number;

  /** Whether it was classified as backchannel */
  wasBackchannel: boolean;

  /** Resolution action taken */
  resolution: "user_interrupt" | "ai_continue" | "fade_and_wait" | "none";
}

/**
 * Overlap resolution result
 */
export interface OverlapResolution {
  /** Action to take */
  action: "interrupt_ai" | "continue_ai" | "fade_ai" | "wait";

  /** Target AI volume */
  targetAiVolume: number;

  /** Whether to send interrupt signal */
  sendInterrupt: boolean;

  /** Reason for the resolution */
  reason: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Full duplex events
 */
export type FullDuplexEvent =
  | { type: "overlap_started"; timestamp: number }
  | { type: "overlap_ended"; event: OverlapEvent }
  | { type: "ai_interrupted"; reason: string }
  | { type: "ai_ducked"; targetVolume: number }
  | { type: "ai_restored"; targetVolume: number }
  | { type: "backchannel_detected"; transcript: string }
  | { type: "tool_call_started" }
  | { type: "tool_call_ended" }
  | { type: "state_change"; state: DuplexState };

/**
 * Callback for full duplex events
 */
export type FullDuplexEventCallback = (event: FullDuplexEvent) => void;
