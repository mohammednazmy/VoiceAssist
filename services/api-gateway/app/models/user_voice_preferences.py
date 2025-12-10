"""
User Voice Preferences Model

Stores per-user voice settings including:
- TTS provider selection
- Voice selection for each provider
- Speech rate and quality parameters
- Behavior preferences
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship


class UserVoicePreferences(Base):
    """
    User voice preferences for TTS customization.

    Supports both OpenAI and ElevenLabs providers with full
    parameter control for voice quality and naturalness.
    """

    __tablename__ = "user_voice_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Provider selection
    tts_provider = Column(String(50), default="openai", nullable=False)  # "openai" or "elevenlabs"

    # Voice selection per provider
    openai_voice_id = Column(String(50), default="alloy", nullable=False)
    elevenlabs_voice_id = Column(String(100), nullable=True)

    # Speech control
    speech_rate = Column(Float, default=1.0, nullable=False)  # 0.5-2.0

    # ElevenLabs-specific parameters (tuned for natural, less robotic sound)
    stability = Column(Float, default=0.7, nullable=False)  # 0-1: higher = more consistent voice
    similarity_boost = Column(Float, default=0.8, nullable=False)  # 0-1: voice matching fidelity
    style = Column(Float, default=0.15, nullable=False)  # 0-1: adds subtle expression
    speaker_boost = Column(Boolean, default=True, nullable=False)  # Clarity enhancement

    # Behavior preferences
    auto_play = Column(Boolean, default=True, nullable=False)  # Auto-play TTS responses
    context_aware_style = Column(Boolean, default=True, nullable=False)  # Auto-adjust based on content
    preferred_language = Column(String(10), default="en", nullable=False)  # Language code

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="voice_preferences", uselist=False)

    def __repr__(self):
        return f"<UserVoicePreferences(user_id={self.user_id}, provider={self.tts_provider})>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "tts_provider": self.tts_provider,
            "openai_voice_id": self.openai_voice_id,
            "elevenlabs_voice_id": self.elevenlabs_voice_id,
            "speech_rate": self.speech_rate,
            "stability": self.stability,
            "similarity_boost": self.similarity_boost,
            "style": self.style,
            "speaker_boost": self.speaker_boost,
            "auto_play": self.auto_play,
            "context_aware_style": self.context_aware_style,
            "preferred_language": self.preferred_language,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def get_default_preferences(cls, user_id: uuid.UUID) -> "UserVoicePreferences":
        """Create a new preferences object with default values."""
        return cls(
            user_id=user_id,
            tts_provider="openai",
            openai_voice_id="alloy",
            speech_rate=1.0,
            stability=0.7,  # Higher for more consistent, natural voice
            similarity_boost=0.8,  # Better voice matching
            style=0.15,  # Subtle expression for less robotic sound
            speaker_boost=True,
            auto_play=True,
            context_aware_style=True,
            preferred_language="en",
        )
