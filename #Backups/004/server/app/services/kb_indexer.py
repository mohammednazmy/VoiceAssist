"""Knowledge base indexing service stub.

Implements the IndexingJob state machine and ingestion pipeline
described in SEMANTIC_SEARCH_DESIGN.md.
"""
from __future__ import annotations

from typing import Any, Dict
from pydantic import BaseModel


class IndexingJob(BaseModel):
    id: str
    document_id: str
    state: str  # pending|running|completed|failed|superseded
    attempts: int = 0
    details: Dict[str, Any] = {}


async def start_indexing_job(document_id: str) -> IndexingJob:
    """Create a new indexing job (stub).

    Real implementation should enqueue work to a background worker
    and persist job state to the database.
    """
    return IndexingJob(id="job-stub", document_id=document_id, state="pending")


async def tick_indexing_job(job: IndexingJob) -> IndexingJob:
    """Progress an indexing job (stub)."""
    job.state = "completed"
    return job
