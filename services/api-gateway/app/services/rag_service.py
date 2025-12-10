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
import json
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable, List, Optional

from app.core.config import settings
from app.services.intent_classifier import IntentClassifier
from app.services.llm_client import LLMClient, LLMRequest, LLMResponse, ToolCall
from app.services.model_adapters import ModelAdapter, ModelAdapterRegistry
from app.services.openai_realtime_client import OpenAIRealtimeClient
from app.services.phi_detector import PHIDetector
from app.services.prompt_service import prompt_service
from app.services.query_expansion import QueryExpansionConfig, QueryExpansionService
from app.services.realtime_voice_service import realtime_voice_service
from app.services.search_aggregator import SearchAggregator
from pydantic import BaseModel, Field

# Import tool service for function calling support
try:
    from app.services.tools import tool_service
    from app.services.tools.tool_service import ToolExecutionContext

    TOOLS_AVAILABLE = True
except ImportError:
    TOOLS_AVAILABLE = False
    logging.warning("Tool service not available for chat mode")

# Default values when prompt service is unavailable
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 1024


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
    relevance_score: Optional[float] = None
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
    citations: List[Citation] = Field(default_factory=list)
    tokens: Optional[int] = None
    model: Optional[str] = None
    model_provider: Optional[str] = None
    model_confidence: Optional[float] = None
    retrieval_confidence: Optional[float] = None
    reasoning_path: List[dict] = Field(default_factory=list)
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
        enable_query_decomposition: bool | None = None,
        enable_multi_hop: bool | None = None,
        search_aggregator: SearchAggregator | None = None,
        query_expansion_service: QueryExpansionService | None = None,
        model_registry: ModelAdapterRegistry | None = None,
        enable_tools: bool = True,
        max_tool_iterations: int = 5,
    ):
        """
        Initialize QueryOrchestrator with RAG support.

        Args:
            enable_rag: Whether to use RAG (can be disabled for testing)
            rag_top_k: Number of top results to retrieve
            rag_score_threshold: Minimum similarity score for results
            enable_tools: Whether to enable function calling/tools
            max_tool_iterations: Maximum number of tool execution loops
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
        self.search_aggregator = search_aggregator or (SearchAggregator() if enable_rag else None)
        self.phi_detector = PHIDetector()
        self.intent_classifier = IntentClassifier()
        self.realtime_client = OpenAIRealtimeClient()
        self.enable_rag = enable_rag
        self.rag_top_k = rag_top_k
        self.rag_score_threshold = rag_score_threshold
        self.enable_query_decomposition = (
            settings.ENABLE_QUERY_DECOMPOSITION if enable_query_decomposition is None else enable_query_decomposition
        )
        self.enable_multi_hop = settings.ENABLE_MULTI_HOP_RETRIEVAL if enable_multi_hop is None else enable_multi_hop
        self.query_expander = query_expansion_service or QueryExpansionService(QueryExpansionConfig(enable_llm=False))
        self.model_registry = model_registry or ModelAdapterRegistry()
        self.enable_tools = enable_tools and TOOLS_AVAILABLE
        self.max_tool_iterations = max_tool_iterations

    async def _execute_tool_call(
        self,
        tool_call: ToolCall,
        user_id: str,
        session_id: Optional[str],
        trace_id: Optional[str],
    ) -> dict:
        """
        Execute a single tool call and return the result.

        Args:
            tool_call: The tool call to execute
            user_id: User identifier
            session_id: Session identifier
            trace_id: Trace ID for logging

        Returns:
            Dict with tool result to send back to LLM
        """
        if not TOOLS_AVAILABLE:
            return {"error": "Tools not available"}

        try:
            # Parse arguments
            arguments = json.loads(tool_call.arguments)

            # Create execution context
            context = ToolExecutionContext(
                user_id=user_id,
                session_id=session_id,
                mode="chat",
                trace_id=trace_id,
            )

            # Execute the tool
            result = await tool_service.execute(tool_call.name, arguments, context)

            # Format result for LLM
            if result.success:
                output = result.data
                if result.message and isinstance(output, dict):
                    output["_message"] = result.message
                return output
            else:
                return {
                    "error": result.error,
                    "needs_clarification": result.needs_clarification,
                    "needs_connection": result.needs_connection,
                    "_message": result.message,
                }

        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse tool arguments: {e}")
            return {"error": f"Invalid arguments: {e}"}
        except Exception as e:
            logging.exception(f"Error executing tool {tool_call.name}: {e}")
            return {"error": str(e)}

    async def _run_retrieval(self, query: str) -> tuple[list, str, List[dict], float]:
        """Run single or multi-hop retrieval with optional synthesis."""

        if not self.enable_rag or not self.search_aggregator:
            return [], "", [], 0.0

        sub_queries = [query]
        if self.enable_multi_hop and self.enable_query_decomposition:
            try:
                sub_queries = await self.query_expander.decompose(query)
            except Exception:
                sub_queries = [query]

        hop_traces: List[dict] = []
        aggregated_results = []

        for hop_idx, sub_query in enumerate(sub_queries, start=1):
            hop_results = await self.search_aggregator.search(
                query=sub_query,
                top_k=self.rag_top_k,
                score_threshold=self.rag_score_threshold,
            )
            hop_traces.append({"hop": hop_idx, "query": sub_query, "results": len(hop_results)})
            aggregated_results.extend(hop_results)

        synthesized_context = ""
        if aggregated_results:
            synthesis = self.search_aggregator.synthesize_across_documents(aggregated_results)
            synthesized_context = synthesis.get("context", "") or self.search_aggregator.format_context_for_rag(
                aggregated_results
            )
        return (
            aggregated_results,
            synthesized_context,
            hop_traces,
            self.search_aggregator.confidence_score(aggregated_results),
        )

    async def _prepare_llm_request(
        self,
        request: QueryRequest,
        clinical_context: Optional[dict],
        trace_id: Optional[str],
    ) -> tuple[LLMRequest, list, str, bool, str]:
        """Prepare prompt, RAG context, and LLM request for streaming or non-streaming paths."""
        search_results, context, reasoning_path, retrieval_confidence = await self._run_retrieval(request.query)

        # Get dynamic RAG instructions from prompt service
        try:
            rag_instructions = await prompt_service.get_rag_instructions()
        except Exception as e:
            logging.warning(f"Failed to get RAG instructions, using default: {e}")
            rag_instructions = prompt_service._get_default_rag_instructions()

        # Step 3: Build prompt with context and clinical context
        prompt_parts = [rag_instructions]

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

        # Add query
        prompt_parts.append(f"\nQuery: {request.query}")

        prompt = "\n".join(prompt_parts)

        # Step 4: PHI Detection
        phi_result = self.phi_detector.detect(text=request.query, clinical_context=clinical_context)

        # Decide prompt and routing: if PHI and no local model, sanitize and send to cloud
        sanitized_prompt = prompt
        llm_phi_flag = phi_result.contains_phi and self.llm_client.has_local_model

        if phi_result.contains_phi:
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
        adapter: ModelAdapter | None = None
        try:
            adapter = self.model_registry.select_for_intent(intent)
        except Exception:
            adapter = None

        if adapter and adapter.provider != "openai" and not self.llm_client.has_local_model:
            logging.warning(
                "Local adapter %s selected but no local LLM configured; "
                "falling back to default cloud model. trace_id=%s",
                adapter.key,
                trace_id,
            )
            adapter = self.model_registry.get("default") or None

        # Get per-prompt temperature and max_tokens from prompt service
        temperature = DEFAULT_TEMPERATURE
        max_tokens = DEFAULT_MAX_TOKENS
        model_override = adapter.model_id if adapter else None

        try:
            prompt_name = f"intent:{intent}"
            prompt_settings = await prompt_service.get_prompt_with_settings(prompt_name)
            if prompt_settings:
                if prompt_settings.get("temperature") is not None:
                    temperature = prompt_settings["temperature"]
                if prompt_settings.get("max_tokens") is not None:
                    max_tokens = prompt_settings["max_tokens"]
                if prompt_settings.get("model_name") and not model_override:
                    model_override = prompt_settings["model_name"]
        except Exception as e:
            logging.warning(f"Failed to get prompt settings for {intent}, using defaults: {e}")

        # Get tools if enabled
        tools = None
        if self.enable_tools and TOOLS_AVAILABLE:
            try:
                tools = tool_service.get_openai_tools()
            except Exception as e:
                logging.warning(f"Failed to get tools: {e}")

        llm_request = LLMRequest(
            prompt=sanitized_prompt,
            intent=intent,
            temperature=temperature,
            max_tokens=max_tokens,
            phi_present=llm_phi_flag,
            trace_id=trace_id,
            model_override=model_override,
            model_provider=adapter.provider if adapter else None,
            tools=tools,
            tool_choice="auto" if tools else None,
        )

        return (
            llm_request,
            search_results,
            prompt,
            phi_result.contains_phi,
            intent,
            adapter,
            reasoning_path,
            retrieval_confidence,
        )

    @staticmethod
    def _resolve_model_provider(
        adapter: ModelAdapter | None,
        llm_request: LLMRequest,
        llm_response: LLMResponse,
    ) -> str | None:
        """Return a user-facing provider label for response metadata."""

        if adapter and adapter.provider:
            return adapter.provider
        if llm_request.model_provider:
            return llm_request.model_provider
        return "openai" if llm_response.model_family == "cloud" else "local"

    async def handle_query(
        self,
        request: QueryRequest,
        clinical_context: Optional[dict] = None,
        trace_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> QueryResponse:
        """Handle a clinician query with full RAG pipeline and tool support.

        Pipeline:
        1. Load clinical context (if provided)
        2. Semantic search over KB (if RAG enabled)
        3. Assemble context from search results
        4. Generate LLM response with context + clinical context
        5. Execute tool calls if any (loop until done or max iterations)
        6. Extract citations

        Args:
            request: Query request with query text and optional context
            clinical_context: Optional clinical context dict with patient info
            trace_id: Trace ID for logging
            user_id: User identifier for tool execution context

        Returns:
            QueryResponse with answer and citations
        """
        now = datetime.now(timezone.utc)
        message_id = f"msg-{int(now.timestamp())}"

        (
            llm_request,
            search_results,
            _prompt,
            _phi_present,
            intent,
            adapter,
            reasoning_path,
            retrieval_confidence,
        ) = await self._prepare_llm_request(request=request, clinical_context=clinical_context, trace_id=trace_id)

        logging.info(f"Query classified as intent='{intent}', trace_id={trace_id}")

        # Initial LLM call
        llm_response: LLMResponse = await self.llm_client.generate(llm_request)

        # Tool execution loop - handle tool calls until LLM returns final response
        iteration = 0
        total_tokens = llm_response.used_tokens or 0
        conversation_messages = [
            {"role": "user", "content": llm_request.prompt},
            {
                "role": "assistant",
                "content": llm_response.text or "",
                "tool_calls": None,
            },
        ]

        # Update the assistant message with tool_calls if present
        if llm_response.tool_calls:
            conversation_messages[-1]["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": tc.arguments},
                }
                for tc in llm_response.tool_calls
            ]

        while llm_response.tool_calls and self.enable_tools and iteration < self.max_tool_iterations:
            iteration += 1
            logging.info(
                f"Tool execution iteration {iteration}/{self.max_tool_iterations}, "
                f"{len(llm_response.tool_calls)} tool calls, trace_id={trace_id}"
            )

            # Execute each tool call
            for tool_call in llm_response.tool_calls:
                logging.info(f"Executing tool: {tool_call.name}, trace_id={trace_id}")

                tool_result = await self._execute_tool_call(
                    tool_call=tool_call,
                    user_id=user_id or "anonymous",
                    session_id=request.session_id,
                    trace_id=trace_id,
                )

                # Add tool result to conversation
                conversation_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(tool_result),
                    }
                )

                # Add to reasoning path for transparency
                reasoning_path.append(
                    {
                        "type": "tool_call",
                        "iteration": iteration,
                        "tool": tool_call.name,
                        "result_keys": (list(tool_result.keys()) if isinstance(tool_result, dict) else None),
                    }
                )

            # Continue conversation with tool results
            followup_request = LLMRequest(
                prompt=None,  # Use messages instead
                messages=conversation_messages,
                intent=intent,
                temperature=llm_request.temperature,
                max_tokens=llm_request.max_tokens,
                phi_present=llm_request.phi_present,
                trace_id=trace_id,
                model_override=llm_request.model_override,
                model_provider=llm_request.model_provider,
                tools=llm_request.tools,
                tool_choice="auto",
            )

            llm_response = await self.llm_client.generate(followup_request)
            total_tokens += llm_response.used_tokens or 0

            # Update conversation with new assistant response
            assistant_msg = {"role": "assistant", "content": llm_response.text or ""}
            if llm_response.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.name, "arguments": tc.arguments},
                    }
                    for tc in llm_response.tool_calls
                ]
            conversation_messages.append(assistant_msg)

        if iteration >= self.max_tool_iterations and llm_response.tool_calls:
            logging.warning(
                f"Tool execution reached max iterations ({self.max_tool_iterations}), " f"trace_id={trace_id}"
            )

        # Extract citations from search results
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
            tokens=total_tokens,
            model=llm_response.model_name,
            model_provider=self._resolve_model_provider(adapter, llm_request, llm_response),
            model_confidence=(adapter.confidence if adapter else None),
            retrieval_confidence=retrieval_confidence if retrieval_confidence else None,
            reasoning_path=reasoning_path,
            finish_reason=llm_response.finish_reason,
        )

    async def prepare_realtime_session(
        self,
        user_id: str,
        conversation_id: str | None = None,
        voice: str | None = None,
        language: str | None = None,
        vad_sensitivity: int | None = None,
    ) -> dict:
        """Expose realtime session config for voice-first clients."""

        if not self.realtime_client.is_enabled():
            raise ValueError("Realtime client is not enabled")

        return await realtime_voice_service.generate_session_config(
            user_id=user_id,
            conversation_id=conversation_id,
            voice=voice,
            language=language,
            vad_sensitivity=vad_sensitivity,
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

        (
            llm_request,
            search_results,
            _prompt,
            _phi_present,
            intent,
            adapter,
            reasoning_path,
            retrieval_confidence,
        ) = await self._prepare_llm_request(request=request, clinical_context=clinical_context, trace_id=trace_id)

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
            model_provider=self._resolve_model_provider(adapter, llm_request, llm_response),
            model_confidence=(adapter.confidence if adapter else None),
            retrieval_confidence=retrieval_confidence if retrieval_confidence else None,
            reasoning_path=reasoning_path,
            finish_reason=llm_response.finish_reason,
        )
