"""Feature Flag Shared Definitions (Phase 7 Enhancement).

Single source of truth for feature flag definitions in Python.
These definitions must match the TypeScript definitions in packages/types/src/featureFlags.ts.

Naming Convention: {category}.{feature_name}
- category: ui | backend | admin | integration | experiment | ops
- feature_name: snake_case identifier

Example: ui.unified_chat_voice, backend.rag_strategy, ops.maintenance_mode
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

# ============================================================================
# Type Definitions
# ============================================================================


class FlagCategory(str, Enum):
    """Unified categories for feature flags.

    Must match TypeScript FLAG_CATEGORIES exactly.
    """

    UI = "ui"
    BACKEND = "backend"
    ADMIN = "admin"
    INTEGRATION = "integration"
    EXPERIMENT = "experiment"
    OPS = "ops"


class FlagType(str, Enum):
    """Feature flag value types."""

    BOOLEAN = "boolean"
    STRING = "string"
    NUMBER = "number"
    JSON = "json"
    MULTIVARIATE = "multivariate"


@dataclass
class FlagDependencies:
    """Feature flag dependencies for impact analysis."""

    services: List[str] = field(default_factory=list)
    components: List[str] = field(default_factory=list)
    other_flags: List[str] = field(default_factory=list)


@dataclass
class FlagMetadata:
    """Feature flag metadata."""

    criticality: Literal["low", "medium", "high", "critical"]
    owner: Optional[str] = None
    docs_url: Optional[str] = None
    deprecated: bool = False
    deprecated_message: Optional[str] = None
    archived: bool = False
    allowed_values: Optional[List[str]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None


@dataclass
class FeatureFlagDefinition:
    """Complete feature flag definition."""

    name: str
    description: str
    category: FlagCategory
    flag_type: FlagType
    default_value: Any
    default_enabled: bool
    metadata: FlagMetadata
    dependencies: FlagDependencies = field(default_factory=FlagDependencies)


# ============================================================================
# Feature Flag Definitions - Single Source of Truth
# ============================================================================

FEATURE_FLAGS: Dict[str, Dict[str, FeatureFlagDefinition]] = {
    # -------------------------------------------------------------------------
    # UI Flags - Frontend toggles
    # -------------------------------------------------------------------------
    "ui": {
        "unified_chat_voice": FeatureFlagDefinition(
            name="ui.unified_chat_voice",
            description="Enable unified chat and voice interface",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/admin/feature-flags#ui",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["VoiceChat", "ChatInterface", "UnifiedChatContainer"],
            ),
        ),
        "new_navigation": FeatureFlagDefinition(
            name="ui.new_navigation",
            description="Enable new sidebar navigation layout",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["web-app", "admin-panel"],
                components=["Sidebar", "Navigation"],
            ),
        ),
        "beta_features": FeatureFlagDefinition(
            name="ui.beta_features",
            description="Enable beta/experimental UI features",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(services=["web-app"]),
        ),
        "dark_mode": FeatureFlagDefinition(
            name="ui.dark_mode",
            description="Enable dark mode theme option",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=True,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["web-app", "admin-panel"],
                components=["ThemeProvider", "SettingsPanel"],
            ),
        ),
        # =====================================================================
        # Voice Mode v4 UI Flags - Workstream 5: UI Enhancements
        # =====================================================================
        "voice_v4_voice_first_ui": FeatureFlagDefinition(
            name="ui.voice_v4_voice_first_ui",
            description="[Workstream 5] Voice-first unified input bar with seamless voice/text switching.",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/ui-components",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["VoiceFirstInputBar", "VoiceModePanel"],
            ),
        ),
        "voice_v4_streaming_text": FeatureFlagDefinition(
            name="ui.voice_v4_streaming_text",
            description="[Workstream 5] Streaming text display synchronized with TTS playback for accessibility.",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/streaming-text-display",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["StreamingTextDisplay"],
            ),
        ),
        "voice_v4_latency_indicator": FeatureFlagDefinition(
            name="ui.voice_v4_latency_indicator",
            description="[Workstream 5] Latency status indicator showing E2E timing and degradation tooltips.",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/latency-budgets-guide",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["LatencyIndicator"],
                other_flags=["backend.voice_v4_latency_budgets"],
            ),
        ),
        "voice_v4_thinking_feedback_panel": FeatureFlagDefinition(
            name="ui.voice_v4_thinking_feedback_panel",
            description="[Workstream 5] Audio/visual/haptic feedback during AI processing.",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/thinking-tone-settings",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["ThinkingFeedbackPanel", "ThinkingVisualIndicator"],
                other_flags=["backend.voice_v4_thinking_tones"],
            ),
        ),
        "voice_v4_rtl_ui": FeatureFlagDefinition(
            name="ui.voice_v4_rtl_ui",
            description="[Workstream 4] RTL layout and text direction for Arabic, Urdu, and Hebrew chat messages.",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/rtl-support-guide",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["ChatMessage", "ChatContainer"],
                other_flags=["backend.voice_v4_rtl_support"],
            ),
        ),
    },
    # -------------------------------------------------------------------------
    # Backend Flags - API/service behavior
    # -------------------------------------------------------------------------
    "backend": {
        "rbac_enforcement": FeatureFlagDefinition(
            name="backend.rbac_enforcement",
            description="Enable RBAC permission checks on admin endpoints",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="high", owner="security-team"),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.rbac_strict_mode"],
            ),
        ),
        "rbac_strict_mode": FeatureFlagDefinition(
            name="backend.rbac_strict_mode",
            description="Enable strict RBAC mode (deny by default)",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="medium", owner="security-team"),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.rbac_enforcement"],
            ),
        ),
        "rag_strategy": FeatureFlagDefinition(
            name="backend.rag_strategy",
            description="RAG query strategy (simple, multi_hop, hybrid)",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.STRING,
            default_value="simple",
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="high",
                allowed_values=["simple", "multi_hop", "hybrid"],
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "rag_max_results": FeatureFlagDefinition(
            name="backend.rag_max_results",
            description="Maximum number of RAG search results to return",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=5,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium", min_value=1, max_value=20),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "rag_score_threshold": FeatureFlagDefinition(
            name="backend.rag_score_threshold",
            description="Minimum similarity score threshold for RAG results",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=0.2,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium", min_value=0.0, max_value=1.0),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "cache_enabled": FeatureFlagDefinition(
            name="backend.cache_enabled",
            description="Enable multi-level caching (L1/L2)",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "async_indexing": FeatureFlagDefinition(
            name="backend.async_indexing",
            description="Enable asynchronous document indexing",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        # =====================================================================
        # Voice Mode v4 Feature Flags - Grouped by Workstream
        # =====================================================================
        #
        # Workstream 1: Translation & Multilingual RAG
        # ---------------------------------------------------------------------
        "voice_v4_translation_fallback": FeatureFlagDefinition(
            name="backend.voice_v4_translation_fallback",
            description="[Workstream 1] Multi-provider translation with fallback and caching.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/multilingual-rag-architecture",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
            ),
        ),
        "voice_v4_multilingual_rag": FeatureFlagDefinition(
            name="backend.voice_v4_multilingual_rag",
            description="[Workstream 1] Translate-then-retrieve pipeline for non-English queries.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/multilingual-rag-architecture",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_translation_fallback"],
            ),
        ),
        #
        # Workstream 2: Audio & Speech Processing
        # ---------------------------------------------------------------------
        "voice_backchanneling": FeatureFlagDefinition(
            name="backend.voice_backchanneling",
            description=(
                "[Voice] Enable backchanneling/filler phrases during voice conversations. "
                "When enabled, the assistant will use natural verbal cues like 'Yes', 'Uh-huh', "
                "'I see', etc. to indicate active listening. Disable to remove filler phrases."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/backchanneling",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["BackchannelService", "VoicePipelineService"],
            ),
        ),
        "voice_v4_lexicon_service": FeatureFlagDefinition(
            name="backend.voice_v4_lexicon_service",
            description="[Workstream 2] Medical pronunciation lexicons for 15 languages with espeak-ng G2P fallback.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/lexicon-service-guide",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_phi_routing": FeatureFlagDefinition(
            name="backend.voice_v4_phi_routing",
            description="[Workstream 2] PHI-aware STT routing to local Whisper or cloud.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="high",
                owner="security-team",
                docs_url="https://assistdocs.asimo.io/voice/phi-aware-stt-routing",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_adaptive_vad": FeatureFlagDefinition(
            name="backend.voice_v4_adaptive_vad",
            description="[Workstream 2] User-tunable VAD presets for different environments.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/adaptive-vad-presets",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["VADSettings"],
            ),
        ),
        "voice_v4_audio_processing": FeatureFlagDefinition(
            name="backend.voice_v4_audio_processing",
            description="[Workstream 2] Audio preprocessing pipeline with AEC, AGC, and noise suppression.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/audio-processing-pipeline",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
            ),
        ),
        "voice_v4_local_whisper": FeatureFlagDefinition(
            name="backend.voice_v4_local_whisper",
            description="[Workstream 2] Local Whisper STT for PHI-safe on-premise transcription.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="high",
                owner="security-team",
                docs_url="https://assistdocs.asimo.io/voice/local-whisper-stt",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_phi_routing"],
            ),
        ),
        "voice_v4_language_detection": FeatureFlagDefinition(
            name="backend.voice_v4_language_detection",
            description="[Workstream 2] Real-time language detection and code-switching support.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/language-detection",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_multilingual_rag"],
            ),
        ),
        #
        # Workstream 3: Performance & Orchestration
        # ---------------------------------------------------------------------
        "voice_v4_latency_budgets": FeatureFlagDefinition(
            name="backend.voice_v4_latency_budgets",
            description="[Workstream 3] Latency-aware orchestration with graceful degradation.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/latency-budgets-guide",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_thinking_tones": FeatureFlagDefinition(
            name="backend.voice_v4_thinking_tones",
            description="[Workstream 3] Backend events for thinking feedback indicators.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/thinking-tone-settings",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["ThinkingFeedbackPanel", "ThinkingTonePlayer"],
            ),
        ),
        "voice_v4_unified_memory": FeatureFlagDefinition(
            name="backend.voice_v4_unified_memory",
            description="[Workstream 3] Unified memory shared between voice and text modes.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/unified-memory",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_tts_cache": FeatureFlagDefinition(
            name="backend.voice_v4_tts_cache",
            description="[Workstream 3] Multi-level TTS caching with L1 memory and L2 Redis.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/tts-cache-service",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_fallback_orchestration": FeatureFlagDefinition(
            name="backend.voice_v4_fallback_orchestration",
            description="[Workstream 3] Automatic failover with circuit breakers for voice providers.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="high",
                docs_url="https://assistdocs.asimo.io/voice/fallback-orchestration",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_latency_budgets"],
            ),
        ),
        #
        # Workstream 4: Internationalization
        # ---------------------------------------------------------------------
        "voice_v4_rtl_support": FeatureFlagDefinition(
            name="backend.voice_v4_rtl_support",
            description="[Workstream 4] RTL text rendering and layout for Arabic, Urdu, and Hebrew in chat UI.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/rtl-support-guide",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                other_flags=["backend.voice_v4_multilingual_rag"],
            ),
        ),
        #
        # Phase 3: Advanced Services
        # ---------------------------------------------------------------------
        "voice_v4_fhir_streaming": FeatureFlagDefinition(
            name="backend.voice_v4_fhir_streaming",
            description="[Phase 3] Real-time FHIR data streaming for clinical context enrichment.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="high",
                owner="clinical-team",
                docs_url="https://assistdocs.asimo.io/voice/fhir-streaming",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_phi_routing"],
            ),
        ),
        "voice_v4_speaker_diarization": FeatureFlagDefinition(
            name="backend.voice_v4_speaker_diarization",
            description="[Phase 3] Multi-speaker detection and attribution for conversations.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/speaker-diarization",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_adaptive_quality": FeatureFlagDefinition(
            name="backend.voice_v4_adaptive_quality",
            description="[Phase 3] Adapt voice quality based on connection speed and latency.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/adaptive-quality",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                other_flags=["backend.voice_v4_latency_budgets"],
            ),
        ),
        "voice_v4_parallel_stt": FeatureFlagDefinition(
            name="backend.voice_v4_parallel_stt",
            description="[Phase 2] Parallel multi-provider STT with confidence-based selection.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/parallel-stt",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_language_detection"],
            ),
        ),
        "voice_v4_unified_orchestration": FeatureFlagDefinition(
            name="backend.voice_v4_unified_orchestration",
            description="[Phase 2] Unified voice pipeline orchestrator for v4 services.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="high",
                docs_url="https://assistdocs.asimo.io/voice/unified-orchestration",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=[
                    "backend.voice_v4_audio_processing",
                    "backend.voice_v4_phi_routing",
                    "backend.voice_v4_tts_cache",
                ],
            ),
        ),
        "voice_v4_code_switching": FeatureFlagDefinition(
            name="backend.voice_v4_code_switching",
            description="[Phase 2] Mid-sentence language switching detection and handling.",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/code-switching",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_language_detection"],
            ),
        ),
        #
        # WebSocket Latency Optimization Flags
        # ---------------------------------------------------------------------
        "voice_ws_audio_prebuffering": FeatureFlagDefinition(
            name="backend.voice_ws_audio_prebuffering",
            description=(
                "[WS Latency] Enable audio pre-buffering before playback starts. "
                "Buffers a minimum number of audio chunks to prevent choppy playback "
                "on networks with jitter. Default buffer: 3 chunks (~150ms)."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-latency-optimization",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useTTAudioPlayback", "VoicePipelineSession"],
            ),
        ),
        "voice_ws_compression": FeatureFlagDefinition(
            name="backend.voice_ws_compression",
            description=(
                "[WS Latency] Enable WebSocket permessage-deflate compression. "
                "Reduces bandwidth for text messages (transcripts, events) by 15-30%. "
                "Note: Binary audio frames are not compressed as they are already efficient."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-latency-optimization",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "VoicePipelineSession"],
            ),
        ),
        "voice_ws_adaptive_chunking": FeatureFlagDefinition(
            name="backend.voice_ws_adaptive_chunking",
            description=(
                "[WS Latency] Enable adaptive audio chunk sizing based on network metrics. "
                "Adjusts chunk size dynamically: smaller chunks (1024 samples) for good networks "
                "to reduce latency, larger chunks (4096 samples) for poor networks to reduce overhead."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-latency-optimization",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "VoicePipelineSession"],
            ),
        ),
        #
        # WebSocket Reliability Flags - Phase 1-3
        # ---------------------------------------------------------------------
        "voice_ws_binary_audio": FeatureFlagDefinition(
            name="backend.voice_ws_binary_audio",
            description=(
                "[WS Reliability Phase 1] Enable binary WebSocket frames for audio transmission. "
                "Sends audio as raw binary instead of base64-encoded JSON, reducing bandwidth by ~33% "
                "and CPU overhead from encoding/decoding. Includes sequence numbers for ordering."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-binary-audio",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "ThinkerTalkerWebSocketHandler"],
            ),
        ),
        "voice_ws_session_persistence": FeatureFlagDefinition(
            name="backend.voice_ws_session_persistence",
            description=(
                "[WS Reliability Phase 2] Enable Redis-backed session persistence for voice WebSocket sessions. "
                "Allows session state to survive brief disconnections and enables session recovery. "
                "Stores conversation context, audio buffer state, and pipeline configuration in Redis."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-session-persistence",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "ThinkerTalkerWebSocketHandler", "RedisSessionStore"],
            ),
        ),
        "voice_ws_graceful_degradation": FeatureFlagDefinition(
            name="backend.voice_ws_graceful_degradation",
            description=(
                "[WS Reliability Phase 3] Enable graceful degradation for voice WebSocket connections. "
                "Automatically reduces audio quality, increases buffering, or falls back to polling "
                "when network conditions degrade. Provides seamless experience during connectivity issues."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-graceful-degradation",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "useNetworkQuality", "VoicePipelineSession"],
                other_flags=["backend.voice_ws_adaptive_chunking"],
            ),
        ),
        #
        # WebSocket Error Recovery Flags
        # ---------------------------------------------------------------------
        "ws_session_recovery": FeatureFlagDefinition(
            name="backend.ws_session_recovery",
            description=(
                "[WS Recovery] Enable WebSocket session state persistence for reconnection. "
                "Stores session state in Redis including pipeline state, conversation context, "
                "and voice settings. Allows seamless recovery after brief disconnections."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-error-recovery",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "ThinkerTalkerWebSocketHandler"],
            ),
        ),
        "ws_message_recovery": FeatureFlagDefinition(
            name="backend.ws_message_recovery",
            description=(
                "[WS Recovery] Enable partial message recovery after disconnects. "
                "Buffers recent messages on the server and replays missed messages "
                "to clients upon reconnection. Prevents loss of transcript/response deltas."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-error-recovery",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "ThinkerTalkerWebSocketHandler"],
                other_flags=["backend.ws_session_recovery"],
            ),
        ),
        "ws_audio_checkpointing": FeatureFlagDefinition(
            name="backend.ws_audio_checkpointing",
            description=(
                "[WS Recovery] Enable audio buffer checkpointing for playback resume. "
                "Tracks confirmed audio sequence numbers and buffers unconfirmed chunks. "
                "Allows resuming audio playback from last confirmed position after reconnect."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-error-recovery",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useTTAudioPlayback", "ThinkerTalkerWebSocketHandler"],
                other_flags=["backend.ws_session_recovery"],
            ),
        ),
        #
        # WebSocket Protocol Optimization Flags
        # ---------------------------------------------------------------------
        "ws_binary_protocol": FeatureFlagDefinition(
            name="backend.ws_binary_protocol",
            description=(
                "[WS Protocol] Enable binary WebSocket protocol for all message types. "
                "Uses binary framing with MessagePack serialization instead of JSON. "
                "Reduces message size by 20-40% and improves parsing performance."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["ThinkerTalkerWebSocketHandler", "useThinkerTalkerSession"],
            ),
        ),
        "ws_message_batching": FeatureFlagDefinition(
            name="backend.ws_message_batching",
            description=(
                "[WS Protocol] Enable message batching for WebSocket communication. "
                "Groups multiple small messages into batched frames to reduce overhead. "
                "Configurable batch window (default 50ms) and max batch size (default 10)."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["ThinkerTalkerWebSocketHandler", "WebSocketMessageBatcher"],
            ),
        ),
        #
        # WebSocket Advanced Features Flags
        # ---------------------------------------------------------------------
        "ws_webrtc_fallback": FeatureFlagDefinition(
            name="backend.ws_webrtc_fallback",
            description=(
                "[WS Advanced] Enable WebRTC data channel as transport fallback. "
                "WebRTC provides 20-50ms lower latency than WebSocket due to UDP "
                "transport. Falls back to WebSocket if WebRTC negotiation fails."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["TransportManager", "WebRTCTransport", "ThinkerTalkerWebSocketHandler"],
            ),
        ),
        "ws_webrtc_prefer": FeatureFlagDefinition(
            name="backend.ws_webrtc_prefer",
            description=(
                "[WS Advanced] Prefer WebRTC transport over WebSocket when available. "
                "When enabled, the client will attempt WebRTC first and only fall back "
                "to WebSocket if WebRTC is not supported or negotiation fails."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["TransportManager", "WebRTCTransport"],
                other_flags=["backend.ws_webrtc_fallback"],
            ),
        ),
        "ws_adaptive_bitrate": FeatureFlagDefinition(
            name="backend.ws_adaptive_bitrate",
            description=(
                "[WS Advanced] Enable adaptive audio bitrate based on network quality. "
                "Dynamically adjusts audio codec and bitrate: PCM16 (256kbps) for excellent "
                "networks, Opus 24k for good networks, Opus 12k for poor networks."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["AdaptiveBitrateController", "AudioEncoder", "AudioDecoder"],
            ),
        ),
        "ws_adaptive_bitrate_aggressive": FeatureFlagDefinition(
            name="backend.ws_adaptive_bitrate_aggressive",
            description=(
                "[WS Advanced] Enable aggressive adaptive bitrate switching. "
                "Reduces hysteresis for quality changes, allowing faster adaptation "
                "to network conditions at the cost of more frequent codec switches."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["AdaptiveBitrateController"],
                other_flags=["backend.ws_adaptive_bitrate"],
            ),
        ),
        "ws_aec_feedback": FeatureFlagDefinition(
            name="backend.ws_aec_feedback",
            description=(
                "[WS Advanced] Enable echo cancellation feedback loop from client to server. "
                "Client reports AEC metrics (residual echo level, AEC state, output energy) "
                "to server for intelligent VAD sensitivity adjustment during TTS playback."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["AECMonitor", "AECFeedbackProcessor", "useTTAudioPlayback"],
            ),
        ),
        "ws_aec_barge_gate": FeatureFlagDefinition(
            name="backend.ws_aec_barge_gate",
            description=(
                "[WS Advanced] Gate barge-in based on AEC state. "
                "Temporarily disables barge-in during TTS playback when echo is detected, "
                "preventing the AI from 'hearing' its own output as user speech."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/websocket-advanced-features",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["AECFeedbackProcessor", "VoicePipelineSession"],
                other_flags=["backend.ws_aec_feedback"],
            ),
        ),
        #
        # Natural Conversation Flow Flags
        # ---------------------------------------------------------------------
        "voice_queue_overflow_protection": FeatureFlagDefinition(
            name="backend.voice_queue_overflow_protection",
            description=(
                "[Natural Conversation Phase 1] Enable audio queue overflow protection. "
                "Enforces MAX_QUEUE_DURATION_MS (1000ms) limit on audio queue to prevent "
                "runaway accumulation. Automatically trims old chunks when queue exceeds limit."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useTTAudioPlayback"],
            ),
        ),
        "voice_schedule_watchdog": FeatureFlagDefinition(
            name="backend.voice_schedule_watchdog",
            description=(
                "[Natural Conversation Phase 1] Enable scheduling watchdog for audio playback. "
                "Runs every 500ms to detect stuck schedules and queue overflow. "
                "Automatically resets schedule if stuck more than 2x lookahead ahead."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useTTAudioPlayback"],
                other_flags=["backend.voice_queue_overflow_protection"],
            ),
        ),
        "voice_intelligent_barge_in": FeatureFlagDefinition(
            name="backend.voice_intelligent_barge_in",
            description=(
                "[Natural Conversation Phase 2] Enable intelligent barge-in classification. "
                "Classifies user interruptions as backchannel, soft_barge, hard_barge, or unclear. "
                "Supports 12 languages with fuzzy matching for STT error tolerance."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=[
                    "useIntelligentBargeIn",
                    "classifyBargeIn",
                    "BargeInClassifier",
                    "ThinkerTalkerWebSocketHandler",
                ],
            ),
        ),
        "voice_instant_barge_in": FeatureFlagDefinition(
            name="backend.voice_instant_barge_in",
            description=(
                "[Natural Conversation] Enable instant barge-in using Deepgram SpeechStarted event. "
                "Immediately stops AI audio on any detected speech, reducing barge-in latency from "
                "200-300ms to <50ms. Uses rapid audio fade-out (50ms) for smooth transition."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "useTTAudioPlayback", "ThinkerTalkerWebSocketHandler"],
            ),
        ),
        "voice_continuation_detection": FeatureFlagDefinition(
            name="backend.voice_continuation_detection",
            description=(
                "[Natural Conversation] Enable continuation detection for natural pauses. "
                "Analyzes speech patterns (trailing words, filler words, prosody) to predict when "
                "user intends to continue speaking. Dynamically extends silence threshold."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["SilencePredictor", "ContinuationDetector"],
            ),
        ),
        "voice_utterance_aggregation": FeatureFlagDefinition(
            name="backend.voice_utterance_aggregation",
            description=(
                "[Natural Conversation] Enable multi-segment utterance aggregation. "
                "Accumulates speech segments within a time window and merges them into coherent "
                "queries before sending to Thinker. Prevents loss of context when user speaks in fragments."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["UtteranceAggregator", "UtteranceWindowManager", "ThinkerTalkerWebSocketHandler"],
                other_flags=["backend.voice_continuation_detection"],
            ),
        ),
        "voice_preemptive_listening": FeatureFlagDefinition(
            name="backend.voice_preemptive_listening",
            description=(
                "[Natural Conversation] Keep STT active during AI speech for faster barge-in. "
                "Buffers incoming transcripts during AI playback so transcript is immediately "
                "available when barge-in is confirmed. Reduces response delay after interruption."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["useThinkerTalkerSession", "VoicePipelineSession"],
                other_flags=["backend.voice_instant_barge_in"],
            ),
        ),
        "voice_aggregation_window_ms": FeatureFlagDefinition(
            name="backend.voice_aggregation_window_ms",
            description=(
                "[Natural Conversation] Maximum time (ms) to wait for speech continuation. "
                "After silence is detected, waits this long for user to resume before processing. "
                "Longer values allow more natural pauses but increase response latency."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=3000,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=1000,
                max_value=10000,
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["UtteranceAggregator"],
                other_flags=["backend.voice_utterance_aggregation"],
            ),
        ),
        "voice_min_barge_in_confidence": FeatureFlagDefinition(
            name="backend.voice_min_barge_in_confidence",
            description=(
                "[Natural Conversation] Minimum VAD confidence (0-1) to trigger barge-in. "
                "Lower values make barge-in more sensitive (may cause false triggers). "
                "Higher values require stronger speech signal (may miss quiet interruptions)."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=0.3,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=0.0,
                max_value=1.0,
                docs_url="https://assistdocs.asimo.io/voice/natural-conversation-flow",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["OverlapHandler", "BargeInClassifier"],
                other_flags=["backend.voice_instant_barge_in"],
            ),
        ),
        #
        # Silero VAD Enhancement Flags (Local Browser-Side VAD)
        # ---------------------------------------------------------------------
        "voice_silero_vad_enabled": FeatureFlagDefinition(
            name="backend.voice_silero_vad_enabled",
            description=(
                "[Silero VAD] Master toggle for local Silero VAD in browser. "
                "Silero VAD is a neural network-based voice activity detector that runs "
                "in the browser via ONNX Runtime. Provides more accurate speech detection "
                "than simple RMS thresholds, enabling reliable barge-in during AI speech."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD", "useThinkerTalkerVoiceMode"],
            ),
        ),
        "voice_silero_echo_suppression_mode": FeatureFlagDefinition(
            name="backend.voice_silero_echo_suppression_mode",
            description=(
                "[Silero VAD] Echo suppression mode during AI playback. "
                "Options: 'threshold_boost' (keep VAD active with higher threshold), "
                "'pause' (pause VAD entirely during playback), 'none' (no suppression). "
                "Default: threshold_boost - keeps VAD active but requires stronger speech signal."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.STRING,
            default_value="threshold_boost",
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                allowed_values=["threshold_boost", "pause", "none"],
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD", "useThinkerTalkerVoiceMode"],
                other_flags=["backend.voice_silero_vad_enabled"],
            ),
        ),
        "voice_silero_positive_threshold": FeatureFlagDefinition(
            name="backend.voice_silero_positive_threshold",
            description=(
                "[Silero VAD] Base probability threshold (0-1) for speech detection. "
                "Higher = less sensitive (fewer false positives). "
                "Lower = more sensitive (may detect noise as speech). "
                "Default: 0.5"
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=0.5,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=0.1,
                max_value=0.9,
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=["backend.voice_silero_vad_enabled"],
            ),
        ),
        "voice_silero_playback_threshold_boost": FeatureFlagDefinition(
            name="backend.voice_silero_playback_threshold_boost",
            description=(
                "[Silero VAD] Amount to boost speech threshold during AI playback (0-0.5). "
                "Applied when echo suppression mode is 'threshold_boost'. "
                "Higher = more aggressive echo filtering (may miss quiet barge-ins). "
                "Default: 0.2 (threshold becomes 0.5 + 0.2 = 0.7 during playback)"
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=0.2,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=0.0,
                max_value=0.5,
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=[
                    "backend.voice_silero_vad_enabled",
                    "backend.voice_silero_echo_suppression_mode",
                ],
            ),
        ),
        "voice_silero_min_speech_ms": FeatureFlagDefinition(
            name="backend.voice_silero_min_speech_ms",
            description=(
                "[Silero VAD] Minimum speech duration (ms) before triggering onSpeechStart. "
                "Helps filter out short noise bursts. "
                "Higher = fewer false positives but slower detection. "
                "Default: 150"
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=150,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=50,
                max_value=500,
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=["backend.voice_silero_vad_enabled"],
            ),
        ),
        "voice_silero_playback_min_speech_ms": FeatureFlagDefinition(
            name="backend.voice_silero_playback_min_speech_ms",
            description=(
                "[Silero VAD] Minimum speech duration (ms) during AI playback to trigger barge-in. "
                "Longer duration helps filter out TTS echo bursts. "
                "Default: 200 (speech during playback must be at least 200ms to count)"
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=200,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=100,
                max_value=500,
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=[
                    "backend.voice_silero_vad_enabled",
                    "backend.voice_silero_echo_suppression_mode",
                ],
            ),
        ),
        #
        # Phase 3: Adaptive VAD Flags
        # ---------------------------------------------------------------------
        "voice_silero_adaptive_threshold": FeatureFlagDefinition(
            name="backend.voice_silero_adaptive_threshold",
            description=(
                "[Silero VAD Phase 3] Enable adaptive VAD threshold based on ambient noise. "
                "When enabled, VAD monitors background noise during silence and adjusts "
                "the speech detection threshold dynamically for better accuracy."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=["backend.voice_silero_vad_enabled"],
            ),
        ),
        "voice_silero_noise_calibration_ms": FeatureFlagDefinition(
            name="backend.voice_silero_noise_calibration_ms",
            description=(
                "[Silero VAD Phase 3] Duration (ms) to measure ambient noise at startup. "
                "Longer calibration provides more accurate noise profile but delays voice mode activation."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=1000,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=500,
                max_value=3000,
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=[
                    "backend.voice_silero_vad_enabled",
                    "backend.voice_silero_adaptive_threshold",
                ],
            ),
        ),
        "voice_silero_noise_adaptation_factor": FeatureFlagDefinition(
            name="backend.voice_silero_noise_adaptation_factor",
            description=(
                "[Silero VAD Phase 3] How much to adjust threshold per unit of noise (0-0.3). "
                "Higher values make threshold adjustment more aggressive in noisy environments."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=0.1,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=0.0,
                max_value=0.3,
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useSileroVAD"],
                other_flags=[
                    "backend.voice_silero_vad_enabled",
                    "backend.voice_silero_adaptive_threshold",
                ],
            ),
        ),
        "voice_silero_vad_confidence_sharing": FeatureFlagDefinition(
            name="backend.voice_silero_vad_confidence_sharing",
            description=(
                "[Silero VAD Phase 2] Enable frontend-to-backend VAD confidence sharing. "
                "When enabled, frontend streams VAD state to backend for hybrid decision making."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/silero-vad",
            ),
            dependencies=FlagDependencies(
                services=["web-app", "api-gateway"],
                components=["useSileroVAD", "useThinkerTalkerSession", "voice_pipeline_service"],
                other_flags=["backend.voice_silero_vad_enabled"],
            ),
        ),
        #
        # Audio Quality Enhancement Flags
        # ---------------------------------------------------------------------
        "voice_crisp_quality_preset": FeatureFlagDefinition(
            name="backend.voice_crisp_quality_preset",
            description=(
                "[Audio Quality] Enable CRISP quality preset for highest audio quality. "
                "Uses larger text chunks, higher TTS stability, and optimized SSML pauses. "
                "Slightly higher latency (~350-450ms TTFA) but eliminates choppiness."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/audio-quality-presets",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["TalkerService", "useTTAudioPlayback", "VoiceSettings"],
            ),
        ),
        "voice_high_quality_tts_model": FeatureFlagDefinition(
            name="backend.voice_high_quality_tts_model",
            description=(
                "[Audio Quality] Use eleven_turbo_v2_5 instead of eleven_flash_v2_5. "
                "Turbo model provides better prosody and voice quality at ~50ms higher latency. "
                "Recommended for CRISP preset."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/audio-quality-presets",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["ElevenLabsService", "TalkerService"],
            ),
        ),
        "voice_audio_crossfade": FeatureFlagDefinition(
            name="backend.voice_audio_crossfade",
            description=(
                "[Audio Quality] Enable crossfade between audio chunks for seamless playback. "
                "Applies a 5-10ms crossfade at chunk boundaries to eliminate pops/clicks. "
                "Works best with CRISP preset and larger audio chunks."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/audio-quality-presets",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useTTAudioPlayback", "AudioWorkletProcessor"],
            ),
        ),
        "voice_enhanced_prebuffering": FeatureFlagDefinition(
            name="backend.voice_enhanced_prebuffering",
            description=(
                "[Audio Quality] Increase pre-buffer from 3 to 5 audio chunks (~250ms). "
                "Provides more buffer against network jitter at cost of slightly higher "
                "initial latency. Recommended for CRISP preset."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/audio-quality-presets",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["useTTAudioPlayback"],
                other_flags=["backend.voice_ws_audio_prebuffering"],
            ),
        ),
        "voice_default_quality_preset": FeatureFlagDefinition(
            name="backend.voice_default_quality_preset",
            description=(
                "[Audio Quality] Default quality preset for voice mode. "
                "Options: 'speed', 'balanced', 'natural', 'crisp'. "
                "Determines chunk sizes, TTS parameters, and audio processing."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.STRING,
            default_value="balanced",
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="medium",
                allowed_values=["speed", "balanced", "natural", "crisp"],
                docs_url="https://assistdocs.asimo.io/voice/audio-quality-presets",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["TalkerService", "VoiceSettings"],
            ),
        ),
        #
        # Barge-In Improvement Plan v3 Flags
        # Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
        # ---------------------------------------------------------------------
        "voice_semantic_vad": FeatureFlagDefinition(
            name="backend.voice_semantic_vad",
            description=(
                "[Barge-In v3 - Workstream 1] Enable semantic VAD for thinking pause detection. "
                "Distinguishes natural 'thinking' pauses from end-of-utterance based on linguistic "
                "context (trailing conjunctions, incomplete sentences, filler words). Prevents "
                "premature AI response during user's natural speech pauses."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["SemanticVADService", "ContinuationDetector"],
                other_flags=["backend.voice_continuation_detection"],
            ),
        ),
        "voice_semantic_vad_hesitation_tolerance_ms": FeatureFlagDefinition(
            name="backend.voice_semantic_vad_hesitation_tolerance_ms",
            description=(
                "[Barge-In v3] How long to wait during hesitations (um, uh, etc.) before responding. "
                "Higher values allow more time for user to continue speaking after a hesitation marker. "
                "Lower values respond faster but may interrupt mid-thought."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=2000,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=500,
                max_value=5000,
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["SemanticVADService"],
                other_flags=["backend.voice_semantic_vad"],
            ),
        ),
        "voice_semantic_vad_completion_threshold": FeatureFlagDefinition(
            name="backend.voice_semantic_vad_completion_threshold",
            description=(
                "[Barge-In v3] Confidence threshold (0-1) for turn completion detection. "
                "Higher values require stronger completion signals before responding. "
                "Lower values respond more quickly but may interrupt more often."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.NUMBER,
            default_value=0.65,
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                min_value=0.3,
                max_value=0.95,
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["SemanticVADService"],
                other_flags=["backend.voice_semantic_vad"],
            ),
        ),
        "voice_semantic_vad_use_llm_assist": FeatureFlagDefinition(
            name="backend.voice_semantic_vad_use_llm_assist",
            description=(
                "[Barge-In v3] Use LLM to assist with turn completion detection for complex cases. "
                "When enabled, sends ambiguous transcripts to LLM for intent analysis. "
                "Improves accuracy but adds latency (~100-200ms)."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["SemanticVADService", "ThinkerService"],
                other_flags=["backend.voice_semantic_vad"],
            ),
        ),
        "voice_graceful_truncation": FeatureFlagDefinition(
            name="backend.voice_graceful_truncation",
            description=(
                "[Barge-In v3 - Workstream 2] Enable graceful audio truncation at sentence boundaries. "
                "When barge-in occurs, stops TTS at the nearest sentence/clause boundary rather than "
                "mid-word. Provides smoother interruption experience and maintains conversational flow."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["GracefulTruncationService", "TalkerService", "useTTAudioPlayback"],
                other_flags=["backend.voice_instant_barge_in"],
            ),
        ),
        "voice_speculative_continuation": FeatureFlagDefinition(
            name="backend.voice_speculative_continuation",
            description=(
                "[Barge-In v3 - Workstream 3] Enable speculative follow-up generation. "
                "Pre-generates likely follow-up responses during user speech to reduce latency. "
                "Uses context prediction to speculatively prepare TTS audio for common patterns."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["SpeculativeContinuationService", "ThinkerService"],
                other_flags=["backend.voice_v4_tts_cache"],
            ),
        ),
        "voice_duplex_stt": FeatureFlagDefinition(
            name="backend.voice_duplex_stt",
            description=(
                "[Barge-In v3 - Workstream 4] Enable parallel dual-stream STT for transcript accuracy. "
                "Runs two STT streams during barge-in: one for user speech, one for confirmation. "
                "Improves transcript accuracy by cross-referencing results and filtering echo."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                components=["DuplexSTTService", "TranscriptSyncService"],
                other_flags=["backend.voice_v4_parallel_stt"],
            ),
        ),
        "voice_barge_in_quality_preset": FeatureFlagDefinition(
            name="backend.voice_barge_in_quality_preset",
            description=(
                "[Barge-In v3 - Workstream 5] User-selectable barge-in quality preset. "
                "Options: 'responsive' (fast barge-in, may cut mid-word), "
                "'balanced' (default, sentence-aware), 'smooth' (waits for natural break). "
                "Allows users to tune barge-in behavior to their preference."
            ),
            category=FlagCategory.BACKEND,
            flag_type=FlagType.STRING,
            default_value="balanced",
            default_enabled=True,
            metadata=FlagMetadata(
                criticality="low",
                allowed_values=["responsive", "balanced", "smooth"],
                docs_url="https://assistdocs.asimo.io/voice/barge-in-improvements",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["VoiceSettings", "BargeInClassifier"],
            ),
        ),
    },
    # -------------------------------------------------------------------------
    # Admin Flags - Admin panel features
    # -------------------------------------------------------------------------
    "admin": {
        "bulk_operations": FeatureFlagDefinition(
            name="admin.bulk_operations",
            description="Enable bulk operations in admin panel",
            category=FlagCategory.ADMIN,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(
                services=["admin-panel"],
                components=["BulkActionsToolbar", "DataTable"],
            ),
        ),
        "advanced_analytics": FeatureFlagDefinition(
            name="admin.advanced_analytics",
            description="Enable advanced analytics dashboard",
            category=FlagCategory.ADMIN,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["admin-panel", "api-gateway"],
                components=["AnalyticsDashboard"],
            ),
        ),
        "audit_log_export": FeatureFlagDefinition(
            name="admin.audit_log_export",
            description="Enable audit log export functionality",
            category=FlagCategory.ADMIN,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=True,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["admin-panel", "api-gateway"],
                components=["AuditLogPanel"],
            ),
        ),
    },
    # -------------------------------------------------------------------------
    # Integration Flags - External services
    # -------------------------------------------------------------------------
    "integration": {
        "nextcloud": FeatureFlagDefinition(
            name="integration.nextcloud",
            description="Enable Nextcloud integration features",
            category=FlagCategory.INTEGRATION,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="high"),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["integration.nextcloud_auto_index"],
            ),
        ),
        "nextcloud_auto_index": FeatureFlagDefinition(
            name="integration.nextcloud_auto_index",
            description="Enable automatic indexing of Nextcloud files",
            category=FlagCategory.INTEGRATION,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["integration.nextcloud"],
            ),
        ),
        "openai": FeatureFlagDefinition(
            name="integration.openai",
            description="Enable OpenAI API for RAG queries",
            category=FlagCategory.INTEGRATION,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="high"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
    },
    # -------------------------------------------------------------------------
    # Experiment Flags - A/B tests and experiments
    # -------------------------------------------------------------------------
    "experiment": {
        "onboarding_v2": FeatureFlagDefinition(
            name="experiment.onboarding_v2",
            description="A/B test for new onboarding flow",
            category=FlagCategory.EXPERIMENT,
            flag_type=FlagType.BOOLEAN,
            default_value=None,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["OnboardingWizard"],
            ),
        ),
        "experimental_api": FeatureFlagDefinition(
            name="experiment.experimental_api",
            description="Enable experimental API endpoints",
            category=FlagCategory.EXPERIMENT,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
    },
    # -------------------------------------------------------------------------
    # Ops Flags - Operational controls
    # -------------------------------------------------------------------------
    "ops": {
        "maintenance_mode": FeatureFlagDefinition(
            name="ops.maintenance_mode",
            description="Enable maintenance mode (read-only access)",
            category=FlagCategory.OPS,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="critical", owner="ops-team"),
            dependencies=FlagDependencies(services=["api-gateway", "web-app", "admin-panel"]),
        ),
        "rate_limiting": FeatureFlagDefinition(
            name="ops.rate_limiting",
            description="Enable API rate limiting",
            category=FlagCategory.OPS,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="high"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "metrics_enabled": FeatureFlagDefinition(
            name="ops.metrics_enabled",
            description="Enable Prometheus metrics collection",
            category=FlagCategory.OPS,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "tracing_enabled": FeatureFlagDefinition(
            name="ops.tracing_enabled",
            description="Enable OpenTelemetry distributed tracing",
            category=FlagCategory.OPS,
            flag_type=FlagType.BOOLEAN,
            default_value=True,
            default_enabled=True,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "verbose_logging": FeatureFlagDefinition(
            name="ops.verbose_logging",
            description="Enable verbose logging (debug level)",
            category=FlagCategory.OPS,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
    },
}


# ============================================================================
# Helper Functions
# ============================================================================


def get_all_flags() -> List[FeatureFlagDefinition]:
    """Get all feature flag definitions as a flat list."""
    all_flags: List[FeatureFlagDefinition] = []
    for category_flags in FEATURE_FLAGS.values():
        all_flags.extend(category_flags.values())
    return all_flags


def get_flag_by_name(name: str) -> Optional[FeatureFlagDefinition]:
    """Get a flag definition by its full name.

    Args:
        name: Full flag name (e.g., "ui.unified_chat_voice")

    Returns:
        FeatureFlagDefinition or None if not found
    """
    parts = name.split(".", 1)
    if len(parts) != 2:
        return None

    category, flag_name = parts
    category_flags = FEATURE_FLAGS.get(category)
    if not category_flags:
        return None

    return category_flags.get(flag_name)


def get_flags_by_category(category: FlagCategory) -> List[FeatureFlagDefinition]:
    """Get all flag definitions for a specific category."""
    category_flags = FEATURE_FLAGS.get(category.value, {})
    return list(category_flags.values())


def is_valid_flag_name(name: str) -> bool:
    """Validate a flag name matches the naming convention.

    Pattern: {category}.{snake_case_name}
    """
    import re

    pattern = r"^(ui|backend|admin|integration|experiment|ops)\.[a-z][a-z0-9_]*$"
    return bool(re.match(pattern, name))


def get_flag_names_by_category() -> Dict[str, List[str]]:
    """Get flag names grouped by category."""
    result: Dict[str, List[str]] = {}
    for category, flags in FEATURE_FLAGS.items():
        result[category] = [flag.name for flag in flags.values()]
    return result


# ============================================================================
# Legacy Compatibility - Map old flag names to new names
# ============================================================================

LEGACY_FLAG_NAME_MAP: Dict[str, str] = {
    # Old name -> New name
    "rbac_enforcement": "backend.rbac_enforcement",
    "rbac_strict_mode": "backend.rbac_strict_mode",
    "metrics_enabled": "ops.metrics_enabled",
    "tracing_enabled": "ops.tracing_enabled",
    "logging_verbose": "ops.verbose_logging",
    "nextcloud_integration": "integration.nextcloud",
    "openai_enabled": "integration.openai",
    "nextcloud_auto_index": "integration.nextcloud_auto_index",
    "rag_strategy": "backend.rag_strategy",
    "rag_max_results": "backend.rag_max_results",
    "rag_score_threshold": "backend.rag_score_threshold",
    "cache_enabled": "backend.cache_enabled",
    "async_indexing": "backend.async_indexing",
    "beta_features": "ui.beta_features",
    "experimental_api": "experiment.experimental_api",
}


def resolve_flag_name(name: str, warn: bool = True) -> str:
    """Resolve a flag name, handling legacy names.

    Args:
        name: Flag name (old or new format)
        warn: Whether to emit a deprecation warning for legacy names

    Returns:
        Resolved flag name in new format
    """
    import warnings

    # If it's already in new format, return as-is
    if "." in name:
        return name

    # Check if it's a legacy name
    new_name = LEGACY_FLAG_NAME_MAP.get(name)
    if new_name:
        if warn:
            warnings.warn(
                f"Feature flag '{name}' is deprecated. "
                f"Use '{new_name}' instead. "
                f"Legacy flag names will be removed in a future release.",
                DeprecationWarning,
                stacklevel=3,
            )
        return new_name

    return name


def get_flag_with_deprecation_check(name: str) -> Optional[FeatureFlagDefinition]:
    """Get a flag definition, warning if using a deprecated name.

    This is the preferred method for accessing flags as it handles
    legacy name resolution and deprecation warnings.

    Args:
        name: Flag name (old or new format)

    Returns:
        FeatureFlagDefinition or None if not found
    """
    resolved_name = resolve_flag_name(name, warn=True)
    return get_flag_by_name(resolved_name)


def sync_definitions_to_database(db_session) -> Dict[str, int]:
    """Sync flag definitions to the database.

    Creates new flags for definitions that don't exist in the database.
    Does NOT update existing flags to preserve admin customizations.

    Args:
        db_session: SQLAlchemy database session

    Returns:
        Dict with counts: {"created": N, "skipped": M}
    """
    import json

    from app.models.feature_flag import FeatureFlag

    all_defs = get_all_flags()
    created = 0
    skipped = 0

    for flag_def in all_defs:
        # Check if flag already exists
        existing = db_session.query(FeatureFlag).filter(FeatureFlag.name == flag_def.name).first()

        if existing:
            skipped += 1
            continue

        # Create new flag from definition
        new_flag = FeatureFlag(
            name=flag_def.name,
            description=flag_def.description,
            flag_type=flag_def.flag_type.value,
            enabled=flag_def.default_value if flag_def.flag_type == FlagType.BOOLEAN else True,
            value=None if flag_def.flag_type == FlagType.BOOLEAN else json.dumps(flag_def.default_value),
            default_value=json.dumps(flag_def.default_value),
            rollout_percentage=100,
            environment="production",
            metadata=json.dumps(
                {
                    "category": flag_def.category.value,
                    "source": "flag_definitions",
                }
            ),
        )
        db_session.add(new_flag)
        created += 1

    db_session.commit()
    return {"created": created, "skipped": skipped}
