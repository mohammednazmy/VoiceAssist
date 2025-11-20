"""Query Orchestrator / RAG Service skeleton.

This module implements the QueryOrchestrator described in
docs/ORCHESTRATION_DESIGN.md. It is intentionally minimal and should
be expanded in future phases.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.services.llm_client import LLMClient, LLMRequest, LLMResponse
# NOTE: In future phases we will inject concrete implementations for:
# - PHI detector (app.services.phi_detector)
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

    async def handle_query(
        self,
        request: QueryRequest,
        trace_id: Optional[str] = None,
    ) -> QueryResponse:
        """Handle a clinician query.

        Current implementation uses LLMClient for basic text generation.
        Later phases will add the full RAG pipeline.
        """
        now = datetime.utcnow()
        message_id = f"msg-{int(now.timestamp())}"

        # TODO: implement full flow:
        # - PHI detection (app.services.phi_detector) - for now assume no PHI
        # - intent classification - for now use "other"
        # - source selection
        # - semantic search over KB (Qdrant/pgvector)
        # - external evidence (OpenEvidence, PubMed)
        # - streaming support

        # For now: call LLM directly with the query
        # In production this would be the final synthesis step after RAG
        llm_request = LLMRequest(
            prompt=f"You are a clinical decision support assistant. Answer this query: {request.query}",
            intent="other",
            temperature=0.1,
            max_tokens=512,
            phi_present=False,  # TODO: Run PHI detector first
            trace_id=trace_id,
        )

        llm_response: LLMResponse = await self.llm_client.generate(llm_request)

        return QueryResponse(
            session_id=request.session_id or "session-stub",
            message_id=message_id,
            answer=llm_response.text,
            created_at=now,
            citations=[],
        )
