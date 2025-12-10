"""Database Query Profiler for Performance Monitoring.

This module provides SQLAlchemy event listeners to track and log slow queries,
detect N+1 query patterns, and collect Prometheus metrics for database performance.

Features:
- Automatic slow query detection (configurable threshold)
- N+1 query pattern detection
- Prometheus metrics for query performance
- Query execution time tracking
- Connection pool monitoring integration

Usage:
    from app.core.query_profiler import QueryProfiler
    from app.core.database import engine

    # Initialize profiler with custom threshold
    profiler = QueryProfiler(slow_query_threshold_ms=100)
    profiler.setup(engine)
"""

from __future__ import annotations

import time
from collections import defaultdict
from contextlib import contextmanager
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.logging import get_logger
from prometheus_client import Counter, Gauge, Histogram
from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = get_logger(__name__)


# Prometheus Metrics
query_duration_histogram = Histogram(
    "db_query_duration_seconds",
    "Database query execution time in seconds",
    ["query_type"],
    buckets=[0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

slow_queries_total = Counter("db_slow_queries_total", "Total number of slow database queries", ["query_type"])

query_count_total = Counter("db_query_count_total", "Total number of database queries executed", ["query_type"])

n_plus_one_warnings_total = Counter(
    "db_n_plus_one_warnings_total",
    "Total number of potential N+1 query pattern warnings",
)

active_queries_gauge = Gauge("db_active_queries", "Number of currently executing database queries")


class QueryProfiler:
    """Database query profiler with slow query detection and N+1 detection.

    This class sets up SQLAlchemy event listeners to monitor query performance,
    detect slow queries, and identify potential N+1 query patterns.

    Attributes:
        slow_query_threshold_ms: Threshold in milliseconds for slow query warnings
        n_plus_one_threshold: Number of similar queries to trigger N+1 warning
        enabled: Whether profiling is enabled
    """

    def __init__(
        self,
        slow_query_threshold_ms: int = 100,
        n_plus_one_threshold: int = 10,
        enabled: bool = True,
    ):
        """Initialize query profiler.

        Args:
            slow_query_threshold_ms: Queries taking longer than this are logged as slow
            n_plus_one_threshold: Number of similar queries to trigger N+1 warning
            enabled: Whether to enable profiling (can be disabled in production)
        """
        self.slow_query_threshold_ms = slow_query_threshold_ms
        self.slow_query_threshold_sec = slow_query_threshold_ms / 1000.0
        self.n_plus_one_threshold = n_plus_one_threshold
        self.enabled = enabled

        # Track query patterns for N+1 detection
        self._query_patterns: Dict[str, int] = defaultdict(int)
        self._request_query_count: Dict[str, int] = defaultdict(int)

        self.logger = get_logger(__name__)

    def setup(self, engine: Engine) -> None:
        """Set up SQLAlchemy event listeners on the engine.

        Args:
            engine: SQLAlchemy engine to monitor
        """
        if not self.enabled:
            self.logger.info("Query profiler is disabled")
            return

        # Listen for query execution
        event.listen(engine, "before_cursor_execute", self._before_cursor_execute)
        event.listen(engine, "after_cursor_execute", self._after_cursor_execute)

        # Listen for connection events
        event.listen(engine, "connect", self._on_connect)
        event.listen(engine, "checkout", self._on_checkout)
        event.listen(engine, "checkin", self._on_checkin)

        self.logger.info(
            f"Query profiler enabled (slow threshold: {self.slow_query_threshold_ms}ms, "
            f"N+1 threshold: {self.n_plus_one_threshold})"
        )

    def _before_cursor_execute(
        self,
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        """Event listener called before query execution.

        Records the start time for query duration calculation.
        """
        conn.info.setdefault("query_start_time", []).append(time.time())
        active_queries_gauge.inc()

    def _after_cursor_execute(
        self,
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        """Event listener called after query execution.

        Calculates query duration, logs slow queries, and updates metrics.
        """
        active_queries_gauge.dec()

        # Calculate query duration
        start_time = conn.info["query_start_time"].pop()
        duration = time.time() - start_time

        # Extract query type (SELECT, INSERT, UPDATE, DELETE)
        query_type = self._extract_query_type(statement)

        # Update metrics
        query_duration_histogram.labels(query_type=query_type).observe(duration)
        query_count_total.labels(query_type=query_type).inc()

        # Check for slow query
        if duration > self.slow_query_threshold_sec:
            self._log_slow_query(statement, parameters, duration, query_type)
            slow_queries_total.labels(query_type=query_type).inc()

        # Track query patterns for N+1 detection
        self._track_query_pattern(statement, query_type)

    def _extract_query_type(self, statement: str) -> str:
        """Extract the query type from SQL statement.

        Args:
            statement: SQL statement string

        Returns:
            Query type (SELECT, INSERT, UPDATE, DELETE, OTHER)
        """
        statement_upper = statement.strip().upper()

        if statement_upper.startswith("SELECT"):
            return "SELECT"
        elif statement_upper.startswith("INSERT"):
            return "INSERT"
        elif statement_upper.startswith("UPDATE"):
            return "UPDATE"
        elif statement_upper.startswith("DELETE"):
            return "DELETE"
        elif statement_upper.startswith("BEGIN"):
            return "BEGIN"
        elif statement_upper.startswith("COMMIT"):
            return "COMMIT"
        elif statement_upper.startswith("ROLLBACK"):
            return "ROLLBACK"
        else:
            return "OTHER"

    def _log_slow_query(self, statement: str, parameters: Any, duration: float, query_type: str) -> None:
        """Log details of a slow query.

        Args:
            statement: SQL statement
            parameters: Query parameters
            duration: Query execution time in seconds
            query_type: Type of query (SELECT, INSERT, etc.)
        """
        duration_ms = duration * 1000

        # Truncate long queries for logging
        max_length = 500
        truncated_statement = statement if len(statement) <= max_length else statement[:max_length] + "..."

        self.logger.warning(
            f"SLOW QUERY DETECTED [{query_type}] ({duration_ms:.2f}ms)\n"
            f"Query: {truncated_statement}\n"
            f"Parameters: {parameters if parameters else 'None'}",
            extra={
                "query_type": query_type,
                "duration_ms": duration_ms,
                "threshold_ms": self.slow_query_threshold_ms,
            },
        )

    def _track_query_pattern(self, statement: str, query_type: str) -> None:
        """Track query patterns to detect potential N+1 queries.

        N+1 queries occur when a loop executes similar queries repeatedly,
        typically indicating missing eager loading or join optimization.

        Args:
            statement: SQL statement
            query_type: Type of query
        """
        # Only track SELECT queries for N+1 detection
        if query_type != "SELECT":
            return

        # Create a normalized pattern by removing parameter values
        # This helps identify similar queries
        pattern = self._normalize_query_pattern(statement)

        # Track how many times this pattern appears
        self._query_patterns[pattern] += 1

        # Check if we've seen this pattern too many times
        count = self._query_patterns[pattern]
        if count == self.n_plus_one_threshold:
            self._log_n_plus_one_warning(pattern, count)
            n_plus_one_warnings_total.inc()

    def _normalize_query_pattern(self, statement: str) -> str:
        """Normalize a query to create a pattern for N+1 detection.

        This removes specific values but keeps the structure of the query.

        Args:
            statement: SQL statement

        Returns:
            Normalized query pattern
        """
        # Simple normalization: extract table and column names
        # More sophisticated pattern matching could be added
        statement_upper = statement.strip().upper()

        # Extract the main components
        if "FROM" in statement_upper:
            # Find table name
            from_idx = statement_upper.find("FROM")
            where_idx = statement_upper.find("WHERE", from_idx)

            if where_idx > 0:
                table_part = statement_upper[from_idx:where_idx].strip()
            else:
                table_part = (
                    statement_upper[from_idx:].split()[1] if len(statement_upper[from_idx:].split()) > 1 else ""
                )

            return f"SELECT FROM {table_part}"  # nosec B608 - logging description, not executed SQL

        return statement_upper[:100]  # Fallback to first 100 chars

    def _log_n_plus_one_warning(self, pattern: str, count: int) -> None:
        """Log a warning about potential N+1 query pattern.

        Args:
            pattern: Query pattern
            count: Number of times this pattern was executed
        """
        self.logger.warning(
            f"POTENTIAL N+1 QUERY DETECTED\n"
            f"Pattern executed {count} times: {pattern}\n"
            f"Consider using eager loading (selectinload/joinedload) or joins to optimize.",
            extra={
                "pattern": pattern,
                "execution_count": count,
                "threshold": self.n_plus_one_threshold,
            },
        )

    def _on_connect(self, dbapi_conn: Any, connection_record: Any) -> None:
        """Event listener for new database connections."""
        self.logger.debug("New database connection established")

    def _on_checkout(self, dbapi_conn: Any, connection_record: Any, connection_proxy: Any) -> None:
        """Event listener for connection checkout from pool."""
        pass  # Could track connection checkout time if needed

    def _on_checkin(self, dbapi_conn: Any, connection_record: Any) -> None:
        """Event listener for connection checkin to pool."""
        pass  # Could track connection usage duration if needed

    def reset_pattern_tracking(self) -> None:
        """Reset query pattern tracking.

        Should be called periodically (e.g., per request) to prevent
        memory growth and provide per-request N+1 detection.
        """
        self._query_patterns.clear()
        self._request_query_count.clear()

    @contextmanager
    def track_request_queries(self, request_id: str):
        """Context manager to track queries for a specific request.

        Usage:
            with profiler.track_request_queries("req-123"):
                # Execute queries
                pass

        Args:
            request_id: Unique request identifier

        Yields:
            None
        """
        self.reset_pattern_tracking()

        try:
            yield
        finally:
            # Log summary for request
            if self._query_patterns:
                total_queries = sum(self._query_patterns.values())
                unique_patterns = len(self._query_patterns)

                self.logger.debug(
                    f"Request {request_id}: {total_queries} queries " f"({unique_patterns} unique patterns)",
                    extra={
                        "request_id": request_id,
                        "total_queries": total_queries,
                        "unique_patterns": unique_patterns,
                    },
                )

            self.reset_pattern_tracking()


# Global profiler instance
_global_profiler: Optional[QueryProfiler] = None


def get_query_profiler() -> QueryProfiler:
    """Get the global query profiler instance.

    Returns:
        Global QueryProfiler instance
    """
    global _global_profiler

    if _global_profiler is None:
        # Get configuration from settings
        slow_threshold = getattr(settings, "SLOW_QUERY_THRESHOLD_MS", 100)
        n_plus_one_threshold = getattr(settings, "N_PLUS_ONE_THRESHOLD", 10)
        profiler_enabled = getattr(settings, "QUERY_PROFILER_ENABLED", True)

        _global_profiler = QueryProfiler(
            slow_query_threshold_ms=slow_threshold,
            n_plus_one_threshold=n_plus_one_threshold,
            enabled=profiler_enabled,
        )

    return _global_profiler


def setup_query_profiling(engine: Engine) -> None:
    """Set up query profiling for the given engine.

    This should be called during application startup.

    Args:
        engine: SQLAlchemy engine to profile
    """
    profiler = get_query_profiler()
    profiler.setup(engine)
    logger.info("Query profiling initialized")
