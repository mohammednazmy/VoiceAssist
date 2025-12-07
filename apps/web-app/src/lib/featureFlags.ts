/**
 * UI Feature Flags
 *
 * Constants for feature flags used in the VoiceAssist UI overhaul.
 * These flags are checked via the experimentService.isFeatureEnabled() API.
 *
 * Flag definitions and rollout percentages are managed on the backend at:
 * /api/experiments/flags/{flagKey}
 *
 * @example
 * ```typescript
 * import { UI_FLAGS } from '@/lib/featureFlags';
 * import { useFeatureFlag } from '@/hooks/useExperiment';
 *
 * const { isEnabled } = useFeatureFlag(UI_FLAGS.UNIFIED_CHAT_VOICE);
 * if (isEnabled) {
 *   return <UnifiedChatVoice />;
 * }
 * ```
 */

/**
 * UI Feature Flag Keys
 *
 * All feature flags for the UI overhaul project.
 * Keys should be snake_case to match backend convention.
 */
export const UI_FLAGS = {
  /**
   * Unified Chat/Voice Interface
   *
   * Enables the merged chat and voice mode interface with:
   * - Single conversation list for both modes
   * - Unified input area with mode toggle
   * - Inline waveform visualization
   * - Push-to-talk / always-on voice settings
   * - Auto-play in voice mode only
   */
  UNIFIED_CHAT_VOICE: "unified_chat_voice_ui",

  /**
   * Enhanced Navigation
   *
   * Enables the improved navigation system with:
   * - Collapsible sidebar
   * - Conversation sections (pinned, today, yesterday)
   * - Auto-title from first message
   * - Mode icon badges on conversations
   * - Conversation search/filter
   */
  NEW_NAVIGATION: "new_navigation",

  /**
   * Enhanced Documents Page
   *
   * Enables document management improvements:
   * - Library view with table/grid toggle
   * - Document preview (PDF, images)
   * - Search and filter by category/date
   * - Upload progress with cancel
   * - Batch actions
   */
  ENHANCED_DOCUMENTS: "enhanced_documents",

  /**
   * Clinical Context Wizard
   *
   * Enables the step-by-step clinical context entry:
   * - Multi-step wizard flow
   * - Progress indicator
   * - Step validation
   * - Save as template
   * - Auto-expire indicator
   */
  CLINICAL_WIZARD: "clinical_wizard",

  /**
   * New Profile/Settings UI
   *
   * Enables enhanced profile and settings:
   * - Tabbed interface
   * - Avatar upload
   * - Security settings (2FA, sessions)
   * - Voice preferences section
   * - Notification preferences
   */
  NEW_PROFILE_UI: "new_profile_ui",

  /**
   * Collapsible Context Pane
   *
   * Enables the right-side collapsible context pane:
   * - Citations panel
   * - Clinical context summary
   * - Conversation branches
   * - Export/share options
   */
  CONTEXT_PANE: "context_pane",
} as const;

/**
 * Type for UI flag keys
 */
export type UIFlagKey = (typeof UI_FLAGS)[keyof typeof UI_FLAGS];

/**
 * Default values for flags when backend is unavailable
 *
 * Used for offline fallback behavior.
 */
export const UI_FLAG_DEFAULTS: Record<UIFlagKey, boolean> = {
  [UI_FLAGS.UNIFIED_CHAT_VOICE]: false,
  [UI_FLAGS.NEW_NAVIGATION]: false,
  [UI_FLAGS.ENHANCED_DOCUMENTS]: false,
  [UI_FLAGS.CLINICAL_WIZARD]: false,
  [UI_FLAGS.NEW_PROFILE_UI]: false,
  [UI_FLAGS.CONTEXT_PANE]: false,
};

/**
 * Feature flag descriptions for debugging/admin
 */
export const UI_FLAG_DESCRIPTIONS: Record<UIFlagKey, string> = {
  [UI_FLAGS.UNIFIED_CHAT_VOICE]:
    "Merged chat and voice interface with unified input area",
  [UI_FLAGS.NEW_NAVIGATION]:
    "Enhanced sidebar with collapsible sections and conversation search",
  [UI_FLAGS.ENHANCED_DOCUMENTS]:
    "Document library with preview, search, and batch actions",
  [UI_FLAGS.CLINICAL_WIZARD]: "Step-by-step clinical context entry wizard",
  [UI_FLAGS.NEW_PROFILE_UI]:
    "Tabbed profile/settings with security and preferences",
  [UI_FLAGS.CONTEXT_PANE]: "Collapsible right pane for citations and context",
};

// ============================================================================
// WebSocket Advanced Features Flags
// ============================================================================

/**
 * WebSocket Advanced Features Flag Keys
 *
 * Feature flags for WebSocket transport enhancements including
 * WebRTC fallback, adaptive bitrate, and AEC feedback.
 */
export const WS_ADVANCED_FLAGS = {
  /**
   * WebRTC Fallback
   *
   * Enable WebRTC data channel as fallback transport for voice streaming.
   * Provides 20-50ms lower latency than WebSocket for supported browsers.
   */
  WEBRTC_FALLBACK: "backend.ws_webrtc_fallback",

  /**
   * WebRTC Prefer
   *
   * Prefer WebRTC over WebSocket when both are available.
   * Only applies when WEBRTC_FALLBACK is enabled.
   */
  WEBRTC_PREFER: "backend.ws_webrtc_prefer",

  /**
   * Adaptive Bitrate
   *
   * Enable adaptive bitrate control based on network conditions.
   * Automatically adjusts audio codec/bitrate (PCM16 → Opus 24k → Opus 12k).
   */
  ADAPTIVE_BITRATE: "backend.ws_adaptive_bitrate",

  /**
   * Adaptive Bitrate Aggressive
   *
   * Use aggressive bitrate switching with shorter hysteresis window.
   * May cause more frequent quality changes but faster adaptation.
   */
  ADAPTIVE_BITRATE_AGGRESSIVE: "backend.ws_adaptive_bitrate_aggressive",

  /**
   * AEC Feedback
   *
   * Enable AEC (Acoustic Echo Cancellation) metrics feedback from client to server.
   * Allows intelligent VAD sensitivity adjustment during TTS playback.
   */
  AEC_FEEDBACK: "backend.ws_aec_feedback",

  /**
   * AEC Barge Gate
   *
   * Enable barge-in gating based on AEC convergence state.
   * Prevents false speech detection from echo during TTS playback.
   */
  AEC_BARGE_GATE: "backend.ws_aec_barge_gate",
} as const;

/**
 * Type for WS Advanced flag keys
 */
export type WSAdvancedFlagKey =
  (typeof WS_ADVANCED_FLAGS)[keyof typeof WS_ADVANCED_FLAGS];

/**
 * Default values for WS Advanced flags when backend is unavailable
 */
export const WS_ADVANCED_FLAG_DEFAULTS: Record<WSAdvancedFlagKey, boolean> = {
  [WS_ADVANCED_FLAGS.WEBRTC_FALLBACK]: false,
  [WS_ADVANCED_FLAGS.WEBRTC_PREFER]: false,
  [WS_ADVANCED_FLAGS.ADAPTIVE_BITRATE]: false,
  [WS_ADVANCED_FLAGS.ADAPTIVE_BITRATE_AGGRESSIVE]: false,
  [WS_ADVANCED_FLAGS.AEC_FEEDBACK]: false,
  [WS_ADVANCED_FLAGS.AEC_BARGE_GATE]: false,
};
