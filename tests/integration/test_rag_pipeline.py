import os
import sys
import types

import pytest

# Stub optional email dependencies imported by the services package during test collection
imap_stub = types.SimpleNamespace(
    IMAP4_SSL=object,
    AioimaplibException=Exception,
)
smtp_stub = types.SimpleNamespace(
    SMTP=object,
    SMTPException=Exception,
)

sys.modules.setdefault("aioimaplib", imap_stub)
sys.modules.setdefault("aiosmtplib", smtp_stub)
app_pkg = types.ModuleType("app")
app_pkg.__path__ = [os.path.join(os.getcwd(), "services/api-gateway/app")]
services_pkg = types.ModuleType("app.services")
services_pkg.__path__ = [os.path.join(os.getcwd(), "services/api-gateway/app/services")]
sys.modules.setdefault("app", app_pkg)
sys.modules.setdefault("app.services", services_pkg)

from app.services.llm_client import LLMResponse
from app.services.model_adapters import ModelAdapterRegistry
from app.services.rag_service import QueryOrchestrator, QueryRequest
from app.services.search_aggregator import SearchResult


class StubAggregator:
    def __init__(self):
        self.queries = []

    async def search(self, query: str, top_k: int = 5, score_threshold: float = 0.7, filter_conditions=None):
        self.queries.append(query)
        score = max(0.5, 0.95 - 0.05 * (len(self.queries) - 1))
        return [
            SearchResult(
                chunk_id=f"chunk-{len(self.queries)}",
                document_id=f"doc-{query}-{len(self.queries)}",
                content=f"Evidence for {query}",
                score=score,
                metadata={"title": f"Doc {query}", "source_type": "literature"},
            )
        ]

    def synthesize_across_documents(self, search_results):
        return {
            "context": "\n".join(result.content for result in search_results),
            "documents": [
                {"document_id": result.document_id, "title": result.metadata.get("title"), "score": result.score}
                for result in search_results
            ],
        }

    def format_context_for_rag(self, search_results):
        return "\n".join(result.content for result in search_results)

    def extract_citations(self, search_results):
        return [
            {
                "id": result.document_id,
                "source_type": result.metadata.get("source_type"),
                "title": result.metadata.get("title"),
                "relevance_score": result.score,
            }
            for result in search_results
        ]

    def confidence_score(self, search_results):
        return 0.88


class StubLLM:
    def __init__(self, model_name: str = "stub-model"):
        self.model_name = model_name
        self.has_local_model = False

    async def generate(self, req):
        return LLMResponse(
            text=f"Answer via {req.model_override or self.model_name}",
            model_name=req.model_override or self.model_name,
            model_family="cloud",
            used_tokens=42,
            latency_ms=12.5,
            finish_reason="stop",
        )

    async def stream_generate(self, req, on_chunk=None):
        if on_chunk:
            maybe = on_chunk("partial")
            if maybe and hasattr(maybe, "__await__"):
                await maybe
        return await self.generate(req)


@pytest.mark.asyncio
async def test_query_orchestrator_multi_hop_confidence(monkeypatch):
    orchestrator = QueryOrchestrator(
        enable_rag=True,
        search_aggregator=StubAggregator(),
        enable_multi_hop=True,
        enable_query_decomposition=True,
    )
    orchestrator.llm_client = StubLLM()
    monkeypatch.setattr(orchestrator.intent_classifier, "classify", lambda query, clinical_context=None: "diagnosis")

    async def fake_decompose(_query: str):
        return ["first hop", "second hop"]

    monkeypatch.setattr(orchestrator.query_expander, "decompose", fake_decompose)

    result = await orchestrator.handle_query(QueryRequest(query="Hypertension and diabetes case", session_id="s-1"))

    assert result.answer.startswith("Answer via")
    assert len(result.citations) == 2
    assert result.retrieval_confidence and result.retrieval_confidence > 0.5
    assert len(result.reasoning_path) == 2
    assert result.model_provider in {"hf-local", "openai", None}


def test_model_adapter_registry_toggles(monkeypatch):
    registry = ModelAdapterRegistry(pubmedbert_enabled=False, biogpt_enabled=True)

    adapter = registry.select_for_intent("guideline")
    assert adapter.key == "default"

    adapter = registry.select_for_intent("diagnosis")
    assert adapter.key in {"biogpt", "default"}
