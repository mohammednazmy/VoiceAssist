"""ARQ Worker for async document processing.

This script runs the ARQ worker to process queued document upload tasks.

Usage:
    python worker.py

The worker will process documents from the Redis queue using the settings
defined in app.services.document_queue.WorkerSettings.

Environment:
    Requires all environment variables from .env to be set, including:
    - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
    - OPENAI_API_KEY
    - QDRANT_URL
"""

from app.core.logging import get_logger
from app.services.document_queue import WorkerSettings
from arq import run_worker

logger = get_logger(__name__)


def main():
    """Run the ARQ worker."""
    logger.info(
        "Starting ARQ worker for document processing",
        extra={
            "redis_host": WorkerSettings.redis_settings.host,
            "redis_port": WorkerSettings.redis_settings.port,
            "max_jobs": WorkerSettings.max_jobs,
        },
    )

    # Run the worker with the WorkerSettings configuration
    run_worker(WorkerSettings)


if __name__ == "__main__":
    main()
