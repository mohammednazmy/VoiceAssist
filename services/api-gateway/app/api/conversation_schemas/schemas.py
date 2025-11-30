"""Conversations API Pydantic Schemas.

Defines request and response models for conversation-related endpoints:
- Conversations: create, update, list
- Messages: create, edit, delete
- Branches: create, list, navigate
- Events: session event logging
- Settings: per-conversation settings
"""

from typing import List, Optional

from pydantic import BaseModel, Field

# =============================================================================
# Conversation Schemas
# =============================================================================


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation"""

    title: str = Field(..., description="Conversation title")
    folder_id: Optional[str] = Field(None, description="Optional folder ID to organize conversation")


class UpdateConversationRequest(BaseModel):
    """Request to update a conversation"""

    title: Optional[str] = Field(None, description="New conversation title")
    archived: Optional[bool] = Field(None, description="Archive status")
    folder_id: Optional[str] = Field(None, description="Move to folder")


class ConversationResponse(BaseModel):
    """Response containing conversation details"""

    id: str
    userId: str
    title: str
    archived: bool = False
    messageCount: int = 0
    folderId: Optional[str] = None
    createdAt: str
    updatedAt: str


class ConversationsListResponse(BaseModel):
    """Paginated list of conversations"""

    items: List[ConversationResponse]
    total: int
    page: int
    pageSize: int


# =============================================================================
# Branch Schemas
# =============================================================================


class CreateBranchRequest(BaseModel):
    """Request to create a new conversation branch"""

    parent_message_id: str = Field(..., description="UUID of the message to branch from")
    initial_message: Optional[str] = Field(None, description="Optional first message in the new branch")


class BranchResponse(BaseModel):
    """Response containing branch details"""

    branch_id: str = Field(..., description="Unique identifier for the branch")
    session_id: str = Field(..., description="Session (conversation) ID")
    parent_message_id: str = Field(..., description="Parent message UUID")
    created_at: str = Field(..., description="ISO 8601 timestamp")
    message_count: int = Field(default=0, description="Number of messages in branch")


class BranchInfo(BaseModel):
    """Information about a conversation branch"""

    branch_id: str = Field(..., description="Branch identifier")
    parent_message_id: Optional[str] = Field(None, description="Parent message UUID")
    message_count: int = Field(..., description="Number of messages in branch")
    created_at: str = Field(..., description="ISO 8601 timestamp of first message")
    last_activity: str = Field(..., description="ISO 8601 timestamp of last message")


# =============================================================================
# Message Schemas
# =============================================================================


class MessageResponse(BaseModel):
    """Message response with branching fields"""

    id: str
    session_id: str
    role: str
    content: str
    parent_message_id: Optional[str] = None
    branch_id: Optional[str] = None
    client_message_id: Optional[str] = None
    created_at: str
    tokens: Optional[int] = None
    model: Optional[str] = None
    is_duplicate: bool = False  # True if this was a duplicate idempotent request


class MessagesListResponse(BaseModel):
    """Paginated list of messages"""

    items: List[MessageResponse]
    total: int
    page: int
    pageSize: int


class CreateMessageRequest(BaseModel):
    """Request to create a new message with optional idempotency"""

    content: str = Field(..., description="Message content")
    role: str = Field(default="user", description="Message role (user, assistant, system)")
    branch_id: Optional[str] = Field(None, description="Branch ID for branched messages")
    parent_message_id: Optional[str] = Field(None, description="Parent message ID for threaded messages")
    client_message_id: Optional[str] = Field(
        None,
        description="Client-generated ID for idempotent message creation. "
        "If provided and a message with this ID already exists in the "
        "same conversation/branch, the existing message is returned.",
    )
    metadata: Optional[dict] = Field(None, description="Additional message metadata")


class EditMessageRequest(BaseModel):
    """Request to edit a message"""

    content: str = Field(..., description="New message content")


# =============================================================================
# Session Event Schemas
# =============================================================================


class SessionEventResponse(BaseModel):
    """Response schema for session events."""

    id: str
    conversation_id: str
    session_id: Optional[str] = None
    branch_id: Optional[str] = None
    event_type: str
    payload: Optional[dict] = None
    source: Optional[str] = None
    trace_id: Optional[str] = None
    created_at: str


# =============================================================================
# Conversation Settings Schemas
# =============================================================================


class ConversationSettingsSchema(BaseModel):
    """Schema for per-conversation settings."""

    llm_mode: Optional[str] = Field(
        None,
        description="LLM mode: 'default', 'creative', 'precise', 'balanced'",
    )
    system_prompt: Optional[str] = Field(
        None,
        description="Custom system prompt for this conversation",
    )
    voice_style: Optional[str] = Field(
        None,
        description="Voice style: 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'",
    )
    voice_speed: Optional[float] = Field(None, ge=0.5, le=2.0, description="Voice speed multiplier")
    language: Optional[str] = Field(None, description="Preferred language code (e.g., 'en', 'es', 'fr')")
    auto_tts: Optional[bool] = Field(None, description="Automatically read assistant responses aloud")
    context_window: Optional[int] = Field(
        None, ge=1, le=100, description="Number of previous messages to include as context"
    )
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="LLM temperature setting")
    max_tokens: Optional[int] = Field(None, ge=100, le=8000, description="Max tokens for responses")
    custom: Optional[dict] = Field(None, description="Custom settings for extensions")
