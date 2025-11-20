"""
VoiceAssist V2 - Web Search Tool

Medical-focused web search.

Tool:
- web_search_medical: Google Custom Search or Brave Search
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from app.tools.base import ToolDefinition, ToolResult, ToolCategory, RiskLevel

logger = logging.getLogger(__name__)


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


def web_search(args: WebSearchMedicalArgs, user_id: int) -> ToolResult:
    """
    Web search for medical information.

    STUB IMPLEMENTATION - Replace with Google Custom Search or Brave Search in Phase 5.
    """
    start_time = datetime.utcnow()

    try:
        logger.info(f"Web search for user {user_id}: query='{args.query}'")

        # STUB: Mock search results
        # TODO: Implement Google Custom Search API or Brave Search API
        # - Configure API key
        # - Filter to medical domains
        # - Parse results

        mock_results = WebSearchMedicalResponse(
            results=[],
            total_count=0,
            query=args.query
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="web_search_medical",
            success=True,
            result=mock_results.dict(),
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
