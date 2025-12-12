"""
Background Jobs API

Provides endpoints for monitoring and managing background jobs:
- Get job status and progress
- List jobs with filtering
- Cancel pending/running jobs
- Get job statistics
- WebSocket for real-time progress updates

Accessible to both admin users and regular authenticated users (for their own jobs).
"""

from typing import Any, Dict, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import SessionLocal, get_db
from app.core.dependencies import get_current_admin_or_viewer, get_current_user
from app.core.logging import get_logger
from app.core.security import verify_token
from app.models.user import User
from app.services.job_service import JobService, get_job_service, job_progress_broadcaster
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
logger = get_logger(__name__)


# WebSocket utilities


def is_websocket_connected(websocket: WebSocket) -> bool:
    """Check if WebSocket is still in a connected state."""
    try:
        return (
            websocket.client_state == WebSocketState.CONNECTED
            and websocket.application_state == WebSocketState.CONNECTED
        )
    except Exception:
        return False


async def safe_send_json(websocket: WebSocket, data: Dict[str, Any]) -> bool:
    """Safely send JSON to WebSocket."""
    if not is_websocket_connected(websocket):
        return False

    try:
        await websocket.send_json(data)
        return True
    except Exception as e:
        logger.warning(f"Failed to send WebSocket message: {e}")
        return False


# Request/Response Models


class JobStatusResponse(BaseModel):
    """Job status response."""

    id: str
    job_type: str
    status: str
    progress: int
    progress_message: Optional[str] = None
    document_id: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3


class JobListResponse(BaseModel):
    """Job list response."""

    jobs: list
    total: int
    limit: int
    offset: int


class JobStatsResponse(BaseModel):
    """Job statistics response."""

    by_status: dict
    by_type: dict
    recent_failures: list


@router.get("/{job_id}", response_model=dict)
async def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get status and progress of a background job.

    Returns job details including progress, status, and result/error if completed.
    """
    try:
        job_service = get_job_service(db)
        job = job_service.get_job(job_id)

        if not job:
            return error_response(
                message=f"Job {job_id} not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        # Check access: user can only see their own jobs unless admin
        if job.user_id and str(job.user_id) != str(current_user.id):
            if not current_user.is_admin:
                return error_response(
                    message="Access denied",
                    code=ErrorCodes.FORBIDDEN,
                    status_code=status.HTTP_403_FORBIDDEN,
                )

        return success_response(data=job.to_dict())

    except Exception as e:
        logger.error(f"Error getting job status: {e}", exc_info=True)
        return error_response(
            message="Failed to get job status",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/document/{document_id}", response_model=dict)
async def get_document_jobs(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all jobs associated with a document.

    Returns list of jobs (processing, reindexing, etc.) for the document.
    """
    try:
        job_service = get_job_service(db)
        jobs = job_service.get_jobs_for_document(document_id)

        # Filter jobs based on user access
        if not current_user.is_admin:
            jobs = [j for j in jobs if str(j.user_id) == str(current_user.id)]

        return success_response(
            data={
                "document_id": document_id,
                "jobs": [job.to_brief_dict() for job in jobs],
                "total": len(jobs),
            }
        )

    except Exception as e:
        logger.error(f"Error getting document jobs: {e}", exc_info=True)
        return error_response(
            message="Failed to get document jobs",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("", response_model=dict)
async def list_jobs(
    status_filter: Optional[str] = Query(None, alias="status"),
    job_type: Optional[str] = Query(None),
    document_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List background jobs with optional filtering.

    Filters:
    - status: pending, running, completed, failed, cancelled
    - job_type: document_processing, enhanced_extraction, tts_generation, etc.
    - document_id: Filter by associated document

    Non-admin users only see their own jobs.
    """
    try:
        job_service = get_job_service(db)

        # Non-admin users can only see their own jobs
        user_id = None if current_user.is_admin else str(current_user.id)

        jobs, total = job_service.list_jobs(
            status=status_filter,
            job_type=job_type,
            user_id=user_id,
            document_id=document_id,
            limit=limit,
            offset=offset,
        )

        return success_response(
            data={
                "jobs": [job.to_brief_dict() for job in jobs],
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        logger.error(f"Error listing jobs: {e}", exc_info=True)
        return error_response(
            message="Failed to list jobs",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/{job_id}/cancel", response_model=dict)
async def cancel_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel a pending or running job.

    Only pending or running jobs can be cancelled.
    Users can only cancel their own jobs unless admin.
    """
    try:
        job_service = get_job_service(db)
        job = job_service.get_job(job_id)

        if not job:
            return error_response(
                message=f"Job {job_id} not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        # Check access
        if job.user_id and str(job.user_id) != str(current_user.id):
            if not current_user.is_admin:
                return error_response(
                    message="Access denied",
                    code=ErrorCodes.FORBIDDEN,
                    status_code=status.HTTP_403_FORBIDDEN,
                )

        # Attempt to cancel
        success = job_service.cancel_job(job_id)

        if not success:
            return error_response(
                message=f"Cannot cancel job in status '{job.status}'",
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(
            "job_cancelled_by_user",
            extra={
                "job_id": job_id,
                "user_id": str(current_user.id),
            },
        )

        return success_response(
            data={"id": job_id, "status": "cancelled"},
            message="Job cancelled successfully",
        )

    except Exception as e:
        logger.error(f"Error cancelling job: {e}", exc_info=True)
        return error_response(
            message="Failed to cancel job",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# Admin-only endpoints


@router.get("/admin/stats", response_model=dict)
async def get_job_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get job statistics for admin monitoring.

    Returns counts by status, type, and recent failures.
    Admin only.
    """
    try:
        job_service = get_job_service(db)
        stats = job_service.get_job_stats()

        return success_response(data=stats)

    except Exception as e:
        logger.error(f"Error getting job stats: {e}", exc_info=True)
        return error_response(
            message="Failed to get job statistics",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/admin/active", response_model=dict)
async def get_active_jobs(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get all currently active (pending or running) jobs.

    Admin only. Useful for monitoring system load.
    """
    try:
        job_service = get_job_service(db)
        jobs = job_service.get_active_jobs()

        return success_response(
            data={
                "active_jobs": [job.to_dict() for job in jobs],
                "total": len(jobs),
            }
        )

    except Exception as e:
        logger.error(f"Error getting active jobs: {e}", exc_info=True)
        return error_response(
            message="Failed to get active jobs",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/admin/cleanup", response_model=dict)
async def cleanup_old_jobs(
    days_to_keep: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Clean up old completed/failed jobs.

    Admin only. Deletes jobs older than specified days.
    """
    try:
        job_service = get_job_service(db)
        deleted = job_service.cleanup_old_jobs(days_to_keep=days_to_keep)

        logger.info(
            "jobs_cleaned_up_by_admin",
            extra={
                "deleted_count": deleted,
                "days_to_keep": days_to_keep,
                "admin_id": str(current_admin.id),
            },
        )

        return success_response(
            data={"deleted_count": deleted},
            message=f"Cleaned up {deleted} old jobs",
        )

    except Exception as e:
        logger.error(f"Error cleaning up jobs: {e}", exc_info=True)
        return error_response(
            message="Failed to clean up jobs",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# WebSocket endpoint for real-time job progress


@router.websocket("/ws/{job_id}")
async def websocket_job_progress(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for real-time job progress updates.

    Connect to this endpoint to receive live progress updates for a specific job.
    Authentication is done via token query parameter.

    Usage:
        ws://host/api/jobs/ws/{job_id}?token=<jwt_token>

    Messages sent to client:
        {
            "type": "job_progress",
            "job_id": "...",
            "progress": 45,
            "status": "running",
            "message": "Processing page 5/10...",
            "timestamp": "..."
        }

        {
            "type": "job_complete",
            "job_id": "...",
            "status": "completed" | "failed",
            "result": {...} | null,
            "error": null | "error message"
        }
    """
    # Get token from query params
    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    # Verify token
    try:
        payload = verify_token(token)
        user_id = payload.get("sub")
        is_admin = payload.get("is_admin", False)

        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return

    except Exception as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await websocket.close(code=4001, reason="Authentication failed")
        return

    # Check job exists and user has access
    db = SessionLocal()
    try:
        job_service = get_job_service(db)
        job = job_service.get_job(job_id)

        if not job:
            await websocket.close(code=4004, reason="Job not found")
            return

        # Check access
        if job.user_id and str(job.user_id) != user_id and not is_admin:
            await websocket.close(code=4003, reason="Access denied")
            return

        # Accept connection
        await websocket.accept()

        logger.info(
            "job_websocket_connected",
            extra={"job_id": job_id, "user_id": user_id},
        )

        # Send initial status
        await safe_send_json(
            websocket,
            {
                "type": "job_status",
                "job_id": job_id,
                "status": job.status,
                "progress": job.progress,
                "message": job.progress_message,
            },
        )

        # Register connection with broadcaster
        await job_progress_broadcaster.connect(websocket, job_id)

        try:
            # Keep connection alive and handle client messages
            while True:
                try:
                    # Wait for client messages (ping/pong, etc.)
                    data = await websocket.receive_json()

                    # Handle ping
                    if data.get("type") == "ping":
                        await safe_send_json(websocket, {"type": "pong"})

                    # Handle status request
                    elif data.get("type") == "status":
                        # Refresh job status from DB
                        db_refresh = SessionLocal()
                        try:
                            job_svc = get_job_service(db_refresh)
                            current_job = job_svc.get_job(job_id)
                            if current_job:
                                await safe_send_json(
                                    websocket,
                                    {
                                        "type": "job_status",
                                        "job_id": job_id,
                                        "status": current_job.status,
                                        "progress": current_job.progress,
                                        "message": current_job.progress_message,
                                        "result": current_job.result_payload,
                                        "error": current_job.error_message,
                                    },
                                )

                                # If job is terminal, close connection
                                if current_job.status in ["completed", "failed", "cancelled"]:
                                    await websocket.close(code=1000)
                                    break
                        finally:
                            db_refresh.close()

                except WebSocketDisconnect:
                    logger.info(
                        "job_websocket_disconnected",
                        extra={"job_id": job_id, "user_id": user_id},
                    )
                    break

        finally:
            # Unregister connection
            await job_progress_broadcaster.disconnect(websocket, job_id)

    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {e}", exc_info=True)
        if is_websocket_connected(websocket):
            await websocket.close(code=1011, reason="Internal error")

    finally:
        db.close()
