"""Admin Cache Management API (Phase 7 Integration Improvements - P2.1).

Provides endpoints for administrators to manage the multi-level cache:
- View cache statistics
- Clear caches (selective or all)
- Invalidate specific patterns
- Monitor cache performance

These endpoints require admin authentication.
"""

from app.core.api_envelope import success_response
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.logging import get_logger
from app.models.user import User
from app.services.cache_service import cache_service
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin/cache", tags=["admin", "cache"])
logger = get_logger(__name__)


class CacheStatsResponse(BaseModel):
    """Cache statistics response."""

    l1_size: int
    l1_max_size: int
    l1_utilization: float
    l2_used_memory: int
    l2_used_memory_human: str
    l2_connected_clients: int


class CacheInvalidateRequest(BaseModel):
    """Request to invalidate cache by pattern."""

    pattern: str


@router.get("/stats", response_model=dict)
async def get_cache_stats(
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get cache statistics for monitoring.

    Returns:
        Cache stats including L1 and L2 metrics
    """
    try:
        stats = await cache_service.get_stats()

        response_data = CacheStatsResponse(
            l1_size=stats.get("l1", {}).get("size", 0),
            l1_max_size=stats.get("l1", {}).get("max_size", 0),
            l1_utilization=stats.get("l1", {}).get("utilization", 0.0),
            l2_used_memory=stats.get("l2", {}).get("used_memory", 0),
            l2_used_memory_human=stats.get("l2", {}).get("used_memory_human", "0B"),
            l2_connected_clients=stats.get("l2", {}).get("connected_clients", 0),
        )

        logger.info(
            "cache_stats_retrieved",
            extra={
                "admin_user_id": str(current_admin_user.id),
                "l1_utilization": response_data.l1_utilization,
            },
        )

        return success_response(data=response_data.model_dump(), version="2.0.0")

    except Exception as e:
        logger.error(f"Error retrieving cache stats: {e}", exc_info=True)
        return success_response(
            data={"error": str(e), "message": "Failed to retrieve cache statistics"},
            version="2.0.0",
        )


@router.post("/clear", response_model=dict)
async def clear_cache(
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Clear all caches (L1 and L2).

    WARNING: This will clear ALL cached data and may temporarily
    impact performance while caches are repopulated.

    Returns:
        Success status
    """
    ensure_admin_privileges(current_admin_user)

    try:
        success = await cache_service.clear()

        logger.warning(
            "cache_cleared_all",
            extra={
                "admin_user_id": str(current_admin_user.id),
                "admin_email": current_admin_user.email,
                "success": success,
            },
        )

        return success_response(
            data={
                "success": success,
                "message": ("All caches cleared successfully" if success else "Failed to clear caches"),
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error clearing cache: {e}", exc_info=True)
        return success_response(
            data={
                "success": False,
                "error": str(e),
                "message": "Failed to clear caches",
            },
            version="2.0.0",
        )


@router.post("/invalidate", response_model=dict)
async def invalidate_cache_pattern(
    pattern: str = Query(..., description="Redis key pattern to invalidate (e.g., 'rag_query:*')"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Invalidate cache entries matching a pattern.

    Examples:
    - "rag_query:*" - All RAG query caches
    - "user:*" - All user data caches
    - "search_results:*" - All search result caches

    Returns:
        Number of keys deleted
    """
    ensure_admin_privileges(current_admin_user)

    try:
        deleted_count = await cache_service.delete_pattern(pattern)

        logger.info(
            "cache_pattern_invalidated",
            extra={
                "admin_user_id": str(current_admin_user.id),
                "pattern": pattern,
                "deleted_count": deleted_count,
            },
        )

        return success_response(
            data={
                "pattern": pattern,
                "deleted_count": deleted_count,
                "message": f"Invalidated {deleted_count} cache entries matching pattern '{pattern}'",
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error invalidating cache pattern: {e}", exc_info=True)
        return success_response(
            data={
                "pattern": pattern,
                "deleted_count": 0,
                "error": str(e),
                "message": "Failed to invalidate cache pattern",
            },
            version="2.0.0",
        )
