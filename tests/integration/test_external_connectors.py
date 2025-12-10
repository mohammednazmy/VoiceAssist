import asyncio
from typing import List

import httpx
import pytest

from tests.integration.api_gateway_loader import load_api_gateway_module

connectors_module = load_api_gateway_module(
    "services/external_connectors.py", "api_gateway_external_connectors"
)
pubmed_module = load_api_gateway_module(
    "services/pubmed_enhanced_service.py", "api_gateway_pubmed_service"
)

ExternalSyncScheduler = connectors_module.ExternalSyncScheduler
OpenEvidenceConnector = connectors_module.OpenEvidenceConnector
PubMedConnector = connectors_module.PubMedConnector
ArticleStatus = pubmed_module.ArticleStatus
PubMedArticle = pubmed_module.PubMedArticle
SearchResult = pubmed_module.SearchResult
@pytest.mark.asyncio
async def test_openevidence_connector_uses_mock_transport():
    payload = {
        "results": [
            {
                "id": "ev-1",
                "title": "Heart Failure Evidence",
                "summary": "Guideline-aligned recommendation",
                "url": "https://example.com/ev-1",
                "source_type": "openevidence",
                "score": 0.92,
            }
        ]
    }

    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    async with httpx.AsyncClient(transport=transport, base_url="https://mock.local") as client:
        connector = OpenEvidenceConnector(
            api_key="test-key", base_url="https://mock.local", client=client
        )
        records = await connector.fetch_recent("heart failure", limit=1)

    assert len(records) == 1
    assert records[0].id == "ev-1"
    assert records[0].metadata["source_type"] == "openevidence"


@pytest.mark.asyncio
async def test_pubmed_connector_transforms_articles():
    class StubPubMedService:
        async def search(self, query: str, max_results: int = 5, sort: str = "pub_date"):
            article = PubMedArticle(
                pmid="123456",
                title="Sample Study",
                abstract="Key findings",
                publication_types=["Review"],
                status=ArticleStatus.ABSTRACT_ONLY,
            )
            return SearchResult(query=query, total_count=1, articles=[article])

    connector = PubMedConnector(service=StubPubMedService())
    records = await connector.fetch_recent("oncology", max_results=1)

    assert len(records) == 1
    assert records[0].source == "pubmed"
    assert records[0].url.endswith("123456/")
    assert records[0].metadata["source_type"] == "pubmed"


@pytest.mark.asyncio
async def test_sync_scheduler_runs_connectors():
    class DummyConnector:
        def __init__(self):
            self.calls: List[int] = []
            self.name = "dummy"

        async def sync(self):
            self.calls.append(1)

    connector = DummyConnector()
    scheduler = ExternalSyncScheduler(
        connectors=[connector],
        default_interval_minutes=1,
        tick_seconds=0.01,
    )

    await scheduler.start()
    await asyncio.sleep(0.05)
    await scheduler.stop()

    assert len(connector.calls) >= 1
