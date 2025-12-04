"""
Accessibility Service - Visual and Haptic Feedback

Provides:
- Visual cues for key events (emotion deviation, PHI alerts, turn-taking)
- Haptic feedback patterns for mobile devices
- Screen reader support
- High contrast mode support
- Reduced motion alternatives
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class FeedbackType(Enum):
    """Types of accessibility feedback"""

    VISUAL = "visual"
    HAPTIC = "haptic"
    AUDIO = "audio"
    SCREEN_READER = "screen_reader"


class VisualCueType(Enum):
    """Types of visual cues"""

    INDICATOR = "indicator"  # Small indicator dot/icon
    BANNER = "banner"  # Full-width banner
    HIGHLIGHT = "highlight"  # Element highlight
    ANIMATION = "animation"  # Motion animation
    PULSE = "pulse"  # Pulsing effect


class HapticPattern(Enum):
    """Predefined haptic patterns"""

    TAP = "tap"  # Single light tap
    DOUBLE_TAP = "double_tap"  # Two quick taps
    SUCCESS = "success"  # Pleasant confirmation
    WARNING = "warning"  # Attention-getting pattern
    ERROR = "error"  # Strong error pattern
    HEARTBEAT = "heartbeat"  # Rhythmic pattern
    NOTIFICATION = "notification"  # Standard notification


@dataclass
class VisualCue:
    """A visual cue to display"""

    type: VisualCueType
    color: str  # CSS color or semantic name (success, warning, error)
    message: Optional[str] = None
    icon: Optional[str] = None  # Icon name or emoji
    duration_ms: int = 3000
    position: str = "top-right"  # top-left, top-right, bottom-left, bottom-right, center
    priority: int = 0  # Higher = more important


@dataclass
class HapticFeedback:
    """Haptic feedback to trigger"""

    pattern: HapticPattern
    intensity: float = 1.0  # 0.0 to 1.0
    repeat: int = 1


@dataclass
class ScreenReaderAnnouncement:
    """Screen reader announcement"""

    text: str
    priority: str = "polite"  # polite, assertive
    language: Optional[str] = None


@dataclass
class AccessibilityEvent:
    """Event triggering accessibility feedback"""

    event_type: str
    session_id: str
    visual_cue: Optional[VisualCue] = None
    haptic: Optional[HapticFeedback] = None
    screen_reader: Optional[ScreenReaderAnnouncement] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class UserAccessibilityPreferences:
    """User's accessibility preferences"""

    user_id: str
    visual_cues_enabled: bool = True
    haptic_enabled: bool = True
    screen_reader_mode: bool = False
    high_contrast: bool = False
    reduced_motion: bool = False
    large_text: bool = False
    custom_colors: Dict[str, str] = field(default_factory=dict)


class AccessibilityService:
    """
    Accessibility service for visual and haptic feedback.

    Listens to events and emits accessibility-appropriate feedback.
    Respects user preferences for reduced motion, high contrast, etc.
    """

    # Default event -> feedback mappings
    DEFAULT_MAPPINGS: Dict[str, Dict[str, Any]] = {
        "emotion.deviation": {
            "visual": VisualCue(
                type=VisualCueType.INDICATOR,
                color="warning",
                icon="💭",
                message="Emotional state change detected",
                position="top-right",
            ),
            "haptic": HapticFeedback(pattern=HapticPattern.DOUBLE_TAP, intensity=0.7),
            "screen_reader": ScreenReaderAnnouncement(
                text="User emotional state has changed significantly",
                priority="polite",
            ),
        },
        "phi.detected": {
            "visual": VisualCue(
                type=VisualCueType.BANNER,
                color="error",
                icon="🔒",
                message="Protected health information detected",
                position="top-left",
                priority=10,
            ),
            "haptic": HapticFeedback(pattern=HapticPattern.WARNING, intensity=1.0),
            "screen_reader": ScreenReaderAnnouncement(
                text="Warning: Protected health information detected in conversation",
                priority="assertive",
            ),
        },
        "clinical.alert": {
            "visual": VisualCue(
                type=VisualCueType.BANNER,
                color="warning",
                icon="⚠️",
                message="Clinical alert",
                position="top-center",
                priority=8,
            ),
            "haptic": HapticFeedback(pattern=HapticPattern.WARNING, intensity=0.9),
            "screen_reader": ScreenReaderAnnouncement(
                text="Clinical alert requires attention",
                priority="assertive",
            ),
        },
        "prosody.turn_signal": {
            "visual": VisualCue(
                type=VisualCueType.INDICATOR,
                color="info",
                icon="🎤",
                duration_ms=1000,
            ),
            "haptic": HapticFeedback(pattern=HapticPattern.TAP, intensity=0.3),
        },
        "repair.escalation": {
            "visual": VisualCue(
                type=VisualCueType.HIGHLIGHT,
                color="warning",
                message="Clarification needed",
            ),
            "haptic": HapticFeedback(pattern=HapticPattern.NOTIFICATION, intensity=0.5),
            "screen_reader": ScreenReaderAnnouncement(
                text="The assistant needs clarification. Please rephrase your request.",
                priority="polite",
            ),
        },
        "degradation.activated": {
            "visual": VisualCue(
                type=VisualCueType.INDICATOR,
                color="warning",
                icon="⚡",
                message="Operating in limited mode",
                duration_ms=5000,
            ),
            "screen_reader": ScreenReaderAnnouncement(
                text="Voice assistant is operating in limited mode due to service issues",
                priority="polite",
            ),
        },
        "degradation.recovered": {
            "visual": VisualCue(
                type=VisualCueType.INDICATOR,
                color="success",
                icon="✓",
                message="Full service restored",
                duration_ms=3000,
            ),
            "haptic": HapticFeedback(pattern=HapticPattern.SUCCESS, intensity=0.5),
        },
    }

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._user_preferences: Dict[str, UserAccessibilityPreferences] = {}
        self._pending_events: List[AccessibilityEvent] = []
        self._websocket_handlers: Dict[str, Callable] = {}

        if self.event_bus:
            self._subscribe_to_events()

        logger.info("AccessibilityService initialized")

    def _subscribe_to_events(self) -> None:
        """Subscribe to events that need accessibility feedback"""
        from app.core.event_bus import VoiceEvent

        async def handle_event(event: VoiceEvent):
            await self._process_event(event)

        # Subscribe to all mapped event types
        for event_type in self.DEFAULT_MAPPINGS.keys():
            self.event_bus.subscribe(
                event_type,
                handle_event,
                priority=0,  # Low priority - feedback is supplementary
                engine="accessibility",
            )

    async def _process_event(self, event) -> None:
        """Process an event and emit accessibility feedback"""
        mapping = self.DEFAULT_MAPPINGS.get(event.event_type)
        if not mapping:
            return

        # Get user preferences
        user_id = event.data.get("user_id")
        prefs = self.get_user_preferences(user_id) if user_id else None

        # Build accessibility event
        a11y_event = AccessibilityEvent(
            event_type=event.event_type,
            session_id=event.session_id,
        )

        # Add visual cue (respect reduced motion)
        if "visual" in mapping:
            visual = mapping["visual"]
            if prefs and prefs.reduced_motion and visual.type == VisualCueType.ANIMATION:
                # Replace animation with static indicator
                visual = VisualCue(
                    type=VisualCueType.INDICATOR,
                    color=visual.color,
                    message=visual.message,
                    icon=visual.icon,
                    duration_ms=visual.duration_ms,
                    position=visual.position,
                    priority=visual.priority,
                )
            if not prefs or prefs.visual_cues_enabled:
                a11y_event.visual_cue = visual

        # Add haptic feedback
        if "haptic" in mapping:
            if not prefs or prefs.haptic_enabled:
                a11y_event.haptic = mapping["haptic"]

        # Add screen reader announcement
        if "screen_reader" in mapping:
            if prefs and prefs.screen_reader_mode:
                a11y_event.screen_reader = mapping["screen_reader"]

        # Emit to connected clients
        await self._emit_to_clients(a11y_event)

    async def _emit_to_clients(self, event: AccessibilityEvent) -> None:
        """Emit accessibility event to connected clients"""
        # Store for polling
        self._pending_events.append(event)

        # Limit pending events
        if len(self._pending_events) > 100:
            self._pending_events.pop(0)

        # Call websocket handlers if registered
        handler = self._websocket_handlers.get(event.session_id)
        if handler:
            try:
                await handler(event)
            except Exception as e:
                logger.error(f"Accessibility handler error: {e}")

    def register_websocket_handler(
        self,
        session_id: str,
        handler: Callable[[AccessibilityEvent], Awaitable[None]],
    ) -> None:
        """Register a websocket handler for real-time accessibility events"""
        self._websocket_handlers[session_id] = handler

    def unregister_websocket_handler(self, session_id: str) -> None:
        """Unregister a websocket handler"""
        self._websocket_handlers.pop(session_id, None)

    async def get_pending_events(
        self,
        session_id: str,
        clear: bool = True,
    ) -> List[AccessibilityEvent]:
        """Get pending accessibility events for a session"""
        events = [e for e in self._pending_events if e.session_id == session_id]
        if clear:
            self._pending_events = [e for e in self._pending_events if e.session_id != session_id]
        return events

    # === User Preferences ===

    def get_user_preferences(
        self,
        user_id: str,
    ) -> UserAccessibilityPreferences:
        """Get user's accessibility preferences"""
        if user_id not in self._user_preferences:
            self._user_preferences[user_id] = UserAccessibilityPreferences(user_id=user_id)
        return self._user_preferences[user_id]

    def update_user_preferences(
        self,
        user_id: str,
        updates: Dict[str, Any],
    ) -> UserAccessibilityPreferences:
        """Update user's accessibility preferences"""
        prefs = self.get_user_preferences(user_id)

        for key, value in updates.items():
            if hasattr(prefs, key):
                setattr(prefs, key, value)

        logger.info(f"Updated accessibility preferences for user {user_id}")
        return prefs

    # === Manual Feedback Triggers ===

    async def show_visual_cue(
        self,
        session_id: str,
        cue: VisualCue,
    ) -> None:
        """Manually trigger a visual cue"""
        event = AccessibilityEvent(
            event_type="manual.visual",
            session_id=session_id,
            visual_cue=cue,
        )
        await self._emit_to_clients(event)

    async def trigger_haptic(
        self,
        session_id: str,
        pattern: HapticPattern,
        intensity: float = 1.0,
    ) -> None:
        """Manually trigger haptic feedback"""
        event = AccessibilityEvent(
            event_type="manual.haptic",
            session_id=session_id,
            haptic=HapticFeedback(pattern=pattern, intensity=intensity),
        )
        await self._emit_to_clients(event)

    async def announce(
        self,
        session_id: str,
        text: str,
        priority: str = "polite",
    ) -> None:
        """Announce text to screen readers"""
        event = AccessibilityEvent(
            event_type="manual.announcement",
            session_id=session_id,
            screen_reader=ScreenReaderAnnouncement(text=text, priority=priority),
        )
        await self._emit_to_clients(event)

    # === High Contrast Support ===

    def get_high_contrast_colors(self) -> Dict[str, str]:
        """Get high contrast color palette"""
        return {
            "success": "#00FF00",
            "warning": "#FFFF00",
            "error": "#FF0000",
            "info": "#00FFFF",
            "background": "#000000",
            "foreground": "#FFFFFF",
            "border": "#FFFFFF",
        }

    def apply_high_contrast(
        self,
        color: str,
        user_id: Optional[str] = None,
    ) -> str:
        """Convert color to high contrast version if user prefers it"""
        if user_id:
            prefs = self.get_user_preferences(user_id)
            if prefs.high_contrast:
                hc_colors = self.get_high_contrast_colors()
                return hc_colors.get(color, color)
        return color

    def clear_session(self, session_id: str) -> None:
        """Clear session data"""
        self._pending_events = [e for e in self._pending_events if e.session_id != session_id]
        self._websocket_handlers.pop(session_id, None)


# Global accessibility service instance
_accessibility_service_instance: Optional[AccessibilityService] = None


def get_accessibility_service() -> AccessibilityService:
    """Get the global accessibility service instance"""
    global _accessibility_service_instance
    if _accessibility_service_instance is None:
        from app.core.event_bus import get_event_bus

        _accessibility_service_instance = AccessibilityService(event_bus=get_event_bus())
    return _accessibility_service_instance


def reset_accessibility_service() -> None:
    """Reset the global accessibility service (for testing)"""
    global _accessibility_service_instance
    _accessibility_service_instance = None


__all__ = [
    "AccessibilityService",
    "AccessibilityEvent",
    "VisualCue",
    "VisualCueType",
    "HapticFeedback",
    "HapticPattern",
    "ScreenReaderAnnouncement",
    "FeedbackType",
    "UserAccessibilityPreferences",
    "get_accessibility_service",
    "reset_accessibility_service",
]
