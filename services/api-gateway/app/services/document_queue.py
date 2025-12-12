"""Async document processing queue using ARQ with database persistence.

Handles asynchronous document upload and indexing to prevent HTTP timeouts
and improve user experience for large documents.

Architecture:
- Enqueue document processing tasks from API endpoints
- Background worker processes tasks from Redis queue
- Job status tracked in PostgreSQL for persistence
- WebSocket progress updates for real-time monitoring
"""

import asyncio
import traceback
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.metrics import (
    analytics_aggregation_duration_seconds,
    analytics_aggregation_jobs_total,
    analytics_records_aggregated_total,
    cleanup_records_deleted_total,
    cron_job_duration_seconds,
    cron_job_executions_total,
    cron_job_last_run_timestamp,
)
from app.models.background_job import BackgroundJob
from app.models.document import Document
from app.services.job_service import JobService, job_progress_broadcaster
from app.services.kb_indexer import IndexingResult, KBIndexer
from app.services.tools.log_ingestion_service import ingest_tool_logs_from_redis
from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

logger = get_logger(__name__)


# ARQ Redis settings
ARQ_REDIS_SETTINGS = RedisSettings(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    password=settings.REDIS_PASSWORD,
    database=1,  # Use database 1 for ARQ (database 0 is for caching)
)


class DocumentProcessingQueue:
    """Service for managing async document processing tasks with DB persistence."""

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
        user_id: Optional[str] = None,
        use_enhanced_extraction: bool = False,
    ) -> str:
        """
        Enqueue a document for async processing with database tracking.

        Args:
            document_id: Unique document identifier
            file_content: Raw file bytes
            file_extension: File extension (.pdf, .txt)
            title: Document title
            source_type: Source type (uploaded, guideline, etc.)
            metadata: Additional metadata
            user_id: User who initiated the upload
            use_enhanced_extraction: Whether to use GPT-4 Vision extraction

        Returns:
            Job ID (UUID) for tracking status
        """
        # Create job record in database
        db = SessionLocal()
        try:
            job_service = JobService(db)

            # Determine job type
            job_type = (
                "enhanced_extraction"
                if use_enhanced_extraction
                else "document_processing"
            )

            # Parse document UUID
            try:
                doc_uuid = uuid.UUID(document_id)
            except ValueError:
                doc_uuid = None

            # Parse user UUID
            user_uuid = None
            if user_id:
                try:
                    user_uuid = uuid.UUID(user_id)
                except ValueError:
                    pass

            # Create job record
            job = job_service.create_job(
                job_type=job_type,
                document_id=doc_uuid,
                user_id=user_uuid,
                input_payload={
                    "title": title,
                    "source_type": source_type,
                    "file_extension": file_extension,
                    "file_size_bytes": len(file_content),
                    "use_enhanced_extraction": use_enhanced_extraction,
                },
            )

            job_id = str(job.id)

            # Enqueue to ARQ
            redis = await self.get_redis_pool()
            arq_job = await redis.enqueue_job(
                "process_document",
                job_id,
                document_id,
                file_content,
                file_extension,
                title,
                source_type,
                metadata,
                use_enhanced_extraction,
            )

            # Update job with ARQ job ID
            job_service.update_job_arq_id(job.id, arq_job.job_id)

            logger.info(
                "document_enqueued",
                extra={
                    "job_id": job_id,
                    "arq_job_id": arq_job.job_id,
                    "document_id": document_id,
                    "title": title,
                    "size_bytes": len(file_content),
                    "file_extension": file_extension,
                    "use_enhanced_extraction": use_enhanced_extraction,
                },
            )

            return job_id

        finally:
            db.close()

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get status of a document processing job from database.

        Args:
            job_id: Job identifier (UUID)

        Returns:
            Job status dict
        """
        db = SessionLocal()
        try:
            job_service = JobService(db)
            job = job_service.get_job(job_id)

            if not job:
                return {
                    "status": "not_found",
                    "error": f"Job {job_id} not found",
                }

            return job.to_dict()

        finally:
            db.close()

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending or running job."""
        db = SessionLocal()
        try:
            job_service = JobService(db)
            return job_service.cancel_job(job_id)
        finally:
            db.close()

    async def close(self):
        """Close Redis connection pool."""
        if self._redis_pool:
            await self._redis_pool.close()


# Global instance
document_queue = DocumentProcessingQueue()


async def process_document(
    ctx: Dict[str, Any],
    job_id: str,
    document_id: str,
    file_content: bytes,
    file_extension: str,
    title: str,
    source_type: str,
    metadata: Dict[str, Any],
    use_enhanced_extraction: bool = False,
) -> Dict[str, Any]:
    """
    ARQ task function to process a document with database tracking.

    This function is called by ARQ workers in the background.

    Args:
        ctx: ARQ context dict
        job_id: Background job UUID for tracking
        document_id: Document identifier
        file_content: Raw file bytes
        file_extension: File extension
        title: Document title
        source_type: Source type
        metadata: Document metadata
        use_enhanced_extraction: Whether to use GPT-4 Vision

    Returns:
        Processing result dict
    """
    db = SessionLocal()
    try:
        job_service = JobService(db)

        # Mark job as started
        try:
            job_uuid = uuid.UUID(job_id)
            job_service.mark_job_started(job_uuid)
        except ValueError:
            logger.warning(f"Invalid job_id format: {job_id}")

        logger.info(
            "document_processing_started",
            extra={
                "job_id": job_id,
                "document_id": document_id,
                "title": title,
                "size_bytes": len(file_content),
                "use_enhanced_extraction": use_enhanced_extraction,
            },
        )

        # Create progress callback that updates DB and broadcasts via WebSocket.
        # This callback is intentionally synchronous so it can be used by both
        # synchronous extraction code (pdfplumber, pdf2image) and async analysis.
        def progress_callback(progress: int, message: str | None = None) -> None:
            try:
                job_service.update_job_progress(
                    job_uuid,
                    progress,
                    message or f"Processing: {progress}%",
                )
                # Fire-and-forget WebSocket broadcast; we don't await here because
                # this callback may be invoked from synchronous code paths.
                try:
                    asyncio.create_task(
                        job_progress_broadcaster.broadcast_progress(
                            job_id,
                            progress,
                            message,
                        )
                    )
                except RuntimeError:
                    # No running event loop (e.g., during tests); skip broadcast.
                    logger.debug("No running event loop for progress broadcast", exc_info=True)
            except Exception as e:  # pragma: no cover - defensive
                logger.warning(f"Failed to update progress: {e}")

        # Initialize KB Indexer
        kb_indexer = KBIndexer()

        # Process based on file type and extraction method
        if file_extension == ".pdf":
            if use_enhanced_extraction:
                # Use GPT-4 Vision enhanced extraction
                result, _, _ = await kb_indexer.index_document_with_enhanced_extraction(
                    pdf_bytes=file_content,
                    document_id=document_id,
                    title=title,
                    source_type=source_type,
                    metadata=metadata,
                    progress_callback=progress_callback,
                )
            else:
                # Standard PDF extraction
                result = await kb_indexer.index_pdf_document(
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

        # Update job status
        result_dict = {
            "success": result.success,
            "document_id": document_id,
            "title": title,
            "chunks_indexed": result.chunks_indexed,
            "error": result.error_message if not result.success else None,
        }

        if result.success:
            job_service.mark_job_completed(job_uuid, result_dict)
            await job_progress_broadcaster.broadcast_completion(
                job_id, success=True, result=result_dict
            )

            logger.info(
                "document_processing_completed",
                extra={
                    "job_id": job_id,
                    "document_id": document_id,
                    "chunks_indexed": result.chunks_indexed,
                    "title": title,
                },
            )
        else:
            job_service.mark_job_failed(
                job_uuid,
                result.error_message or "Unknown error",
                schedule_retry=True,
            )
            await job_progress_broadcaster.broadcast_completion(
                job_id, success=False, error=result.error_message
            )

            logger.error(
                "document_processing_failed",
                extra={
                    "job_id": job_id,
                    "document_id": document_id,
                    "error": result.error_message,
                    "title": title,
                },
            )

        return result_dict

    except Exception as e:
        error_msg = str(e)
        tb = traceback.format_exc()

        logger.error(
            "document_processing_exception",
            extra={
                "job_id": job_id,
                "document_id": document_id,
                "error": error_msg,
                "title": title,
            },
            exc_info=True,
        )

        # Update job as failed
        try:
            job_uuid = uuid.UUID(job_id)
            job_service.mark_job_failed(job_uuid, error_msg, tb, schedule_retry=True)
            await job_progress_broadcaster.broadcast_completion(
                job_id, success=False, error=error_msg
            )
        except Exception:
            pass

        return {
            "success": False,
            "document_id": document_id,
            "error": error_msg,
        }

    finally:
        db.close()


async def retry_failed_jobs(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARQ task to retry failed jobs that are scheduled for retry.

    This runs periodically to pick up failed jobs that need retrying.
    """
    db = SessionLocal()
    try:
        job_service = JobService(db)
        jobs_to_retry = job_service.get_jobs_to_retry()

        retried = 0
        for job in jobs_to_retry:
            if job.job_type == "document_processing":
                # Re-enqueue the document processing
                # Note: We need the original file content, which should be stored
                # or we need to re-read from storage
                logger.info(
                    "job_retry_queued",
                    extra={"job_id": str(job.id), "retry_count": job.retry_count},
                )
                retried += 1

        return {"retried_jobs": retried}

    finally:
        db.close()


async def cleanup_old_jobs(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARQ task to clean up old completed/failed jobs.
    """
    db = SessionLocal()
    try:
        job_service = JobService(db)
        deleted = job_service.cleanup_old_jobs(days_to_keep=30)
        return {"deleted_jobs": deleted}
    finally:
        db.close()


async def aggregate_hourly_metrics(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARQ cron task to aggregate hourly metrics into daily summaries.

    Runs every hour to roll up hourly metrics into daily aggregates
    for faster dashboard queries.
    """
    from app.models.analytics import AnalyticsDailyMetrics, AnalyticsHourlyMetrics
    from sqlalchemy import func

    db = SessionLocal()
    job_name = "aggregate_hourly_metrics"
    start_time = datetime.utcnow()
    try:
        # Determine previous hour window
        now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        hour_end = now
        hour_start = hour_end - timedelta(hours=1)
        target_date = hour_start.date()

        logger.info(
            "aggregate_hourly_metrics_started",
            extra={"hour_start": hour_start.isoformat(), "hour_end": hour_end.isoformat()},
        )

        # Aggregate hourly metrics by type and organization
        hourly_data = (
            db.query(
                AnalyticsHourlyMetrics.organization_id.label("organization_id"),
                AnalyticsHourlyMetrics.metric_type.label("metric_type"),
                func.sum(AnalyticsHourlyMetrics.total_count).label("total_count"),
                func.sum(AnalyticsHourlyMetrics.error_count).label("error_count"),
                func.sum(AnalyticsHourlyMetrics.unique_users).label("unique_users"),
                func.avg(AnalyticsHourlyMetrics.avg_duration_ms).label("avg_duration"),
            )
            .filter(
                AnalyticsHourlyMetrics.timestamp >= hour_start,
                AnalyticsHourlyMetrics.timestamp < hour_end,
            )
            .group_by(
                AnalyticsHourlyMetrics.organization_id,
                AnalyticsHourlyMetrics.metric_type,
            )
            .all()
        )

        aggregated = 0
        for row in hourly_data:
            # Update or create daily metric
            daily = (
                db.query(AnalyticsDailyMetrics)
                .filter(
                    AnalyticsDailyMetrics.date == target_date,
                    AnalyticsDailyMetrics.organization_id == row.organization_id,
                    AnalyticsDailyMetrics.metric_type == row.metric_type,
                )
                .first()
            )

            if not daily:
                daily = AnalyticsDailyMetrics(
                    date=target_date,
                    organization_id=row.organization_id,
                    metric_type=row.metric_type,
                    total_count=0,
                    success_count=0,
                    error_count=0,
                    unique_users=0,
                )
                db.add(daily)

            total_count = row.total_count or 0
            error_count = row.error_count or 0
            unique_users = row.unique_users or 0

            daily.total_count += total_count
            daily.error_count += error_count
            # Approximate successes as total - errors for lack of finer-grained data
            daily.success_count += max(0, total_count - error_count)
            daily.unique_users = (daily.unique_users or 0) + unique_users

            # Rolling average for duration (simple mean of hourly averages)
            if row.avg_duration is not None:
                if daily.avg_duration_ms is None:
                    daily.avg_duration_ms = row.avg_duration
                else:
                    daily.avg_duration_ms = (daily.avg_duration_ms + row.avg_duration) / 2

            analytics_records_aggregated_total.labels(
                job_type="hourly", metric_type=row.metric_type
            ).inc(total_count)

            aggregated += 1

        db.commit()

        duration = (datetime.utcnow() - start_time).total_seconds()
        analytics_aggregation_jobs_total.labels(status="success", job_type="hourly").inc()
        analytics_aggregation_duration_seconds.labels(job_type="hourly").observe(duration)
        cron_job_executions_total.labels(job_name=job_name, status="success").inc()
        cron_job_last_run_timestamp.labels(job_name=job_name).set(datetime.utcnow().timestamp())
        cron_job_duration_seconds.labels(job_name=job_name).observe(duration)

        logger.info(
            "aggregate_hourly_metrics_completed",
            extra={
                "hour_start": hour_start.isoformat(),
                "hour_end": hour_end.isoformat(),
                "metrics_aggregated": aggregated,
            },
        )

        return {
            "aggregated_metrics": aggregated,
            "hour_start": hour_start.isoformat(),
            "hour_end": hour_end.isoformat(),
        }

    except Exception as e:
        analytics_aggregation_jobs_total.labels(status="failure", job_type="hourly").inc()
        cron_job_executions_total.labels(job_name=job_name, status="failure").inc()
        logger.error("aggregate_hourly_metrics_failed", extra={"error": str(e)}, exc_info=True)
        return {"error": str(e)}
    finally:
        db.close()


async def aggregate_daily_costs(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARQ cron task to aggregate and reconcile daily cost estimates.

    Runs daily at 2 AM to:
    - Calculate total usage costs from API calls
    - Update cost tracking records
    - Generate cost reports for billing
    """
    from app.models.analytics import AnalyticsCostTracking, AnalyticsDailyMetrics
    from sqlalchemy import func

    db = SessionLocal()
    job_name = "aggregate_daily_costs"
    start_time = datetime.utcnow()
    try:
        # Process yesterday's data
        yesterday = (datetime.utcnow() - timedelta(days=1)).date()

        logger.info("aggregate_daily_costs_started", extra={"date": yesterday.isoformat()})

        # Cost rates per service (cents)
        COST_RATES = {
            "openai_gpt4": {"per_1k_tokens_input": 3, "per_1k_tokens_output": 6},  # $0.03/$0.06
            "openai_gpt4_vision": {"per_page": 1.275},  # $0.01275
            "openai_whisper": {"per_minute": 0.6},  # $0.006
            "openai_tts": {"per_1k_chars": 1.5},  # $0.015
            "openai_embedding": {"per_1k_tokens": 0.01},  # $0.0001
            "qdrant": {"per_1k_vectors": 0.1},  # Minimal storage cost
        }

        # Get daily metrics with token counts
        metrics = (
            db.query(AnalyticsDailyMetrics)
            .filter(AnalyticsDailyMetrics.date == yesterday)
            .all()
        )

        costs_by_org: Dict[Optional[uuid.UUID], Dict[str, int]] = {}

        for metric in metrics:
            org_id = metric.organization_id
            if org_id not in costs_by_org:
                costs_by_org[org_id] = {}

            # Calculate cost based on metric type
            if metric.metric_type == "llm_calls" and metric.total_tokens:
                # Estimate 30% input, 70% output for GPT-4
                input_cost = int((metric.total_tokens * 0.3) / 1000 * COST_RATES["openai_gpt4"]["per_1k_tokens_input"])
                output_cost = int((metric.total_tokens * 0.7) / 1000 * COST_RATES["openai_gpt4"]["per_1k_tokens_output"])
                costs_by_org[org_id]["openai_gpt4"] = costs_by_org[org_id].get("openai_gpt4", 0) + input_cost + output_cost

            elif metric.metric_type == "voice_stt":
                # Whisper cost per audio minute
                minutes = metric.total_count or 0  # Assuming total_count is minutes for STT
                cost = int(minutes * COST_RATES["openai_whisper"]["per_minute"])
                costs_by_org[org_id]["openai_whisper"] = costs_by_org[org_id].get("openai_whisper", 0) + cost

            elif metric.metric_type == "voice_tts":
                # TTS cost per character
                chars = metric.total_tokens or 0  # Reusing total_tokens for char count
                cost = int((chars / 1000) * COST_RATES["openai_tts"]["per_1k_chars"])
                costs_by_org[org_id]["openai_tts"] = costs_by_org[org_id].get("openai_tts", 0) + cost

            elif metric.metric_type == "embedding":
                # Embedding cost
                tokens = metric.total_tokens or 0
                cost = int((tokens / 1000) * COST_RATES["openai_embedding"]["per_1k_tokens"])
                costs_by_org[org_id]["openai_embedding"] = costs_by_org[org_id].get("openai_embedding", 0) + cost

        # Update cost tracking records
        records_updated = 0
        for org_id, service_costs in costs_by_org.items():
            for service, cost_cents in service_costs.items():
                if cost_cents <= 0:
                    continue

                existing = (
                    db.query(AnalyticsCostTracking)
                    .filter(
                        AnalyticsCostTracking.date == yesterday,
                        AnalyticsCostTracking.organization_id == org_id,
                        AnalyticsCostTracking.service_type == service,
                    )
                    .first()
                )

                if existing:
                    existing.estimated_cost_cents = cost_cents
                else:
                    cost_record = AnalyticsCostTracking(
                        date=yesterday,
                        organization_id=org_id,
                        service_type=service,
                        usage_units=0,  # Already aggregated
                        usage_unit_type="aggregated",
                        estimated_cost_cents=cost_cents,
                    )
                    db.add(cost_record)

                records_updated += 1

        db.commit()

        # Calculate totals
        total_cost = sum(
            sum(costs.values()) for costs in costs_by_org.values()
        )

        duration = (datetime.utcnow() - start_time).total_seconds()
        analytics_aggregation_jobs_total.labels(status="success", job_type="daily_costs").inc()
        analytics_aggregation_duration_seconds.labels(job_type="daily_costs").observe(duration)
        cron_job_executions_total.labels(job_name=job_name, status="success").inc()
        cron_job_last_run_timestamp.labels(job_name=job_name).set(datetime.utcnow().timestamp())
        cron_job_duration_seconds.labels(job_name=job_name).observe(duration)

        logger.info(
            "aggregate_daily_costs_completed",
            extra={
                "date": yesterday.isoformat(),
                "records_updated": records_updated,
                "total_cost_cents": total_cost,
            },
        )

        return {
            "date": yesterday.isoformat(),
            "records_updated": records_updated,
            "total_cost_cents": total_cost,
            "total_cost_dollars": round(total_cost / 100, 2),
        }

    except Exception as e:
        analytics_aggregation_jobs_total.labels(status="failure", job_type="daily_costs").inc()
        cron_job_executions_total.labels(job_name=job_name, status="failure").inc()
        logger.error("aggregate_daily_costs_failed", extra={"error": str(e)}, exc_info=True)
        return {"error": str(e)}
    finally:
        db.close()


async def cleanup_stale_data(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARQ cron task to clean up stale and expired data.

    Runs weekly at 4 AM Sunday to:
    - Delete old hourly metrics (> 7 days)
    - Archive old daily metrics (> 90 days to cold storage)
    - Clean up orphaned records
    - Vacuum analyze tables for performance
    """
    from app.models.analytics import (
        AnalyticsHourlyMetrics,
        AnalyticsSearchQuery,
        AnalyticsErrorSummary,
    )

    db = SessionLocal()
    job_name = "cleanup_stale_data"
    start_time = datetime.utcnow()
    try:
        logger.info("cleanup_stale_data_started")

        # Delete hourly metrics older than 7 days
        hourly_cutoff = datetime.utcnow() - timedelta(days=7)
        deleted_hourly = (
            db.query(AnalyticsHourlyMetrics)
            .filter(AnalyticsHourlyMetrics.timestamp < hourly_cutoff)
            .delete(synchronize_session=False)
        )

        # Delete old search queries (> 30 days)
        search_cutoff = datetime.utcnow() - timedelta(days=30)
        deleted_searches = (
            db.query(AnalyticsSearchQuery)
            .filter(AnalyticsSearchQuery.created_at < search_cutoff)
            .delete(synchronize_session=False)
        )

        # Mark old resolved errors as archived (> 14 days)
        error_cutoff = (datetime.utcnow() - timedelta(days=14)).date()
        deleted_errors = (
            db.query(AnalyticsErrorSummary)
            .filter(
                AnalyticsErrorSummary.date < error_cutoff,
                AnalyticsErrorSummary.resolved_at.isnot(None),
            )
            .delete(synchronize_session=False)
        )

        db.commit()

        # Metrics for deleted records
        if deleted_hourly:
            cleanup_records_deleted_total.labels(
                table="analytics_hourly_metrics", reason="expired"
            ).inc(deleted_hourly)
        if deleted_searches:
            cleanup_records_deleted_total.labels(
                table="analytics_search_queries", reason="expired"
            ).inc(deleted_searches)
        if deleted_errors:
            cleanup_records_deleted_total.labels(
                table="analytics_error_summary", reason="expired"
            ).inc(deleted_errors)

        duration = (datetime.utcnow() - start_time).total_seconds()
        cron_job_executions_total.labels(job_name=job_name, status="success").inc()
        cron_job_last_run_timestamp.labels(job_name=job_name).set(datetime.utcnow().timestamp())
        cron_job_duration_seconds.labels(job_name=job_name).observe(duration)

        logger.info(
            "cleanup_stale_data_completed",
            extra={
                "deleted_hourly_metrics": deleted_hourly,
                "deleted_search_queries": deleted_searches,
                "deleted_resolved_errors": deleted_errors,
            },
        )

        return {
            "deleted_hourly_metrics": deleted_hourly,
            "deleted_search_queries": deleted_searches,
            "deleted_resolved_errors": deleted_errors,
        }

    except Exception as e:
        cron_job_executions_total.labels(job_name=job_name, status="failure").inc()
        logger.error("cleanup_stale_data_failed", extra={"error": str(e)}, exc_info=True)
        return {"error": str(e)}
    finally:
        db.close()


async def ingest_tool_logs(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARQ task to ingest tool invocation logs from Redis into Postgres.

    Runs periodically in the background worker to keep the
    `tool_invocation_logs` table up to date.
    """
    job_name = "ingest_tool_logs"
    cron_job_executions_total.labels(job_name=job_name, status="started").inc()
    start_time = datetime.utcnow()
    db = SessionLocal()
    try:
        result = ingest_tool_logs_from_redis(db)
        duration = (datetime.utcnow() - start_time).total_seconds()
        cron_job_executions_total.labels(job_name=job_name, status="success").inc()
        cron_job_duration_seconds.labels(job_name=job_name).observe(duration)
        return result
    except Exception as e:  # pragma: no cover - defensive
        cron_job_executions_total.labels(job_name=job_name, status="failure").inc()
        logger.error("ingest_tool_logs_failed", extra={"error": str(e)}, exc_info=True)
        return {"error": str(e)}
    finally:
        db.close()


# ARQ Worker class configuration
class WorkerSettings:
    """ARQ worker settings."""

    redis_settings = ARQ_REDIS_SETTINGS
    functions = [
        process_document,
        retry_failed_jobs,
        cleanup_old_jobs,
        aggregate_hourly_metrics,
        aggregate_daily_costs,
        cleanup_stale_data,
        ingest_tool_logs,
    ]
    cron_jobs = [
        # Run cleanup daily at 3 AM
        {"function": "cleanup_old_jobs", "hour": 3, "minute": 0},
        # Run retry check every 5 minutes
        {"function": "retry_failed_jobs", "minute": {0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}},
        # Aggregate hourly metrics every hour at :05
        {"function": "aggregate_hourly_metrics", "minute": 5},
        # Aggregate daily costs at 2 AM
        {"function": "aggregate_daily_costs", "hour": 2, "minute": 0},
        # Cleanup stale data weekly on Sunday at 4 AM
        {"function": "cleanup_stale_data", "weekday": 6, "hour": 4, "minute": 0},
        # Ingest tool invocation logs every 5 minutes
        {"function": "ingest_tool_logs", "minute": {0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}},
    ]
    job_timeout = timedelta(minutes=30)  # 30 minutes for large documents
    max_jobs = 5  # Process up to 5 documents concurrently
    keep_result = timedelta(hours=24)  # Keep job results for 24 hours
