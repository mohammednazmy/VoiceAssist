"""
Tool invocation log ingestion service.

Consumes tool invocation logs from Redis (ephemeral, PHI‑redacted) and
persists them into the Postgres `tool_invocation_logs` table for
longer-term analytics, including organization-aware dashboards.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.database import redis_client
from app.core.logging import get_logger
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = get_logger(__name__)

# Keep this in sync with app.api.admin_tools.REDIS_TOOLS_LOGS_KEY
REDIS_TOOLS_LOGS_KEY = "voiceassist:tools:logs"


def _parse_log_entry(raw: Any) -> Optional[Dict[str, Any]]:
    """Parse a single Redis log entry, returning a dict or None on failure."""
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


def ingest_tool_logs_from_redis(
    db: Session,
    max_items: int = 500,
) -> Dict[str, Any]:
    """
    Ingest tool invocation logs from Redis into Postgres.

    This function:
    - Reads up to `max_items` most recent entries from Redis.
    - Parses each entry and inserts into `tool_invocation_logs`.
    - Uses a best-effort approach: malformed entries are skipped.
    - Deletes successfully ingested entries from the Redis list.

    Args:
        db: SQLAlchemy Session
        max_items: Maximum number of items to ingest in one run

    Returns:
        Dict with ingestion statistics.
    """
    # Fetch up to max_items entries from Redis (most recent first)
    raw_entries = redis_client.lrange(REDIS_TOOLS_LOGS_KEY, 0, max_items - 1) or []
    if not raw_entries:
        return {"ingested": 0, "skipped": 0, "remaining": 0}

    ingested = 0
    skipped = 0

    for raw in raw_entries:
        entry = _parse_log_entry(raw)
        if not entry:
            skipped += 1
            continue

        # Map Redis log fields to DB columns. Keep only non-PHI metadata.
        try:
            user_email = entry.get("user_email")
            organization_id = entry.get("organization_id")

            insert_stmt = text(
                """
                INSERT INTO tool_invocation_logs (
                    user_id,
                    session_id,
                    tool_name,
                    tool_category,
                    arguments,
                    result,
                    status,
                    error_message,
                    error_type,
                    duration_ms,
                    retry_count,
                    mode,
                    calendar_provider,
                    model_used,
                    trace_id,
                    created_at,
                    created_date,
                    organization_id
                )
                VALUES (
                    :user_id,
                    :session_id,
                    :tool_name,
                    :tool_category,
                    :arguments,
                    :result,
                    :status,
                    :error_message,
                    :error_type,
                    :duration_ms,
                    :retry_count,
                    :mode,
                    :calendar_provider,
                    :model_used,
                    :trace_id,
                    :created_at,
                    :created_date,
                    :organization_id
                )
                """
            )

            created_at_str = entry.get("created_at")
            try:
                created_at = (
                    datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                    if created_at_str
                    else datetime.utcnow()
                )
            except Exception:
                created_at = datetime.utcnow()

            params = {
                "user_id": user_email or "",  # In this environment we store email as user_id surrogate
                "session_id": entry.get("session_id"),
                "tool_name": entry.get("tool_name"),
                "tool_category": None,
                "arguments": entry.get("arguments"),
                "result": None,
                "status": entry.get("status") or "completed",
                "error_message": entry.get("error_message"),
                "error_type": None,
                "duration_ms": entry.get("duration_ms"),
                "retry_count": 0,
                "mode": entry.get("mode") or "voice",
                "calendar_provider": None,
                "model_used": None,
                "trace_id": entry.get("call_id"),
                "created_at": created_at,
                "created_date": created_at.date(),
                "organization_id": organization_id,
            }

            db.execute(insert_stmt, params)
            ingested += 1
        except Exception as exc:
            skipped += 1
            logger.warning(
                "tool_log_ingest_failed",
                extra={"error": str(exc), "raw_entry": str(entry)[:200]},
            )

    # Commit all successful inserts in a single transaction
    db.commit()

    # Trim ingested entries from Redis list
    redis_client.ltrim(REDIS_TOOLS_LOGS_KEY, ingested, -1)

    remaining = redis_client.llen(REDIS_TOOLS_LOGS_KEY)

    logger.info(
        "tool_log_ingestion_complete",
        extra={"ingested": ingested, "skipped": skipped, "remaining": remaining},
    )

    return {"ingested": ingested, "skipped": skipped, "remaining": remaining}

