"""Feature Flags Real-time API (Phase 3 - Real-time Propagation).

Provides Server-Sent Events (SSE) for real-time feature flag updates.
Clients can subscribe to flag changes and receive push notifications
when flags are updated, avoiding polling overhead.

Usage:
    # Subscribe to all flag changes
    curl -N http://localhost:5000/api/flags/stream

    # Subscribe to specific flags
    curl -N "http://localhost:5000/api/flags/stream?flags=ui.dark_mode,backend.rag_strategy"

Events:
    - connected: Initial connection with current flag state and version
    - flag_update: Single flag was updated
    - flags_bulk_update: Multiple flags changed (e.g., import)
    - heartbeat: Keep-alive ping every 30 seconds
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.api_envelope import success_response
from app.core.database import get_db, redis_client
from app.core.dependencies import get_optional_current_user
from app.core.logging import get_logger
from app.core.metrics import (
    sse_clients_notified,
    sse_connection_duration_seconds,
    sse_connections_active,
    sse_connections_total,
    sse_event_delivery_latency_seconds,
    sse_events_dropped_total,
    sse_events_replayed_total,
    sse_flag_update_rate,
    sse_flag_updates_broadcast_total,
    sse_history_incomplete_total,
    sse_reconnects_total,
    sse_version_lag,
)
from app.models.user import User
from app.services.feature_flags import feature_flag_service
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/flags", tags=["feature-flags", "realtime"])
logger = get_logger(__name__)

# Redis keys for pub/sub
FLAG_UPDATE_CHANNEL = "feature_flags:updates"
FLAG_VERSION_KEY = "feature_flags:version"
FLAG_EVENT_HISTORY_KEY = "feature_flags:events"  # Sorted set for global event history
FLAG_EVENT_HISTORY_PER_FLAG_PREFIX = "feature_flags:events:"  # Per-flag event history
CLIENT_LAST_EVENT_KEY = "feature_flags:client_last_event:"  # Per-client last event

# SSE heartbeat interval (seconds)
HEARTBEAT_INTERVAL = 30

# Event history settings (configurable)
EVENT_HISTORY_MAX_SIZE = 1000  # Maximum events to keep in global history
EVENT_HISTORY_TTL = 3600  # 1 hour TTL for event history (configurable)
EVENT_HISTORY_PER_FLAG_MAX_SIZE = 100  # Max events per flag
EVENT_HISTORY_PRUNE_THRESHOLD = 1500  # Prune when this many events accumulated


class FlagSubscriptionManager:
    """Manages SSE subscriptions for feature flag updates.

    Handles:
    - Client connection tracking
    - Flag-specific subscriptions
    - Broadcasting updates to connected clients
    - Redis pub/sub for cross-instance coordination
    - Connection duration and latency tracking
    """

    def __init__(self):
        self._connections: Dict[str, asyncio.Queue] = {}
        self._subscriptions: Dict[str, Set[str]] = {}  # connection_id -> set of flag names
        self._connection_times: Dict[str, float] = {}  # connection_id -> connect timestamp
        self._client_versions: Dict[str, int] = {}  # connection_id -> last known version
        self._version = 0
        self._lock = asyncio.Lock()
        self.logger = get_logger(__name__)

    async def connect(self, client_id: str, flag_filter: Optional[List[str]] = None) -> asyncio.Queue:
        """Register a new SSE client connection.

        Args:
            client_id: Unique client identifier
            flag_filter: Optional list of flag names to subscribe to (None = all flags)

        Returns:
            Queue for sending events to this client
        """
        async with self._lock:
            queue: asyncio.Queue = asyncio.Queue()
            self._connections[client_id] = queue
            self._subscriptions[client_id] = set(flag_filter) if flag_filter else set()
            self._connection_times[client_id] = time.time()  # Track connection start
            self._client_versions[client_id] = get_current_version()  # Initial version

            # Update metrics
            sse_connections_active.inc()
            sse_connections_total.labels(action="connect").inc()

            self.logger.info(
                f"SSE client connected: {client_id}",
                extra={"filter": flag_filter, "total_connections": len(self._connections)},
            )
            return queue

    async def disconnect(self, client_id: str) -> None:
        """Remove a client connection."""
        async with self._lock:
            if client_id in self._connections:
                del self._connections[client_id]
                # Update metrics
                sse_connections_active.dec()
                sse_connections_total.labels(action="disconnect").inc()

                # Track connection duration
                if client_id in self._connection_times:
                    duration = time.time() - self._connection_times[client_id]
                    sse_connection_duration_seconds.observe(duration)
                    del self._connection_times[client_id]

            if client_id in self._subscriptions:
                del self._subscriptions[client_id]
            if client_id in self._client_versions:
                del self._client_versions[client_id]

            self.logger.info(
                f"SSE client disconnected: {client_id}",
                extra={"total_connections": len(self._connections)},
            )

    async def broadcast_flag_update(
        self,
        flag_name: str,
        flag_data: Dict[str, Any],
        version: int,
    ) -> int:
        """Broadcast a flag update to subscribed clients.

        Args:
            flag_name: Name of the updated flag
            flag_data: Complete flag data
            version: New version number

        Returns:
            Number of clients notified
        """
        broadcast_start = time.time()

        event = {
            "event": "flag_update",
            "data": {
                "flag": flag_name,
                "value": flag_data,
                "version": version,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        }

        notified = 0
        dropped = 0
        async with self._lock:
            for client_id, queue in self._connections.items():
                # Check if client is subscribed to this flag
                subscriptions = self._subscriptions.get(client_id, set())
                if not subscriptions or flag_name in subscriptions:
                    try:
                        await queue.put(event)
                        notified += 1
                        # Update client's known version
                        self._client_versions[client_id] = version
                    except Exception as e:
                        dropped += 1
                        sse_events_dropped_total.labels(reason="queue_error").inc()
                        self.logger.warning(f"Failed to notify client {client_id}: {e}")

        # Calculate delivery latency
        delivery_latency = time.time() - broadcast_start
        sse_event_delivery_latency_seconds.labels(event_type="flag_update").observe(delivery_latency)

        # Track broadcast metrics
        sse_flag_updates_broadcast_total.labels(event_type="flag_update").inc()
        sse_flag_update_rate.labels(flag_name=flag_name).inc()  # Per-flag update rate
        sse_clients_notified.observe(notified)

        self.logger.info(
            f"Broadcast flag update: {flag_name}",
            extra={
                "version": version,
                "clients_notified": notified,
                "dropped": dropped,
                "latency_ms": delivery_latency * 1000,
            },
        )
        return notified

    async def broadcast_bulk_update(
        self,
        flags: Dict[str, Dict[str, Any]],
        version: int,
    ) -> int:
        """Broadcast multiple flag updates at once.

        Args:
            flags: Dictionary of flag_name -> flag_data
            version: New version number

        Returns:
            Number of clients notified
        """
        broadcast_start = time.time()

        event = {
            "event": "flags_bulk_update",
            "data": {
                "flags": flags,
                "version": version,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        }

        notified = 0
        dropped = 0
        async with self._lock:
            for client_id, queue in self._connections.items():
                subscriptions = self._subscriptions.get(client_id, set())
                # Check if any subscribed flags were updated
                if not subscriptions or any(f in subscriptions for f in flags.keys()):
                    try:
                        await queue.put(event)
                        notified += 1
                        # Update client's known version
                        self._client_versions[client_id] = version
                    except Exception as e:
                        dropped += 1
                        sse_events_dropped_total.labels(reason="queue_error").inc()
                        self.logger.warning(f"Failed to notify client {client_id}: {e}")

        # Calculate delivery latency
        delivery_latency = time.time() - broadcast_start
        sse_event_delivery_latency_seconds.labels(event_type="flags_bulk_update").observe(delivery_latency)

        # Track broadcast metrics
        sse_flag_updates_broadcast_total.labels(event_type="flags_bulk_update").inc()
        sse_clients_notified.observe(notified)

        # Track per-flag update rate for bulk updates
        for flag_name in flags.keys():
            sse_flag_update_rate.labels(flag_name=flag_name).inc()

        return notified

    def get_connection_count(self) -> int:
        """Get current number of connected clients."""
        return len(self._connections)

    def get_version_drift_stats(self) -> Dict[str, Any]:
        """Get version drift statistics across connected clients.

        Returns:
            Dictionary with min/max/avg drift from current version
        """
        current_version = get_current_version()
        if not self._client_versions:
            return {"min_drift": 0, "max_drift": 0, "avg_drift": 0.0, "clients": 0}

        drifts = [current_version - v for v in self._client_versions.values()]
        return {
            "min_drift": min(drifts) if drifts else 0,
            "max_drift": max(drifts) if drifts else 0,
            "avg_drift": sum(drifts) / len(drifts) if drifts else 0.0,
            "clients": len(drifts),
        }


# Global subscription manager
flag_subscription_manager = FlagSubscriptionManager()


# ============================================================================
# SSE Rate Limiter
# ============================================================================

SSE_RATE_LIMIT_WINDOW = 60  # seconds
SSE_RATE_LIMIT_MAX_CONNECTIONS = 10  # max connections per IP per window
SSE_RATE_LIMIT_KEY_PREFIX = "sse_rate_limit:"


class SSERateLimiter:
    """Rate limiter for SSE connections.

    Limits the number of SSE connections from a single IP address
    within a time window to prevent abuse.
    """

    def __init__(
        self,
        window_seconds: int = SSE_RATE_LIMIT_WINDOW,
        max_connections: int = SSE_RATE_LIMIT_MAX_CONNECTIONS,
    ):
        self.window_seconds = window_seconds
        self.max_connections = max_connections
        self.logger = get_logger(__name__)

    def _get_key(self, client_ip: str) -> str:
        """Get Redis key for rate limiting."""
        return f"{SSE_RATE_LIMIT_KEY_PREFIX}{client_ip}"

    def check_rate_limit(self, client_ip: str) -> Tuple[bool, int]:
        """Check if a client IP is within rate limits.

        Args:
            client_ip: Client IP address

        Returns:
            Tuple of (is_allowed, current_count)
        """
        if not client_ip:
            return True, 0

        try:
            key = self._get_key(client_ip)

            # Get current count
            current = redis_client.get(key)
            count = int(current) if current else 0

            if count >= self.max_connections:
                self.logger.warning(
                    f"SSE rate limit exceeded for IP: {client_ip}",
                    extra={"count": count, "limit": self.max_connections},
                )
                return False, count

            # Increment counter
            pipe = redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, self.window_seconds)
            pipe.execute()

            return True, count + 1

        except Exception as e:
            self.logger.warning(f"Rate limit check failed: {e}")
            # Allow on error to avoid blocking legitimate users
            return True, 0

    def release(self, client_ip: str) -> None:
        """Release a rate limit slot when connection closes.

        Args:
            client_ip: Client IP address
        """
        if not client_ip:
            return

        try:
            key = self._get_key(client_ip)
            # Decrement counter (but don't go below 0)
            current = redis_client.get(key)
            if current and int(current) > 0:
                redis_client.decr(key)
        except Exception as e:
            self.logger.warning(f"Rate limit release failed: {e}")


# Global rate limiter
sse_rate_limiter = SSERateLimiter()


# ============================================================================
# RBAC Helpers for SSE
# ============================================================================

# Flag visibility levels
FLAG_VISIBILITY_PUBLIC = "public"  # Anyone can see
FLAG_VISIBILITY_AUTHENTICATED = "authenticated"  # Any authenticated user
FLAG_VISIBILITY_ADMIN = "admin"  # Admin only
FLAG_VISIBILITY_INTERNAL = "internal"  # Internal flags, not exposed via SSE

# Default visibility for flags without explicit setting
DEFAULT_FLAG_VISIBILITY = FLAG_VISIBILITY_PUBLIC


def get_flag_visibility(flag_metadata: Optional[Dict[str, Any]]) -> str:
    """Get the visibility level for a flag from its metadata.

    Args:
        flag_metadata: Flag metadata dictionary

    Returns:
        Visibility level string
    """
    if not flag_metadata:
        return DEFAULT_FLAG_VISIBILITY
    return flag_metadata.get("visibility", DEFAULT_FLAG_VISIBILITY)


def user_can_access_flag(
    user: Optional[User],
    flag_metadata: Optional[Dict[str, Any]],
) -> bool:
    """Check if a user can access a flag based on visibility settings.

    Args:
        user: User object (None if unauthenticated)
        flag_metadata: Flag metadata dictionary

    Returns:
        True if user can access the flag
    """
    visibility = get_flag_visibility(flag_metadata)

    # Public flags are accessible to everyone
    if visibility == FLAG_VISIBILITY_PUBLIC:
        return True

    # Internal flags are never exposed via SSE
    if visibility == FLAG_VISIBILITY_INTERNAL:
        return False

    # Authenticated flags require a user
    if visibility == FLAG_VISIBILITY_AUTHENTICATED:
        return user is not None

    # Admin flags require admin role
    if visibility == FLAG_VISIBILITY_ADMIN:
        if user is None:
            return False
        return user.admin_role in {"admin", "viewer"}

    # Unknown visibility, default to public
    return True


async def filter_flags_for_user(
    flags: List[Any],
    user: Optional[User],
) -> List[Any]:
    """Filter a list of flags based on user permissions.

    Args:
        flags: List of flag objects
        user: User object (None if unauthenticated)

    Returns:
        Filtered list of flags the user can access
    """
    return [f for f in flags if user_can_access_flag(user, getattr(f, "flag_metadata", None))]


def get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request, handling proxies.

    Args:
        request: FastAPI request object

    Returns:
        Client IP address or None
    """
    # Check X-Forwarded-For first (set by reverse proxy)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    # Fall back to direct connection IP
    if request.client:
        return request.client.host
    return None


def get_current_version() -> int:
    """Get the current global flag version from Redis."""
    try:
        version = redis_client.get(FLAG_VERSION_KEY)
        return int(version) if version else 0
    except Exception:
        return 0


def increment_version() -> int:
    """Increment and return the new global flag version."""
    try:
        return redis_client.incr(FLAG_VERSION_KEY)
    except Exception:
        return int(time.time())


def store_event_in_history(
    event_id: int,
    event_data: Dict[str, Any],
    flag_name: Optional[str] = None,
) -> None:
    """Store an event in Redis sorted set for Last-Event-ID support.

    Stores events in both global history and per-flag history for efficient replay.

    Args:
        event_id: Monotonic event ID (version number)
        event_data: Event data to store
        flag_name: Optional flag name for per-flag storage
    """
    try:
        event_json = json.dumps(event_data)

        # Store in global history
        redis_client.zadd(FLAG_EVENT_HISTORY_KEY, {event_json: event_id})

        # Prune global history if threshold reached (check periodically)
        current_count = redis_client.zcard(FLAG_EVENT_HISTORY_KEY)
        if current_count and current_count > EVENT_HISTORY_PRUNE_THRESHOLD:
            # Keep only the most recent events
            redis_client.zremrangebyrank(FLAG_EVENT_HISTORY_KEY, 0, -EVENT_HISTORY_MAX_SIZE - 1)
            logger.debug(f"Pruned global event history from {current_count} to {EVENT_HISTORY_MAX_SIZE}")

        # Set TTL on global key
        redis_client.expire(FLAG_EVENT_HISTORY_KEY, EVENT_HISTORY_TTL)

        # Store in per-flag history if flag_name provided
        if flag_name:
            per_flag_key = f"{FLAG_EVENT_HISTORY_PER_FLAG_PREFIX}{flag_name}"
            redis_client.zadd(per_flag_key, {event_json: event_id})

            # Prune per-flag history
            per_flag_count = redis_client.zcard(per_flag_key)
            if per_flag_count and per_flag_count > EVENT_HISTORY_PER_FLAG_MAX_SIZE + 50:
                redis_client.zremrangebyrank(per_flag_key, 0, -EVENT_HISTORY_PER_FLAG_MAX_SIZE - 1)

            # Set TTL on per-flag key
            redis_client.expire(per_flag_key, EVENT_HISTORY_TTL)

    except Exception as e:
        logger.warning(f"Failed to store event in history: {e}")


def get_events_since(
    last_event_id: int,
    flag_filter: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], bool]:
    """Get all events since a given event ID.

    Used for Last-Event-ID reconnection support. Detects incomplete history
    and returns a flag indicating whether a bulk refresh is needed.

    Args:
        last_event_id: The last event ID the client received
        flag_filter: Optional list of flag names to filter to

    Returns:
        Tuple of (events, history_complete):
        - events: List of events since that ID (exclusive)
        - history_complete: True if all events could be retrieved, False if
          history was pruned and client should do bulk refresh
    """
    try:
        history_complete = True
        result = []

        # If filtering to specific flags, try per-flag history first
        if flag_filter and len(flag_filter) <= 5:
            # For small filters, use per-flag history for efficiency
            for flag_name in flag_filter:
                per_flag_key = f"{FLAG_EVENT_HISTORY_PER_FLAG_PREFIX}{flag_name}"
                events = redis_client.zrangebyscore(
                    per_flag_key,
                    f"({last_event_id}",
                    "+inf",
                    withscores=True,
                )
                for event_json, score in events:
                    try:
                        event_data = json.loads(event_json)
                        event_data["_event_id"] = int(score)
                        result.append(event_data)
                    except json.JSONDecodeError:
                        continue
        else:
            # Use global history
            events = redis_client.zrangebyscore(
                FLAG_EVENT_HISTORY_KEY,
                f"({last_event_id}",
                "+inf",
                withscores=True,
            )

            for event_json, score in events:
                try:
                    event_data = json.loads(event_json)
                    event_data["_event_id"] = int(score)

                    # Apply filter if specified
                    if flag_filter:
                        event_flag = event_data.get("flag")
                        if event_flag and event_flag not in flag_filter:
                            continue

                    result.append(event_data)
                except json.JSONDecodeError:
                    continue

        # Detect incomplete history: check if there's a gap
        if result:
            # Get the oldest event in history to detect gaps
            oldest_events = redis_client.zrangebyscore(
                FLAG_EVENT_HISTORY_KEY,
                "-inf",
                "+inf",
                start=0,
                num=1,
                withscores=True,
            )
            if oldest_events:
                oldest_event_id = int(oldest_events[0][1])
                # If client's last event is older than our oldest, history is incomplete
                if last_event_id < oldest_event_id - 1:
                    history_complete = False
                    logger.warning(
                        f"Incomplete event history: client at {last_event_id}, "
                        f"oldest available is {oldest_event_id}"
                    )

        # Sort by event_id to ensure ordering
        result.sort(key=lambda e: e.get("_event_id", 0))

        return result, history_complete
    except Exception as e:
        logger.warning(f"Failed to get events since {last_event_id}: {e}")
        return [], False


def get_history_stats() -> Dict[str, Any]:
    """Get statistics about the event history.

    Returns:
        Dictionary with history size, oldest/newest event IDs, TTL remaining
    """
    try:
        # Global history stats
        global_count = redis_client.zcard(FLAG_EVENT_HISTORY_KEY) or 0
        global_ttl = redis_client.ttl(FLAG_EVENT_HISTORY_KEY)

        oldest_id = None
        newest_id = None

        if global_count > 0:
            oldest = redis_client.zrange(FLAG_EVENT_HISTORY_KEY, 0, 0, withscores=True)
            newest = redis_client.zrange(FLAG_EVENT_HISTORY_KEY, -1, -1, withscores=True)
            if oldest:
                oldest_id = int(oldest[0][1])
            if newest:
                newest_id = int(newest[0][1])

        return {
            "global_event_count": global_count,
            "global_ttl_seconds": global_ttl,
            "oldest_event_id": oldest_id,
            "newest_event_id": newest_id,
            "max_size": EVENT_HISTORY_MAX_SIZE,
            "per_flag_max_size": EVENT_HISTORY_PER_FLAG_MAX_SIZE,
        }
    except Exception as e:
        logger.warning(f"Failed to get history stats: {e}")
        return {"error": str(e)}


def update_client_last_event(client_id: str, event_id: int) -> None:
    """Update the last event ID sent to a client.

    Args:
        client_id: Client identifier
        event_id: Last event ID sent
    """
    try:
        key = f"{CLIENT_LAST_EVENT_KEY}{client_id}"
        redis_client.setex(key, EVENT_HISTORY_TTL, str(event_id))
    except Exception as e:
        logger.warning(f"Failed to update client last event: {e}")


async def publish_flag_update(flag_name: str, flag_data: Dict[str, Any]) -> None:
    """Publish a flag update to Redis pub/sub and local subscribers.

    Called by the FeatureFlagService when a flag is updated.
    Stores the event in both global and per-flag history for Last-Event-ID support.
    """
    version = increment_version()

    # Create event data
    event_data = {
        "type": "flag_update",
        "flag": flag_name,
        "data": flag_data,
        "version": version,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    # Store event in history for Last-Event-ID support (both global and per-flag)
    store_event_in_history(version, event_data, flag_name=flag_name)

    # Broadcast to local SSE connections
    await flag_subscription_manager.broadcast_flag_update(flag_name, flag_data, version)

    # Publish to Redis for cross-instance coordination
    try:
        redis_client.publish(FLAG_UPDATE_CHANNEL, json.dumps(event_data))
    except Exception as e:
        logger.warning(f"Failed to publish flag update to Redis: {e}")


async def event_generator(
    client_id: str,
    queue: asyncio.Queue,
    flag_filter: Optional[List[str]],
    db: Session,
    last_event_id: Optional[int] = None,
    current_user: Optional[User] = None,
):
    """Generate SSE events for a connected client.

    Supports Last-Event-ID for reconnection: if provided, sends missed events
    before switching to live updates. Respects RBAC visibility for flags.

    Args:
        client_id: Unique client identifier
        queue: Event queue for this client
        flag_filter: Optional list of flags to filter to
        db: Database session
        last_event_id: Last event ID received by client (for reconnection)
        current_user: Authenticated user (for RBAC filtering)

    Yields:
        SSE-formatted event strings
    """
    try:
        version = get_current_version()

        # Handle reconnection with Last-Event-ID
        if last_event_id is not None:
            logger.info(
                f"Client {client_id} reconnecting with Last-Event-ID: {last_event_id}",
                extra={"current_version": version},
            )

            # Track reconnection metrics
            sse_reconnects_total.labels(with_last_event_id="true").inc()
            version_lag = version - last_event_id
            if version_lag > 0:
                sse_version_lag.observe(version_lag)

            # Get missed events (now returns tuple with history_complete flag)
            missed_events, history_complete = get_events_since(last_event_id, flag_filter)

            if not history_complete:
                # History is incomplete - fall back to bulk refresh with warning
                logger.warning(f"Client {client_id} event history incomplete, falling back to bulk refresh")
                sse_history_incomplete_total.inc()

                # Send all current flags as bulk update (with RBAC filtering)
                flags = await feature_flag_service.list_flags(db)
                flags = await filter_flags_for_user(flags, current_user)
                if flag_filter:
                    flags_data = {f.name: f.to_dict() for f in flags if f.name in flag_filter}
                else:
                    flags_data = {f.name: f.to_dict() for f in flags}

                # Send warning event before bulk update
                warning_event = {
                    "event": "history_incomplete",
                    "data": {
                        "client_id": client_id,
                        "message": "Event history was pruned. Sending bulk refresh.",
                        "last_event_id": last_event_id,
                        "current_version": version,
                        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    },
                }
                yield format_sse_event(warning_event, version)

                # Send bulk update
                bulk_event = {
                    "event": "flags_bulk_update",
                    "data": {
                        "flags": flags_data,
                        "version": version,
                        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                        "reason": "history_incomplete",
                    },
                }
                yield format_sse_event(bulk_event, version)
                update_client_last_event(client_id, version)

            elif missed_events:
                # Track replayed events
                sse_events_replayed_total.inc(len(missed_events))

                # Send missed events first
                for event_data in missed_events:
                    event_id = event_data.pop("_event_id", None)
                    flag_name = event_data.get("flag")

                    # Apply filter if set (already filtered for per-flag history)
                    if flag_filter and flag_name and flag_name not in flag_filter:
                        continue

                    missed_event = {
                        "event": "flag_update",
                        "data": {
                            "flag": flag_name,
                            "value": event_data.get("data"),
                            "version": event_data.get("version"),
                            "timestamp": event_data.get("timestamp"),
                            "replayed": True,  # Mark as replayed event
                        },
                    }
                    yield format_sse_event(missed_event, event_id)
                    if event_id:
                        update_client_last_event(client_id, event_id)

                # Send reconnected event after replaying missed events
                reconnected_event = {
                    "event": "reconnected",
                    "data": {
                        "client_id": client_id,
                        "version": version,
                        "events_replayed": len(missed_events),
                        "history_complete": True,
                        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    },
                }
                yield format_sse_event(reconnected_event, version)
            else:
                # No missed events, just send reconnected
                reconnected_event = {
                    "event": "reconnected",
                    "data": {
                        "client_id": client_id,
                        "version": version,
                        "events_replayed": 0,
                        "history_complete": True,
                        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    },
                }
                yield format_sse_event(reconnected_event, version)
        else:
            # Fresh connection - send all current flags (with RBAC filtering)
            flags = await feature_flag_service.list_flags(db)
            flags = await filter_flags_for_user(flags, current_user)

            # Filter flags if specific ones requested
            if flag_filter:
                flags_data = {f.name: f.to_dict() for f in flags if f.name in flag_filter}
            else:
                flags_data = {f.name: f.to_dict() for f in flags}

            connected_event = {
                "event": "connected",
                "data": {
                    "client_id": client_id,
                    "version": version,
                    "flags": flags_data,
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                },
            }
            yield format_sse_event(connected_event, version)

        # Update client's last event
        update_client_last_event(client_id, version)

        while True:
            try:
                # Wait for events with timeout for heartbeat
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                    event_version = event.get("data", {}).get("version", version)
                    yield format_sse_event(event, event_version)
                    update_client_last_event(client_id, event_version)
                except asyncio.TimeoutError:
                    # Send heartbeat with current version as ID
                    current_version = get_current_version()
                    heartbeat = {
                        "event": "heartbeat",
                        "data": {
                            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                            "version": current_version,
                        },
                    }
                    yield format_sse_event(heartbeat, current_version)

            except asyncio.CancelledError:
                break

    except Exception as e:
        logger.error(f"SSE generator error for client {client_id}: {e}")
        error_event = {
            "event": "error",
            "data": {"message": str(e), "timestamp": datetime.now(timezone.utc).isoformat() + "Z"},
        }
        yield format_sse_event(error_event)
    finally:
        await flag_subscription_manager.disconnect(client_id)


def format_sse_event(event: Dict[str, Any], event_id: Optional[int] = None) -> str:
    """Format an event dictionary as an SSE message.

    Args:
        event: Dictionary with 'event' and 'data' keys
        event_id: Optional event ID for Last-Event-ID support

    Returns:
        SSE-formatted string with optional id field
    """
    event_type = event.get("event", "message")
    data = json.dumps(event.get("data", {}))

    # Include event ID if provided (for Last-Event-ID support)
    if event_id is not None:
        return f"id: {event_id}\nevent: {event_type}\ndata: {data}\n\n"
    else:
        return f"event: {event_type}\ndata: {data}\n\n"


@router.get("/stream")
async def stream_flag_updates(
    request: Request,
    flags: Optional[str] = Query(None, description="Comma-separated list of flag names to subscribe to"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Subscribe to real-time feature flag updates via Server-Sent Events.

    Returns a stream of SSE events for flag changes. Clients can optionally
    filter to specific flags using the `flags` query parameter.

    Supports reconnection via Last-Event-ID header: when the client reconnects
    with this header, the server will replay any missed events before switching
    to live updates.

    RBAC: Flags are filtered based on user permissions. Unauthenticated users
    only receive public flags. Admin flags require admin role.

    Rate Limiting: Max 10 connections per IP per minute.

    Events:
        - connected: Initial connection with current flag state
        - reconnected: Reconnection after Last-Event-ID (includes replayed count)
        - history_incomplete: Event history was pruned, includes bulk refresh
        - flag_update: A single flag was updated
        - flags_bulk_update: Multiple flags changed at once
        - heartbeat: Keep-alive every 30 seconds

    Headers:
        Last-Event-ID: (optional) Last received event ID for reconnection
        Authorization: (optional) Bearer token for authenticated access

    Query Parameters:
        flags: Comma-separated list of flag names (e.g., "ui.dark_mode,backend.rag")
               If not provided, subscribes to all accessible flags.

    Example:
        ```javascript
        const eventSource = new EventSource('/api/flags/stream?flags=ui.dark_mode');

        eventSource.addEventListener('connected', (e) => {
            const data = JSON.parse(e.data);
            console.log('Connected with version:', data.version);
        });

        eventSource.addEventListener('reconnected', (e) => {
            const data = JSON.parse(e.data);
            console.log('Reconnected, replayed events:', data.events_replayed);
        });

        eventSource.addEventListener('flag_update', (e) => {
            const data = JSON.parse(e.data);
            console.log('Flag updated:', data.flag, data.value);
        });
        ```
    """
    import uuid

    # Rate limiting check
    client_ip = get_client_ip(request)
    is_allowed, current_count = sse_rate_limiter.check_rate_limit(client_ip)
    if not is_allowed:
        logger.warning(
            f"SSE rate limit exceeded for {client_ip}",
            extra={"count": current_count, "limit": SSE_RATE_LIMIT_MAX_CONNECTIONS},
        )
        return JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded",
                "message": f"Too many SSE connections from this IP. Max {SSE_RATE_LIMIT_MAX_CONNECTIONS} per minute.",
                "retry_after": SSE_RATE_LIMIT_WINDOW,
            },
            headers={"Retry-After": str(SSE_RATE_LIMIT_WINDOW)},
        )

    client_id = str(uuid.uuid4())
    flag_filter = [f.strip() for f in flags.split(",")] if flags else None

    # Validate that user can access requested flags (RBAC)
    if flag_filter:
        # Get flag metadata to check permissions
        all_flags = await feature_flag_service.list_flags(db)
        flag_metadata_map = {f.name: getattr(f, "flag_metadata", None) for f in all_flags}

        # Filter to only flags user can access
        accessible_flags = []
        for flag_name in flag_filter:
            metadata = flag_metadata_map.get(flag_name)
            if user_can_access_flag(current_user, metadata):
                accessible_flags.append(flag_name)
            else:
                logger.warning(
                    f"User denied access to flag: {flag_name}",
                    extra={
                        "user_id": current_user.id if current_user else None,
                        "visibility": get_flag_visibility(metadata),
                    },
                )

        if not accessible_flags and flag_filter:
            # Release rate limit slot since we're rejecting
            sse_rate_limiter.release(client_ip)
            # User requested flags but has access to none
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Access denied",
                    "message": "You don't have permission to access the requested flags.",
                },
            )

        flag_filter = accessible_flags if accessible_flags else None

    # Extract Last-Event-ID header for reconnection support
    last_event_id = None
    last_event_id_header = request.headers.get("Last-Event-ID")
    if last_event_id_header:
        try:
            last_event_id = int(last_event_id_header)
            logger.info(f"SSE reconnection with Last-Event-ID: {last_event_id}")
        except ValueError:
            logger.warning(f"Invalid Last-Event-ID header: {last_event_id_header}")

    # Register client
    queue = await flag_subscription_manager.connect(client_id, flag_filter)

    # Create event generator with rate limit cleanup on disconnect
    async def event_generator_with_cleanup():
        try:
            async for event in event_generator(client_id, queue, flag_filter, db, last_event_id, current_user):
                yield event
        finally:
            # Release rate limit slot when connection closes
            sse_rate_limiter.release(client_ip)

    return StreamingResponse(
        event_generator_with_cleanup(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get("/version")
async def get_flags_version():
    """Get the current global feature flags version.

    Used by clients to check if their cached flags are stale.
    Returns version number and timestamp.
    """
    version = get_current_version()
    return success_response(
        data={
            "version": version,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        version="2.0.0",
    )


@router.get("/changes")
async def get_flag_changes(
    since_version: int = Query(0, description="Return changes since this version"),
    db: Session = Depends(get_db),
):
    """Get flag changes since a specific version.

    Used by clients to efficiently sync their local cache after reconnecting.

    Args:
        since_version: Version number to get changes since (0 for all flags)

    Returns:
        Current version and list of changed flags
    """
    current_version = get_current_version()
    flags = await feature_flag_service.list_flags(db)

    # For now, return all flags if version mismatch
    # A more sophisticated implementation would track changes per version
    flags_data = {f.name: f.to_dict() for f in flags}

    return success_response(
        data={
            "version": current_version,
            "since_version": since_version,
            "flags": flags_data,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        version="2.0.0",
    )


@router.get("/stats")
async def get_realtime_stats():
    """Get real-time connection statistics.

    Returns current number of SSE connections, version info, event history stats,
    and version drift across clients.
    """
    history_stats = get_history_stats()
    version_drift = flag_subscription_manager.get_version_drift_stats()

    return success_response(
        data={
            "connections": flag_subscription_manager.get_connection_count(),
            "version": get_current_version(),
            "event_history": history_stats,
            "version_drift": version_drift,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        version="2.0.0",
    )


@router.get("/history-stats")
async def get_event_history_stats():
    """Get detailed event history statistics.

    Returns information about the event history storage including:
    - Number of events in global history
    - Oldest and newest event IDs
    - TTL remaining on history key
    - Configuration limits
    """
    stats = get_history_stats()

    return success_response(
        data={
            **stats,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        version="2.0.0",
    )
