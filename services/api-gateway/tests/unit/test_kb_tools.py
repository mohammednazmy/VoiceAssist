from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest

from types import SimpleNamespace


class _FakeResult:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def mappings(self) -> "_FakeResult":
        return self

    def all(self) -> list[dict[str, Any]]:
        return self._rows


class _FakeAsyncSession:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    async def execute(self, *_args, **_kwargs) -> _FakeResult:
        return _FakeResult(self._rows)


class _FakeResultFetchall:
    def __init__(self, rows: list[Any]):
        self._rows = rows

    def fetchall(self) -> list[Any]:
        return self._rows


class _FakeAsyncSessionFetchall:
    def __init__(self, rows: list[Any]):
        self._rows = rows

    async def execute(self, *_args, **_kwargs) -> _FakeResultFetchall:
        return _FakeResultFetchall(self._rows)


@pytest.mark.asyncio
async def test_kb_search_prefers_keyword_title_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.tools.search_tools import handle_kb_search
    from app.services.tools.tool_service import ToolExecutionContext

    async def _no_semantic(**_kwargs) -> list[dict[str, Any]]:
        return []

    # Ensure this test doesn't require Qdrant/OpenAI.
    monkeypatch.setattr("app.services.tools.search_tools._semantic_search_kb_documents", _no_semantic)

    fake_db = _FakeAsyncSession(
        [
            {
                "document_id": "doc-123",
                "title": "First Aid Cardiology",
                "source_type": "user_general",
                "created_at": datetime(2025, 12, 12, tzinfo=timezone.utc),
                "total_pages": 100,
                "has_toc": True,
                "has_figures": True,
                "processing_stage": "complete",
                "indexing_status": "indexed",
            }
        ]
    )

    ctx = ToolExecutionContext(
        user_id=str(uuid4()),
        mode="voice",
        db_session=fake_db,  # type: ignore[arg-type]
    )
    result = await handle_kb_search({"query": "First Aid Cardiology", "max_results": 5}, ctx)
    assert result.success is True
    assert isinstance(result.data, dict)
    assert result.data["count"] == 1
    assert result.data["documents"][0]["title"] == "First Aid Cardiology"
    assert result.data["documents"][0]["match_type"] == "title_keyword"


@pytest.mark.asyncio
async def test_kb_search_retries_without_sources_when_overfiltered(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.tools.search_tools import handle_kb_search
    from app.services.tools.tool_service import ToolExecutionContext

    async def _no_semantic(**_kwargs) -> list[dict[str, Any]]:
        pytest.fail("Semantic search should not run when keyword match exists")

    calls: dict[str, int] = {"with_sources": 0, "without_sources": 0}
    doc = {
        "id": "doc-123",
        "title": "First Aid Cardiology",
        "category": "user_general",
        "created_at": datetime(2025, 12, 12, tzinfo=timezone.utc).isoformat(),
        "relevance_score": 1.0,
        "match_type": "title_keyword",
        "indexing_status": "indexed",
        "processing_stage": "complete",
        "total_pages": 100,
        "has_toc": True,
        "has_figures": True,
    }

    async def _keyword(**kwargs) -> list[dict[str, Any]]:
        sources = kwargs.get("sources") or []
        if sources:
            calls["with_sources"] += 1
            return []
        calls["without_sources"] += 1
        return [doc]

    monkeypatch.setattr("app.services.tools.search_tools._semantic_search_kb_documents", _no_semantic)
    monkeypatch.setattr("app.services.tools.search_tools._keyword_search_kb_documents", _keyword)

    ctx = ToolExecutionContext(
        user_id=str(uuid4()),
        mode="voice",
        db_session=_FakeAsyncSession([]),  # type: ignore[arg-type]
    )
    result = await handle_kb_search(
        {"query": "First Aid Cardiology", "sources": ["textbook"], "max_results": 5},
        ctx,
    )
    assert result.success is True
    assert isinstance(result.data, dict)
    assert result.data["count"] == 1
    assert calls["with_sources"] == 1
    assert calls["without_sources"] == 1


@pytest.mark.asyncio
async def test_kb_search_falls_back_to_semantic_when_no_db(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.tools.search_tools import handle_kb_search
    from app.services.tools.tool_service import ToolExecutionContext

    async def _semantic(**_kwargs) -> list[dict[str, Any]]:
        return [
            {
                "id": "doc-abc",
                "title": "First Aid Cardiology",
                "category": "textbook",
                "created_at": None,
                "relevance_score": 0.92,
                "match_type": "semantic",
                "excerpt": "Atrial fibrillation management…",
            }
        ]

    monkeypatch.setattr("app.services.tools.search_tools._semantic_search_kb_documents", _semantic)

    ctx = ToolExecutionContext(user_id=str(uuid4()), mode="voice", db_session=None)
    result = await handle_kb_search({"query": "afib management", "max_results": 5}, ctx)
    assert result.success is True
    assert isinstance(result.data, dict)
    assert result.data["count"] == 1
    assert result.data["documents"][0]["match_type"] == "semantic"


@pytest.mark.asyncio
async def test_knowledge_base_query_returns_context_and_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.tools.search_tools import handle_knowledge_base_query
    from app.services.tools.tool_service import ToolExecutionContext

    class _FakeAggregator:
        async def search(self, *args, **kwargs):
            from app.services.search_aggregator import SearchResult

            return [
                SearchResult(
                    chunk_id="chunk-1",
                    document_id="doc-1",
                    content="Beta blockers reduce mortality in HFrEF.",
                    score=0.91,
                    metadata={"title": "First Aid Cardiology", "source_type": "textbook"},
                )
            ]

        def extract_citations(self, _results):
            return [
                {
                    "id": "doc-1",
                    "source_type": "textbook",
                    "title": "First Aid Cardiology",
                    "relevance_score": 0.91,
                }
            ]

        def synthesize_across_documents(self, _results):
            return {
                "context": "[Doc 1: First Aid Cardiology] Beta blockers reduce mortality in HFrEF.",
                "documents": [{"document_id": "doc-1", "title": "First Aid Cardiology", "score": 0.91, "chunks": 1}],
            }

        def confidence_score(self, _results) -> float:
            return 0.9

    import app.services.search_aggregator as search_aggregator_module

    monkeypatch.setattr(search_aggregator_module, "SearchAggregator", _FakeAggregator)

    ctx = ToolExecutionContext(user_id=str(uuid4()), mode="voice", db_session=None)
    result = await handle_knowledge_base_query(
        {"question": "What is guideline-directed therapy for HFrEF?", "context_documents": 5},
        ctx,
    )
    assert result.success is True
    assert isinstance(result.data, dict)
    assert result.data["sources"][0]["title"] == "First Aid Cardiology"
    assert "context" in result.data


@pytest.mark.asyncio
async def test_document_select_reports_processing_document(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.tools.document_navigation_tool import handle_document_select
    from app.services.tools.tool_service import ToolExecutionContext

    doc = SimpleNamespace(
        document_id="doc-123",
        title="First Aid Cardiology",
        total_pages=100,
        has_toc=True,
        has_figures=True,
        document_structure=None,
        source_type="user_general",
        processing_stage="analyzing",
        processing_progress=42,
        indexing_status="processing",
    )

    ctx = ToolExecutionContext(
        user_id=str(uuid4()),
        mode="voice",
        db_session=_FakeAsyncSessionFetchall([doc]),  # type: ignore[arg-type]
    )
    result = await handle_document_select({"query": "First Aid Cardiology", "conversation_id": "conv-1"}, ctx)
    assert result.success is True
    assert result.data["processing_stage"] == "analyzing"
    assert "still processing" in (result.message or "").lower()


@pytest.mark.asyncio
async def test_document_select_allows_reading_when_structure_exists_but_stage_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.tools.document_navigation_tool import handle_document_select
    from app.services.tools.tool_service import ToolExecutionContext

    opened_doc = SimpleNamespace(
        document_id="doc-123",
        title="First Aid Cardiology",
        total_pages=47,
        has_toc=True,
        has_figures=True,
        document_structure={"pages": [{"page_number": 1, "text": "Hello"}]},
        source_type="user_cardiology",
        processing_stage="pending",
        processing_progress=0,
        indexing_status="indexed",
    )

    async def _fake_create_or_update_session(*_args, **_kwargs):
        return {"id": uuid4()}

    monkeypatch.setattr(
        "app.services.tools.document_navigation_tool._create_or_update_session",
        _fake_create_or_update_session,
    )

    ctx = ToolExecutionContext(
        user_id=str(uuid4()),
        mode="voice",
        db_session=_FakeAsyncSessionFetchall([opened_doc]),  # type: ignore[arg-type]
        conversation_id="conv-1",
    )
    result = await handle_document_select({"query": "First Aid Cardiology"}, ctx)
    assert result.success is True
    assert isinstance(result.data, dict)
    assert result.data["document_title"] == "First Aid Cardiology"
    assert result.data["voice_reading_ready"] is True
    assert "opened" in (result.message or "").lower()
    assert "still processing for voice reading" not in (result.message or "").lower()


@pytest.mark.asyncio
async def test_document_select_allows_complete_nonindexed_document(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.tools.document_navigation_tool import handle_document_select
    from app.services.tools.tool_service import ToolExecutionContext

    opened_doc = SimpleNamespace(
        document_id="doc-123",
        title="First Aid Cardiology",
        total_pages=100,
        has_toc=True,
        has_figures=True,
        document_structure={"pages": [{"page_number": 1, "text": "Hello"}]},
        source_type="user_general",
        processing_stage="complete",
        processing_progress=100,
        indexing_status="processing",
    )

    async def _fake_create_or_update_session(*_args, **_kwargs):
        return {"id": uuid4()}

    monkeypatch.setattr(
        "app.services.tools.document_navigation_tool._create_or_update_session",
        _fake_create_or_update_session,
    )

    ctx = ToolExecutionContext(
        user_id=str(uuid4()),
        mode="voice",
        db_session=_FakeAsyncSessionFetchall([opened_doc]),  # type: ignore[arg-type]
    )
    result = await handle_document_select({"query": "First Aid Cardiology", "conversation_id": "conv-1"}, ctx)
    assert result.success is True
    assert result.data["document_title"] == "First Aid Cardiology"
