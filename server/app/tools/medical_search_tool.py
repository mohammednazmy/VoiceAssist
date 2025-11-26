"""
VoiceAssist V2 - Medical Search Tools

External medical knowledge APIs: OpenEvidence, PubMed, Guidelines

Tools:
- search_openevidence: OpenEvidence API
- search_pubmed: PubMed literature search
- search_medical_guidelines: Local guidelines database (vector search)
"""

import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.search_aggregator import SearchAggregator, SearchResult
from app.tools.base import RiskLevel, ToolCategory, ToolDefinition, ToolResult

logger = logging.getLogger(__name__)

# NCBI E-utilities base URLs
NCBI_ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
NCBI_EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
NCBI_TOOL_NAME = "VoiceAssist"
NCBI_TOOL_EMAIL = "voiceassist@asimo.io"


# Tool 5: Search OpenEvidence
class SearchOpenEvidenceArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    max_results: Optional[int] = Field(5, ge=1, le=20)
    evidence_level: Optional[str] = Field(None, regex=r'^(high|moderate|low)$')


class OpenEvidenceResult(BaseModel):
    title: str
    summary: str
    evidence_level: str
    source: str
    pubmed_id: Optional[str] = None
    url: str
    date: Optional[str] = None


class SearchOpenEvidenceResponse(BaseModel):
    results: List[OpenEvidenceResult]
    total_count: int
    query: str


SEARCH_OPENEVIDENCE_DEF = ToolDefinition(
    name="search_openevidence",
    description="Search OpenEvidence for high-quality medical evidence and clinical guidelines. Returns evidence-based recommendations with quality ratings.",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Medical question or topic"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5},
            "evidence_level": {"type": "string", "enum": ["high", "moderate", "low"]}
        },
        "required": ["query"]
    },
    category=ToolCategory.MEDICAL,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=30,
    timeout_seconds=10
)


def search_openevidence(args: SearchOpenEvidenceArgs, user_id: int) -> ToolResult:
    """STUB: OpenEvidence API integration - Implement in Phase 5"""
    start_time = datetime.utcnow()
    try:
        # TODO: Implement OpenEvidence API client
        mock_results = SearchOpenEvidenceResponse(
            results=[
                OpenEvidenceResult(
                    title="Beta-blockers in Heart Failure",
                    summary="Beta-blockers reduce mortality in HFrEF patients (Class I, Level A evidence)",
                    evidence_level="high",
                    source="ESC Heart Failure Guidelines",
                    url="https://openevidence.example.com/...",
                    date="2023-08"
                )
            ],
            total_count=1,
            query=args.query
        )
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(tool_name="search_openevidence", success=True, result=mock_results.dict(), execution_time_ms=execution_time)
    except Exception as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(tool_name="search_openevidence", success=False, error=str(e), execution_time_ms=execution_time)


# Tool 6: Search PubMed
class SearchPubMedArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    max_results: Optional[int] = Field(10, ge=1, le=50)
    publication_types: Optional[List[str]] = None
    date_from: Optional[str] = Field(None, regex=r'^\d{4}/\d{2}/\d{2}$')
    date_to: Optional[str] = Field(None, regex=r'^\d{4}/\d{2}/\d{2}$')


class PubMedArticle(BaseModel):
    pmid: str
    title: str
    authors: List[str]
    journal: str
    publication_date: str
    abstract: Optional[str] = None
    doi: Optional[str] = None
    url: str


class SearchPubMedResult(BaseModel):
    articles: List[PubMedArticle]
    total_count: int
    query: str


SEARCH_PUBMED_DEF = ToolDefinition(
    name="search_pubmed",
    description="Search PubMed for medical literature and research articles. Use this to find peer-reviewed studies and clinical trials.",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "PubMed search query"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10},
            "publication_types": {"type": "array", "items": {"type": "string"}},
            "date_from": {"type": "string", "pattern": r"^\d{4}/\d{2}/\d{2}$"},
            "date_to": {"type": "string", "pattern": r"^\d{4}/\d{2}/\d{2}$"}
        },
        "required": ["query"]
    },
    category=ToolCategory.MEDICAL,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=30,
    timeout_seconds=15
)


async def _pubmed_esearch(
    query: str,
    max_results: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> tuple[List[str], int]:
    """
    Search PubMed and return list of PMIDs.

    Args:
        query: Search query string
        max_results: Maximum number of results to return
        date_from: Optional start date (YYYY/MM/DD)
        date_to: Optional end date (YYYY/MM/DD)

    Returns:
        Tuple of (list of PMIDs, total count)
    """
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "xml",
        "tool": NCBI_TOOL_NAME,
        "email": NCBI_TOOL_EMAIL,
    }

    if date_from:
        params["mindate"] = date_from.replace("/", "/")
        params["datetype"] = "pdat"
    if date_to:
        params["maxdate"] = date_to.replace("/", "/")
        params["datetype"] = "pdat"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{NCBI_ESEARCH_URL}?{urlencode(params)}")
        response.raise_for_status()

    root = ET.fromstring(response.text)

    # Extract PMIDs
    pmids = [id_elem.text for id_elem in root.findall(".//Id") if id_elem.text]

    # Extract total count
    count_elem = root.find(".//Count")
    total_count = int(count_elem.text) if count_elem is not None and count_elem.text else 0

    return pmids, total_count


async def _pubmed_efetch(pmids: List[str]) -> List[PubMedArticle]:
    """
    Fetch article details for given PMIDs.

    Args:
        pmids: List of PubMed IDs

    Returns:
        List of PubMedArticle objects
    """
    if not pmids:
        return []

    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
        "tool": NCBI_TOOL_NAME,
        "email": NCBI_TOOL_EMAIL,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{NCBI_EFETCH_URL}?{urlencode(params)}")
        response.raise_for_status()

    root = ET.fromstring(response.text)
    articles = []

    for article_elem in root.findall(".//PubmedArticle"):
        try:
            # Extract PMID
            pmid_elem = article_elem.find(".//PMID")
            pmid = pmid_elem.text if pmid_elem is not None else ""

            # Extract title
            title_elem = article_elem.find(".//ArticleTitle")
            title = title_elem.text if title_elem is not None and title_elem.text else "No title"

            # Extract authors
            authors = []
            for author in article_elem.findall(".//Author"):
                last_name = author.find("LastName")
                initials = author.find("Initials")
                if last_name is not None and last_name.text:
                    author_name = last_name.text
                    if initials is not None and initials.text:
                        author_name += f" {initials.text}"
                    authors.append(author_name)

            # Extract journal
            journal_elem = article_elem.find(".//Journal/Title")
            journal = journal_elem.text if journal_elem is not None and journal_elem.text else "Unknown Journal"

            # Extract publication date
            pub_date = ""
            pub_date_elem = article_elem.find(".//PubDate")
            if pub_date_elem is not None:
                year = pub_date_elem.find("Year")
                month = pub_date_elem.find("Month")
                day = pub_date_elem.find("Day")
                if year is not None and year.text:
                    pub_date = year.text
                    if month is not None and month.text:
                        pub_date += f"-{month.text}"
                        if day is not None and day.text:
                            pub_date += f"-{day.text}"

            # Extract abstract
            abstract_parts = []
            for abstract_text in article_elem.findall(".//AbstractText"):
                if abstract_text.text:
                    label = abstract_text.get("Label", "")
                    if label:
                        abstract_parts.append(f"{label}: {abstract_text.text}")
                    else:
                        abstract_parts.append(abstract_text.text)
            abstract = " ".join(abstract_parts) if abstract_parts else None

            # Extract DOI
            doi = None
            for article_id in article_elem.findall(".//ArticleId"):
                if article_id.get("IdType") == "doi":
                    doi = article_id.text
                    break

            articles.append(PubMedArticle(
                pmid=pmid,
                title=title,
                authors=authors[:10],  # Limit to first 10 authors
                journal=journal,
                publication_date=pub_date,
                abstract=abstract[:2000] if abstract else None,  # Limit abstract length
                doi=doi,
                url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            ))

        except Exception as e:
            logger.warning(f"Error parsing PubMed article: {e}")
            continue

    return articles


def search_pubmed(args: SearchPubMedArgs, user_id: int) -> ToolResult:
    """
    Search PubMed for medical literature using NCBI E-utilities API.

    This function performs a two-step search:
    1. esearch: Search PubMed and get list of PMIDs
    2. efetch: Fetch detailed article information for each PMID
    """
    import asyncio

    start_time = datetime.utcnow()

    async def _search():
        # Step 1: Search for PMIDs
        pmids, total_count = await _pubmed_esearch(
            query=args.query,
            max_results=args.max_results or 10,
            date_from=args.date_from,
            date_to=args.date_to,
        )

        logger.info(
            f"PubMed search for '{args.query}' returned {len(pmids)} PMIDs "
            f"(total: {total_count}) for user {user_id}"
        )

        # Step 2: Fetch article details
        articles = await _pubmed_efetch(pmids)

        return SearchPubMedResult(
            articles=articles,
            total_count=total_count,
            query=args.query
        )

    try:
        # Run async search
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # If already in async context, create a task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _search())
                result = future.result(timeout=20)
        else:
            result = asyncio.run(_search())

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"PubMed search completed in {execution_time:.2f}ms, "
            f"returned {len(result.articles)} articles"
        )

        return ToolResult(
            tool_name="search_pubmed",
            success=True,
            result=result.dict(),
            execution_time_ms=execution_time
        )

    except httpx.TimeoutException as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error(f"PubMed API timeout: {e}")
        return ToolResult(
            tool_name="search_pubmed",
            success=False,
            error="PubMed API request timed out. Please try again.",
            execution_time_ms=execution_time
        )
    except httpx.HTTPStatusError as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error(f"PubMed API HTTP error: {e}")
        return ToolResult(
            tool_name="search_pubmed",
            success=False,
            error=f"PubMed API error: {e.response.status_code}",
            execution_time_ms=execution_time
        )
    except Exception as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error(f"PubMed search failed: {e}", exc_info=True)
        return ToolResult(
            tool_name="search_pubmed",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


# Tool 8: Search Medical Guidelines
class SearchMedicalGuidelinesArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    guideline_source: Optional[str] = None
    condition: Optional[str] = None
    max_results: Optional[int] = Field(10, ge=1, le=50)


class MedicalGuideline(BaseModel):
    id: str
    title: str
    source: str
    condition: str
    summary: str
    url: str
    publication_date: str
    last_updated: str


class SearchMedicalGuidelinesResult(BaseModel):
    guidelines: List[MedicalGuideline]
    total_count: int
    query: str


SEARCH_MEDICAL_GUIDELINES_DEF = ToolDefinition(
    name="search_medical_guidelines",
    description="Search curated medical guidelines from CDC, WHO, ACC, AHA, and specialty societies.",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "guideline_source": {"type": "string"},
            "condition": {"type": "string"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10}
        },
        "required": ["query"]
    },
    category=ToolCategory.MEDICAL,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=20,
    timeout_seconds=5
)


def _build_guideline_filter(
    guideline_source: Optional[str],
    condition: Optional[str]
) -> Optional[Dict[str, Any]]:
    """Build filter conditions for guideline search."""
    filters = {}

    if guideline_source:
        source_map = {
            "cdc": "CDC",
            "who": "WHO",
            "acc": "ACC",
            "aha": "AHA",
            "esc": "ESC",
            "nice": "NICE",
            "uspstf": "USPSTF",
        }
        normalized = source_map.get(guideline_source.lower(), guideline_source)
        filters["source"] = normalized

    if condition:
        filters["condition"] = condition

    return filters if filters else None


def _search_result_to_guideline(result: SearchResult) -> MedicalGuideline:
    """Convert a SearchResult to a MedicalGuideline object."""
    metadata = result.metadata

    guideline_id = result.document_id or result.chunk_id
    title = metadata.get("title", "Untitled Guideline")
    source = metadata.get("source", metadata.get("source_type", "Unknown"))
    condition = metadata.get("condition", metadata.get("topic", "General"))

    content = result.content
    summary = content[:500] + "..." if len(content) > 500 else content

    url = metadata.get("url", "")
    if not url and result.document_id:
        url = f"/guidelines/{result.document_id}"

    pub_date = metadata.get("publication_date", metadata.get("date", ""))
    last_updated = metadata.get("last_updated", pub_date)

    return MedicalGuideline(
        id=guideline_id,
        title=title,
        source=source,
        condition=condition,
        summary=summary,
        url=url,
        publication_date=pub_date,
        last_updated=last_updated
    )


async def _search_guidelines_async(
    args: SearchMedicalGuidelinesArgs,
    user_id: int
) -> SearchMedicalGuidelinesResult:
    """Async implementation of guidelines vector search."""
    settings = get_settings()

    search_aggregator = SearchAggregator(
        qdrant_url=settings.qdrant_url,
        collection_name="medical_guidelines",
        embedding_model="text-embedding-3-small"
    )

    filter_conditions = _build_guideline_filter(
        args.guideline_source,
        args.condition
    )

    max_results = args.max_results or 10

    search_results = await search_aggregator.search(
        query=args.query,
        top_k=max_results,
        score_threshold=0.3,
        filter_conditions=filter_conditions
    )

    if not search_results and filter_conditions:
        logger.info(
            f"No results with filters, retrying without filters for query: "
            f"{args.query}"
        )
        search_results = await search_aggregator.search(
            query=args.query,
            top_k=max_results,
            score_threshold=0.25
        )

    guidelines = [_search_result_to_guideline(r) for r in search_results]

    seen_ids = set()
    unique_guidelines = []
    for g in guidelines:
        if g.id not in seen_ids:
            seen_ids.add(g.id)
            unique_guidelines.append(g)

    return SearchMedicalGuidelinesResult(
        guidelines=unique_guidelines,
        total_count=len(unique_guidelines),
        query=args.query
    )


def search_guidelines(args: SearchMedicalGuidelinesArgs, user_id: int) -> ToolResult:
    """
    Search medical guidelines using local vector database.

    Performs semantic search over the medical_guidelines collection in Qdrant.
    Supports filtering by guideline source (CDC, WHO, ACC, etc.) and condition.
    """
    start_time = datetime.utcnow()

    try:
        logger.info(
            f"Searching medical guidelines for user {user_id}: "
            f"query='{args.query}', source={args.guideline_source}"
        )

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    _search_guidelines_async(args, user_id)
                )
                result = future.result(timeout=10)
        else:
            result = asyncio.run(_search_guidelines_async(args, user_id))

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Guidelines search completed in {execution_time:.2f}ms, "
            f"returned {len(result.guidelines)} guidelines"
        )

        return ToolResult(
            tool_name="search_medical_guidelines",
            success=True,
            result=result.dict(),
            execution_time_ms=execution_time
        )

    except Exception as e:
        logger.error(f"Guidelines search failed: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="search_medical_guidelines",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


def register_medical_search_tools():
    from app.tools.registry import register_tool
    register_tool("search_openevidence", SEARCH_OPENEVIDENCE_DEF, SearchOpenEvidenceArgs, search_openevidence)
    register_tool("search_pubmed", SEARCH_PUBMED_DEF, SearchPubMedArgs, search_pubmed)
    register_tool("search_medical_guidelines", SEARCH_MEDICAL_GUIDELINES_DEF, SearchMedicalGuidelinesArgs, search_guidelines)
    logger.info("Medical search tools registered")
