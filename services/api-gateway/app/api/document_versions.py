"""
Document Versioning API for tracking versions and freshness.

Provides endpoints for:
- Version management
- Freshness checking
- Alert management
- Superseding documents
"""

from datetime import date
from typing import Any, Dict, List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_or_viewer, get_current_user
from app.core.logging import get_logger
from app.models.document import Document
from app.models.document_version import DocumentVersion, FreshnessAlert
from app.models.user import User
from app.services.document_versioning_service import get_document_versioning_service
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/documents", tags=["document-versions"])
logger = get_logger(__name__)


# Request/Response Models


class CreateVersionRequest(BaseModel):
    """Request to create a new document version."""

    change_type: str = Field("update", description="Type of change: initial, update, correction, superseded")
    change_summary: Optional[str] = Field(None, description="Summary of changes")
    source_url: Optional[str] = Field(None, description="Source URL")
    source_published_date: Optional[date] = Field(None, description="Source publication date")


class SupersedeRequest(BaseModel):
    """Request to mark document as superseded."""

    new_document_id: str = Field(..., description="ID of the superseding document")


# Endpoints


@router.get("/{document_id}/versions")
async def get_version_history(
    document_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get version history for a document.
    """
    try:
        versioning = get_document_versioning_service(db)
        versions = versioning.get_version_history(document_id, limit=limit)

        return success_response(
            data={
                "document_id": document_id,
                "versions": [v.to_dict() for v in versions],
                "count": len(versions),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get version history: {e}", exc_info=True)
        return error_response(
            message="Failed to get version history",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{document_id}/versions/{version_number}")
async def get_version(
    document_id: str,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get specific version of a document.
    """
    try:
        versioning = get_document_versioning_service(db)
        version = versioning.get_version(document_id, version_number)

        if not version:
            return error_response(
                message="Version not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        return success_response(data=version.to_dict())

    except Exception as e:
        logger.error(f"Failed to get version: {e}", exc_info=True)
        return error_response(
            message="Failed to get version",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/{document_id}/versions")
async def create_version(
    document_id: str,
    file: UploadFile = File(...),
    change_type: str = Query("update"),
    change_summary: Optional[str] = Query(None),
    source_url: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Create a new version of a document.

    Admin only.
    """
    try:
        file_bytes = await file.read()

        versioning = get_document_versioning_service(db)
        version = await versioning.create_version(
            document_id=document_id,
            file_bytes=file_bytes,
            change_type=change_type,
            change_summary=change_summary,
            changed_by=str(current_admin.id),
            source_url=source_url,
        )

        return success_response(
            data=version.to_dict(),
            message=f"Created version {version.version_number}",
        )

    except ValueError as e:
        return error_response(
            message=str(e),
            code=ErrorCodes.VALIDATION_ERROR,
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.error(f"Failed to create version: {e}", exc_info=True)
        return error_response(
            message="Failed to create version",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{document_id}/freshness")
async def check_freshness(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Check freshness status of a document.
    """
    try:
        versioning = get_document_versioning_service(db)
        result = await versioning.check_freshness(document_id)

        if result.get("status") == "not_found":
            return error_response(
                message="Document not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        return success_response(data=result)

    except Exception as e:
        logger.error(f"Failed to check freshness: {e}", exc_info=True)
        return error_response(
            message="Failed to check freshness",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/{document_id}/supersede")
async def supersede_document(
    document_id: str,
    request: SupersedeRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Mark document as superseded by another document.

    Admin only.
    """
    try:
        versioning = get_document_versioning_service(db)
        success = versioning.supersede_document(
            old_document_id=document_id,
            new_document_id=request.new_document_id,
            user_id=str(current_admin.id),
        )

        if not success:
            return error_response(
                message="Failed to supersede document. Check document IDs.",
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        return success_response(
            data={"superseded": True},
            message="Document marked as superseded",
        )

    except Exception as e:
        logger.error(f"Failed to supersede document: {e}", exc_info=True)
        return error_response(
            message="Failed to supersede document",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# Alert Endpoints


@router.get("/{document_id}/alerts")
async def get_document_alerts(
    document_id: str,
    include_acknowledged: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get freshness alerts for a document.
    """
    try:
        import uuid as uuid_module

        try:
            doc_uuid = uuid_module.UUID(document_id)
        except ValueError:
            return error_response(
                message="Invalid document ID",
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        query = db.query(FreshnessAlert).filter(FreshnessAlert.document_id == doc_uuid)

        if not include_acknowledged:
            query = query.filter(FreshnessAlert.acknowledged == False)

        alerts = query.order_by(FreshnessAlert.created_at.desc()).all()

        return success_response(
            data={
                "document_id": document_id,
                "alerts": [a.to_dict() for a in alerts],
                "count": len(alerts),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get alerts: {e}", exc_info=True)
        return error_response(
            message="Failed to get alerts",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Acknowledge a freshness alert.

    Admin only.
    """
    try:
        versioning = get_document_versioning_service(db)
        success = versioning.acknowledge_alert(alert_id, str(current_admin.id))

        if not success:
            return error_response(
                message="Alert not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        return success_response(
            data={"acknowledged": True},
            message="Alert acknowledged",
        )

    except Exception as e:
        logger.error(f"Failed to acknowledge alert: {e}", exc_info=True)
        return error_response(
            message="Failed to acknowledge alert",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# Admin Endpoints


@router.get("/admin/freshness/stats")
async def get_freshness_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get aggregate freshness statistics.

    Admin only.
    """
    try:
        versioning = get_document_versioning_service(db)
        stats = versioning.get_freshness_stats()

        return success_response(data=stats)

    except Exception as e:
        logger.error(f"Failed to get freshness stats: {e}", exc_info=True)
        return error_response(
            message="Failed to get freshness stats",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/admin/freshness/alerts")
async def get_all_alerts(
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get all unacknowledged freshness alerts.

    Admin only.
    """
    try:
        versioning = get_document_versioning_service(db)
        alerts = versioning.get_unacknowledged_alerts(severity=severity)[:limit]

        # Group by document
        by_document: Dict[str, List[Dict]] = {}
        for alert in alerts:
            doc_id = str(alert.document_id)
            if doc_id not in by_document:
                by_document[doc_id] = []
            by_document[doc_id].append(alert.to_dict())

        return success_response(
            data={
                "alerts": [a.to_dict() for a in alerts],
                "by_document": by_document,
                "total": len(alerts),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get alerts: {e}", exc_info=True)
        return error_response(
            message="Failed to get alerts",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/admin/freshness/check-all")
async def run_freshness_check(
    batch_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Run freshness check on all documents.

    Admin only.
    """
    try:
        versioning = get_document_versioning_service(db)
        results = await versioning.run_freshness_check_all(batch_size=batch_size)

        return success_response(
            data=results,
            message=f"Checked {results['checked']} documents, created {results['alerts_created']} alerts",
        )

    except Exception as e:
        logger.error(f"Failed to run freshness check: {e}", exc_info=True)
        return error_response(
            message="Failed to run freshness check",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/admin/freshness/stale")
async def get_stale_documents(
    days_threshold: int = Query(365, ge=30),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get documents that are stale or aging.

    Admin only.
    """
    try:
        from sqlalchemy import or_

        documents = (
            db.query(Document)
            .filter(
                or_(
                    Document.freshness_status == "stale",
                    Document.freshness_status == "aging",
                )
            )
            .order_by(Document.published_date.asc().nullslast())
            .limit(limit)
            .all()
        )

        return success_response(
            data={
                "documents": [
                    {
                        "id": str(d.id),
                        "document_id": d.document_id,
                        "title": d.title,
                        "freshness_status": d.freshness_status,
                        "published_date": d.published_date.isoformat() if d.published_date else None,
                        "last_verified_at": d.last_verified_at.isoformat() if d.last_verified_at else None,
                        "current_version": d.current_version,
                    }
                    for d in documents
                ],
                "count": len(documents),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get stale documents: {e}", exc_info=True)
        return error_response(
            message="Failed to get stale documents",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
