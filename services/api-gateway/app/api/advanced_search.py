"""
Advanced Search API Endpoints (Phase 5 - Advanced RAG)

Provides API endpoints for advanced search features:
- Hybrid search (BM25 + Vector)
- Re-ranking
- Query expansion
- Search analytics
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.dependencies import get_current_user
from app.services.advanced_search import AdvancedSearchResult, SearchMetrics, SearchMode, get_advanced_search
from app.services.query_expansion import ExpansionMethod, QueryExpansionService
from app.services.reranking_service import RerankerType
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


# ===================================
# Request/Response Models
# ===================================


class SearchRequest(BaseModel):
    """Advanced search request."""

    query: str = Field(..., description="Search query", min_length=1, max_length=1000)
    top_k: int = Field(10, ge=1, le=50, description="Number of results")
    mode: Optional[str] = Field(None, description="Search mode: fast, balanced, precise, comprehensive")
    filters: Optional[Dict[str, Any]] = Field(
        None,
        description="Metadata filters (e.g., source_type, date_range, phi_risk)",
    )
    exclude_phi: bool = Field(
        False,
        description="When true, exclude high-risk PHI KB chunks from results.",
    )
    include_metrics: bool = Field(False, description="Include search metrics in response")


class MultiQuerySearchRequest(BaseModel):
    """Multi-query search request."""

    queries: List[str] = Field(..., description="List of queries to search", min_items=1, max_items=5)
    top_k_per_query: int = Field(3, ge=1, le=10, description="Results per query")
    deduplicate: bool = Field(True, description="Remove duplicate results")


class QueryExpansionRequest(BaseModel):
    """Query expansion request."""

    query: str = Field(..., description="Query to expand")
    methods: Optional[List[str]] = Field(
        None, description="Expansion methods: abbreviation, synonym, llm_reformulation"
    )


class RerankerRequest(BaseModel):
    """Re-ranking request."""

    query: str = Field(..., description="Original query")
    documents: List[str] = Field(..., description="Documents to re-rank", min_items=1, max_items=100)
    top_n: int = Field(10, ge=1, le=50, description="Number of results after re-ranking")
    reranker: Optional[str] = Field(None, description="Reranker type: cohere, openai, cross_encoder")


class SearchResultResponse(BaseModel):
    """Search result in API response."""

    chunk_id: str
    document_id: str
    content: str
    score: float
    title: Optional[str] = None
    source_type: Optional[str] = None
    url: Optional[str] = None
    source_tag: Optional[str] = None
    metadata: Dict[str, Any] = {}


class SearchMetricsResponse(BaseModel):
    """Search metrics in API response."""

    total_time_ms: float
    embedding_time_ms: float
    search_time_ms: float
    rerank_time_ms: float
    expansion_time_ms: float
    results_found: int
    results_after_rerank: int
    query_expanded: bool
    reranking_applied: bool


# ===================================
# Helper Functions
# ===================================


def result_to_response(result: AdvancedSearchResult) -> Dict[str, Any]:
    """Convert internal result to API response format."""
    source_tag = (result.source_type or result.metadata.get("source_type") or "unknown").upper()
    return {
        "chunk_id": result.chunk_id,
        "document_id": result.document_id,
        "content": result.content,
        "score": result.score,
        "title": result.title,
        "source_type": result.source_type,
        "url": result.url,
        "source_tag": source_tag,
        "metadata": result.metadata,
        "search_method": result.search_method,
    }


def metrics_to_response(metrics: SearchMetrics) -> Dict[str, Any]:
    """Convert internal metrics to API response format."""
    return {
        "total_time_ms": round(metrics.total_time_ms, 2),
        "embedding_time_ms": round(metrics.embedding_time_ms, 2),
        "search_time_ms": round(metrics.search_time_ms, 2),
        "rerank_time_ms": round(metrics.rerank_time_ms, 2),
        "expansion_time_ms": round(metrics.expansion_time_ms, 2),
        "results_found": metrics.results_found,
        "results_after_rerank": metrics.results_after_rerank,
        "query_expanded": metrics.query_expanded,
        "reranking_applied": metrics.reranking_applied,
    }


# ===================================
# Search Endpoints
# ===================================


@router.post("/advanced")
async def advanced_search(
    request: SearchRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Perform advanced search with hybrid retrieval and optional re-ranking.

    Search modes:
    - fast: Quick vector search only
    - balanced: Hybrid search (BM25 + vector) with query expansion
    - precise: Adds re-ranking for higher precision
    - comprehensive: Maximum recall with diversity filtering
    """
    try:
        search = get_advanced_search()

        # Parse search mode
        mode = SearchMode.BALANCED
        if request.mode:
            try:
                mode = SearchMode(request.mode.lower())
            except ValueError:
                return error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message=f"Invalid search mode: {request.mode}. "
                    f"Valid modes: fast, balanced, precise, comprehensive",
                )

        # Build filters, optionally excluding PHI-heavy chunks
        filters = request.filters or {}
        if request.exclude_phi:
            # Only include chunks where phi_risk is not 'high'. This expects
            # phi_risk to be stored as a payload field in Qdrant metadata.
            filters["phi_risk"] = ["none", "low", "medium"]

        # Perform search
        results, metrics = await search.search(
            query=request.query,
            top_k=request.top_k,
            mode=mode,
            filters=filters or None,
        )

        response_data = {
            "query": request.query,
            "mode": mode.value,
            "results": [result_to_response(r) for r in results],
            "total_results": len(results),
        }

        if filters:
            response_data["applied_filters"] = filters

        if request.include_metrics:
            response_data["metrics"] = metrics_to_response(metrics)

        return success_response(data=response_data)

    except Exception as e:
        logger.error(f"Advanced search error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Search failed",
        )


@router.get("/")
async def simple_search(
    q: str = Query(..., description="Search query", min_length=1),
    top_k: int = Query(10, ge=1, le=50, description="Number of results"),
    source_types: Optional[List[str]] = Query(
        None,
        description="Optional source_type filters (e.g., pubmed, guideline)",
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Simple search endpoint (GET).

    Uses balanced mode by default.
    """
    try:
        search = get_advanced_search()

        filters = {"source_type": source_types} if source_types else None

        results, metrics = await search.search(
            query=q,
            top_k=top_k,
            mode=SearchMode.BALANCED,
            filters=filters,
        )

        return success_response(
            data={
                "query": q,
                "results": [result_to_response(r) for r in results],
                "total_results": len(results),
                "time_ms": round(metrics.total_time_ms, 2),
                "applied_filters": filters or {},
            }
        )

    except Exception as e:
        logger.error(f"Simple search error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Search failed",
        )


@router.post("/multi")
async def multi_query_search(
    request: MultiQuerySearchRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Search with multiple queries and merge results.

    Useful for:
    - Searching different aspects of a topic
    - Fallback queries
    - Query decomposition results
    """
    try:
        search = get_advanced_search()

        results = await search.multi_query_search(
            queries=request.queries,
            top_k_per_query=request.top_k_per_query,
            deduplicate=request.deduplicate,
        )

        return success_response(
            data={
                "queries": request.queries,
                "results": [result_to_response(r) for r in results],
                "total_results": len(results),
            }
        )

    except Exception as e:
        logger.error(f"Multi-query search error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Multi-query search failed",
        )


# ===================================
# Query Expansion Endpoints
# ===================================


@router.post("/expand")
async def expand_query(
    request: QueryExpansionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Expand a query with related terms.

    Expansion methods:
    - abbreviation: Expand medical abbreviations
    - synonym: Add medical synonyms
    - llm_reformulation: Use LLM to suggest alternatives
    """
    try:
        expander = QueryExpansionService()

        # Parse expansion methods
        methods = None
        if request.methods:
            methods = []
            for m in request.methods:
                try:
                    methods.append(ExpansionMethod(m.lower()))
                except ValueError:
                    return error_response(
                        code=ErrorCodes.VALIDATION_ERROR,
                        message=f"Invalid expansion method: {m}",
                    )

        result = await expander.expand(request.query, methods=methods)

        return success_response(
            data={
                "original_query": result.original_query,
                "expanded_query": result.expanded_query,
                "expansion_terms": result.expansion_terms,
                "method": result.method,
            }
        )

    except Exception as e:
        logger.error(f"Query expansion error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Query expansion failed",
        )


@router.post("/decompose")
async def decompose_query(
    query: str = Query(..., description="Complex query to decompose"),
    current_user: dict = Depends(get_current_user),
):
    """
    Decompose a complex query into simpler sub-queries.

    Useful for multi-aspect questions like:
    "What are the symptoms, causes, and treatment of diabetes?"
    """
    try:
        expander = QueryExpansionService()
        sub_queries = await expander.decompose(query)

        return success_response(
            data={
                "original_query": query,
                "sub_queries": sub_queries,
                "count": len(sub_queries),
            }
        )

    except Exception as e:
        logger.error(f"Query decomposition error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Query decomposition failed",
        )


# ===================================
# Re-ranking Endpoints
# ===================================


@router.post("/rerank")
async def rerank_documents(
    request: RerankerRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Re-rank a list of documents by relevance to a query.

    Available rerankers:
    - cohere: Cohere Rerank API (high quality)
    - openai: OpenAI embedding similarity
    - cross_encoder: Local cross-encoder model
    """
    try:
        from app.services.reranking_service import RerankerConfig, RerankingService

        # Parse reranker type
        reranker_type = RerankerType.COHERE
        if request.reranker:
            try:
                reranker_type = RerankerType(request.reranker.lower())
            except ValueError:
                return error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message=f"Invalid reranker: {request.reranker}",
                )

        reranker = RerankingService(
            config=RerankerConfig(
                reranker_type=reranker_type,
                top_n=request.top_n,
            )
        )

        # Convert documents to expected format
        results_dicts = [{"content": doc, "chunk_id": str(i), "score": 1.0} for i, doc in enumerate(request.documents)]

        reranked = await reranker.rerank(
            query=request.query,
            results=results_dicts,
        )

        return success_response(
            data={
                "query": request.query,
                "reranker": reranker_type.value,
                "results": [
                    {
                        "index": int(r.chunk_id),
                        "content": (r.content[:200] + "..." if len(r.content) > 200 else r.content),
                        "score": round(r.final_score, 4),
                        "rerank_score": round(r.rerank_score, 4),
                    }
                    for r in reranked
                ],
            }
        )

    except Exception as e:
        logger.error(f"Re-ranking error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Re-ranking failed",
        )


# ===================================
# RAG Context Endpoints
# ===================================


@router.post("/context")
async def get_rag_context(
    query: str = Query(..., description="Query for context retrieval"),
    top_k: int = Query(5, ge=1, le=20, description="Number of context chunks"),
    max_tokens: int = Query(4000, ge=500, le=8000, description="Max context tokens"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get formatted RAG context for a query.

    Returns search results formatted for LLM consumption
    with source citations.
    """
    try:
        search = get_advanced_search()

        results, metrics = await search.search(
            query=query,
            top_k=top_k,
            mode=SearchMode.PRECISE,
        )

        formatted_context = search.format_context_for_rag(results, max_tokens=max_tokens)

        return success_response(
            data={
                "query": query,
                "context": formatted_context,
                "sources": [
                    {
                        "title": r.title,
                        "source_type": r.source_type,
                        "score": round(r.score, 3),
                    }
                    for r in results
                ],
                "num_sources": len(results),
                "time_ms": round(metrics.total_time_ms, 2),
            }
        )

    except Exception as e:
        logger.error(f"RAG context error: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get RAG context",
        )


# ===================================
# Search Analytics Endpoints
# ===================================


@router.get("/modes")
async def list_search_modes():
    """List available search modes and their descriptions."""
    return success_response(
        data={
            "modes": [
                {
                    "name": "fast",
                    "description": "Quick vector search only. Best for simple queries.",
                    "features": ["vector_search"],
                },
                {
                    "name": "balanced",
                    "description": "Hybrid search with query expansion. Good balance of speed and quality.",
                    "features": ["vector_search", "bm25_search", "query_expansion"],
                },
                {
                    "name": "precise",
                    "description": "Adds re-ranking for higher precision. Best for important queries.",
                    "features": [
                        "vector_search",
                        "bm25_search",
                        "query_expansion",
                        "reranking",
                    ],
                },
                {
                    "name": "comprehensive",
                    "description": "Maximum recall with diversity filtering. Best for research queries.",
                    "features": [
                        "vector_search",
                        "bm25_search",
                        "query_expansion",
                        "reranking",
                        "diversity",
                    ],
                },
            ]
        }
    )


@router.get("/rerankers")
async def list_rerankers():
    """List available re-rankers and their descriptions."""
    return success_response(
        data={
            "rerankers": [
                {
                    "name": "cohere",
                    "description": "Cohere Rerank API. High quality, requires API key.",
                    "requires_api_key": True,
                },
                {
                    "name": "openai",
                    "description": "OpenAI embedding similarity. Uses existing API.",
                    "requires_api_key": True,
                },
                {
                    "name": "cross_encoder",
                    "description": "Local cross-encoder model. No API needed, requires GPU for speed.",
                    "requires_api_key": False,
                },
                {
                    "name": "llm_based",
                    "description": "LLM-based scoring. Most expensive but can reason.",
                    "requires_api_key": True,
                },
            ]
        }
    )
