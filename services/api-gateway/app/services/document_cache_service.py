"""Document Caching Service for Performance Optimization.

Provides caching for frequently accessed document data:
- Document structure (TOC, sections, figures)
- Voice session state
- Page content (lazy loaded)

Cache Strategy:
- Document Structure: 30-minute TTL (document structure is stable after indexing)
- Voice Session: 5-minute TTL (active sessions change frequently)
- Page Content: 15-minute TTL (individual pages accessed repeatedly during reading)

This service reduces database load during voice navigation sessions where
users repeatedly access the same document and navigate between pages.

Usage:
    from app.services.document_cache_service import document_cache

    # Get document structure (cached)
    structure = await document_cache.get_document_structure(document_id)

    # Get page content (lazy loaded, cached)
    page = await document_cache.get_page_content(document_id, page_number)

    # Get active session (cached)
    session = await document_cache.get_active_session(conversation_id, user_id)
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger
from app.services.cache_service import cache_service
from prometheus_client import Counter, Histogram

logger = get_logger(__name__)


# Prometheus Metrics
document_cache_hits = Counter(
    "document_cache_hits_total",
    "Document cache hits by type",
    ["cache_type"],
)

document_cache_misses = Counter(
    "document_cache_misses_total",
    "Document cache misses by type",
    ["cache_type"],
)

document_cache_latency = Histogram(
    "document_cache_latency_seconds",
    "Document cache operation latency",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
)


class DocumentCacheService:
    """Caching service for document navigation performance.

    Implements a multi-layer caching strategy:
    1. Full document structure cache (for repeated TOC/section access)
    2. Page-level cache (for lazy loading during reading)
    3. Session cache (for active voice sessions)

    All caches use the shared cache_service with appropriate namespaces and TTLs.
    """

    # Cache TTLs (in seconds)
    STRUCTURE_TTL = 1800      # 30 minutes - document structure is stable
    PAGE_TTL = 900            # 15 minutes - pages accessed during reading
    SESSION_TTL = 300         # 5 minutes - sessions are active
    METADATA_TTL = 3600       # 1 hour - basic metadata (title, pages)

    # Cache namespaces
    STRUCTURE_NAMESPACE = "doc_struct"
    PAGE_NAMESPACE = "doc_page"
    SESSION_NAMESPACE = "voice_session"
    METADATA_NAMESPACE = "doc_meta"

    def __init__(self):
        """Initialize document cache service."""
        self.logger = get_logger(__name__)

    def _structure_key(self, document_id: str) -> str:
        """Generate cache key for document structure."""
        return f"{self.STRUCTURE_NAMESPACE}:{document_id}"

    def _page_key(self, document_id: str, page_number: int) -> str:
        """Generate cache key for page content."""
        return f"{self.PAGE_NAMESPACE}:{document_id}:{page_number}"

    def _session_key(self, conversation_id: str, user_id: str) -> str:
        """Generate cache key for voice session."""
        key_data = f"{conversation_id}:{user_id}"
        key_hash = hashlib.sha256(key_data.encode()).hexdigest()[:12]
        return f"{self.SESSION_NAMESPACE}:{key_hash}"

    def _metadata_key(self, document_id: str) -> str:
        """Generate cache key for document metadata."""
        return f"{self.METADATA_NAMESPACE}:{document_id}"

    # ========== Document Structure Caching ==========

    async def get_document_structure(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get cached document structure.

        Args:
            document_id: Document identifier

        Returns:
            Document structure dict or None if not cached
        """
        cache_key = self._structure_key(document_id)

        try:
            structure = await cache_service.get(cache_key)

            if structure is not None:
                document_cache_hits.labels(cache_type="structure").inc()
                self.logger.debug(f"Document structure cache hit: {document_id}")
                return structure

            document_cache_misses.labels(cache_type="structure").inc()
            return None

        except Exception as e:
            self.logger.error(f"Error getting cached structure: {e}", exc_info=True)
            document_cache_misses.labels(cache_type="structure").inc()
            return None

    async def set_document_structure(
        self,
        document_id: str,
        structure: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Cache document structure.

        Args:
            document_id: Document identifier
            structure: Document structure dict
            ttl: Optional custom TTL

        Returns:
            True if cached successfully
        """
        cache_key = self._structure_key(document_id)
        ttl = ttl or self.STRUCTURE_TTL

        try:
            success = await cache_service.set(cache_key, structure, ttl=ttl)
            if success:
                self.logger.debug(f"Cached document structure: {document_id}")
            return success
        except Exception as e:
            self.logger.error(f"Error caching structure: {e}", exc_info=True)
            return False

    # ========== Page Content Caching ==========

    async def get_page_content(
        self,
        document_id: str,
        page_number: int,
    ) -> Optional[Dict[str, Any]]:
        """Get cached page content.

        This enables lazy loading of pages - only fetch/cache pages as needed.

        Args:
            document_id: Document identifier
            page_number: Page number (1-indexed)

        Returns:
            Page content dict or None if not cached
        """
        cache_key = self._page_key(document_id, page_number)

        try:
            page = await cache_service.get(cache_key)

            if page is not None:
                document_cache_hits.labels(cache_type="page").inc()
                self.logger.debug(f"Page cache hit: {document_id}:{page_number}")
                return page

            document_cache_misses.labels(cache_type="page").inc()
            return None

        except Exception as e:
            self.logger.error(f"Error getting cached page: {e}", exc_info=True)
            document_cache_misses.labels(cache_type="page").inc()
            return None

    async def set_page_content(
        self,
        document_id: str,
        page_number: int,
        content: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Cache page content.

        Args:
            document_id: Document identifier
            page_number: Page number
            content: Page content dict
            ttl: Optional custom TTL

        Returns:
            True if cached successfully
        """
        cache_key = self._page_key(document_id, page_number)
        ttl = ttl or self.PAGE_TTL

        try:
            return await cache_service.set(cache_key, content, ttl=ttl)
        except Exception as e:
            self.logger.error(f"Error caching page: {e}", exc_info=True)
            return False

    async def prefetch_pages(
        self,
        document_id: str,
        structure: Dict[str, Any],
        current_page: int,
        prefetch_count: int = 2,
    ) -> None:
        """Prefetch adjacent pages for smoother navigation.

        Caches the next and previous pages to reduce latency
        when user says "next page" or "previous page".

        Args:
            document_id: Document identifier
            structure: Document structure with pages
            current_page: Current page number
            prefetch_count: Number of pages to prefetch in each direction
        """
        pages = structure.get("pages", [])
        total_pages = len(pages)

        if not pages:
            return

        # Build list of pages to prefetch
        pages_to_prefetch = []
        for offset in range(1, prefetch_count + 1):
            if current_page + offset <= total_pages:
                pages_to_prefetch.append(current_page + offset)
            if current_page - offset >= 1:
                pages_to_prefetch.append(current_page - offset)

        # Cache each page
        for page_num in pages_to_prefetch:
            # Check if already cached
            cached = await self.get_page_content(document_id, page_num)
            if cached:
                continue

            # Find page in structure
            for page in pages:
                if page.get("page_number") == page_num:
                    await self.set_page_content(document_id, page_num, page)
                    break

        self.logger.debug(
            f"Prefetched {len(pages_to_prefetch)} pages for doc {document_id}"
        )

    # ========== Voice Session Caching ==========

    async def get_active_session(
        self,
        conversation_id: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get cached active voice session.

        Args:
            conversation_id: Conversation identifier
            user_id: User identifier

        Returns:
            Session dict or None if not cached
        """
        cache_key = self._session_key(conversation_id, user_id)

        try:
            session = await cache_service.get(cache_key)

            if session is not None:
                document_cache_hits.labels(cache_type="session").inc()
                self.logger.debug(f"Session cache hit: {conversation_id}")
                return session

            document_cache_misses.labels(cache_type="session").inc()
            return None

        except Exception as e:
            self.logger.error(f"Error getting cached session: {e}", exc_info=True)
            document_cache_misses.labels(cache_type="session").inc()
            return None

    async def set_active_session(
        self,
        conversation_id: str,
        user_id: str,
        session: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Cache active voice session.

        Args:
            conversation_id: Conversation identifier
            user_id: User identifier
            session: Session data dict
            ttl: Optional custom TTL

        Returns:
            True if cached successfully
        """
        cache_key = self._session_key(conversation_id, user_id)
        ttl = ttl or self.SESSION_TTL

        try:
            return await cache_service.set(cache_key, session, ttl=ttl)
        except Exception as e:
            self.logger.error(f"Error caching session: {e}", exc_info=True)
            return False

    async def invalidate_session(
        self,
        conversation_id: str,
        user_id: str,
    ) -> bool:
        """Invalidate cached session (on position update or session end).

        Args:
            conversation_id: Conversation identifier
            user_id: User identifier

        Returns:
            True if invalidated successfully
        """
        cache_key = self._session_key(conversation_id, user_id)

        try:
            return await cache_service.delete(cache_key)
        except Exception as e:
            self.logger.error(f"Error invalidating session cache: {e}", exc_info=True)
            return False

    # ========== Document Metadata Caching ==========

    async def get_document_metadata(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get cached document metadata (lightweight - no structure).

        Args:
            document_id: Document identifier

        Returns:
            Metadata dict or None if not cached
        """
        cache_key = self._metadata_key(document_id)

        try:
            metadata = await cache_service.get(cache_key)

            if metadata is not None:
                document_cache_hits.labels(cache_type="metadata").inc()
                return metadata

            document_cache_misses.labels(cache_type="metadata").inc()
            return None

        except Exception as e:
            self.logger.error(f"Error getting cached metadata: {e}", exc_info=True)
            return None

    async def set_document_metadata(
        self,
        document_id: str,
        metadata: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Cache document metadata.

        Args:
            document_id: Document identifier
            metadata: Metadata dict (title, pages, has_toc, has_figures)
            ttl: Optional custom TTL

        Returns:
            True if cached successfully
        """
        cache_key = self._metadata_key(document_id)
        ttl = ttl or self.METADATA_TTL

        try:
            return await cache_service.set(cache_key, metadata, ttl=ttl)
        except Exception as e:
            self.logger.error(f"Error caching metadata: {e}", exc_info=True)
            return False

    # ========== Cache Invalidation ==========

    async def invalidate_document(self, document_id: str) -> int:
        """Invalidate all caches for a document.

        Call this when a document is updated or deleted.

        Args:
            document_id: Document identifier

        Returns:
            Number of cache entries invalidated
        """
        count = 0

        try:
            # Invalidate structure cache
            if await cache_service.delete(self._structure_key(document_id)):
                count += 1

            # Invalidate metadata cache
            if await cache_service.delete(self._metadata_key(document_id)):
                count += 1

            # Invalidate all page caches for this document
            pattern = f"{self.PAGE_NAMESPACE}:{document_id}:*"
            page_count = await cache_service.delete_pattern(pattern)
            count += page_count

            self.logger.info(f"Invalidated {count} cache entries for document: {document_id}")
            return count

        except Exception as e:
            self.logger.error(f"Error invalidating document caches: {e}", exc_info=True)
            return count

    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get document cache statistics.

        Returns:
            Dictionary with cache statistics
        """
        return {
            "structure": {
                "namespace": self.STRUCTURE_NAMESPACE,
                "ttl_seconds": self.STRUCTURE_TTL,
            },
            "page": {
                "namespace": self.PAGE_NAMESPACE,
                "ttl_seconds": self.PAGE_TTL,
            },
            "session": {
                "namespace": self.SESSION_NAMESPACE,
                "ttl_seconds": self.SESSION_TTL,
            },
            "metadata": {
                "namespace": self.METADATA_NAMESPACE,
                "ttl_seconds": self.METADATA_TTL,
            },
        }


# Global document cache instance
document_cache = DocumentCacheService()
