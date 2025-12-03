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
class FeatureFlags:
    """Constants for commonly used feature flags."""

    # RBAC Features
    RBAC_ENFORCEMENT = "rbac_enforcement"
    RBAC_STRICT_MODE = "rbac_strict_mode"

    # Observability Features
    METRICS_ENABLED = "metrics_enabled"
    TRACING_ENABLED = "tracing_enabled"
    LOGGING_VERBOSE = "logging_verbose"

    # External Integrations
    NEXTCLOUD_INTEGRATION = "nextcloud_integration"
    OPENAI_ENABLED = "openai_enabled"
    NEXTCLOUD_AUTO_INDEX = "nextcloud_auto_index"

    # RAG Features
    RAG_STRATEGY = "rag_strategy"  # Value: "simple", "multi_hop", "hybrid"
    RAG_MAX_RESULTS = "rag_max_results"  # Value: integer
    RAG_SCORE_THRESHOLD = "rag_score_threshold"  # Value: float

    # Performance Features
    CACHE_ENABLED = "cache_enabled"
    ASYNC_INDEXING = "async_indexing"

    # Experimental Features
    BETA_FEATURES = "beta_features"
    EXPERIMENTAL_API = "experimental_api"
