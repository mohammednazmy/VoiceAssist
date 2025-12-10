"""
Event Logging Service for structured session event capture.

This service provides:
- Async event logging with batching
- Event querying for inspection/replay
- Background flush to avoid blocking main request flow
"""

import asyncio
import uuid
from collections import deque
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.database import get_db
from app.core.logging import get_logger
from app.models.session_event import EventType, SessionEvent
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class EventLoggingService:
    """
    Service for logging and querying session events.

    Features:
    - Buffered async logging to reduce DB pressure
    - Periodic flush to ensure events are persisted
    - Query interface for event inspection
    """

    def __init__(self, buffer_size: int = 100, flush_interval_seconds: float = 5.0):
        """
        Initialize the event logging service.

        Args:
            buffer_size: Max events to buffer before forcing a flush
            flush_interval_seconds: Interval for periodic flushes
        """
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval_seconds
        self._buffer: deque = deque(maxlen=buffer_size * 2)  # Extra room
        self._lock = asyncio.Lock()
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """Start the background flush task."""
        if self._running:
            return
        self._running = True
        self._flush_task = asyncio.create_task(self._periodic_flush())
        logger.info("EventLoggingService started")

    async def stop(self):
        """Stop the service and flush remaining events."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self._flush_buffer()
        logger.info("EventLoggingService stopped")

    async def log_event(
        self,
        conversation_id: uuid.UUID,
        event_type: EventType | str,
        payload: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        branch_id: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
        source: str = "backend",
        trace_id: Optional[str] = None,
    ) -> None:
        """
        Log a session event asynchronously.

        Events are buffered and flushed periodically or when buffer is full.

        Args:
            conversation_id: ID of the conversation
            event_type: Type of event
            payload: Event-specific data
            session_id: Optional session identifier
            branch_id: Optional branch identifier
            user_id: Optional user identifier
            source: Source of the event
            trace_id: Optional trace ID for correlation
        """
        event = SessionEvent.create(
            conversation_id=conversation_id,
            event_type=event_type,
            payload=payload,
            session_id=session_id,
            branch_id=branch_id,
            user_id=user_id,
            source=source,
            trace_id=trace_id,
        )

        async with self._lock:
            self._buffer.append(event)

            # Flush if buffer is getting full
            if len(self._buffer) >= self.buffer_size:
                asyncio.create_task(self._flush_buffer())

    async def log_event_sync(
        self,
        db: Session,
        conversation_id: uuid.UUID,
        event_type: EventType | str,
        payload: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        branch_id: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
        source: str = "backend",
        trace_id: Optional[str] = None,
    ) -> SessionEvent:
        """
        Log a session event synchronously (immediate DB write).

        Use this for critical events that must be persisted immediately.

        Args:
            db: Database session
            conversation_id: ID of the conversation
            event_type: Type of event
            payload: Event-specific data
            session_id: Optional session identifier
            branch_id: Optional branch identifier
            user_id: Optional user identifier
            source: Source of the event
            trace_id: Optional trace ID for correlation

        Returns:
            The created SessionEvent
        """
        event = SessionEvent.create(
            conversation_id=conversation_id,
            event_type=event_type,
            payload=payload,
            session_id=session_id,
            branch_id=branch_id,
            user_id=user_id,
            source=source,
            trace_id=trace_id,
        )

        db.add(event)
        db.commit()
        db.refresh(event)

        return event

    async def _flush_buffer(self) -> None:
        """Flush buffered events to the database."""
        async with self._lock:
            if not self._buffer:
                return

            events = list(self._buffer)
            self._buffer.clear()

        if not events:
            return

        try:
            # Get a database session
            db_gen = get_db()
            db = next(db_gen)
            try:
                for event in events:
                    db.add(event)
                db.commit()
                logger.debug(f"Flushed {len(events)} events to database")
            finally:
                try:
                    next(db_gen)
                except StopIteration:
                    pass
        except Exception as e:
            logger.error(f"Error flushing events to database: {e}")
            # Re-add events to buffer for retry
            async with self._lock:
                for event in events:
                    self._buffer.appendleft(event)

    async def _periodic_flush(self) -> None:
        """Background task to periodically flush events."""
        while self._running:
            await asyncio.sleep(self.flush_interval)
            await self._flush_buffer()

    # =========================================================================
    # Query Methods
    # =========================================================================

    def get_events_for_conversation(
        self,
        db: Session,
        conversation_id: uuid.UUID,
        event_types: Optional[List[str]] = None,
        since: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[SessionEvent]:
        """
        Get events for a conversation.

        Args:
            db: Database session
            conversation_id: ID of the conversation
            event_types: Optional filter by event types
            since: Optional filter for events after this time
            limit: Max events to return
            offset: Pagination offset

        Returns:
            List of SessionEvent objects
        """
        query = db.query(SessionEvent).filter(SessionEvent.conversation_id == conversation_id)

        if event_types:
            query = query.filter(SessionEvent.event_type.in_(event_types))

        if since:
            query = query.filter(SessionEvent.created_at >= since)

        return query.order_by(SessionEvent.created_at.asc()).offset(offset).limit(limit).all()

    def get_events_for_session(
        self,
        db: Session,
        session_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> List[SessionEvent]:
        """
        Get events for a specific session (e.g., WebSocket session).

        Args:
            db: Database session
            session_id: Session identifier
            limit: Max events to return
            offset: Pagination offset

        Returns:
            List of SessionEvent objects
        """
        return (
            db.query(SessionEvent)
            .filter(SessionEvent.session_id == session_id)
            .order_by(SessionEvent.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_error_events(
        self,
        db: Session,
        conversation_id: uuid.UUID,
        since: Optional[datetime] = None,
        limit: int = 50,
    ) -> List[SessionEvent]:
        """
        Get error events for a conversation.

        Args:
            db: Database session
            conversation_id: ID of the conversation
            since: Optional filter for events after this time
            limit: Max events to return

        Returns:
            List of error SessionEvent objects
        """
        error_types = [
            EventType.ERROR_WEBSOCKET.value,
            EventType.ERROR_VOICE.value,
            EventType.ERROR_API.value,
            EventType.ERROR_BACKEND.value,
        ]

        query = db.query(SessionEvent).filter(
            SessionEvent.conversation_id == conversation_id,
            SessionEvent.event_type.in_(error_types),
        )

        if since:
            query = query.filter(SessionEvent.created_at >= since)

        return query.order_by(SessionEvent.created_at.desc()).limit(limit).all()


# Global singleton instance
event_logger = EventLoggingService()


# Convenience functions for common events
async def log_websocket_connect(
    conversation_id: uuid.UUID,
    session_id: str,
    user_id: Optional[uuid.UUID] = None,
    trace_id: Optional[str] = None,
) -> None:
    """Log a WebSocket connection event."""
    await event_logger.log_event(
        conversation_id=conversation_id,
        event_type=EventType.WEBSOCKET_CONNECT,
        session_id=session_id,
        user_id=user_id,
        trace_id=trace_id,
        payload={"timestamp": datetime.utcnow().isoformat()},
    )


async def log_websocket_disconnect(
    conversation_id: uuid.UUID,
    session_id: str,
    reason: Optional[str] = None,
    trace_id: Optional[str] = None,
) -> None:
    """Log a WebSocket disconnection event."""
    await event_logger.log_event(
        conversation_id=conversation_id,
        event_type=EventType.WEBSOCKET_DISCONNECT,
        session_id=session_id,
        trace_id=trace_id,
        payload={"reason": reason, "timestamp": datetime.utcnow().isoformat()},
    )


async def log_message_created(
    conversation_id: uuid.UUID,
    message_id: str,
    role: str,
    branch_id: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
    trace_id: Optional[str] = None,
) -> None:
    """Log a message creation event."""
    await event_logger.log_event(
        conversation_id=conversation_id,
        event_type=EventType.MESSAGE_CREATED,
        branch_id=branch_id,
        user_id=user_id,
        trace_id=trace_id,
        payload={
            "message_id": message_id,
            "role": role,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


async def log_branch_created(
    conversation_id: uuid.UUID,
    branch_id: str,
    parent_message_id: str,
    user_id: Optional[uuid.UUID] = None,
    trace_id: Optional[str] = None,
) -> None:
    """Log a branch creation event."""
    await event_logger.log_event(
        conversation_id=conversation_id,
        event_type=EventType.BRANCH_CREATED,
        branch_id=branch_id,
        user_id=user_id,
        trace_id=trace_id,
        payload={
            "parent_message_id": parent_message_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


async def log_error(
    conversation_id: uuid.UUID,
    error_type: str,
    error_code: str,
    error_message: str,
    session_id: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
    trace_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Log an error event."""
    event_type_map = {
        "websocket": EventType.ERROR_WEBSOCKET,
        "voice": EventType.ERROR_VOICE,
        "api": EventType.ERROR_API,
        "backend": EventType.ERROR_BACKEND,
    }
    event_type = event_type_map.get(error_type, EventType.ERROR_BACKEND)

    await event_logger.log_event(
        conversation_id=conversation_id,
        event_type=event_type,
        session_id=session_id,
        user_id=user_id,
        trace_id=trace_id,
        payload={
            "error_code": error_code,
            "error_message": error_message,
            "details": details,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )
