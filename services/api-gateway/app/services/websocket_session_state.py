"""
WebSocket Session State Service

Provides session state persistence for WebSocket error recovery.
Enables seamless reconnection with:
- Session state preservation (pipeline state, conversation context)
- Partial message recovery (buffered messages for replay)
- Audio checkpoint tracking (resume from last confirmed position)

Part of WebSocket Reliability Enhancement.
Feature Flag: backend.ws_session_recovery
"""

import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import redis.asyncio as redis
from app.core.config import settings

logger = logging.getLogger(__name__)


# ==============================================================================
# Constants
# ==============================================================================

# Redis key prefixes
WS_SESSION_KEY_PREFIX = "ws_session:"
WS_MESSAGE_BUFFER_KEY_PREFIX = "ws_msg_buffer:"
WS_AUDIO_CHECKPOINT_KEY_PREFIX = "ws_audio_ckpt:"

# Default TTL for session state (10 minutes)
DEFAULT_SESSION_TTL_SECONDS = 600

# Maximum messages to buffer for recovery
MAX_MESSAGE_BUFFER_SIZE = 100

# Maximum audio chunks to buffer for replay
MAX_AUDIO_BUFFER_SIZE = 50


# ==============================================================================
# Data Classes
# ==============================================================================


class SessionRecoveryState(str, Enum):
    """State of session recovery capability."""

    NONE = "none"  # No recovery data available
    PARTIAL = "partial"  # Some data available, partial recovery possible
    FULL = "full"  # Full session state available for recovery


@dataclass
class PartialMessage:
    """A partial message that was being processed during disconnect."""

    message_type: str  # transcript.delta, response.delta, etc.
    message_id: str
    accumulated_content: str
    sequence_start: int
    sequence_end: int
    timestamp: float
    is_complete: bool = False


@dataclass
class AudioCheckpoint:
    """Audio playback checkpoint for resume."""

    last_confirmed_seq: int  # Last sequence number confirmed by client
    pending_chunks: List[Dict[str, Any]] = field(default_factory=list)
    total_chunks_sent: int = 0
    playback_position_ms: int = 0


@dataclass
class ActiveToolCall:
    """Tool call in progress during disconnect."""

    tool_id: str
    tool_name: str
    arguments: Dict[str, Any]
    status: str  # pending, running, completed, failed
    result: Optional[Any] = None


@dataclass
class WebSocketSessionState:
    """
    Complete WebSocket session state for recovery.

    This is persisted to Redis and used to restore session
    state after a reconnection.
    """

    # Session identification
    session_id: str
    user_id: str
    conversation_id: Optional[str] = None

    # Connection state
    # Canonical voice/pipeline state (idle, listening, processing, speaking, cancelled, error)
    pipeline_state: str = "idle"
    connection_state: str = "disconnected"  # connected, ready, disconnected

    # Sequence tracking
    last_message_seq: int = 0
    last_audio_seq_in: int = 0
    last_audio_seq_out: int = 0

    # Partial message tracking
    partial_transcript: str = ""
    partial_response: str = ""
    partial_message_id: Optional[str] = None

    # Tool calls in progress
    active_tool_calls: List[Dict[str, Any]] = field(default_factory=list)

    # Audio checkpoint
    audio_checkpoint: Optional[Dict[str, Any]] = None

    # Timestamps
    created_at: float = 0.0
    updated_at: float = 0.0
    disconnected_at: Optional[float] = None

    # Voice settings (preserved across reconnects)
    voice_id: Optional[str] = None
    language: Optional[str] = None
    vad_sensitivity: Optional[float] = None

    # Privacy preferences for this session
    # When False, transcripts/responses are not persisted for recovery.
    store_transcript_history: bool = True

    # Recovery metadata
    recovery_attempts: int = 0
    last_recovery_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for Redis storage."""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "conversation_id": self.conversation_id,
            "pipeline_state": self.pipeline_state,
            "connection_state": self.connection_state,
            "last_message_seq": self.last_message_seq,
            "last_audio_seq_in": self.last_audio_seq_in,
            "last_audio_seq_out": self.last_audio_seq_out,
            "partial_transcript": self.partial_transcript,
            "partial_response": self.partial_response,
            "partial_message_id": self.partial_message_id,
            "active_tool_calls": self.active_tool_calls,
            "audio_checkpoint": self.audio_checkpoint,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "disconnected_at": self.disconnected_at,
            "voice_id": self.voice_id,
            "language": self.language,
            "vad_sensitivity": self.vad_sensitivity,
            "store_transcript_history": self.store_transcript_history,
            "recovery_attempts": self.recovery_attempts,
            "last_recovery_at": self.last_recovery_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WebSocketSessionState":
        """Create from dictionary (Redis retrieval)."""
        return cls(
            session_id=data.get("session_id", ""),
            user_id=data.get("user_id", ""),
            conversation_id=data.get("conversation_id"),
            pipeline_state=data.get("pipeline_state", "idle"),
            connection_state=data.get("connection_state", "disconnected"),
            last_message_seq=data.get("last_message_seq", 0),
            last_audio_seq_in=data.get("last_audio_seq_in", 0),
            last_audio_seq_out=data.get("last_audio_seq_out", 0),
            partial_transcript=data.get("partial_transcript", ""),
            partial_response=data.get("partial_response", ""),
            partial_message_id=data.get("partial_message_id"),
            active_tool_calls=data.get("active_tool_calls", []),
            audio_checkpoint=data.get("audio_checkpoint"),
            created_at=data.get("created_at", 0.0),
            updated_at=data.get("updated_at", 0.0),
            disconnected_at=data.get("disconnected_at"),
            voice_id=data.get("voice_id"),
            language=data.get("language"),
            vad_sensitivity=data.get("vad_sensitivity"),
            store_transcript_history=data.get("store_transcript_history", True),
            recovery_attempts=data.get("recovery_attempts", 0),
            last_recovery_at=data.get("last_recovery_at"),
        )


@dataclass
class SessionRecoveryResult:
    """Result of a session recovery attempt."""

    success: bool
    state: SessionRecoveryState
    session_state: Optional[WebSocketSessionState] = None
    missed_messages: List[Dict[str, Any]] = field(default_factory=list)
    audio_resume_seq: Optional[int] = None
    error: Optional[str] = None


# ==============================================================================
# WebSocket Session State Service
# ==============================================================================


class WebSocketSessionStateService:
    """
    Service for WebSocket session state persistence and recovery.

    Provides:
    - Session state storage in Redis
    - Message buffering for recovery
    - Audio checkpoint tracking
    - Graceful reconnection support
    """

    def __init__(
        self,
        session_ttl_seconds: int = DEFAULT_SESSION_TTL_SECONDS,
        max_message_buffer: int = MAX_MESSAGE_BUFFER_SIZE,
        max_audio_buffer: int = MAX_AUDIO_BUFFER_SIZE,
    ):
        """
        Initialize the session state service.

        Args:
            session_ttl_seconds: TTL for session state in Redis
            max_message_buffer: Maximum messages to buffer
            max_audio_buffer: Maximum audio chunks to buffer
        """
        self.redis_client: Optional[redis.Redis] = None
        self.session_ttl = session_ttl_seconds
        self.max_message_buffer = max_message_buffer
        self.max_audio_buffer = max_audio_buffer
        self._connected = False

    # ==========================================================================
    # Connection Management
    # ==========================================================================

    async def connect(self) -> bool:
        """
        Connect to Redis.

        Returns:
            True if connected successfully
        """
        if self._connected and self.redis_client:
            return True

        try:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            await self.redis_client.ping()
            self._connected = True
            logger.info("WebSocket session state service connected to Redis")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Redis for session state: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.redis_client:
            try:
                await self.redis_client.close()
            except Exception as e:
                logger.warning(f"Error closing Redis connection: {e}")
            finally:
                self.redis_client = None
                self._connected = False
                logger.info("WebSocket session state service disconnected")

    def _session_key(self, session_id: str) -> str:
        """Generate Redis key for session state."""
        return f"{WS_SESSION_KEY_PREFIX}{session_id}"

    def _message_buffer_key(self, session_id: str) -> str:
        """Generate Redis key for message buffer."""
        return f"{WS_MESSAGE_BUFFER_KEY_PREFIX}{session_id}"

    def _audio_checkpoint_key(self, session_id: str) -> str:
        """Generate Redis key for audio checkpoint."""
        return f"{WS_AUDIO_CHECKPOINT_KEY_PREFIX}{session_id}"

    # ==========================================================================
    # Session State Operations
    # ==========================================================================

    async def save_session_state(
        self,
        state: WebSocketSessionState,
        ttl_seconds: Optional[int] = None,
    ) -> bool:
        """
        Save session state to Redis.

        Args:
            state: Session state to save
            ttl_seconds: Optional custom TTL

        Returns:
            True if saved successfully
        """
        if not self._connected or not self.redis_client:
            logger.warning("Cannot save session state - Redis not connected")
            return False

        try:
            state.updated_at = time.time()
            key = self._session_key(state.session_id)
            ttl = ttl_seconds or self.session_ttl

            await self.redis_client.setex(
                name=key,
                time=ttl,
                value=json.dumps(state.to_dict()),
            )
            logger.debug(f"Saved session state: {state.session_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to save session state: {e}")
            return False

    async def get_session_state(
        self,
        session_id: str,
    ) -> Optional[WebSocketSessionState]:
        """
        Get session state from Redis.

        Args:
            session_id: Session ID to retrieve

        Returns:
            Session state or None if not found
        """
        if not self._connected or not self.redis_client:
            return None

        try:
            key = self._session_key(session_id)
            data = await self.redis_client.get(key)

            if data:
                return WebSocketSessionState.from_dict(json.loads(data))
            return None

        except Exception as e:
            logger.error(f"Failed to get session state: {e}")
            return None

    async def update_session_state(
        self,
        session_id: str,
        updates: Dict[str, Any],
    ) -> bool:
        """
        Update specific fields in session state.

        Args:
            session_id: Session ID to update
            updates: Dictionary of fields to update

        Returns:
            True if updated successfully
        """
        state = await self.get_session_state(session_id)
        if not state:
            logger.warning(f"Cannot update - session not found: {session_id}")
            return False

        # Apply updates
        for key, value in updates.items():
            if hasattr(state, key):
                setattr(state, key, value)

        return await self.save_session_state(state)

    async def delete_session_state(self, session_id: str) -> bool:
        """
        Delete session state from Redis.

        Args:
            session_id: Session ID to delete

        Returns:
            True if deleted successfully
        """
        if not self._connected or not self.redis_client:
            return False

        try:
            # Delete session state, message buffer, and audio checkpoint
            keys = [
                self._session_key(session_id),
                self._message_buffer_key(session_id),
                self._audio_checkpoint_key(session_id),
            ]
            await self.redis_client.delete(*keys)
            logger.debug(f"Deleted session state: {session_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete session state: {e}")
            return False

    async def mark_disconnected(self, session_id: str) -> bool:
        """
        Mark a session as disconnected (for potential recovery).

        Args:
            session_id: Session ID

        Returns:
            True if marked successfully
        """
        return await self.update_session_state(
            session_id,
            {
                "connection_state": "disconnected",
                "disconnected_at": time.time(),
            },
        )

    # ==========================================================================
    # Message Buffer Operations
    # ==========================================================================

    async def buffer_message(
        self,
        session_id: str,
        message: Dict[str, Any],
    ) -> bool:
        """
        Add a message to the buffer for potential recovery.

        Args:
            session_id: Session ID
            message: Message to buffer

        Returns:
            True if buffered successfully
        """
        if not self._connected or not self.redis_client:
            return False

        try:
            key = self._message_buffer_key(session_id)
            message_json = json.dumps(message)

            # Add to list and trim to max size
            await self.redis_client.rpush(key, message_json)
            await self.redis_client.ltrim(key, -self.max_message_buffer, -1)

            # Set TTL on buffer
            await self.redis_client.expire(key, self.session_ttl)

            return True

        except Exception as e:
            logger.error(f"Failed to buffer message: {e}")
            return False

    async def get_buffered_messages(
        self,
        session_id: str,
        from_seq: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get buffered messages for recovery.

        Args:
            session_id: Session ID
            from_seq: Only return messages with seq > from_seq

        Returns:
            List of buffered messages
        """
        if not self._connected or not self.redis_client:
            return []

        try:
            key = self._message_buffer_key(session_id)
            messages = await self.redis_client.lrange(key, 0, -1)

            result = []
            for msg_json in messages:
                msg = json.loads(msg_json)
                if msg.get("seq", 0) > from_seq:
                    result.append(msg)

            return result

        except Exception as e:
            logger.error(f"Failed to get buffered messages: {e}")
            return []

    async def clear_message_buffer(self, session_id: str) -> bool:
        """
        Clear the message buffer for a session.

        Args:
            session_id: Session ID

        Returns:
            True if cleared successfully
        """
        if not self._connected or not self.redis_client:
            return False

        try:
            key = self._message_buffer_key(session_id)
            await self.redis_client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Failed to clear message buffer: {e}")
            return False

    # ==========================================================================
    # Audio Checkpoint Operations
    # ==========================================================================

    async def save_audio_checkpoint(
        self,
        session_id: str,
        checkpoint: AudioCheckpoint,
    ) -> bool:
        """
        Save audio checkpoint for resume capability.

        Args:
            session_id: Session ID
            checkpoint: Audio checkpoint data

        Returns:
            True if saved successfully
        """
        if not self._connected or not self.redis_client:
            return False

        try:
            key = self._audio_checkpoint_key(session_id)
            data = {
                "last_confirmed_seq": checkpoint.last_confirmed_seq,
                "pending_chunks": checkpoint.pending_chunks[-self.max_audio_buffer :],
                "total_chunks_sent": checkpoint.total_chunks_sent,
                "playback_position_ms": checkpoint.playback_position_ms,
            }

            await self.redis_client.setex(
                name=key,
                time=self.session_ttl,
                value=json.dumps(data),
            )
            return True

        except Exception as e:
            logger.error(f"Failed to save audio checkpoint: {e}")
            return False

    async def get_audio_checkpoint(
        self,
        session_id: str,
    ) -> Optional[AudioCheckpoint]:
        """
        Get audio checkpoint for resume.

        Args:
            session_id: Session ID

        Returns:
            Audio checkpoint or None if not found
        """
        if not self._connected or not self.redis_client:
            return None

        try:
            key = self._audio_checkpoint_key(session_id)
            data = await self.redis_client.get(key)

            if data:
                parsed = json.loads(data)
                return AudioCheckpoint(
                    last_confirmed_seq=parsed.get("last_confirmed_seq", 0),
                    pending_chunks=parsed.get("pending_chunks", []),
                    total_chunks_sent=parsed.get("total_chunks_sent", 0),
                    playback_position_ms=parsed.get("playback_position_ms", 0),
                )
            return None

        except Exception as e:
            logger.error(f"Failed to get audio checkpoint: {e}")
            return None

    async def update_audio_confirmed(
        self,
        session_id: str,
        confirmed_seq: int,
    ) -> bool:
        """
        Update the last confirmed audio sequence.

        Called when client acknowledges receipt of audio.

        Args:
            session_id: Session ID
            confirmed_seq: Confirmed sequence number

        Returns:
            True if updated successfully
        """
        checkpoint = await self.get_audio_checkpoint(session_id)
        if not checkpoint:
            checkpoint = AudioCheckpoint(last_confirmed_seq=confirmed_seq)
        else:
            checkpoint.last_confirmed_seq = confirmed_seq
            # Remove confirmed chunks from pending
            checkpoint.pending_chunks = [c for c in checkpoint.pending_chunks if c.get("seq", 0) > confirmed_seq]

        return await self.save_audio_checkpoint(session_id, checkpoint)

    async def add_pending_audio_chunk(
        self,
        session_id: str,
        chunk: Dict[str, Any],
    ) -> bool:
        """
        Add an audio chunk to the pending buffer.

        Args:
            session_id: Session ID
            chunk: Audio chunk data with sequence number

        Returns:
            True if added successfully
        """
        checkpoint = await self.get_audio_checkpoint(session_id)
        if not checkpoint:
            checkpoint = AudioCheckpoint(last_confirmed_seq=0)

        checkpoint.pending_chunks.append(chunk)
        checkpoint.total_chunks_sent += 1

        return await self.save_audio_checkpoint(session_id, checkpoint)

    # ==========================================================================
    # Session Recovery
    # ==========================================================================

    async def attempt_recovery(
        self,
        session_id: str,
        user_id: str,
        last_known_seq: int = 0,
    ) -> SessionRecoveryResult:
        """
        Attempt to recover a session after reconnection.

        Args:
            session_id: Session ID to recover
            user_id: User ID (for validation)
            last_known_seq: Client's last known message sequence

        Returns:
            SessionRecoveryResult with recovery data
        """
        # Get session state
        state = await self.get_session_state(session_id)

        if not state:
            return SessionRecoveryResult(
                success=False,
                state=SessionRecoveryState.NONE,
                error="No session state found",
            )

        # Validate user
        if state.user_id != user_id:
            return SessionRecoveryResult(
                success=False,
                state=SessionRecoveryState.NONE,
                error="User ID mismatch",
            )

        # Check if session is too old
        if state.disconnected_at:
            age = time.time() - state.disconnected_at
            if age > self.session_ttl:
                return SessionRecoveryResult(
                    success=False,
                    state=SessionRecoveryState.NONE,
                    error="Session expired",
                )

        # Get missed messages
        missed_messages = await self.get_buffered_messages(session_id, last_known_seq)

        # Get audio checkpoint
        audio_checkpoint = await self.get_audio_checkpoint(session_id)
        audio_resume_seq = None
        if audio_checkpoint:
            audio_resume_seq = audio_checkpoint.last_confirmed_seq

        # Determine recovery state
        if missed_messages or state.partial_transcript or state.partial_response:
            recovery_state = SessionRecoveryState.FULL
        elif state.conversation_id:
            recovery_state = SessionRecoveryState.PARTIAL
        else:
            recovery_state = SessionRecoveryState.NONE

        # Update recovery metadata
        state.recovery_attempts += 1
        state.last_recovery_at = time.time()
        state.connection_state = "connected"
        await self.save_session_state(state)

        return SessionRecoveryResult(
            success=True,
            state=recovery_state,
            session_state=state,
            missed_messages=missed_messages,
            audio_resume_seq=audio_resume_seq,
        )

    async def create_session(
        self,
        session_id: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        voice_id: Optional[str] = None,
        language: Optional[str] = None,
        store_transcript_history: bool = True,
    ) -> WebSocketSessionState:
        """
        Create a new session state.

        Args:
            session_id: Session ID
            user_id: User ID
            conversation_id: Optional conversation ID
            voice_id: Optional voice ID
            language: Optional language code

        Returns:
            Created session state
        """
        now = time.time()
        state = WebSocketSessionState(
            session_id=session_id,
            user_id=user_id,
            conversation_id=conversation_id,
            connection_state="connected",
            created_at=now,
            updated_at=now,
            voice_id=voice_id,
            language=language,
            store_transcript_history=store_transcript_history,
        )

        await self.save_session_state(state)
        return state

    # ==========================================================================
    # Partial Message Tracking
    # ==========================================================================

    async def update_partial_transcript(
        self,
        session_id: str,
        text: str,
        message_id: Optional[str] = None,
    ) -> bool:
        """
        Update the partial transcript being accumulated.

        Args:
            session_id: Session ID
            text: Current accumulated transcript text
            message_id: Optional message ID

        Returns:
            True if updated successfully
        """
        return await self.update_session_state(
            session_id,
            {
                "partial_transcript": text,
                "partial_message_id": message_id,
            },
        )

    async def update_partial_response(
        self,
        session_id: str,
        text: str,
        message_id: Optional[str] = None,
    ) -> bool:
        """
        Update the partial AI response being accumulated.

        Args:
            session_id: Session ID
            text: Current accumulated response text
            message_id: Optional message ID

        Returns:
            True if updated successfully
        """
        return await self.update_session_state(
            session_id,
            {
                "partial_response": text,
                "partial_message_id": message_id,
            },
        )

    async def clear_partial_messages(self, session_id: str) -> bool:
        """
        Clear partial message state (after completion).

        Args:
            session_id: Session ID

        Returns:
            True if cleared successfully
        """
        return await self.update_session_state(
            session_id,
            {
                "partial_transcript": "",
                "partial_response": "",
                "partial_message_id": None,
            },
        )

    # ==========================================================================
    # Tool Call Tracking
    # ==========================================================================

    async def add_tool_call(
        self,
        session_id: str,
        tool_call: ActiveToolCall,
    ) -> bool:
        """
        Add an active tool call to the session.

        Args:
            session_id: Session ID
            tool_call: Tool call to add

        Returns:
            True if added successfully
        """
        state = await self.get_session_state(session_id)
        if not state:
            return False

        state.active_tool_calls.append(
            {
                "tool_id": tool_call.tool_id,
                "tool_name": tool_call.tool_name,
                "arguments": tool_call.arguments,
                "status": tool_call.status,
                "result": tool_call.result,
            }
        )

        return await self.save_session_state(state)

    async def update_tool_call(
        self,
        session_id: str,
        tool_id: str,
        status: str,
        result: Optional[Any] = None,
    ) -> bool:
        """
        Update a tool call status.

        Args:
            session_id: Session ID
            tool_id: Tool call ID
            status: New status
            result: Optional result

        Returns:
            True if updated successfully
        """
        state = await self.get_session_state(session_id)
        if not state:
            return False

        for tool_call in state.active_tool_calls:
            if tool_call.get("tool_id") == tool_id:
                tool_call["status"] = status
                if result is not None:
                    tool_call["result"] = result
                break

        return await self.save_session_state(state)

    async def clear_completed_tool_calls(self, session_id: str) -> bool:
        """
        Clear completed/failed tool calls from the session.

        Args:
            session_id: Session ID

        Returns:
            True if cleared successfully
        """
        state = await self.get_session_state(session_id)
        if not state:
            return False

        state.active_tool_calls = [
            tc for tc in state.active_tool_calls if tc.get("status") not in ("completed", "failed")
        ]

        return await self.save_session_state(state)


# ==============================================================================
# Global Instance
# ==============================================================================

websocket_session_state_service = WebSocketSessionStateService()
