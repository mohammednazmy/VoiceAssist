"""
VoiceAssist V2 - Web Search Tool

Medical-focused web search using DuckDuckGo.

Tool:
- web_search_medical: Web search filtered to trusted medical sources
"""

import logging
import re
from datetime import datetime
from html import unescape
from typing import List, Optional
from urllib.parse import quote_plus, urlparse

import httpx
from pydantic import BaseModel, Field

from app.tools.base import ToolCategory, RiskLevel, ToolDefinition, ToolResult

logger = logging.getLogger(__name__)

# Trusted medical domains for filtering
TRUSTED_MEDICAL_DOMAINS = [
    "nih.gov",
    "cdc.gov",
    "who.int",
    "mayoclinic.org",
    "clevelandclinic.org",
    "webmd.com",
    "medlineplus.gov",
    "hopkinsmedicine.org",
    "health.harvard.edu",
    "ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "jamanetwork.com",
    "nejm.org",
    "thelancet.com",
    "bmj.com",
    "aafp.org",
    "acc.org",
    "heart.org",
    "diabetes.org",
    "cancer.org",
    "cancer.gov",
    "uptodate.com",
    "medscape.com",
]


# Tool 10: Web Search (Medical)
class WebSearchMedicalArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    max_results: Optional[int] = Field(5, ge=1, le=20)
    domain_filter: Optional[List[str]] = Field(None, description="Filter to specific domains")


class WebSearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    domain: str
    date: Optional[str] = None


class WebSearchMedicalResponse(BaseModel):
    results: List[WebSearchResult]
    total_count: int
    query: str


WEB_SEARCH_MEDICAL_DEF = ToolDefinition(
    name="web_search_medical",
    description="Search the web for current medical information. Filtered to trusted medical sources (NIH, CDC, medical journals).",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5},
            "domain_filter": {"type": "array", "items": {"type": "string"}, "description": "Filter to domains (e.g., ['nih.gov', 'cdc.gov'])"}
        },
        "required": ["query"]
    },
    category=ToolCategory.SEARCH,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=20,
    timeout_seconds=10
)


def _extract_domain(url: str) -> str:
    """Extract the domain from a URL."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Remove www. prefix
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def _is_trusted_medical_domain(url: str, domain_filter: Optional[List[str]] = None) -> bool:
    """Check if URL is from a trusted medical domain."""
    domain = _extract_domain(url)
    if not domain:
        return False

    # Use custom filter if provided, otherwise use default trusted domains
    allowed_domains = domain_filter if domain_filter else TRUSTED_MEDICAL_DOMAINS

    for trusted in allowed_domains:
        if domain == trusted or domain.endswith(f".{trusted}"):
            return True
    return False


async def _duckduckgo_search(
    query: str,
    max_results: int = 10,
    domain_filter: Optional[List[str]] = None,
) -> List[WebSearchResult]:
    """
    Search DuckDuckGo and return results.

    Uses DuckDuckGo's HTML lite interface which doesn't require API keys.

    Args:
        query: Search query
        max_results: Maximum results to return
        domain_filter: Optional list of domains to filter to

    Returns:
        List of WebSearchResult objects
    """
    # Build site-restricted query for medical domains
    domains_to_use = domain_filter if domain_filter else TRUSTED_MEDICAL_DOMAINS

    # Add site: operators to restrict to trusted domains
    # DuckDuckGo supports site: operator
    site_query = " OR ".join([f"site:{d}" for d in domains_to_use[:5]])  # Limit to avoid too long query
    full_query = f"{query} ({site_query})"

    # DuckDuckGo HTML search URL
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(full_query)}"

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()

    html = response.text
    results = []

    # Parse results using regex (simple parsing without BeautifulSoup dependency)
    # DuckDuckGo HTML results have class="result__a" for links
    result_pattern = re.compile(
        r'<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)</a>.*?'
        r'<a[^>]*class="result__snippet"[^>]*>([^<]*)</a>',
        re.DOTALL | re.IGNORECASE
    )

    # Alternative pattern for snippet in different format
    alt_pattern = re.compile(
        r'<a[^>]*rel="nofollow"[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>.*?</a>.*?'
        r'<a[^>]*class="result__a"[^>]*>([^<]*)</a>.*?'
        r'class="result__snippet"[^>]*>([^<]*)<',
        re.DOTALL | re.IGNORECASE
    )

    # Try to find result blocks
    result_blocks = re.findall(
        r'<div[^>]*class="[^"]*result[^"]*"[^>]*>(.*?)</div>\s*(?=<div[^>]*class="[^"]*result|$)',
        html,
        re.DOTALL | re.IGNORECASE
    )

    for block in result_blocks:
        if len(results) >= max_results:
            break

        # Extract URL
        url_match = re.search(r'href="([^"]*uddg=[^"]*)"', block)
        if not url_match:
            url_match = re.search(r'<a[^>]*class="result__url"[^>]*href="([^"]*)"', block)
        if not url_match:
            continue

        result_url = url_match.group(1)

        # DuckDuckGo uses redirect URLs, extract actual URL
        actual_url_match = re.search(r'uddg=([^&"]+)', result_url)
        if actual_url_match:
            from urllib.parse import unquote
            result_url = unquote(actual_url_match.group(1))

        # Skip if not from trusted domain
        if not _is_trusted_medical_domain(result_url, domain_filter):
            continue

        # Extract title
        title_match = re.search(r'<a[^>]*class="result__a"[^>]*>([^<]*)</a>', block)
        title = unescape(title_match.group(1).strip()) if title_match else "No title"

        # Extract snippet
        snippet_match = re.search(r'class="result__snippet"[^>]*>([^<]*)', block)
        snippet = unescape(snippet_match.group(1).strip()) if snippet_match else ""

        results.append(WebSearchResult(
            title=title,
            url=result_url,
            snippet=snippet,
            domain=_extract_domain(result_url),
            date=None
        ))

    return results


def web_search(args: WebSearchMedicalArgs, user_id: int) -> ToolResult:
    """
    Web search for medical information using DuckDuckGo.

    Searches are automatically filtered to trusted medical sources unless
    a custom domain filter is provided.
    """
    import asyncio

    start_time = datetime.utcnow()

    try:
        logger.info(f"Web search for user {user_id}: query='{args.query}'")

        # Run async search
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        async def _search():
            return await _duckduckgo_search(
                query=args.query,
                max_results=args.max_results or 5,
                domain_filter=args.domain_filter,
            )

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _search())
                results = future.result(timeout=15)
        else:
            results = asyncio.run(_search())

        response = WebSearchMedicalResponse(
            results=results,
            total_count=len(results),
            query=args.query
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Web search completed in {execution_time:.2f}ms, "
            f"returned {len(results)} results"
        )

        return ToolResult(
            tool_name="web_search_medical",
            success=True,
            result=response.dict(),
            execution_time_ms=execution_time
        )

    except httpx.TimeoutException as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error(f"Web search timeout: {e}")
        return ToolResult(
            tool_name="web_search_medical",
            success=False,
            error="Search request timed out. Please try again.",
            execution_time_ms=execution_time
        )
    except Exception as e:
        logger.error(f"Error in web search: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="web_search_medical",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


def register_web_search_tools():
    from app.tools.registry import register_tool
    register_tool("web_search_medical", WEB_SEARCH_MEDICAL_DEF, WebSearchMedicalArgs, web_search)
    logger.info("Web search tools registered")
