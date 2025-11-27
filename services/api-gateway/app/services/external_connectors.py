"""External data source connectors and periodic sync scheduler.

Provides lightweight clients for OpenEvidence and PubMed along with a
simple asyncio-based scheduler to keep the local KB refreshed. The
connectors are intentionally resilient and accept injected HTTP clients
or services for testing so that contract tests can run without hitting
real APIs.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, TYPE_CHECKING

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

if TYPE_CHECKING:
    from app.services.pubmed_enhanced_service import EnhancedPubMedService, PubMedArticle


@dataclass
class ExternalRecord:
    """Normalized record pulled from an external evidence source."""

    id: str
    title: str
    summary: str
    source: str
    url: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SyncResult:
    """Result of a sync cycle for a connector."""

    source: str
    fetched: int
    stored: int
    errors: List[str] = field(default_factory=list)
    last_synced_at: datetime = field(default_factory=datetime.utcnow)


class OpenEvidenceConnector:
    """Connector for the OpenEvidence API."""

    name = "openevidence"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.openevidence.com",
        client: Optional[httpx.AsyncClient] = None,
        default_topics: Optional[Iterable[str]] = None,
        timeout: float = 10.0,
    ) -> None:
        self.api_key = api_key or settings.OPENEVIDENCE_API_KEY
        self.base_url = base_url or settings.OPENEVIDENCE_BASE_URL
        self.client = client
        self.default_topics = list(default_topics or ["cardiology", "infectious disease"])
        self.timeout = timeout

    async def fetch_recent(
        self, query: str, limit: int = 5
    ) -> List[ExternalRecord]:
        """Fetch recent evidence for a query.

        Returns empty results when credentials are missing to avoid noisy
        failures in environments without API keys.
        """

        if not self.api_key and self.client is None:
            logger.warning("OpenEvidence API key missing; returning no results")
            return []

        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        close_client = False
        client = self.client
        if client is None:
            client = httpx.AsyncClient(
                base_url=self.base_url, headers=headers, timeout=self.timeout
            )
            close_client = True

        try:
            response = await client.get(
                "/v1/search", params={"q": query, "limit": limit}
            )
            response.raise_for_status()
            payload = response.json()
            records: List[ExternalRecord] = []

            for raw in payload.get("results", []):
                record = ExternalRecord(
                    id=str(raw.get("id") or raw.get("uid") or raw.get("reference_id", "")),
                    title=raw.get("title") or "Untitled evidence",
                    summary=raw.get("summary") or raw.get("abstract", ""),
                    source=self.name,
                    url=raw.get("url"),
                    metadata={
                        "source_type": raw.get("source_type", self.name),
                        "score": raw.get("score"),
                        "quality": raw.get("quality"),
                    },
                )
                records.append(record)

            return records
        except httpx.HTTPError as exc:  # pragma: no cover - network failures
            logger.error("OpenEvidence request failed: %s", exc)
            return []
        finally:
            if close_client:
                await client.aclose()

    async def sync(self, topics: Optional[Iterable[str]] = None) -> SyncResult:
        """Sync a set of topics from OpenEvidence."""

        queries = list(topics or self.default_topics)
        fetched_records: List[ExternalRecord] = []
        errors: List[str] = []

        for topic in queries:
            try:
                fetched_records.extend(await self.fetch_recent(topic))
            except Exception as exc:  # noqa: BLE001
                logger.error("OpenEvidence sync failed for topic %s", topic, exc_info=True)
                errors.append(str(exc))

        return SyncResult(
            source=self.name,
            fetched=len(fetched_records),
            stored=len(fetched_records),  # Storage layer coming in future phases
            errors=errors,
        )


class PubMedConnector:
    """Connector for PubMed using EnhancedPubMedService."""

    name = "pubmed"

    def __init__(
        self,
        service: Optional["EnhancedPubMedService"] = None,
        api_key: Optional[str] = None,
        tool_email: Optional[str] = None,
    ) -> None:
        if service is None:
            from app.services.pubmed_enhanced_service import EnhancedPubMedService

            self.service = EnhancedPubMedService(api_key=api_key, email=tool_email)
        else:
            self.service = service
        self.default_queries = ["systematic review", "randomized trial"]

    async def fetch_recent(
        self, query: str, max_results: int = 5
    ) -> List[ExternalRecord]:
        """Search PubMed for recent articles."""

        try:
            search_result = await self.service.search(
                query=query, max_results=max_results, sort="pub_date"
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("PubMed search failed for '%s': %s", query, exc)
            return []

        return [self._to_record(article) for article in search_result.articles]

    async def sync(self, queries: Optional[Iterable[str]] = None) -> SyncResult:
        """Sync recent PubMed articles for common clinical queries."""

        topics = list(queries or self.default_queries)
        fetched_records: List[ExternalRecord] = []
        errors: List[str] = []

        for topic in topics:
            try:
                fetched_records.extend(await self.fetch_recent(topic))
            except Exception as exc:  # noqa: BLE001
                logger.error("PubMed sync failed for topic %s", topic, exc_info=True)
                errors.append(str(exc))

        return SyncResult(
            source=self.name,
            fetched=len(fetched_records),
            stored=len(fetched_records),
            errors=errors,
        )

    def _to_record(self, article: "PubMedArticle") -> ExternalRecord:
        """Normalize PubMed article into ExternalRecord."""

        return ExternalRecord(
            id=article.pmid,
            title=article.title,
            summary=article.abstract or article.citation,
            source=self.name,
            url=f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/",
            metadata={
                "source_type": "pubmed",
                "doi": article.doi,
                "status": article.status.value if article.status else None,
                "publication_types": article.publication_types,
            },
        )


class ExternalSyncScheduler:
    """Simple scheduler to run external connector syncs periodically."""

    def __init__(
        self,
        connectors: Iterable[object],
        default_interval_minutes: int = 180,
        per_connector_intervals: Optional[Dict[str, int]] = None,
        tick_seconds: Optional[float] = None,
    ) -> None:
        self.connectors = list(connectors)
        self.default_interval_minutes = default_interval_minutes
        self.per_connector_intervals = per_connector_intervals or {}
        self.tick_seconds = tick_seconds
        self._tasks: List[asyncio.Task] = []
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        """Start background sync tasks for each connector."""

        self._stop_event.clear()
        for connector in self.connectors:
            interval = self.per_connector_intervals.get(
                getattr(connector, "name", ""), self.default_interval_minutes
            )
            if interval <= 0:
                logger.info(
                    "Skipping connector %s because interval is %s",
                    getattr(connector, "name", "unknown"),
                    interval,
                )
                continue

            task = asyncio.create_task(self._run_connector(connector, interval))
            self._tasks.append(task)

        logger.info("Started %d external sync tasks", len(self._tasks))

    async def stop(self) -> None:
        """Stop background tasks and wait for completion."""

        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                logger.debug("Cancelled sync task")

        self._tasks.clear()

    async def _run_connector(self, connector: object, interval_minutes: int) -> None:
        """Run a connector on an interval until stopped."""

        interval_seconds = (
            self.tick_seconds
            if self.tick_seconds is not None
            else max(interval_minutes, 1) * 60
        )

        while not self._stop_event.is_set():
            try:
                sync_method = getattr(connector, "sync")
                await sync_method()
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "External sync failed for %s: %s", getattr(connector, "name", "unknown"), exc
                )

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue
