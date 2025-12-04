"""
User Emotion Profile model for emotion personalization.

Stores user-specific emotional baselines for:
- Valence/arousal baseline learning
- Per-emotion baseline tracking
- Cultural sensitivity profiles
- Confidence level based on sample count
"""

import uuid
from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class UserEmotionProfile(Base):
    """
    User emotion baseline for personalization.

    Stores learned emotional baselines using exponential moving average.
    Used to detect significant deviations from user's normal emotional state.
    """

    __tablename__ = "user_emotion_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Valence baseline (-1 to 1: negative to positive)
    baseline_valence = Column(Float, default=0.0, nullable=False)
    baseline_valence_variance = Column(Float, default=0.3, nullable=False)

    # Arousal baseline (0 to 1: calm to excited)
    baseline_arousal = Column(Float, default=0.5, nullable=False)
    baseline_arousal_variance = Column(Float, default=0.2, nullable=False)

    # Per-emotion baselines (JSON: {emotion_name: baseline_score})
    emotion_baselines = Column(JSONB, default={}, nullable=False)

    # Cultural sensitivity profile for emotion interpretation
    # Options: western_individualist, eastern_collectivist, mediterranean, nordic, etc.
    cultural_profile = Column(String(50), default="western_individualist", nullable=False)

    # Sample count for confidence calculation
    total_samples = Column(Integer, default=0, nullable=False)

    # Confidence level (0 to 1, based on sample count)
    # Asymptotically approaches 1.0 as samples increase
    confidence_level = Column(Float, default=0.0, nullable=False)

    # Privacy settings
    tracking_enabled = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_sample_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", backref="emotion_profile")

    def __repr__(self):
        return f"<UserEmotionProfile(user_id={self.user_id}, confidence={self.confidence_level:.2f})>"

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "user_id": str(self.user_id),
            "baseline_valence": self.baseline_valence,
            "baseline_arousal": self.baseline_arousal,
            "emotion_baselines": self.emotion_baselines,
            "cultural_profile": self.cultural_profile,
            "total_samples": self.total_samples,
            "confidence_level": self.confidence_level,
            "tracking_enabled": self.tracking_enabled,
            "last_sample_at": (self.last_sample_at.isoformat() if self.last_sample_at else None),
        }


class UserProgressRecord(Base):
    """
    User progress tracking for resume functionality.

    Tracks reading/learning progress across resources.
    """

    __tablename__ = "user_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Resource identification
    resource_type = Column(String(50), nullable=False, index=True)  # book, article, module
    resource_id = Column(String(255), nullable=False, index=True)

    # Progress location (JSON: {page, section, chapter, timestamp, etc.})
    location = Column(JSONB, default={}, nullable=False)

    # Progress percentage (0-100)
    progress_percent = Column(Float, default=0.0, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_accessed = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user = relationship("User", backref="progress_records")

    # Unique constraint on user + resource
    __table_args__ = ({"sqlite_autoincrement": True},)

    def __repr__(self):
        return f"<UserProgressRecord(user_id={self.user_id}, resource={self.resource_type}:{self.resource_id})>"


class UserNote(Base):
    """
    User notes and highlights on resources.
    """

    __tablename__ = "user_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Resource identification
    resource_type = Column(String(50), nullable=False, index=True)
    resource_id = Column(String(255), nullable=False, index=True)

    # Location in resource (JSON: {page, paragraph, etc.})
    location = Column(JSONB, default={}, nullable=False)

    # Note content
    note_text = Column(String(4000), nullable=False)
    highlight_text = Column(String(1000), nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user = relationship("User", backref="notes")

    def __repr__(self):
        return f"<UserNote(user_id={self.user_id}, resource={self.resource_type}:{self.resource_id})>"


class RepairSessionHistory(Base):
    """
    Repair attempt history for analytics.
    """

    __tablename__ = "repair_session_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Repair details
    strategy = Column(String(50), nullable=False)
    transcript_before = Column(String(2000), nullable=True)
    transcript_after = Column(String(2000), nullable=True)
    resolved = Column(Boolean, default=False, nullable=False)

    # Context
    error_type = Column(String(50), nullable=True)
    emotion_state = Column(JSONB, nullable=True)
    escalation_level = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user = relationship("User", backref="repair_history")

    def __repr__(self):
        return f"<RepairSessionHistory(session_id={self.session_id}, strategy={self.strategy})>"
