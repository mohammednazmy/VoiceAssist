"""Query Orchestrator / RAG Service (Phase 5 Enhanced).

This module implements the QueryOrchestrator described in
docs/ORCHESTRATION_DESIGN.md. Phase 5 adds full RAG integration
with semantic search and citation tracking.

Phase 5 Enhancements:
- Integrated SearchAggregator for semantic search
- RAG-enhanced prompts with retrieved context
- Citation extraction and formatting
- Configurable RAG behavior (enable/disable, top-K, score threshold)

Future enhancements:
- PHI detection and routing
- Intent classification
- Multi-hop reasoning
- External evidence integration (OpenEvidence, PubMed)
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.services.llm_client import LLMClient, LLMRequest, LLMResponse
from app.services.search_aggregator import SearchAggregator


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
    """High-level orchestrator entrypoint with RAG integration (Phase 5).

    Implements the full RAG pipeline:
    1. Query analysis
    2. Semantic search over knowledge base
    3. Context assembly
    4. LLM synthesis with retrieved context
    5. Citation extraction
    """

    def __init__(
        self,
        enable_rag: bool = True,
        rag_top_k: int = 5,
        rag_score_threshold: float = 0.7
    ):
        """
        Initialize QueryOrchestrator with RAG support.

        Args:
            enable_rag: Whether to use RAG (can be disabled for testing)
            rag_top_k: Number of top results to retrieve
            rag_score_threshold: Minimum similarity score for results
        """
        self.llm_client = LLMClient()
        self.search_aggregator = SearchAggregator() if enable_rag else None
        self.enable_rag = enable_rag
        self.rag_top_k = rag_top_k
        self.rag_score_threshold = rag_score_threshold

    async def handle_query(
        self,
        request: QueryRequest,
        trace_id: Optional[str] = None,
    ) -> QueryResponse:
        """Handle a clinician query with full RAG pipeline.

        Pipeline:
        1. Semantic search over KB (if RAG enabled)
        2. Assemble context from search results
        3. Generate LLM response with context
        4. Extract citations

        Args:
            request: Query request with query text and optional context
            trace_id: Trace ID for logging

        Returns:
            QueryResponse with answer and citations
        """
        now = datetime.utcnow()
        message_id = f"msg-{int(now.timestamp())}"

        # Step 1: Perform semantic search if RAG is enabled
        search_results = []
        if self.enable_rag and self.search_aggregator:
            try:
                search_results = await self.search_aggregator.search(
                    query=request.query,
                    top_k=self.rag_top_k,
                    score_threshold=self.rag_score_threshold
                )
            except Exception as e:
                # Log error but continue without RAG
                import logging
                logging.error(f"Error performing RAG search: {e}", exc_info=True)

        # Step 2: Assemble context from search results
        context = ""
        if search_results:
            context = self.search_aggregator.format_context_for_rag(search_results)

        # Step 3: Build prompt with context
        if context:
            prompt = f"""You are a clinical decision support assistant. Use the following context from medical literature to answer the query.

Context:
{context}

Query: {request.query}

Instructions:
- Base your answer primarily on the provided context
- If the context doesn't contain relevant information, say so
- Be concise and clinical in your response
- Reference specific sources when possible
"""
        else:
            prompt = f"You are a clinical decision support assistant. Answer this query: {request.query}"

        # Step 4: Generate LLM response
        # TODO: PHI detection - for now assume no PHI
        # TODO: Intent classification - for now use "other"
        llm_request = LLMRequest(
            prompt=prompt,
            intent="other",
            temperature=0.1,
            max_tokens=512,
            phi_present=False,  # TODO: Run PHI detector first
            trace_id=trace_id,
        )

        llm_response: LLMResponse = await self.llm_client.generate(llm_request)

        # Step 5: Extract citations from search results
        citations = []
        if search_results:
            citation_dicts = self.search_aggregator.extract_citations(search_results)
            for cite_dict in citation_dicts:
                citations.append(Citation(
                    id=cite_dict["id"],
                    source_type=cite_dict["source_type"],
                    title=cite_dict["title"],
                    url=cite_dict.get("url")
                ))

        return QueryResponse(
            session_id=request.session_id or "session-stub",
            message_id=message_id,
            answer=llm_response.text,
            created_at=now,
            citations=citations,
        )
