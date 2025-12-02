"""
Voice Pipeline Service - Thinker/Talker Orchestrator

Orchestrates the complete voice interaction flow:
    Audio Input → STT → Thinker (LLM) → Talker (TTS) → Audio Output

Features:
- Streaming at every stage for low latency
- Unified conversation context across voice and chat
- Barge-in support (interrupt AI response)
- State machine for session management
- Metrics collection

Phase: Thinker/Talker Voice Pipeline Migration
"""

import asyncio
import base64
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.core.logging import get_logger
from app.services.streaming_stt_service import (
    DeepgramStreamingSession,
    StreamingSTTService,
    STTSessionConfig,
    streaming_stt_service,
)
from app.services.talker_service import AudioChunk, TalkerService, TalkerSession, VoiceConfig, talker_service
from app.services.thinker_service import ThinkerService, ThinkerSession, ToolCallEvent, ToolResultEvent, thinker_service

logger = get_logger(__name__)


# ==============================================================================
# Data Classes and Enums
# ==============================================================================


class PipelineState(str, Enum):
    """State of the voice pipeline."""

    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class PipelineConfig:
    """Configuration for the voice pipeline."""

    # STT settings
    stt_language: str = "en"
    stt_sample_rate: int = 16000
    # Endpointing: 800ms allows natural speech pauses (was 200ms - too aggressive)
    stt_endpointing_ms: int = 800
    # Utterance end: 1500ms wait after speech stops before finalizing
    stt_utterance_end_ms: int = 1500

    # LLM settings
    max_response_tokens: int = 1024
    temperature: float = 0.7

    # TTS settings
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"  # Josh (premium male voice)
    tts_model: str = "eleven_flash_v2_5"  # Better quality + low latency
    tts_output_format: str = "pcm_24000"  # Raw PCM for low-latency streaming

    # Voice quality parameters
    stability: float = 0.65
    similarity_boost: float = 0.80
    style: float = 0.15

    # Barge-in settings
    barge_in_enabled: bool = True


@dataclass
class PipelineMessage:
    """A message to send to the client via WebSocket."""

    type: str
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineMetrics:
    """Metrics for a pipeline session."""

    session_id: str = ""
    start_time: float = 0.0
    end_time: float = 0.0

    # Latency breakdown
    stt_latency_ms: int = 0
    first_token_latency_ms: int = 0
    tts_latency_ms: int = 0
    total_latency_ms: int = 0

    # Counts
    audio_chunks_received: int = 0
    audio_chunks_sent: int = 0
    tokens_generated: int = 0
    tool_calls_count: int = 0

    # State
    cancelled: bool = False
    error: Optional[str] = None


# ==============================================================================
# Voice Pipeline Session
# ==============================================================================


class VoicePipelineSession:
    """
    A single voice interaction session.

    Manages the complete flow:
    1. Receive audio chunks from client
    2. Stream to STT for transcription
    3. On speech end, send to Thinker for response
    4. Stream Thinker tokens to Talker for TTS
    5. Stream TTS audio back to client
    """

    def __init__(
        self,
        session_id: str,
        conversation_id: str,
        config: PipelineConfig,
        stt_service: StreamingSTTService,
        thinker_service: ThinkerService,
        talker_service: TalkerService,
        on_message: Callable[[PipelineMessage], Awaitable[None]],
        user_id: Optional[str] = None,
    ):
        self.session_id = session_id
        self.conversation_id = conversation_id
        self.config = config
        self.user_id = user_id  # User ID for tool authentication
        self._stt_service = stt_service
        self._thinker_service = thinker_service
        self._talker_service = talker_service
        self._on_message = on_message

        # Session components
        self._stt_session: Optional[DeepgramStreamingSession] = None
        self._thinker_session: Optional[ThinkerSession] = None
        self._talker_session: Optional[TalkerSession] = None

        # State
        self._state = PipelineState.IDLE
        self._cancelled = False

        # Transcript accumulation
        self._partial_transcript = ""
        self._final_transcript = ""

        # Metrics
        self._metrics = PipelineMetrics(session_id=session_id)

        # Locks for thread safety
        self._state_lock = asyncio.Lock()

    @property
    def state(self) -> PipelineState:
        """Get current pipeline state."""
        return self._state

    def is_cancelled(self) -> bool:
        """Check if session was cancelled."""
        return self._cancelled

    async def start(self) -> bool:
        """
        Start the voice pipeline session.

        Returns:
            True if started successfully
        """
        async with self._state_lock:
            if self._state != PipelineState.IDLE:
                logger.warning(f"Cannot start pipeline in state {self._state}")
                return False

            self._metrics.start_time = time.time()

            try:
                # Create STT session with lenient endpointing for natural speech
                self._stt_session = await self._stt_service.create_session(
                    on_partial=self._handle_partial_transcript,
                    on_final=self._handle_final_transcript,
                    on_endpoint=self._handle_speech_end,
                    config=STTSessionConfig(
                        language=self.config.stt_language,
                        sample_rate=self.config.stt_sample_rate,
                        endpointing_ms=self.config.stt_endpointing_ms,
                        utterance_end_ms=self.config.stt_utterance_end_ms,
                    ),
                )

                # Start STT
                if not await self._stt_session.start():
                    raise RuntimeError("Failed to start STT session")

                # Create Thinker session with user_id for tool authentication
                self._thinker_session = self._thinker_service.create_session(
                    conversation_id=self.conversation_id,
                    on_token=self._handle_llm_token,
                    on_tool_call=self._handle_tool_call,
                    on_tool_result=self._handle_tool_result,
                    user_id=self.user_id,
                )

                self._state = PipelineState.LISTENING

                # Notify client
                await self._send_state_update()

                logger.info(f"Voice pipeline started: {self.session_id}")
                return True

            except Exception as e:
                logger.error(f"Failed to start pipeline: {e}")
                self._state = PipelineState.ERROR
                self._metrics.error = str(e)
                return False

    async def send_audio(self, audio_data: bytes) -> None:
        """
        Send audio data to the pipeline.

        Args:
            audio_data: Raw PCM16 audio bytes
        """
        if self._cancelled or self._state not in (PipelineState.LISTENING, PipelineState.IDLE):
            if self._metrics.audio_chunks_received == 0:
                logger.warning(f"Dropping audio - state: {self._state}, cancelled: {self._cancelled}")
            return

        self._metrics.audio_chunks_received += 1

        # Log every 100 chunks to confirm audio flow
        if self._metrics.audio_chunks_received % 100 == 0:
            logger.debug(f"Audio chunk #{self._metrics.audio_chunks_received}, {len(audio_data)} bytes")

        if self._stt_session:
            await self._stt_session.send_audio(audio_data)

    async def send_audio_base64(self, audio_b64: str) -> None:
        """
        Send base64-encoded audio to the pipeline.

        Args:
            audio_b64: Base64-encoded PCM16 audio
        """
        try:
            audio_data = base64.b64decode(audio_b64)
            # Debug: log every 50th chunk at base64 level
            if not hasattr(self, "_b64_chunk_count"):
                self._b64_chunk_count = 0
            self._b64_chunk_count += 1
            if self._b64_chunk_count % 50 == 0:
                logger.debug(
                    f"[Pipeline] B64 chunk #{self._b64_chunk_count}, "
                    f"decoded {len(audio_data)} bytes, state={self._state}"
                )
            await self.send_audio(audio_data)
        except Exception as e:
            logger.error(f"Failed to decode audio: {e}")

    async def commit_audio(self) -> None:
        """
        Signal that the current audio input is complete.

        This triggers immediate processing without waiting for VAD.
        """
        if self._stt_session and self._state == PipelineState.LISTENING:
            # Stop STT and get final transcript
            final = await self._stt_session.stop()
            if final:
                self._final_transcript = final
            await self._process_transcript()

    async def barge_in(self) -> None:
        """
        Handle barge-in (user interrupts AI).

        Cancels current TTS and prepares for new input.
        """
        if not self.config.barge_in_enabled:
            return

        logger.info(f"Barge-in triggered: {self.session_id}")

        async with self._state_lock:
            self._metrics.cancelled = True

            # Cancel Talker if speaking
            if self._talker_session:
                await self._talker_session.cancel()

            # Cancel Thinker if processing
            if self._thinker_session:
                await self._thinker_session.cancel()

            # Reset to listening state
            self._state = PipelineState.LISTENING
            self._partial_transcript = ""
            self._final_transcript = ""

            # Restart STT for new input
            if self._stt_session:
                await self._stt_session.stop()

            self._stt_session = await self._stt_service.create_session(
                on_partial=self._handle_partial_transcript,
                on_final=self._handle_final_transcript,
                on_endpoint=self._handle_speech_end,
            )
            await self._stt_session.start()

            await self._send_state_update()

    async def stop(self) -> PipelineMetrics:
        """
        Stop the pipeline session.

        Returns:
            PipelineMetrics with session statistics
        """
        self._cancelled = True
        self._metrics.end_time = time.time()
        self._metrics.total_latency_ms = int((self._metrics.end_time - self._metrics.start_time) * 1000)

        # Stop all components
        if self._stt_session:
            await self._stt_session.stop()

        if self._talker_session:
            await self._talker_session.cancel()

        if self._thinker_session:
            await self._thinker_session.cancel()

        self._state = PipelineState.IDLE

        logger.info(
            f"Voice pipeline stopped: {self.session_id}",
            extra={
                "total_latency_ms": self._metrics.total_latency_ms,
                "audio_chunks": self._metrics.audio_chunks_received,
            },
        )

        return self._metrics

    # ==========================================================================
    # Internal Handlers
    # ==========================================================================

    async def _handle_partial_transcript(self, text: str, confidence: float) -> None:
        """Handle partial transcript from STT."""
        logger.info(f"[Pipeline] Partial transcript received: '{text}' (conf={confidence:.2f})")
        self._partial_transcript = text

        await self._on_message(
            PipelineMessage(
                type="transcript.delta",
                data={
                    "text": text,
                    "is_final": False,
                    "confidence": confidence,
                },
            )
        )

    async def _handle_final_transcript(self, text: str) -> None:
        """Handle final transcript segment from STT."""
        logger.info(f"[Pipeline] Final transcript received: '{text}'")
        if self._final_transcript:
            self._final_transcript += " " + text
        else:
            self._final_transcript = text

        # NOTE: Don't emit transcript.delta with is_final=True here.
        # The transcript.complete message in _process_transcript() is the
        # authoritative final transcript. Emitting both causes duplicate
        # messages in the chat UI.

    async def _handle_speech_end(self) -> None:
        """Handle speech endpoint detection from STT."""
        logger.info(f"[Pipeline] Speech end detected: {self.session_id}, accumulated='{self._final_transcript}'")

        # Get final transcript from STT
        if self._stt_session:
            final = await self._stt_session.stop()
            if final and final != self._final_transcript:
                self._final_transcript = final

        await self._process_transcript()

    async def _process_transcript(self) -> None:
        """Process the completed transcript through Thinker and Talker."""
        if not self._final_transcript or not self._final_transcript.strip():
            logger.debug("Empty transcript, skipping processing")
            self._state = PipelineState.LISTENING
            return

        async with self._state_lock:
            self._state = PipelineState.PROCESSING
            await self._send_state_update()

        transcript = self._final_transcript.strip()
        self._metrics.stt_latency_ms = int((time.time() - self._metrics.start_time) * 1000)

        # Send final transcript
        message_id = str(uuid.uuid4())
        await self._on_message(
            PipelineMessage(
                type="transcript.complete",
                data={
                    "text": transcript,
                    "message_id": message_id,
                },
            )
        )

        # Reset for next utterance
        self._partial_transcript = ""
        self._final_transcript = ""

        # Create Talker session for TTS
        voice_config = VoiceConfig(
            voice_id=self.config.voice_id,
            model_id=self.config.tts_model,
            output_format=self.config.tts_output_format,
        )

        self._talker_session = await self._talker_service.start_session(
            on_audio_chunk=self._handle_audio_chunk,
            voice_config=voice_config,
        )

        # Process through Thinker
        try:
            if self._thinker_session:
                response = await self._thinker_session.think(
                    user_input=transcript,
                    source_mode="voice",
                )

                self._metrics.tokens_generated = response.tokens_used
                self._metrics.tool_calls_count = len(response.tool_calls_made)

                # Send response complete
                await self._on_message(
                    PipelineMessage(
                        type="response.complete",
                        data={
                            "text": response.text,
                            "message_id": message_id,
                            "citations": response.citations,
                        },
                    )
                )

        except Exception as e:
            logger.error(f"Thinker error: {e}")
            await self._on_message(
                PipelineMessage(
                    type="error",
                    data={
                        "code": "thinker_error",
                        "message": str(e),
                        "recoverable": True,
                    },
                )
            )

        # Finish TTS
        if self._talker_session:
            await self._talker_session.finish()

        # Return to listening
        async with self._state_lock:
            self._state = PipelineState.LISTENING

            # Restart STT for next input
            self._stt_session = await self._stt_service.create_session(
                on_partial=self._handle_partial_transcript,
                on_final=self._handle_final_transcript,
                on_endpoint=self._handle_speech_end,
            )
            await self._stt_session.start()

            await self._send_state_update()

    async def _handle_llm_token(self, token: str) -> None:
        """Handle token from Thinker, feed to Talker."""
        if self._cancelled:
            return

        # Track first token latency
        if self._metrics.first_token_latency_ms == 0:
            self._metrics.first_token_latency_ms = int((time.time() - self._metrics.start_time) * 1000)
            logger.info(f"First token latency: {self._metrics.first_token_latency_ms}ms")

        # Send token to client for display
        await self._on_message(
            PipelineMessage(
                type="response.delta",
                data={"text": token},
            )
        )

        # Feed to Talker for TTS
        if self._talker_session and not self._talker_session.is_cancelled():
            await self._talker_session.add_token(token)

    async def _handle_audio_chunk(self, chunk: AudioChunk) -> None:
        """Handle audio chunk from Talker."""
        if self._cancelled:
            return

        self._metrics.audio_chunks_sent += 1

        # Track TTS latency (first audio)
        if self._metrics.tts_latency_ms == 0 and chunk.data:
            self._metrics.tts_latency_ms = int((time.time() - self._metrics.start_time) * 1000)

        # Update state to speaking
        if self._state != PipelineState.SPEAKING and chunk.data:
            async with self._state_lock:
                self._state = PipelineState.SPEAKING
                await self._send_state_update()

        # Send audio to client
        await self._on_message(
            PipelineMessage(
                type="audio.output",
                data={
                    "audio": base64.b64encode(chunk.data).decode() if chunk.data else "",
                    "format": chunk.format,
                    "is_final": chunk.is_final,
                },
            )
        )

    async def _handle_tool_call(self, event: ToolCallEvent) -> None:
        """Handle tool call from Thinker."""
        await self._on_message(
            PipelineMessage(
                type="tool.call",
                data={
                    "tool_id": event.tool_id,
                    "tool_name": event.tool_name,
                    "arguments": event.arguments,
                },
            )
        )

    async def _handle_tool_result(self, event: ToolResultEvent) -> None:
        """Handle tool result from Thinker."""
        await self._on_message(
            PipelineMessage(
                type="tool.result",
                data={
                    "tool_id": event.tool_id,
                    "tool_name": event.tool_name,
                    "result": event.result,
                    "citations": event.citations,
                },
            )
        )

    async def _send_state_update(self) -> None:
        """Send state update to client."""
        await self._on_message(
            PipelineMessage(
                type="voice.state",
                data={"state": self._state.value},
            )
        )


# ==============================================================================
# Voice Pipeline Service
# ==============================================================================


class VoicePipelineService:
    """
    Factory for creating voice pipeline sessions.

    Usage:
        service = VoicePipelineService()

        session = await service.create_session(
            conversation_id="conv-123",
            on_message=handle_message,
        )

        await session.start()
        await session.send_audio(audio_chunk)
        await session.stop()
    """

    def __init__(self):
        self._stt_service = streaming_stt_service
        self._thinker_service = thinker_service
        self._talker_service = talker_service

        # Active sessions
        self._sessions: Dict[str, VoicePipelineSession] = {}

    def is_available(self) -> bool:
        """Check if the pipeline is available."""
        return self._stt_service.is_streaming_available() and self._talker_service.is_enabled()

    async def create_session(
        self,
        conversation_id: str,
        on_message: Callable[[PipelineMessage], Awaitable[None]],
        config: Optional[PipelineConfig] = None,
        user_id: Optional[str] = None,
    ) -> VoicePipelineSession:
        """
        Create a new voice pipeline session.

        Args:
            conversation_id: Conversation identifier
            on_message: Callback for pipeline messages
            config: Optional pipeline configuration
            user_id: User ID for tool authentication (required for calendar, etc.)

        Returns:
            VoicePipelineSession instance
        """
        session_id = str(uuid.uuid4())
        config = config or PipelineConfig()

        session = VoicePipelineSession(
            session_id=session_id,
            conversation_id=conversation_id,
            config=config,
            stt_service=self._stt_service,
            thinker_service=self._thinker_service,
            talker_service=self._talker_service,
            on_message=on_message,
            user_id=user_id,
        )

        self._sessions[session_id] = session

        logger.info(f"Created voice pipeline session: {session_id}")
        return session

    def get_session(self, session_id: str) -> Optional[VoicePipelineSession]:
        """Get an active session by ID."""
        return self._sessions.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """Remove a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()
            logger.info(f"Removed voice pipeline session: {session_id}")

    def get_active_sessions(self) -> List[str]:
        """Get list of active session IDs."""
        return list(self._sessions.keys())


# Global service instance
voice_pipeline_service = VoicePipelineService()
