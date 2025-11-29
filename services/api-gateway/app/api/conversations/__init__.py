"""Conversations API Module.

This module provides conversation-related API endpoints, split into logical submodules:
- schemas: Pydantic request/response models

For backward compatibility, the main router is still in conversations.py (parent directory).
This module structure prepares for gradual migration.
"""

from app.api.conversations.schemas import (
    BranchInfo,
    BranchResponse,
    ConversationResponse,
    ConversationSettingsSchema,
    ConversationsListResponse,
    CreateBranchRequest,
    CreateConversationRequest,
    CreateMessageRequest,
    EditMessageRequest,
    MessageResponse,
    MessagesListResponse,
    SessionEventResponse,
    UpdateConversationRequest,
)

__all__ = [
    # Conversations
    "CreateConversationRequest",
    "UpdateConversationRequest",
    "ConversationResponse",
    "ConversationsListResponse",
    # Branches
    "CreateBranchRequest",
    "BranchResponse",
    "BranchInfo",
    # Messages
    "MessageResponse",
    "MessagesListResponse",
    "CreateMessageRequest",
    "EditMessageRequest",
    # Events
    "SessionEventResponse",
    # Settings
    "ConversationSettingsSchema",
]
