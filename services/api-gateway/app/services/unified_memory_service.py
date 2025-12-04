"""
Unified Conversation Memory Service
Maintains context across voice and text interactions with cross-modal support.

Part of Voice Mode Enhancement Plan v4.1 - Workstream 5
Reference: docs/voice/unified-memory.md

Features:
- Cross-modal context: Shared memory between voice and text modes
- Language switching events: Tracks when users switch languages
- Mode transition handling: Preserves context when switching voice ↔ text
- Session persistence: Maintains memory across browser refreshes
- Privacy controls: User-controlled memory retention
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ConversationMode(str, Enum):
    """Conversation interaction mode."""

    VOICE = "voice"
    TEXT = "text"


class EventType(str, Enum):
    """Types of memory events."""

    MODE_SWITCH = "mode_switch"
    LANGUAGE_SWITCH = "language_switch"
    TOPIC_CHANGE = "topic_change"
    PHI_DETECTED = "phi_detected"
    RAG_RETRIEVAL = "rag_retrieval"


@dataclass
class MemoryEntry:
    """Single memory entry in the conversation."""

    id: str
    session_id: str
    user_id: str
    timestamp: datetime

    # Content
    role: Literal["user", "assistant", "system"]
    content: str
    mode: ConversationMode

    # Context
    language: str = "en"
    detected_language: str = "en"
    language_switched: bool = False

    # RAG context
    retrieved_passages: List[str] = field(default_factory=list)
    sources: List[Dict] = field(default_factory=list)

    # Metadata
    latency_ms: Optional[float] = None
    degradations: List[str] = field(default_factory=list)
    phi_detected: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "id": self.id,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat(),
            "role": self.role,
            "content": self.content,
            "mode": self.mode.value if isinstance(self.mode, ConversationMode) else self.mode,
            "language": self.language,
            "detected_language": self.detected_language,
            "language_switched": self.language_switched,
            "retrieved_passages": self.retrieved_passages,
            "sources": self.sources,
            "latency_ms": self.latency_ms,
            "degradations": self.degradations,
            "phi_detected": self.phi_detected,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryEntry":
        """Create from dictionary."""
        return cls(
            id=data["id"],
            session_id=data["session_id"],
            user_id=data["user_id"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            role=data["role"],
            content=data["content"],
            mode=ConversationMode(data["mode"]) if isinstance(data["mode"], str) else data["mode"],
            language=data.get("language", "en"),
            detected_language=data.get("detected_language", "en"),
            language_switched=data.get("language_switched", False),
            retrieved_passages=data.get("retrieved_passages", []),
            sources=data.get("sources", []),
            latency_ms=data.get("latency_ms"),
            degradations=data.get("degradations", []),
            phi_detected=data.get("phi_detected", False),
        )


@dataclass
class MemoryEvent:
    """Event in the conversation timeline."""

    event_type: EventType
    timestamp: datetime
    data: Dict[str, Any] = field(default_factory=dict)


class ConversationContext(BaseModel):
    """Context retrieved for LLM prompt building."""

    messages: List[Dict] = Field(default_factory=list)
    language_history: List[Dict] = Field(default_factory=list)
    mode_history: List[Dict] = Field(default_factory=list)
    current_language: str = "en"
    current_mode: str = "text"
    rag_context: List[Dict] = Field(default_factory=list)


class MemorySettings(BaseModel):
    """User's memory and privacy preferences."""

    enabled: bool = True
    retention_days: int = 30
    cross_session: bool = True
    save_voice_transcripts: bool = True
    save_rag_context: bool = True
    anonymize_phi: bool = True


class UnifiedMemoryService:
    """
    Unified conversation memory service for cross-modal context.

    Provides:
    - Shared memory between voice and text modes
    - Language and mode switch tracking
    - Session persistence via Redis
    - Context building for LLM prompts
    - Privacy-respecting memory management
    """

    # Default TTLs
    SESSION_TTL = 86400  # 24 hours
    SHORT_TERM_TTL = 86400 * 7  # 7 days
    MAX_MESSAGES = 50

    def __init__(
        self,
        redis_client=None,
        postgres_client=None,
    ):
        self.redis = redis_client
        self.postgres = postgres_client
        self._local_cache: Dict[str, List[MemoryEntry]] = {}
        self._events_cache: Dict[str, List[MemoryEvent]] = {}
        self._settings_cache: Dict[str, MemorySettings] = {}

    async def _get_redis(self):
        """Get Redis client lazily."""
        if self.redis is None:
            try:
                from app.core.redis import get_redis_client

                self.redis = await get_redis_client()
            except Exception as e:
                logger.warning(f"Redis not available: {e}")
        return self.redis

    def _generate_id(self) -> str:
        """Generate unique memory entry ID."""
        import uuid

        return str(uuid.uuid4())

    async def add_entry(
        self,
        session_id: str,
        user_id: str,
        entry: MemoryEntry,
    ) -> None:
        """
        Add a memory entry to the conversation.

        Args:
            session_id: Session identifier
            user_id: User identifier
            entry: Memory entry to add
        """
        # Ensure entry has required fields
        if not entry.id:
            entry.id = self._generate_id()
        entry.session_id = session_id
        entry.user_id = user_id
        if not entry.timestamp:
            entry.timestamp = datetime.now(timezone.utc)

        # Add to local cache
        cache_key = session_id
        if cache_key not in self._local_cache:
            self._local_cache[cache_key] = []

        self._local_cache[cache_key].append(entry)

        # Trim to max messages
        if len(self._local_cache[cache_key]) > self.MAX_MESSAGES:
            self._local_cache[cache_key] = self._local_cache[cache_key][-self.MAX_MESSAGES :]

        # Persist to Redis
        redis = await self._get_redis()
        if redis:
            try:
                redis_key = f"memory:{session_id}"
                data = json.dumps([e.to_dict() for e in self._local_cache[cache_key]])
                await redis.setex(redis_key, self.SESSION_TTL, data)
            except Exception as e:
                logger.warning(f"Failed to persist memory to Redis: {e}")

        logger.debug(
            "Memory entry added",
            extra={
                "session_id": session_id,
                "entry_id": entry.id,
                "role": entry.role,
                "mode": entry.mode.value if isinstance(entry.mode, ConversationMode) else entry.mode,
                "language": entry.language,
            },
        )

    async def add_event(
        self,
        session_id: str,
        event_type: EventType,
        data: Dict[str, Any],
    ) -> None:
        """
        Add an event to the conversation timeline.

        Args:
            session_id: Session identifier
            event_type: Type of event
            data: Event data
        """
        event = MemoryEvent(
            event_type=event_type,
            timestamp=datetime.now(timezone.utc),
            data=data,
        )

        # Add to local cache
        if session_id not in self._events_cache:
            self._events_cache[session_id] = []
        self._events_cache[session_id].append(event)

        # Persist to Redis
        redis = await self._get_redis()
        if redis:
            try:
                redis_key = f"events:{session_id}"
                events_data = [
                    {
                        "event_type": e.event_type.value,
                        "timestamp": e.timestamp.isoformat(),
                        "data": e.data,
                    }
                    for e in self._events_cache[session_id]
                ]
                await redis.setex(redis_key, self.SESSION_TTL, json.dumps(events_data))
            except Exception as e:
                logger.warning(f"Failed to persist event to Redis: {e}")

        logger.info(
            f"Memory event added: {event_type.value}",
            extra={"session_id": session_id, "event_type": event_type.value, "data": data},
        )

    async def get_context(
        self,
        session_id: str,
        max_messages: int = 10,
        include_rag: bool = True,
    ) -> ConversationContext:
        """
        Get conversation context for LLM prompt building.

        Args:
            session_id: Session identifier
            max_messages: Maximum messages to include
            include_rag: Whether to include RAG context

        Returns:
            ConversationContext with messages and metadata
        """
        # Get from local cache or Redis
        entries = await self.get_history(session_id, max_messages)

        # Build messages list
        messages = []
        for entry in entries:
            messages.append(
                {
                    "role": entry.role,
                    "content": entry.content,
                    "mode": entry.mode.value if isinstance(entry.mode, ConversationMode) else entry.mode,
                    "language": entry.language,
                }
            )

        # Get language events
        language_events = await self.get_events(session_id, EventType.LANGUAGE_SWITCH, limit=5)

        # Get mode events
        mode_events = await self.get_events(session_id, EventType.MODE_SWITCH, limit=5)

        # Determine current language and mode
        current_language = "en"
        current_mode = "text"
        if entries:
            current_language = entries[-1].language
            current_mode = (
                entries[-1].mode.value if isinstance(entries[-1].mode, ConversationMode) else entries[-1].mode
            )

        # Collect RAG context
        rag_context = []
        if include_rag:
            for entry in entries:
                if entry.sources:
                    rag_context.extend(entry.sources)

        return ConversationContext(
            messages=messages,
            language_history=[
                {"from_language": e.data.get("from_language"), "to_language": e.data.get("to_language")}
                for e in language_events
            ],
            mode_history=[
                {"from_mode": e.data.get("from_mode"), "to_mode": e.data.get("to_mode")} for e in mode_events
            ],
            current_language=current_language,
            current_mode=current_mode,
            rag_context=rag_context[-5:] if rag_context else [],  # Last 5 sources
        )

    async def get_history(
        self,
        session_id: str,
        max_messages: int = 50,
    ) -> List[MemoryEntry]:
        """
        Get conversation history for a session.

        Args:
            session_id: Session identifier
            max_messages: Maximum messages to return

        Returns:
            List of MemoryEntry objects
        """
        # Check local cache first
        if session_id in self._local_cache:
            return self._local_cache[session_id][-max_messages:]

        # Try Redis
        redis = await self._get_redis()
        if redis:
            try:
                redis_key = f"memory:{session_id}"
                data = await redis.get(redis_key)
                if data:
                    entries_data = json.loads(data)
                    entries = [MemoryEntry.from_dict(e) for e in entries_data]
                    self._local_cache[session_id] = entries
                    return entries[-max_messages:]
            except Exception as e:
                logger.warning(f"Failed to load memory from Redis: {e}")

        return []

    async def get_events(
        self,
        session_id: str,
        event_type: Optional[EventType] = None,
        limit: int = 10,
    ) -> List[MemoryEvent]:
        """
        Get events from the conversation timeline.

        Args:
            session_id: Session identifier
            event_type: Optional filter by event type
            limit: Maximum events to return

        Returns:
            List of MemoryEvent objects
        """
        # Check local cache
        if session_id in self._events_cache:
            events = self._events_cache[session_id]
        else:
            # Try Redis
            events = []
            redis = await self._get_redis()
            if redis:
                try:
                    redis_key = f"events:{session_id}"
                    data = await redis.get(redis_key)
                    if data:
                        events_data = json.loads(data)
                        events = [
                            MemoryEvent(
                                event_type=EventType(e["event_type"]),
                                timestamp=datetime.fromisoformat(e["timestamp"]),
                                data=e["data"],
                            )
                            for e in events_data
                        ]
                        self._events_cache[session_id] = events
                except Exception as e:
                    logger.warning(f"Failed to load events from Redis: {e}")

        # Filter by type if specified
        if event_type:
            events = [e for e in events if e.event_type == event_type]

        return events[-limit:]

    async def track_language_switch(
        self,
        session_id: str,
        from_language: str,
        to_language: str,
        trigger: str = "auto_detected",
    ) -> None:
        """
        Track when user switches languages.

        Args:
            session_id: Session identifier
            from_language: Previous language code
            to_language: New language code
            trigger: What triggered the switch (user_request, auto_detected, explicit_setting)
        """
        await self.add_event(
            session_id=session_id,
            event_type=EventType.LANGUAGE_SWITCH,
            data={
                "from_language": from_language,
                "to_language": to_language,
                "trigger": trigger,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    async def handle_mode_switch(
        self,
        session_id: str,
        from_mode: ConversationMode,
        to_mode: ConversationMode,
    ) -> ConversationContext:
        """
        Handle mode switch while preserving context.

        Args:
            session_id: Session identifier
            from_mode: Previous mode
            to_mode: New mode

        Returns:
            Conversation context for new mode
        """
        # Add mode switch event
        await self.add_event(
            session_id=session_id,
            event_type=EventType.MODE_SWITCH,
            data={
                "from_mode": from_mode.value,
                "to_mode": to_mode.value,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Return context for new mode
        return await self.get_context(session_id)

    async def extend_ttl(self, session_id: str) -> None:
        """Extend session TTL."""
        redis = await self._get_redis()
        if redis:
            try:
                await redis.expire(f"memory:{session_id}", self.SESSION_TTL)
                await redis.expire(f"events:{session_id}", self.SESSION_TTL)
            except Exception as e:
                logger.warning(f"Failed to extend TTL: {e}")

    async def delete_session(self, session_id: str) -> None:
        """Delete all memory for a session."""
        # Clear local cache
        self._local_cache.pop(session_id, None)
        self._events_cache.pop(session_id, None)

        # Clear Redis
        redis = await self._get_redis()
        if redis:
            try:
                await redis.delete(f"memory:{session_id}")
                await redis.delete(f"events:{session_id}")
            except Exception as e:
                logger.warning(f"Failed to delete session from Redis: {e}")

        logger.info(f"Session memory deleted: {session_id}")

    async def delete_user_memory(
        self,
        user_id: str,
        scope: Literal["session", "day", "all"] = "session",
    ) -> None:
        """
        Delete user's conversation memory.

        Args:
            user_id: User identifier
            scope: Deletion scope (session, day, or all)
        """
        # Find sessions for this user
        sessions_to_delete = []

        for session_id, entries in self._local_cache.items():
            if entries and entries[0].user_id == user_id:
                if scope == "all":
                    sessions_to_delete.append(session_id)
                elif scope == "day":
                    # Check if entries are from today
                    today = datetime.now(timezone.utc).date()
                    if any(e.timestamp.date() == today for e in entries):
                        sessions_to_delete.append(session_id)

        for session_id in sessions_to_delete:
            await self.delete_session(session_id)

        logger.info(f"Deleted memory for user {user_id}, scope: {scope}")

    async def get_user_settings(self, user_id: str) -> MemorySettings:
        """Get user's memory settings."""
        if user_id in self._settings_cache:
            return self._settings_cache[user_id]
        return MemorySettings()

    async def update_user_settings(
        self,
        user_id: str,
        settings: MemorySettings,
    ) -> None:
        """Update user's memory settings."""
        self._settings_cache[user_id] = settings

        # Persist to Redis
        redis = await self._get_redis()
        if redis:
            try:
                await redis.setex(
                    f"memory_settings:{user_id}",
                    86400 * 365,  # 1 year TTL
                    settings.model_dump_json(),
                )
            except Exception as e:
                logger.warning(f"Failed to persist settings: {e}")


async def build_llm_context(
    session_id: str,
    current_query: str,
    rag_results: List[Dict],
    memory_service: UnifiedMemoryService,
) -> List[Dict]:
    """
    Build context for LLM including memory.

    Args:
        session_id: Session identifier
        current_query: Current user query
        rag_results: RAG retrieval results
        memory_service: Unified memory service instance

    Returns:
        List of messages for LLM
    """
    # Get conversation history
    history = await memory_service.get_history(session_id, max_messages=10)

    # Get language switches
    language_events = await memory_service.get_events(session_id, EventType.LANGUAGE_SWITCH, limit=5)

    # Build messages array
    messages = []

    # Build system prompt with context
    system_content = "You are a helpful medical assistant."
    if language_events:
        recent_lang = language_events[-1].data.get("to_language", "en")
        system_content += f" The user's current language preference is {recent_lang}."

    if rag_results:
        context_texts = [f"[{i+1}] {r.get('content', '')}" for i, r in enumerate(rag_results[:5])]
        system_content += "\n\nRelevant context:\n" + "\n\n".join(context_texts)

    messages.append({"role": "system", "content": system_content})

    # Add conversation history
    for entry in history:
        messages.append(
            {
                "role": entry.role,
                "content": entry.content,
            }
        )

    # Add current query
    messages.append(
        {
            "role": "user",
            "content": current_query,
        }
    )

    return messages


# Singleton instance
_unified_memory_service: Optional[UnifiedMemoryService] = None


async def get_unified_memory_service() -> UnifiedMemoryService:
    """Get or create unified memory service instance."""
    global _unified_memory_service
    if _unified_memory_service is None:
        _unified_memory_service = UnifiedMemoryService()
    return _unified_memory_service
