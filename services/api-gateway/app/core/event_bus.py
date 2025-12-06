"""
Voice Event Bus - Internal Pub/Sub for Cross-Engine Communication

Provides decoupled communication between voice mode engines with:
- Correlation tracking for event chains
- Priority-based handler ordering
- Event history for debugging/analytics
"""

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class VoiceEvent:
    """Event with full traceability"""

    event_type: str
    data: Dict[str, Any]
    session_id: str
    correlation_id: str  # Links related events in a chain
    timestamp: datetime = field(default_factory=datetime.utcnow)
    source_engine: str = "unknown"
    priority: int = 0  # Higher = more urgent

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "event_type": self.event_type,
            "data": self.data,
            "session_id": self.session_id,
            "correlation_id": self.correlation_id,
            "timestamp": self.timestamp.isoformat(),
            "source_engine": self.source_engine,
            "priority": self.priority,
        }


@dataclass
class EventHandler:
    """Registered event handler with metadata"""

    handler: Callable[[VoiceEvent], Awaitable[None]]
    priority: int = 0
    engine: str = "unknown"


class VoiceEventBus:
    """
    Internal pub/sub for decoupled cross-engine communication.

    Provides:
    - Async event publishing and handling
    - Correlation tracking for event chains
    - Priority-based handler ordering
    - Event history for debugging

    Event Types:
    - emotion.*: Emotion engine events
    - conversation.*: Conversation engine events
    - clinical.*: Clinical engine events
    - dictation.*: Dictation engine events
    - memory.*: Memory engine events
    - analytics.*: Analytics engine events
    - provider.*: Provider health events
    - degradation.*: Degradation mode events
    """

    # Supported event types
    EVENTS = [
        # Emotion Engine
        "emotion.updated",  # Emotion detection result
        "emotion.deviation",  # Significant deviation from baseline
        # Conversation Engine
        "prosody.turn_signal",  # Turn-taking prediction
        "repair.started",  # Repair attempt started
        "repair.escalation",  # Repair strategy escalation
        "query.classified",  # Query type determined
        # Clinical Engine
        "clinical.alert",  # Critical clinical finding
        "phi.detected",  # PHI detection alert
        "phi.suppressed",  # Context-aware suppression
        # Dictation Engine
        "dictation.started",  # New dictation note started
        "dictation.command",  # Voice command executed
        "dictation.section_change",  # Section navigation
        # Memory Engine
        "memory.recall_triggered",  # Memory recall needed
        "memory.context_updated",  # Context changed
        "privacy.settings_changed",  # Privacy settings updated
        "privacy.data_deleted",  # User data deleted
        # Analytics Engine
        "analytics.anomaly",  # Latency/error anomaly
        "analytics.tune",  # Dynamic parameter adjustment
        # System Events
        "provider.status",  # Provider health change
        "degradation.activated",  # Fallback mode engaged
        "degradation.recovered",  # Normal mode restored
        # Thinking Feedback (Issue 1: Unified thinking tones)
        "thinking.started",  # Backend started thinking feedback
        "thinking.stopped",  # Backend stopped thinking feedback
        # Smart Acknowledgments (Issue 2: Intent classification)
        "acknowledgment.intent",  # Intent classified from transcript
        "acknowledgment.triggered",  # Acknowledgment phrase selected
        "acknowledgment.played",  # Acknowledgment audio finished
        # Progressive Response (Issue 4: Filler phrases)
        "filler.triggered",  # Filler phrase about to play
        "filler.played",  # Filler phrase finished
        # Turn Management (Issue 3: Turn-taking)
        "turn.yielded",  # AI yielded turn to user
        "turn.taken",  # AI took turn from user
    ]

    def __init__(self, max_history: int = 1000):
        self._handlers: Dict[str, List[EventHandler]] = defaultdict(list)
        self._wildcard_handlers: List[EventHandler] = []
        self._event_history: List[VoiceEvent] = []
        self._max_history = max_history
        self._correlation_chains: Dict[str, List[VoiceEvent]] = defaultdict(list)
        self._active_correlations: Dict[str, str] = {}  # session_id -> correlation_id
        logger.info("VoiceEventBus initialized")

    def subscribe(
        self,
        event_type: str,
        handler: Callable[[VoiceEvent], Awaitable[None]],
        priority: int = 0,
        engine: str = "unknown",
    ) -> None:
        """
        Register handler for event type.

        Args:
            event_type: Event type to subscribe to (use "*" for all events)
            handler: Async function to call when event fires
            priority: Handler priority (higher = called first)
            engine: Source engine for debugging
        """
        event_handler = EventHandler(
            handler=handler,
            priority=priority,
            engine=engine,
        )

        if event_type == "*":
            self._wildcard_handlers.append(event_handler)
            self._wildcard_handlers.sort(key=lambda h: -h.priority)
        else:
            self._handlers[event_type].append(event_handler)
            self._handlers[event_type].sort(key=lambda h: -h.priority)

        logger.debug(f"Subscribed {engine} to {event_type} with priority {priority}")

    def unsubscribe(
        self,
        event_type: str,
        handler: Callable[[VoiceEvent], Awaitable[None]],
    ) -> bool:
        """Unsubscribe handler from event type"""
        if event_type == "*":
            handlers = self._wildcard_handlers
        else:
            handlers = self._handlers.get(event_type, [])

        for i, h in enumerate(handlers):
            if h.handler == handler:
                handlers.pop(i)
                return True
        return False

    async def publish(self, event: VoiceEvent) -> None:
        """
        Publish event to all subscribers.

        Handlers are called in priority order (highest first).
        """
        # Add to history
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history.pop(0)

        # Track correlation chain
        self._correlation_chains[event.correlation_id].append(event)

        logger.debug(
            f"Publishing {event.event_type} from {event.source_engine} " f"(correlation={event.correlation_id[:8]})"
        )

        # Get handlers for this event type + wildcards
        handlers = self._handlers.get(event.event_type, []) + self._wildcard_handlers

        # Call handlers in priority order
        for handler in sorted(handlers, key=lambda h: -h.priority):
            try:
                await handler.handler(event)
            except Exception as e:
                logger.error(f"Handler error for {event.event_type} in {handler.engine}: {e}")

    async def publish_event(
        self,
        event_type: str,
        data: Dict[str, Any],
        session_id: str,
        source_engine: str,
        priority: int = 0,
        correlation_id: Optional[str] = None,
    ) -> VoiceEvent:
        """
        Convenience method to publish an event.

        Automatically creates or reuses correlation ID for session.
        """
        # Get or create correlation ID
        if correlation_id is None:
            correlation_id = self._get_or_create_correlation(session_id)

        event = VoiceEvent(
            event_type=event_type,
            data=data,
            session_id=session_id,
            correlation_id=correlation_id,
            source_engine=source_engine,
            priority=priority,
        )

        await self.publish(event)
        return event

    def _get_or_create_correlation(self, session_id: str) -> str:
        """Get existing correlation ID or create new one"""
        if session_id not in self._active_correlations:
            self._active_correlations[session_id] = str(uuid.uuid4())
        return self._active_correlations[session_id]

    def start_new_correlation(self, session_id: str) -> str:
        """Start a new correlation chain for a session"""
        correlation_id = str(uuid.uuid4())
        self._active_correlations[session_id] = correlation_id
        return correlation_id

    def get_correlation_id(self, session_id: str) -> Optional[str]:
        """Get current correlation ID for session"""
        return self._active_correlations.get(session_id)

    async def get_event_chain(self, correlation_id: str) -> List[VoiceEvent]:
        """
        Reconstruct event chain for debugging/analytics.

        Returns all events with the given correlation ID in order.
        """
        events = self._correlation_chains.get(correlation_id, [])
        return sorted(events, key=lambda e: e.timestamp)

    async def get_session_events(
        self,
        session_id: str,
        event_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[VoiceEvent]:
        """Get recent events for a session"""
        events = [e for e in self._event_history if e.session_id == session_id]

        if event_type:
            events = [e for e in events if e.event_type == event_type]

        return events[-limit:]

    async def get_recent_events(
        self,
        event_type: Optional[str] = None,
        source_engine: Optional[str] = None,
        limit: int = 100,
    ) -> List[VoiceEvent]:
        """Get recent events with optional filtering"""
        events = self._event_history

        if event_type:
            events = [e for e in events if e.event_type == event_type]

        if source_engine:
            events = [e for e in events if e.source_engine == source_engine]

        return events[-limit:]

    def clear_session(self, session_id: str) -> None:
        """Clear correlation tracking for a session"""
        if session_id in self._active_correlations:
            del self._active_correlations[session_id]

    def get_handler_count(self, event_type: str) -> int:
        """Get number of handlers for an event type"""
        return len(self._handlers.get(event_type, [])) + len(self._wildcard_handlers)

    def get_stats(self) -> Dict[str, Any]:
        """Get event bus statistics"""
        return {
            "total_events": len(self._event_history),
            "active_correlations": len(self._active_correlations),
            "correlation_chains": len(self._correlation_chains),
            "registered_handlers": sum(len(h) for h in self._handlers.values()),
            "wildcard_handlers": len(self._wildcard_handlers),
            "event_types_with_handlers": list(self._handlers.keys()),
        }


# Global event bus instance (singleton pattern)
_event_bus_instance: Optional[VoiceEventBus] = None


def get_event_bus() -> VoiceEventBus:
    """Get the global event bus instance"""
    global _event_bus_instance
    if _event_bus_instance is None:
        _event_bus_instance = VoiceEventBus()
    return _event_bus_instance


def reset_event_bus() -> None:
    """Reset the global event bus (for testing)"""
    global _event_bus_instance
    _event_bus_instance = None


# Decorator for easy event subscription
def on_event(event_type: str, priority: int = 0, engine: str = "unknown"):
    """
    Decorator for subscribing to events.

    Usage:
        @on_event("emotion.updated", priority=10, engine="conversation")
        async def handle_emotion_update(event: VoiceEvent):
            ...
    """

    def decorator(func: Callable[[VoiceEvent], Awaitable[None]]):
        event_bus = get_event_bus()
        event_bus.subscribe(event_type, func, priority, engine)
        return func

    return decorator


__all__ = [
    "VoiceEvent",
    "VoiceEventBus",
    "EventHandler",
    "get_event_bus",
    "reset_event_bus",
    "on_event",
]
