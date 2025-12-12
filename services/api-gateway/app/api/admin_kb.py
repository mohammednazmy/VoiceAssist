"""
Admin Knowledge Base Management API (Phase 5)

Provides endpoints for administrators to manage the medical knowledge base:
- Upload documents (text/PDF)
- List indexed documents
- Delete documents
- View indexing status

These endpoints require admin authentication.
"""

import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.business_metrics import (
    enhanced_kb_processing_cost_dollars,
    enhanced_kb_processing_pages,
    enhanced_kb_processing_total,
    kb_chunks_total,
    kb_document_uploads_total,
    kb_documents_total,
    kb_indexing_duration,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.logging import get_logger
from app.models.document import Document
from app.models.user import User
from app.services.admin_audit_log_service import admin_audit_log_service
from app.services.kb_indexer import IndexingResult, KBIndexer
from app.services.phi_detector import PHIDetector
from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/kb", tags=["admin", "kb"])
logger = get_logger(__name__)


# Request/Response Models


class DocumentUploadResponse(BaseModel):
    """Response after document upload."""

    document_id: str
    title: str
    status: str
    chunks_indexed: int
    message: str


class DocumentListItem(BaseModel):
    """Document metadata for list response."""

    document_id: str
    title: str
    source_type: str
    upload_date: str
    chunks_indexed: int
    # Structure fields
    total_pages: Optional[int] = None
    has_toc: bool = False
    has_figures: bool = False
    has_enhanced_structure: bool = False
    phi_risk: Optional[str] = None
    # Ownership fields
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    is_public: bool = True
    indexing_status: str = "indexed"
    processing_stage: Optional[str] = None
    processing_progress: Optional[int] = None


class DocumentListResponse(BaseModel):
    """Response for document list endpoint."""

    documents: List[DocumentListItem]
    total: int


# Global KB Indexer instance
# In production, this would be injected via dependency injection
kb_indexer = KBIndexer(qdrant_url=settings.QDRANT_URL)
phi_detector = PHIDetector()


@router.post("/documents", response_model=dict)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    source_type: str = "uploaded",
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    request: Request = None,
):
    """
    Upload and index a document to the knowledge base.

    Supports:
    - Text files (.txt)
    - PDF files (.pdf)

    The document will be:
    1. Extracted (text/PDF)
    2. Chunked into segments
    3. Embedded using OpenAI
    4. Stored in Qdrant vector database

    Args:
        file: Document file to upload
        title: Document title (defaults to filename)
        source_type: Type of source (uploaded, guideline, journal, etc.)
        db: Database session

    Returns:
        Upload result with document ID and indexing status
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Validate file type
        allowed_extensions = [".txt", ".pdf"]
        file_extension = None
        for ext in allowed_extensions:
            if file.filename.lower().endswith(ext):
                file_extension = ext
                break

        if not file_extension:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}",
                ),
            )

        # Read file content
        file_content = await file.read()

        # Generate document ID
        document_id = str(uuid.uuid4())

        # Optionally persist original PDF for enhanced processing and auditing
        pdf_file_url: Optional[str] = None
        if file_extension == ".pdf":
            try:
                upload_root = Path(os.getenv("UPLOAD_DIR", "./uploads"))
                kb_dir = upload_root / "kb_documents"
                kb_dir.mkdir(parents=True, exist_ok=True)

                safe_name = f"{document_id}{file_extension}"
                pdf_path = kb_dir / safe_name

                with open(pdf_path, "wb") as f:
                    f.write(file_content)

                # Use the same URL pattern as the generic storage service
                pdf_file_url = f"/uploads/kb_documents/{safe_name}"
            except Exception as e:
                logger.error(
                    f"Failed to persist original PDF for document {document_id}: {e}",
                    exc_info=True,
                )
                pdf_file_url = None

        # Use filename as title if not provided
        doc_title = title or file.filename

        # Track indexing duration (P3.3 - Business Metrics)
        start_time = time.time()

        # Index the document
        doc_structure = None
        if file_extension == ".pdf":
            # Use structure-aware indexing for PDFs
            result, doc_structure = await kb_indexer.index_pdf_document_with_structure(
                pdf_bytes=file_content,
                document_id=document_id,
                title=doc_title,
                source_type=source_type,
                metadata={
                    "filename": file.filename,
                    "upload_date": datetime.now(timezone.utc).isoformat(),
                    "file_url": pdf_file_url,
                },
            )
        else:  # .txt
            text_content = file_content.decode("utf-8")
            result: IndexingResult = await kb_indexer.index_document(
                content=text_content,
                document_id=document_id,
                title=doc_title,
                source_type=source_type,
                metadata={
                    "filename": file.filename,
                    "upload_date": datetime.now(timezone.utc).isoformat(),
                },
            )

        # Record indexing duration
        duration = time.time() - start_time
        kb_indexing_duration.observe(duration)

        # Format response
        if result.success:
            # Store document metadata in PostgreSQL
            try:
                db_document = Document(
                    document_id=document_id,
                    title=doc_title,
                    source_type=source_type,
                    filename=file.filename,
                    file_type=file_extension.lstrip("."),
                    chunks_indexed=result.chunks_indexed,
                    indexing_status="indexed",
                    # Structure fields from PDF extraction
                    total_pages=doc_structure.total_pages if doc_structure else None,
                    has_toc=len(doc_structure.toc) > 0 if doc_structure else False,
                    has_figures=len(doc_structure.figures) > 0 if doc_structure else False,
                    structure=doc_structure.to_dict() if doc_structure else None,
                    doc_metadata={
                        "upload_date": datetime.now(timezone.utc).isoformat(),
                        "file_size": len(file_content),
                        "file_url": pdf_file_url,
                    },
                )
                db.add(db_document)
                db.commit()
                db.refresh(db_document)

                logger.info(f"Stored document metadata in database: {document_id}")
            except Exception as e:
                logger.error(f"Failed to store document metadata: {e}", exc_info=True)
                db.rollback()
                # Continue even if metadata storage fails (document is still indexed in vector DB)

            # Track upload metrics (P3.3 - Business Metrics)
            file_type = file_extension.lstrip(".")
            kb_document_uploads_total.labels(source_type=source_type, file_type=file_type).inc()
            kb_chunks_total.inc(result.chunks_indexed)
            kb_documents_total.inc()

            response_data = DocumentUploadResponse(
                document_id=result.document_id,
                title=doc_title,
                status="indexed",
                chunks_indexed=result.chunks_indexed,
                message=f"Successfully indexed document with {result.chunks_indexed} chunks",
            )

            logger.info(f"Successfully uploaded and indexed document: {document_id}")
            admin_audit_log_service.log_action(
                db=db,
                actor=current_admin_user,
                action="kb.upload",
                target_type="document",
                target_id=document_id,
                metadata={"title": doc_title, "source_type": source_type},
                request=request,
            )

            return success_response(data=response_data.model_dump(), version="2.0.0")
        else:
            logger.error(f"Failed to index document: {result.error_message}")

            admin_audit_log_service.log_action(
                db=db,
                actor=current_admin_user,
                action="kb.upload",
                target_type="document",
                target_id=document_id,
                success=False,
                metadata={"error": result.error_message},
                request=request,
            )

            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=error_response(
                    code=ErrorCodes.INTERNAL_ERROR,
                    message=f"Document indexing failed: {result.error_message}",
                ),
            )

    except Exception as e:
        logger.error(f"Error uploading document: {e}", exc_info=True)

        admin_audit_log_service.log_action(
            db=db,
            actor=current_admin_user,
            action="kb.upload",
            target_type="document",
            success=False,
            metadata={"error": str(e)},
            request=request,
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to upload document: {str(e)}",
            ),
        )


@router.get("/documents", response_model=dict)
async def list_documents(
    skip: int = 0,
    limit: int = 50,
    source_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    List all documents in the knowledge base.

    Returns document metadata including:
    - Document ID
    - Title
    - Source type
    - Upload date
    - Number of chunks indexed

    Args:
        skip: Number of documents to skip (pagination)
        limit: Maximum number of documents to return (max 1000)
        source_type: Filter by source type (optional)
        db: Database session

    Returns:
        List of documents with metadata
    """
    try:
        # Enforce maximum limit to prevent excessive queries
        limit = min(limit, 1000)

        # Query database for document metadata
        query = db.query(Document).order_by(Document.created_at.desc())

        # Filter by source_type if provided
        if source_type:
            query = query.filter(Document.source_type == source_type)

        # Get total count (for pagination)
        total = query.count()

        # Apply pagination
        documents = query.offset(skip).limit(limit).all()

        # Convert to response format
        document_list = [
            DocumentListItem(
                document_id=doc.document_id,
                title=doc.title,
                source_type=doc.source_type,
                upload_date=doc.created_at.isoformat(),
                chunks_indexed=doc.chunks_indexed,
                # Structure fields
                total_pages=doc.total_pages,
                has_toc=doc.has_toc if doc.has_toc is not None else False,
                has_figures=doc.has_figures if doc.has_figures is not None else False,
                has_enhanced_structure=doc.enhanced_structure is not None,
                # Ownership fields
                owner_id=str(doc.owner_id) if doc.owner_id else None,
                owner_name=None,  # Would need to join with users table
                is_public=doc.is_public if doc.is_public is not None else True,
                indexing_status=doc.indexing_status or "indexed",
                phi_risk=(doc.doc_metadata or {}).get("phi_risk") if doc.doc_metadata else None,
                processing_stage=doc.processing_stage,
                processing_progress=doc.processing_progress,
            )
            for doc in documents
        ]

        response_data = DocumentListResponse(documents=document_list, total=total)

        logger.info(
            f"Listed {len(document_list)} documents: "
            f"skip={skip}, limit={limit}, source_type={source_type}, total={total}"
        )

        return success_response(data=response_data.model_dump(), version="2.0.0")

    except Exception as e:
        logger.error(f"Error listing documents: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to list documents: {str(e)}",
            ),
        )


@router.delete("/documents/{document_id}", response_model=dict)
async def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    request: Request = None,
):
    """
    Delete a document from the knowledge base.

    Removes all document chunks from the vector database and cleans up
    any related voice document sessions.

    Args:
        document_id: Document identifier
        db: Database session

    Returns:
        Deletion status
    """
    from app.models.voice_document_session import VoiceDocumentSession

    ensure_admin_privileges(current_admin_user)
    try:
        # Delete from PostgreSQL metadata store
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Delete from vector database first
        vector_success = kb_indexer.delete_document(document_id)

        # Delete related voice document sessions (FK constraint)
        deleted_sessions = (
            db.query(VoiceDocumentSession)
            .filter(VoiceDocumentSession.document_id == document_id)
            .delete(synchronize_session=False)
        )
        if deleted_sessions > 0:
            logger.info(f"Deleted {deleted_sessions} voice sessions for document: {document_id}")

        # Delete from PostgreSQL (even if vector delete fails, cleanup metadata)
        db.delete(document)
        db.commit()

        logger.info(
            f"Successfully deleted document: {document_id} "
            f"(vector_db={'success' if vector_success else 'failed'}, metadata=success)"
        )

        admin_audit_log_service.log_action(
            db=db,
            actor=current_admin_user,
            action="kb.delete",
            target_type="document",
            target_id=document_id,
            metadata={"vector_deleted": vector_success, "sessions_deleted": deleted_sessions},
            request=request,
        )

        return success_response(
            data={
                "document_id": document_id,
                "status": "deleted",
                "message": "Document successfully removed from knowledge base",
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {e}", exc_info=True)

        # Rollback session to clear any pending transaction errors before logging
        db.rollback()

        try:
            admin_audit_log_service.log_action(
                db=db,
                actor=current_admin_user,
                action="kb.delete",
                target_type="document",
                target_id=document_id,
                success=False,
                metadata={"error": str(e)},
                request=request,
            )
        except Exception as audit_err:
            logger.error(f"Failed to log audit for delete failure: {audit_err}")

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to delete document: {str(e)}",
            ),
        )


@router.get("/documents/{document_id}", response_model=dict)
async def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get detailed information about a specific document.

    Returns document metadata and chunk information.

    Args:
        document_id: Document identifier
        db: Database session

    Returns:
        Document details
    """
    try:
        # Query database for document metadata
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Convert to response format
        document_data = {
            "document_id": document.document_id,
            "title": document.title,
            "source_type": document.source_type,
            "filename": document.filename,
            "file_type": document.file_type,
            "chunks_indexed": document.chunks_indexed,
            "total_tokens": document.total_tokens,
            "indexing_status": document.indexing_status,
            "indexing_error": document.indexing_error,
            "metadata": document.doc_metadata,
            "created_at": document.created_at.isoformat(),
            "updated_at": document.updated_at.isoformat(),
        }

        logger.info(f"Retrieved document details: {document_id}")

        return success_response(data=document_data, version="2.0.0")

    except Exception as e:
        logger.error(f"Error retrieving document {document_id}: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to retrieve document: {str(e)}",
            ),
        )


@router.get("/documents/{document_id}/structure", response_model=dict)
async def get_document_structure(
    document_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get the structure of a document including TOC, sections, and figures.

    Returns:
    - Table of contents entries
    - Sections with page ranges
    - Figures list with page numbers
    - Page count and metadata

    Args:
        document_id: Document identifier
        db: Database session

    Returns:
        Document structure data
    """
    try:
        # Query database for document
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Return structure data
        structure_data = {
            "document_id": document.document_id,
            "title": document.title,
            "total_pages": document.total_pages,
            "has_toc": document.has_toc or False,
            "has_figures": document.has_figures or False,
            "structure": document.structure,  # Full structure JSONB
        }

        logger.info(f"Retrieved document structure: {document_id}")

        return success_response(data=structure_data, version="2.0.0")

    except Exception as e:
        logger.error(f"Error retrieving document structure {document_id}: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to retrieve document structure: {str(e)}",
            ),
        )


@router.get("/documents/{document_id}/pages/{page_number}", response_model=dict)
async def get_document_page(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get the content of a specific page from a document.

    Args:
        document_id: Document identifier
        page_number: Page number (1-indexed)
        db: Database session

    Returns:
        Page content and metadata
    """
    try:
        # Query database for document
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Validate page number
        if document.total_pages and (page_number < 1 or page_number > document.total_pages):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message=f"Page {page_number} is out of range (1-{document.total_pages})",
                ),
            )

        # Get page content from structure
        page_content = None
        if document.structure and "pages" in document.structure:
            pages = document.structure.get("pages", [])
            for page in pages:
                if page.get("page_number") == page_number:
                    page_content = page
                    break

        if not page_content:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Page {page_number} not found in document structure",
                ),
            )

        page_data = {
            "document_id": document.document_id,
            "page_number": page_number,
            "total_pages": document.total_pages,
            "content": page_content,
        }

        logger.info(f"Retrieved page {page_number} of document: {document_id}")

        return success_response(data=page_data, version="2.0.0")

    except Exception as e:
        logger.error(f"Error retrieving page {page_number} of document {document_id}: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to retrieve page: {str(e)}",
            ),
        )


@router.get("/analytics", response_model=dict)
async def get_document_analytics(
    days: int = 7,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get analytics for document knowledge base and voice navigation.

    Returns statistics including:
    - Total documents and breakdown by type
    - Documents with structure (pages, TOC, figures)
    - Voice navigation session statistics
    - User uploaded vs system documents

    Args:
        days: Number of days to look back for time-based stats (default: 7)
    """
    from datetime import timedelta

    from sqlalchemy import func

    from app.models.voice_document_session import VoiceDocumentSession

    try:
        # Time range
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Total documents
        total_docs = db.query(func.count(Document.id)).scalar() or 0

        # Documents by source type
        source_breakdown = (
            db.query(Document.source_type, func.count(Document.id))
            .group_by(Document.source_type)
            .all()
        )
        docs_by_source = {source: count for source, count in source_breakdown}

        # Documents with structure
        docs_with_toc = (
            db.query(func.count(Document.id))
            .filter(Document.has_toc == True)  # noqa: E712
            .scalar()
            or 0
        )
        docs_with_figures = (
            db.query(func.count(Document.id))
            .filter(Document.has_figures == True)  # noqa: E712
            .scalar()
            or 0
        )
        docs_with_pages = (
            db.query(func.count(Document.id))
            .filter(Document.total_pages.isnot(None), Document.total_pages > 0)
            .scalar()
            or 0
        )

        # Total pages across all documents
        total_pages = (
            db.query(func.sum(Document.total_pages))
            .filter(Document.total_pages.isnot(None))
            .scalar()
            or 0
        )

        # User vs public documents
        user_uploaded = (
            db.query(func.count(Document.id))
            .filter(Document.owner_id.isnot(None))
            .scalar()
            or 0
        )
        public_docs = (
            db.query(func.count(Document.id))
            .filter(Document.is_public == True)  # noqa: E712
            .scalar()
            or 0
        )

        # Indexing status breakdown
        status_breakdown = (
            db.query(Document.indexing_status, func.count(Document.id))
            .group_by(Document.indexing_status)
            .all()
        )
        docs_by_status = {status: count for status, count in status_breakdown}

        # Recent uploads (within time range)
        recent_uploads = (
            db.query(func.count(Document.id))
            .filter(Document.upload_date >= cutoff)
            .scalar()
            or 0
        )

        # Voice session analytics
        total_sessions = (
            db.query(func.count(VoiceDocumentSession.id)).scalar() or 0
        )
        active_sessions = (
            db.query(func.count(VoiceDocumentSession.id))
            .filter(VoiceDocumentSession.is_active == True)  # noqa: E712
            .scalar()
            or 0
        )
        recent_sessions = (
            db.query(func.count(VoiceDocumentSession.id))
            .filter(VoiceDocumentSession.created_at >= cutoff)
            .scalar()
            or 0
        )

        # Most popular documents in voice sessions
        popular_docs_query = (
            db.query(
                VoiceDocumentSession.document_id,
                func.count(VoiceDocumentSession.id).label("session_count"),
            )
            .filter(VoiceDocumentSession.created_at >= cutoff)
            .group_by(VoiceDocumentSession.document_id)
            .order_by(func.count(VoiceDocumentSession.id).desc())
            .limit(10)
            .all()
        )

        popular_docs = []
        for doc_id, count in popular_docs_query:
            doc = db.query(Document).filter(Document.document_id == doc_id).first()
            if doc:
                popular_docs.append(
                    {
                        "document_id": doc_id,
                        "title": doc.title,
                        "session_count": count,
                    }
                )

        # Unique users with voice sessions in period
        unique_voice_users = (
            db.query(func.count(func.distinct(VoiceDocumentSession.user_id)))
            .filter(VoiceDocumentSession.created_at >= cutoff)
            .scalar()
            or 0
        )

        # Average pages per session (estimated from page positions)
        avg_pages_result = (
            db.query(func.avg(VoiceDocumentSession.current_page))
            .filter(VoiceDocumentSession.created_at >= cutoff)
            .scalar()
        )
        avg_pages_navigated = round(float(avg_pages_result), 1) if avg_pages_result else 0

        analytics_data = {
            "period_days": days,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            # Document stats
            "documents": {
                "total": total_docs,
                "by_source": docs_by_source,
                "by_status": docs_by_status,
                "with_toc": docs_with_toc,
                "with_figures": docs_with_figures,
                "with_pages": docs_with_pages,
                "total_pages": total_pages,
                "user_uploaded": user_uploaded,
                "public": public_docs,
                "recent_uploads": recent_uploads,
            },
            # Voice navigation stats
            "voice_navigation": {
                "total_sessions": total_sessions,
                "active_sessions": active_sessions,
                "sessions_in_period": recent_sessions,
                "unique_users_in_period": unique_voice_users,
                "avg_pages_navigated": avg_pages_navigated,
                "popular_documents": popular_docs,
            },
        }

        return success_response(data=analytics_data, version="2.0.0")

    except Exception as e:
        logger.error(f"Error fetching document analytics: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to fetch analytics: {str(e)}",
            ),
        )


class IndexingJobItem(BaseModel):
    """Indexing job status for admin panel."""

    id: str
    document_id: str
    state: str  # 'pending', 'running', 'completed', 'failed'
    attempts: int = 1
    progress: Optional[int] = None  # 0-100
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


@router.get("/jobs", response_model=dict)
async def list_indexing_jobs(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    List indexing jobs for documents.

    Returns jobs derived from document indexing status:
    - Documents with indexing_status='processing' are shown as 'running'
    - Recently indexed documents (last 5 minutes) shown as 'completed'
    - Documents with indexing_status='failed' shown as 'failed'

    Returns:
        List of indexing jobs
    """
    from datetime import timedelta

    try:
        jobs = []
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

        # Get documents currently being processed (running jobs)
        processing_docs = (
            db.query(Document)
            .filter(Document.indexing_status == "processing")
            .order_by(Document.created_at.desc())
            .all()
        )

        for doc in processing_docs:
            # Estimate progress - if we don't have real progress tracking,
            # use a placeholder that shows activity
            progress = None
            if doc.chunks_indexed and doc.chunks_indexed > 0:
                # If some chunks are indexed, show partial progress
                progress = min(90, doc.chunks_indexed * 10)  # Cap at 90% until complete

            jobs.append(
                IndexingJobItem(
                    id=f"job-{doc.document_id}",
                    document_id=doc.document_id,
                    state="running",
                    attempts=1,
                    progress=progress,
                    started_at=doc.created_at.isoformat() if doc.created_at else None,
                )
            )

        # Get recently completed documents (completed jobs)
        recent_indexed = (
            db.query(Document)
            .filter(
                Document.indexing_status == "indexed",
                Document.updated_at >= cutoff,
            )
            .order_by(Document.updated_at.desc())
            .limit(10)
            .all()
        )

        for doc in recent_indexed:
            jobs.append(
                IndexingJobItem(
                    id=f"job-{doc.document_id}",
                    document_id=doc.document_id,
                    state="completed",
                    attempts=1,
                    progress=100,
                    started_at=doc.created_at.isoformat() if doc.created_at else None,
                    completed_at=doc.updated_at.isoformat() if doc.updated_at else None,
                )
            )

        # Get failed documents (failed jobs)
        failed_docs = (
            db.query(Document)
            .filter(Document.indexing_status == "failed")
            .order_by(Document.updated_at.desc())
            .limit(10)
            .all()
        )

        for doc in failed_docs:
            jobs.append(
                IndexingJobItem(
                    id=f"job-{doc.document_id}",
                    document_id=doc.document_id,
                    state="failed",
                    attempts=1,
                    progress=0,
                    error_message=doc.indexing_error,
                    started_at=doc.created_at.isoformat() if doc.created_at else None,
                )
            )

        logger.info(f"Listed {len(jobs)} indexing jobs")

        return success_response(
            data=[job.model_dump() for job in jobs],
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error listing indexing jobs: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to list indexing jobs: {str(e)}",
            ),
        )


# ========== Enhanced Content Endpoints ==========


class PageContentUpdate(BaseModel):
    """Request model for updating page content."""

    content_blocks: List[dict]
    voice_narration: Optional[str] = None


@router.get("/documents/{document_id}/enhanced-content", response_model=dict)
async def get_enhanced_content(
    document_id: str,
    page: Optional[int] = None,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get enhanced structure content for a document.

    If page is specified, returns content for that specific page.
    Otherwise, returns the full enhanced structure.

    Args:
        document_id: Document identifier
        page: Optional page number (1-indexed)
        db: Database session

    Returns:
        Enhanced content with content_blocks and voice_narration
    """
    try:
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Prefer enhanced structure when available; fall back to original structure
        enhanced_structure = document.enhanced_structure or document.structure

        if not enhanced_structure:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message="Document has no enhanced content. Please process with GPT-4 Vision first.",
                ),
            )

        # Derive total pages from document or structure metadata
        total_pages = document.total_pages
        if total_pages is None:
            metadata = enhanced_structure.get("metadata") or {}
            total_pages = metadata.get("total_pages")

        if page is not None:
            # Return specific page
            pages = enhanced_structure.get("pages", [])
            page_content = None
            for p in pages:
                if p.get("page_number") == page:
                    page_content = p
                    break

            if not page_content:
                return JSONResponse(
                    status_code=status.HTTP_404_NOT_FOUND,
                    content=error_response(
                        code=ErrorCodes.NOT_FOUND,
                        message=f"Page {page} not found",
                    ),
                )

            # Normalize page payload for frontend editor
            raw_text = (
                page_content.get("raw_text")
                or page_content.get("text")
                or ""
            )
            word_count = page_content.get("word_count")
            if word_count is None and raw_text:
                word_count = len(raw_text.split())

            # If no structured content blocks exist (older structure-only docs),
            # synthesize a single text block from the page text.
            content_blocks = page_content.get("content_blocks")
            if not content_blocks:
                if raw_text:
                    content_blocks = [
                        {
                            "type": "text",
                            "content": raw_text,
                        }
                    ]
                else:
                    content_blocks = []

            has_figures = page_content.get("has_figures")
            if has_figures is None:
                figures = page_content.get("figures") or []
                has_figures = bool(figures)

            page_payload = {
                "page_number": page_content.get("page_number", page),
                "content_blocks": content_blocks,
                "voice_narration": page_content.get("voice_narration", ""),
                "raw_text": raw_text,
                "word_count": word_count or 0,
                "has_figures": has_figures,
            }

            response_data = {
                "document_id": document_id,
                "title": document.title,
                "page_number": page,
                "total_pages": total_pages,
                # Normalized page payload for the editor
                "page": page_payload,
                # Preserve raw page content for callers that need it
                "content": page_content,
                "enhanced_structure": enhanced_structure,
                "processing_stage": document.processing_stage,
                "processing_progress": document.processing_progress,
                "page_images_path": document.page_images_path,
            }
        else:
            # Return full structure
            response_data = {
                "document_id": document_id,
                "title": document.title,
                "total_pages": total_pages,
                "enhanced_structure": enhanced_structure,
                "processing_stage": document.processing_stage,
                "processing_progress": document.processing_progress,
                "page_images_path": document.page_images_path,
            }

        return success_response(data=response_data, version="2.0.0")

    except Exception as e:
        logger.error(f"Error getting enhanced content for {document_id}: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to get enhanced content: {str(e)}",
            ),
        )


@router.get("/documents/{document_id}/page-image/{page_number}")
async def get_page_image(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get rendered page image for a document.

    Returns the JPEG image file for the specified page.

    Args:
        document_id: Document identifier
        page_number: Page number (1-indexed)
        db: Database session

    Returns:
        JPEG image file
    """
    from fastapi.responses import FileResponse

    try:
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Get the image path
        from app.services.enhanced_pdf_processor import get_enhanced_pdf_processor

        processor = get_enhanced_pdf_processor()
        image_path = processor.get_page_image_path(document_id, page_number)

        if not image_path or not image_path.exists():
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Page image not found for page {page_number}. Process document with enhanced extraction first.",
                ),
            )

        return FileResponse(
            path=str(image_path),
            media_type="image/jpeg",
            filename=f"{document_id}_page_{page_number}.jpg",
        )

    except Exception as e:
        logger.error(f"Error getting page image for {document_id} page {page_number}: {e}", exc_info=True)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to get page image: {str(e)}",
            ),
        )


@router.put("/documents/{document_id}/page/{page_number}/content", response_model=dict)
async def update_page_content(
    document_id: str,
    page_number: int,
    content: PageContentUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    request: Request = None,
):
    """
    Update the content of a specific page.

    Allows admins to manually correct extracted content that
    wasn't parsed correctly by the AI.

    Args:
        document_id: Document identifier
        page_number: Page number (1-indexed)
        content: Updated content blocks and narration
        db: Database session

    Returns:
        Updated page content
    """
    ensure_admin_privileges(current_admin_user)
    try:
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Get enhanced structure
        enhanced_structure = document.enhanced_structure
        if not enhanced_structure:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message="Document has no enhanced structure to update",
                ),
            )

        # Find and update the page
        pages = enhanced_structure.get("pages", [])
        page_found = False

        for i, page in enumerate(pages):
            if page.get("page_number") == page_number:
                # Update content blocks
                pages[i]["content_blocks"] = content.content_blocks

                # Update voice narration if provided
                if content.voice_narration is not None:
                    pages[i]["voice_narration"] = content.voice_narration

                # Mark as manually edited
                pages[i]["manually_edited"] = True
                pages[i]["edited_at"] = datetime.now(timezone.utc).isoformat()
                pages[i]["edited_by"] = str(current_admin_user.id)

                page_found = True
                break

        if not page_found:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Page {page_number} not found",
                ),
            )

        # Save updated structure
        enhanced_structure["pages"] = pages
        document.enhanced_structure = enhanced_structure
        document.updated_at = datetime.now(timezone.utc)
        db.commit()

        # Audit log
        admin_audit_log_service.log_action(
            db=db,
            actor=current_admin_user,
            action="kb.edit_page",
            target_type="document_page",
            target_id=f"{document_id}:{page_number}",
            metadata={"page_number": page_number},
            request=request,
        )

        logger.info(f"Updated page {page_number} content for document {document_id}")

        return success_response(
            data={
                "document_id": document_id,
                "page_number": page_number,
                "status": "updated",
                "message": "Page content updated successfully",
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error updating page content for {document_id}: {e}", exc_info=True)
        db.rollback()

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to update page content: {str(e)}",
            ),
        )


@router.post("/documents/{document_id}/page/{page_number}/regenerate", response_model=dict)
async def regenerate_page_analysis(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    request: Request = None,
):
    """
    Regenerate GPT-4 Vision analysis for a specific page.

    This re-runs the AI analysis on the page image and updates
    the content blocks and voice narration.

    Args:
        document_id: Document identifier
        page_number: Page number (1-indexed)
        db: Database session

    Returns:
        Regenerated page content
    """
    ensure_admin_privileges(current_admin_user)
    try:
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Get the original PDF to re-analyze
        # First check if we have enhanced structure
        if not document.enhanced_structure:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message="Document must be processed with enhanced extraction first",
                ),
            )

        # Get page image
        from app.services.enhanced_pdf_processor import get_enhanced_pdf_processor
        from app.services.page_analysis_service import get_page_analysis_service

        processor = get_enhanced_pdf_processor()
        image_path = processor.get_page_image_path(document_id, page_number)

        if not image_path or not image_path.exists():
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message=f"Page image not found for page {page_number}",
                ),
            )

        # Read image and analyze
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        analyzer = get_page_analysis_service()
        analysis_result = await analyzer.analyze_page(image_bytes, page_number)

        # Update enhanced structure
        enhanced_structure = document.enhanced_structure
        pages = enhanced_structure.get("pages", [])

        updated_page = None
        page_found = False
        for i, page in enumerate(pages):
            if page.get("page_number") == page_number:
                pages[i]["content_blocks"] = analysis_result.content_blocks
                pages[i]["voice_narration"] = analysis_result.voice_narration
                pages[i]["detected_errors"] = analysis_result.detected_errors
                pages[i]["regenerated_at"] = datetime.now(timezone.utc).isoformat()
                pages[i]["regenerated_by"] = str(current_admin_user.id)
                pages[i].pop("manually_edited", None)  # Clear manual edit flag
                updated_page = pages[i]
                page_found = True
                break

        if not page_found:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Page {page_number} not found in structure",
                ),
            )

        # Save updated structure
        enhanced_structure["pages"] = pages
        document.enhanced_structure = enhanced_structure
        document.updated_at = datetime.now(timezone.utc)
        db.commit()

        # Audit log
        admin_audit_log_service.log_action(
            db=db,
            actor=current_admin_user,
            action="kb.regenerate_page",
            target_type="document_page",
            target_id=f"{document_id}:{page_number}",
            metadata={
                "page_number": page_number,
                "analysis_cost": analysis_result.analysis_cost,
            },
            request=request,
        )

        logger.info(f"Regenerated page {page_number} analysis for document {document_id}")

        # Normalize page payload for frontend
        raw_text = (
            updated_page.get("raw_text")
            if updated_page is not None
            else ""
        )
        word_count = (
            updated_page.get("word_count")
            if updated_page is not None
            else None
        )
        if word_count is None and raw_text:
            word_count = len(raw_text.split())

        has_figures = False
        if updated_page is not None:
            has_figures = bool(
                updated_page.get("has_figures")
                or updated_page.get("figures")
            )

        page_payload = {
            "page_number": page_number,
            "content_blocks": analysis_result.content_blocks,
            "voice_narration": analysis_result.voice_narration,
            "raw_text": raw_text or "",
            "word_count": word_count or 0,
            "has_figures": has_figures,
        }

        return success_response(
            data={
                "document_id": document_id,
                "page_number": page_number,
                "status": "regenerated",
                "page": page_payload,
                "content": page_payload,  # Backwards-compatible alias
                "analysis_cost": analysis_result.analysis_cost,
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error regenerating page analysis for {document_id}: {e}", exc_info=True)
        db.rollback()

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to regenerate page analysis: {str(e)}",
            ),
        )


@router.post("/documents/{document_id}/process-enhanced", response_model=dict)
async def process_document_enhanced(
    document_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    request: Request = None,
):
    """
    Process an existing document with enhanced GPT-4 Vision extraction.

    This runs the full enhanced extraction pipeline on a document
    that was previously uploaded without enhanced processing.

    Note: This is an expensive operation (~$0.60 for a 47-page document).

    Args:
        document_id: Document identifier
        db: Database session

    Returns:
        Processing status
    """
    ensure_admin_privileges(current_admin_user)
    try:
        document = db.query(Document).filter(Document.document_id == document_id).first()

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Only PDF documents are supported for enhanced processing
        if (document.file_type or "").lower() != "pdf":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message="ENHANCED_UNSUPPORTED_FILE_TYPE: Enhanced processing is only supported for PDF documents.",
                ),
            )

        # Check if already fully processed
        if document.enhanced_structure and document.processing_stage == "complete":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message="Document already has enhanced structure. Use regenerate endpoints for specific pages.",
                ),
            )

        # Get the original PDF file URL from metadata
        doc_metadata = document.doc_metadata or {}
        file_url = doc_metadata.get("file_url")

        if not file_url:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message="ENHANCED_ORIGINAL_FILE_MISSING: Original PDF file is not available for this document. "
                    "Please re-upload the document to enable enhanced processing.",
                ),
            )

        # Mark processing as started
        document.processing_stage = "extracting"
        document.processing_progress = 0
        document.indexing_status = "processing"
        document.indexing_error = None
        db.commit()

        # Retrieve PDF bytes from storage
        from app.services.storage_service import get_storage_service

        storage_service = get_storage_service()
        pdf_bytes = await storage_service.get_file(file_url)

        if not pdf_bytes:
            document.processing_stage = "failed"
            document.processing_progress = 0
            document.indexing_status = "failed"
            document.indexing_error = "ENHANCED_STORAGE_ERROR: Original PDF file could not be retrieved from storage."
            db.commit()

            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=error_response(
                    code=ErrorCodes.INTERNAL_ERROR,
                    message="ENHANCED_STORAGE_ERROR: Original PDF file could not be retrieved from storage.",
                ),
            )

        # Avoid duplicate vectors by deleting any existing entries for this document
        try:
            kb_indexer.delete_document(document_id)
        except Exception as e:
            logger.warning(
                "ENHANCED_INDEX_CLEANUP_FAILED: Failed to delete existing vectors for %s: %s",
                document_id,
                e,
            )

        # Progress callback to update processing stage/progress
        def progress_callback(progress: int) -> None:
            # Map numeric progress to coarse stages
            if progress < 30:
                stage = "extracting"
            elif progress < 90:
                stage = "analyzing"
            else:
                stage = "indexing"

            document.processing_stage = stage
            document.processing_progress = max(0, min(100, int(progress)))
            document.updated_at = datetime.now(timezone.utc)
            try:
                db.commit()
            except Exception as commit_err:
                db.rollback()
                logger.warning(
                    f"Failed to update processing progress for {document_id}: {commit_err}"
                )

        # Run enhanced extraction and indexing
        result, enhanced_structure, page_images_path = await kb_indexer.index_document_with_enhanced_extraction(
            pdf_bytes=pdf_bytes,
            document_id=document_id,
            title=document.title,
            source_type=document.source_type,
            metadata=doc_metadata,
            progress_callback=progress_callback,
        )

        # Update document record based on result
        if enhanced_structure:
            document.enhanced_structure = enhanced_structure

            meta = enhanced_structure.get("metadata") or {}
            total_pages = meta.get("total_pages")
            processing_cost = meta.get("processing_cost") or 0.0
            if total_pages is not None:
                document.total_pages = total_pages

            # Infer has_figures from page metadata/content blocks
            pages = enhanced_structure.get("pages", []) or []
            has_figures = False
            for page in pages:
                if page.get("has_figures"):
                    has_figures = True
                    break
                for block in page.get("content_blocks", []):
                    if block.get("type") == "figure":
                        has_figures = True
                        break
                if has_figures:
                    break
            document.has_figures = has_figures

            # PHI detection on enhanced voice narrations
            try:
                voice_text_parts = [
                    page.get("voice_narration", "")
                    for page in pages
                    if page.get("voice_narration")
                ]
                voice_text = " ".join(voice_text_parts).strip()

                if voice_text:
                    phi_result = phi_detector.detect_batch(voice_text, early_exit=True)

                    doc_metadata = document.doc_metadata or {}

                    # Aggregate PHI flags at document level
                    existing_phi_types = set(doc_metadata.get("phi_types", []) or [])
                    combined_types = sorted(existing_phi_types | set(phi_result.phi_types or []))

                    doc_metadata["phi_detected"] = bool(
                        phi_result.contains_phi or doc_metadata.get("phi_detected")
                    )
                    if combined_types:
                        doc_metadata["phi_types"] = combined_types
                    doc_metadata["phi_scan_timestamp"] = datetime.now(timezone.utc).isoformat()

                    # Enhanced voice-specific PHI fields
                    doc_metadata["enhanced_voice_phi_detected"] = bool(phi_result.contains_phi)
                    doc_metadata["enhanced_voice_phi_types"] = phi_result.phi_types

                    # Simple risk level from confidence
                    confidence = float(phi_result.confidence or 0.0)
                    if confidence >= 0.8:
                        risk_level = "high"
                    elif confidence >= 0.5:
                        risk_level = "medium"
                    else:
                        risk_level = "low" if phi_result.contains_phi else "none"

                    doc_metadata["phi_risk"] = risk_level

                    document.doc_metadata = doc_metadata
            except Exception as phi_err:  # pragma: no cover - defensive
                logger.warning(f"Error performing PHI detection on enhanced voice narrations: {phi_err}")

        if page_images_path:
            document.page_images_path = page_images_path

        document.chunks_indexed = result.chunks_indexed
        document.indexing_status = "indexed" if result.success else "failed"
        document.indexing_error = result.error_message if not result.success else None
        document.processing_stage = "complete" if result.success else "failed"
        document.processing_progress = 100 if result.success else document.processing_progress
        document.updated_at = datetime.now(timezone.utc)
        db.commit()

        # After PHI detection, propagate phi_risk into Qdrant payload so that
        # PHI-aware filters work even for documents indexed before this logic
        # was added. This operates in-place on existing vectors.
        try:
            current_metadata = document.doc_metadata or {}
            phi_risk_value = current_metadata.get("phi_risk")
            if phi_risk_value:
                kb_indexer.update_document_phi_risk(document_id, str(phi_risk_value))
        except Exception as payload_err:  # pragma: no cover - defensive
            logger.warning(
                "Failed to propagate phi_risk to Qdrant for %s: %s",
                document_id,
                payload_err,
            )

        # Record business metrics for enhanced processing
        try:
            pages_for_metrics = (
                document.total_pages
                if isinstance(document.total_pages, int) and document.total_pages > 0
                else (len(enhanced_structure.get("pages", [])) if enhanced_structure else 0)
            )

            enhanced_kb_processing_total.labels(
                status="success" if result.success else "failed"
            ).inc()

            if pages_for_metrics:
                enhanced_kb_processing_pages.observe(pages_for_metrics)

            if enhanced_structure:
                enhanced_kb_processing_cost_dollars.observe(float(processing_cost or 0.0))
        except Exception as metric_err:  # pragma: no cover - defensive
            logger.warning(f"Error recording enhanced processing metrics: {metric_err}")

        # Audit log
        admin_audit_log_service.log_action(
            db=db,
            actor=current_admin_user,
            action="kb.process_enhanced",
            target_type="document",
            target_id=document_id,
            metadata={
                "chunks_indexed": result.chunks_indexed,
                "success": result.success,
            },
            request=request,
        )

        logger.info(
            f"Enhanced processing {'succeeded' if result.success else 'failed'} "
            f"for document {document_id} with {result.chunks_indexed} chunks"
        )

        if not result.success:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=error_response(
                    code=ErrorCodes.INTERNAL_ERROR,
                    message=f"Enhanced processing failed: {result.error_message}",
                ),
            )

        return success_response(
            data={
                "document_id": document_id,
                "status": "complete",
                "chunks_indexed": result.chunks_indexed,
                "processing_stage": document.processing_stage,
                "processing_progress": document.processing_progress,
                "page_images_path": document.page_images_path,
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Error processing document enhanced for {document_id}: {e}", exc_info=True)
        db.rollback()

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to process document: {str(e)}",
            ),
        )
