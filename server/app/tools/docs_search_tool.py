"""
Platform Documentation Search Tools

Provides AI function tools for searching VoiceAssist platform documentation.
Uses the 'platform_docs' Qdrant collection populated by scripts/embed-docs.py.

Tools:
    - docs_search: Semantic search across platform documentation
    - docs_get_section: Retrieve full content of a specific document section
"""

import asyncio
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.search_aggregator import SearchAggregator
from app.tools.base import RiskLevel, ToolCategory, ToolDefinition, ToolResult
from app.tools.registry import register_tool

logger = get_logger(__name__)

# Collection name for platform docs
PLATFORM_DOCS_COLLECTION = "platform_docs"


# ============================================================
# docs_search Tool
# ============================================================

class DocsSearchArgs(BaseModel):
    """Arguments for docs_search tool."""

    query: str = Field(
        ...,
        min_length=3,
        max_length=500,
        description="Natural language question about VoiceAssist platform",
    )
    category: Optional[str] = Field(
        None,
        description="Filter by documentation category (e.g., 'api', 'architecture', 'deployment', 'operations', 'ai')",
    )
    audience: Optional[str] = Field(
        None,
        description="Filter by target audience (e.g., 'developer', 'admin', 'agent')",
    )
    max_results: Optional[int] = Field(
        5,
        ge=1,
        le=15,
        description="Maximum number of results to return",
    )


DOCS_SEARCH_DEF = ToolDefinition(
    name="docs_search",
    description=(
        "Search VoiceAssist platform documentation for information about architecture, "
        "APIs, deployment, operations, troubleshooting, and development guides. "
        "Use this to answer questions about how VoiceAssist works, how to configure it, "
        "or how to troubleshoot issues. Returns relevant documentation sections with citations."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language question about the platform",
                "minLength": 3,
                "maxLength": 500,
            },
            "category": {
                "type": "string",
                "enum": ["api", "architecture", "deployment", "operations", "ai", "admin", "frontend", "testing"],
                "description": "Optional: filter by documentation category",
            },
            "audience": {
                "type": "string",
                "enum": ["developer", "admin", "agent", "user", "devops"],
                "description": "Optional: filter by target audience",
            },
            "max_results": {
                "type": "integer",
                "minimum": 1,
                "maximum": 15,
                "default": 5,
                "description": "Maximum results to return",
            },
        },
        "required": ["query"],
    },
    category=ToolCategory.SEARCH,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=60,  # 60 calls per minute
    timeout_seconds=10,
)


async def _docs_search_async(args: DocsSearchArgs, user_id: int) -> ToolResult:
    """Execute docs search asynchronously."""
    start_time = datetime.utcnow()

    try:
        settings = get_settings()

        # Initialize search aggregator for platform docs
        search_aggregator = SearchAggregator(
            qdrant_url=settings.qdrant_url,
            collection_name=PLATFORM_DOCS_COLLECTION,
            embedding_model="text-embedding-3-small",
        )

        # Build filter conditions
        filter_conditions = {}
        if args.category:
            filter_conditions["category"] = args.category
        if args.audience:
            # Audience is stored as a list, need to check if value is in list
            filter_conditions["audience"] = args.audience

        # Perform search
        results = await search_aggregator.search(
            query=args.query,
            top_k=args.max_results or 5,
            score_threshold=0.3,  # Lower threshold for broader results
            filter_conditions=filter_conditions if filter_conditions else None,
        )

        # If no results with filters, try without
        if not results and filter_conditions:
            logger.info(f"No results with filters, retrying without filters for: {args.query}")
            results = await search_aggregator.search(
                query=args.query,
                top_k=args.max_results or 5,
                score_threshold=0.25,
            )

        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append({
                "doc_path": result.metadata.get("doc_path", ""),
                "doc_title": result.metadata.get("doc_title", ""),
                "section": result.metadata.get("section_heading", ""),
                "content": result.content[:500] + "..." if len(result.content) > 500 else result.content,
                "url": result.metadata.get("url", ""),
                "category": result.metadata.get("category", ""),
                "relevance_score": round(result.score, 3),
            })

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="docs_search",
            success=True,
            result={
                "query": args.query,
                "total_results": len(formatted_results),
                "results": formatted_results,
                "filters_applied": {
                    "category": args.category,
                    "audience": args.audience,
                } if filter_conditions else None,
            },
            execution_time_ms=execution_time,
        )

    except Exception as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error(f"docs_search error: {e}")

        return ToolResult(
            tool_name="docs_search",
            success=False,
            error=str(e),
            execution_time_ms=execution_time,
        )


def docs_search(args: DocsSearchArgs, user_id: int) -> ToolResult:
    """Synchronous wrapper for docs search."""
    return asyncio.run(_docs_search_async(args, user_id))


# ============================================================
# docs_get_section Tool
# ============================================================

class DocsGetSectionArgs(BaseModel):
    """Arguments for docs_get_section tool."""

    doc_path: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Document path (e.g., 'ARCHITECTURE_V2.md' or 'api-reference/rest-api.md')",
    )
    section: Optional[str] = Field(
        None,
        description="Optional: specific section heading to retrieve",
    )


DOCS_GET_SECTION_DEF = ToolDefinition(
    name="docs_get_section",
    description=(
        "Retrieve the full content of a specific document or section from VoiceAssist documentation. "
        "Use this when you need more detailed context after finding a relevant doc via docs_search, "
        "or when you know the exact document path. Returns the complete text for thorough analysis."
    ),
    parameters={
        "type": "object",
        "properties": {
            "doc_path": {
                "type": "string",
                "description": "Document path (e.g., 'ARCHITECTURE_V2.md')",
            },
            "section": {
                "type": "string",
                "description": "Optional: specific section heading to retrieve",
            },
        },
        "required": ["doc_path"],
    },
    category=ToolCategory.SEARCH,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=30,
    timeout_seconds=5,
)


async def _docs_get_section_async(args: DocsGetSectionArgs, user_id: int) -> ToolResult:
    """Retrieve document section content."""
    start_time = datetime.utcnow()

    try:
        settings = get_settings()

        # Initialize Qdrant client directly for scroll query
        from qdrant_client import QdrantClient
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        qdrant = QdrantClient(url=settings.qdrant_url)

        # Build filter for doc_path
        must_conditions = [
            FieldCondition(key="doc_path", match=MatchValue(value=args.doc_path))
        ]

        # Optionally filter by section
        if args.section:
            must_conditions.append(
                FieldCondition(key="section_heading", match=MatchValue(value=args.section))
            )

        # Scroll to get all chunks for this document/section
        results, _ = qdrant.scroll(
            collection_name=PLATFORM_DOCS_COLLECTION,
            scroll_filter=Filter(must=must_conditions),
            limit=50,  # Max chunks per document
            with_payload=True,
        )

        if not results:
            execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            return ToolResult(
                tool_name="docs_get_section",
                success=True,
                result={
                    "doc_path": args.doc_path,
                    "section": args.section,
                    "found": False,
                    "message": f"Document not found: {args.doc_path}",
                },
                execution_time_ms=execution_time,
            )

        # Sort by chunk_index and combine content
        chunks = sorted(results, key=lambda x: x.payload.get("chunk_index", 0))

        # Build response
        doc_title = chunks[0].payload.get("doc_title", args.doc_path)
        category = chunks[0].payload.get("category", "")
        last_updated = chunks[0].payload.get("last_updated", "")

        # Combine unique sections
        sections = {}
        for chunk in chunks:
            section_heading = chunk.payload.get("section_heading", "")
            content = chunk.payload.get("content", "")

            if section_heading not in sections:
                sections[section_heading] = []
            sections[section_heading].append(content)

        # Format content
        formatted_content = []
        for heading, contents in sections.items():
            formatted_content.append(f"## {heading}\n\n" + "\n".join(contents))

        full_content = "\n\n".join(formatted_content)

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="docs_get_section",
            success=True,
            result={
                "doc_path": args.doc_path,
                "doc_title": doc_title,
                "section": args.section,
                "category": category,
                "last_updated": last_updated,
                "found": True,
                "sections_count": len(sections),
                "content": full_content[:8000],  # Limit to 8K chars
                "truncated": len(full_content) > 8000,
            },
            execution_time_ms=execution_time,
        )

    except Exception as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error(f"docs_get_section error: {e}")

        return ToolResult(
            tool_name="docs_get_section",
            success=False,
            error=str(e),
            execution_time_ms=execution_time,
        )


def docs_get_section(args: DocsGetSectionArgs, user_id: int) -> ToolResult:
    """Synchronous wrapper for docs_get_section."""
    return asyncio.run(_docs_get_section_async(args, user_id))


# ============================================================
# Tool Registration
# ============================================================

def register_docs_search_tools() -> None:
    """Register documentation search tools with the tool registry."""
    logger.info("Registering documentation search tools...")

    # Register docs_search
    register_tool(
        name="docs_search",
        definition=DOCS_SEARCH_DEF,
        model=DocsSearchArgs,
        handler=docs_search,
    )
    logger.info("  Registered: docs_search")

    # Register docs_get_section
    register_tool(
        name="docs_get_section",
        definition=DOCS_GET_SECTION_DEF,
        model=DocsGetSectionArgs,
        handler=docs_get_section,
    )
    logger.info("  Registered: docs_get_section")

    logger.info("Documentation search tools registered successfully")
