"""Unit tests for KB-related tool handlers.

Focuses on:
- knowledge_base_query tool data shape (answer + sources)
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.tools.tool_service import ToolExecutionContext
from app.services.tools.search_tools import handle_knowledge_base_query


@pytest.mark.unit
@pytest.mark.asyncio
async def test_handle_knowledge_base_query_returns_answer_and_sources(monkeypatch):
  """knowledge_base_query should return data shaped like /api/kb/query."""

  # Stub RAG result to avoid hitting external services
  async def fake_run_query(self, req):
    return SimpleNamespace(
      answer="Synthesized KB answer.",
      citations=[
        SimpleNamespace(
          id="doc-1",
          source_id=None,
          title="Hospital DKA protocol",
          source_type="guideline",
          relevance_score=0.92,
        ),
        SimpleNamespace(
          id=None,
          source_id="doc-2",
          title="Insulin titration quick guide",
          source_type="policy",
          relevance_score=0.81,
        ),
      ],
    )

  class DummyOrchestrator:
    def __init__(self, enable_rag: bool = True, rag_top_k: int | None = None):
      self.enable_rag = enable_rag
      self.rag_top_k = rag_top_k

    async def run_query(self, req):
      return await fake_run_query(self, req)

  class DummyQueryRequest:
    def __init__(self, *args, **kwargs):
      self.kwargs = kwargs

  # Patch orchestrator + request types used inside the handler
  monkeypatch.setattr(
    "app.services.rag_service.QueryOrchestrator",
    DummyOrchestrator,
  )
  monkeypatch.setattr(
    "app.services.rag_service.QueryRequest",
    DummyQueryRequest,
  )

  context = ToolExecutionContext(
    user_id="user-1",
    session_id="session-1",
    mode="voice",
    conversation_id="conv-1",
    clinical_context_id="ctx-1",
    exclude_phi=True,
  )

  result = await handle_knowledge_base_query(
    {"question": "How do we treat DKA?", "context_documents": 3},
    context,
  )

  assert result.success is True
  assert isinstance(result.data, dict)

  data = result.data
  assert data["question"] == "How do we treat DKA?"
  assert data["answer"] == "Synthesized KB answer."
  assert "sources" in data

  sources = data["sources"]
  assert isinstance(sources, list)
  assert len(sources) == 2

  # First source should mirror the first citation
  first = sources[0]
  assert first["id"] == "doc-1"
  assert first["title"] == "Hospital DKA protocol"
  assert first["category"] == "guideline"
  assert first["score"] == 0.92

