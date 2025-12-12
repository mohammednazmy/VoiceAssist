"""
User Document Management API

Provides endpoints for authenticated users to manage their documents in the knowledge base:
- Upload documents (PDF, TXT, DOCX, MD)
- List user's documents (and public documents)
- Get document details and processing status
- Delete user's documents

Documents uploaded here are automatically available for:
- Voice mode document navigation
- RAG-based question answering
- Admin panel knowledge base management
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_organization
from app.core.logging import get_logger
from app.models.document import Document
from app.models.organization import Organization
from app.models.user import User
from app.services.figure_description_service import FigureDescriptionService
from app.services.kb_indexer import KBIndexer
from app.services.phi_detector import PHIDetector

router = APIRouter(prefix="/api/documents", tags=["documents"])
logger = get_logger(__name__)

# Global services
kb_indexer = KBIndexer(qdrant_url=settings.QDRANT_URL)
figure_service = FigureDescriptionService()
phi_detector = PHIDetector()

# Maximum file size: 10 MB
MAX_FILE_SIZE = 10 * 1024 * 1024

# Allowed file extensions
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".doc"}


# ========== Request/Response Models ==========


class DocumentUploadResponse(BaseModel):
    """Response after document upload."""

    document_id: str
    title: str
    status: str
    message: str


class DocumentResponse(BaseModel):
    """Full document details."""

    document_id: str
    title: str
    source_type: str
    filename: Optional[str]
    file_type: Optional[str]
    total_pages: Optional[int]
    has_toc: bool
    has_figures: bool
    is_public: bool
    chunks_indexed: int
    indexing_status: str
    indexing_error: Optional[str]
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    """Response for document list."""

    documents: list
    total: int


class DocumentStatusResponse(BaseModel):
    """Response for document status check."""

    document_id: str
    status: str
    chunks_indexed: int
    error: Optional[str]
    progress_percent: Optional[int]


# ========== Background Processing ==========


async def process_document_upload(
    document_id: str,
    file_content: bytes,
    filename: str,
    user_id: str,
    file_type: str,
):
    """
    Process document upload in background.

    This function:
    1. Scans document content for PHI (Protected Health Information)
    2. Extracts document structure (for PDFs)
    3. Generates figure descriptions (for PDFs with figures)
    4. Creates embeddings and indexes in Qdrant
    5. Updates document metadata in PostgreSQL
    """
    logger.info(f"Starting background processing for document {document_id}")

    # Get database session for background task
    from app.core.database import SessionLocal
    from app.services.audit_service import AuditService

    db = SessionLocal()

    try:
        # Get the document record
        document = db.query(Document).filter(Document.document_id == document_id).first()
        if not document:
            logger.error(f"Document {document_id} not found in database")
            return

        # Extract text for PHI scanning (before indexing)
        text_for_phi_scan = ""
        if file_type == "pdf":
            try:
                from pypdf import PdfReader
                import io
                reader = PdfReader(io.BytesIO(file_content))
                for page in reader.pages:
                    text_for_phi_scan += page.extract_text() or ""
            except Exception as e:
                logger.warning(f"Error extracting text for PHI scan: {e}")
        else:
            text_for_phi_scan = file_content.decode("utf-8", errors="replace")

        # Scan for PHI (use batch processing for large documents)
        # Batch processing is more efficient for documents > 50KB
        phi_result = phi_detector.detect_batch(text_for_phi_scan, early_exit=True)

        if phi_result.contains_phi:
            logger.warning(
                f"PHI detected in document {document_id}: types={phi_result.phi_types}, "
                f"confidence={phi_result.confidence}"
            )

            # Log PHI detection to audit log
            try:
                await AuditService.log_event(
                    db=db,
                    action="DOCUMENT_PHI_DETECTED",
                    success=True,  # Detection itself succeeded
                    user=None,  # Will set user_id separately
                    resource_type="document",
                    resource_id=document_id,
                    metadata={
                        "user_id": user_id,
                        "phi_types": phi_result.phi_types,
                        "confidence": phi_result.confidence,
                        "filename": filename,
                        "file_type": file_type,
                        "detection_details": phi_result.details,
                        "alert_level": "warning",
                        "action_taken": "indexed_with_warning",
                    },
                )
            except Exception as audit_err:
                logger.error(f"Error logging PHI detection to audit: {audit_err}")

            # Store PHI detection in document metadata
            doc_metadata = document.doc_metadata or {}
            doc_metadata["phi_detected"] = True
            doc_metadata["phi_types"] = phi_result.phi_types
            doc_metadata["phi_scan_timestamp"] = datetime.now(timezone.utc).isoformat()

            # Derive PHI risk level from confidence
            confidence = float(phi_result.confidence or 0.0)
            if confidence >= 0.8:
                risk_level = "high"
            elif confidence >= 0.5:
                risk_level = "medium"
            else:
                risk_level = "low"
            doc_metadata["phi_risk"] = risk_level

            document.doc_metadata = doc_metadata
            db.commit()
        else:
            logger.info(f"No PHI detected in document {document_id}")
            doc_metadata = document.doc_metadata or {}
            doc_metadata["phi_detected"] = False
            doc_metadata["phi_scan_timestamp"] = datetime.now(timezone.utc).isoformat()
            doc_metadata["phi_risk"] = "none"
            document.doc_metadata = doc_metadata
            db.commit()

        if file_type == "pdf":
            # Use structure-aware indexing for PDFs
            phi_risk = (document.doc_metadata or {}).get("phi_risk")
            result, structure = await kb_indexer.index_pdf_document_with_structure(
                pdf_bytes=file_content,
                document_id=document_id,
                title=document.title,
                source_type=document.source_type,
                metadata={
                    "uploaded_by": user_id,
                    "filename": filename,
                    "phi_risk": phi_risk,
                    "organization_id": str(document.organization_id) if document.organization_id else None,
                },
            )

            if structure:
                # Update document with structure information
                document.total_pages = structure.total_pages
                document.has_toc = len(structure.toc) > 0
                document.has_figures = len(structure.figures) > 0
                document.structure = structure.to_dict()

                # Generate figure descriptions if there are figures
                if structure.figures:
                    try:
                        logger.info(f"Generating descriptions for {len(structure.figures)} figures")
                        descriptions = await figure_service.describe_multiple_figures(
                            pdf_bytes=file_content,
                            figures=[
                                {
                                    "page_number": f.page_number,
                                    "figure_id": f.figure_id,
                                    "caption": f.caption,
                                }
                                for f in structure.figures
                            ],
                        )

                        # Update figure descriptions in structure
                        for figure_id, description in descriptions.items():
                            for fig in document.structure.get("figures", []):
                                if fig.get("figure_id") == figure_id:
                                    fig["description"] = description
                                    break

                    except Exception as e:
                        logger.warning(f"Error generating figure descriptions: {e}")
        else:
            # Use basic indexing for text files
            phi_risk = (document.doc_metadata or {}).get("phi_risk")
            text_content = file_content.decode("utf-8", errors="replace")
            result = await kb_indexer.index_document(
                content=text_content,
                document_id=document_id,
                title=document.title,
                source_type=document.source_type,
                metadata={
                    "uploaded_by": user_id,
                    "filename": filename,
                    "phi_risk": phi_risk,
                    "organization_id": str(document.organization_id) if document.organization_id else None,
                },
            )

        # Update document status
        if result.success:
            document.indexing_status = "indexed"
            document.chunks_indexed = result.chunks_indexed
            document.indexing_error = None
            logger.info(f"Successfully indexed document {document_id} with {result.chunks_indexed} chunks")
        else:
            document.indexing_status = "failed"
            document.indexing_error = result.error_message
            logger.error(f"Failed to index document {document_id}: {result.error_message}")

        document.updated_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}", exc_info=True)
        try:
            document = db.query(Document).filter(Document.document_id == document_id).first()
            if document:
                document.indexing_status = "failed"
                document.indexing_error = str(e)
                db.commit()
        except Exception as db_error:
            logger.error(f"Error updating document status: {db_error}")
    finally:
        db.close()


# ========== Endpoints ==========


@router.post("/upload", response_model=dict)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: str = Form("general"),
    is_public: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Upload a document to the user's knowledge base.

    The document is processed asynchronously:
    1. File is validated and stored
    2. Document record is created with "processing" status
    3. Background task handles extraction, embedding, and indexing
    4. Status can be polled via GET /api/documents/{id}/status

    Args:
        file: Document file (PDF, TXT, DOCX, MD)
        title: Optional document title (defaults to filename)
        category: Document category for organization
        is_public: Whether document is visible to all users

    Returns:
        Document ID and initial status
    """
    # Validate filename exists
    if not file.filename:
        return error_response(
            code=ErrorCodes.VALIDATION_ERROR,
            message="Filename is required",
        )

    # Read file content first (needed for magic byte detection)
    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE:
        return error_response(
            code=ErrorCodes.VALIDATION_ERROR,
            message=f"File size exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit",
        )

    # Get file extension from filename
    file_ext = "." + file.filename.lower().split(".")[-1] if "." in file.filename else ""

    # If no extension, try to detect from file magic bytes (handles macOS Finder drag-drop)
    detected_type = None
    if not file_ext or file_ext not in ALLOWED_EXTENSIONS:
        # Check magic bytes for common document types
        if file_content[:4] == b"%PDF":
            detected_type = "pdf"
            file_ext = ".pdf"
            logger.info(f"Detected PDF from magic bytes for file: {file.filename}")
        elif file_content[:4] == b"PK\x03\x04":
            # ZIP-based format (could be DOCX)
            detected_type = "docx"
            file_ext = ".docx"
            logger.info(f"Detected DOCX from magic bytes for file: {file.filename}")
        elif file_content[:2] == b"\xd0\xcf":
            # OLE compound document (old DOC format)
            detected_type = "doc"
            file_ext = ".doc"
            logger.info(f"Detected DOC from magic bytes for file: {file.filename}")
        elif len(file_content) > 0:
            # Try to decode as text
            try:
                file_content.decode("utf-8")
                detected_type = "txt"
                file_ext = ".txt"
                logger.info(f"Detected text file from content for file: {file.filename}")
            except UnicodeDecodeError:
                pass

    # Validate file type (either from extension or detected)
    if file_ext not in ALLOWED_EXTENSIONS:
        return error_response(
            code=ErrorCodes.VALIDATION_ERROR,
            message=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Generate document ID
    document_id = str(uuid.uuid4())

    # Use original filename for title, adding detected extension if needed
    original_name = file.filename
    if detected_type and "." not in file.filename:
        original_name = f"{file.filename}.{detected_type}"
    doc_title = title or original_name.rsplit(".", 1)[0]

    # Determine file type
    file_type = detected_type or (file_ext[1:] if file_ext else "txt")

    # Create document record with "processing" status
    organization_id = current_org.id if current_org else None
    # Use original_name which includes detected extension if needed
    db_document = Document(
        document_id=document_id,
        title=doc_title,
        source_type=f"user_{category}",
        filename=original_name,
        file_type=file_type,
        owner_id=current_user.id,
        organization_id=organization_id,
        is_public=is_public,
        indexing_status="processing",
        chunks_indexed=0,
        doc_metadata={
            "uploaded_by": str(current_user.id),
            "upload_date": datetime.now(timezone.utc).isoformat(),
            "category": category,
            "original_filename": file.filename,
            "file_size": len(file_content),
            "organization_id": str(organization_id) if organization_id else None,
        },
    )

    db.add(db_document)
    db.commit()

    logger.info(f"Created document record {document_id} for user {current_user.id}")

    # Schedule background processing
    background_tasks.add_task(
        process_document_upload,
        document_id=document_id,
        file_content=file_content,
        filename=file.filename,
        user_id=str(current_user.id),
        file_type=file_type,
    )

    return success_response(
        data={
            "document_id": document_id,
            "title": doc_title,
            "status": "processing",
            "message": "Document upload started. Processing in background.",
        }
    )


@router.get("", response_model=dict)
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = None,
    include_public: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List documents accessible to the current user.

    Returns user's own documents plus public documents (if include_public=true).

    Args:
        skip: Pagination offset
        limit: Maximum documents to return
        category: Filter by category
        include_public: Include public documents from other users
    """
    # Build query for user's documents
    query = db.query(Document)

    if include_public:
        # User's documents OR public documents
        query = query.filter(
            or_(
                Document.owner_id == current_user.id,
                Document.is_public == True,  # noqa: E712
            )
        )
    else:
        # Only user's documents
        query = query.filter(Document.owner_id == current_user.id)

    # Filter by category if specified
    if category:
        query = query.filter(Document.source_type == f"user_{category}")

    # Get total count
    total = query.count()

    # Get paginated results
    documents = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()

    return success_response(
        data={
            "documents": [doc.to_dict() for doc in documents],
            "total": total,
            "skip": skip,
            "limit": limit,
        }
    )


@router.get("/{document_id}", response_model=dict)
async def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get document details.

    User must own the document or it must be public.
    """
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document not found",
        )

    # Check access
    if document.owner_id != current_user.id and not document.is_public:
        return error_response(
            code=ErrorCodes.FORBIDDEN,
            message="Access denied",
        )

    return success_response(data=document.to_dict())


@router.get("/{document_id}/status", response_model=dict)
async def get_document_status(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get document processing status.

    Returns current indexing status and progress.
    """
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document not found",
        )

    # Check access
    if document.owner_id != current_user.id and not document.is_public:
        return error_response(
            code=ErrorCodes.FORBIDDEN,
            message="Access denied",
        )

    # Calculate progress percentage (rough estimate based on status)
    progress = None
    if document.indexing_status == "processing":
        progress = 50  # Midway through
    elif document.indexing_status == "indexed":
        progress = 100
    elif document.indexing_status == "failed":
        progress = 0

    return success_response(
        data={
            "document_id": document_id,
            "status": document.indexing_status,
            "chunks_indexed": document.chunks_indexed,
            "error": document.indexing_error,
            "progress_percent": progress,
            "total_pages": document.total_pages,
            "has_toc": document.has_toc,
            "has_figures": document.has_figures,
        }
    )


@router.get("/{document_id}/structure", response_model=dict)
async def get_document_structure(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get document structure (pages, TOC, sections, figures).

    Only available for indexed documents.
    """
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document not found",
        )

    # Check access
    if document.owner_id != current_user.id and not document.is_public:
        return error_response(
            code=ErrorCodes.FORBIDDEN,
            message="Access denied",
        )

    if document.indexing_status != "indexed":
        return error_response(
            code=ErrorCodes.PRECONDITION_FAILED,
            message=f"Document is not indexed (status: {document.indexing_status})",
        )

    return success_response(
        data={
            "document_id": document_id,
            "title": document.title,
            "total_pages": document.total_pages,
            "has_toc": document.has_toc,
            "has_figures": document.has_figures,
            "structure": document.structure,
        }
    )


@router.delete("/{document_id}", response_model=dict)
async def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a user's document.

    Removes document from:
    - PostgreSQL metadata
    - Qdrant vector index
    """
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response(
                code=ErrorCodes.NOT_FOUND,
                message="Document not found",
            ),
        )

    # Check ownership (only owner can delete)
    if document.owner_id != current_user.id:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content=error_response(
                code=ErrorCodes.FORBIDDEN,
                message="Only document owner can delete",
            ),
        )

    # Delete from Qdrant
    try:
        kb_indexer.delete_document(document_id)
    except Exception as e:
        logger.warning(f"Error deleting from Qdrant: {e}")

    # Delete from database
    db.delete(document)
    db.commit()

    logger.info(f"Deleted document {document_id} for user {current_user.id}")

    return success_response(
        data={
            "document_id": document_id,
            "message": "Document deleted successfully",
        }
    )


@router.patch("/{document_id}/visibility", response_model=dict)
async def update_document_visibility(
    document_id: str,
    is_public: bool = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update document visibility (public/private).

    Only document owner can change visibility.
    """
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document not found",
        )

    # Check ownership
    if document.owner_id != current_user.id:
        return error_response(
            code=ErrorCodes.FORBIDDEN,
            message="Only document owner can change visibility",
        )

    document.is_public = is_public
    document.updated_at = datetime.now(timezone.utc)
    db.commit()

    return success_response(
        data={
            "document_id": document_id,
            "is_public": is_public,
            "message": f"Document is now {'public' if is_public else 'private'}",
        }
    )
