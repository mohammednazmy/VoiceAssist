"""
Admin Event Publisher Service for real-time admin panel updates.

This service provides:
- Redis pub/sub based event publishing for admin WebSocket clients
- Event types for conversations, users, voice sessions, and system alerts
- Async event publishing to avoid blocking main request flow
"""

import asyncio
import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from app.core.logging import get_logger
from app.core.redis_config import redis_pool

logger = get_logger(__name__)

# Redis channel for admin events
ADMIN_EVENTS_CHANNEL = "admin:events"


class AdminEventType(str, Enum):
    """Types of events published to admin panel."""

    # Session events
    SESSION_CONNECTED = "session.connected"
    SESSION_DISCONNECTED = "session.disconnected"

    # Conversation events
    CONVERSATION_CREATED = "conversation.created"
    CONVERSATION_UPDATED = "conversation.updated"
    CONVERSATION_DELETED = "conversation.deleted"

    # Message events
    MESSAGE_CREATED = "message.created"

    # Clinical context events
    CLINICAL_CONTEXT_CREATED = "clinical_context.created"
    CLINICAL_CONTEXT_UPDATED = "clinical_context.updated"

    # Attachment events
    ATTACHMENT_UPLOADED = "attachment.uploaded"
    ATTACHMENT_DELETED = "attachment.deleted"

    # PHI events
    PHI_ACCESSED = "phi.accessed"
    PHI_DETECTED = "phi.detected"

    # Voice events
    VOICE_SESSION_STARTED = "voice.session_started"
    VOICE_SESSION_ENDED = "voice.session_ended"
    VOICE_SESSION_ERROR = "voice.session_error"

    # TT Pipeline events
    TT_STATE_CHANGED = "tt.state_changed"
    TT_TOOL_CALLED = "tt.tool_called"
    TT_CONTEXT_CREATED = "tt.context_created"
    TT_CONTEXT_EXPIRED = "tt.context_expired"

    # System events
    SYSTEM_ALERT = "system.alert"
    SYSTEM_HEALTH_CHANGED = "system.health_changed"

    # User events
    USER_LOGGED_IN = "user.logged_in"
    USER_LOGGED_OUT = "user.logged_out"
    USER_CREATED = "user.created"


class AdminEvent:
    """Represents an admin event to be published."""

    def __init__(
        self,
        event_type: AdminEventType | str,
        data: Dict[str, Any] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        session_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        resource_type: Optional[str] = None,
    ):
        self.type = event_type.value if isinstance(event_type, AdminEventType) else event_type
        self.timestamp = datetime.utcnow().isoformat() + "Z"
        self.data = data or {}
        self.user_id = user_id
        self.user_email = user_email
        self.session_id = session_id
        self.resource_id = resource_id
        self.resource_type = resource_type

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "timestamp": self.timestamp,
            "user_id": self.user_id,
            "user_email": self.user_email,
            "session_id": self.session_id,
            "resource_id": self.resource_id,
            "resource_type": self.resource_type,
            "data": self.data,
        }

    def to_json(self) -> str:
        """Convert event to JSON string."""
        return json.dumps(self.to_dict())


class AdminEventPublisher:
    """
    Service for publishing admin events via Redis pub/sub.

    Features:
    - Non-blocking async event publishing
    - Event batching for high-frequency events
    - Automatic Redis connection management
    """

    _instance: Optional["AdminEventPublisher"] = None

    def __init__(self):
        self._enabled = True
        self._buffer: List[AdminEvent] = []
        self._buffer_size = 50
        self._flush_interval = 1.0  # seconds
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "AdminEventPublisher":
        """Get singleton instance of the publisher."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def start(self):
        """Start the background flush task."""
        if self._running:
            return
        self._running = True
        self._flush_task = asyncio.create_task(self._periodic_flush())
        logger.info("AdminEventPublisher started")

    async def stop(self):
        """Stop the publisher and flush remaining events."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self._flush_buffer()
        logger.info("AdminEventPublisher stopped")

    def enable(self):
        """Enable event publishing."""
        self._enabled = True

    def disable(self):
        """Disable event publishing (useful for testing)."""
        self._enabled = False

    async def publish(self, event: AdminEvent) -> bool:
        """
        Publish an admin event to Redis pub/sub.

        Args:
            event: The AdminEvent to publish

        Returns:
            True if event was queued successfully
        """
        if not self._enabled:
            return False

        async with self._lock:
            self._buffer.append(event)

            # Flush if buffer is full
            if len(self._buffer) >= self._buffer_size:
                await self._flush_buffer_internal()

        return True

    async def publish_immediate(self, event: AdminEvent) -> bool:
        """
        Publish an event immediately without buffering.

        Use for high-priority events that need real-time delivery.

        Args:
            event: The AdminEvent to publish

        Returns:
            True if published successfully
        """
        if not self._enabled:
            return False

        try:
            redis = await redis_pool.get_client()
            if redis:
                await redis.publish(ADMIN_EVENTS_CHANNEL, event.to_json())
                logger.debug(f"Published admin event: {event.type}")
                return True
            else:
                logger.warning("Redis not available for admin event publishing")
                return False
        except Exception as e:
            logger.error(f"Failed to publish admin event: {e}")
            return False

    async def _periodic_flush(self):
        """Background task to periodically flush the event buffer."""
        while self._running:
            try:
                await asyncio.sleep(self._flush_interval)
                await self._flush_buffer()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic flush: {e}")

    async def _flush_buffer(self):
        """Flush the event buffer under lock."""
        async with self._lock:
            await self._flush_buffer_internal()

    async def _flush_buffer_internal(self):
        """Flush the event buffer (call under lock)."""
        if not self._buffer:
            return

        events_to_flush = self._buffer.copy()
        self._buffer.clear()

        try:
            redis = await redis_pool.get_client()
            if redis:
                # Publish all events in a pipeline for efficiency
                async with redis.pipeline() as pipe:
                    for event in events_to_flush:
                        pipe.publish(ADMIN_EVENTS_CHANNEL, event.to_json())
                    await pipe.execute()
                logger.debug(f"Flushed {len(events_to_flush)} admin events")
            else:
                logger.warning(f"Redis not available, dropping {len(events_to_flush)} admin events")
        except Exception as e:
            logger.error(f"Failed to flush admin events: {e}")


# Convenience functions for common events


async def publish_session_connected(
    user_id: str,
    user_email: str,
    session_id: str,
    session_type: str = "web",
) -> bool:
    """Publish a session connected event."""
    event = AdminEvent(
        event_type=AdminEventType.SESSION_CONNECTED,
        user_id=user_id,
        user_email=user_email,
        session_id=session_id,
        data={"session_type": session_type},
    )
    return await AdminEventPublisher.get_instance().publish(event)


async def publish_session_disconnected(
    user_id: str,
    session_id: str,
    duration_seconds: Optional[float] = None,
) -> bool:
    """Publish a session disconnected event."""
    event = AdminEvent(
        event_type=AdminEventType.SESSION_DISCONNECTED,
        user_id=user_id,
        session_id=session_id,
        data={"duration_seconds": duration_seconds} if duration_seconds else {},
    )
    return await AdminEventPublisher.get_instance().publish(event)


async def publish_conversation_created(
    user_id: str,
    conversation_id: str,
    title: Optional[str] = None,
) -> bool:
    """Publish a conversation created event."""
    event = AdminEvent(
        event_type=AdminEventType.CONVERSATION_CREATED,
        user_id=user_id,
        resource_id=conversation_id,
        resource_type="conversation",
        data={"title": title} if title else {},
    )
    return await AdminEventPublisher.get_instance().publish(event)


async def publish_message_created(
    user_id: str,
    conversation_id: str,
    message_id: str,
    role: str,
) -> bool:
    """Publish a message created event."""
    event = AdminEvent(
        event_type=AdminEventType.MESSAGE_CREATED,
        user_id=user_id,
        resource_id=message_id,
        resource_type="message",
        data={"conversation_id": conversation_id, "role": role},
    )
    return await AdminEventPublisher.get_instance().publish(event)


async def publish_clinical_context_updated(
    user_id: str,
    context_id: str,
    fields_updated: List[str] = None,
) -> bool:
    """Publish a clinical context updated event."""
    event = AdminEvent(
        event_type=AdminEventType.CLINICAL_CONTEXT_UPDATED,
        user_id=user_id,
        resource_id=context_id,
        resource_type="clinical_context",
        data={"fields_updated": fields_updated or []},
    )
    return await AdminEventPublisher.get_instance().publish(event)


async def publish_phi_accessed(
    admin_user_id: str,
    admin_email: str,
    context_id: str,
    target_user_id: str,
) -> bool:
    """Publish a PHI accessed event (immediate for audit)."""
    event = AdminEvent(
        event_type=AdminEventType.PHI_ACCESSED,
        user_id=admin_user_id,
        user_email=admin_email,
        resource_id=context_id,
        resource_type="clinical_context",
        data={"target_user_id": target_user_id},
    )
    # PHI access events are published immediately for audit
    return await AdminEventPublisher.get_instance().publish_immediate(event)


async def publish_voice_session_started(
    user_id: str,
    session_id: str,
    session_type: str = "realtime",
    voice: Optional[str] = None,
) -> bool:
    """Publish a voice session started event."""
    event = AdminEvent(
        event_type=AdminEventType.VOICE_SESSION_STARTED,
        user_id=user_id,
        session_id=session_id,
        resource_type="voice_session",
        data={"session_type": session_type, "voice": voice},
    )
    return await AdminEventPublisher.get_instance().publish_immediate(event)


async def publish_voice_session_ended(
    user_id: str,
    session_id: str,
    duration_seconds: Optional[float] = None,
    messages_count: int = 0,
) -> bool:
    """Publish a voice session ended event."""
    event = AdminEvent(
        event_type=AdminEventType.VOICE_SESSION_ENDED,
        user_id=user_id,
        session_id=session_id,
        resource_type="voice_session",
        data={
            "duration_seconds": duration_seconds,
            "messages_count": messages_count,
        },
    )
    return await AdminEventPublisher.get_instance().publish(event)


async def publish_tt_state_changed(
    user_id: str,
    session_id: str,
    new_state: str,
    previous_state: Optional[str] = None,
) -> bool:
    """Publish a TT pipeline state change event."""
    event = AdminEvent(
        event_type=AdminEventType.TT_STATE_CHANGED,
        user_id=user_id,
        session_id=session_id,
        resource_type="tt_session",
        data={"new_state": new_state, "previous_state": previous_state},
    )
    return await AdminEventPublisher.get_instance().publish_immediate(event)


async def publish_system_alert(
    alert_type: str,
    message: str,
    severity: Literal["info", "warning", "error", "critical"] = "info",
    details: Optional[Dict[str, Any]] = None,
) -> bool:
    """Publish a system alert event (always immediate)."""
    event = AdminEvent(
        event_type=AdminEventType.SYSTEM_ALERT,
        data={
            "alert_type": alert_type,
            "message": message,
            "severity": severity,
            "details": details or {},
        },
    )
    return await AdminEventPublisher.get_instance().publish_immediate(event)


# Singleton instance
_publisher: Optional[AdminEventPublisher] = None


def get_admin_event_publisher() -> AdminEventPublisher:
    """Get the global admin event publisher instance."""
    global _publisher
    if _publisher is None:
        _publisher = AdminEventPublisher.get_instance()
    return _publisher
