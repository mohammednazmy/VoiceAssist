"""Feature Flag Decorators and Utilities (Phase 7 - P3.1).

Provides convenient decorators and utilities for feature flag integration.

Usage:
    from app.core.feature_flags import require_feature, feature_gate

    @router.get("/experimental-endpoint")
    @require_feature("experimental_api", default=False)
    async def experimental_endpoint():
        return {"message": "Experimental feature"}

    @router.get("/some-endpoint")
    async def some_endpoint():
        if await feature_gate("new_algorithm"):
            # Use new algorithm
            pass
        else:
            # Use old algorithm
            pass
"""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Optional

from app.services.feature_flags import feature_flag_service
from fastapi import HTTPException, status


def require_feature(flag_name: str, default: bool = False, error_message: Optional[str] = None):
    """Decorator to require a feature flag to be enabled.

    Args:
        flag_name: Name of the feature flag
        default: Default value if flag not found
        error_message: Custom error message (optional)

    Raises:
        HTTPException: 404 if feature is disabled

    Example:
        @router.get("/beta-feature")
        @require_feature("beta_features_enabled")
        async def beta_feature():
            return {"message": "Beta feature"}
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            enabled = await feature_flag_service.is_enabled(flag_name, default=default)

            if not enabled:
                message = error_message or f"Feature '{flag_name}' is not enabled"
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)

            return await func(*args, **kwargs)

        return wrapper

    return decorator


async def feature_gate(flag_name: str, default: bool = False) -> bool:
    """Check if a feature is enabled (simple boolean check).

    Args:
        flag_name: Name of the feature flag
        default: Default value if flag not found

    Returns:
        True if feature is enabled, False otherwise

    Example:
        if await feature_gate("use_new_rag_strategy"):
            # Use new strategy
            pass
        else:
            # Use old strategy
            pass
    """
    return await feature_flag_service.is_enabled(flag_name, default=default)


async def get_feature_value(flag_name: str, default: Any = None) -> Any:
    """Get feature flag value (for non-boolean flags).

    Args:
        flag_name: Name of the feature flag
        default: Default value if flag not found

    Returns:
        Feature flag value or default

    Example:
        rag_strategy = await get_feature_value("rag_strategy", default="simple")
        max_results = await get_feature_value("max_search_results", default=10)
    """
    return await feature_flag_service.get_value(flag_name, default=default)


# Predefined feature flag constants for common features
# Phase 7 Enhancement: Using new dot-based naming convention
# Legacy names are supported via resolve_flag_name()
class FeatureFlags:
    """Constants for commonly used feature flags.

    Note: These constants use the new dot-based naming convention.
    Legacy code using old names (e.g., "rbac_enforcement") will continue
    to work via the resolve_flag_name() function in flag_definitions.py.

    Naming Convention: {category}.{feature_name}
    Categories: ui, backend, admin, integration, experiment, ops
    """

    # RBAC Features (backend category)
    RBAC_ENFORCEMENT = "backend.rbac_enforcement"
    RBAC_STRICT_MODE = "backend.rbac_strict_mode"

    # Observability Features (ops category)
    METRICS_ENABLED = "ops.metrics_enabled"
    TRACING_ENABLED = "ops.tracing_enabled"
    LOGGING_VERBOSE = "ops.verbose_logging"

    # External Integrations (integration category)
    NEXTCLOUD_INTEGRATION = "integration.nextcloud"
    OPENAI_ENABLED = "integration.openai"
    NEXTCLOUD_AUTO_INDEX = "integration.nextcloud_auto_index"

    # RAG Features (backend category)
    RAG_STRATEGY = "backend.rag_strategy"  # Value: "simple", "multi_hop", "hybrid"
    RAG_MAX_RESULTS = "backend.rag_max_results"  # Value: integer
    RAG_SCORE_THRESHOLD = "backend.rag_score_threshold"  # Value: float

    # Performance Features (backend category)
    CACHE_ENABLED = "backend.cache_enabled"
    ASYNC_INDEXING = "backend.async_indexing"

    # Experimental Features
    BETA_FEATURES = "ui.beta_features"
    EXPERIMENTAL_API = "experiment.experimental_api"

    # Operations (ops category)
    MAINTENANCE_MODE = "ops.maintenance_mode"
    RATE_LIMITING = "ops.rate_limiting"

    # Admin Features (admin category)
    BULK_OPERATIONS = "admin.bulk_operations"
    ADVANCED_ANALYTICS = "admin.advanced_analytics"
    AUDIT_LOG_EXPORT = "admin.audit_log_export"

    # UI Features (ui category)
    UNIFIED_CHAT_VOICE = "ui.unified_chat_voice"
    NEW_NAVIGATION = "ui.new_navigation"
    DARK_MODE = "ui.dark_mode"

    # Legacy name compatibility map
    # Maps old names to new names for backward compatibility
    _LEGACY_MAP = {
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

    @classmethod
    def resolve(cls, name: str) -> str:
        """Resolve a flag name, handling legacy names.

        Args:
            name: Flag name (old or new format)

        Returns:
            Resolved flag name in new dot-based format
        """
        if "." in name:
            return name
        return cls._LEGACY_MAP.get(name, name)
