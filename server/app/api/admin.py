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

from typing import List, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, validator

from app.core.api_envelope import APIEnvelope, success_response
from app.services.kb_store import ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, kb_store

router = APIRouter(prefix="/api/admin", tags=["admin"])


class BatchRequest(BaseModel):
    """Request body for KB batch operations."""

    action: Literal["delete", "reindex"]
    document_ids: List[str] = Field(..., min_length=1)


class PreflightRequest(BaseModel):
    """Input required to build a signed upload URL."""

    filename: str
    mime_type: str

    @validator("mime_type")
    def validate_mime_type(cls, value: str) -> str:  # noqa: D401 - simple guard
        """Ensure the MIME type is on the allowlist."""
        if value not in ALLOWED_MIME_TYPES:
            raise ValueError("Unsupported MIME type for knowledge document uploads")
        return value


@router.get("/kb/documents", response_model=APIEnvelope)
async def list_kb_documents(request: Request, skip: int = 0, limit: int = 50) -> APIEnvelope:
    """Return the knowledge document inventory for the admin panel."""

    documents = kb_store.list_documents(skip=skip, limit=limit)
    payload = {"documents": documents, "total": kb_store.total_documents}
    return success_response(payload, trace_id=getattr(request.state, "trace_id", None))


@router.post("/kb/documents/preflight", response_model=APIEnvelope)
async def create_upload_preflight(body: PreflightRequest, request: Request) -> APIEnvelope:
    """Return a signed URL and constraints for KB uploads."""

    preflight = kb_store.create_preflight(filename=body.filename, mime_type=body.mime_type)
    return success_response(preflight, trace_id=getattr(request.state, "trace_id", None))


@router.post("/kb/documents", response_model=APIEnvelope)
async def upload_kb_document(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(None),
    source_type: str = Form("uploaded"),
) -> APIEnvelope:
    """Accept a KB document upload and enqueue it for indexing."""

    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "VALIDATION_ERROR",
                "message": f"Unsupported MIME type: {mime_type}",
                "details": {"allowed_mime_types": sorted(ALLOWED_MIME_TYPES)},
            },
        )

    content = await file.read()
    size_bytes = len(content)
    if size_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "File exceeds maximum allowed size",
                "details": {"max_bytes": MAX_UPLOAD_BYTES, "received_bytes": size_bytes},
            },
        )

    record = kb_store.add_document(
        title=title or file.filename,
        source_type=source_type,
        file_name=file.filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        uploaded_by="admin@example.com",
    )

    data = {
        "document_id": record.id,
        "status": record.status,
        "message": "Upload accepted and scheduled for indexing",
        "document": record.to_admin_shape(),
    }
    return success_response(data, trace_id=getattr(request.state, "trace_id", None))


@router.post("/kb/documents/batch", response_model=APIEnvelope)
async def batch_documents(body: BatchRequest, request: Request) -> APIEnvelope:
    """Perform batch delete or reindex operations requested by the UI."""

    actor = "admin@example.com"
    results = []
    for doc_id in body.document_ids:
        try:
            if body.action == "delete":
                kb_store.delete_document(doc_id, actor=actor)
                results.append({"document_id": doc_id, "status": "deleted"})
            else:
                kb_store.reindex_document(doc_id, actor=actor)
                results.append({"document_id": doc_id, "status": "reindexed"})
        except KeyError:
            results.append({"document_id": doc_id, "status": "not_found"})

    payload = {
        "action": body.action,
        "results": results,
        "success_count": len([r for r in results if r["status"] != "not_found"]),
    }
    return success_response(payload, trace_id=getattr(request.state, "trace_id", None))


@router.get("/kb/documents/{doc_id}/audit", response_model=APIEnvelope)
async def get_kb_document_audit(doc_id: str, request: Request) -> APIEnvelope:
    """Return the audit trail for a specific KB document."""

    try:
        events = kb_store.get_audit_events(doc_id)
    except KeyError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": f"Document {doc_id} not found"},
        ) from exc

    return success_response(events, trace_id=getattr(request.state, "trace_id", None))
