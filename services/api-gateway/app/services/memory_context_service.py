"""
Memory Context Service - Conversational Memory Management

Provides multi-tier memory for natural voice conversations:
- Short-term: Active conversation context (topics, entities, emotions)
- Medium-term: User preferences and patterns
- Long-term: Speech profile for personalized timing

This service integrates with the voice pipeline to:
1. Track conversation context for coherent responses
2. Learn user preferences over time
3. Optimize response timing based on speech patterns

Phase: Voice Mode Intelligence Enhancement - Phase 4
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger
from app.models.conversation_memory import ConversationMemory, UserContext, UserSpeechProfile
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

logger = get_logger(__name__)


# ==============================================================================
# Memory Types and Constants
# ==============================================================================


class MemoryType:
    """Memory type categories for conversation memory."""

    TOPIC = "topic"  # Current/recent topics
    ENTITY = "entity"  # People, places, medical terms
    EMOTION = "emotion"  # Detected emotional states
    REFERENCE = "reference"  # "it", "that", etc. resolution
    CONTEXT = "context"  # General conversational context


class ContextCategory:
    """Categories for user context."""

    INTEREST = "interest"  # Topics they care about
    KNOWLEDGE = "knowledge"  # Their expertise level
    PREFERENCE = "preference"  # Communication preferences
    CONCERN = "concern"  # Recurring worries
    HISTORY = "history"  # Interaction history


# Memory TTL settings
SHORT_TERM_TTL_HOURS = 24  # Conversation memory expires after 24h
RELEVANCE_DECAY_RATE = 0.05  # Per-access decay


# ==============================================================================
# Short-Term Memory Manager
# ==============================================================================


class ConversationMemoryManager:
    """
    Manages short-term conversation memory for a session.

    Tracks:
    - Current topic
    - Recently mentioned entities
    - Emotional state progression
    - Reference resolution context
    """

    def __init__(self, session_id: uuid.UUID, user_id: uuid.UUID):
        self.session_id = session_id
        self.user_id = user_id
        self._local_cache: Dict[str, Any] = {}

    async def remember(
        self,
        memory_type: str,
        key: str,
        value: str,
        metadata: Optional[Dict] = None,
        db: Optional[AsyncSession] = None,
    ) -> None:
        """
        Store a memory for this conversation.

        Args:
            memory_type: Type of memory (topic, entity, emotion, etc.)
            key: Memory identifier
            value: Memory content
            metadata: Additional context
            db: Optional database session
        """
        # Store in local cache for quick access
        cache_key = f"{memory_type}:{key}"
        self._local_cache[cache_key] = {
            "value": value,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc),
        }

        # Persist to database
        if db:
            try:
                # Check if exists
                result = await db.execute(
                    select(ConversationMemory).where(
                        and_(
                            ConversationMemory.session_id == self.session_id,
                            ConversationMemory.memory_type == memory_type,
                            ConversationMemory.key == key,
                        )
                    )
                )
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing
                    existing.value = value
                    existing.metadata = metadata or {}
                    existing.access()
                else:
                    # Create new
                    memory = ConversationMemory(
                        session_id=self.session_id,
                        user_id=self.user_id,
                        memory_type=memory_type,
                        key=key,
                        value=value,
                        metadata=metadata or {},
                        expires_at=datetime.now(timezone.utc) + timedelta(hours=SHORT_TERM_TTL_HOURS),
                    )
                    db.add(memory)

                await db.commit()
            except Exception as e:
                logger.error(f"Failed to persist memory: {e}")
                await db.rollback()

    async def recall(
        self,
        memory_type: str,
        key: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> Optional[Dict]:
        """
        Recall memories from this conversation.

        Args:
            memory_type: Type of memory to recall
            key: Optional specific key to recall
            db: Optional database session

        Returns:
            Memory value or list of memories
        """
        # Check local cache first
        if key:
            cache_key = f"{memory_type}:{key}"
            if cache_key in self._local_cache:
                return self._local_cache[cache_key]

        # Query database
        if db:
            try:
                if key:
                    result = await db.execute(
                        select(ConversationMemory).where(
                            and_(
                                ConversationMemory.session_id == self.session_id,
                                ConversationMemory.memory_type == memory_type,
                                ConversationMemory.key == key,
                            )
                        )
                    )
                    memory = result.scalar_one_or_none()
                    if memory:
                        memory.access()
                        await db.commit()
                        return {
                            "value": memory.value,
                            "metadata": memory.metadata,
                            "relevance": memory.relevance_score,
                        }
                else:
                    # Get all memories of this type
                    result = await db.execute(
                        select(ConversationMemory)
                        .where(
                            and_(
                                ConversationMemory.session_id == self.session_id,
                                ConversationMemory.memory_type == memory_type,
                            )
                        )
                        .order_by(ConversationMemory.relevance_score.desc())
                    )
                    memories = result.scalars().all()
                    return [
                        {
                            "key": m.key,
                            "value": m.value,
                            "metadata": m.metadata,
                            "relevance": m.relevance_score,
                        }
                        for m in memories
                    ]
            except Exception as e:
                logger.error(f"Failed to recall memory: {e}")

        return None

    async def get_context_summary(self, db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        """
        Get a summary of current conversation context.

        Returns dict with:
        - current_topic: The main topic being discussed
        - recent_entities: Entities mentioned recently
        - emotional_state: Detected user emotion
        - context_items: Other relevant context
        """
        summary = {
            "current_topic": None,
            "recent_entities": [],
            "emotional_state": None,
            "context_items": [],
        }

        # Get from local cache first
        for cache_key, data in self._local_cache.items():
            memory_type, key = cache_key.split(":", 1)
            if memory_type == MemoryType.TOPIC:
                summary["current_topic"] = data["value"]
            elif memory_type == MemoryType.ENTITY:
                summary["recent_entities"].append(data["value"])
            elif memory_type == MemoryType.EMOTION:
                summary["emotional_state"] = data["value"]
            else:
                summary["context_items"].append({key: data["value"]})

        return summary

    def clear_cache(self) -> None:
        """Clear local cache (session ended)."""
        self._local_cache.clear()


# ==============================================================================
# Medium-Term Context Manager
# ==============================================================================


class UserContextManager:
    """
    Manages medium-term user context across sessions.

    Learns and tracks:
    - Topics of interest
    - Knowledge levels
    - Communication preferences
    - Recurring concerns
    """

    def __init__(self, user_id: uuid.UUID):
        self.user_id = user_id

    async def learn(
        self,
        category: str,
        key: str,
        value: str,
        confidence: float = 0.5,
        metadata: Optional[Dict] = None,
        db: Optional[AsyncSession] = None,
    ) -> None:
        """
        Learn a new piece of user context.

        If context already exists, reinforce or update it.
        """
        if not db:
            return

        try:
            result = await db.execute(
                select(UserContext).where(
                    and_(
                        UserContext.user_id == self.user_id,
                        UserContext.category == category,
                        UserContext.key == key,
                    )
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Reinforce if same value
                if existing.value == value:
                    existing.reinforce()
                else:
                    # Update with new value
                    existing.value = value
                    existing.confidence = confidence
                    existing.metadata = metadata or {}
            else:
                # Create new context
                context = UserContext(
                    user_id=self.user_id,
                    category=category,
                    key=key,
                    value=value,
                    confidence=confidence,
                    metadata=metadata or {},
                )
                db.add(context)

            await db.commit()
        except Exception as e:
            logger.error(f"Failed to learn user context: {e}")
            await db.rollback()

    async def query(
        self,
        category: Optional[str] = None,
        min_confidence: float = 0.3,
        db: Optional[AsyncSession] = None,
    ) -> List[Dict]:
        """
        Query user context.

        Args:
            category: Optional category filter
            min_confidence: Minimum confidence threshold
            db: Database session

        Returns:
            List of context items
        """
        if not db:
            return []

        try:
            query = select(UserContext).where(
                and_(
                    UserContext.user_id == self.user_id,
                    UserContext.confidence >= min_confidence,
                    UserContext.contradicted.is_(False),
                )
            )

            if category:
                query = query.where(UserContext.category == category)

            result = await db.execute(query.order_by(UserContext.confidence.desc()))
            contexts = result.scalars().all()

            return [
                {
                    "category": c.category,
                    "key": c.key,
                    "value": c.value,
                    "confidence": c.confidence,
                    "observations": c.observation_count,
                }
                for c in contexts
            ]
        except Exception as e:
            logger.error(f"Failed to query user context: {e}")
            return []

    async def get_preferences(self, db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        """
        Get user's communication preferences.

        Returns dict with:
        - detail_level: "brief" | "detailed" | "balanced"
        - formality: "formal" | "casual" | "adaptive"
        - response_style: Preferred response characteristics
        """
        defaults = {
            "detail_level": "balanced",
            "formality": "adaptive",
            "response_style": "informative",
            "topics_of_interest": [],
        }

        if not db:
            return defaults

        preferences = await self.query(
            category=ContextCategory.PREFERENCE,
            db=db,
        )

        for pref in preferences:
            if pref["key"] in defaults:
                defaults[pref["key"]] = pref["value"]

        # Get topics of interest
        interests = await self.query(
            category=ContextCategory.INTEREST,
            db=db,
        )
        defaults["topics_of_interest"] = [i["value"] for i in interests[:5]]

        return defaults


# ==============================================================================
# Speech Profile Manager
# ==============================================================================


class SpeechProfileManager:
    """
    Manages long-term speech profile for a user.

    Provides personalized timing parameters for:
    - Response delay
    - Backchannel frequency
    - Barge-in sensitivity
    """

    def __init__(self, user_id: uuid.UUID):
        self.user_id = user_id
        self._profile: Optional[UserSpeechProfile] = None

    async def load(self, db: Session) -> Optional[UserSpeechProfile]:
        """Load user's speech profile from database."""
        try:
            self._profile = UserSpeechProfile.get_or_create(db, self.user_id)
            return self._profile
        except Exception as e:
            logger.error(f"Failed to load speech profile: {e}")
            return None

    async def update_from_session(
        self,
        wpm: float,
        avg_pause_ms: float,
        utterance_count: int,
        session_duration_min: float,
        db: Session,
    ) -> None:
        """Update profile after a voice session."""
        if not self._profile:
            await self.load(db)

        if self._profile:
            self._profile.update_from_session(
                wpm=wpm,
                avg_pause_ms=avg_pause_ms,
                utterance_count=utterance_count,
                session_duration_min=session_duration_min,
            )
            db.commit()

    def get_optimal_timing(self) -> Dict[str, Any]:
        """Get optimal response timing for this user."""
        if self._profile:
            return self._profile.get_optimal_response_timing()

        # Defaults for new users
        return {
            "response_delay_ms": 200,
            "backchannel_interval_s": 7,
            "barge_in_threshold": 0.5,
            "turn_yield_ms": 1500,
        }


# ==============================================================================
# Memory Context Service
# ==============================================================================


class MemoryContextService:
    """
    Unified service for conversation memory and user context.

    Provides:
    - Session-scoped conversation memory
    - User-scoped context learning
    - Speech profile management
    """

    def __init__(self):
        self._conversation_managers: Dict[str, ConversationMemoryManager] = {}
        self._context_managers: Dict[str, UserContextManager] = {}
        self._profile_managers: Dict[str, SpeechProfileManager] = {}

    def get_conversation_memory(
        self,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> ConversationMemoryManager:
        """Get or create conversation memory manager for a session."""
        key = str(session_id)
        if key not in self._conversation_managers:
            self._conversation_managers[key] = ConversationMemoryManager(
                session_id=session_id,
                user_id=user_id,
            )
        return self._conversation_managers[key]

    def get_user_context(self, user_id: uuid.UUID) -> UserContextManager:
        """Get or create user context manager."""
        key = str(user_id)
        if key not in self._context_managers:
            self._context_managers[key] = UserContextManager(user_id=user_id)
        return self._context_managers[key]

    def get_speech_profile(self, user_id: uuid.UUID) -> SpeechProfileManager:
        """Get or create speech profile manager."""
        key = str(user_id)
        if key not in self._profile_managers:
            self._profile_managers[key] = SpeechProfileManager(user_id=user_id)
        return self._profile_managers[key]

    def end_session(self, session_id: uuid.UUID) -> None:
        """Clean up session-scoped resources."""
        key = str(session_id)
        if key in self._conversation_managers:
            self._conversation_managers[key].clear_cache()
            del self._conversation_managers[key]

    async def build_context_for_llm(
        self,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """
        Build comprehensive context for LLM prompt injection.

        Returns dict with:
        - conversation: Current conversation context
        - user: User preferences and context
        - timing: Optimal response timing
        """
        conv_memory = self.get_conversation_memory(session_id, user_id)
        user_context = self.get_user_context(user_id)
        speech_profile = self.get_speech_profile(user_id)

        return {
            "conversation": await conv_memory.get_context_summary(db),
            "user": await user_context.get_preferences(db),
            "timing": speech_profile.get_optimal_timing(),
        }


# Global service instance
memory_context_service = MemoryContextService()
