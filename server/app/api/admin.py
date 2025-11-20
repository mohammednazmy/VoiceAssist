"""Admin API endpoints for VoiceAssist V2.

This router implements the minimal endpoints required by the
admin-panel demo UI and serves as the starting point for the
full ADMIN API described in ADMIN_PANEL_SPECS.md and SERVICE_CATALOG.md.

Security Note:
- These endpoints are intended for administrative access only.
- Authentication/authorization will be added in Phase 2 (see SECURITY_COMPLIANCE.md).
- KB documents and jobs may reference PHI indirectly (document titles, file names).
- Future phases should ensure PHI-redacted views for logs/analytics.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Request

from app.core.api_envelope import APIEnvelope, success_response

router = APIRouter(prefix="/api/admin", tags=["admin"])


class KnowledgeDocumentOut(dict):
    """Very lightweight doc representation for admin list view.

    The canonical model lives in DATA_MODEL.md; this shape is intentionally
    minimal to keep the stub API simple.
    """


class IndexingJobOut(dict):
    """Very lightweight indexing job representation."""


@router.get("/kb/documents", response_model=APIEnvelope)
async def list_kb_documents(request: Request) -> APIEnvelope:
    """Return a demo list of knowledge documents.

    In later phases this should read from the KB tables in Postgres
    and reflect real indexing status.

    NOTE: Returns direct array to match admin-panel/src/hooks/useKnowledgeDocuments.ts
    which expects: fetchAPI<KnowledgeDocument[]>('/api/admin/kb/documents')
    """
    docs: List[KnowledgeDocumentOut] = [
        KnowledgeDocumentOut(
            id="doc-harrisons-hf",
            name="Harrison's · Heart Failure",
            type="textbook",
            indexed=True,
            version="v1",
            lastIndexedAt="2025-01-01T00:00:00Z",
        ),
        KnowledgeDocumentOut(
            id="doc-aha-2022-hf",
            name="AHA/ACC/HFSA 2022 HF Guideline",
            type="guideline",
            indexed=True,
            version="v1",
            lastIndexedAt="2025-01-02T00:00:00Z",
        ),
    ]
    # Return direct array - fetchAPI unwraps APIEnvelope to get data field
    return success_response(docs, trace_id=getattr(request.state, "trace_id", None))


@router.get("/kb/indexing-jobs", response_model=APIEnvelope)
async def list_indexing_jobs(request: Request) -> APIEnvelope:
    """Return a demo list of indexing jobs.

    Later phases should surface the actual IndexingJob records from
    the KBIndexer state machine.

    NOTE: Returns direct array to match admin-panel/src/hooks/useIndexingJobs.ts
    which expects: fetchAPI<IndexingJob[]>('/api/admin/kb/jobs')
    """
    jobs: List[IndexingJobOut] = [
        IndexingJobOut(
            id="job-1",
            documentId="doc-harrisons-hf",
            state="completed",
            attempts=1,
        ),
        IndexingJobOut(
            id="job-2",
            documentId="doc-aha-2022-hf",
            state="running",
            attempts=1,
        ),
    ]
    # Return direct array - fetchAPI unwraps APIEnvelope to get data field
    return success_response(jobs, trace_id=getattr(request.state, "trace_id", None))
