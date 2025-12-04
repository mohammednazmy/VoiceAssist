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
        # Voice Mode v4 UI Flags
        "voice_v4_voice_first_ui": FeatureFlagDefinition(
            name="ui.voice_v4_voice_first_ui",
            description="Enable voice-first unified input bar UI",
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
            description="Enable streaming text display during TTS playback",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["StreamingTextDisplay"],
            ),
        ),
        "voice_v4_latency_indicator": FeatureFlagDefinition(
            name="ui.voice_v4_latency_indicator",
            description="Enable voice mode latency indicator with degradation info",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["LatencyIndicator"],
            ),
        ),
        "voice_v4_thinking_feedback_panel": FeatureFlagDefinition(
            name="ui.voice_v4_thinking_feedback_panel",
            description="Enable thinking feedback panel with audio/visual/haptic options",
            category=FlagCategory.UI,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/thinking-feedback",
            ),
            dependencies=FlagDependencies(
                services=["web-app"],
                components=["ThinkingFeedbackPanel", "ThinkingVisualIndicator"],
                other_flags=["backend.voice_v4_thinking_tones"],
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
        # Voice Mode v4 Feature Flags
        "voice_v4_translation_fallback": FeatureFlagDefinition(
            name="backend.voice_v4_translation_fallback",
            description="Enable translation service with fallback and caching",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/multilingual-rag",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_multilingual_rag"],
            ),
        ),
        "voice_v4_multilingual_rag": FeatureFlagDefinition(
            name="backend.voice_v4_multilingual_rag",
            description="Enable multilingual RAG with translation layer",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/multilingual-rag",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway"],
                other_flags=["backend.voice_v4_translation_fallback"],
            ),
        ),
        "voice_v4_lexicon_service": FeatureFlagDefinition(
            name="backend.voice_v4_lexicon_service",
            description="Enable medical pronunciation lexicon service with G2P",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/tunable-vad",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_thinking_tones": FeatureFlagDefinition(
            name="backend.voice_v4_thinking_tones",
            description="Enable thinking tone audio/visual/haptic feedback",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="low",
                docs_url="https://assistdocs.asimo.io/voice/thinking-feedback",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["ThinkingFeedbackPanel", "ThinkingTonePlayer"],
            ),
        ),
        "voice_v4_latency_budgets": FeatureFlagDefinition(
            name="backend.voice_v4_latency_budgets",
            description="Enable latency-aware voice orchestration with degradation",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="medium"),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_phi_routing": FeatureFlagDefinition(
            name="backend.voice_v4_phi_routing",
            description="Enable PHI-aware STT routing with local Whisper fallback",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="high",
                owner="security-team",
                docs_url="https://assistdocs.asimo.io/voice/phi-aware-stt",
            ),
            dependencies=FlagDependencies(services=["api-gateway"]),
        ),
        "voice_v4_adaptive_vad": FeatureFlagDefinition(
            name="backend.voice_v4_adaptive_vad",
            description="Enable user-tunable adaptive VAD presets",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(
                criticality="medium",
                docs_url="https://assistdocs.asimo.io/voice/tunable-vad",
            ),
            dependencies=FlagDependencies(
                services=["api-gateway", "web-app"],
                components=["VADSettings"],
            ),
        ),
        "voice_v4_rtl_support": FeatureFlagDefinition(
            name="backend.voice_v4_rtl_support",
            description="Enable RTL language support (Arabic, Urdu, Hebrew)",
            category=FlagCategory.BACKEND,
            flag_type=FlagType.BOOLEAN,
            default_value=False,
            default_enabled=False,
            metadata=FlagMetadata(criticality="low"),
            dependencies=FlagDependencies(
                services=["web-app"],
                other_flags=["backend.voice_v4_multilingual_rag"],
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
