/**
 * VoiceAssist Feature Flag Shared Definitions
 *
 * Single source of truth for feature flag definitions.
 * These definitions are used across all applications (web-app, admin-panel, api-gateway).
 *
 * Naming Convention: {category}.{feature_name}
 * - category: ui | backend | admin | integration | experiment | ops
 * - feature_name: snake_case identifier
 *
 * Example: ui.unified_chat_voice, backend.rag_strategy, ops.maintenance_mode
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Unified categories for feature flags.
 * Must match Python FlagCategory enum exactly.
 */
export const FLAG_CATEGORIES = [
  "ui",
  "backend",
  "admin",
  "integration",
  "experiment",
  "ops",
] as const;

export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

/**
 * Feature flag value types.
 */
export const FLAG_TYPES = [
  "boolean",
  "string",
  "number",
  "json",
  "multivariate",
] as const;

export type FlagType = (typeof FLAG_TYPES)[number];

/**
 * Criticality levels for feature flags.
 */
export type FlagCriticality = "low" | "medium" | "high" | "critical";

/**
 * Feature flag dependencies.
 */
export interface FlagDependencies {
  /** Services that use this flag */
  services: readonly string[];
  /** UI components that depend on this flag */
  components: readonly string[];
  /** Other flags this flag depends on or affects */
  otherFlags: readonly string[];
}

/**
 * Feature flag metadata.
 */
export interface FlagMetadata {
  /** Criticality level for the flag */
  criticality: FlagCriticality;
  /** Team or person responsible for this flag */
  owner?: string;
  /** URL to documentation about this flag */
  docsUrl?: string;
  /** Whether this flag is deprecated */
  deprecated?: boolean;
  /** Deprecation message with migration instructions */
  deprecatedMessage?: string;
  /** Whether this flag has been archived */
  archived?: boolean;
  /** Allowed values for string flags */
  allowedValues?: string[];
  /** Minimum value for number flags */
  min?: number;
  /** Maximum value for number flags */
  max?: number;
}

// ============================================================================
// Phase 3.2: Advanced Flag Types - Variants, Targeting, Scheduling
// ============================================================================

/**
 * Variant definition for multivariate flags.
 * Each variant has a unique ID, name, value, and traffic weight.
 */
export interface FlagVariant {
  /** Unique identifier for this variant */
  id: string;
  /** Human-readable variant name */
  name: string;
  /** The value returned when this variant is selected */
  value: unknown;
  /** Traffic weight (0-100), sum of all variants should equal 100 */
  weight: number;
  /** Optional description of what this variant tests */
  description?: string;
}

/**
 * Supported operators for targeting rule conditions.
 */
export type TargetingOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "semver_gt"
  | "semver_gte"
  | "semver_lt"
  | "semver_lte";

/**
 * User attributes available for targeting rules.
 */
export type TargetingAttribute =
  | "user_id"
  | "user_email"
  | "user_role"
  | "user_created_at"
  | "user_plan"
  | "user_country"
  | "user_language"
  | "app_version"
  | "platform"
  | "custom";

/**
 * A single targeting rule condition.
 */
export interface TargetingCondition {
  /** The user attribute to evaluate */
  attribute: TargetingAttribute | string;
  /** The comparison operator */
  operator: TargetingOperator;
  /** The value(s) to compare against */
  value: string | string[] | number | boolean;
  /** For custom attributes, the custom attribute key */
  customAttributeKey?: string;
}

/**
 * A targeting rule that maps conditions to a variant or enabled state.
 */
export interface TargetingRule {
  /** Unique identifier for this rule */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Priority order (lower = higher priority) */
  priority: number;
  /** Conditions that must ALL match for this rule to apply (AND logic) */
  conditions: TargetingCondition[];
  /** For multivariate: which variant to serve */
  variant?: string;
  /** For boolean: whether to enable the flag */
  enabled?: boolean;
  /** For non-boolean: the value to return */
  value?: unknown;
  /** Optional description of this rule's purpose */
  description?: string;
}

/**
 * Complete targeting rules configuration for a flag.
 */
export interface FlagTargetingRules {
  /** List of targeting rules, evaluated in priority order */
  rules: TargetingRule[];
  /** Default variant/value when no rules match */
  defaultVariant?: string;
  /** Whether flag is enabled when no rules match (for boolean flags) */
  defaultEnabled?: boolean;
}

/**
 * Schedule configuration for time-based flag activation.
 */
export interface FlagSchedule {
  /** ISO 8601 timestamp when flag should activate */
  startAt?: string;
  /** ISO 8601 timestamp when flag should deactivate */
  endAt?: string;
  /** Timezone for schedule evaluation (default: UTC) */
  timezone?: string;
  /** Optional recurring schedule (cron-like) */
  recurring?: {
    /** Cron expression for recurring activation */
    cronExpression: string;
    /** Duration in minutes the flag stays active */
    durationMinutes: number;
  };
}

/**
 * User context for evaluating targeting rules.
 */
export interface UserContext {
  /** User's unique ID */
  userId?: string;
  /** User's email address */
  userEmail?: string;
  /** User's role */
  userRole?: string;
  /** User account creation date */
  userCreatedAt?: string;
  /** User's subscription plan */
  userPlan?: string;
  /** User's country (ISO 3166-1 alpha-2) */
  userCountry?: string;
  /** User's preferred language */
  userLanguage?: string;
  /** Application version */
  appVersion?: string;
  /** Platform (web, ios, android) */
  platform?: string;
  /** Custom attributes for targeting */
  customAttributes?: Record<string, string | number | boolean>;
}

/**
 * Environment types for multi-environment flag management.
 */
export type FlagEnvironment = "development" | "staging" | "production";

/**
 * Extended feature flag state including runtime values.
 */
export interface FeatureFlagState {
  /** The evaluated value for this user */
  value: unknown;
  /** Data source: realtime (SSE), api (HTTP), or cache (localStorage) */
  source: "realtime" | "api" | "cache";
  /** Whether the cached value may be stale */
  isStale: boolean;
  /** Error message if evaluation failed */
  error: string | null;
  /** For multivariate: which variant was selected */
  variant?: string;
  /** Which targeting rule matched (if any) */
  matchedRule?: string;
}

/**
 * Complete feature flag definition.
 */
export interface FeatureFlagDefinition {
  /** Full flag name with category prefix (e.g., "ui.unified_chat_voice") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping flags */
  category: FlagCategory;
  /** Type of flag value */
  type: FlagType;
  /** Default value when flag doesn't exist */
  defaultValue: unknown;
  /** Whether flag is enabled by default */
  defaultEnabled: boolean;
  /** Flag metadata */
  metadata: FlagMetadata;
  /** Dependencies for impact analysis */
  dependencies?: FlagDependencies;
}

// ============================================================================
// Feature Flag Definitions - Single Source of Truth
// ============================================================================

/**
 * All feature flags organized by category.
 * This is the single source of truth for flag definitions.
 */
export const FEATURE_FLAGS = {
  // -------------------------------------------------------------------------
  // UI Flags - Frontend toggles
  // -------------------------------------------------------------------------
  ui: {
    unified_chat_voice: {
      name: "ui.unified_chat_voice",
      description: "Enable unified chat and voice interface",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/admin/feature-flags#ui",
      },
      dependencies: {
        services: ["web-app"],
        components: ["VoiceChat", "ChatInterface", "UnifiedChatContainer"],
        otherFlags: [],
      },
    },
    new_navigation: {
      name: "ui.new_navigation",
      description: "Enable new sidebar navigation layout",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app", "admin-panel"],
        components: ["Sidebar", "Navigation"],
        otherFlags: [],
      },
    },
    beta_features: {
      name: "ui.beta_features",
      description: "Enable beta/experimental UI features",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app"],
        components: [],
        otherFlags: [],
      },
    },
    dark_mode: {
      name: "ui.dark_mode",
      description: "Enable dark mode theme option",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app", "admin-panel"],
        components: ["ThemeProvider", "SettingsPanel"],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Backend Flags - API/service behavior
  // -------------------------------------------------------------------------
  backend: {
    rbac_enforcement: {
      name: "backend.rbac_enforcement",
      description: "Enable RBAC permission checks on admin endpoints",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
        owner: "security-team",
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["backend.rbac_strict_mode"],
      },
    },
    rbac_strict_mode: {
      name: "backend.rbac_strict_mode",
      description: "Enable strict RBAC mode (deny by default)",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        owner: "security-team",
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["backend.rbac_enforcement"],
      },
    },
    rag_strategy: {
      name: "backend.rag_strategy",
      description: "RAG query strategy (simple, multi_hop, hybrid)",
      category: "backend" as const,
      type: "string" as const,
      defaultValue: "simple",
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
        allowedValues: ["simple", "multi_hop", "hybrid"],
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    rag_max_results: {
      name: "backend.rag_max_results",
      description: "Maximum number of RAG search results to return",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 5,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        min: 1,
        max: 20,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    rag_score_threshold: {
      name: "backend.rag_score_threshold",
      description: "Minimum similarity score threshold for RAG results",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 0.2,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        min: 0.0,
        max: 1.0,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    cache_enabled: {
      name: "backend.cache_enabled",
      description: "Enable multi-level caching (L1/L2)",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    async_indexing: {
      name: "backend.async_indexing",
      description: "Enable asynchronous document indexing",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },

    // -------------------------------------------------------------------------
    // Voice Conversation Features
    // -------------------------------------------------------------------------
    voice_backchanneling: {
      name: "backend.voice_backchanneling",
      description:
        "[Voice] Enable backchanneling/filler phrases during voice conversations. " +
        "When enabled, the assistant will use natural verbal cues like 'Yes', 'Uh-huh', " +
        "'I see', etc. to indicate active listening. Disable to remove filler phrases.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/backchanneling",
      },
      dependencies: {
        services: ["api-gateway"],
        components: ["BackchannelService", "VoicePipelineService"],
        otherFlags: [],
      },
    },

    // -------------------------------------------------------------------------
    // WebSocket Latency Optimization Flags
    // -------------------------------------------------------------------------
    voice_ws_audio_prebuffering: {
      name: "backend.voice_ws_audio_prebuffering",
      description:
        "[WS Latency] Enable audio pre-buffering before playback starts. " +
        "Buffers a minimum number of audio chunks to prevent choppy playback " +
        "on networks with jitter. Default buffer: 3 chunks (~150ms).",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-latency-optimization",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["useTTAudioPlayback", "VoicePipelineSession"],
        otherFlags: [],
      },
    },
    voice_ws_compression: {
      name: "backend.voice_ws_compression",
      description:
        "[WS Latency] Enable WebSocket permessage-deflate compression. " +
        "Reduces bandwidth for text messages (transcripts, events) by 15-30%. " +
        "Note: Binary audio frames are not compressed as they are already efficient.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-latency-optimization",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["useThinkerTalkerSession", "VoicePipelineSession"],
        otherFlags: [],
      },
    },
    voice_ws_adaptive_chunking: {
      name: "backend.voice_ws_adaptive_chunking",
      description:
        "[WS Latency] Enable adaptive audio chunk sizing based on network metrics. " +
        "Adjusts chunk size dynamically: smaller chunks (1024 samples) for good networks " +
        "to reduce latency, larger chunks (4096 samples) for poor networks to reduce overhead.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-latency-optimization",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["useThinkerTalkerSession", "VoicePipelineSession"],
        otherFlags: [],
      },
    },

    // -------------------------------------------------------------------------
    // WebSocket Reliability Flags - Phase 1-3
    // -------------------------------------------------------------------------
    voice_ws_binary_audio: {
      name: "backend.voice_ws_binary_audio",
      description:
        "[WS Reliability Phase 1] Enable binary WebSocket frames for audio transmission. " +
        "Sends audio as raw binary instead of base64-encoded JSON, reducing bandwidth by ~33% " +
        "and CPU overhead from encoding/decoding. Includes sequence numbers for ordering.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/websocket-binary-audio",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useThinkerTalkerSession",
          "ThinkerTalkerWebSocketHandler",
        ],
        otherFlags: [],
      },
    },
    voice_ws_session_persistence: {
      name: "backend.voice_ws_session_persistence",
      description:
        "[WS Reliability Phase 2] Enable Redis-backed session persistence for voice WebSocket sessions. " +
        "Allows session state to survive brief disconnections and enables session recovery. " +
        "Stores conversation context, audio buffer state, and pipeline configuration in Redis.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-session-persistence",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useThinkerTalkerSession",
          "ThinkerTalkerWebSocketHandler",
          "RedisSessionStore",
        ],
        otherFlags: [],
      },
    },
    voice_ws_graceful_degradation: {
      name: "backend.voice_ws_graceful_degradation",
      description:
        "[WS Reliability Phase 3] Enable graceful degradation for voice WebSocket connections. " +
        "Automatically reduces audio quality, increases buffering, or falls back to polling " +
        "when network conditions degrade. Provides seamless experience during connectivity issues.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-graceful-degradation",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useThinkerTalkerSession",
          "useNetworkQuality",
          "VoicePipelineSession",
        ],
        otherFlags: ["backend.voice_ws_adaptive_chunking"],
      },
    },

    // -------------------------------------------------------------------------
    // WebSocket Error Recovery Flags
    // -------------------------------------------------------------------------
    ws_session_recovery: {
      name: "backend.ws_session_recovery",
      description:
        "[WS Recovery] Enable WebSocket session state persistence for reconnection. " +
        "Stores session state in Redis including pipeline state, conversation context, " +
        "and voice settings. Allows seamless recovery after brief disconnections.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/websocket-error-recovery",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useThinkerTalkerSession",
          "ThinkerTalkerWebSocketHandler",
        ],
        otherFlags: [],
      },
    },
    ws_message_recovery: {
      name: "backend.ws_message_recovery",
      description:
        "[WS Recovery] Enable partial message recovery after disconnects. " +
        "Buffers recent messages on the server and replays missed messages " +
        "to clients upon reconnection. Prevents loss of transcript/response deltas.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/websocket-error-recovery",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useThinkerTalkerSession",
          "ThinkerTalkerWebSocketHandler",
        ],
        otherFlags: ["backend.ws_session_recovery"],
      },
    },
    ws_audio_checkpointing: {
      name: "backend.ws_audio_checkpointing",
      description:
        "[WS Recovery] Enable audio buffer checkpointing for playback resume. " +
        "Tracks confirmed audio sequence numbers and buffers unconfirmed chunks. " +
        "Allows resuming audio playback from last confirmed position after reconnect.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/websocket-error-recovery",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["useTTAudioPlayback", "ThinkerTalkerWebSocketHandler"],
        otherFlags: ["backend.ws_session_recovery"],
      },
    },

    // -------------------------------------------------------------------------
    // WebSocket Protocol Optimization Flags
    // -------------------------------------------------------------------------
    ws_binary_protocol: {
      name: "backend.ws_binary_protocol",
      description:
        "[WS Protocol] Enable binary WebSocket protocol for all message types. " +
        "Uses binary framing with MessagePack serialization instead of JSON. " +
        "Reduces message size by 20-40% and improves parsing performance.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "ThinkerTalkerWebSocketHandler",
          "useThinkerTalkerSession",
        ],
        otherFlags: [],
      },
    },
    ws_message_batching: {
      name: "backend.ws_message_batching",
      description:
        "[WS Protocol] Enable message batching for WebSocket communication. " +
        "Groups multiple small messages into batched frames to reduce overhead. " +
        "Configurable batch window (default 50ms) and max batch size (default 10).",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "ThinkerTalkerWebSocketHandler",
          "WebSocketMessageBatcher",
        ],
        otherFlags: [],
      },
    },

    // -------------------------------------------------------------------------
    // WebSocket Advanced Features - Phase: WebSocket Advanced Features
    // -------------------------------------------------------------------------
    ws_webrtc_fallback: {
      name: "backend.ws_webrtc_fallback",
      description:
        "Enable WebRTC data channel as fallback transport for voice streaming. " +
        "Provides 20-50ms lower latency than WebSocket for supported browsers.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["TransportManager", "WebRTCTransport"],
        otherFlags: [],
      },
    },
    ws_webrtc_prefer: {
      name: "backend.ws_webrtc_prefer",
      description:
        "Prefer WebRTC over WebSocket when both are available. " +
        "Only applies when ws_webrtc_fallback is enabled.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["TransportManager"],
        otherFlags: ["backend.ws_webrtc_fallback"],
      },
    },
    ws_adaptive_bitrate: {
      name: "backend.ws_adaptive_bitrate",
      description:
        "Enable adaptive bitrate control based on network conditions. " +
        "Automatically adjusts audio codec/bitrate (PCM16 → Opus 24k → Opus 12k).",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["AdaptiveBitrateController", "VoicePipelineSession"],
        otherFlags: [],
      },
    },
    ws_adaptive_bitrate_aggressive: {
      name: "backend.ws_adaptive_bitrate_aggressive",
      description:
        "Use aggressive bitrate switching with shorter hysteresis window. " +
        "May cause more frequent quality changes but faster adaptation.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["AdaptiveBitrateController"],
        otherFlags: ["backend.ws_adaptive_bitrate"],
      },
    },
    ws_aec_feedback: {
      name: "backend.ws_aec_feedback",
      description:
        "Enable AEC (Acoustic Echo Cancellation) metrics feedback from client to server. " +
        "Allows intelligent VAD sensitivity adjustment during TTS playback.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["AECMonitor", "VoicePipelineSession"],
        otherFlags: [],
      },
    },
    ws_aec_barge_gate: {
      name: "backend.ws_aec_barge_gate",
      description:
        "Enable barge-in gating based on AEC convergence state. " +
        "Prevents false speech detection from echo during TTS playback.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl:
          "https://assistdocs.asimo.io/voice/websocket-advanced-features",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["AECMonitor"],
        otherFlags: ["backend.ws_aec_feedback"],
      },
    },

    // -------------------------------------------------------------------------
    // Natural Conversation Flow Flags - Phase: Natural Conversation
    // -------------------------------------------------------------------------
    voice_queue_overflow_protection: {
      name: "backend.voice_queue_overflow_protection",
      description:
        "[Natural Conversation Phase 1] Enable audio queue overflow protection. " +
        "Enforces MAX_QUEUE_DURATION_MS (1000ms) limit on audio queue to prevent " +
        "runaway accumulation. Automatically trims old chunks when queue exceeds limit.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useTTAudioPlayback"],
        otherFlags: [],
      },
    },
    voice_schedule_watchdog: {
      name: "backend.voice_schedule_watchdog",
      description:
        "[Natural Conversation Phase 1] Enable scheduling watchdog for audio playback. " +
        "Runs every 500ms to detect stuck schedules and queue overflow. " +
        "Automatically resets schedule if stuck more than 2x lookahead ahead.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useTTAudioPlayback"],
        otherFlags: ["backend.voice_queue_overflow_protection"],
      },
    },
    voice_intelligent_barge_in: {
      name: "backend.voice_intelligent_barge_in",
      description:
        "[Natural Conversation Phase 2] Enable intelligent barge-in classification. " +
        "Classifies user interruptions as backchannel, soft_barge, hard_barge, or unclear. " +
        "Supports 12 languages with fuzzy matching for STT error tolerance.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useIntelligentBargeIn",
          "classifyBargeIn",
          "BargeInClassifier",
          "ThinkerTalkerWebSocketHandler",
        ],
        otherFlags: [],
      },
    },
    voice_instant_barge_in: {
      name: "backend.voice_instant_barge_in",
      description:
        "[Natural Conversation] Enable instant barge-in using Deepgram SpeechStarted event. " +
        "Immediately stops AI audio on any detected speech, reducing barge-in latency from 200-300ms to <50ms. " +
        "Uses rapid audio fade-out (50ms) for smooth transition.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "useThinkerTalkerSession",
          "useTTAudioPlayback",
          "ThinkerTalkerWebSocketHandler",
        ],
        otherFlags: [],
      },
    },
    voice_continuation_detection: {
      name: "backend.voice_continuation_detection",
      description:
        "[Natural Conversation] Enable continuation detection for natural pauses. " +
        "Analyzes speech patterns (trailing words, filler words, prosody) to predict when " +
        "user intends to continue speaking. Dynamically extends silence threshold for incomplete utterances.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["SilencePredictor", "ContinuationDetector"],
        otherFlags: [],
      },
    },
    voice_utterance_aggregation: {
      name: "backend.voice_utterance_aggregation",
      description:
        "[Natural Conversation] Enable multi-segment utterance aggregation. " +
        "Accumulates speech segments within a time window and merges them into coherent queries " +
        "before sending to Thinker. Prevents loss of context when user speaks in fragments.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "UtteranceAggregator",
          "UtteranceWindowManager",
          "ThinkerTalkerWebSocketHandler",
        ],
        otherFlags: ["backend.voice_continuation_detection"],
      },
    },
    voice_preemptive_listening: {
      name: "backend.voice_preemptive_listening",
      description:
        "[Natural Conversation] Keep STT active during AI speech for faster barge-in. " +
        "Buffers incoming transcripts during AI playback so transcript is immediately " +
        "available when barge-in is confirmed. Reduces response delay after interruption.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["useThinkerTalkerSession", "VoicePipelineSession"],
        otherFlags: ["backend.voice_instant_barge_in"],
      },
    },
    voice_aggregation_window_ms: {
      name: "backend.voice_aggregation_window_ms",
      description:
        "[Natural Conversation] Maximum time (ms) to wait for speech continuation. " +
        "After silence is detected, waits this long for user to resume before processing. " +
        "Longer values allow more natural pauses but increase response latency.",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 3000,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 1000,
        max: 10000,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["UtteranceAggregator"],
        otherFlags: ["backend.voice_utterance_aggregation"],
      },
    },
    voice_min_barge_in_confidence: {
      name: "backend.voice_min_barge_in_confidence",
      description:
        "[Natural Conversation] Minimum VAD confidence (0-1) to trigger barge-in. " +
        "Lower values make barge-in more sensitive (may cause false triggers). " +
        "Higher values require stronger speech signal (may miss quiet interruptions).",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 0.3,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 0.0,
        max: 1.0,
        docsUrl: "https://assistdocs.asimo.io/voice/natural-conversation-flow",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["OverlapHandler", "BargeInClassifier"],
        otherFlags: ["backend.voice_instant_barge_in"],
      },
    },
    voice_barge_in_classifier_enabled: {
      name: "backend.voice_barge_in_classifier_enabled",
      description:
        "[Natural Conversation] Enable intelligent barge-in classification. " +
        "Classifies user interruptions as backchannel (continue AI), soft_barge (pause AI), " +
        "or hard_barge (stop AI). Supports 12 languages with multilingual backchannel detection. " +
        "When disabled, all barge-ins are treated as hard interruptions.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-classification",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "BargeInClassifier",
          "VoicePipelineService",
          "useThinkerTalkerVoiceMode",
        ],
        otherFlags: ["backend.voice_instant_barge_in"],
      },
    },
    voice_barge_in_killswitch: {
      name: "backend.voice_barge_in_killswitch",
      description:
        "[Natural Conversation] MASTER KILL SWITCH for barge-in enhancements. " +
        "When enabled, instantly reverts to legacy simple barge-in behavior. " +
        "Use this flag to quickly disable all barge-in classification if issues arise.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "high" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-classification",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["VoicePipelineService", "useThinkerTalkerVoiceMode"],
        otherFlags: [],
      },
    },
    voice_hybrid_vad_fusion: {
      name: "backend.voice_hybrid_vad_fusion",
      description:
        "[Natural Conversation] Enable hybrid VAD fusion combining frontend Silero VAD " +
        "with backend Deepgram VAD using weighted voting. Improves barge-in accuracy " +
        "during AI playback by adjusting weights: Silero 0.3/Deepgram 0.7 during playback, " +
        "Silero 0.6/Deepgram 0.4 when idle. Includes 500ms misfire rollback timer.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/hybrid-vad-fusion",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "HybridVADDecider",
          "VoicePipelineService",
          "useSileroVAD",
        ],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },
    voice_hybrid_vad_signal_freshness_ms: {
      name: "backend.voice_hybrid_vad_signal_freshness_ms",
      description:
        "[Natural Conversation] Signal freshness window (ms) for hybrid VAD fusion. " +
        "Controls how long Silero/Deepgram VAD events are considered valid when deciding " +
        "barge-in during playback. Lower values favor very recent signals; higher values " +
        "tolerate more latency.",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 300,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 100,
        max: 2000,
        docsUrl: "https://assistdocs.asimo.io/voice/hybrid-vad-fusion",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["HybridVADDecider", "VoicePipelineService"],
        otherFlags: ["backend.voice_hybrid_vad_fusion"],
      },
    },
    voice_aec_capability_tuning: {
      name: "backend.voice_aec_capability_tuning",
      description:
        "[Natural Conversation] Enable AEC capability-aware tuning for echo thresholds. " +
        "Uses frontend AEC quality (excellent/good/fair/poor) to adjust hybrid VAD thresholds " +
        "and Silero playback thresholds on devices with poor echo cancellation.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/hybrid-vad-fusion",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "HybridVADDecider",
          "VoicePipelineService",
          "useThinkerTalkerVoiceMode",
        ],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },
    voice_word_timestamps: {
      name: "backend.voice_word_timestamps",
      description:
        "[Natural Conversation] Enable word-level transcript tracking for clean truncation " +
        "during barge-in. Tracks AI response text and estimates word boundaries to provide " +
        "accurate text cutoff when audio is interrupted. Sends transcript.truncated events " +
        "to frontend with truncated_text, remaining_text, and word counts.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/word-timestamps",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["TranscriptSyncService", "VoicePipelineService"],
        otherFlags: [],
      },
    },
    voice_prosody_extraction: {
      name: "backend.voice_prosody_extraction",
      description:
        "[Natural Conversation] Enable frontend prosody feature extraction for turn-taking. " +
        "Extracts pitch, energy, and speech rate from audio frames using Web Audio API. " +
        "Features are sent to backend with audio.input.complete messages for holistic " +
        "turn-prediction combining transcript patterns with prosodic cues.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/prosody-turn-taking",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "ProsodyExtractor",
          "useThinkerTalkerSession",
          "ContinuationDetector",
        ],
        otherFlags: ["backend.voice_continuation_detection"],
      },
    },
    voice_adaptive_prebuffer: {
      name: "backend.voice_adaptive_prebuffer",
      description:
        "[Natural Conversation] Enable network-adaptive audio prebuffering. " +
        "Dynamically adjusts the audio prebuffer size based on network quality. " +
        "Good connections (RTT < 100ms): 2-3 chunks (~150ms). " +
        "Poor connections (RTT > 300ms): 6-8 chunks (~400ms). " +
        "Reduces jitter and audio glitches on poor networks while minimizing " +
        "latency on good networks.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/network-adaptive",
      },
      dependencies: {
        services: ["web-app"],
        components: [
          "useTTAudioPlayback",
          "useNetworkQuality",
          "useThinkerTalkerVoiceMode",
        ],
        otherFlags: ["backend.voice_ws_prebuffering"],
      },
    },

    // =========================================================================
    // Silero VAD Enhancement Flags (Local Browser-Side VAD)
    // =========================================================================
    voice_silero_vad_enabled: {
      name: "backend.voice_silero_vad_enabled",
      description:
        "[Silero VAD] Master toggle for local Silero VAD in browser. " +
        "Silero VAD is a neural network-based voice activity detector that runs " +
        "in the browser via ONNX Runtime. Provides more accurate speech detection " +
        "than simple RMS thresholds, enabling reliable barge-in during AI speech.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD", "useThinkerTalkerVoiceMode"],
        otherFlags: [],
      },
    },
    voice_silero_echo_suppression_mode: {
      name: "backend.voice_silero_echo_suppression_mode",
      description:
        "[Silero VAD] Echo suppression mode during AI playback. " +
        "Options: 'threshold_boost' (keep VAD active with higher threshold), " +
        "'pause' (pause VAD entirely during playback), 'none' (no suppression). " +
        "Default: threshold_boost - keeps VAD active but requires stronger speech signal.",
      category: "backend" as const,
      type: "string" as const,
      defaultValue: "threshold_boost",
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        allowedValues: ["threshold_boost", "pause", "none"],
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD", "useThinkerTalkerVoiceMode"],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },
    voice_silero_positive_threshold: {
      name: "backend.voice_silero_positive_threshold",
      description:
        "[Silero VAD] Base probability threshold (0-1) for speech detection. " +
        "Higher = less sensitive (fewer false positives). " +
        "Lower = more sensitive (may detect noise as speech). " +
        "Default: 0.5",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 0.5,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 0.1,
        max: 0.9,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },
    voice_silero_playback_threshold_boost: {
      name: "backend.voice_silero_playback_threshold_boost",
      description:
        "[Silero VAD] Amount to boost speech threshold during AI playback (0-0.5). " +
        "Applied when echo suppression mode is 'threshold_boost'. " +
        "Higher = more aggressive echo filtering (may miss quiet barge-ins). " +
        "Default: 0.2 (threshold becomes 0.5 + 0.2 = 0.7 during playback)",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 0.2,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 0.0,
        max: 0.5,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: [
          "backend.voice_silero_vad_enabled",
          "backend.voice_silero_echo_suppression_mode",
        ],
      },
    },
    voice_silero_min_speech_ms: {
      name: "backend.voice_silero_min_speech_ms",
      description:
        "[Silero VAD] Minimum speech duration (ms) before triggering onSpeechStart. " +
        "Helps filter out short noise bursts. " +
        "Higher = fewer false positives but slower detection. " +
        "Default: 150",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 150,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 50,
        max: 500,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },
    voice_silero_playback_min_speech_ms: {
      name: "backend.voice_silero_playback_min_speech_ms",
      description:
        "[Silero VAD] Minimum speech duration (ms) during AI playback to trigger barge-in. " +
        "Longer duration helps filter out TTS echo bursts. " +
        "Default: 200 (speech during playback must be at least 200ms to count)",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 200,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 100,
        max: 500,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: [
          "backend.voice_silero_vad_enabled",
          "backend.voice_silero_echo_suppression_mode",
        ],
      },
    },
    // Phase 3: Adaptive VAD Flags
    voice_silero_adaptive_threshold: {
      name: "backend.voice_silero_adaptive_threshold",
      description:
        "[Silero VAD Phase 3] Enable adaptive VAD threshold based on ambient noise. " +
        "When enabled, VAD monitors background noise during silence and adjusts " +
        "the speech detection threshold dynamically for better accuracy.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },
    voice_silero_noise_calibration_ms: {
      name: "backend.voice_silero_noise_calibration_ms",
      description:
        "[Silero VAD Phase 3] Duration (ms) to measure ambient noise at startup. " +
        "Longer calibration provides more accurate noise profile but delays voice mode activation.",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 1000,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 500,
        max: 3000,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: [
          "backend.voice_silero_vad_enabled",
          "backend.voice_silero_adaptive_threshold",
        ],
      },
    },
    voice_silero_noise_adaptation_factor: {
      name: "backend.voice_silero_noise_adaptation_factor",
      description:
        "[Silero VAD Phase 3] How much to adjust threshold per unit of noise (0-0.3). " +
        "Higher values make threshold adjustment more aggressive in noisy environments.",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 0.1,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        min: 0.0,
        max: 0.3,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app"],
        components: ["useSileroVAD"],
        otherFlags: [
          "backend.voice_silero_vad_enabled",
          "backend.voice_silero_adaptive_threshold",
        ],
      },
    },
    voice_silero_vad_confidence_sharing: {
      name: "backend.voice_silero_vad_confidence_sharing",
      description:
        "[Silero VAD Phase 2] Enable frontend-to-backend VAD confidence sharing. " +
        "When enabled, frontend streams VAD state to backend for hybrid decision making.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/silero-vad",
      },
      dependencies: {
        services: ["web-app", "api-gateway"],
        components: [
          "useSileroVAD",
          "useThinkerTalkerSession",
          "voice_pipeline_service",
        ],
        otherFlags: ["backend.voice_silero_vad_enabled"],
      },
    },

    // =========================================================================
    // Barge-In Improvement Plan v3 Flags
    // Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
    // =========================================================================
    voice_semantic_vad: {
      name: "backend.voice_semantic_vad",
      description:
        "[Barge-In v3 - Workstream 1] Enable semantic VAD for thinking pause detection. " +
        "Distinguishes natural 'thinking' pauses from end-of-utterance based on linguistic " +
        "context (trailing conjunctions, incomplete sentences, filler words). Prevents " +
        "premature AI response during user's natural speech pauses.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-improvements",
      },
      dependencies: {
        services: ["api-gateway"],
        components: ["SemanticVADService", "ContinuationDetector"],
        otherFlags: ["backend.voice_continuation_detection"],
      },
    },
    voice_graceful_truncation: {
      name: "backend.voice_graceful_truncation",
      description:
        "[Barge-In v3 - Workstream 2] Enable graceful audio truncation at sentence boundaries. " +
        "When barge-in occurs, stops TTS at the nearest sentence/clause boundary rather than " +
        "mid-word. Provides smoother interruption experience and maintains conversational flow.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-improvements",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: [
          "GracefulTruncationService",
          "TalkerService",
          "useTTAudioPlayback",
        ],
        otherFlags: ["backend.voice_instant_barge_in"],
      },
    },
    voice_speculative_continuation: {
      name: "backend.voice_speculative_continuation",
      description:
        "[Barge-In v3 - Workstream 3] Enable speculative follow-up generation. " +
        "Pre-generates likely follow-up responses during user speech to reduce latency. " +
        "Uses context prediction to speculatively prepare TTS audio for common patterns.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-improvements",
      },
      dependencies: {
        services: ["api-gateway"],
        components: ["SpeculativeContinuationService", "ThinkerService"],
        otherFlags: ["backend.voice_v4_tts_cache"],
      },
    },
    voice_duplex_stt: {
      name: "backend.voice_duplex_stt",
      description:
        "[Barge-In v3 - Workstream 4] Enable parallel dual-stream STT for transcript accuracy. " +
        "Runs two STT streams during barge-in: one for user speech, one for confirmation. " +
        "Improves transcript accuracy by cross-referencing results and filtering echo.",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-improvements",
      },
      dependencies: {
        services: ["api-gateway"],
        components: ["DuplexSTTService", "TranscriptSyncService"],
        otherFlags: ["backend.voice_v4_parallel_stt"],
      },
    },
    voice_barge_in_quality_preset: {
      name: "backend.voice_barge_in_quality_preset",
      description:
        "[Barge-In v3 - Workstream 5] User-selectable barge-in quality preset. " +
        "Options: 'responsive' (fast barge-in, may cut mid-word), " +
        "'balanced' (default, sentence-aware), 'smooth' (waits for natural break). " +
        "Allows users to tune barge-in behavior to their preference.",
      category: "backend" as const,
      type: "string" as const,
      defaultValue: "responsive",
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
        allowedValues: ["responsive", "balanced", "smooth"],
        docsUrl: "https://assistdocs.asimo.io/voice/barge-in-improvements",
      },
      dependencies: {
        services: ["api-gateway", "web-app"],
        components: ["VoiceSettings", "BargeInClassifier"],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Admin Flags - Admin panel features
  // -------------------------------------------------------------------------
  admin: {
    bulk_operations: {
      name: "admin.bulk_operations",
      description: "Enable bulk operations in admin panel",
      category: "admin" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["admin-panel"],
        components: ["BulkActionsToolbar", "DataTable"],
        otherFlags: [],
      },
    },
    advanced_analytics: {
      name: "admin.advanced_analytics",
      description: "Enable advanced analytics dashboard",
      category: "admin" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["admin-panel", "api-gateway"],
        components: ["AnalyticsDashboard"],
        otherFlags: [],
      },
    },
    audit_log_export: {
      name: "admin.audit_log_export",
      description: "Enable audit log export functionality",
      category: "admin" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["admin-panel", "api-gateway"],
        components: ["AuditLogPanel"],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Integration Flags - External services
  // -------------------------------------------------------------------------
  integration: {
    nextcloud: {
      name: "integration.nextcloud",
      description: "Enable Nextcloud integration features",
      category: "integration" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["integration.nextcloud_auto_index"],
      },
    },
    nextcloud_auto_index: {
      name: "integration.nextcloud_auto_index",
      description: "Enable automatic indexing of Nextcloud files",
      category: "integration" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["integration.nextcloud"],
      },
    },
    openai: {
      name: "integration.openai",
      description: "Enable OpenAI API for RAG queries",
      category: "integration" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Experiment Flags - A/B tests and experiments
  // -------------------------------------------------------------------------
  experiment: {
    onboarding_v2: {
      name: "experiment.onboarding_v2",
      description: "A/B test for new onboarding flow",
      category: "experiment" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app"],
        components: ["OnboardingWizard"],
        otherFlags: [],
      },
    },
    experimental_api: {
      name: "experiment.experimental_api",
      description: "Enable experimental API endpoints",
      category: "experiment" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Ops Flags - Operational controls
  // -------------------------------------------------------------------------
  ops: {
    maintenance_mode: {
      name: "ops.maintenance_mode",
      description: "Enable maintenance mode (read-only access)",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "critical" as const,
        owner: "ops-team",
      },
      dependencies: {
        services: ["api-gateway", "web-app", "admin-panel"],
        components: [],
        otherFlags: [],
      },
    },
    rate_limiting: {
      name: "ops.rate_limiting",
      description: "Enable API rate limiting",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    metrics_enabled: {
      name: "ops.metrics_enabled",
      description: "Enable Prometheus metrics collection",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    tracing_enabled: {
      name: "ops.tracing_enabled",
      description: "Enable OpenTelemetry distributed tracing",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    verbose_logging: {
      name: "ops.verbose_logging",
      description: "Enable verbose logging (debug level)",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all feature flag definitions as a flat array.
 */
export function getAllFlags(): FeatureFlagDefinition[] {
  const allFlags: FeatureFlagDefinition[] = [];

  for (const category of FLAG_CATEGORIES) {
    const categoryFlags = FEATURE_FLAGS[category];
    if (categoryFlags) {
      for (const flag of Object.values(categoryFlags)) {
        allFlags.push(flag as FeatureFlagDefinition);
      }
    }
  }

  return allFlags;
}

/**
 * Get a flag definition by its full name.
 * @param name Full flag name (e.g., "ui.unified_chat_voice")
 */
export function getFlagByName(name: string): FeatureFlagDefinition | undefined {
  const [category, flagName] = name.split(".", 2);

  if (!category || !flagName) {
    return undefined;
  }

  const categoryFlags = FEATURE_FLAGS[category as FlagCategory];
  if (!categoryFlags) {
    return undefined;
  }

  return (categoryFlags as Record<string, FeatureFlagDefinition>)[flagName];
}

/**
 * Get all flag definitions for a specific category.
 */
export function getFlagsByCategory(
  category: FlagCategory,
): FeatureFlagDefinition[] {
  const categoryFlags = FEATURE_FLAGS[category];
  if (!categoryFlags) {
    return [];
  }

  return Object.values(categoryFlags) as FeatureFlagDefinition[];
}

/**
 * Validate a flag name matches the naming convention.
 * Pattern: {category}.{snake_case_name}
 */
export function isValidFlagName(name: string): boolean {
  const pattern =
    /^(ui|backend|admin|integration|experiment|ops)\.[a-z][a-z0-9_]*$/;
  return pattern.test(name);
}

/**
 * Get flag names grouped by category.
 */
export function getFlagNamesByCategory(): Record<FlagCategory, string[]> {
  const result: Record<FlagCategory, string[]> = {
    ui: [],
    backend: [],
    admin: [],
    integration: [],
    experiment: [],
    ops: [],
  };

  for (const category of FLAG_CATEGORIES) {
    const categoryFlags = FEATURE_FLAGS[category];
    if (categoryFlags) {
      result[category] = Object.values(categoryFlags).map(
        (f) => (f as FeatureFlagDefinition).name,
      );
    }
  }

  return result;
}

// ============================================================================
// Legacy Compatibility - Map old flag names to new names
// ============================================================================

/**
 * Map of old flag names to new dot-based names.
 * Used for migration from old naming convention.
 */
export const LEGACY_FLAG_NAME_MAP: Record<string, string> = {
  // Old name -> New name
  rbac_enforcement: "backend.rbac_enforcement",
  rbac_strict_mode: "backend.rbac_strict_mode",
  metrics_enabled: "ops.metrics_enabled",
  tracing_enabled: "ops.tracing_enabled",
  logging_verbose: "ops.verbose_logging",
  nextcloud_integration: "integration.nextcloud",
  openai_enabled: "integration.openai",
  nextcloud_auto_index: "integration.nextcloud_auto_index",
  rag_strategy: "backend.rag_strategy",
  rag_max_results: "backend.rag_max_results",
  rag_score_threshold: "backend.rag_score_threshold",
  cache_enabled: "backend.cache_enabled",
  async_indexing: "backend.async_indexing",
  beta_features: "ui.beta_features",
  experimental_api: "experiment.experimental_api",
};

/**
 * Resolve a flag name, handling legacy names.
 * @param name Flag name (old or new format)
 * @param warn Whether to emit a deprecation warning for legacy names
 * @returns Resolved flag name in new format
 */
export function resolveFlagName(name: string, warn: boolean = false): string {
  // If it's already in new format, return as-is
  if (name.includes(".")) {
    return name;
  }

  // Check if it's a legacy name
  const newName = LEGACY_FLAG_NAME_MAP[name];
  if (newName) {
    if (warn && typeof console !== "undefined") {
      console.warn(
        `[DEPRECATION] Feature flag '${name}' is deprecated. ` +
          `Use '${newName}' instead. ` +
          `Legacy flag names will be removed in a future release.`,
      );
    }
    return newName;
  }

  return name;
}

/**
 * Get a flag definition, warning if using a deprecated name.
 *
 * This is the preferred method for accessing flags as it handles
 * legacy name resolution and deprecation warnings.
 *
 * @param name Flag name (old or new format)
 * @returns Flag definition or undefined if not found
 */
export function getFlagWithDeprecationCheck(
  name: string,
): FeatureFlagDefinition | undefined {
  const resolvedName = resolveFlagName(name, true);
  return getFlagByName(resolvedName);
}

/**
 * Check if a flag name is deprecated (using legacy naming).
 * @param name Flag name to check
 * @returns true if the name is a legacy name that has been remapped
 */
export function isDeprecatedFlagName(name: string): boolean {
  return !name.includes(".") && name in LEGACY_FLAG_NAME_MAP;
}
