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
    Search the web using DuckDuckGo.

    Args:
        arguments: Contains 'query' and optional 'max_results'
        context: Execution context
    """
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
        # Use DuckDuckGo Instant Answer API for quick answers
        instant_answer = await _get_duckduckgo_instant_answer(query)

        # Use DuckDuckGo HTML search for actual results
        search_results = await _search_duckduckgo(query, max_results)

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
    try:
        # Try using duckduckgo-search library
        from duckduckgo_search import DDGS

        results = []
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

    except ImportError:
        logger.warning("duckduckgo-search not installed, using API fallback")
        return await _search_duckduckgo_api_fallback(query, max_results)
    except Exception as e:
        logger.warning(f"DuckDuckGo search error: {e}")
        return await _search_duckduckgo_api_fallback(query, max_results)


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
            articles.append(
                {
                    "pmid": article.pmid,
                    "title": article.title,
                    "authors": article.authors[:3] + (["et al."] if len(article.authors) > 3 else []),
                    "journal": article.journal,
                    "year": article.year,
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
        # Use the hybrid search service
        from app.services.hybrid_search_service import HybridSearchService

        search_service = HybridSearchService()

        # Perform search
        results = await search_service.search(
            query=query,
            top_k=max_results,
            source_types=sources if sources else None,
        )

        documents = []
        for doc in results:
            documents.append(
                {
                    "id": doc.id,
                    "title": doc.title,
                    "content": doc.content[:500] + "..." if len(doc.content) > 500 else doc.content,
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
            message=f"Found {len(documents)} relevant documents in the knowledge base.",
        )

    except Exception as e:
        logger.exception(f"Error in KB search: {e}")
        return ToolResult(
            success=False,
            data=None,
            error=str(e),
            error_type=type(e).__name__,
        )
