"""
Search Aggregator Service (Phase 5 MVP)

Performs semantic search across the knowledge base using Qdrant vector database.
Returns relevant document chunks with scores and metadata for RAG.

MVP Implementation:
- Vector similarity search using Qdrant
- Configurable top-K results
- Score-based filtering
- Result formatting for RAG
- Multi-level caching (Phase 7 - P2.1)

Enhancements (hardening pass):
- Timeouts and retries around OpenAI embeddings and Qdrant calls
- Async offloading of blocking Qdrant client operations

Future enhancements:
- Multi-vector search (dense + sparse)
- Hybrid search (vector + keyword)
- Query expansion
- Result re-ranking
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import openai
from app.core.config import settings
from app.core.metrics import rag_embedding_tokens_total, rag_query_duration_seconds, rag_search_results_total
from app.services.cache_service import cache_service, generate_cache_key
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Represents a search result from the knowledge base."""

    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: Dict[str, Any]


class SearchAggregator:
    """
    Search Aggregator for semantic search across medical knowledge base.

    Handles query embedding generation and vector search in Qdrant.
    """

    def __init__(
        self,
        qdrant_url: str = "http://qdrant:6333",
        collection_name: str = "medical_kb",
        embedding_model: str = "text-embedding-3-small",
    ):
        """
        Initialize Search Aggregator.

        Args:
            qdrant_url: Qdrant server URL
            collection_name: Name of the collection to search
            embedding_model: OpenAI embedding model to use
        """
        # Check if Qdrant is enabled
        self.qdrant_enabled = getattr(settings, "QDRANT_ENABLED", True)

        # Qdrant client is sync; keep a short timeout and execute calls off the event loop
        if self.qdrant_enabled:
            self.qdrant_client = QdrantClient(url=qdrant_url, timeout=5.0)
        else:
            self.qdrant_client = None
            logger.warning("Qdrant is disabled - search will return empty results")

        self.collection_name = collection_name
        self.embedding_model = embedding_model

    async def generate_query_embedding(self, query: str) -> List[float]:
        """
        Generate embedding vector for search query with caching.

        Args:
            query: Search query text

        Returns:
            Query embedding vector
        """
        # Simple exponential backoff to tolerate transient network/model issues
        backoff_seconds = [1, 2, 4]

        # Check cache first
        cache_key = generate_cache_key(
            "rag_embedding", query, model=self.embedding_model
        )
        cached_embedding = await cache_service.get(cache_key)
        if cached_embedding is not None:
            logger.debug(f"Using cached embedding for query: {query[:50]}...")
            return cached_embedding

        # Generate embedding
        last_error: Optional[Exception] = None
        for attempt, delay in enumerate(backoff_seconds, start=1):
            try:
                start_time = time.time()
                response = await asyncio.wait_for(
                    openai.embeddings.create(model=self.embedding_model, input=query),
                    timeout=15,
                )
                embedding = response.data[0].embedding

                # Track metrics
                duration = time.time() - start_time
                rag_query_duration_seconds.labels(stage="embedding").observe(duration)
                if getattr(response, "usage", None):
                    rag_embedding_tokens_total.inc(response.usage.total_tokens)

                # Cache the embedding (24 hour TTL - embeddings are stable)
                await cache_service.set(cache_key, embedding, ttl=86400)
                return embedding

            except asyncio.TimeoutError as exc:
                last_error = exc
                logger.error("Embedding generation timed out (attempt %d)", attempt)
            except Exception as exc:
                last_error = exc
                logger.error(
                    "Error generating query embedding (attempt %d): %s",
                    attempt,
                    exc,
                    exc_info=True,
                )

            # Backoff before next attempt
            await asyncio.sleep(delay)

        # If all attempts fail, bubble up the last error
        raise RuntimeError(
            f"Failed to generate embedding after retries: {last_error}"
        ) from last_error

    async def search(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.7,
        filter_conditions: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """
        Perform semantic search against the knowledge base with caching.

        Args:
            query: Search query text
            top_k: Number of top results to return
            score_threshold: Minimum similarity score (0-1)
            filter_conditions: Optional filters (e.g., source_type, document_id)

        Returns:
            List of search results sorted by relevance
        """
        # Return empty results if Qdrant is disabled
        if not self.qdrant_enabled or self.qdrant_client is None:
            logger.debug("Qdrant disabled - returning empty search results")
            return []

        backoff_seconds = [1, 2, 4]

        # Check cache first
        cache_key = generate_cache_key(
            "search_results",
            query,
            top_k=top_k,
            threshold=score_threshold,
            filters=str(filter_conditions) if filter_conditions else "none",
        )
        cached_results = await cache_service.get(cache_key)
        if cached_results is not None:
            logger.debug(f"Using cached search results for query: {query[:50]}...")
            rag_search_results_total.observe(len(cached_results))
            return cached_results

        last_error: Optional[Exception] = None
        for attempt, delay in enumerate(backoff_seconds, start=1):
            try:
                start_time = time.time()

                # Generate query embedding
                query_embedding = await self.generate_query_embedding(query)

                # Prepare filter if specified
                search_filter = None
                if filter_conditions:
                    filter_must = []
                    for key, value in filter_conditions.items():
                        filter_must.append(
                            FieldCondition(key=key, match=MatchValue(value=value))
                        )
                    search_filter = Filter(must=filter_must)

                # Perform vector search in Qdrant off the event loop
                search_start = time.time()
                search_results = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.qdrant_client.search,
                        collection_name=self.collection_name,
                        query_vector=query_embedding,
                        limit=top_k,
                        score_threshold=score_threshold,
                        query_filter=search_filter,
                    ),
                    timeout=5,
                )
                rag_query_duration_seconds.labels(stage="search").observe(
                    time.time() - search_start
                )

                # Format results
                results = []
                for result in search_results:
                    search_result = SearchResult(
                        chunk_id=str(result.id),
                        document_id=result.payload.get("document_id", "unknown"),
                        content=result.payload.get("content", ""),
                        score=result.score,
                        metadata={
                            "title": result.payload.get("title", "Untitled"),
                            "source_type": result.payload.get("source_type", "unknown"),
                            "chunk_index": result.payload.get("chunk_index", 0),
                            **{
                                k: v
                                for k, v in result.payload.items()
                                if k
                                not in [
                                    "content",
                                    "document_id",
                                    "title",
                                    "source_type",
                                    "chunk_index",
                                ]
                            },
                        },
                    )
                    results.append(search_result)

                # Track metrics
                rag_query_duration_seconds.labels(stage="total").observe(
                    time.time() - start_time
                )
                rag_search_results_total.observe(len(results))

                # Cache search results (30 minute TTL)
                await cache_service.set(cache_key, results, ttl=1800)

                logger.info(
                    "Found %d results for query (top_k=%d, threshold=%s)",
                    len(results),
                    top_k,
                    score_threshold,
                )
                return results

            except asyncio.TimeoutError as exc:
                last_error = exc
                logger.error("Qdrant search timed out (attempt %d)", attempt)
            except Exception as exc:
                last_error = exc
                logger.error(
                    "Error performing search (attempt %d): %s",
                    attempt,
                    exc,
                    exc_info=True,
                )

            await asyncio.sleep(delay)

        logger.error("Search failed after retries: %s", last_error)
        return []

    async def search_by_document_id(
        self, document_id: str, top_k: int = 10
    ) -> List[SearchResult]:
        """
        Retrieve all chunks for a specific document.

        Args:
            document_id: Document identifier
            top_k: Maximum number of chunks to return

        Returns:
            List of document chunks
        """
        # Return empty results if Qdrant is disabled
        if not self.qdrant_enabled or self.qdrant_client is None:
            logger.debug("Qdrant disabled - returning empty document chunks")
            return []

        backoff_seconds = [1, 2, 4]
        last_error: Optional[Exception] = None

        for attempt, delay in enumerate(backoff_seconds, start=1):
            try:
                # Search with document_id filter off the event loop
                search_results = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.qdrant_client.scroll,
                        collection_name=self.collection_name,
                        scroll_filter=Filter(
                            must=[
                                FieldCondition(
                                    key="document_id",
                                    match=MatchValue(value=document_id),
                                )
                            ]
                        ),
                        limit=top_k,
                    ),
                    timeout=5,
                )

                # Format results
                results = []
                for result in search_results[
                    0
                ]:  # scroll returns (points, next_page_offset)
                    search_result = SearchResult(
                        chunk_id=str(result.id),
                        document_id=result.payload.get("document_id", "unknown"),
                        content=result.payload.get("content", ""),
                        score=1.0,  # Not a similarity search
                        metadata={
                            "title": result.payload.get("title", "Untitled"),
                            "source_type": result.payload.get("source_type", "unknown"),
                            "chunk_index": result.payload.get("chunk_index", 0),
                            **{
                                k: v
                                for k, v in result.payload.items()
                                if k
                                not in [
                                    "content",
                                    "document_id",
                                    "title",
                                    "source_type",
                                    "chunk_index",
                                ]
                            },
                        },
                    )
                    results.append(search_result)

                logger.info(
                    "Retrieved %d chunks for document %s", len(results), document_id
                )
                return results

            except asyncio.TimeoutError as exc:
                last_error = exc
                logger.error(
                    "Qdrant scroll timed out for document %s (attempt %d)",
                    document_id,
                    attempt,
                )
            except Exception as exc:
                last_error = exc
                logger.error(
                    "Error retrieving document chunks for %s (attempt %d): %s",
                    document_id,
                    attempt,
                    exc,
                    exc_info=True,
                )

            await asyncio.sleep(delay)

        logger.error(
            "Failed to retrieve document %s after retries: %s", document_id, last_error
        )
        return []

    def format_context_for_rag(self, search_results: List[SearchResult]) -> str:
        """
        Format search results into context string for RAG.

        Args:
            search_results: List of search results

        Returns:
            Formatted context string
        """
        if not search_results:
            return ""

        context_parts = []
        for i, result in enumerate(search_results, 1):
            context_parts.append(
                f"[Source {i}] {result.metadata.get('title', 'Unknown')} "
                f"(Score: {result.score:.2f})\n{result.content}\n"
            )

        return "\n".join(context_parts)

    def extract_citations(
        self, search_results: List[SearchResult]
    ) -> List[Dict[str, Any]]:
        """
        Extract citation information from search results.

        Args:
            search_results: List of search results

        Returns:
            List of citation dictionaries
        """
        citations = []
        seen_documents = set()

        for result in search_results:
            # Only include each document once
            if result.document_id in seen_documents:
                continue

            seen_documents.add(result.document_id)

            citation = {
                "id": result.document_id,
                "source_type": result.metadata.get("source_type", "unknown"),
                "title": result.metadata.get("title", "Untitled"),
                "url": result.metadata.get("url"),
                "relevance_score": result.score,
            }
            citations.append(citation)

        return citations

    def synthesize_across_documents(self, search_results: List[SearchResult]) -> Dict[str, Any]:
        """Create a cross-document synthesis summary.

        Groups results by document and returns a condensed context string and
        lightweight metadata for auditing.
        """

        if not search_results:
            return {"context": "", "documents": []}

        grouped: Dict[str, Dict[str, Any]] = {}
        for result in search_results:
            doc_group = grouped.setdefault(
                result.document_id,
                {
                    "title": result.metadata.get("title", "Untitled"),
                    "score": 0.0,
                    "chunks": [],
                },
            )
            doc_group["score"] = max(doc_group["score"], result.score)
            doc_group["chunks"].append(result.content)

        context_sections: List[str] = []
        documents_meta: List[Dict[str, Any]] = []

        for idx, (document_id, doc) in enumerate(grouped.items(), start=1):
            snippet = " ".join(doc["chunks"][:2])
            snippet = (snippet[:600] + "…") if len(snippet) > 600 else snippet
            context_sections.append(f"[Doc {idx}: {doc['title']}] {snippet}")
            documents_meta.append(
                {
                    "document_id": document_id,
                    "title": doc["title"],
                    "score": doc["score"],
                    "chunks": len(doc["chunks"]),
                }
            )

        return {"context": "\n\n".join(context_sections), "documents": documents_meta}

    def confidence_score(self, search_results: List[SearchResult]) -> float:
        """Estimate confidence for retrieval stage based on scores and coverage."""

        if not search_results:
            return 0.2

        top_scores = sorted([r.score for r in search_results], reverse=True)[:3]
        avg_top = sum(top_scores) / len(top_scores)
        doc_coverage = len({r.document_id for r in search_results})
        coverage_boost = min(doc_coverage / 5, 1.0) * 0.2
        normalized = min(max(avg_top, 0.0), 1.0)
        return min(1.0, 0.6 * normalized + coverage_boost + 0.2)
