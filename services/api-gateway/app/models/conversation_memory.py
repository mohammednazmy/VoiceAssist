"""
Conversation Memory Models for Voice Mode Intelligence

These models support multi-tier memory for natural conversations:

1. ConversationMemory - Short-term memory within a session
   - Active conversation context
   - Recent topics and entities
   - Emotional state tracking

2. UserContext - Medium-term memory across sessions
   - User preferences learned from interactions
   - Recurring topics of interest
   - Communication style preferences

3. UserSpeechProfile - Long-term speech patterns
   - Average WPM and speech pace
   - Pause patterns for turn-taking optimization
   - Preferred response timing

Phase: Voice Mode Intelligence Enhancement - Phase 4
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class ConversationMemory(Base):
    """
    Short-term memory for active conversation context.

    Stores recent context within a voice session for:
    - Topic continuity
    - Entity tracking (people, places, medical terms mentioned)
    - Emotional state progression
    - Reference resolution

    Retained for the duration of a session + 24 hours for follow-up.
    """

    __tablename__ = "conversation_memory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Memory type: "topic", "entity", "emotion", "reference", "context"
    memory_type = Column(String(50), nullable=False, index=True)

    # Memory content
    key = Column(String(255), nullable=False)  # e.g., "current_topic", "mentioned_person"
    value = Column(Text, nullable=False)  # The actual memory value
    memory_metadata = Column(
        "metadata", JSONB, default=dict
    )  # Additional context (confidence, source, etc.) - renamed to avoid SQLAlchemy reserved 'metadata'

    # Relevance tracking
    relevance_score = Column(Float, default=1.0)  # Decays over time
    access_count = Column(Integer, default=1)  # How often this memory was accessed
    last_accessed = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Auto-cleanup

    # Relationships
    user = relationship("User", backref="conversation_memories")

    def __repr__(self):
        return f"<ConversationMemory(type={self.memory_type}, key={self.key})>"

    def decay_relevance(self, decay_rate: float = 0.1) -> None:
        """Decay relevance score over time."""
        self.relevance_score = max(0.0, self.relevance_score - decay_rate)
        self.last_accessed = datetime.now(timezone.utc)

    def access(self) -> None:
        """Mark memory as accessed, boosting relevance."""
        self.access_count += 1
        self.relevance_score = min(1.0, self.relevance_score + 0.1)
        self.last_accessed = datetime.now(timezone.utc)


class UserContext(Base):
    """
    Medium-term context learned from user interactions.

    Stores persistent context about the user such as:
    - Topics they frequently discuss
    - Their knowledge level on subjects
    - Communication preferences (formal/casual, detailed/brief)
    - Recurring concerns or questions

    Updated after each session, retained indefinitely.
    """

    __tablename__ = "user_context"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Context category: "interest", "knowledge", "preference", "concern", "history"
    category = Column(String(50), nullable=False, index=True)

    # Context content
    key = Column(String(255), nullable=False)  # e.g., "medical_topics", "preferred_detail_level"
    value = Column(Text, nullable=False)
    confidence = Column(Float, default=0.5)  # How confident are we in this context
    context_metadata = Column("metadata", JSONB, default=dict)  # Renamed to avoid SQLAlchemy reserved 'metadata'

    # Learning tracking
    observation_count = Column(Integer, default=1)  # Times we've observed this
    last_confirmed = Column(DateTime(timezone=True), nullable=True)  # User confirmed this
    contradicted = Column(Boolean, default=False)  # User contradicted this

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", backref="user_contexts")

    # Unique constraint on user + category + key
    __table_args__ = (
        # Each user can only have one entry per category+key combination
        {"extend_existing": True},
    )

    def __repr__(self):
        return f"<UserContext(category={self.category}, key={self.key}, conf={self.confidence:.2f})>"

    def reinforce(self, boost: float = 0.1) -> None:
        """Reinforce this context when observed again."""
        self.observation_count += 1
        self.confidence = min(1.0, self.confidence + boost)
        self.updated_at = datetime.now(timezone.utc)

    def contradict(self) -> None:
        """Mark as contradicted, reducing confidence."""
        self.contradicted = True
        self.confidence = max(0.0, self.confidence - 0.3)
        self.updated_at = datetime.now(timezone.utc)


class UserSpeechProfile(Base):
    """
    Long-term speech pattern profile for a user.

    Stores learned speech characteristics for:
    - Optimal response timing (based on user's pace)
    - Turn-taking calibration
    - Backchannel frequency preferences
    - Barge-in sensitivity

    Updated incrementally after voice sessions.
    """

    __tablename__ = "user_speech_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Speech rate metrics
    avg_words_per_minute = Column(Float, default=140.0)  # Average WPM
    wpm_std_deviation = Column(Float, default=20.0)  # Variance in WPM
    min_observed_wpm = Column(Float, nullable=True)
    max_observed_wpm = Column(Float, nullable=True)

    # Pause patterns
    avg_pause_duration_ms = Column(Integer, default=300)  # Average pause
    typical_thinking_pause_ms = Column(Integer, default=800)  # Thinking pauses
    turn_yield_threshold_ms = Column(Integer, default=1500)  # When user yields turn

    # Response timing preferences (learned)
    preferred_response_delay_ms = Column(Integer, default=200)  # How long to wait
    backchannel_frequency = Column(Float, default=0.3)  # 0-1, how often to backchannel
    barge_in_sensitivity = Column(Float, default=0.5)  # 0-1, how sensitive

    # Voice characteristics (if voice auth enabled)
    voice_embedding = Column(JSONB, nullable=True)  # Voice fingerprint
    speaker_confidence = Column(Float, nullable=True)

    # Learning metadata
    total_voice_sessions = Column(Integer, default=0)
    total_utterances = Column(Integer, default=0)
    total_voice_minutes = Column(Float, default=0.0)
    last_voice_session = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", backref="speech_profile", uselist=False)

    def __repr__(self):
        return f"<UserSpeechProfile(user={self.user_id}, wpm={self.avg_words_per_minute:.0f})>"

    def update_from_session(
        self,
        wpm: float,
        avg_pause_ms: float,
        utterance_count: int,
        session_duration_min: float,
    ) -> None:
        """
        Update profile with data from a completed voice session.

        Uses exponential moving average for smooth updates.
        """
        # Exponential moving average weight
        alpha = 0.1 if self.total_voice_sessions > 10 else 0.3

        # Update WPM
        old_wpm = self.avg_words_per_minute
        self.avg_words_per_minute = (1 - alpha) * old_wpm + alpha * wpm

        # Update min/max
        if self.min_observed_wpm is None or wpm < self.min_observed_wpm:
            self.min_observed_wpm = wpm
        if self.max_observed_wpm is None or wpm > self.max_observed_wpm:
            self.max_observed_wpm = wpm

        # Update pause duration
        if avg_pause_ms > 0:
            self.avg_pause_duration_ms = int((1 - alpha) * self.avg_pause_duration_ms + alpha * avg_pause_ms)

        # Update counters
        self.total_voice_sessions += 1
        self.total_utterances += utterance_count
        self.total_voice_minutes += session_duration_min
        self.last_voice_session = datetime.now(timezone.utc)

    def get_optimal_response_timing(self) -> Dict[str, Any]:
        """
        Get optimal response timing parameters for this user.

        Returns dict with recommended values for:
        - response_delay_ms: Time to wait before responding
        - backchannel_interval_s: How often to interject verbal cues
        - barge_in_threshold: Energy threshold for interruption
        """
        # Faster speakers prefer quicker responses
        wpm_factor = max(0.5, min(1.5, 140 / self.avg_words_per_minute))

        return {
            "response_delay_ms": int(self.preferred_response_delay_ms * wpm_factor),
            "backchannel_interval_s": max(3, int(10 * (1 - self.backchannel_frequency))),
            "barge_in_threshold": self.barge_in_sensitivity,
            "turn_yield_ms": self.turn_yield_threshold_ms,
        }

    @classmethod
    def get_or_create(cls, db_session, user_id: uuid.UUID) -> "UserSpeechProfile":
        """Get existing profile or create new one with defaults."""
        profile = db_session.query(cls).filter(cls.user_id == user_id).first()
        if not profile:
            profile = cls(user_id=user_id)
            db_session.add(profile)
            db_session.commit()
            db_session.refresh(profile)
        return profile
