"""Query Orchestrator / RAG Service skeleton.

This module implements the QueryOrchestrator described in
docs/ORCHESTRATION_DESIGN.md. It is intentionally minimal and should
be expanded in future phases.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field

from app.services.llm_client import LLMClient, LLMRequest, LLMResponse
from app.services.phi_detector import PHIDetector
from app.services.search_aggregator import SearchAggregator, SearchResult
# NOTE: In future phases we will inject concrete implementations for:
# - semantic search / KB (app.services.search_aggregator)
# - external evidence (OpenEvidence, PubMed clients)
# - tool execution (app.services.orchestration.tool_executor)
# as described in ORCHESTRATION_DESIGN.md and SEMANTIC_SEARCH_DESIGN.md.


class Citation(BaseModel):
    """Lightweight citation used in QueryResponse.

    The full canonical definition lives in docs/DATA_MODEL.md;
    this runtime model is deliberately minimal.
    """

    id: str
    source_type: str = Field(..., description="textbook|journal|guideline|note")
    title: str
    url: Optional[str] = None


class QueryRequest(BaseModel):
    """Top-level request into the QueryOrchestrator."""

    session_id: Optional[str] = None
    query: str
    clinical_context_id: Optional[str] = None


class QueryResponse(BaseModel):
    """Response from the QueryOrchestrator."""

    session_id: str
    message_id: str
    answer: str
    created_at: datetime
    citations: List[Citation] = []


class QueryOrchestrator:
    """High-level orchestrator entrypoint.

    Phases 0-4 should keep this implementation very small (often just
    echoing or calling a single model); later phases will expand this
    into the full multi-step pipeline described in ORCHESTRATION_DESIGN.md.
    """

    def __init__(self):
        # In future, accept Settings and injected clients (DB, Qdrant, etc.)
        self.llm_client = LLMClient()
        self.search_aggregator = SearchAggregator()
        self.phi_detector = PHIDetector()

    async def handle_query(
        self,
        request: QueryRequest,
        trace_id: Optional[str] = None,
    ) -> QueryResponse:
        """Handle a clinician query with RAG pipeline.

        Phase 5 implementation:
        1. Semantic search over knowledge base
        2. Assemble context from top results
        3. Generate LLM response with context
        4. Extract and return citations
        """
        now = datetime.utcnow()
        message_id = f"msg-{int(now.timestamp())}"

        # Step 1: Perform semantic search over knowledge base
        search_results: List[SearchResult] = []
        try:
            search_results = await self.search_aggregator.search(
                query=request.query,
                top_k=5,
                score_threshold=0.2  # Lower threshold for broader recall
            )
        except Exception as e:
            # Log error but continue with empty results (graceful degradation)
            logger.warning(f"Search failed, continuing without RAG context: {e}")

        # Step 2: Build context from search results
        context = ""
        if search_results:
            context = self.search_aggregator.format_context_for_rag(search_results)

        # Step 3: Construct prompt with context
        if context:
            prompt = (
                "You are a clinical decision support assistant. "
                "Use the following context from medical literature to answer the question.\n\n"
                f"Context:\n{context}\n\n"
                f"Question: {request.query}\n\n"
                "Answer based on the context provided. Be concise and clinical."
            )
        else:
            # Fallback when no context available
            prompt = (
                "You are a clinical decision support assistant. "
                f"Answer this query: {request.query}"
            )

        # Step 4: Run PHI detection on query and context
        phi_result = await self.phi_detector.detect_in_text(request.query)
        phi_present = phi_result.contains_phi

        # Also check the context for PHI if we have search results
        if not phi_present and context:
            context_phi_result = await self.phi_detector.detect_in_text(context)
            phi_present = context_phi_result.contains_phi

        # Log if PHI detected (for monitoring/audit)
        if phi_present:
            logger.info(
                f"PHI detected in query, routing to local model. "
                f"trace_id={trace_id}, phi_types={phi_result.phi_types}"
            )

        # Step 5: Generate LLM response
        llm_request = LLMRequest(
            prompt=prompt,
            intent="other",
            temperature=0.1,
            max_tokens=512,
            phi_present=phi_present,
            trace_id=trace_id,
        )

        llm_response: LLMResponse = await self.llm_client.generate(llm_request)

        # Step 6: Extract citations
        citation_dicts = self.search_aggregator.extract_citations(search_results)
        citations = [
            Citation(
                id=cit["id"],
                source_type=cit["source_type"],
                title=cit["title"],
                url=cit.get("url")
            )
            for cit in citation_dicts
        ]

        return QueryResponse(
            session_id=request.session_id or "session-stub",
            message_id=message_id,
            answer=llm_response.text,
            created_at=now,
            citations=citations,
        )
