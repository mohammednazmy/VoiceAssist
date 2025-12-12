"""
Tool Analytics Service

Provides analytics and insights on tool/function call usage across
Voice and Chat modes.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ToolAnalyticsService:
    """
    Service for analyzing tool invocation logs.

    Provides metrics on:
    - Tool usage counts and trends
    - Success/failure rates
    - Latency statistics
    - User/session breakdowns
    - Mode comparisons (voice vs chat)
    """

    async def get_tool_usage_summary(
        self,
        db_session: AsyncSession,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get summary statistics for tool usage.

        Args:
            db_session: Database session
            start_date: Optional start date filter
            end_date: Optional end date filter
            user_id: Optional user ID filter

        Returns:
            Dict with summary statistics
        """
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        # Build query with filters
        filters = ["created_at >= :start_date", "created_at <= :end_date"]
        params = {"start_date": start_date, "end_date": end_date}

        if user_id:
            filters.append("user_id = :user_id")
            params["user_id"] = user_id

        if organization_id:
            filters.append("organization_id = :organization_id")
            params["organization_id"] = organization_id

        where_clause = " AND ".join(filters)

        # Get overall statistics
        # nosec B608 - where_clause is built from hardcoded filter strings, all values are parameterized
        stats_query = f"""
            SELECT
                COUNT(*) as total_calls,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_calls,
                COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_calls,
                AVG(duration_ms) as avg_duration_ms,
                MIN(duration_ms) as min_duration_ms,
                MAX(duration_ms) as max_duration_ms,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration_ms,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT session_id) as unique_sessions
            FROM tool_invocation_logs
            WHERE {where_clause}
        """

        result = await db_session.execute(text(stats_query), params)
        row = result.fetchone()

        if not row:
            return {
                "total_calls": 0,
                "successful_calls": 0,
                "failed_calls": 0,
                "success_rate": 0.0,
                "avg_duration_ms": 0,
                "median_duration_ms": 0,
                "p95_duration_ms": 0,
                "unique_users": 0,
                "unique_sessions": 0,
            }

        total = row.total_calls or 0
        successful = row.successful_calls or 0

        return {
            "total_calls": total,
            "successful_calls": successful,
            "failed_calls": row.failed_calls or 0,
            "success_rate": (successful / total * 100) if total > 0 else 0.0,
            "avg_duration_ms": round(row.avg_duration_ms or 0, 2),
            "min_duration_ms": row.min_duration_ms or 0,
            "max_duration_ms": row.max_duration_ms or 0,
            "median_duration_ms": round(row.median_duration_ms or 0, 2),
            "p95_duration_ms": round(row.p95_duration_ms or 0, 2),
            "unique_users": row.unique_users or 0,
            "unique_sessions": row.unique_sessions or 0,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }

    async def get_tool_breakdown(
        self,
        db_session: AsyncSession,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get usage breakdown by tool name.

        Returns list of tools with their usage stats sorted by call count.
        """
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        filters = ["created_at >= :start_date", "created_at <= :end_date"]
        params = {"start_date": start_date, "end_date": end_date}

        if organization_id:
            filters.append("organization_id = :organization_id")
            params["organization_id"] = organization_id

        where_clause = " AND ".join(filters)

        # nosec B608 - where_clause is built from fixed filter segments; values are parameterized
        query = f"""
            SELECT
                tool_name,
                COUNT(*) as call_count,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
                COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
                AVG(duration_ms) as avg_duration_ms,
                COUNT(DISTINCT user_id) as unique_users
            FROM tool_invocation_logs
            WHERE {where_clause}
            GROUP BY tool_name
            ORDER BY call_count DESC
        """

        result = await db_session.execute(text(query), params)
        rows = result.fetchall()

        return [
            {
                "tool_name": row.tool_name,
                "call_count": row.call_count,
                "success_count": row.success_count,
                "error_count": row.error_count,
                "success_rate": round(
                    ((row.success_count / row.call_count * 100) if row.call_count > 0 else 0),
                    2,
                ),
                "avg_duration_ms": round(row.avg_duration_ms or 0, 2),
                "unique_users": row.unique_users,
            }
            for row in rows
        ]

    async def get_mode_comparison(
        self,
        db_session: AsyncSession,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        organization_id: Optional[str] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Compare tool usage between voice and chat modes.
        """
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        filters = ["created_at >= :start_date", "created_at <= :end_date"]
        params = {"start_date": start_date, "end_date": end_date}

        if organization_id:
            filters.append("organization_id = :organization_id")
            params["organization_id"] = organization_id

        where_clause = " AND ".join(filters)

        # nosec B608 - where_clause is built from fixed filter fragments; values are parameterized
        query = f"""
            SELECT
                mode,
                COUNT(*) as call_count,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
                AVG(duration_ms) as avg_duration_ms,
                COUNT(DISTINCT user_id) as unique_users
            FROM tool_invocation_logs
            WHERE {where_clause}
            GROUP BY mode
        """

        result = await db_session.execute(text(query), params)
        rows = result.fetchall()

        comparison = {}
        for row in rows:
            mode = row.mode or "unknown"
            comparison[mode] = {
                "call_count": row.call_count,
                "success_count": row.success_count,
                "success_rate": round(
                    ((row.success_count / row.call_count * 100) if row.call_count > 0 else 0),
                    2,
                ),
                "avg_duration_ms": round(row.avg_duration_ms or 0, 2),
                "unique_users": row.unique_users,
            }

        return comparison

    async def get_daily_trend(
        self,
        db_session: AsyncSession,
        days: int = 30,
        tool_name: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get daily tool usage trend.

        Args:
            db_session: Database session
            days: Number of days to look back
            tool_name: Optional filter for specific tool

        Returns:
            List of daily usage data points
        """
        start_date = datetime.utcnow() - timedelta(days=days)

        filters = ["created_at >= :start_date"]
        params = {"start_date": start_date}

        if tool_name:
            filters.append("tool_name = :tool_name")
            params["tool_name"] = tool_name

        if organization_id:
            filters.append("organization_id = :organization_id")
            params["organization_id"] = organization_id

        where_clause = " AND ".join(filters)

        # nosec B608 - where_clause is built from hardcoded filter strings, all values are parameterized
        query = f"""
            SELECT
                DATE(created_at) as date,
                COUNT(*) as call_count,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
                AVG(duration_ms) as avg_duration_ms
            FROM tool_invocation_logs
            WHERE {where_clause}
            GROUP BY DATE(created_at)
            ORDER BY date
        """

        result = await db_session.execute(text(query), params)
        rows = result.fetchall()

        return [
            {
                "date": row.date.isoformat(),
                "call_count": row.call_count,
                "success_count": row.success_count,
                "success_rate": round(
                    ((row.success_count / row.call_count * 100) if row.call_count > 0 else 0),
                    2,
                ),
                "avg_duration_ms": round(row.avg_duration_ms or 0, 2),
            }
            for row in rows
        ]

    async def get_error_analysis(
        self,
        db_session: AsyncSession,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 20,
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get analysis of tool errors.

        Returns most common error types and their frequency.
        """
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=7)
        if not end_date:
            end_date = datetime.utcnow()

        filters = [
            "status = 'error'",
            "created_at >= :start_date",
            "created_at <= :end_date",
        ]
        params = {"start_date": start_date, "end_date": end_date, "limit": limit}

        if organization_id:
            filters.append("organization_id = :organization_id")
            params["organization_id"] = organization_id

        where_clause = " AND ".join(filters)

        # nosec B608 - where_clause composed from fixed segments, values parameterized
        query = f"""
            SELECT
                tool_name,
                error_type,
                error_message,
                COUNT(*) as error_count,
                MIN(created_at) as first_seen,
                MAX(created_at) as last_seen
            FROM tool_invocation_logs
            WHERE {where_clause}
            GROUP BY tool_name, error_type, error_message
            ORDER BY error_count DESC
            LIMIT :limit
        """

        result = await db_session.execute(text(query), params)
        rows = result.fetchall()

        return [
            {
                "tool_name": row.tool_name,
                "error_type": row.error_type,
                "error_message": row.error_message[:200] if row.error_message else None,
                "error_count": row.error_count,
                "first_seen": row.first_seen.isoformat() if row.first_seen else None,
                "last_seen": row.last_seen.isoformat() if row.last_seen else None,
            }
            for row in rows
        ]

    async def get_user_activity(
        self,
        db_session: AsyncSession,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get tool usage activity for a specific user.
        """
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        # Get summary for user
        summary_query = """
            SELECT
                COUNT(*) as total_calls,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_calls,
                AVG(duration_ms) as avg_duration_ms,
                COUNT(DISTINCT session_id) as unique_sessions,
                COUNT(DISTINCT tool_name) as tools_used
            FROM tool_invocation_logs
            WHERE user_id = :user_id
              AND created_at >= :start_date
              AND created_at <= :end_date
        """

        result = await db_session.execute(
            text(summary_query),
            {"user_id": user_id, "start_date": start_date, "end_date": end_date},
        )
        summary_row = result.fetchone()

        # Get tool breakdown for user
        tools_query = """
            SELECT
                tool_name,
                COUNT(*) as call_count,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count
            FROM tool_invocation_logs
            WHERE user_id = :user_id
              AND created_at >= :start_date
              AND created_at <= :end_date
            GROUP BY tool_name
            ORDER BY call_count DESC
        """

        result = await db_session.execute(
            text(tools_query),
            {"user_id": user_id, "start_date": start_date, "end_date": end_date},
        )
        tool_rows = result.fetchall()

        return {
            "user_id": user_id,
            "total_calls": summary_row.total_calls if summary_row else 0,
            "successful_calls": summary_row.successful_calls if summary_row else 0,
            "success_rate": round(
                (
                    (summary_row.successful_calls / summary_row.total_calls * 100)
                    if summary_row and summary_row.total_calls > 0
                    else 0
                ),
                2,
            ),
            "avg_duration_ms": round(
                (summary_row.avg_duration_ms if summary_row and summary_row.avg_duration_ms else 0),
                2,
            ),
            "unique_sessions": summary_row.unique_sessions if summary_row else 0,
            "tools_used": summary_row.tools_used if summary_row else 0,
            "tool_breakdown": [
                {
                    "tool_name": row.tool_name,
                    "call_count": row.call_count,
                    "success_count": row.success_count,
                }
                for row in tool_rows
            ],
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }

    async def get_recent_invocations(
        self,
        db_session: AsyncSession,
        limit: int = 50,
        tool_name: Optional[str] = None,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get recent tool invocations for debugging/monitoring.
        """
        filters = ["1=1"]
        params = {"limit": limit}

        if tool_name:
            filters.append("tool_name = :tool_name")
            params["tool_name"] = tool_name

        if user_id:
            filters.append("user_id = :user_id")
            params["user_id"] = user_id

        if status:
            filters.append("status = :status")
            params["status"] = status

        if organization_id:
            filters.append("organization_id = :organization_id")
            params["organization_id"] = organization_id

        where_clause = " AND ".join(filters)

        # nosec B608 - where_clause is built from hardcoded filter strings, all values are parameterized
        query = f"""
            SELECT
                id, tool_name, arguments, result, status, error_type, error_message,
                duration_ms, mode, user_id, session_id, trace_id, created_at
            FROM tool_invocation_logs
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit
        """

        result = await db_session.execute(text(query), params)
        rows = result.fetchall()

        return [
            {
                "id": str(row.id),
                "tool_name": row.tool_name,
                "arguments": row.arguments,
                "result_preview": (str(row.result)[:200] if row.result else None),
                "status": row.status,
                "error_type": row.error_type,
                "error_message": row.error_message,
                "duration_ms": row.duration_ms,
                "mode": row.mode,
                "user_id": (row.user_id[:8] + "..." if row.user_id and len(row.user_id) > 8 else row.user_id),
                "session_id": (
                    row.session_id[:8] + "..." if row.session_id and len(row.session_id) > 8 else row.session_id
                ),
                "trace_id": row.trace_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]


# Global singleton instance
tool_analytics_service = ToolAnalyticsService()
