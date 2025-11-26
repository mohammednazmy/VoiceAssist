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

import asyncio
from datetime import datetime, timezone
from typing import Awaitable, Callable, List, Optional

from app.core.config import settings
from app.services.intent_classifier import IntentClassifier
from app.services.llm_client import LLMClient, LLMRequest, LLMResponse
from app.services.phi_detector import PHIDetector
from app.services.search_aggregator import SearchAggregator
from pydantic import BaseModel, Field


class Citation(BaseModel):
    """Structured citation used in QueryResponse.

    Enhanced with additional metadata fields for proper citation formatting.
    The database model (MessageCitation) provides persistent storage.
    """

    id: str
    source_id: str
    source_type: str = Field(..., description="textbook|journal|guideline|note")
    title: str
    url: Optional[str] = None
    authors: Optional[List[str]] = None
    publication_date: Optional[str] = None
    journal: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    relevance_score: Optional[int] = None
    quoted_text: Optional[str] = None
    context: Optional[dict] = None


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
    tokens: Optional[int] = None
    model: Optional[str] = None
    finish_reason: Optional[str] = None


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
        rag_score_threshold: float = 0.7,
    ):
        """
        Initialize QueryOrchestrator with RAG support.

        Args:
            enable_rag: Whether to use RAG (can be disabled for testing)
            rag_top_k: Number of top results to retrieve
            rag_score_threshold: Minimum similarity score for results
        """
        self.llm_client = LLMClient(
            cloud_model="gpt-4o",
            openai_api_key=settings.OPENAI_API_KEY,
            openai_timeout_sec=settings.OPENAI_TIMEOUT_SEC,
            local_api_url=settings.LOCAL_LLM_URL,
            local_api_key=settings.LOCAL_LLM_API_KEY,
            local_timeout_sec=settings.LOCAL_LLM_TIMEOUT_SEC,
            local_model=settings.LOCAL_LLM_MODEL or "local-clinical-llm",
        )
        self.search_aggregator = SearchAggregator() if enable_rag else None
        self.phi_detector = PHIDetector()
        self.intent_classifier = IntentClassifier()
        self.enable_rag = enable_rag
        self.rag_top_k = rag_top_k
        self.rag_score_threshold = rag_score_threshold

    async def _prepare_llm_request(
        self,
        request: QueryRequest,
        clinical_context: Optional[dict],
        trace_id: Optional[str],
    ) -> tuple[LLMRequest, list, str, bool, str]:
        """Prepare prompt, RAG context, and LLM request for streaming or non-streaming paths."""
        # Step 1: Perform semantic search if RAG is enabled
        search_results = []
        if self.enable_rag and self.search_aggregator:
            try:
                search_results = await self.search_aggregator.search(
                    query=request.query,
                    top_k=self.rag_top_k,
                    score_threshold=self.rag_score_threshold,
                )
            except Exception as e:  # noqa: BLE001
                import logging

                logging.error(f"Error performing RAG search: {e}", exc_info=True)

        # Step 2: Assemble context from search results
        context = ""
        if search_results:
            context = self.search_aggregator.format_context_for_rag(search_results)

        # Step 3: Build prompt with context and clinical context
        prompt_parts = [
            "You are a clinical decision support assistant.",
        ]

        # Add clinical context if provided
        if clinical_context:
            clinical_info = []
            if clinical_context.get("age"):
                clinical_info.append(f"Age: {clinical_context['age']}")
            if clinical_context.get("gender"):
                clinical_info.append(f"Gender: {clinical_context['gender']}")
            if clinical_context.get("chief_complaint"):
                clinical_info.append(f"Chief Complaint: {clinical_context['chief_complaint']}")
            if clinical_context.get("problems"):
                problems = ", ".join(clinical_context["problems"])
                clinical_info.append(f"Problems: {problems}")
            if clinical_context.get("medications"):
                meds = ", ".join(clinical_context["medications"])
                clinical_info.append(f"Medications: {meds}")
            if clinical_context.get("allergies"):
                allergies = ", ".join(clinical_context["allergies"])
                clinical_info.append(f"Allergies: {allergies}")

            if clinical_info:
                prompt_parts.append("\nPatient Context:")
                prompt_parts.append("\n".join(f"- {info}" for info in clinical_info))

        # Add knowledge base context if available
        if context:
            prompt_parts.append("\nUse the following context from medical literature to answer the query:")
            prompt_parts.append(f"\nContext:\n{context}")

        # Add query and instructions
        prompt_parts.append(f"\nQuery: {request.query}")
        prompt_parts.append(
            """
Instructions:
- Consider the patient context when providing your answer
- Base your answer on the provided medical literature context
- If the context doesn't contain relevant information, say so
- Be concise and clinical in your response
- Reference specific sources when possible
- Consider contraindications based on patient allergies and current medications
"""
        )

        prompt = "\n".join(prompt_parts)

        # Step 4: PHI Detection
        phi_result = self.phi_detector.detect(text=request.query, clinical_context=clinical_context)

        # Decide prompt and routing: if PHI and no local model, sanitize and send to cloud
        sanitized_prompt = prompt
        llm_phi_flag = phi_result.contains_phi and self.llm_client.has_local_model

        if phi_result.contains_phi:
            import logging

            logging.warning(
                f"PHI detected in query: types={phi_result.phi_types}, "
                f"confidence={phi_result.confidence}, trace_id={trace_id}"
            )
            if not self.llm_client.has_local_model:
                sanitized_prompt = self.phi_detector.sanitize(prompt)
                logging.warning(
                    "No local model configured; PHI redacted before routing to cloud. trace_id=%s",
                    trace_id,
                )

        # Step 5: Intent Classification
        intent = self.intent_classifier.classify(query=request.query, clinical_context=clinical_context)

        llm_request = LLMRequest(
            prompt=sanitized_prompt,
            intent=intent,
            temperature=0.1,
            max_tokens=512,
            phi_present=llm_phi_flag,
            trace_id=trace_id,
        )

        return llm_request, search_results, prompt, phi_result.contains_phi, intent

    async def handle_query(
        self,
        request: QueryRequest,
        clinical_context: Optional[dict] = None,
        trace_id: Optional[str] = None,
    ) -> QueryResponse:
        """Handle a clinician query with full RAG pipeline.

        Pipeline:
        1. Load clinical context (if provided)
        2. Semantic search over KB (if RAG enabled)
        3. Assemble context from search results
        4. Generate LLM response with context + clinical context
        5. Extract citations

        Args:
            request: Query request with query text and optional context
            clinical_context: Optional clinical context dict with patient info
            trace_id: Trace ID for logging

        Returns:
            QueryResponse with answer and citations
        """
        now = datetime.now(timezone.utc)
        message_id = f"msg-{int(now.timestamp())}"

        llm_request, search_results, _prompt, _phi_present, intent = await self._prepare_llm_request(
            request=request, clinical_context=clinical_context, trace_id=trace_id
        )

        import logging

        logging.info(f"Query classified as intent='{intent}', trace_id={trace_id}")

        llm_response: LLMResponse = await self.llm_client.generate(llm_request)

        # Step 5: Extract citations from search results
        citations = []
        if search_results:
            citation_dicts = self.search_aggregator.extract_citations(search_results)
            for cite_dict in citation_dicts:
                citations.append(
                    Citation(
                        id=cite_dict.get("id", ""),
                        source_id=cite_dict.get("source_id", cite_dict.get("id", "")),
                        source_type=cite_dict.get("source_type", "textbook"),
                        title=cite_dict.get("title", "Untitled"),
                        url=cite_dict.get("url"),
                        authors=cite_dict.get("authors"),
                        publication_date=cite_dict.get("publication_date"),
                        journal=cite_dict.get("journal"),
                        volume=cite_dict.get("volume"),
                        issue=cite_dict.get("issue"),
                        pages=cite_dict.get("pages"),
                        doi=cite_dict.get("doi"),
                        pmid=cite_dict.get("pmid"),
                        relevance_score=cite_dict.get("relevance_score"),
                        quoted_text=cite_dict.get("quoted_text"),
                        context=cite_dict.get("context"),
                    )
                )

        return QueryResponse(
            session_id=request.session_id or "session-stub",
            message_id=message_id,
            answer=llm_response.text,
            created_at=now,
            citations=citations,
            tokens=llm_response.used_tokens,
            model=llm_response.model_name,
            finish_reason=llm_response.finish_reason,
        )

    async def stream_query(
        self,
        request: QueryRequest,
        clinical_context: Optional[dict] = None,
        trace_id: Optional[str] = None,
        on_chunk: Optional[Callable[[str], Awaitable[None]]] = None,
    ) -> QueryResponse:
        """Stream a clinician query with RAG support.

        Args:
            request: Query request with query text and optional context
            clinical_context: Optional clinical context dict with patient info
            trace_id: Trace ID for logging
            on_chunk: Callback invoked per text delta

        Returns:
            QueryResponse with full answer and citations
        """
        now = datetime.now(timezone.utc)
        message_id = f"msg-{int(now.timestamp())}"

        llm_request, search_results, _prompt, _phi_present, intent = await self._prepare_llm_request(
            request=request, clinical_context=clinical_context, trace_id=trace_id
        )

        async def _emit_chunk(text: str):
            if on_chunk:
                result = on_chunk(text)
                if asyncio.iscoroutine(result):
                    await result

        llm_response: LLMResponse = await self.llm_client.stream_generate(llm_request, on_chunk=_emit_chunk)

        citations: List[Citation] = []
        if search_results:
            citation_dicts = self.search_aggregator.extract_citations(search_results)
            for cite_dict in citation_dicts:
                citations.append(
                    Citation(
                        id=cite_dict.get("id", ""),
                        source_id=cite_dict.get("source_id", cite_dict.get("id", "")),
                        source_type=cite_dict.get("source_type", "textbook"),
                        title=cite_dict.get("title", "Untitled"),
                        url=cite_dict.get("url"),
                        authors=cite_dict.get("authors"),
                        publication_date=cite_dict.get("publication_date"),
                        journal=cite_dict.get("journal"),
                        volume=cite_dict.get("volume"),
                        issue=cite_dict.get("issue"),
                        pages=cite_dict.get("pages"),
                        doi=cite_dict.get("doi"),
                        pmid=cite_dict.get("pmid"),
                        relevance_score=cite_dict.get("relevance_score"),
                        quoted_text=cite_dict.get("quoted_text"),
                        context=cite_dict.get("context"),
                    )
                )

        return QueryResponse(
            session_id=request.session_id or "session-stub",
            message_id=message_id,
            answer=llm_response.text,
            created_at=now,
            citations=citations,
            tokens=llm_response.used_tokens,
            model=llm_response.model_name,
            finish_reason=llm_response.finish_reason,
        )
