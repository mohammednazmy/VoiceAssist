"""WebSocket Event Schemas for Realtime API.

This module defines explicit Pydantic schemas for all WebSocket events
to ensure type safety and consistent payload structure between backend and frontend.

Event Types:
- connected: Initial connection acknowledgment
- chunk: Text content chunk during streaming
- message.done: Final message with complete response and citations
- error: Error event with code and message
- ping/pong: Heartbeat events
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

# =============================================================================
# Citation Schema (matches frontend Citation type)
# =============================================================================


class CitationSchema(BaseModel):
    """Structured citation matching frontend Citation interface.

    Fields match apps/web-app/src/types.ts Citation interface.
    """

    id: str
    source: Optional[Literal["kb", "url", "pubmed", "doi"]] = None
    source_id: Optional[str] = Field(None, alias="sourceId")
    source_type: Optional[str] = Field(None, alias="sourceType")
    title: Optional[str] = None
    subtitle: Optional[str] = None
    location: Optional[str] = None
    reference: Optional[str] = None
    url: Optional[str] = None
    doi: Optional[str] = None
    pubmed_id: Optional[str] = Field(None, alias="pubmedId")
    page: Optional[int] = None
    authors: Optional[List[str]] = None
    publication_year: Optional[int] = Field(None, alias="publicationYear")
    snippet: Optional[str] = None  # Quoted text / excerpt
    relevance_score: Optional[int] = Field(None, alias="relevanceScore")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True  # Allow both snake_case and camelCase


# =============================================================================
# Message Schema
# =============================================================================


class MessageSchema(BaseModel):
    """Message object in WebSocket events."""

    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    citations: List[CitationSchema] = Field(default_factory=list)
    timestamp: int  # Unix timestamp in milliseconds


# =============================================================================
# WebSocket Events
# =============================================================================


class ConnectedEvent(BaseModel):
    """Initial connection acknowledgment event."""

    type: Literal["connected"] = "connected"
    client_id: str = Field(..., alias="clientId")
    timestamp: str  # ISO 8601 with 'Z' suffix
    protocol_version: str = Field(default="1.0", alias="protocolVersion")
    capabilities: List[str] = Field(default_factory=lambda: ["text_streaming"])

    class Config:
        populate_by_name = True


class ChunkEvent(BaseModel):
    """Text chunk during streaming."""

    type: Literal["chunk"] = "chunk"
    message_id: str = Field(..., alias="messageId")
    content: str

    class Config:
        populate_by_name = True


class MessageDoneEvent(BaseModel):
    """Final message with complete response and citations."""

    type: Literal["message.done"] = "message.done"
    message_id: str = Field(..., alias="messageId")
    message: MessageSchema
    timestamp: str  # ISO 8601 with 'Z' suffix

    class Config:
        populate_by_name = True


class ErrorEvent(BaseModel):
    """Error event."""

    type: Literal["error"] = "error"
    message_id: Optional[str] = Field(None, alias="messageId")
    timestamp: str  # ISO 8601 with 'Z' suffix
    error: Dict[str, str]  # {"code": "...", "message": "..."}

    class Config:
        populate_by_name = True


class PongEvent(BaseModel):
    """Heartbeat response."""

    type: Literal["pong"] = "pong"
    timestamp: str  # ISO 8601 with 'Z' suffix


# =============================================================================
# Client -> Server Events
# =============================================================================


class MessageSendEvent(BaseModel):
    """Client message send event."""

    type: Literal["message"] = "message"
    content: str
    session_id: Optional[str] = Field(None, alias="sessionId")
    clinical_context_id: Optional[str] = Field(None, alias="clinicalContextId")
    attachments: Optional[List[str]] = None

    class Config:
        populate_by_name = True


class PingEvent(BaseModel):
    """Client heartbeat ping."""

    type: Literal["ping"] = "ping"


# =============================================================================
# Helper Functions
# =============================================================================


def create_connected_event(
    client_id: str,
    timestamp: Optional[datetime] = None,
    protocol_version: str = "1.0",
    capabilities: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a connected event dict.

    Args:
        client_id: Client UUID
        timestamp: Event timestamp (defaults to now)
        protocol_version: Protocol version string
        capabilities: List of capabilities

    Returns:
        Dictionary ready for JSON serialization
    """
    if timestamp is None:
        timestamp = datetime.utcnow()
    if capabilities is None:
        capabilities = ["text_streaming"]

    event = ConnectedEvent(
        clientId=client_id,
        timestamp=timestamp.isoformat() + "Z",
        protocolVersion=protocol_version,
        capabilities=capabilities,
    )
    return event.model_dump(by_alias=True)


def create_chunk_event(message_id: str, content: str) -> Dict[str, Any]:
    """Create a chunk event dict.

    Args:
        message_id: Message UUID
        content: Text chunk

    Returns:
        Dictionary ready for JSON serialization
    """
    event = ChunkEvent(messageId=message_id, content=content)
    return event.model_dump(by_alias=True)


def create_message_done_event(
    message_id: str,
    role: str,
    content: str,
    citations: List[Dict[str, Any]],
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Create a message.done event dict.

    Args:
        message_id: Message UUID
        role: Message role (user/assistant/system)
        content: Complete message text
        citations: List of citation dicts
        timestamp: Event timestamp (defaults to now)

    Returns:
        Dictionary ready for JSON serialization
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    # Convert citations to CitationSchema instances
    citation_objects = [CitationSchema(**cite) for cite in citations]

    message = MessageSchema(
        id=message_id,
        role=role,
        content=content,
        citations=citation_objects,
        timestamp=int(timestamp.timestamp() * 1000),
    )

    event = MessageDoneEvent(
        messageId=message_id,
        message=message,
        timestamp=timestamp.isoformat() + "Z",
    )

    return event.model_dump(by_alias=True)


def create_error_event(
    error_code: str,
    error_message: str,
    message_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Create an error event dict.

    Args:
        error_code: Error code (e.g., "BACKEND_ERROR")
        error_message: Human-readable error message
        message_id: Optional message ID
        timestamp: Event timestamp (defaults to now)

    Returns:
        Dictionary ready for JSON serialization
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    event = ErrorEvent(
        messageId=message_id,
        timestamp=timestamp.isoformat() + "Z",
        error={"code": error_code, "message": error_message},
    )

    return event.model_dump(by_alias=True, exclude_none=True)


def create_pong_event(timestamp: Optional[datetime] = None) -> Dict[str, Any]:
    """Create a pong event dict.

    Args:
        timestamp: Event timestamp (defaults to now)

    Returns:
        Dictionary ready for JSON serialization
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    event = PongEvent(timestamp=timestamp.isoformat() + "Z")
    return event.model_dump(by_alias=True)
