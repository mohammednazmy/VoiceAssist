"""
Unit tests for RAG Service (QueryOrchestrator)

Tests the Query Orchestrator for RAG integration, citation handling,
and query processing pipeline.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.rag_service import Citation, QueryOrchestrator, QueryRequest, QueryResponse


class TestCitationModel:
    """Tests for Citation Pydantic model."""

    def test_minimal_citation(self):
        """Test Citation with required fields only."""
        citation = Citation(
            id="cit-001",
            source_id="src-123",
            source_type="textbook",
            title="Medical Textbook Chapter 1",
        )
        assert citation.id == "cit-001"
        assert citation.source_id == "src-123"
        assert citation.source_type == "textbook"
        assert citation.title == "Medical Textbook Chapter 1"
        assert citation.url is None
        assert citation.authors is None

    def test_full_citation(self):
        """Test Citation with all fields."""
        citation = Citation(
            id="cit-002",
            source_id="pmid-12345",
            source_type="journal",
            title="Novel Treatment Approaches",
            url="https://pubmed.ncbi.nlm.nih.gov/12345",
            authors=["Smith J", "Jones M"],
            publication_date="2024-01-15",
            journal="New England Journal of Medicine",
            volume="390",
            issue="2",
            pages="123-130",
            doi="10.1056/NEJMoa2400001",
            pmid="12345",
            relevance_score=0.95,
            quoted_text="Key finding from the study...",
            context={"section": "results"},
        )
        assert citation.authors == ["Smith J", "Jones M"]
        assert citation.journal == "New England Journal of Medicine"
        assert citation.relevance_score == 0.95

    def test_citation_source_types(self):
        """Test Citation accepts valid source types."""
        for source_type in ["textbook", "journal", "guideline", "note"]:
            citation = Citation(
                id=f"cit-{source_type}",
                source_id="src-1",
                source_type=source_type,
                title="Test",
            )
            assert citation.source_type == source_type


class TestQueryRequestModel:
    """Tests for QueryRequest Pydantic model."""

    def test_minimal_request(self):
        """Test QueryRequest with required fields only."""
        request = QueryRequest(query="What is diabetes?")
        assert request.query == "What is diabetes?"
        assert request.session_id is None
        assert request.clinical_context_id is None

    def test_full_request(self):
        """Test QueryRequest with all fields."""
        request = QueryRequest(
            session_id="sess-123",
            query="Treatment options for type 2 diabetes",
            clinical_context_id="ctx-456",
        )
        assert request.session_id == "sess-123"
        assert request.clinical_context_id == "ctx-456"

    def test_empty_query_allowed(self):
        """Test QueryRequest allows empty query (validation at service level)."""
        # Pydantic allows empty string, validation happens in orchestrator
        request = QueryRequest(query="")
        assert request.query == ""


class TestQueryResponseModel:
    """Tests for QueryResponse Pydantic model."""

    def test_minimal_response(self):
        """Test QueryResponse with required fields only."""
        response = QueryResponse(
            session_id="sess-123",
            message_id="msg-456",
            answer="Diabetes is a chronic condition...",
            created_at=datetime.now(timezone.utc),
        )
        assert response.session_id == "sess-123"
        assert response.answer == "Diabetes is a chronic condition..."
        assert response.citations == []
        assert response.tokens is None

    def test_full_response(self):
        """Test QueryResponse with all fields."""
        citation = Citation(
            id="cit-1",
            source_id="src-1",
            source_type="textbook",
            title="Medical Reference",
        )
        response = QueryResponse(
            session_id="sess-123",
            message_id="msg-456",
            answer="Based on current guidelines...",
            created_at=datetime.now(timezone.utc),
            citations=[citation],
            tokens=150,
            model="gpt-4o",
            model_provider="openai",
            model_confidence=0.92,
            retrieval_confidence=0.88,
            reasoning_path=[{"step": 1, "action": "search"}],
            finish_reason="stop",
        )
        assert len(response.citations) == 1
        assert response.tokens == 150
        assert response.model_confidence == 0.92


class TestQueryOrchestratorInit:
    """Tests for QueryOrchestrator initialization."""

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_init_with_defaults(self, mock_llm, mock_search, mock_settings):
        """Test QueryOrchestrator initializes with defaults."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        orchestrator = QueryOrchestrator()

        assert orchestrator.enable_rag is True
        assert orchestrator.rag_top_k == 5
        assert orchestrator.rag_score_threshold == 0.7

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_init_rag_disabled(self, mock_llm, mock_search, mock_settings):
        """Test QueryOrchestrator with RAG disabled."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        orchestrator = QueryOrchestrator(enable_rag=False)

        assert orchestrator.enable_rag is False
        assert orchestrator.search_aggregator is None

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_init_custom_rag_params(self, mock_llm, mock_search, mock_settings):
        """Test QueryOrchestrator with custom RAG parameters."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        orchestrator = QueryOrchestrator(
            rag_top_k=10,
            rag_score_threshold=0.8,
        )

        assert orchestrator.rag_top_k == 10
        assert orchestrator.rag_score_threshold == 0.8


class TestQueryOrchestratorDependencies:
    """Tests for QueryOrchestrator dependencies."""

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_llm_client_initialized(self, mock_llm, mock_search, mock_settings):
        """Test LLM client is properly initialized."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = "http://local:8080"
        mock_settings.LOCAL_LLM_API_KEY = "local-key"
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = "local-model"

        _orchestrator = QueryOrchestrator()  # noqa: F841

        mock_llm.assert_called_once()
        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["cloud_model"] == "gpt-4o"
        assert call_kwargs["openai_api_key"] == "test-key"

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_search_aggregator_initialized(self, mock_llm, mock_search, mock_settings):
        """Test SearchAggregator is initialized when RAG enabled."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        _orchestrator = QueryOrchestrator(enable_rag=True)  # noqa: F841

        mock_search.assert_called_once()


class TestQueryOrchestratorToolSupport:
    """Tests for QueryOrchestrator tool/function calling support."""

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_tools_enabled_by_default(self, mock_llm, mock_search, mock_settings):
        """Test tools are enabled by default."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        orchestrator = QueryOrchestrator()

        assert orchestrator.enable_tools is True
        assert orchestrator.max_tool_iterations == 5

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_tools_can_be_disabled(self, mock_llm, mock_search, mock_settings):
        """Test tools can be disabled."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        orchestrator = QueryOrchestrator(enable_tools=False)

        assert orchestrator.enable_tools is False

    @patch("app.services.rag_service.settings")
    @patch("app.services.rag_service.SearchAggregator")
    @patch("app.services.rag_service.LLMClient")
    def test_custom_max_tool_iterations(self, mock_llm, mock_search, mock_settings):
        """Test custom max tool iterations."""
        mock_settings.OPENAI_API_KEY = "test-key"
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.LOCAL_LLM_URL = None
        mock_settings.LOCAL_LLM_API_KEY = None
        mock_settings.LOCAL_LLM_TIMEOUT_SEC = 15
        mock_settings.LOCAL_LLM_MODEL = None

        orchestrator = QueryOrchestrator(max_tool_iterations=10)

        assert orchestrator.max_tool_iterations == 10


class TestCitationParsing:
    """Tests for citation parsing and formatting."""

    def test_citation_to_dict(self):
        """Test Citation can be converted to dict."""
        citation = Citation(
            id="cit-1",
            source_id="src-1",
            source_type="journal",
            title="Test Article",
            pmid="12345",
        )
        data = citation.model_dump()

        assert data["id"] == "cit-1"
        assert data["source_type"] == "journal"
        assert data["pmid"] == "12345"

    def test_citation_from_dict(self):
        """Test Citation can be created from dict."""
        data = {
            "id": "cit-2",
            "source_id": "src-2",
            "source_type": "guideline",
            "title": "Clinical Guidelines",
            "url": "https://guidelines.org/123",
        }
        citation = Citation(**data)

        assert citation.id == "cit-2"
        assert citation.url == "https://guidelines.org/123"

    def test_citation_relevance_score_range(self):
        """Test Citation relevance_score accepts float values."""
        for score in [0.0, 0.5, 1.0, 0.95]:
            citation = Citation(
                id="cit",
                source_id="src",
                source_type="textbook",
                title="Test",
                relevance_score=score,
            )
            assert citation.relevance_score == score


class TestQueryResponseSerialization:
    """Tests for QueryResponse serialization."""

    def test_response_to_json(self):
        """Test QueryResponse can be serialized to JSON."""
        response = QueryResponse(
            session_id="sess-1",
            message_id="msg-1",
            answer="Test answer",
            created_at=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
            citations=[
                Citation(
                    id="cit-1",
                    source_id="src-1",
                    source_type="textbook",
                    title="Test Book",
                )
            ],
        )
        json_str = response.model_dump_json()

        assert "sess-1" in json_str
        assert "Test answer" in json_str
        assert "Test Book" in json_str

    def test_response_reasoning_path(self):
        """Test QueryResponse reasoning_path field."""
        response = QueryResponse(
            session_id="sess-1",
            message_id="msg-1",
            answer="Answer",
            created_at=datetime.now(timezone.utc),
            reasoning_path=[
                {"step": 1, "action": "query_expansion"},
                {"step": 2, "action": "semantic_search"},
                {"step": 3, "action": "llm_synthesis"},
            ],
        )
        assert len(response.reasoning_path) == 3
        assert response.reasoning_path[0]["action"] == "query_expansion"


class TestQueryOrchestratorPhiConsciousRetrieval:
    """Tests for PHI-conscious retrieval behavior in QueryOrchestrator."""

    @pytest.mark.asyncio
    async def test_run_retrieval_with_exclude_phi_applies_filter(self):
        """
        Ensure that when exclude_phi=True, SearchAggregator.search is called with phi_risk filter.
        """
        orchestrator = QueryOrchestrator(enable_rag=True)
        mock_search = AsyncMock(return_value=[])
        orchestrator.search_aggregator = MagicMock()
        orchestrator.search_aggregator.search = mock_search
        orchestrator.search_aggregator.synthesize_across_documents = MagicMock(
            return_value={"context": "", "documents": []}
        )
        orchestrator.search_aggregator.format_context_for_rag = MagicMock(return_value="")
        orchestrator.search_aggregator.confidence_score = MagicMock(return_value=0.5)

        await orchestrator._run_retrieval("test query", exclude_phi=True)

        assert mock_search.await_count >= 1
        _args, kwargs = mock_search.await_args
        filters = kwargs.get("filter_conditions") or {}
        assert "phi_risk" in filters
        assert filters["phi_risk"] == ["none", "low", "medium"]

    @pytest.mark.asyncio
    async def test_prepare_llm_request_threads_exclude_phi_from_query_request(self):
        """
        Ensure QueryRequest.exclude_phi is threaded into _run_retrieval.
        """
        orchestrator = QueryOrchestrator(enable_rag=True)
        mock_run_retrieval = AsyncMock(return_value=([], "", [], 0.0))
        orchestrator._run_retrieval = mock_run_retrieval  # type: ignore[assignment]

        request = QueryRequest(session_id="s", query="q", clinical_context_id=None, exclude_phi=True)
        await orchestrator._prepare_llm_request(request=request, clinical_context=None, trace_id="trace-1")

        mock_run_retrieval.assert_awaited()
        args, kwargs = mock_run_retrieval.await_args
        # First positional arg is query text; exclude_phi should be passed as kwarg
        assert args[0] == "q"
        assert kwargs.get("exclude_phi") is True
