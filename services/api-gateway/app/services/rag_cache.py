"""RAG Result Caching Service.

Caches semantic search results to reduce load on vector database and embeddings API.
Implements intelligent caching with:
- Query normalization for cache key generation
- Embedding caching to avoid repeated OpenAI API calls
- Search result caching with configurable TTL
- Cache invalidation on document updates
- Hit rate tracking and metrics

Cache Strategy:
- Query Embeddings: 24-hour TTL (embeddings rarely need regeneration)
- Search Results: 1-hour TTL (balance between freshness and performance)
- Document Metadata: 2-hour TTL (document metadata is relatively stable)

Usage:
    from app.services.rag_cache import rag_cache

    # Cache search results
    cache_key = rag_cache.generate_search_key(query, filters)
    cached = await rag_cache.get_search_results(cache_key)
    if not cached:
        results = await perform_search(query)
        await rag_cache.set_search_results(cache_key, results)

    # Invalidate on document update
    await rag_cache.invalidate_document(document_id)
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import get_logger
from app.services.cache_service import cache_service
from prometheus_client import Counter, Histogram

logger = get_logger(__name__)


# Prometheus Metrics
rag_cache_hits_total = Counter(
    "rag_cache_hits_total",
    "Total number of RAG cache hits",
    ["cache_type"],  # query_embedding, search_results, document_meta
)

rag_cache_misses_total = Counter("rag_cache_misses_total", "Total number of RAG cache misses", ["cache_type"])

rag_cache_invalidations_total = Counter(
    "rag_cache_invalidations_total",
    "Total number of cache invalidations",
    ["invalidation_type"],  # document, pattern, all
)

rag_search_latency_saved = Histogram(
    "rag_search_latency_saved_seconds",
    "Estimated latency saved by cache hits",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
)


class RAGCache:
    """Cache manager for RAG operations.

    Manages caching of:
    - Query embeddings (to avoid redundant OpenAI API calls)
    - Search results (to avoid repeated vector database queries)
    - Document metadata (for quick access to document info)

    All caches use the shared cache_service with appropriate namespaces and TTLs.
    """

    # Cache TTLs (in seconds)
    EMBEDDING_TTL = 86400  # 24 hours - embeddings are stable
    SEARCH_RESULTS_TTL = 3600  # 1 hour - balance between freshness and performance
    DOCUMENT_META_TTL = 7200  # 2 hours - document metadata is relatively stable

    # Cache namespaces
    EMBEDDING_NAMESPACE = "rag_embedding"
    SEARCH_NAMESPACE = "rag_search"
    DOCUMENT_NAMESPACE = "rag_doc"

    def __init__(self):
        """Initialize RAG cache manager."""
        self.logger = get_logger(__name__)

    def _normalize_query(self, query: str) -> str:
        """Normalize query text for consistent cache keys.

        Args:
            query: Raw query text

        Returns:
            Normalized query text
        """
        # Convert to lowercase and strip whitespace
        normalized = query.lower().strip()

        # Remove extra whitespace
        normalized = " ".join(normalized.split())

        return normalized

    def generate_search_key(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.7,
        filters: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate cache key for search results.

        Args:
            query: Search query text
            top_k: Number of results requested
            score_threshold: Minimum similarity score
            filters: Optional filters applied to search

        Returns:
            Cache key string
        """
        # Normalize query
        normalized_query = self._normalize_query(query)

        # Build key components
        key_data = {
            "query": normalized_query,
            "top_k": top_k,
            "threshold": score_threshold,
            "filters": filters or {},
        }

        # Create hash
        key_json = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.sha256(key_json.encode()).hexdigest()[:16]

        return f"{self.SEARCH_NAMESPACE}:{key_hash}"

    def generate_embedding_key(self, text: str) -> str:
        """Generate cache key for text embedding.

        Args:
            text: Text to embed

        Returns:
            Cache key string
        """
        # Normalize text
        normalized = self._normalize_query(text)

        # Create hash
        text_hash = hashlib.sha256(normalized.encode()).hexdigest()[:16]

        return f"{self.EMBEDDING_NAMESPACE}:{text_hash}"

    def generate_document_key(self, document_id: str) -> str:
        """Generate cache key for document metadata.

        Args:
            document_id: Document identifier

        Returns:
            Cache key string
        """
        return f"{self.DOCUMENT_NAMESPACE}:{document_id}"

    async def get_search_results(self, cache_key: str) -> Optional[List[Dict[str, Any]]]:
        """Get cached search results.

        Args:
            cache_key: Cache key from generate_search_key()

        Returns:
            List of search results or None if not cached
        """
        try:
            results = await cache_service.get(cache_key)

            if results is not None:
                rag_cache_hits_total.labels(cache_type="search_results").inc()
                self.logger.debug(f"RAG search cache hit: {cache_key}")

                # Track latency saved (estimated)
                # Typical search takes 0.5-2 seconds
                rag_search_latency_saved.observe(1.0)

                return results
            else:
                rag_cache_misses_total.labels(cache_type="search_results").inc()
                return None

        except Exception as e:
            self.logger.error(f"Error getting cached search results: {e}", exc_info=True)
            rag_cache_misses_total.labels(cache_type="search_results").inc()
            return None

    async def set_search_results(
        self, cache_key: str, results: List[Dict[str, Any]], ttl: Optional[int] = None
    ) -> bool:
        """Cache search results.

        Args:
            cache_key: Cache key from generate_search_key()
            results: List of search results to cache
            ttl: Optional custom TTL (default: SEARCH_RESULTS_TTL)

        Returns:
            True if cached successfully, False otherwise
        """
        try:
            ttl = ttl or self.SEARCH_RESULTS_TTL

            success = await cache_service.set(cache_key, results, ttl=ttl)

            if success:
                self.logger.debug(f"Cached RAG search results: {cache_key}, " f"{len(results)} results, TTL={ttl}s")

            return success

        except Exception as e:
            self.logger.error(f"Error caching search results: {e}", exc_info=True)
            return False

    async def get_embedding(self, cache_key: str) -> Optional[List[float]]:
        """Get cached text embedding.

        Args:
            cache_key: Cache key from generate_embedding_key()

        Returns:
            Embedding vector or None if not cached
        """
        try:
            embedding = await cache_service.get(cache_key)

            if embedding is not None:
                rag_cache_hits_total.labels(cache_type="query_embedding").inc()
                self.logger.debug(f"RAG embedding cache hit: {cache_key}")
                return embedding
            else:
                rag_cache_misses_total.labels(cache_type="query_embedding").inc()
                return None

        except Exception as e:
            self.logger.error(f"Error getting cached embedding: {e}", exc_info=True)
            rag_cache_misses_total.labels(cache_type="query_embedding").inc()
            return None

    async def set_embedding(self, cache_key: str, embedding: List[float], ttl: Optional[int] = None) -> bool:
        """Cache text embedding.

        Args:
            cache_key: Cache key from generate_embedding_key()
            embedding: Embedding vector to cache
            ttl: Optional custom TTL (default: EMBEDDING_TTL)

        Returns:
            True if cached successfully, False otherwise
        """
        try:
            ttl = ttl or self.EMBEDDING_TTL

            success = await cache_service.set(
                cache_key,
                embedding,
                ttl=ttl,
                compress=True,  # Embeddings can be large, compress them
            )

            if success:
                self.logger.debug(f"Cached RAG embedding: {cache_key}, " f"{len(embedding)} dimensions, TTL={ttl}s")

            return success

        except Exception as e:
            self.logger.error(f"Error caching embedding: {e}", exc_info=True)
            return False

    async def get_document_metadata(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get cached document metadata.

        Args:
            document_id: Document identifier

        Returns:
            Document metadata or None if not cached
        """
        try:
            cache_key = self.generate_document_key(document_id)
            metadata = await cache_service.get(cache_key)

            if metadata is not None:
                rag_cache_hits_total.labels(cache_type="document_meta").inc()
                self.logger.debug(f"RAG document metadata cache hit: {document_id}")
                return metadata
            else:
                rag_cache_misses_total.labels(cache_type="document_meta").inc()
                return None

        except Exception as e:
            self.logger.error(f"Error getting cached document metadata: {e}", exc_info=True)
            rag_cache_misses_total.labels(cache_type="document_meta").inc()
            return None

    async def set_document_metadata(
        self, document_id: str, metadata: Dict[str, Any], ttl: Optional[int] = None
    ) -> bool:
        """Cache document metadata.

        Args:
            document_id: Document identifier
            metadata: Document metadata to cache
            ttl: Optional custom TTL (default: DOCUMENT_META_TTL)

        Returns:
            True if cached successfully, False otherwise
        """
        try:
            cache_key = self.generate_document_key(document_id)
            ttl = ttl or self.DOCUMENT_META_TTL

            success = await cache_service.set(cache_key, metadata, ttl=ttl)

            if success:
                self.logger.debug(f"Cached RAG document metadata: {document_id}, TTL={ttl}s")

            return success

        except Exception as e:
            self.logger.error(f"Error caching document metadata: {e}", exc_info=True)
            return False

    async def invalidate_document(self, document_id: str) -> bool:
        """Invalidate all caches related to a document.

        This should be called when a document is updated or deleted.

        Args:
            document_id: Document identifier

        Returns:
            True if invalidation successful, False otherwise
        """
        try:
            # Invalidate document metadata
            doc_key = self.generate_document_key(document_id)
            await cache_service.delete(doc_key)

            # Invalidate all search results (they may contain this document)
            # This is aggressive but ensures consistency
            await cache_service.delete_pattern(f"{self.SEARCH_NAMESPACE}:*")

            rag_cache_invalidations_total.labels(invalidation_type="document").inc()

            self.logger.info(f"Invalidated RAG caches for document: {document_id}")
            return True

        except Exception as e:
            self.logger.error(
                f"Error invalidating document caches for {document_id}: {e}",
                exc_info=True,
            )
            return False

    async def invalidate_search_results(self) -> int:
        """Invalidate all search result caches.

        Useful when the knowledge base is significantly updated.

        Returns:
            Number of cache entries invalidated
        """
        try:
            count = await cache_service.delete_pattern(f"{self.SEARCH_NAMESPACE}:*")

            rag_cache_invalidations_total.labels(invalidation_type="pattern").inc()

            self.logger.info(f"Invalidated {count} RAG search result caches")
            return count

        except Exception as e:
            self.logger.error(f"Error invalidating search result caches: {e}", exc_info=True)
            return 0

    async def invalidate_all(self) -> Tuple[int, int, int]:
        """Invalidate all RAG caches.

        Returns:
            Tuple of (embeddings_count, search_count, documents_count)
        """
        try:
            embeddings_count = await cache_service.delete_pattern(f"{self.EMBEDDING_NAMESPACE}:*")
            search_count = await cache_service.delete_pattern(f"{self.SEARCH_NAMESPACE}:*")
            documents_count = await cache_service.delete_pattern(f"{self.DOCUMENT_NAMESPACE}:*")

            rag_cache_invalidations_total.labels(invalidation_type="all").inc()

            self.logger.info(
                f"Invalidated all RAG caches: "
                f"{embeddings_count} embeddings, "
                f"{search_count} searches, "
                f"{documents_count} documents"
            )

            return (embeddings_count, search_count, documents_count)

        except Exception as e:
            self.logger.error(f"Error invalidating all RAG caches: {e}", exc_info=True)
            return (0, 0, 0)

    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get RAG cache statistics.

        Returns:
            Dictionary with cache statistics
        """
        # This would ideally query Prometheus or maintain internal counters
        # For now, return a basic structure
        return {
            "embeddings": {
                "namespace": self.EMBEDDING_NAMESPACE,
                "ttl_seconds": self.EMBEDDING_TTL,
            },
            "search_results": {
                "namespace": self.SEARCH_NAMESPACE,
                "ttl_seconds": self.SEARCH_RESULTS_TTL,
            },
            "document_metadata": {
                "namespace": self.DOCUMENT_NAMESPACE,
                "ttl_seconds": self.DOCUMENT_META_TTL,
            },
        }


# Global RAG cache instance
rag_cache = RAGCache()
