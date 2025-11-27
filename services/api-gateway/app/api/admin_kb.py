"""
Admin Knowledge Base Management API (Phase 5)

Provides endpoints for administrators to manage the medical knowledge base:
- Upload documents (text/PDF)
- List indexed documents
- Delete documents
- View indexing status

These endpoints require admin authentication.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.business_metrics import (
    kb_chunks_total,
    kb_document_uploads_total,
    kb_documents_total,
    kb_indexing_duration,
)
from app.core.database import get_db
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.logging import get_logger
from app.models.user import User
from app.models.document import Document
from app.services.kb_indexer import IndexingResult, KBIndexer
from app.services.admin_audit_log_service import admin_audit_log_service
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Request
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


class DocumentListResponse(BaseModel):
    """Response for document list endpoint."""

    documents: List[DocumentListItem]
    total: int


# Global KB Indexer instance
# In production, this would be injected via dependency injection
kb_indexer = KBIndexer()


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

        # Use filename as title if not provided
        doc_title = title or file.filename

        # Track indexing duration (P3.3 - Business Metrics)
        start_time = time.time()

        # Index the document
        if file_extension == ".pdf":
            result: IndexingResult = await kb_indexer.index_pdf_document(
                pdf_bytes=file_content,
                document_id=document_id,
                title=doc_title,
                source_type=source_type,
                metadata={
                    "filename": file.filename,
                    "upload_date": datetime.now(timezone.utc).isoformat(),
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
                    metadata={
                        "upload_date": datetime.now(timezone.utc).isoformat(),
                        "file_size": len(file_content),
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
            kb_document_uploads_total.labels(
                source_type=source_type, file_type=file_type
            ).inc()
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
            )
            for doc in documents
        ]

        response_data = DocumentListResponse(documents=document_list, total=total)

        logger.info(
            f"Listed {len(document_list)} documents: skip={skip}, limit={limit}, source_type={source_type}, total={total}"
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

    Removes all document chunks from the vector database.

    Args:
        document_id: Document identifier
        db: Database session

    Returns:
        Deletion status
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Delete from PostgreSQL metadata store
        document = (
            db.query(Document)
            .filter(Document.document_id == document_id)
            .first()
        )

        if not document:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_response(
                    code=ErrorCodes.NOT_FOUND,
                    message=f"Document not found: {document_id}",
                ),
            )

        # Delete from vector database
        vector_success = kb_indexer.delete_document(document_id)

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
            metadata={"vector_deleted": vector_success},
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
        document = (
            db.query(Document)
            .filter(Document.document_id == document_id)
            .first()
        )

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
            "metadata": document.metadata,
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
