"""
PHI Telemetry Service for Voice Mode v4.1

Provides telemetry hooks for PHI-aware STT routing, enabling:
- Frontend visibility into current PHI mode status
- Real-time routing decision broadcasting
- Audit logging for compliance
- Metrics collection for observability

Part of Voice Mode Enhancement Plan v4.1 - Phase 2
Reference: docs/voice/phi-aware-stt-routing.md

Routing Order (most secure to fastest):
1. LOCAL (on-device Whisper) - PHI score >= 0.7 or explicit prior PHI
2. HYBRID (cloud with redaction) - PHI score 0.3-0.7
3. CLOUD (standard cloud STT) - PHI score < 0.3
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class PHIRoutingMode(str, Enum):
    """PHI routing modes for STT processing."""

    LOCAL = "local"  # On-device Whisper - most secure
    HYBRID = "hybrid"  # Cloud with PHI redaction
    CLOUD = "cloud"  # Standard cloud STT - fastest


class PHITelemetryEventType(str, Enum):
    """Types of PHI telemetry events."""

    ROUTING_DECISION = "routing_decision"
    PHI_DETECTED = "phi_detected"
    MODE_CHANGE = "mode_change"
    SESSION_START = "session_start"
    SESSION_END = "session_end"


@dataclass
class PHIRoutingState:
    """Current PHI routing state for a session."""

    session_id: str
    current_mode: PHIRoutingMode
    phi_score: float
    phi_entities: List[str] = field(default_factory=list)
    is_medical_context: bool = False
    has_prior_phi: bool = False
    routing_reason: str = ""
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_frontend_state(self) -> Dict[str, Any]:
        """Convert to frontend-consumable state."""
        return {
            "sessionId": self.session_id,
            "phiMode": self.current_mode.value,
            "phiScore": round(self.phi_score, 2),
            "isSecureMode": self.current_mode in (PHIRoutingMode.LOCAL, PHIRoutingMode.HYBRID),
            "hasPriorPhi": self.has_prior_phi,
            "isMedicalContext": self.is_medical_context,
            "routingReason": self.routing_reason,
            "indicatorColor": self._get_indicator_color(),
            "indicatorIcon": self._get_indicator_icon(),
            "tooltip": self._get_tooltip(),
        }

    def _get_indicator_color(self) -> str:
        """Get UI indicator color based on routing mode."""
        colors = {
            PHIRoutingMode.LOCAL: "green",  # Most secure
            PHIRoutingMode.HYBRID: "yellow",  # Moderate security
            PHIRoutingMode.CLOUD: "blue",  # Standard
        }
        return colors.get(self.current_mode, "gray")

    def _get_indicator_icon(self) -> str:
        """Get UI indicator icon based on routing mode."""
        icons = {
            PHIRoutingMode.LOCAL: "shield",  # Secure local processing
            PHIRoutingMode.HYBRID: "lock",  # Protected with redaction
            PHIRoutingMode.CLOUD: "cloud",  # Cloud processing
        }
        return icons.get(self.current_mode, "question")

    def _get_tooltip(self) -> str:
        """Get tooltip text for UI indicator."""
        tooltips = {
            PHIRoutingMode.LOCAL: "Secure local processing - PHI protected on device",
            PHIRoutingMode.HYBRID: "Sensitive content detected - using redacted cloud processing",
            PHIRoutingMode.CLOUD: "Using cloud transcription",
        }
        return tooltips.get(self.current_mode, "Processing audio")


@dataclass
class PHITelemetryEvent:
    """A PHI telemetry event for logging and streaming."""

    event_type: PHITelemetryEventType
    session_id: str
    timestamp: datetime
    data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "eventType": self.event_type.value,
            "sessionId": self.session_id,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data,
        }


class PHITelemetryService:
    """
    Service for PHI routing telemetry and frontend visibility.

    Provides:
    - Session state tracking
    - Event broadcasting to subscribed listeners
    - Metrics collection
    - Audit logging

    Usage:
        telemetry = PHITelemetryService()

        # Subscribe to routing updates
        telemetry.subscribe(session_id, callback_fn)

        # Update routing state
        telemetry.update_routing_state(session_id, state)

        # Get current state for frontend
        state = telemetry.get_frontend_state(session_id)
    """

    def __init__(self, event_bus=None):
        self._session_states: Dict[str, PHIRoutingState] = {}
        self._subscribers: Dict[str, List[Callable]] = {}
        self._event_bus = event_bus
        self._metrics_enabled = True

    def set_event_bus(self, event_bus) -> None:
        """Set event bus for cross-service communication."""
        self._event_bus = event_bus

    # =========================================================================
    # Session State Management
    # =========================================================================

    def init_session(
        self,
        session_id: str,
        is_medical_context: bool = False,
    ) -> PHIRoutingState:
        """
        Initialize PHI routing state for a new session.

        Args:
            session_id: Unique session identifier
            is_medical_context: Whether this is a medical context session

        Returns:
            Initial PHIRoutingState
        """
        initial_mode = PHIRoutingMode.HYBRID if is_medical_context else PHIRoutingMode.CLOUD
        initial_score = 0.4 if is_medical_context else 0.0

        state = PHIRoutingState(
            session_id=session_id,
            current_mode=initial_mode,
            phi_score=initial_score,
            is_medical_context=is_medical_context,
            routing_reason="session_initialized",
        )

        self._session_states[session_id] = state

        # Emit session start event
        self._emit_event(
            PHITelemetryEvent(
                event_type=PHITelemetryEventType.SESSION_START,
                session_id=session_id,
                timestamp=datetime.now(timezone.utc),
                data=state.to_frontend_state(),
            )
        )

        logger.info(
            "PHI session initialized",
            extra={
                "session_id": session_id,
                "initial_mode": initial_mode.value,
                "is_medical_context": is_medical_context,
            },
        )

        return state

    def update_routing_state(
        self,
        session_id: str,
        mode: PHIRoutingMode,
        phi_score: float,
        phi_entities: Optional[List[str]] = None,
        routing_reason: str = "",
        has_prior_phi: bool = False,
    ) -> PHIRoutingState:
        """
        Update PHI routing state for a session.

        Args:
            session_id: Session identifier
            mode: New routing mode
            phi_score: PHI probability score (0.0-1.0)
            phi_entities: List of detected PHI entity types
            routing_reason: Reason for routing decision
            has_prior_phi: Whether session has prior PHI detected

        Returns:
            Updated PHIRoutingState
        """
        # Get or create state
        state = self._session_states.get(session_id)
        if not state:
            state = self.init_session(session_id)

        # Track mode changes
        previous_mode = state.current_mode
        mode_changed = previous_mode != mode

        # Update state
        state.current_mode = mode
        state.phi_score = phi_score
        state.phi_entities = phi_entities or []
        state.routing_reason = routing_reason
        state.has_prior_phi = has_prior_phi or state.has_prior_phi
        state.last_updated = datetime.now(timezone.utc)

        self._session_states[session_id] = state

        # Emit routing decision event
        self._emit_event(
            PHITelemetryEvent(
                event_type=PHITelemetryEventType.ROUTING_DECISION,
                session_id=session_id,
                timestamp=datetime.now(timezone.utc),
                data={
                    **state.to_frontend_state(),
                    "previousMode": previous_mode.value,
                    "modeChanged": mode_changed,
                },
            )
        )

        # Emit mode change event if mode changed
        if mode_changed:
            self._emit_event(
                PHITelemetryEvent(
                    event_type=PHITelemetryEventType.MODE_CHANGE,
                    session_id=session_id,
                    timestamp=datetime.now(timezone.utc),
                    data={
                        "fromMode": previous_mode.value,
                        "toMode": mode.value,
                        "reason": routing_reason,
                    },
                )
            )

            logger.info(
                "PHI routing mode changed",
                extra={
                    "session_id": session_id,
                    "from_mode": previous_mode.value,
                    "to_mode": mode.value,
                    "phi_score": phi_score,
                    "reason": routing_reason,
                },
            )

        # Emit PHI detected event if high score
        if phi_score >= 0.7 and phi_entities:
            self._emit_event(
                PHITelemetryEvent(
                    event_type=PHITelemetryEventType.PHI_DETECTED,
                    session_id=session_id,
                    timestamp=datetime.now(timezone.utc),
                    data={
                        "phiScore": phi_score,
                        "phiEntities": phi_entities,
                        "routingMode": mode.value,
                    },
                )
            )

        return state

    def get_state(self, session_id: str) -> Optional[PHIRoutingState]:
        """Get current PHI routing state for a session."""
        return self._session_states.get(session_id)

    def get_frontend_state(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get frontend-consumable state for a session."""
        state = self._session_states.get(session_id)
        if state:
            return state.to_frontend_state()
        return None

    def end_session(self, session_id: str) -> None:
        """Clean up session state."""
        state = self._session_states.pop(session_id, None)
        self._subscribers.pop(session_id, None)

        if state:
            self._emit_event(
                PHITelemetryEvent(
                    event_type=PHITelemetryEventType.SESSION_END,
                    session_id=session_id,
                    timestamp=datetime.now(timezone.utc),
                    data={
                        "finalMode": state.current_mode.value,
                        "hadPhi": state.has_prior_phi,
                        "finalScore": state.phi_score,
                    },
                )
            )

        logger.info(f"PHI session ended: {session_id}")

    # =========================================================================
    # Subscription Management
    # =========================================================================

    def subscribe(
        self,
        session_id: str,
        callback: Callable[[PHITelemetryEvent], None],
    ) -> None:
        """
        Subscribe to PHI routing updates for a session.

        Args:
            session_id: Session to subscribe to
            callback: Function to call with telemetry events
        """
        if session_id not in self._subscribers:
            self._subscribers[session_id] = []
        self._subscribers[session_id].append(callback)

    def unsubscribe(
        self,
        session_id: str,
        callback: Callable[[PHITelemetryEvent], None],
    ) -> None:
        """Unsubscribe from PHI routing updates."""
        if session_id in self._subscribers:
            try:
                self._subscribers[session_id].remove(callback)
            except ValueError:
                pass

    def _emit_event(self, event: PHITelemetryEvent) -> None:
        """Emit event to all subscribers and event bus."""
        # Notify session subscribers
        session_callbacks = self._subscribers.get(event.session_id, [])
        for callback in session_callbacks:
            try:
                callback(event)
            except Exception as e:
                logger.error(f"Error in PHI telemetry callback: {e}")

        # Emit to event bus if available
        if self._event_bus:
            try:
                if hasattr(self._event_bus, "publish_event_sync"):
                    self._event_bus.publish_event_sync(
                        event_type=f"phi.{event.event_type.value}",
                        data=event.to_dict(),
                        session_id=event.session_id,
                        source_engine="phi_telemetry",
                    )
            except Exception as e:
                logger.debug(f"Event bus emit failed: {e}")

        # Collect metrics
        if self._metrics_enabled:
            self._record_metrics(event)

    def _record_metrics(self, event: PHITelemetryEvent) -> None:
        """Record Prometheus metrics for telemetry event."""
        try:
            from app.core.metrics import phi_routing_counter, phi_score_histogram

            if event.event_type == PHITelemetryEventType.ROUTING_DECISION:
                mode = event.data.get("phiMode", "unknown")
                phi_routing_counter.labels(routing=mode).inc()

                score = event.data.get("phiScore", 0.0)
                phi_score_histogram.observe(score)

        except ImportError:
            pass  # Metrics not available


# Singleton instance
_phi_telemetry_service: Optional[PHITelemetryService] = None


def get_phi_telemetry_service() -> PHITelemetryService:
    """Get or create PHI telemetry service instance."""
    global _phi_telemetry_service
    if _phi_telemetry_service is None:
        _phi_telemetry_service = PHITelemetryService()
    return _phi_telemetry_service
