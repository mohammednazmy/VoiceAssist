"""Async document processing queue using ARQ (Phase 7 Integration Improvements).

Handles asynchronous document upload and indexing to prevent HTTP timeouts
and improve user experience for large documents.

Architecture:
- Enqueue document processing tasks from API endpoints
- Background worker processes tasks from Redis queue
- Job status tracking for monitoring upload progress
"""
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging

from arq import create_pool, ArqRedis
from arq.connections import RedisSettings

from app.core.config import settings
from app.services.kb_indexer import KBIndexer, IndexingResult
from app.core.logging import get_logger

logger = get_logger(__name__)


# ARQ Redis settings
ARQ_REDIS_SETTINGS = RedisSettings(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    password=settings.REDIS_PASSWORD,
    database=1,  # Use database 1 for ARQ (database 0 is for caching)
)


class DocumentProcessingQueue:
    """Service for managing async document processing tasks."""

    def __init__(self):
        self._redis_pool: Optional[ArqRedis] = None

    async def get_redis_pool(self) -> ArqRedis:
        """Get or create ARQ Redis connection pool."""
        if self._redis_pool is None:
            self._redis_pool = await create_pool(ARQ_REDIS_SETTINGS)
        return self._redis_pool

    async def enqueue_document(
        self,
        document_id: str,
        file_content: bytes,
        file_extension: str,
        title: str,
        source_type: str,
        metadata: Dict[str, Any],
    ) -> str:
        """
        Enqueue a document for async processing.

        Args:
            document_id: Unique document identifier
            file_content: Raw file bytes
            file_extension: File extension (.pdf, .txt)
            title: Document title
            source_type: Source type (uploaded, guideline, etc.)
            metadata: Additional metadata

        Returns:
            Job ID for tracking status
        """
        redis = await self.get_redis_pool()

        job = await redis.enqueue_job(
            "process_document",
            document_id,
            file_content,
            file_extension,
            title,
            source_type,
            metadata,
        )

        logger.info(
            "document_enqueued",
            extra={
                "document_id": document_id,
                "job_id": job.job_id,
                "title": title,
                "size_bytes": len(file_content),
                "file_extension": file_extension,
            },
        )

        return job.job_id

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get status of a document processing job.

        Args:
            job_id: ARQ job identifier

        Returns:
            Job status dict with keys: status, result, error, enqueue_time, finish_time
        """
        redis = await self.get_redis_pool()

        job = await redis.get_job(job_id)

        if not job:
            return {
                "status": "not_found",
                "error": f"Job {job_id} not found",
            }

        status_map = {
            "queued": "pending",
            "in_progress": "processing",
            "complete": "completed",
            "failed": "failed",
        }

        return {
            "status": status_map.get(job.status, job.status),
            "result": job.result,
            "error": job.error if hasattr(job, "error") else None,
            "enqueue_time": job.enqueue_time.isoformat() if job.enqueue_time else None,
            "finish_time": job.finish_time.isoformat() if job.finish_time else None,
        }

    async def close(self):
        """Close Redis connection pool."""
        if self._redis_pool:
            await self._redis_pool.close()


# Global instance
document_queue = DocumentProcessingQueue()


async def process_document(
    ctx: Dict[str, Any],
    document_id: str,
    file_content: bytes,
    file_extension: str,
    title: str,
    source_type: str,
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """
    ARQ task function to process a document.

    This function is called by ARQ workers in the background.

    Args:
        ctx: ARQ context dict
        document_id: Document identifier
        file_content: Raw file bytes
        file_extension: File extension
        title: Document title
        source_type: Source type
        metadata: Document metadata

    Returns:
        Processing result dict
    """
    logger.info(
        "document_processing_started",
        extra={
            "document_id": document_id,
            "title": title,
            "size_bytes": len(file_content),
        },
    )

    try:
        # Initialize KB Indexer
        kb_indexer = KBIndexer()

        # Process based on file type
        if file_extension == ".pdf":
            result: IndexingResult = await kb_indexer.index_pdf_document(
                pdf_bytes=file_content,
                document_id=document_id,
                title=title,
                source_type=source_type,
                metadata=metadata,
            )
        elif file_extension == ".txt":
            text_content = file_content.decode("utf-8")
            result: IndexingResult = await kb_indexer.index_document(
                content=text_content,
                document_id=document_id,
                title=title,
                source_type=source_type,
                metadata=metadata,
            )
        else:
            raise ValueError(f"Unsupported file extension: {file_extension}")

        if result.success:
            logger.info(
                "document_processing_completed",
                extra={
                    "document_id": document_id,
                    "chunks_indexed": result.chunks_indexed,
                    "title": title,
                },
            )

            return {
                "success": True,
                "document_id": document_id,
                "title": title,
                "chunks_indexed": result.chunks_indexed,
            }
        else:
            logger.error(
                "document_processing_failed",
                extra={
                    "document_id": document_id,
                    "error": result.error_message,
                    "title": title,
                },
            )

            return {
                "success": False,
                "document_id": document_id,
                "error": result.error_message,
            }

    except Exception as e:
        logger.error(
            "document_processing_exception",
            extra={
                "document_id": document_id,
                "error": str(e),
                "title": title,
            },
            exc_info=True,
        )

        return {
            "success": False,
            "document_id": document_id,
            "error": str(e),
        }


# ARQ Worker class configuration
class WorkerSettings:
    """ARQ worker settings."""

    redis_settings = ARQ_REDIS_SETTINGS
    functions = [process_document]
    job_timeout = timedelta(minutes=30)  # 30 minutes for large documents
    max_jobs = 5  # Process up to 5 documents concurrently
    keep_result = timedelta(hours=24)  # Keep job results for 24 hours
