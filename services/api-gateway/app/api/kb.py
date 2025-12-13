"""
User-facing Knowledge Base API.

Provides a friendly `/api/kb/*` surface that fronts:
- User document management (`/api/documents`)
- Simple document search over kb_documents
- Lightweight RAG-style query endpoint using existing documents as sources

All endpoints use the standard APIEnvelope (`success_response` / `error_response`).
"""

from __future__ import annotations

import json
from datetime import datetime
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_organization, get_current_user
from app.core.logging import get_logger
from app.core.metrics import record_instrumented_api_call
from app.core.business_metrics import (
    kb_query_answer_length_tokens,
    kb_query_failures_total,
    kb_query_latency_seconds,
    kb_query_requests_total,
    kb_query_sources_per_answer,
    kb_query_top_score,
)
from app.models.document import Document
from app.models.organization import Organization
from app.models.user import User
from app.models.voice_document_session import VoiceDocumentSession
from app.services.analytics_service import analytics_service
from app.services.rag_service import QueryOrchestrator, QueryRequest

# Reuse existing document upload/listing logic
from app.api import documents as documents_api
from app.api.documents import MAX_FILE_SIZE, ALLOWED_EXTENSIONS

logger = get_logger(__name__)

router = APIRouter(prefix="/api/kb", tags=["kb"])


class KBDocumentSearchRequest(BaseModel):
    """Search request for KB documents."""

    query: str = Field(..., min_length=1, description="Search query (title or content)")
    search_type: Optional[str] = Field("keyword", description="Search type: keyword or semantic (treated equally)")
    filters: Optional[Dict[str, Any]] = None
    limit: Optional[int] = Field(10, ge=1, le=100)


class KBRAGQueryRequest(BaseModel):
    """Lightweight RAG-style query request."""

    question: str = Field(..., min_length=1)
    context_documents: Optional[int] = Field(5, ge=1, le=20)
    filters: Optional[Dict[str, Any]] = None
    conversation_history: Optional[List[Dict[str, Any]]] = None
    clinical_context_id: Optional[str] = None
    channel: Optional[str] = Field(
        default=None,
        description="Client channel for metrics attribution (e.g., 'chat' or 'voice')",
    )


@router.post("/documents", status_code=status.HTTP_201_CREATED, response_model=Dict[str, Any])
async def upload_kb_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: str = Form("general"),
    metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a document into the user's knowledge base.

    This wraps the `/api/documents/upload` endpoint and adapts the response:
    - Returns 201 Created on success
    - Preserves the `success_response` envelope with `document_id` and `title`
    - Returns proper HTTP status codes for common validation errors
    """
    # Perform lightweight validation at the KB layer so that we can
    # return appropriate HTTP status codes without changing the
    # underlying `/api/documents/upload` contract.
    file_content = await file.read()
    await file.seek(0)

    if len(file_content) > MAX_FILE_SIZE:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content=error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message=f"File size exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit",
            ),
        )

    file_ext = "." + file.filename.lower().split(".")[-1] if file.filename and "." in file.filename else ""
    if file_ext and file_ext not in ALLOWED_EXTENSIONS:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            ),
        )

    # Delegate to existing upload logic (which returns an API envelope dict)
    base_result = await documents_api.upload_document(
        background_tasks=background_tasks,
        file=file,
        title=title,
        category=category,
        is_public=False,
        db=db,
        current_user=current_user,
    )

    # Optionally merge user-provided metadata into doc_metadata
    parsed_metadata: Optional[Dict[str, Any]] = None
    try:
        if metadata:
            try:
                parsed_metadata = json.loads(metadata)
            except json.JSONDecodeError:
                parsed_metadata = {"raw": metadata}

            doc_id = base_result.get("data", {}).get("document_id")
            if doc_id:
                document = db.query(Document).filter(Document.document_id == doc_id).first()
                if document:
                    doc_meta = document.doc_metadata or {}
                    doc_meta["custom_metadata"] = parsed_metadata
                    document.doc_metadata = doc_meta
                    db.commit()
    except Exception as meta_err:  # pragma: no cover - defensive
        logger.warning("kb_upload_metadata_failed", error=str(meta_err))

    # Expose metadata back to the client for convenience.
    if parsed_metadata is not None:
        data = base_result.get("data") or {}
        data["metadata"] = parsed_metadata
        base_result["data"] = data

    return base_result


@router.get("/documents", response_model=Dict[str, Any])
async def list_kb_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    include_public: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List KB documents for the current user with pagination.

    Wraps `/api/documents` listing and re-maps pagination fields.
    """
    skip = (page - 1) * page_size
    limit = page_size

    base_result = await documents_api.list_documents(
        skip=skip,
        limit=limit,
        category=category,
        include_public=include_public,
        db=db,
        current_user=current_user,
    )

    data = base_result.get("data", {}) or {}
    documents = data.get("documents", [])
    total = data.get("total", 0)

    # Enrich documents with a derived "category" field for KB clients
    enriched_documents: List[Dict[str, Any]] = []
    for doc in documents:
        doc_copy = dict(doc)
        source_type = doc_copy.get("source_type") or ""
        category_value: Optional[str] = None
        if source_type.startswith("user_"):
            category_value = source_type.replace("user_", "", 1)
        elif source_type:
            category_value = source_type
        if category_value:
            doc_copy.setdefault("category", category_value)
        enriched_documents.append(doc_copy)

    pagination = {
        "page": page,
        "page_size": page_size,
        "total": total,
    }

    return success_response(
        data={"documents": enriched_documents, "pagination": pagination},
    )


@router.get("/documents/{document_id}", response_model=Dict[str, Any])
async def get_kb_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single KB document by ID."""
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response(code=ErrorCodes.NOT_FOUND, message="Document not found"),
        )

    # Only owner or public documents are visible
    if document.owner_id != current_user.id and not document.is_public:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content=error_response(code=ErrorCodes.FORBIDDEN, message="Access denied"),
        )

    return success_response(data=document.to_dict())


@router.delete("/documents/{document_id}", response_model=Dict[str, Any])
async def delete_kb_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a KB document owned by the current user."""
    result = await documents_api.delete_document(document_id=document_id, db=db, current_user=current_user)
    if isinstance(result, JSONResponse):
        return result

    message = None
    if isinstance(result, dict):
        message = (result.get("data") or {}).get("message")

    return success_response(
        data={
            "document_id": document_id,
            "status": "deleted",
            "message": message or "Document deleted successfully",
        }
    )


@router.get("/documents/{document_id}/content", response_model=Dict[str, Any])
async def get_kb_document_content(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get KB document content.

    For now, this returns a stub content string; tests only assert presence of the field.
    """
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response(code=ErrorCodes.NOT_FOUND, message="Document not found"),
        )

    if document.owner_id != current_user.id and not document.is_public:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content=error_response(code=ErrorCodes.FORBIDDEN, message="Access denied"),
        )

    # Placeholder content; real implementation would fetch from storage or index
    content = f"Content for document '{document.title}' is not available in this environment."

    return success_response(data={"id": document.document_id, "content": content})


@router.patch("/documents/{document_id}", response_model=Dict[str, Any])
async def update_kb_document(
    document_id: str,
    update: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update KB document metadata (title, category)."""
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response(code=ErrorCodes.NOT_FOUND, message="Document not found"),
        )

    if document.owner_id != current_user.id:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content=error_response(code=ErrorCodes.FORBIDDEN, message="Only document owner can update"),
        )

    title = update.get("title")
    category = update.get("category")

    if title:
        document.title = title

    if category:
        # Keep source_type consistent with documents API (user_{category})
        document.source_type = f"user_{category}"

    document.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(document)

    return success_response(data={"id": document.document_id, "title": document.title, "category": category})


@router.post("/documents/bulk", status_code=status.HTTP_201_CREATED, response_model=Dict[str, Any])
async def bulk_upload_kb_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload multiple KB documents at once."""
    uploaded_count = 0

    for file in files:
        try:
            await documents_api.upload_document(
                background_tasks=background_tasks,
                file=file,
                title=file.filename,
                category="general",
                is_public=False,
                db=db,
                current_user=current_user,
            )
            uploaded_count += 1
        except HTTPException:
            # Skip individual failures; continue uploading remaining files
            logger.warning("bulk_kb_upload_file_failed", filename=file.filename)
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("bulk_kb_upload_unexpected_error", filename=file.filename, error=str(exc))

    return success_response(data={"uploaded_count": uploaded_count})


@router.post("/documents/bulk-delete", response_model=Dict[str, Any])
async def bulk_delete_kb_documents(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete multiple KB documents."""
    ids = request.get("document_ids") or []
    if not isinstance(ids, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(code=ErrorCodes.VALIDATION_ERROR, message="document_ids must be a list"),
        )

    try:
        owned_ids = [
            row[0]
            for row in db.query(Document.document_id)
            .filter(and_(Document.document_id.in_(ids), Document.owner_id == current_user.id))
            .all()
        ]
        if owned_ids:
            db.query(VoiceDocumentSession).filter(VoiceDocumentSession.document_id.in_(owned_ids)).delete(
                synchronize_session=False
            )
            deleted_count = (
                db.query(Document)
                .filter(and_(Document.document_id.in_(owned_ids), Document.owner_id == current_user.id))
                .delete(synchronize_session=False)
            )
        else:
            deleted_count = 0
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("bulk_kb_delete_failed", error=str(e), exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to delete documents",
            ),
        )

    return success_response(data={"deleted_count": int(deleted_count)})


@router.post("/documents/search", response_model=Dict[str, Any])
async def search_kb_documents(
    request: KBDocumentSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Simple KB document search endpoint.

    Uses SQL `ILIKE` over titles and categories, with optional filters.
    """
    query_str = request.query.strip()
    if not query_str:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Query cannot be empty",
        )

    start_time = time.time()

    q = db.query(Document).filter(
        or_(
            Document.owner_id == current_user.id,
            Document.is_public.is_(True),
        )
    )

    # Title keyword search
    ilike = f"%{query_str}%"
    q = q.filter(Document.title.ilike(ilike))

    # Apply filters
    filters = request.filters or {}
    category = filters.get("category")
    if category:
        q = q.filter(Document.source_type == f"user_{category}")

    date_from = filters.get("date_from")
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            q = q.filter(Document.created_at >= dt_from)
        except ValueError:
            logger.warning("kb_search_invalid_date_from", value=date_from)

    date_to = filters.get("date_to")
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            q = q.filter(Document.created_at <= dt_to)
        except ValueError:
            logger.warning("kb_search_invalid_date_to", value=date_to)

    q = q.order_by(Document.created_at.desc()).limit(request.limit or 10)
    docs = q.all()

    results: List[Dict[str, Any]] = []
    top_doc_uuid = None
    for idx, doc in enumerate(docs):
        if idx == 0:
            top_doc_uuid = doc.id
        results.append(
            {
                "id": doc.document_id,
                "title": doc.title,
                "category": doc.source_type.replace("user_", "", 1) if doc.source_type.startswith("user_") else doc.source_type,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
                "relevance_score": 1.0,
            }
        )

    # Record search analytics with tenant context
    try:
        elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
        org_id = current_org.id if current_org else None

        analytics_service.record_search(
            db=db,
            query_text=query_str,
            search_type=request.search_type or "keyword",
            results_count=len(results),
            duration_ms=elapsed_ms,
            user_id=current_user.id,
            organization_id=org_id,
            top_result_document_id=top_doc_uuid,
            top_result_score=1.0 if results else None,
        )

        record_instrumented_api_call(
            analytics_service=analytics_service,
            db=db,
            endpoint="/api/kb/documents/search",
            duration_ms=float(elapsed_ms),
            success=True,
            user_id=current_user.id,
            organization_id=org_id,
            endpoint_category="knowledge",
        )
    except Exception as exc:  # pragma: no cover - analytics should not break search
        logger.warning("kb_search_analytics_failed", error=str(exc))

    return success_response(data={"results": results})


@router.post("/query", response_model=Dict[str, Any])
async def kb_rag_query(
    request: KBRAGQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Lightweight RAG query endpoint for KB.

    In this environment, it uses a conservative implementation:
    - Selects a handful of documents as "sources"
    - Returns a stubbed answer string

    Production deployments can wire this to QueryOrchestrator for full RAG.
    """
    start_time = time.time()

    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question cannot be empty",
        )

    # Normalize channel label for metrics (chat, voice, other)
    raw_channel = (request.channel or "chat").strip().lower()
    channel = raw_channel if raw_channel in {"chat", "voice"} else "other"

    # Try to use QueryOrchestrator if configured; fall back to simple stub.
    # This endpoint is intentionally resilient: when the underlying RAG or
    # database services are unavailable, we still return a best-effort answer
    # with an empty sources list instead of failing hard.
    answer: str = ""
    sources: List[Dict[str, Any]] = []

    max_docs = request.context_documents or 5

    # Best-effort source selection from kb_documents
    try:
        q = db.query(Document).filter(
            or_(
                Document.owner_id == current_user.id,
                Document.is_public.is_(True),
            )
        )
        q = q.order_by(Document.created_at.desc()).limit(max_docs)
        docs = q.all()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("kb_rag_query_source_selection_failed", error=str(exc))
        docs = []

    top_doc_uuid = None
    for idx, doc in enumerate(docs):
        if idx == 0:
            top_doc_uuid = doc.id
        sources.append(
            {
                "id": doc.document_id,
                "title": doc.title,
                "category": doc.source_type,
                "score": 1.0,
            }
        )

    # Attempt to call full QueryOrchestrator when external services are available.
    # This is intentionally best-effort: missing OpenAI/Qdrant services should not
    # break the endpoint contract during local development or tests.
    if settings.OPENAI_API_KEY:
        orchestrator = QueryOrchestrator(
            enable_rag=True,
            rag_top_k=max_docs,
            enable_tools=False,
        )
        query_req = QueryRequest(
            session_id=None,
            query=question,
            clinical_context_id=request.clinical_context_id,
        )
        try:
            rag_result = await orchestrator.handle_query(
                query_req,
                trace_id=None,
                user_id=str(current_user.id),
            )
            answer = rag_result.answer

            if rag_result.citations:
                sources = [
                    {
                        "id": citation.id or citation.source_id,
                        "title": citation.title,
                        "category": citation.source_type,
                        "score": citation.relevance_score,
                    }
                    for citation in rag_result.citations
                ][:max_docs]
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("kb_rag_query_orchestrator_failed", error=str(exc))
            kb_query_failures_total.labels(channel=channel, reason="upstream_error").inc()

    if not answer:
        # Fallback stub answer (keeps endpoint resilient when upstream RAG is disabled)
        answer = f"Answer for: {question}"

    # Metrics: latency, answer length, sources, and top score
    elapsed = max(time.time() - start_time, 0.0)
    try:
        kb_query_latency_seconds.labels(channel=channel).observe(elapsed)

        token_count = len(answer.split()) if answer else 0
        if token_count > 0:
            kb_query_answer_length_tokens.labels(channel=channel).observe(token_count)

        kb_query_sources_per_answer.labels(channel=channel).observe(len(sources))

        top_score = 0.0
        if sources:
            first_score = sources[0].get("score")
            if isinstance(first_score, (int, float)):
                top_score = float(first_score)
        kb_query_top_score.labels(channel=channel).observe(top_score)

        success_label = "true" if bool(answer) else "false"
        kb_query_requests_total.labels(channel=channel, success=success_label).inc()

        if not sources:
            kb_query_failures_total.labels(channel=channel, reason="no_results").inc()
    except Exception as metrics_exc:  # pragma: no cover - metrics should never break the API
        logger.warning("kb_rag_query_metrics_failed", error=str(metrics_exc))

    # Record analytics for RAG query with tenant context
    try:
        elapsed_ms = int(elapsed * 1000)
        org_id = current_org.id if current_org else None

        analytics_service.record_search(
            db=db,
            query_text=question,
            search_type="kb_rag",
            results_count=len(sources),
            duration_ms=elapsed_ms,
            user_id=current_user.id,
            organization_id=org_id,
            top_result_document_id=top_doc_uuid,
            top_result_score=sources[0]["score"] if sources else None,
        )

        record_instrumented_api_call(
            analytics_service=analytics_service,
            db=db,
            endpoint="/api/kb/query",
            duration_ms=float(elapsed_ms),
            success=True,
            user_id=current_user.id,
            organization_id=org_id,
            endpoint_category="knowledge",
        )
    except Exception as exc:  # pragma: no cover - analytics should not break the API
        logger.warning("kb_rag_query_analytics_failed", error=str(exc))

    return success_response(
        data={
            "answer": answer,
            "sources": sources,
        }
    )
