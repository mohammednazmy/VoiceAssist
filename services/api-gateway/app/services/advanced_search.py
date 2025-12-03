"""
Advanced Search Aggregator (Phase 5 - Advanced RAG)

Unified search service that orchestrates all advanced RAG components:
- Hybrid search (BM25 + Vector)
- Medical embeddings (PubMedBERT)
- Re-ranking (Cross-encoder/Cohere)
- Query expansion

This is the main entry point for advanced search operations.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from app.services.hybrid_search_service import HybridSearchConfig, HybridSearchService, SearchStrategy
from app.services.medical_embeddings import EmbeddingConfig, MedicalEmbeddingService, MedicalModelType
from app.services.query_expansion import QueryExpansionConfig, QueryExpansionService
from app.services.reranking_service import RerankerConfig, RerankerType, RerankingService

logger = logging.getLogger(__name__)


class SearchMode(str, Enum):
    """Search modes with different precision/recall tradeoffs."""

    FAST = "fast"  # Quick results, lower precision
    BALANCED = "balanced"  # Default balanced mode
    PRECISE = "precise"  # High precision with re-ranking
    COMPREHENSIVE = "comprehensive"  # Maximum recall with expansion


@dataclass
class AdvancedSearchConfig:
    """Configuration for advanced search."""

    # Search mode
    mode: SearchMode = SearchMode.BALANCED

    # Hybrid search settings
    enable_hybrid: bool = True
    vector_weight: float = 0.6
    bm25_weight: float = 0.4

    # Re-ranking settings
    enable_reranking: bool = True
    reranker_type: RerankerType = RerankerType.COHERE

    # Query expansion settings
    enable_expansion: bool = True
    expand_abbreviations: bool = True
    expand_synonyms: bool = True
    enable_llm_expansion: bool = False

    # Medical embeddings
    use_medical_embeddings: bool = False  # Requires GPU
    medical_model: MedicalModelType = MedicalModelType.PUBMEDBERT

    # Results
    top_k: int = 10
    min_score: float = 0.3
    diversity_threshold: float = 0.8

    # Caching
    cache_ttl: int = 1800  # 30 minutes


@dataclass
class AdvancedSearchResult:
    """Result from advanced search."""

    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Search details
    original_score: Optional[float] = None
    rerank_score: Optional[float] = None
    search_method: str = "hybrid"

    # Citation info
    title: Optional[str] = None
    source_type: Optional[str] = None
    url: Optional[str] = None


@dataclass
class SearchMetrics:
    """Metrics for search operation."""

    total_time_ms: float = 0.0
    embedding_time_ms: float = 0.0
    search_time_ms: float = 0.0
    rerank_time_ms: float = 0.0
    expansion_time_ms: float = 0.0

    results_found: int = 0
    results_after_rerank: int = 0
    query_expanded: bool = False
    reranking_applied: bool = False


class AdvancedSearchAggregator:
    """
    Advanced search aggregator with full RAG pipeline support.

    Combines all Phase 5 components into a unified search interface.
    """

    def __init__(
        self,
        config: Optional[AdvancedSearchConfig] = None,
    ):
        self.config = config or AdvancedSearchConfig()

        # Initialize services based on config
        self.hybrid_search = HybridSearchService(
            config=HybridSearchConfig(
                vector_weight=self.config.vector_weight,
                bm25_weight=self.config.bm25_weight,
            )
        )

        self.reranker = (
            RerankingService(
                config=RerankerConfig(
                    reranker_type=self.config.reranker_type,
                    top_n=self.config.top_k * 2,  # Re-rank more than we need
                )
            )
            if self.config.enable_reranking
            else None
        )

        self.query_expander = (
            QueryExpansionService(
                config=QueryExpansionConfig(
                    enable_abbreviation=self.config.expand_abbreviations,
                    enable_synonym=self.config.expand_synonyms,
                    enable_llm=self.config.enable_llm_expansion,
                )
            )
            if self.config.enable_expansion
            else None
        )

        self.medical_embeddings = (
            MedicalEmbeddingService(
                config=EmbeddingConfig(
                    model_type=self.config.medical_model,
                )
            )
            if self.config.use_medical_embeddings
            else None
        )

    async def search(
        self,
        query: str,
        top_k: Optional[int] = None,
        mode: Optional[SearchMode] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> tuple[List[AdvancedSearchResult], SearchMetrics]:
        """
        Perform advanced search with full RAG pipeline.

        Args:
            query: Search query
            top_k: Number of results (default from config)
            mode: Search mode (default from config)
            filters: Optional metadata filters

        Returns:
            Tuple of (results, metrics)
        """
        import time

        start_time = time.time()
        metrics = SearchMetrics()

        top_k = top_k or self.config.top_k
        mode = mode or self.config.mode

        # Apply mode-specific settings
        settings_for_mode = self._get_mode_settings(mode)

        # Step 1: Query Expansion
        expanded_query = query
        if self.query_expander and settings_for_mode["expand"]:
            expansion_start = time.time()
            expansion_result = await self.query_expander.expand(query)
            expanded_query = expansion_result.expanded_query
            metrics.expansion_time_ms = (time.time() - expansion_start) * 1000
            metrics.query_expanded = expanded_query != query
            logger.debug(f"Expanded query: {expanded_query}")

        # Step 2: Search
        search_start = time.time()

        if settings_for_mode["hybrid"]:
            # Use hybrid search
            strategy = SearchStrategy.HYBRID if settings_for_mode["use_bm25"] else SearchStrategy.VECTOR_ONLY
            search_results = await self.hybrid_search.search(
                query=expanded_query,
                top_k=top_k * 3,  # Get more for re-ranking
                strategy=strategy,
                filters=filters,
            )
        else:
            # Fall back to vector-only search
            search_results = await self.hybrid_search.search(
                query=expanded_query,
                top_k=top_k * 3,
                strategy=SearchStrategy.VECTOR_ONLY,
                filters=filters,
            )

        metrics.search_time_ms = (time.time() - search_start) * 1000
        metrics.results_found = len(search_results)

        # Step 3: Re-ranking
        final_results = []
        if self.reranker and settings_for_mode["rerank"] and search_results:
            rerank_start = time.time()

            # Convert to dict format for reranker
            results_dicts = [
                {
                    "chunk_id": r.chunk_id,
                    "document_id": r.document_id,
                    "content": r.content,
                    "score": r.score,
                    "metadata": r.metadata,
                }
                for r in search_results
            ]

            if settings_for_mode["diverse"]:
                reranked = await self.reranker.rerank_with_diversity(
                    query=query,  # Use original query for reranking
                    results=results_dicts,
                    diversity_threshold=self.config.diversity_threshold,
                )
            else:
                reranked = await self.reranker.rerank(
                    query=query,
                    results=results_dicts,
                )

            metrics.rerank_time_ms = (time.time() - rerank_start) * 1000
            metrics.reranking_applied = True
            metrics.results_after_rerank = len(reranked)

            # Convert to AdvancedSearchResult
            for r in reranked[:top_k]:
                final_results.append(
                    AdvancedSearchResult(
                        chunk_id=r.chunk_id,
                        document_id=r.document_id,
                        content=r.content,
                        score=r.final_score,
                        metadata=r.metadata,
                        original_score=r.original_score,
                        rerank_score=r.rerank_score,
                        search_method="hybrid_reranked",
                        title=r.metadata.get("title"),
                        source_type=r.metadata.get("source_type"),
                        url=r.metadata.get("url"),
                    )
                )
        else:
            # No re-ranking - use search results directly
            for r in search_results[:top_k]:
                final_results.append(
                    AdvancedSearchResult(
                        chunk_id=r.chunk_id,
                        document_id=r.document_id,
                        content=r.content,
                        score=r.score,
                        metadata=r.metadata,
                        search_method=r.source,
                        title=r.metadata.get("title"),
                        source_type=r.metadata.get("source_type"),
                        url=r.metadata.get("url"),
                    )
                )

        # Filter by minimum score
        final_results = [r for r in final_results if r.score >= self.config.min_score]

        metrics.total_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Advanced search completed: "
            f"query='{query[:50]}...', "
            f"mode={mode.value}, "
            f"results={len(final_results)}, "
            f"time={metrics.total_time_ms:.0f}ms"
        )

        return final_results, metrics

    def _get_mode_settings(self, mode: SearchMode) -> Dict[str, bool]:
        """Get settings for search mode."""
        settings = {
            SearchMode.FAST: {
                "expand": False,
                "hybrid": False,
                "use_bm25": False,
                "rerank": False,
                "diverse": False,
            },
            SearchMode.BALANCED: {
                "expand": True,
                "hybrid": True,
                "use_bm25": True,
                "rerank": False,
                "diverse": False,
            },
            SearchMode.PRECISE: {
                "expand": True,
                "hybrid": True,
                "use_bm25": True,
                "rerank": True,
                "diverse": False,
            },
            SearchMode.COMPREHENSIVE: {
                "expand": True,
                "hybrid": True,
                "use_bm25": True,
                "rerank": True,
                "diverse": True,
            },
        }
        return settings.get(mode, settings[SearchMode.BALANCED])

    async def search_with_context(
        self,
        query: str,
        context: Optional[str] = None,
        top_k: int = 5,
    ) -> tuple[List[AdvancedSearchResult], str]:
        """
        Search and format results for RAG context.

        Args:
            query: Search query
            context: Additional context to include
            top_k: Number of results

        Returns:
            Tuple of (results, formatted_context)
        """
        results, metrics = await self.search(query, top_k=top_k)

        # Format context for LLM
        context_parts = []
        if context:
            context_parts.append(f"Additional context:\n{context}\n")

        context_parts.append("Relevant information from knowledge base:\n")

        for i, result in enumerate(results, 1):
            source = result.title or result.source_type or "Unknown source"
            source_tag = (result.source_type or result.metadata.get("source_type") or "source").upper()
            context_parts.append(f"\n[{i} | {source_tag}] {source}:\n{result.content}\n")

        formatted_context = "\n".join(context_parts)
        return results, formatted_context

    async def multi_query_search(
        self,
        queries: List[str],
        top_k_per_query: int = 3,
        deduplicate: bool = True,
    ) -> List[AdvancedSearchResult]:
        """
        Search with multiple queries and merge results.

        Useful for decomposed queries or multi-aspect search.
        """
        # Search all queries in parallel
        tasks = [self.search(q, top_k=top_k_per_query) for q in queries]
        results_list = await asyncio.gather(*tasks)

        # Merge results
        all_results = []
        seen_chunks: set = set()

        for results, _ in results_list:
            for result in results:
                if deduplicate and result.chunk_id in seen_chunks:
                    continue
                seen_chunks.add(result.chunk_id)
                all_results.append(result)

        # Sort by score
        all_results.sort(key=lambda r: r.score, reverse=True)

        return all_results

    def format_context_for_rag(
        self,
        results: List[AdvancedSearchResult],
        max_tokens: int = 4000,
    ) -> str:
        """
        Format search results as context for RAG.

        Includes source citations and relevance scores.
        """
        if not results:
            return "No relevant information found in the knowledge base."

        context_parts = []
        estimated_tokens = 0
        tokens_per_char = 0.25  # Rough estimate

        for i, result in enumerate(results, 1):
            source = result.title or result.source_type or "Source"
            source_tag = (result.source_type or result.metadata.get("source_type") or "source").upper()
            score_str = f"(relevance: {result.score:.2f})"

            entry = f"\n[{i} | {source_tag}] {source} {score_str}:\n{result.content}\n"
            entry_tokens = len(entry) * tokens_per_char

            if estimated_tokens + entry_tokens > max_tokens:
                break

            context_parts.append(entry)
            estimated_tokens += entry_tokens

        if not context_parts:
            return "No relevant information found in the knowledge base."

        return "".join(context_parts)


# Singleton instance for convenience
_advanced_search: Optional[AdvancedSearchAggregator] = None


def get_advanced_search() -> AdvancedSearchAggregator:
    """Get or create the advanced search aggregator instance."""
    global _advanced_search
    if _advanced_search is None:
        _advanced_search = AdvancedSearchAggregator()
    return _advanced_search
