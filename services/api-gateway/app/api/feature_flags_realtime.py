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
from typing import Any, Dict, List, Optional, Set

from app.core.api_envelope import success_response
from app.core.database import SessionLocal, get_db, redis_client
from app.core.logging import get_logger
from app.services.feature_flags import feature_flag_service
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/flags", tags=["feature-flags", "realtime"])
logger = get_logger(__name__)

# Redis keys for pub/sub
FLAG_UPDATE_CHANNEL = "feature_flags:updates"
FLAG_VERSION_KEY = "feature_flags:version"

# SSE heartbeat interval (seconds)
HEARTBEAT_INTERVAL = 30


class FlagSubscriptionManager:
    """Manages SSE subscriptions for feature flag updates.

    Handles:
    - Client connection tracking
    - Flag-specific subscriptions
    - Broadcasting updates to connected clients
    - Redis pub/sub for cross-instance coordination
    """

    def __init__(self):
        self._connections: Dict[str, asyncio.Queue] = {}
        self._subscriptions: Dict[str, Set[str]] = {}  # connection_id -> set of flag names
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
            if client_id in self._subscriptions:
                del self._subscriptions[client_id]
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
        async with self._lock:
            for client_id, queue in self._connections.items():
                # Check if client is subscribed to this flag
                subscriptions = self._subscriptions.get(client_id, set())
                if not subscriptions or flag_name in subscriptions:
                    try:
                        await queue.put(event)
                        notified += 1
                    except Exception as e:
                        self.logger.warning(f"Failed to notify client {client_id}: {e}")

        self.logger.info(
            f"Broadcast flag update: {flag_name}",
            extra={"version": version, "clients_notified": notified},
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
        event = {
            "event": "flags_bulk_update",
            "data": {
                "flags": flags,
                "version": version,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        }

        notified = 0
        async with self._lock:
            for client_id, queue in self._connections.items():
                subscriptions = self._subscriptions.get(client_id, set())
                # Check if any subscribed flags were updated
                if not subscriptions or any(f in subscriptions for f in flags.keys()):
                    try:
                        await queue.put(event)
                        notified += 1
                    except Exception as e:
                        self.logger.warning(f"Failed to notify client {client_id}: {e}")

        return notified

    def get_connection_count(self) -> int:
        """Get current number of connected clients."""
        return len(self._connections)


# Global subscription manager
flag_subscription_manager = FlagSubscriptionManager()


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


async def publish_flag_update(flag_name: str, flag_data: Dict[str, Any]) -> None:
    """Publish a flag update to Redis pub/sub and local subscribers.

    Called by the FeatureFlagService when a flag is updated.
    """
    version = increment_version()

    # Broadcast to local SSE connections
    await flag_subscription_manager.broadcast_flag_update(flag_name, flag_data, version)

    # Publish to Redis for cross-instance coordination
    try:
        message = json.dumps(
            {
                "type": "flag_update",
                "flag": flag_name,
                "data": flag_data,
                "version": version,
            }
        )
        redis_client.publish(FLAG_UPDATE_CHANNEL, message)
    except Exception as e:
        logger.warning(f"Failed to publish flag update to Redis: {e}")


async def event_generator(
    client_id: str,
    queue: asyncio.Queue,
    flag_filter: Optional[List[str]],
    db: Session,
):
    """Generate SSE events for a connected client.

    Yields:
        SSE-formatted event strings
    """
    try:
        # Send initial connected event with current flags and version
        version = get_current_version()
        flags = await feature_flag_service.list_flags(db)

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
        yield format_sse_event(connected_event)

        # Start heartbeat task
        last_heartbeat = time.time()

        while True:
            try:
                # Wait for events with timeout for heartbeat
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                    yield format_sse_event(event)
                except asyncio.TimeoutError:
                    # Send heartbeat
                    heartbeat = {
                        "event": "heartbeat",
                        "data": {
                            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                            "version": get_current_version(),
                        },
                    }
                    yield format_sse_event(heartbeat)
                    last_heartbeat = time.time()

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


def format_sse_event(event: Dict[str, Any]) -> str:
    """Format an event dictionary as an SSE message.

    Args:
        event: Dictionary with 'event' and 'data' keys

    Returns:
        SSE-formatted string
    """
    event_type = event.get("event", "message")
    data = json.dumps(event.get("data", {}))

    return f"event: {event_type}\ndata: {data}\n\n"


@router.get("/stream")
async def stream_flag_updates(
    request: Request,
    flags: Optional[str] = Query(None, description="Comma-separated list of flag names to subscribe to"),
    db: Session = Depends(get_db),
):
    """Subscribe to real-time feature flag updates via Server-Sent Events.

    Returns a stream of SSE events for flag changes. Clients can optionally
    filter to specific flags using the `flags` query parameter.

    Events:
        - connected: Initial connection with current flag state
        - flag_update: A single flag was updated
        - flags_bulk_update: Multiple flags changed at once
        - heartbeat: Keep-alive every 30 seconds

    Query Parameters:
        flags: Comma-separated list of flag names (e.g., "ui.dark_mode,backend.rag")
               If not provided, subscribes to all flags.

    Example:
        ```javascript
        const eventSource = new EventSource('/api/flags/stream?flags=ui.dark_mode');
        eventSource.addEventListener('flag_update', (e) => {
            const data = JSON.parse(e.data);
            console.log('Flag updated:', data.flag, data.value);
        });
        ```
    """
    import uuid

    client_id = str(uuid.uuid4())
    flag_filter = [f.strip() for f in flags.split(",")] if flags else None

    # Register client
    queue = await flag_subscription_manager.connect(client_id, flag_filter)

    return StreamingResponse(
        event_generator(client_id, queue, flag_filter, db),
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

    Returns current number of SSE connections and version info.
    """
    return success_response(
        data={
            "connections": flag_subscription_manager.get_connection_count(),
            "version": get_current_version(),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        version="2.0.0",
    )
