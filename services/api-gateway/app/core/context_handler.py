"""
Cross-Engine Context Handler - Shared Context Management

Provides:
- Automatic context sharing between engines via event bus
- Clinical alerts affecting conversation and emotion tone
- Degradation events disabling progressive responses
- Correlation tracking for analytics causality chains
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class SessionContext:
    """Shared context for a voice session"""

    session_id: str
    user_id: Optional[str] = None

    # Emotion context
    current_emotion: str = "neutral"
    emotion_valence: float = 0.0
    emotion_arousal: float = 0.5
    emotion_confidence: float = 0.0
    emotion_deviation: bool = False

    # Clinical context
    has_phi: bool = False
    phi_entities: List[str] = field(default_factory=list)
    clinical_alerts: List[str] = field(default_factory=list)
    care_gap_count: int = 0

    # Conversation context
    query_type: str = "simple"
    domain: str = "general"
    repair_attempts: int = 0
    is_frustrated: bool = False

    # Degradation mode
    is_degraded: bool = False
    degraded_services: Set[str] = field(default_factory=set)
    use_fallback_tts: bool = False

    # Memory context
    has_prior_session: bool = False
    user_preferences: Dict[str, Any] = field(default_factory=dict)
    last_topic: Optional[str] = None

    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "emotion": {
                "current": self.current_emotion,
                "valence": self.emotion_valence,
                "arousal": self.emotion_arousal,
                "confidence": self.emotion_confidence,
                "deviation": self.emotion_deviation,
            },
            "clinical": {
                "has_phi": self.has_phi,
                "phi_entities": self.phi_entities,
                "alerts": self.clinical_alerts,
                "care_gaps": self.care_gap_count,
            },
            "conversation": {
                "query_type": self.query_type,
                "domain": self.domain,
                "repair_attempts": self.repair_attempts,
                "is_frustrated": self.is_frustrated,
            },
            "degradation": {
                "is_degraded": self.is_degraded,
                "services": list(self.degraded_services),
                "use_fallback_tts": self.use_fallback_tts,
            },
            "memory": {
                "has_prior_session": self.has_prior_session,
                "preferences": self.user_preferences,
                "last_topic": self.last_topic,
            },
            "updated_at": self.updated_at.isoformat(),
        }


class CrossEngineContextHandler:
    """
    Manages shared context across all engines.

    Listens to events and updates context automatically.
    Provides context to engines on request.
    """

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._sessions: Dict[str, SessionContext] = {}
        self._context_subscribers: List[Any] = []
        self._is_running = False

        logger.info("CrossEngineContextHandler initialized")

    async def start(self) -> None:
        """Start context handling"""
        if self._is_running:
            return

        self._is_running = True

        if self.event_bus:
            self._subscribe_to_events()

        logger.info("CrossEngineContextHandler started")

    async def stop(self) -> None:
        """Stop context handling"""
        self._is_running = False
        logger.info("CrossEngineContextHandler stopped")

    def _subscribe_to_events(self) -> None:
        """Subscribe to all relevant events"""
        from app.core.event_bus import VoiceEvent

        # Emotion events
        async def handle_emotion_updated(event: VoiceEvent):
            await self._update_emotion_context(event)

        async def handle_emotion_deviation(event: VoiceEvent):
            await self._handle_emotion_deviation(event)

        # Clinical events
        async def handle_phi_detected(event: VoiceEvent):
            await self._handle_phi_detected(event)

        async def handle_clinical_alert(event: VoiceEvent):
            await self._handle_clinical_alert(event)

        # Conversation events
        async def handle_query_classified(event: VoiceEvent):
            await self._update_query_context(event)

        async def handle_repair_started(event: VoiceEvent):
            await self._handle_repair_started(event)

        async def handle_repair_escalation(event: VoiceEvent):
            await self._handle_repair_escalation(event)

        # Degradation events
        async def handle_provider_status(event: VoiceEvent):
            await self._handle_provider_status(event)

        async def handle_degradation_activated(event: VoiceEvent):
            await self._handle_degradation_activated(event)

        async def handle_degradation_recovered(event: VoiceEvent):
            await self._handle_degradation_recovered(event)

        # Memory events
        async def handle_memory_context_updated(event: VoiceEvent):
            await self._handle_memory_context_updated(event)

        # Subscribe with priorities
        self.event_bus.subscribe("emotion.updated", handle_emotion_updated, priority=5, engine="context")
        self.event_bus.subscribe("emotion.deviation", handle_emotion_deviation, priority=10, engine="context")
        self.event_bus.subscribe("phi.detected", handle_phi_detected, priority=10, engine="context")
        self.event_bus.subscribe("clinical.alert", handle_clinical_alert, priority=10, engine="context")
        self.event_bus.subscribe("query.classified", handle_query_classified, priority=5, engine="context")
        self.event_bus.subscribe("repair.started", handle_repair_started, priority=5, engine="context")
        self.event_bus.subscribe("repair.escalation", handle_repair_escalation, priority=5, engine="context")
        self.event_bus.subscribe("provider.status", handle_provider_status, priority=10, engine="context")
        self.event_bus.subscribe("degradation.activated", handle_degradation_activated, priority=10, engine="context")
        self.event_bus.subscribe("degradation.recovered", handle_degradation_recovered, priority=10, engine="context")
        self.event_bus.subscribe("memory.context_updated", handle_memory_context_updated, priority=5, engine="context")

    def get_context(self, session_id: str) -> SessionContext:
        """Get or create session context"""
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionContext(session_id=session_id)
        return self._sessions[session_id]

    def get_context_dict(self, session_id: str) -> Dict[str, Any]:
        """Get session context as dictionary"""
        return self.get_context(session_id).to_dict()

    async def _update_emotion_context(self, event) -> None:
        """Update emotion context from event"""
        ctx = self.get_context(event.session_id)
        data = event.data

        ctx.current_emotion = data.get("dominant_emotion", ctx.current_emotion)
        ctx.emotion_valence = data.get("valence", ctx.emotion_valence)
        ctx.emotion_arousal = data.get("arousal", ctx.emotion_arousal)
        ctx.emotion_confidence = data.get("confidence", ctx.emotion_confidence)

        # Detect frustration
        if ctx.current_emotion in ["frustration", "anger"]:
            ctx.is_frustrated = True

        ctx.updated_at = datetime.utcnow()

        # Notify context update
        await self._publish_context_update(ctx)

    async def _handle_emotion_deviation(self, event) -> None:
        """Handle significant emotion deviation"""
        ctx = self.get_context(event.session_id)
        ctx.emotion_deviation = True
        ctx.updated_at = datetime.utcnow()

        # Emotion deviation may affect conversation tone
        # Publish cross-engine alert
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.emotion_alert",
                data={
                    "session_id": event.session_id,
                    "deviation": event.data.get("deviation"),
                    "action": "adjust_tone",
                },
                session_id=event.session_id,
                source_engine="context",
                priority=5,
            )

    async def _handle_phi_detected(self, event) -> None:
        """Handle PHI detection"""
        ctx = self.get_context(event.session_id)
        ctx.has_phi = True

        entities = event.data.get("entities", [])
        for entity in entities:
            entity_type = entity.get("type", "unknown")
            if entity_type not in ctx.phi_entities:
                ctx.phi_entities.append(entity_type)

        ctx.updated_at = datetime.utcnow()

        # PHI detection may trigger audit logging
        # Publish cross-engine alert
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.phi_alert",
                data={
                    "session_id": event.session_id,
                    "phi_types": ctx.phi_entities,
                    "action": "enable_audit",
                },
                session_id=event.session_id,
                source_engine="context",
                priority=10,
            )

    async def _handle_clinical_alert(self, event) -> None:
        """Handle clinical alert"""
        ctx = self.get_context(event.session_id)

        alert = event.data.get("alert", "unknown")
        if alert not in ctx.clinical_alerts:
            ctx.clinical_alerts.append(alert)

        ctx.updated_at = datetime.utcnow()

        # Clinical alerts affect conversation and emotion engines
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.clinical_alert",
                data={
                    "session_id": event.session_id,
                    "alert": alert,
                    "severity": event.data.get("severity", "medium"),
                    "actions": ["adjust_tone", "prioritize_safety"],
                },
                session_id=event.session_id,
                source_engine="context",
                priority=10,
            )

    async def _update_query_context(self, event) -> None:
        """Update query context from classification"""
        ctx = self.get_context(event.session_id)
        data = event.data

        ctx.query_type = data.get("query_type", ctx.query_type)
        ctx.domain = data.get("domain", ctx.domain)
        ctx.updated_at = datetime.utcnow()

    async def _handle_repair_started(self, event) -> None:
        """Handle repair attempt started"""
        ctx = self.get_context(event.session_id)
        ctx.repair_attempts += 1
        ctx.updated_at = datetime.utcnow()

    async def _handle_repair_escalation(self, event) -> None:
        """Handle repair escalation"""
        ctx = self.get_context(event.session_id)

        # Multiple repairs may indicate frustration
        if ctx.repair_attempts >= 2:
            ctx.is_frustrated = True

        ctx.updated_at = datetime.utcnow()

        # Notify conversation engine to simplify responses
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.repair_escalation",
                data={
                    "session_id": event.session_id,
                    "attempts": ctx.repair_attempts,
                    "actions": ["simplify_response", "offer_alternatives"],
                },
                session_id=event.session_id,
                source_engine="context",
                priority=5,
            )

    async def _handle_provider_status(self, event) -> None:
        """Handle provider status change"""
        ctx = self.get_context(event.session_id)
        data = event.data

        provider = data.get("provider")
        status = data.get("status")

        if status == "degraded" or status == "down":
            ctx.degraded_services.add(provider)
            ctx.is_degraded = True

            # Enable fallback for TTS degradation
            if provider in ["elevenlabs", "tts"]:
                ctx.use_fallback_tts = True
        elif status == "healthy" and provider in ctx.degraded_services:
            ctx.degraded_services.discard(provider)
            if not ctx.degraded_services:
                ctx.is_degraded = False
                ctx.use_fallback_tts = False

        ctx.updated_at = datetime.utcnow()

    async def _handle_degradation_activated(self, event) -> None:
        """Handle degradation mode activation"""
        ctx = self.get_context(event.session_id)
        ctx.is_degraded = True
        ctx.updated_at = datetime.utcnow()

        # Notify all engines to use fallback modes
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.degradation",
                data={
                    "session_id": event.session_id,
                    "is_degraded": True,
                    "actions": ["disable_progressive", "use_fallback", "reduce_features"],
                },
                session_id=event.session_id,
                source_engine="context",
                priority=10,
            )

    async def _handle_degradation_recovered(self, event) -> None:
        """Handle degradation recovery"""
        ctx = self.get_context(event.session_id)
        ctx.is_degraded = False
        ctx.degraded_services.clear()
        ctx.use_fallback_tts = False
        ctx.updated_at = datetime.utcnow()

        # Notify engines to resume normal operation
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.recovery",
                data={
                    "session_id": event.session_id,
                    "is_degraded": False,
                    "actions": ["resume_normal", "enable_features"],
                },
                session_id=event.session_id,
                source_engine="context",
                priority=5,
            )

    async def _handle_memory_context_updated(self, event) -> None:
        """Handle memory context update"""
        ctx = self.get_context(event.session_id)
        data = event.data

        if "user_id" in data:
            ctx.user_id = data["user_id"]
        if "has_prior_session" in data:
            ctx.has_prior_session = data["has_prior_session"]
        if "preferences" in data:
            ctx.user_preferences.update(data["preferences"])
        if "last_topic" in data:
            ctx.last_topic = data["last_topic"]

        ctx.updated_at = datetime.utcnow()

    async def _publish_context_update(self, ctx: SessionContext) -> None:
        """Publish context update event"""
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.updated",
                data=ctx.to_dict(),
                session_id=ctx.session_id,
                source_engine="context",
            )

    def clear_session(self, session_id: str) -> None:
        """Clear session context"""
        if session_id in self._sessions:
            del self._sessions[session_id]

    def get_stats(self) -> Dict[str, Any]:
        """Get context handler statistics"""
        return {
            "active_sessions": len(self._sessions),
            "sessions_with_phi": sum(1 for s in self._sessions.values() if s.has_phi),
            "degraded_sessions": sum(1 for s in self._sessions.values() if s.is_degraded),
            "frustrated_sessions": sum(1 for s in self._sessions.values() if s.is_frustrated),
        }


# Global context handler instance
_context_handler_instance: Optional[CrossEngineContextHandler] = None


def get_context_handler() -> CrossEngineContextHandler:
    """Get the global context handler instance"""
    global _context_handler_instance
    if _context_handler_instance is None:
        from app.core.event_bus import get_event_bus

        _context_handler_instance = CrossEngineContextHandler(event_bus=get_event_bus())
    return _context_handler_instance


def reset_context_handler() -> None:
    """Reset the global context handler (for testing)"""
    global _context_handler_instance
    _context_handler_instance = None


__all__ = [
    "SessionContext",
    "CrossEngineContextHandler",
    "get_context_handler",
    "reset_context_handler",
]
