"""
Job Service for managing background job lifecycle.

Provides a unified interface for:
- Creating and tracking background jobs
- Querying job status and progress
- Managing job lifecycle (cancel, retry)
- WebSocket progress broadcast
"""

import asyncio
import traceback
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from app.core.logging import get_logger
from app.models.background_job import BackgroundJob
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class JobService:
    """Service for managing background jobs."""

    def __init__(self, db: Session):
        self.db = db

    def create_job(
        self,
        job_type: str,
        document_id: Optional[uuid.UUID] = None,
        user_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        input_payload: Optional[Dict[str, Any]] = None,
        priority: int = 5,
        max_retries: int = 3,
    ) -> BackgroundJob:
        """
        Create a new background job record.

        Args:
            job_type: Type of job (e.g., 'document_processing', 'tts_generation')
            document_id: Related document ID if applicable
            user_id: User who initiated the job
            tenant_id: Tenant ID for multi-tenancy
            input_payload: Job input parameters (excluding large binary data)
            priority: Job priority (1=highest, 10=lowest)
            max_retries: Maximum retry attempts

        Returns:
            Created BackgroundJob instance
        """
        job = BackgroundJob(
            job_type=job_type,
            document_id=document_id,
            user_id=user_id,
            tenant_id=tenant_id,
            input_payload=input_payload,
            priority=priority,
            max_retries=max_retries,
            status="pending",
            progress=0,
        )

        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        logger.info(
            "job_created",
            extra={
                "job_id": str(job.id),
                "job_type": job_type,
                "document_id": str(document_id) if document_id else None,
            },
        )

        return job

    def get_job(self, job_id: str) -> Optional[BackgroundJob]:
        """Get job by ID (UUID or ARQ job ID)."""
        try:
            # Try as UUID first
            job_uuid = uuid.UUID(job_id)
            job = self.db.query(BackgroundJob).filter_by(id=job_uuid).first()
            if job:
                return job
        except ValueError:
            pass

        # Try as ARQ job ID
        return self.db.query(BackgroundJob).filter_by(arq_job_id=job_id).first()

    def get_job_by_arq_id(self, arq_job_id: str) -> Optional[BackgroundJob]:
        """Get job by ARQ job ID."""
        return self.db.query(BackgroundJob).filter_by(arq_job_id=arq_job_id).first()

    def get_jobs_for_document(self, document_id: str) -> List[BackgroundJob]:
        """Get all jobs for a document."""
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return []

        return (
            self.db.query(BackgroundJob)
            .filter_by(document_id=doc_uuid)
            .order_by(BackgroundJob.created_at.desc())
            .all()
        )

    def list_jobs(
        self,
        status: Optional[str] = None,
        job_type: Optional[str] = None,
        user_id: Optional[str] = None,
        document_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[BackgroundJob], int]:
        """
        List jobs with filtering and pagination.

        Returns:
            Tuple of (jobs, total_count)
        """
        query = self.db.query(BackgroundJob)

        # Apply filters
        if status:
            query = query.filter(BackgroundJob.status == status)
        if job_type:
            query = query.filter(BackgroundJob.job_type == job_type)
        if user_id:
            try:
                query = query.filter(BackgroundJob.user_id == uuid.UUID(user_id))
            except ValueError:
                pass
        if document_id:
            try:
                query = query.filter(BackgroundJob.document_id == uuid.UUID(document_id))
            except ValueError:
                pass

        # Get total count
        total = query.count()

        # Apply pagination and ordering
        jobs = (
            query.order_by(BackgroundJob.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return jobs, total

    def get_active_jobs(self) -> List[BackgroundJob]:
        """Get all pending or running jobs."""
        return (
            self.db.query(BackgroundJob)
            .filter(BackgroundJob.status.in_(["pending", "running"]))
            .order_by(BackgroundJob.priority.asc(), BackgroundJob.created_at.asc())
            .all()
        )

    def get_jobs_to_retry(self) -> List[BackgroundJob]:
        """Get failed jobs that should be retried."""
        now = datetime.utcnow()
        return (
            self.db.query(BackgroundJob)
            .filter(
                and_(
                    BackgroundJob.status == "failed",
                    BackgroundJob.retry_count < BackgroundJob.max_retries,
                    or_(
                        BackgroundJob.next_retry_at.is_(None),
                        BackgroundJob.next_retry_at <= now,
                    ),
                )
            )
            .all()
        )

    def update_job_arq_id(self, job_id: uuid.UUID, arq_job_id: str) -> None:
        """Set the ARQ job ID after enqueueing."""
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if job:
            job.arq_job_id = arq_job_id
            self.db.commit()

    def mark_job_started(self, job_id: uuid.UUID) -> None:
        """Mark job as started."""
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if job:
            job.mark_started()
            self.db.commit()
            logger.info("job_started", extra={"job_id": str(job_id)})

    def mark_job_completed(
        self, job_id: uuid.UUID, result: Optional[Dict[str, Any]] = None
    ) -> None:
        """Mark job as completed."""
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if job:
            job.mark_completed(result)
            self.db.commit()
            logger.info(
                "job_completed",
                extra={
                    "job_id": str(job_id),
                    "duration_seconds": job.duration_seconds,
                },
            )

    def mark_job_failed(
        self,
        job_id: uuid.UUID,
        error: str,
        traceback_str: Optional[str] = None,
        schedule_retry: bool = True,
    ) -> None:
        """Mark job as failed, optionally scheduling retry."""
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if job:
            job.mark_failed(error, traceback_str)

            if schedule_retry and job.should_retry():
                # Exponential backoff: 60s, 120s, 240s, ...
                delay = 60 * (2 ** job.retry_count)
                job.schedule_retry(delay_seconds=delay)
                logger.info(
                    "job_scheduled_retry",
                    extra={
                        "job_id": str(job_id),
                        "retry_count": job.retry_count,
                        "next_retry_at": job.next_retry_at.isoformat(),
                    },
                )
            else:
                logger.error(
                    "job_failed_final",
                    extra={"job_id": str(job_id), "error": error},
                )

            self.db.commit()

    def mark_job_cancelled(self, job_id: uuid.UUID) -> bool:
        """
        Mark job as cancelled.

        Returns:
            True if job was cancelled, False if not possible
        """
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if not job:
            return False

        if job.status not in ["pending", "running"]:
            return False  # Can only cancel pending or running jobs

        job.mark_cancelled()
        self.db.commit()
        logger.info("job_cancelled", extra={"job_id": str(job_id)})
        return True

    def update_job_progress(
        self,
        job_id: uuid.UUID,
        progress: int,
        message: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Update job progress."""
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if job:
            job.update_progress(progress, message, details)
            self.db.commit()

    def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a job by ID.

        Returns:
            True if cancelled, False otherwise
        """
        job = self.get_job(job_id)
        if not job:
            return False

        return self.mark_job_cancelled(job.id)

    def cleanup_old_jobs(self, days_to_keep: int = 30) -> int:
        """
        Delete old completed/failed jobs.

        Args:
            days_to_keep: Number of days to retain jobs

        Returns:
            Number of jobs deleted
        """
        cutoff = datetime.utcnow() - timedelta(days=days_to_keep)

        result = (
            self.db.query(BackgroundJob)
            .filter(
                and_(
                    BackgroundJob.status.in_(["completed", "failed", "cancelled"]),
                    BackgroundJob.completed_at < cutoff,
                )
            )
            .delete(synchronize_session=False)
        )

        self.db.commit()
        logger.info("jobs_cleaned_up", extra={"deleted_count": result})
        return result

    def get_job_stats(self) -> Dict[str, Any]:
        """Get job statistics."""
        from sqlalchemy import func

        stats = {}

        # Count by status
        status_counts = (
            self.db.query(BackgroundJob.status, func.count(BackgroundJob.id))
            .group_by(BackgroundJob.status)
            .all()
        )
        stats["by_status"] = {status: count for status, count in status_counts}

        # Count by type
        type_counts = (
            self.db.query(BackgroundJob.job_type, func.count(BackgroundJob.id))
            .group_by(BackgroundJob.job_type)
            .all()
        )
        stats["by_type"] = {job_type: count for job_type, count in type_counts}

        # Recent failures
        recent_failures = (
            self.db.query(BackgroundJob)
            .filter(BackgroundJob.status == "failed")
            .order_by(BackgroundJob.completed_at.desc())
            .limit(10)
            .all()
        )
        stats["recent_failures"] = [job.to_brief_dict() for job in recent_failures]

        return stats


class JobProgressBroadcaster:
    """
    Manages WebSocket connections for real-time job progress updates.

    Usage:
        broadcaster = JobProgressBroadcaster()

        # In WebSocket endpoint
        await broadcaster.connect(websocket, job_id)

        # When job progress updates
        await broadcaster.broadcast_progress(job_id, progress, message)
    """

    def __init__(self):
        self._connections: Dict[str, Set[Any]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any, job_id: str) -> None:
        """Register a WebSocket connection for a job."""
        async with self._lock:
            if job_id not in self._connections:
                self._connections[job_id] = set()
            self._connections[job_id].add(websocket)

        logger.debug(
            "websocket_connected",
            extra={"job_id": job_id, "connections": len(self._connections[job_id])},
        )

    async def disconnect(self, websocket: Any, job_id: str) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            if job_id in self._connections:
                self._connections[job_id].discard(websocket)
                if not self._connections[job_id]:
                    del self._connections[job_id]

    async def broadcast_progress(
        self,
        job_id: str,
        progress: int,
        message: Optional[str] = None,
        status: str = "running",
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Broadcast progress update to all connected clients."""
        if job_id not in self._connections:
            return

        payload = {
            "type": "job_progress",
            "job_id": job_id,
            "progress": progress,
            "status": status,
            "message": message,
            "result": result,
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Send to all connected clients
        disconnected = set()
        for websocket in self._connections[job_id]:
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.add(websocket)

        # Clean up disconnected clients
        async with self._lock:
            for ws in disconnected:
                self._connections[job_id].discard(ws)

    async def broadcast_completion(
        self,
        job_id: str,
        success: bool,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Broadcast job completion to all connected clients."""
        await self.broadcast_progress(
            job_id=job_id,
            progress=100 if success else -1,
            message="Completed" if success else f"Failed: {error}",
            status="completed" if success else "failed",
            result=result,
        )

        # Clean up connections after completion
        async with self._lock:
            if job_id in self._connections:
                del self._connections[job_id]


# Global broadcaster instance
job_progress_broadcaster = JobProgressBroadcaster()


def get_job_service(db: Session) -> JobService:
    """Factory function to get JobService instance."""
    return JobService(db)
