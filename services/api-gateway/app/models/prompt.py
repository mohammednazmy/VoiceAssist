"""Prompt and PromptVersion Models.

Provides dynamic AI prompt management with version history for controlled
updates to Chat and Voice mode system instructions.

Features:
- Support for intent-based prompts (diagnosis, treatment, etc.)
- Support for named personas (friendly_teacher, voice_assistant, etc.)
- Full version history with rollback capability
- Draft/Published workflow for sandbox testing
- Multi-level caching integration (L1/L2/L3)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class PromptType(str, Enum):
    """Prompt type classification."""

    CHAT = "chat"  # Chat API prompts (intent-based)
    VOICE = "voice"  # Realtime API prompts
    PERSONA = "persona"  # Named personas (can be used with either)
    SYSTEM = "system"  # General system prompts


class PromptStatus(str, Enum):
    """Prompt lifecycle status."""

    DRAFT = "draft"  # Being edited, not yet published
    PUBLISHED = "published"  # Active and in use
    ARCHIVED = "archived"  # Soft deleted, kept for history


# Standard intent categories matching llm_client.py
INTENT_CATEGORIES = [
    "diagnosis",
    "treatment",
    "drug",
    "guideline",
    "summary",
    "other",
]


class Prompt(Base):
    """AI Prompt/Persona configuration.

    Supports both intent-based prompts (e.g., "intent:diagnosis") and
    named personas (e.g., "persona:friendly_teacher").

    Attributes:
        id: Unique identifier (UUID)
        name: Unique identifier slug (e.g., "intent:diagnosis", "voice:default")
        display_name: Human-readable name
        description: Description of the prompt's purpose
        prompt_type: Type classification (chat, voice, persona, system)
        intent_category: For chat prompts, the intent category
        system_prompt: Current draft content being edited
        published_content: Currently active/live content
        status: Lifecycle status (draft, published, archived)
        is_active: Quick toggle for enabling/disabling
        current_version: Current version number
        metadata: Additional settings (voice config, temperature, etc.)
    """

    __tablename__ = "prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity
    name = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Classification
    prompt_type = Column(String(50), nullable=False, default=PromptType.CHAT.value, index=True)
    intent_category = Column(String(100), nullable=True, index=True)

    # Content - separate draft and published for sandbox testing
    system_prompt = Column(Text, nullable=False)  # Draft/working copy
    published_content = Column(Text, nullable=True)  # Currently live content

    # State Management
    status = Column(String(20), nullable=False, default=PromptStatus.DRAFT.value, index=True)
    is_active = Column(Boolean, nullable=False, default=True)

    # Version tracking
    current_version = Column(Integer, nullable=False, default=1)

    # Model settings (per-prompt overrides)
    temperature = Column(
        Float,
        nullable=True,
        default=0.7,
        comment="LLM temperature (0.0-2.0), higher = more creative",
    )
    max_tokens = Column(Integer, nullable=True, default=1024, comment="Maximum response tokens")
    model_name = Column(String(100), nullable=True, comment="Optional model override (e.g., 'gpt-4o')")

    # Metadata (voice settings, tags, etc.)
    prompt_metadata = Column("metadata", JSONB, nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    published_at = Column(DateTime(timezone=True), nullable=True)

    # User tracking
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    versions = relationship(
        "PromptVersion",
        back_populates="prompt",
        cascade="all, delete-orphan",
        order_by="desc(PromptVersion.version_number)",
    )
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="joined")
    updated_by = relationship("User", foreign_keys=[updated_by_id], lazy="joined")

    def __repr__(self) -> str:
        return f"<Prompt(name='{self.name}', type={self.prompt_type}, status={self.status})>"

    def to_dict(self) -> dict[str, Any]:
        """Convert model to dictionary for API responses and caching."""
        return {
            "id": str(self.id),
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "prompt_type": self.prompt_type,
            "intent_category": self.intent_category,
            "system_prompt": self.system_prompt,
            "published_content": self.published_content,
            "status": self.status,
            "is_active": self.is_active,
            "current_version": self.current_version,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "model_name": self.model_name,
            "metadata": self.prompt_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": (self.published_at.isoformat() if self.published_at else None),
            "created_by_id": str(self.created_by_id) if self.created_by_id else None,
            "updated_by_id": str(self.updated_by_id) if self.updated_by_id else None,
            "created_by_email": self.created_by.email if self.created_by else None,
            "updated_by_email": self.updated_by.email if self.updated_by else None,
        }

    def get_active_content(self) -> str:
        """Get the currently active content for this prompt.

        Returns published_content if available and status is published,
        otherwise returns the draft system_prompt.
        """
        if self.status == PromptStatus.PUBLISHED.value and self.published_content:
            return self.published_content
        return self.system_prompt


class PromptVersion(Base):
    """Immutable version history for prompts.

    Each version represents a snapshot of the prompt at a point in time.
    Used for audit trail and rollback capability.

    Attributes:
        id: Unique identifier (UUID)
        prompt_id: Reference to parent prompt
        version_number: Sequential version number
        system_prompt: Snapshot of content at this version
        change_summary: Description of what changed
        changed_by_id: User who made this change
        changed_by_email: Email of user (denormalized for convenience)
        status: Status at time of version creation
    """

    __tablename__ = "prompt_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("prompts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Version info
    version_number = Column(Integer, nullable=False)

    # Snapshot of content at this version
    system_prompt = Column(Text, nullable=False)
    prompt_type = Column(String(50), nullable=False)
    intent_category = Column(String(100), nullable=True)
    version_metadata = Column("metadata", JSONB, nullable=True)

    # Change tracking
    change_summary = Column(String(500), nullable=True)
    changed_by_id = Column(UUID(as_uuid=True), nullable=True)
    changed_by_email = Column(String(255), nullable=True)  # Denormalized

    # Status at time of version creation
    status = Column(String(20), nullable=False)

    # Timestamp
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    prompt = relationship("Prompt", back_populates="versions")

    # Unique constraint: one version number per prompt
    __table_args__ = (UniqueConstraint("prompt_id", "version_number", name="uq_prompt_version"),)

    def __repr__(self) -> str:
        return f"<PromptVersion(prompt_id={self.prompt_id}, version={self.version_number})>"

    def to_dict(self) -> dict[str, Any]:
        """Convert model to dictionary for API responses."""
        return {
            "id": str(self.id),
            "prompt_id": str(self.prompt_id),
            "version_number": self.version_number,
            "system_prompt": self.system_prompt,
            "prompt_type": self.prompt_type,
            "intent_category": self.intent_category,
            "metadata": self.version_metadata,
            "change_summary": self.change_summary,
            "changed_by_id": str(self.changed_by_id) if self.changed_by_id else None,
            "changed_by_email": self.changed_by_email,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
