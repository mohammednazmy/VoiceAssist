"""
Search Tools for VoiceAssist

Provides web search (DuckDuckGo), PubMed search, and knowledge base search.
"""

import logging
from typing import Any, Dict, List

import httpx
from app.services.tools.tool_service import ToolExecutionContext, ToolResult

logger = logging.getLogger(__name__)


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
    sources = arguments.get("sources", [])
    max_results = arguments.get("max_results", 5)

    if not query:
        return ToolResult(
            success=False,
            data=None,
            error="Search query is required",
            error_type="ValidationError",
        )

    try:
        # Prefer the unified KB + RAG surface when available so that voice
        # flows and chat share the same KB contract. We scope to the current
        # user implicitly via the auth dependency used by /api/kb/query.
        from app.services.rag_service import QueryOrchestrator, QueryRequest

        orchestrator = QueryOrchestrator(enable_rag=False)
        # ToolExecutionContext exposes conversation/session identifiers and
        # PHI-conscious flags so that voice-mode RAG calls can share the same
        # behavior as HTTP-based advanced search.
        session_id = context.session_id or context.conversation_id
        req = QueryRequest(
            session_id=session_id,
            query=query,
            clinical_context_id=context.clinical_context_id,
            exclude_phi=bool(context.exclude_phi),
        )

        rag_result = await orchestrator.run_query(req)

        # Normalize into a ToolResult that contains an answer and sources.
        # We intentionally keep the shape close to /api/kb/query so that
        # downstream code can treat voice and HTTP RAG answers uniformly.
        data = {
            "query": query,
            "answer": rag_result.answer if hasattr(rag_result, "answer") else rag_result.content,
            "sources": getattr(rag_result, "sources", []),
        }

        return ToolResult(
            success=True,
            data=data,
            message="Knowledge base RAG answer generated via unified KB pipeline.",
        )

    except Exception as e:
        # Fallback: if the unified RAG path fails for any reason, use the
        # legacy hybrid search implementation as a best-effort search.
        logger.exception(f"Error in KB search via RAG pipeline: {e}")
        try:
            from app.services.hybrid_search_service import HybridSearchService

            search_service = HybridSearchService()

            # Preserve PHI-conscious filtering in fallback path
            filters = None
            if context.exclude_phi:
                # Only include chunks where PHI risk is not "high"
                allowed_risks = ["none", "low", "medium"]
                filters = {"phi_risk": allowed_risks}
                logger.info(
                    "KB search fallback using PHI-conscious filters: %s",
                    allowed_risks,
                )

            results = await search_service.search(
                query=query,
                top_k=max_results,
                filters=filters,
            )

            documents = []
            for doc in results:
                documents.append(
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "content": (doc.content[:500] + "..." if len(doc.content) > 500 else doc.content),
                        "source_type": doc.source_type,
                        "source_name": doc.source_name,
                        "location": doc.location,
                        "relevance_score": doc.score,
                    }
                )

            return ToolResult(
                success=True,
                data={
                    "query": query,
                    "documents": documents,
                    "count": len(documents),
                },
                message=f"Found {len(documents)} relevant documents in the knowledge base (fallback search).",
            )

        except Exception as inner:
            logger.exception(f"Fallback KB search failed: {inner}")
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

    try:
        from app.services.rag_service import QueryOrchestrator, QueryRequest

        # Prefer full RAG for this tool so that it behaves like the HTTP KB
        # query surface, but keep it configurable via rag_top_k so callers can
        # influence how many documents are consulted.
        orchestrator = QueryOrchestrator(enable_rag=True, rag_top_k=context_docs_int)

        session_id = context.session_id or context.conversation_id
        req = QueryRequest(
            session_id=session_id,
            query=question,
            clinical_context_id=arguments.get("clinical_context_id") or context.clinical_context_id,
            exclude_phi=bool(context.exclude_phi),
        )

        rag_result = await orchestrator.run_query(req)

        # Map RAG citations into the same lightweight source shape used by
        # /api/kb/query and the frontend KB components.
        sources: List[Dict[str, Any]] = []
        for citation in rag_result.citations:
            sources.append(
                {
                    "id": citation.id or citation.source_id,
                    "title": citation.title,
                    "category": citation.source_type,
                    "score": citation.relevance_score,
                }
            )

        data = {
            "question": question,
            "answer": rag_result.answer,
            "sources": sources,
        }

        return ToolResult(
            success=True,
            data=data,
            message="Knowledge base answer generated via unified RAG pipeline.",
        )

    except Exception as e:
        logger.exception(f"Error in knowledge_base_query tool: {e}")
        # Best-effort fallback: reuse kb_search semantics so that the LLM still
        # receives an answer and sources when possible.
        try:
            kb_result = await handle_kb_search(
                {"query": question, "max_results": context_docs_int},
                context,
            )
            return kb_result
        except Exception as inner:
            logger.exception(f"Fallback knowledge_base_query via kb_search failed: {inner}")
            return ToolResult(
                success=False,
                data=None,
                error=str(inner),
                error_type=type(inner).__name__,
            )
