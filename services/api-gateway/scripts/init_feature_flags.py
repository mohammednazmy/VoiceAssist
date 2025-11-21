"""Initialize default feature flags (Phase 7 - P3.1).

This script creates the default feature flags for the VoiceAssist system.
Run this after database migrations to populate initial feature flags.

Usage:
    python scripts/init_feature_flags.py
"""
import sys
import asyncio
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.feature_flags import feature_flag_service
from app.models.feature_flag import FeatureFlagType
from app.core.feature_flags import FeatureFlags
from app.core.logging import get_logger

logger = get_logger(__name__)


# Default feature flags to create
DEFAULT_FLAGS = [
    # RBAC Features
    {
        "name": FeatureFlags.RBAC_ENFORCEMENT,
        "description": "Enable RBAC permission checks on admin endpoints",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "security", "criticality": "high"}
    },
    {
        "name": FeatureFlags.RBAC_STRICT_MODE,
        "description": "Enable strict RBAC mode (deny by default)",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": False,
        "default_value": False,
        "metadata": {"category": "security", "criticality": "medium"}
    },

    # Observability Features
    {
        "name": FeatureFlags.METRICS_ENABLED,
        "description": "Enable Prometheus metrics collection",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "observability", "criticality": "medium"}
    },
    {
        "name": FeatureFlags.TRACING_ENABLED,
        "description": "Enable OpenTelemetry distributed tracing",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "observability", "criticality": "medium"}
    },
    {
        "name": FeatureFlags.LOGGING_VERBOSE,
        "description": "Enable verbose logging (debug level)",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": False,
        "default_value": False,
        "metadata": {"category": "observability", "criticality": "low"}
    },

    # External Integrations
    {
        "name": FeatureFlags.NEXTCLOUD_INTEGRATION,
        "description": "Enable Nextcloud integration features",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "integrations", "criticality": "high"}
    },
    {
        "name": FeatureFlags.OPENAI_ENABLED,
        "description": "Enable OpenAI API for RAG queries",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "integrations", "criticality": "high"}
    },
    {
        "name": FeatureFlags.NEXTCLOUD_AUTO_INDEX,
        "description": "Enable automatic indexing of Nextcloud files",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "integrations", "criticality": "medium"}
    },

    # RAG Features
    {
        "name": FeatureFlags.RAG_STRATEGY,
        "description": "RAG query strategy (simple, multi_hop, hybrid)",
        "flag_type": FeatureFlagType.STRING,
        "enabled": True,
        "value": "simple",
        "default_value": "simple",
        "metadata": {"category": "rag", "criticality": "high", "allowed_values": ["simple", "multi_hop", "hybrid"]}
    },
    {
        "name": FeatureFlags.RAG_MAX_RESULTS,
        "description": "Maximum number of RAG search results to return",
        "flag_type": FeatureFlagType.NUMBER,
        "enabled": True,
        "value": 5,
        "default_value": 5,
        "metadata": {"category": "rag", "criticality": "medium", "min": 1, "max": 20}
    },
    {
        "name": FeatureFlags.RAG_SCORE_THRESHOLD,
        "description": "Minimum similarity score threshold for RAG results",
        "flag_type": FeatureFlagType.NUMBER,
        "enabled": True,
        "value": 0.2,
        "default_value": 0.2,
        "metadata": {"category": "rag", "criticality": "medium", "min": 0.0, "max": 1.0}
    },

    # Performance Features
    {
        "name": FeatureFlags.CACHE_ENABLED,
        "description": "Enable multi-level caching (L1/L2)",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "performance", "criticality": "medium"}
    },
    {
        "name": FeatureFlags.ASYNC_INDEXING,
        "description": "Enable asynchronous document indexing",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": True,
        "default_value": True,
        "metadata": {"category": "performance", "criticality": "medium"}
    },

    # Experimental Features
    {
        "name": FeatureFlags.BETA_FEATURES,
        "description": "Enable beta/experimental features",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": False,
        "default_value": False,
        "metadata": {"category": "experimental", "criticality": "low"}
    },
    {
        "name": FeatureFlags.EXPERIMENTAL_API,
        "description": "Enable experimental API endpoints",
        "flag_type": FeatureFlagType.BOOLEAN,
        "enabled": False,
        "default_value": False,
        "metadata": {"category": "experimental", "criticality": "low"}
    },
]


async def init_feature_flags():
    """Initialize default feature flags."""
    logger.info("Starting feature flag initialization...")

    created_count = 0
    skipped_count = 0
    error_count = 0

    for flag_config in DEFAULT_FLAGS:
        try:
            # Check if flag already exists
            existing = await feature_flag_service.get_flag(flag_config["name"])

            if existing:
                logger.info(f"Feature flag '{flag_config['name']}' already exists, skipping")
                skipped_count += 1
                continue

            # Create flag
            flag = await feature_flag_service.create_flag(**flag_config)

            if flag:
                logger.info(f"Created feature flag: {flag_config['name']}")
                created_count += 1
            else:
                logger.error(f"Failed to create feature flag: {flag_config['name']}")
                error_count += 1

        except Exception as e:
            logger.error(f"Error creating feature flag '{flag_config['name']}': {e}", exc_info=True)
            error_count += 1

    logger.info(
        f"Feature flag initialization complete: "
        f"{created_count} created, {skipped_count} skipped, {error_count} errors"
    )

    return created_count, skipped_count, error_count


if __name__ == "__main__":
    # Run initialization
    created, skipped, errors = asyncio.run(init_feature_flags())

    # Exit with error code if there were errors
    if errors > 0:
        sys.exit(1)
    else:
        print(f"\n✅ Feature flag initialization successful!")
        print(f"   - Created: {created}")
        print(f"   - Skipped: {skipped}")
        print(f"   - Errors: {errors}")
        sys.exit(0)
