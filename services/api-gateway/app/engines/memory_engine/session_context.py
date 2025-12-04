"""
Session Context - Short-Term Session Memory

Manages short-term memory for active sessions:
- Recent entities mentioned
- Topic tracking
- Context stack for conversation flow
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ContextFrame:
    """A frame in the context stack"""

    topic: str
    entities: List[str]
    timestamp: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)


class SessionContext:
    """
    Short-term session memory manager.

    Tracks:
    - Recent entities for reference resolution
    - Active topics for context
    - Context stack for conversation flow

    Publishes memory.context_updated events on context changes.
    """

    MAX_ENTITIES = 20
    MAX_TOPICS = 10
    MAX_CONTEXT_FRAMES = 5
    SESSION_TIMEOUT_HOURS = 24

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._sessions: Dict[str, "SessionMemory"] = {}
        logger.info("SessionContext initialized")

    async def get_or_create(self, session_id: str) -> "SessionMemory":
        """Get existing session or create new one"""
        from . import SessionMemory

        if session_id in self._sessions:
            return self._sessions[session_id]

        session = SessionMemory(session_id=session_id)
        self._sessions[session_id] = session
        return session

    async def update(
        self,
        session_id: str,
        entities: Optional[List[str]] = None,
        topics: Optional[List[str]] = None,
        context: Optional[Dict] = None,
    ) -> "SessionMemory":
        """Update session with new context"""

        session = await self.get_or_create(session_id)

        # Add entities (keeping most recent)
        if entities:
            for entity in entities:
                if entity not in session.recent_entities:
                    session.recent_entities.insert(0, entity)
            session.recent_entities = session.recent_entities[: self.MAX_ENTITIES]

        # Add topics
        if topics:
            for topic in topics:
                if topic not in session.recent_topics:
                    session.recent_topics.insert(0, topic)
            session.recent_topics = session.recent_topics[: self.MAX_TOPICS]

        # Push context frame
        if context:
            frame = ContextFrame(
                topic=context.get("topic", "general"),
                entities=context.get("entities", []),
                timestamp=datetime.utcnow(),
                metadata=context.get("metadata", {}),
            )
            session.context_stack.insert(
                0,
                {
                    "topic": frame.topic,
                    "entities": frame.entities,
                    "timestamp": frame.timestamp.isoformat(),
                    "metadata": frame.metadata,
                },
            )
            session.context_stack = session.context_stack[: self.MAX_CONTEXT_FRAMES]

        # Publish context update event
        if self.event_bus:
            await self._publish_context_update(session)

        return session

    async def _publish_context_update(self, session: "SessionMemory") -> None:
        """Publish memory.context_updated event"""
        await self.event_bus.publish_event(
            event_type="memory.context_updated",
            data={
                "user_id": session.user_id,
                "recent_entities": session.recent_entities[:5],  # Top 5
                "recent_topics": session.recent_topics[:3],  # Top 3
                "last_topic": session.recent_topics[0] if session.recent_topics else None,
            },
            session_id=session.session_id,
            source_engine="memory",
        )

    async def resolve_reference(
        self,
        session_id: str,
        reference: str,
    ) -> Optional[str]:
        """
        Resolve a pronoun or reference to an entity.

        Examples:
        - "it" → last mentioned thing
        - "that patient" → last mentioned patient
        - "they" → last mentioned person/group
        """
        session = self._sessions.get(session_id)
        if not session or not session.recent_entities:
            return None

        reference_lower = reference.lower()

        # Simple reference resolution
        if reference_lower in ["it", "that", "this"]:
            return session.recent_entities[0] if session.recent_entities else None

        if reference_lower in ["they", "them"]:
            # Look for person-type entities
            for entity in session.recent_entities:
                if self._is_person(entity):
                    return entity
            return session.recent_entities[0]

        if "patient" in reference_lower:
            for entity in session.recent_entities:
                if "patient" in entity.lower() or self._is_person(entity):
                    return entity

        if "medication" in reference_lower or "drug" in reference_lower:
            for entity in session.recent_entities:
                if self._is_medication(entity):
                    return entity

        return None

    def _is_person(self, entity: str) -> bool:
        """Check if entity appears to be a person"""
        person_indicators = ["patient", "dr.", "doctor", "nurse", "mr.", "mrs.", "ms."]
        return any(ind in entity.lower() for ind in person_indicators)

    def _is_medication(self, entity: str) -> bool:
        """Check if entity appears to be a medication"""
        # Simple heuristic - could be enhanced with medication database
        med_suffixes = ["in", "ol", "ide", "ine", "one", "ate", "il"]
        entity_lower = entity.lower()
        return any(entity_lower.endswith(suffix) for suffix in med_suffixes)

    async def get_recent_context(
        self,
        session_id: str,
        limit: int = 3,
    ) -> List[Dict]:
        """Get recent context frames"""
        session = self._sessions.get(session_id)
        if not session:
            return []
        return session.context_stack[:limit]

    async def clear_session(self, session_id: str) -> bool:
        """Clear session context"""
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False

    def cleanup_old_sessions(self) -> int:
        """Clean up expired sessions"""
        cutoff = datetime.utcnow() - timedelta(hours=self.SESSION_TIMEOUT_HOURS)
        expired = [sid for sid, session in self._sessions.items() if session.created_at < cutoff]
        for sid in expired:
            del self._sessions[sid]
        return len(expired)


__all__ = ["SessionContext", "ContextFrame"]
