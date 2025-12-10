"""
Memory Engine - Unified Context and Preferences

This engine handles all user memory and personalization:
- Session Context: Short-term session memory
- User Preferences: Long-term preference storage
- Progress Tracker: Learning and usage progress
- Privacy Enforcer: Privacy settings enforcement
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class UserContext:
    """Unified user context combining all memory sources"""

    user_id: str
    emotion_baseline: Optional[Dict] = None
    preferences: Dict[str, Any] = field(default_factory=dict)
    progress: Optional[Dict] = None
    session_history: List[Dict] = field(default_factory=list)
    privacy_mode_active: bool = False


@dataclass
class SessionMemory:
    """Short-term session memory"""

    session_id: str
    user_id: Optional[str] = None
    recent_entities: List[str] = field(default_factory=list)
    recent_topics: List[str] = field(default_factory=list)
    context_stack: List[Dict] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)


class MemoryEngine:
    """
    Facade for all user memory and personalization functionality.

    Consolidates:
    - NEW session_context.py (short-term memory)
    - NEW user_preferences.py (long-term preferences)
    - NEW progress_tracker.py (learning progress)
    - NEW privacy_enforcer.py (privacy controls)
    """

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._session_context = None
        self._user_preferences = None
        self._progress_tracker = None
        self._privacy_enforcer = None
        logger.info("MemoryEngine initialized")

    async def initialize(self):
        """Initialize sub-components lazily"""
        from .privacy_enforcer import PrivacyEnforcer
        from .progress_tracker import ProgressTracker
        from .session_context import SessionContext
        from .user_preferences import UserPreferences

        self._session_context = SessionContext(event_bus=self.event_bus)
        self._user_preferences = UserPreferences(event_bus=self.event_bus)
        self._progress_tracker = ProgressTracker(event_bus=self.event_bus)
        self._privacy_enforcer = PrivacyEnforcer(self.event_bus)

        # Subscribe to relevant events
        if self.event_bus:
            self._subscribe_to_events()

        logger.info("MemoryEngine sub-components initialized")

    def _subscribe_to_events(self) -> None:
        """Subscribe to events for context updates"""
        from app.core.event_bus import VoiceEvent

        async def handle_emotion_updated(event: VoiceEvent):
            """Update session context with emotion state"""
            session_id = event.session_id
            emotion_data = {
                "dominant_emotion": event.data.get("dominant_emotion"),
                "valence": event.data.get("valence"),
                "arousal": event.data.get("arousal"),
            }
            await self.update_session_context(
                session_id,
                context={"emotion": emotion_data},
            )

        async def handle_query_classified(event: VoiceEvent):
            """Update session context with query classification"""
            session_id = event.session_id
            query_data = {
                "query_type": event.data.get("query_type"),
                "domain": event.data.get("domain"),
            }
            await self.update_session_context(
                session_id,
                context={"query": query_data},
            )

        async def handle_dictation_section_change(event: VoiceEvent):
            """Track topic from dictation sections"""
            session_id = event.session_id
            section = event.data.get("section")
            if section:
                await self.update_session_context(
                    session_id,
                    topics=[section],
                )

        self.event_bus.subscribe(
            "emotion.updated",
            handle_emotion_updated,
            priority=5,
            engine="memory",
        )
        self.event_bus.subscribe(
            "query.classified",
            handle_query_classified,
            priority=5,
            engine="memory",
        )
        self.event_bus.subscribe(
            "dictation.section_change",
            handle_dictation_section_change,
            priority=5,
            engine="memory",
        )

    async def get_user_context(self, user_id: str) -> UserContext:
        """
        Fetch all user data respecting privacy settings.

        Returns unified context combining:
        - Emotion baseline (if tracking enabled)
        - User preferences
        - Progress (if tracking enabled)
        """
        if not self._privacy_enforcer:
            await self.initialize()

        privacy = await self._privacy_enforcer.get_settings(user_id)

        context = UserContext(user_id=user_id)

        # Load preferences (always available)
        context.preferences = await self._user_preferences.get_all(user_id)

        # Load emotion baseline if enabled
        if privacy.emotion_tracking_enabled:
            context.emotion_baseline = await self._load_emotion_baseline(user_id)
        else:
            context.emotion_baseline = None

        # Load progress if enabled
        if privacy.progress_tracking_enabled:
            context.progress = await self._progress_tracker.get_summary(user_id)
        else:
            context.progress = None

        context.privacy_mode_active = privacy.privacy_mode_active

        return context

    async def get_session_memory(self, session_id: str) -> SessionMemory:
        """Get or create session memory"""
        if not self._session_context:
            await self.initialize()
        return await self._session_context.get_or_create(session_id)

    async def update_session_context(
        self,
        session_id: str,
        entities: Optional[List[str]] = None,
        topics: Optional[List[str]] = None,
        context: Optional[Dict] = None,
    ) -> SessionMemory:
        """Update session context with new information"""
        if not self._session_context:
            await self.initialize()

        return await self._session_context.update(session_id, entities, topics, context)

    async def save_user_preference(
        self,
        user_id: str,
        key: str,
        value: Any,
    ) -> bool:
        """Save a user preference"""
        if not self._user_preferences:
            await self.initialize()
        return await self._user_preferences.set(user_id, key, value)

    async def get_user_preference(
        self,
        user_id: str,
        key: str,
        default: Any = None,
    ) -> Any:
        """Get a user preference"""
        if not self._user_preferences:
            await self.initialize()
        return await self._user_preferences.get(user_id, key, default)

    async def record_progress(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
        location: Dict,
        progress_percent: float = 0.0,
    ) -> bool:
        """Record user progress on a resource"""
        if not self._progress_tracker:
            await self.initialize()

        # Check privacy settings
        privacy = await self._privacy_enforcer.get_settings(user_id)
        if not privacy.progress_tracking_enabled:
            logger.debug(f"Progress tracking disabled for user {user_id}")
            return False

        return await self._progress_tracker.record(user_id, resource_type, resource_id, location, progress_percent)

    async def get_last_position(
        self,
        user_id: str,
        resource_type: Optional[str] = None,
    ) -> Optional[Dict]:
        """Get user's last position for resume"""
        if not self._progress_tracker:
            await self.initialize()
        return await self._progress_tracker.get_last_position(user_id, resource_type)

    async def handle_voice_command(
        self,
        user_id: str,
        command: str,
    ) -> Dict[str, Any]:
        """
        Handle privacy-related voice commands.

        Commands: disable_emotion_tracking, enable_privacy_mode, etc.
        """
        if not self._privacy_enforcer:
            await self.initialize()
        return await self._privacy_enforcer.handle_command(user_id, command)

    async def export_user_data(self, user_id: str) -> Dict[str, Any]:
        """Export all user data (GDPR/CCPA compliance)"""
        if not self._privacy_enforcer:
            await self.initialize()
        return await self._privacy_enforcer.export_user_data(user_id)

    async def delete_user_data(self, user_id: str) -> bool:
        """Delete all user personalization data"""
        if not self._privacy_enforcer:
            await self.initialize()
        return await self._privacy_enforcer.delete_user_data(user_id)

    async def _load_emotion_baseline(self, user_id: str) -> Optional[Dict]:
        """Load emotion baseline from EmotionEngine"""
        # Would integrate with EmotionEngine
        # For now, return None
        return None


__all__ = [
    "MemoryEngine",
    "UserContext",
    "SessionMemory",
]
