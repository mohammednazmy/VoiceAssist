"""
Search Tools for VoiceAssist

Provides web search (DuckDuckGo), PubMed search, and knowledge base search.
"""

import logging
import hashlib
import uuid
from typing import Any, Dict, List

import httpx
from app.services.tools.tool_service import ToolExecutionContext, ToolResult

logger = logging.getLogger(__name__)

_KB_RESULT_MAX_DOCS = 20
_KB_TITLE_MATCH_SCORE = 1.0


def _hash_query(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _parse_uuid(value: Any) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except Exception:
        return None


def _normalize_source_filters(raw_sources: Any) -> list[str]:
    if not raw_sources:
        return []
    if isinstance(raw_sources, str):
        raw_sources = [raw_sources]
    if not isinstance(raw_sources, list):
        return []
    normalized: list[str] = []
    for item in raw_sources:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())
    return normalized


async def _keyword_search_kb_documents(
    *,
    db_session: Any,
    query: str,
    user_id: str | None,
    max_results: int,
    sources: list[str],
) -> list[dict[str, Any]]:
    """Keyword search KB documents by title (Postgres ILIKE).

    This intentionally mirrors `/api/kb/documents/search` semantics so that
    voice tools and the KB UI see the same documents.
    """
    if not db_session:
        return []

    from sqlalchemy import text

    limit = max(1, min(int(max_results), _KB_RESULT_MAX_DOCS))
    query_like = f"%{query}%"
    user_uuid = _parse_uuid(user_id) if user_id else None

    # Apply loose source_type filtering: accept both raw source types and
    # common `user_{category}` prefixes used by the KB upload pipeline.
    source_types: list[str] = []
    if sources:
        for src in sources:
            source_types.append(src)
            if not src.startswith("user_"):
                source_types.append(f"user_{src}")
        source_types = sorted(set(source_types))

    # NOTE: we avoid interpolating any user-provided strings into SQL.
    clauses = ["title ILIKE :query_like"]
    params: dict[str, Any] = {"query_like": query_like, "limit": limit}

    if user_uuid:
        clauses.append("(owner_id = :user_id OR is_public = TRUE)")
        params["user_id"] = user_uuid
    else:
        clauses.append("is_public = TRUE")

    if source_types:
        clauses.append("source_type = ANY(:source_types)")
        params["source_types"] = source_types

    stmt = text(
        f"""
        SELECT
            document_id,
            title,
            source_type,
            created_at,
            total_pages,
            has_toc,
            has_figures,
            processing_stage,
            indexing_status
        FROM kb_documents
        WHERE {" AND ".join(clauses)}
        ORDER BY created_at DESC NULLS LAST
        LIMIT :limit
        """
    )

    result = await db_session.execute(stmt, params)
    rows = result.mappings().all()

    documents: list[dict[str, Any]] = []
    for row in rows:
        documents.append(
            {
                "id": row.get("document_id"),
                "title": row.get("title"),
                "category": row.get("source_type"),
                "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
                "relevance_score": _KB_TITLE_MATCH_SCORE,
                "match_type": "title_keyword",
                "indexing_status": row.get("indexing_status"),
                "processing_stage": row.get("processing_stage"),
                "total_pages": row.get("total_pages"),
                "has_toc": row.get("has_toc"),
                "has_figures": row.get("has_figures"),
            }
        )

    return documents


async def _semantic_search_kb_documents(
    *,
    query: str,
    max_results: int,
    sources: list[str],
    exclude_phi: bool,
) -> list[dict[str, Any]]:
    """Semantic search KB chunks via Qdrant/SearchAggregator.

    Returns one entry per unique document, with best score + short excerpt.
    """
    from app.services.search_aggregator import SearchAggregator

    limit = max(1, min(int(max_results), _KB_RESULT_MAX_DOCS))
    aggregator = SearchAggregator()

    filter_conditions: dict[str, Any] = {}
    if exclude_phi:
        allowed_risks = ["none", "low", "medium"]
        filter_conditions["phi_risk"] = allowed_risks
        filter_conditions["chunk_phi_risk"] = [*allowed_risks, None]
    if sources:
        filter_conditions["source_type"] = sources

    results = await aggregator.search(
        query=query,
        top_k=limit,
        score_threshold=0.65,
        filter_conditions=filter_conditions or None,
    )

    by_doc: dict[str, dict[str, Any]] = {}
    for res in results:
        doc_id = res.document_id
        if not doc_id:
            continue
        existing = by_doc.get(doc_id)
        if existing and existing["relevance_score"] >= res.score:
            continue

        excerpt = (res.content or "").strip()
        if len(excerpt) > 400:
            excerpt = excerpt[:400] + "…"

        by_doc[doc_id] = {
            "id": doc_id,
            "title": res.metadata.get("title", "Untitled"),
            "category": res.metadata.get("source_type", "unknown"),
            "created_at": None,
            "relevance_score": float(res.score),
            "match_type": "semantic",
            "excerpt": excerpt,
        }

    # Order by score desc
    ordered = sorted(by_doc.values(), key=lambda d: d.get("relevance_score", 0.0), reverse=True)
    return ordered[:limit]


async def handle_web_search(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    Search the web using SerpAPI (Google search) or DuckDuckGo fallback.

    Args:
        arguments: Contains 'query' and optional 'max_results'
        context: Execution context
    """
    from app.core.config import settings

    query = arguments.get("query")
    max_results = arguments.get("max_results", 5)

    if not query:
        return ToolResult(
            success=False,
            data=None,
            error="Search query is required",
            error_type="ValidationError",
        )

    try:
        # Use SerpAPI if API key is available (preferred - no rate limiting)
        if settings.SERPAPI_API_KEY:
            search_results = await _search_serpapi(query, max_results)
            if search_results:
                return ToolResult(
                    success=True,
                    data={
                        "query": query,
                        "results": search_results,
                        "count": len(search_results),
                        "source": "google",
                    },
                    message=f"Found {len(search_results)} results for '{query}'.",
                )

        # Fallback to DuckDuckGo if SerpAPI unavailable or failed
        instant_answer = await _get_duckduckgo_instant_answer(query)
        search_results = await _search_duckduckgo(query, max_results)

        # Check if we got results
        if not search_results and not instant_answer.get("abstract"):
            return ToolResult(
                success=True,
                data={
                    "query": query,
                    "instant_answer": "",
                    "results": [],
                    "count": 0,
                    "rate_limited": True,
                },
                message=(
                    f"Web search for '{query}' returned no results. "
                    "The search service may be temporarily unavailable due to rate limiting. "
                    "Try using PubMed search for medical topics, or try again in a few minutes."
                ),
            )

        return ToolResult(
            success=True,
            data={
                "query": query,
                "instant_answer": instant_answer.get("abstract", ""),
                "source": instant_answer.get("source", ""),
                "source_url": instant_answer.get("url", ""),
                "results": search_results,
                "count": len(search_results),
            },
            message=f"Found {len(search_results)} results for '{query}'.",
        )

    except Exception as e:
        logger.exception(f"Error in web search: {e}")
        return ToolResult(
            success=False,
            data=None,
            error=str(e),
            error_type=type(e).__name__,
        )


async def _search_serpapi(query: str, max_results: int) -> List[Dict[str, Any]]:
    """
    Search using SerpAPI (Google search results).

    Args:
        query: Search query
        max_results: Maximum number of results

    Returns:
        List of search results with title, url, snippet
    """
    from app.core.config import settings

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://serpapi.com/search.json",
                params={
                    "q": query,
                    "api_key": settings.SERPAPI_API_KEY,
                    "num": max_results,
                    "engine": "google",
                },
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()

        results = []
        for item in data.get("organic_results", [])[:max_results]:
            results.append(
                {
                    "title": item.get("title", ""),
                    "url": item.get("link", ""),
                    "snippet": item.get("snippet", ""),
                }
            )

        logger.info(f"SerpAPI search returned {len(results)} results for '{query}'")
        return results

    except Exception as e:
        logger.warning(f"SerpAPI search error: {e}")
        return []


async def _get_duckduckgo_instant_answer(query: str) -> Dict[str, Any]:
    """Get instant answer from DuckDuckGo API."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                    "no_redirect": 1,
                    "no_html": 1,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

        return {
            "abstract": data.get("AbstractText", ""),
            "source": data.get("AbstractSource", ""),
            "url": data.get("AbstractURL", ""),
            "heading": data.get("Heading", ""),
            "answer": data.get("Answer", ""),
        }
    except Exception as e:
        logger.warning(f"DuckDuckGo instant answer error: {e}")
        return {}


async def _search_duckduckgo(query: str, max_results: int) -> List[Dict[str, Any]]:
    """
    Search DuckDuckGo using the duckduckgo-search library.

    Falls back to API-based search if library not available.
    """
    import asyncio

    try:
        # Try using duckduckgo-search library with retry logic
        from duckduckgo_search import DDGS
        from duckduckgo_search.exceptions import RatelimitException

        results = []
        max_retries = 3

        for attempt in range(max_retries):
            try:
                with DDGS() as ddgs:
                    for r in ddgs.text(query, max_results=max_results):
                        results.append(
                            {
                                "title": r.get("title", ""),
                                "url": r.get("href", ""),
                                "snippet": r.get("body", ""),
                            }
                        )
                return results
            except RatelimitException:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2  # 2, 4, 6 seconds
                    logger.warning(
                        f"DuckDuckGo rate limited, waiting {wait_time}s (attempt {attempt + 1}/{max_retries})"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.warning("DuckDuckGo rate limit exceeded after retries")
                    raise
            except Exception as e:
                if "Ratelimit" in str(e):
                    if attempt < max_retries - 1:
                        wait_time = (attempt + 1) * 2
                        logger.warning(
                            f"DuckDuckGo rate limited, waiting {wait_time}s (attempt {attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                    else:
                        raise
                else:
                    raise

        return results

    except ImportError:
        logger.warning("duckduckgo-search not installed, using API fallback")
        return await _search_duckduckgo_api_fallback(query, max_results)
    except Exception as e:
        logger.warning(f"DuckDuckGo search error: {e}")
        # Return empty results with a note about rate limiting
        return []


async def _search_duckduckgo_api_fallback(query: str, max_results: int) -> List[Dict[str, Any]]:
    """Fallback API-based search using DuckDuckGo's related topics."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

        results = []

        # Get related topics as search results
        for topic in data.get("RelatedTopics", [])[:max_results]:
            if isinstance(topic, dict) and "FirstURL" in topic:
                results.append(
                    {
                        "title": topic.get("Text", "")[:100],
                        "url": topic.get("FirstURL", ""),
                        "snippet": topic.get("Text", ""),
                    }
                )

        return results

    except Exception as e:
        logger.warning(f"DuckDuckGo API fallback error: {e}")
        return []


async def handle_pubmed_search(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    Search PubMed for medical literature.

    Args:
        arguments: Contains 'query', optional 'max_results', 'date_range', 'article_types'
        context: Execution context
    """
    query = arguments.get("query")
    max_results = arguments.get("max_results", 5)
    date_range = arguments.get("date_range")
    article_types = arguments.get("article_types", [])

    if not query:
        return ToolResult(
            success=False,
            data=None,
            error="Search query is required",
            error_type="ValidationError",
        )

    try:
        # Use the existing EnhancedPubMedService
        from app.services.pubmed_enhanced_service import EnhancedPubMedService

        pubmed_service = EnhancedPubMedService()

        # Build search parameters
        search_query = query

        # Add date filter
        if date_range:
            if date_range.isdigit() and len(date_range) == 4:
                # Year filter
                search_query += f" AND {date_range}[pdat]"
            elif "year" in date_range.lower():
                # Parse "last X years"
                import re

                match = re.search(r"(\d+)\s*year", date_range.lower())
                if match:
                    years = int(match.group(1))
                    from datetime import datetime

                    start_year = datetime.now().year - years
                    search_query += f" AND {start_year}:{datetime.now().year}[pdat]"

        # Add article type filters
        if article_types:
            type_filter = " OR ".join(f"{t}[pt]" for t in article_types)
            search_query += f" AND ({type_filter})"

        # Perform search
        results = await pubmed_service.search(search_query, max_results=max_results)

        articles = []
        for article in results.articles:
            # Get journal name - handle both string and object types
            journal_name = article.journal
            if hasattr(article.journal, "name"):
                journal_name = article.journal.name

            articles.append(
                {
                    "pmid": article.pmid,
                    "title": article.title,
                    "authors": article.authors[:3] + (["et al."] if len(article.authors) > 3 else []),
                    "journal": journal_name,
                    "pub_date": article.pub_date,
                    "abstract": (
                        (article.abstract[:500] + "...")
                        if article.abstract and len(article.abstract) > 500
                        else article.abstract
                    ),
                    "doi": article.doi,
                    "publication_types": article.publication_types,
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/",
                }
            )

        return ToolResult(
            success=True,
            data={
                "query": query,
                "articles": articles,
                "count": len(articles),
                "total_found": results.total_count,
            },
            message=f"Found {len(articles)} articles on PubMed for '{query}'.",
        )

    except Exception as e:
        logger.exception(f"Error in PubMed search: {e}")
        return ToolResult(
            success=False,
            data=None,
            error=str(e),
            error_type=type(e).__name__,
        )


async def handle_kb_search(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    Search the knowledge base for relevant information.

    Args:
        arguments: Contains 'query', optional 'sources', 'max_results'
        context: Execution context
    """
    query = arguments.get("query")
    sources = _normalize_source_filters(arguments.get("sources", []))
    max_results = arguments.get("max_results", 5)

    if not query:
        return ToolResult(
            success=False,
            data=None,
            error="Search query is required",
            error_type="ValidationError",
        )

    query_str = str(query).strip()
    if not query_str:
        return ToolResult(
            success=False,
            data=None,
            error="Search query cannot be empty",
            error_type="ValidationError",
        )

    try:
        max_results_int = int(max_results)
    except (TypeError, ValueError):
        max_results_int = 5
    max_results_int = max(1, min(max_results_int, _KB_RESULT_MAX_DOCS))

    query_hash = _hash_query(query_str)

    documents: list[dict[str, Any]] = []
    doc_by_id: dict[str, dict[str, Any]] = {}

    # 1) Keyword title search (DB-backed) for reliable document discovery.
    keyword_docs: list[dict[str, Any]] = []
    keyword_sources_widened = False
    try:
        keyword_docs = await _keyword_search_kb_documents(
            db_session=context.db_session,
            query=query_str,
            user_id=context.user_id,
            max_results=max_results_int,
            sources=sources,
        )
        # Tool callers sometimes over-constrain `sources` (e.g. "textbook")
        # even when searching for a user-uploaded book. If we get zero keyword
        # matches, retry without the source filter so title lookups succeed.
        if not keyword_docs and sources:
            keyword_docs = await _keyword_search_kb_documents(
                db_session=context.db_session,
                query=query_str,
                user_id=context.user_id,
                max_results=max_results_int,
                sources=[],
            )
            keyword_sources_widened = True
        for doc in keyword_docs:
            doc_id = str(doc.get("id") or "")
            if doc_id:
                doc_by_id[doc_id] = doc
    except Exception as exc:
        logger.warning(
            "kb_search_keyword_failed",
            extra={"query_hash": query_hash, "error": str(exc)},
        )

    # 2) Semantic search (Qdrant) to surface relevant KB content even when the
    # title does not match exactly. Skip when we already have strong keyword
    # matches to keep title-based lookups fast (no embedding roundtrip).
    semantic_docs: list[dict[str, Any]] = []
    semantic_sources_widened = False
    try:
        if not doc_by_id:
            semantic_docs = await _semantic_search_kb_documents(
                query=query_str,
                max_results=max_results_int,
                sources=sources,
                exclude_phi=bool(getattr(context, "exclude_phi", False)),
            )
            if not semantic_docs and sources:
                semantic_docs = await _semantic_search_kb_documents(
                    query=query_str,
                    max_results=max_results_int,
                    sources=[],
                    exclude_phi=bool(getattr(context, "exclude_phi", False)),
                )
                semantic_sources_widened = True

            for doc in semantic_docs:
                doc_id = str(doc.get("id") or "")
                if not doc_id:
                    continue
                if doc_id in doc_by_id:
                    continue
                doc_by_id[doc_id] = doc
    except Exception as exc:
        logger.warning(
            "kb_search_semantic_failed",
            extra={"query_hash": query_hash, "error": str(exc)},
        )

    documents = sorted(doc_by_id.values(), key=lambda d: d.get("relevance_score", 0.0), reverse=True)[
        :max_results_int
    ]

    # Consistent "sources" shape for downstream metrics/UI: one per document.
    sources_out: list[dict[str, Any]] = []
    for doc in documents:
        sources_out.append(
            {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "category": doc.get("category"),
                "score": doc.get("relevance_score"),
            }
        )

    logger.info(
        "kb_search_completed",
        extra={
            "query_hash": query_hash,
            "sources_filter": sources,
            "keyword_sources_widened": keyword_sources_widened,
            "semantic_sources_widened": semantic_sources_widened,
            "keyword_hits": len(keyword_docs),
            "semantic_hits": len(semantic_docs),
            "returned": len(documents),
        },
    )

    if documents:
        return ToolResult(
            success=True,
            data={
                "query": query_str,
                "documents": documents,
                "sources": sources_out,
                "count": len(documents),
            },
            message=f"Found {len(documents)} knowledge base documents matching your query.",
        )

    # Final fallback: use legacy hybrid search as a best-effort search surface.
    try:
        from app.services.hybrid_search_service import HybridSearchService

        search_service = HybridSearchService()

        filters = None
        if getattr(context, "exclude_phi", False):
            allowed_risks = ["none", "low", "medium"]
            filters = {"phi_risk": allowed_risks}

        results = await search_service.search(
            query=query_str,
            top_k=max_results_int,
            filters=filters,
        )

        legacy_docs: list[dict[str, Any]] = []
        for doc in results:
            legacy_docs.append(
                {
                    "id": doc.id,
                    "title": doc.title,
                    "category": doc.source_type,
                    "created_at": None,
                    "relevance_score": doc.score,
                    "match_type": "hybrid_fallback",
                    "excerpt": ((doc.content or "")[:400] + "…") if doc.content and len(doc.content) > 400 else doc.content,
                }
            )

        return ToolResult(
            success=True,
            data={
                "query": query_str,
                "documents": legacy_docs,
                "sources": [
                    {
                        "id": d.get("id"),
                        "title": d.get("title"),
                        "category": d.get("category"),
                        "score": d.get("relevance_score"),
                    }
                    for d in legacy_docs
                ],
                "count": len(legacy_docs),
            },
            message=(
                f"Found {len(legacy_docs)} relevant documents in the knowledge base via fallback search."
                if legacy_docs
                else "No knowledge base documents matched your query."
            ),
        )

    except Exception as inner:
        logger.exception("Fallback KB search failed: %s", inner)
        return ToolResult(
            success=False,
            data=None,
            error=str(inner),
            error_type=type(inner).__name__,
        )


async def handle_knowledge_base_query(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    Run a RAG-style query over the medical knowledge base.

    This tool mirrors the semantics of the HTTP /api/kb/query endpoint:
    - Accepts a 'question' plus optional context parameters
    - Returns a concise answer string and a list of KB sources
    """
    question = arguments.get("question")
    context_documents = arguments.get("context_documents") or 5

    if not question or not isinstance(question, str) or not question.strip():
        return ToolResult(
            success=False,
            data=None,
            error="Question is required",
            error_type="ValidationError",
        )

    # Clamp context_documents to a safe range
    try:
        context_docs_int = int(context_documents)
    except (TypeError, ValueError):
        context_docs_int = 5

    context_docs_int = max(1, min(20, context_docs_int))

    question_str = question.strip()
    query_hash = _hash_query(question_str)

    try:
        from app.services.search_aggregator import SearchAggregator

        aggregator = SearchAggregator()

        filter_conditions: dict[str, Any] | None = None
        if bool(getattr(context, "exclude_phi", False)):
            allowed_risks = ["none", "low", "medium"]
            filter_conditions = {
                "phi_risk": allowed_risks,
                "chunk_phi_risk": [*allowed_risks, None],
            }

        # Pull more chunks than the final source count so citations can
        # de-duplicate across documents.
        top_k = max(context_docs_int * 5, 10)
        results = await aggregator.search(
            query=question_str,
            top_k=top_k,
            score_threshold=0.65,
            filter_conditions=filter_conditions,
        )

        citations = aggregator.extract_citations(results)
        synthesis = aggregator.synthesize_across_documents(results)
        retrieval_confidence = aggregator.confidence_score(results)

        sources: list[dict[str, Any]] = []
        for cite in citations[:context_docs_int]:
            sources.append(
                {
                    "id": cite.get("id"),
                    "title": cite.get("title"),
                    "category": cite.get("source_type"),
                    "score": cite.get("relevance_score"),
                }
            )

        context_text = synthesis.get("context", "") or ""
        if len(context_text) > 3000:
            context_text = context_text[:3000] + "…"

        logger.info(
            "knowledge_base_query_retrieved",
            extra={
                "query_hash": query_hash,
                "chunks": len(results),
                "sources": len(sources),
                "confidence": retrieval_confidence,
            },
        )

        return ToolResult(
            success=True,
            data={
                "question": question_str,
                "context": context_text,
                "sources": sources,
                "documents": synthesis.get("documents", []),
                "retrieval_confidence": retrieval_confidence,
            },
            message=(
                f"Retrieved {len(sources)} knowledge base sources. "
                "Use the provided context excerpts to answer the question."
            ),
        )

    except Exception as e:
        logger.exception("Error in knowledge_base_query tool: %s", e)

        # Best-effort fallback: reuse kb_search semantics so that the assistant
        # can still surface candidate documents even if Qdrant/embeddings fail.
        try:
            kb_result = await handle_kb_search(
                {"query": question_str, "max_results": context_docs_int},
                context,
            )
            if kb_result.success and isinstance(kb_result.data, dict):
                data = dict(kb_result.data)
                data.pop("query", None)
                return ToolResult(
                    success=True,
                    data={
                        "question": question_str,
                        "context": "",
                        "sources": data.get("sources", []),
                        "documents": data.get("documents", []),
                        "retrieval_confidence": 0.0,
                    },
                    message=kb_result.message
                    or "Retrieved candidate documents from the knowledge base (fallback).",
                )
            return kb_result
        except Exception as inner:
            logger.exception("Fallback knowledge_base_query via kb_search failed: %s", inner)
            return ToolResult(
                success=False,
                data=None,
                error=str(inner),
                error_type=type(inner).__name__,
            )
