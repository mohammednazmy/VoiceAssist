"""
Thinker/Talker WebSocket Handler

WebSocket handler for the Thinker/Talker voice pipeline.
Provides the same interface as VoiceWebSocketHandler but uses the local
STT → LLM → TTS pipeline instead of OpenAI Realtime API.

Benefits over Realtime API:
- Unified conversation context with chat mode
- Full tool/RAG support in voice
- Custom TTS (ElevenLabs) with better voice quality
- Lower cost per interaction

Phase: Thinker/Talker Voice Pipeline Migration

Integrates with VoiceEventBus for:
- thinking.started/stopped: Coordinates frontend/backend thinking feedback
- turn.yielded/taken: Turn management events
- filler.triggered/played: Progressive response events
- acknowledgment.*: Smart acknowledgment events

WebSocket Error Recovery (Phase WS-Recovery):
- Session state persistence via Redis for seamless reconnection
- Message buffering for partial message recovery
- Audio checkpoint tracking for playback resume
- Feature flags: backend.ws_session_recovery, backend.ws_message_recovery, backend.ws_audio_checkpointing
"""

import asyncio
import base64
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from app.core.event_bus import VoiceEvent, get_event_bus
from app.core.logging import get_logger
from app.services.voice_pipeline_service import (
    PipelineConfig,
    PipelineMessage,
    PipelineState,
    VoicePipelineService,
    VoicePipelineSession,
    voice_pipeline_service,
)
from app.services.websocket_message_batcher import BatcherConfig, WebSocketMessageBatcher
from app.services.websocket_session_state import ActiveToolCall, WebSocketSessionState, websocket_session_state_service
from starlette.websockets import WebSocket, WebSocketDisconnect

logger = get_logger(__name__)

# ==============================================================================
# Binary Protocol Constants (Phase 1: WebSocket Efficiency)
# ==============================================================================

# Binary frame type flags (first byte of binary frames)
BINARY_FRAME_TYPE_AUDIO_INPUT = 0x01  # Audio from client to server
BINARY_FRAME_TYPE_AUDIO_OUTPUT = 0x02  # Audio from server to client
BINARY_HEADER_SIZE = 5  # 1 byte type + 4 bytes sequence number

# Feature flag names for protocol features
FEATURE_FLAG_BINARY_AUDIO = "backend.voice_ws_binary_audio"
FEATURE_FLAG_MESSAGE_BATCHING = "backend.ws_message_batching"
FEATURE_FLAG_AUDIO_PREBUFFERING = "backend.voice_ws_audio_prebuffering"
FEATURE_FLAG_WS_COMPRESSION = "backend.voice_ws_compression"
FEATURE_FLAG_ADAPTIVE_CHUNKING = "backend.voice_ws_adaptive_chunking"
FEATURE_FLAG_SESSION_PERSISTENCE = "backend.voice_ws_session_persistence"
FEATURE_FLAG_GRACEFUL_DEGRADATION = "backend.voice_ws_graceful_degradation"

# Feature flag names for error recovery (Phase WS-Recovery)
FEATURE_FLAG_SESSION_RECOVERY = "backend.ws_session_recovery"
FEATURE_FLAG_MESSAGE_RECOVERY = "backend.ws_message_recovery"
FEATURE_FLAG_AUDIO_CHECKPOINTING = "backend.ws_audio_checkpointing"

# Event types to forward to the client
FORWARDED_EVENT_TYPES = [
    "thinking.started",
    "thinking.stopped",
    "turn.yielded",
    "turn.taken",
    "filler.triggered",
    "filler.played",
    "acknowledgment.intent",
    "acknowledgment.triggered",
    "acknowledgment.played",
]


# ==============================================================================
# Data Classes
# ==============================================================================


class TTConnectionState(str, Enum):
    """Connection states for T/T handler."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    READY = "ready"
    ERROR = "error"


@dataclass
class TTSessionConfig:
    """Configuration for a Thinker/Talker session."""

    user_id: str
    session_id: str
    conversation_id: Optional[str] = None

    # Voice settings
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"  # Josh (premium male voice)
    tts_model: str = "eleven_flash_v2_5"  # Better quality + low latency
    language: str = "en"

    # STT settings
    stt_sample_rate: int = 16000
    stt_endpointing_ms: int = 800  # Was 200 - allow natural pauses (Phase 7 fix)
    stt_utterance_end_ms: int = 1500  # Wait 1.5s before finalizing

    # Barge-in
    barge_in_enabled: bool = True

    # Timeouts
    connection_timeout_sec: float = 10.0
    idle_timeout_sec: float = 300.0

    # Phase 7: Multilingual settings
    accent_profile_id: Optional[str] = None
    auto_language_detection: bool = True
    language_switch_confidence: float = 0.75

    # Phase 8: Personalization settings
    vad_sensitivity: float = 0.5  # 0-1 scale
    personalized_vad_threshold: Optional[float] = None
    enable_behavior_learning: bool = True

    # Optional VAD preset metadata (mirrors frontend VAD presets) for use in
    # backend dictation/endpointing tuning when the pipeline is in DICTATION mode.
    vad_preset: Optional[str] = None
    vad_custom_energy_threshold_db: Optional[float] = None
    vad_custom_silence_duration_ms: Optional[int] = None

    # Phase 9: Offline/fallback settings
    enable_offline_fallback: bool = True
    tts_cache_enabled: bool = True

    # Phase 10: Conversation management settings
    enable_sentiment_tracking: bool = True
    enable_discourse_analysis: bool = True
    enable_response_recommendations: bool = True

    # Privacy settings
    # When False, transcripts/responses are not persisted in Redis for
    # WebSocket recovery and are omitted from recovery payloads.
    store_transcript_history: bool = True

    # Binary Protocol (WebSocket Efficiency - Feature Flag Controlled)
    binary_protocol_enabled: bool = False  # Set via feature flag negotiation
    message_batching_enabled: bool = False  # Set via feature flag negotiation

    # Session Recovery (Phase WS-Recovery - Feature Flag Controlled)
    session_recovery_enabled: bool = False
    message_recovery_enabled: bool = False
    audio_checkpointing_enabled: bool = False

    # Sequence tracking for binary protocol (internal, not part of init)
    _audio_sequence_in: int = field(default=0, init=False, repr=False)
    _audio_sequence_out: int = field(default=0, init=False, repr=False)
    _message_sequence: int = field(default=0, init=False, repr=False)


@dataclass
class TTSessionMetrics:
    """Metrics for a T/T session."""

    connection_start_time: float = 0.0
    first_audio_latency_ms: float = 0.0
    total_user_speech_ms: float = 0.0
    total_ai_speech_ms: float = 0.0
    user_utterance_count: int = 0
    ai_response_count: int = 0
    barge_in_count: int = 0
    error_count: int = 0
    messages_sent: int = 0
    messages_received: int = 0


# ==============================================================================
# WebSocket Handler
# ==============================================================================


class ThinkerTalkerWebSocketHandler:
    """
    WebSocket handler for Thinker/Talker voice pipeline.

    Handles bidirectional communication between client and the local
    STT → Thinker → Talker pipeline.

    Protocol Messages (Client → Server):
    - audio.input: Base64 PCM16 audio
    - audio.input.complete: Signal end of speech
    - message: Text message (fallback)
    - barge_in: Interrupt AI response
    - voice.mode: Activate/deactivate voice mode

    Protocol Messages (Server → Client):
    - transcript.delta: Partial/final transcript
    - transcript.complete: Complete user transcript
    - response.delta: LLM response token
    - response.complete: Complete AI response
    - audio.output: TTS audio chunk
    - tool.call: Tool being called
    - tool.result: Tool result
    - voice.state: Pipeline state update
    - error: Error message
    """

    def __init__(
        self,
        websocket: WebSocket,
        config: TTSessionConfig,
        pipeline_service: Optional[VoicePipelineService] = None,
    ):
        self.websocket = websocket
        self.config = config
        self._pipeline_service = pipeline_service or voice_pipeline_service

        # State
        self._connection_state = TTConnectionState.DISCONNECTED
        self._pipeline_session: Optional[VoicePipelineSession] = None
        self._running = False
        self._metrics = TTSessionMetrics()

        # Tasks
        self._receive_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

        # Event bus integration for cross-engine coordination
        self._event_bus = get_event_bus()
        self._subscribed_handlers: List[Callable] = []

        # Message batcher for high-frequency messages (initialized in session.init)
        self._batcher: Optional[WebSocketMessageBatcher] = None

        # Session recovery state (Phase WS-Recovery)
        self._session_state_service = websocket_session_state_service
        self._session_state: Optional[WebSocketSessionState] = None
        self._partial_transcript: str = ""  # Accumulator for transcript deltas
        self._partial_response: str = ""  # Accumulator for response deltas
        self._is_resumed_session: bool = False  # True if this is a recovered session

        # Phase 2: VAD Confidence Sharing - store latest frontend VAD state
        self._last_vad_state: Optional[Dict[str, Any]] = None

    @property
    def connection_state(self) -> TTConnectionState:
        """Get current connection state."""
        return self._connection_state

    async def _handle_event_bus_event(self, event: VoiceEvent) -> None:
        """
        Handle events from VoiceEventBus and forward to client.

        Only forwards events for this session.
        """
        # Only forward events for this session
        if event.session_id != self.config.session_id:
            return

        # Only forward whitelisted event types
        if event.event_type not in FORWARDED_EVENT_TYPES:
            return

        logger.debug(f"[WS] Forwarding event {event.event_type} to client " f"(session={self.config.session_id[:8]})")

        # Forward event to client
        await self._send_message(
            {
                "type": event.event_type,
                "source": event.source_engine,
                **event.data,
            }
        )

    def _subscribe_to_event_bus(self) -> None:
        """Subscribe to relevant event bus events."""
        for event_type in FORWARDED_EVENT_TYPES:
            handler = self._handle_event_bus_event
            self._event_bus.subscribe(
                event_type=event_type,
                handler=handler,
                priority=0,
                engine=f"websocket:{self.config.session_id[:8]}",
            )
            self._subscribed_handlers.append((event_type, handler))
        logger.debug(f"[WS] Subscribed to {len(FORWARDED_EVENT_TYPES)} event types")

    def _unsubscribe_from_event_bus(self) -> None:
        """Unsubscribe from all event bus events."""
        for event_type, handler in self._subscribed_handlers:
            self._event_bus.unsubscribe(event_type, handler)
        self._subscribed_handlers.clear()
        logger.debug("[WS] Unsubscribed from all event bus events")

    async def start(self) -> bool:
        """
        Start the WebSocket handler.

        Returns:
            True if started successfully
        """
        if self._running:
            logger.warning("Handler already running")
            return True

        self._running = True
        self._metrics.connection_start_time = time.time()
        self._connection_state = TTConnectionState.CONNECTING

        try:
            # Accept WebSocket connection
            await self.websocket.accept()
            self._connection_state = TTConnectionState.CONNECTED

            # Initialize session recovery features (feature flag controlled)
            await self._init_session_recovery()

            # Get utterance aggregation window from feature flag
            from app.services.feature_flags import feature_flag_service

            aggregation_window_ms = await feature_flag_service.get_value(
                "backend.voice_aggregation_window_ms", default=3000
            )
            # Ensure it's an integer
            aggregation_window_ms = int(aggregation_window_ms) if aggregation_window_ms else 3000
            logger.info(f"Voice pipeline using aggregation window: {aggregation_window_ms}ms")

            # Create pipeline session
            # Latency-optimized configuration for Thinker/Talker voice mode:
            # - Disable continuation detection and utterance aggregation to
            #   avoid extra waits between STT endpoint and LLM/TTS start.
            # - Keep aggregation window available for future tuning, but keep
            #   features off by default for fast TTFA.
            pipeline_config = PipelineConfig(
                stt_language=self.config.language,
                stt_sample_rate=self.config.stt_sample_rate,
                stt_endpointing_ms=self.config.stt_endpointing_ms,
                stt_utterance_end_ms=self.config.stt_utterance_end_ms,
                voice_id=self.config.voice_id,
                tts_model=self.config.tts_model,
                barge_in_enabled=self.config.barge_in_enabled,
                personalized_vad_threshold=self.config.personalized_vad_threshold,
                vad_preset=self.config.vad_preset,
                vad_custom_silence_duration_ms=self.config.vad_custom_silence_duration_ms,
                enable_continuation_detection=False,
                enable_utterance_aggregation=False,
                utterance_aggregation_window_ms=int(aggregation_window_ms),
            )

            self._pipeline_session = await self._pipeline_service.create_session(
                conversation_id=self.config.conversation_id or self.config.session_id,
                on_message=self._handle_pipeline_message,
                config=pipeline_config,
                user_id=self.config.user_id,
            )

            # Start pipeline
            if not await self._pipeline_session.start():
                raise RuntimeError("Failed to start pipeline session")

            self._connection_state = TTConnectionState.READY

            # Subscribe to event bus events (for thinking feedback, turn management, etc.)
            self._subscribe_to_event_bus()

            # Create session state for recovery (if enabled)
            if self.config.session_recovery_enabled:
                await self._create_session_state()

            # Send ready message to client
            await self._send_message(
                {
                    "type": "session.ready",
                    "session_id": self.config.session_id,
                    "pipeline_mode": "thinker_talker",
                    "recovery_enabled": self.config.session_recovery_enabled,
                }
            )

            # Start receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            logger.info(
                f"T/T WebSocket handler started: {self.config.session_id}",
                extra={
                    "user_id": self.config.user_id,
                    "recovery_enabled": self.config.session_recovery_enabled,
                },
            )
            return True

        except Exception as e:
            logger.error(f"Failed to start T/T handler: {e}")
            self._connection_state = TTConnectionState.ERROR
            self._running = False
            self._pipeline_session = None
            await self._send_error("connection_failed", str(e))
            return False

    async def _init_session_recovery(self) -> None:
        """Initialize session recovery features based on feature flags."""
        try:
            from app.services.feature_flags import feature_flag_service

            # Check feature flags
            self.config.session_recovery_enabled = await feature_flag_service.is_enabled(
                FEATURE_FLAG_SESSION_RECOVERY, default=False
            )
            if self.config.session_recovery_enabled:
                self.config.message_recovery_enabled = await feature_flag_service.is_enabled(
                    FEATURE_FLAG_MESSAGE_RECOVERY, default=False
                )
                self.config.audio_checkpointing_enabled = await feature_flag_service.is_enabled(
                    FEATURE_FLAG_AUDIO_CHECKPOINTING, default=False
                )

                # Ensure session state service is connected
                if not self._session_state_service._connected:
                    await self._session_state_service.connect()

                logger.info(
                    f"[WS Recovery] Enabled for {self.config.session_id}: "
                    f"message_recovery={self.config.message_recovery_enabled}, "
                    f"audio_checkpointing={self.config.audio_checkpointing_enabled}"
                )
        except Exception as e:
            logger.warning(f"Failed to check session recovery flags: {e}")
            self.config.session_recovery_enabled = False

    async def _create_session_state(self) -> None:
        """Create initial session state for recovery."""
        try:
            self._session_state = await self._session_state_service.create_session(
                session_id=self.config.session_id,
                user_id=self.config.user_id,
                conversation_id=self.config.conversation_id,
                voice_id=self.config.voice_id,
                language=self.config.language,
                store_transcript_history=self.config.store_transcript_history,
            )
            logger.debug(f"[WS Recovery] Created session state: {self.config.session_id}")
        except Exception as e:
            logger.error(f"Failed to create session state: {e}")

    async def _update_session_state(self, **updates) -> None:
        """Update session state with given fields."""
        if not self.config.session_recovery_enabled or not self._session_state:
            return

        try:
            await self._session_state_service.update_session_state(self.config.session_id, updates)
        except Exception as e:
            logger.warning(f"Failed to update session state: {e}")

    async def stop(self, preserve_for_recovery: bool = True) -> TTSessionMetrics:
        """
        Stop the handler and cleanup.

        Args:
            preserve_for_recovery: If True and recovery is enabled, preserve
                session state for potential reconnection

        Returns:
            Session metrics
        """
        if not self._running:
            return self._metrics

        self._running = False

        # Mark session as disconnected for potential recovery
        if self.config.session_recovery_enabled and preserve_for_recovery:
            await self._save_disconnection_state()

        # Cancel tasks
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass

        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        # Unsubscribe from event bus events
        self._unsubscribe_from_event_bus()

        # Stop message batcher
        if self._batcher:
            try:
                await self._batcher.stop()
            except Exception as e:
                logger.warning(f"Error stopping message batcher: {e}")

        # Stop pipeline session
        if self._pipeline_session:
            try:
                await self._pipeline_session.stop()
            except Exception as e:
                logger.warning(f"Error stopping pipeline session: {e}")

        # Close WebSocket
        try:
            await self.websocket.close()
        except Exception:
            pass

        self._connection_state = TTConnectionState.DISCONNECTED

        logger.info(
            f"T/T WebSocket handler stopped: {self.config.session_id}",
            extra={"metrics": self._get_metrics_dict()},
        )

        return self._metrics

    async def _save_disconnection_state(self) -> None:
        """Save session state before disconnection for potential recovery."""
        try:
            # Update session state with final values
            await self._session_state_service.update_session_state(
                self.config.session_id,
                {
                    "connection_state": "disconnected",
                    "pipeline_state": (self._pipeline_session.state.value if self._pipeline_session else "idle"),
                    "last_message_seq": self.config._message_sequence,
                    "last_audio_seq_in": self.config._audio_sequence_in,
                    "last_audio_seq_out": self.config._audio_sequence_out,
                    "partial_transcript": self._partial_transcript,
                    "partial_response": self._partial_response,
                },
            )
            await self._session_state_service.mark_disconnected(self.config.session_id)
            logger.debug(f"[WS Recovery] Saved disconnection state: {self.config.session_id}")
        except Exception as e:
            logger.warning(f"Failed to save disconnection state: {e}")

    async def _receive_loop(self) -> None:
        """Receive and process messages from client.

        Handles both binary and text WebSocket frames:
        - Binary frames: Direct audio data with 5-byte header (type + sequence)
        - Text frames: JSON control messages
        """
        logger.debug(f"[WS] Starting receive loop for {self.config.session_id}")
        try:
            while self._running:
                try:
                    # Use low-level receive to distinguish text vs binary frames
                    message = await self.websocket.receive()

                    if message["type"] == "websocket.receive":
                        if "bytes" in message and message["bytes"]:
                            # Binary frame - direct audio (efficiency optimization)
                            await self._handle_binary_frame(message["bytes"])
                        elif "text" in message and message["text"]:
                            # Text frame - JSON control message
                            try:
                                data = json.loads(message["text"])
                                self._metrics.messages_received += 1
                                await self._handle_client_message(data)
                            except json.JSONDecodeError as e:
                                logger.warning(f"Invalid JSON in message: {e}")
                                await self._send_error("invalid_json", "Invalid JSON message")
                    elif message["type"] == "websocket.disconnect":
                        logger.info(f"WebSocket disconnected: {self.config.session_id}")
                        break

                except WebSocketDisconnect:
                    logger.info(f"WebSocket disconnected: {self.config.session_id}")
                    break
                except Exception as e:
                    logger.error(f"Error receiving message: {e}", exc_info=True)
                    self._metrics.error_count += 1

        except asyncio.CancelledError:
            logger.debug(f"[WS] Receive loop cancelled for {self.config.session_id}")
        except Exception as e:
            logger.error(f"Receive loop error: {e}", exc_info=True)
        finally:
            logger.info(
                f"[WS] Receive loop ended: {self.config.session_id}, total_messages={self._metrics.messages_received}"
            )
            self._running = False

    async def _handle_binary_frame(self, data: bytes) -> None:
        """Handle binary WebSocket frame (audio data).

        Binary frame format (5-byte header + audio data):
        - Byte 0: Frame type (0x01 = audio input, 0x02 = audio output)
        - Bytes 1-4: Sequence number (uint32 big-endian) for ordering/dedup
        - Bytes 5+: Audio data (PCM16 for input, PCM24 for output)
        """
        if len(data) < BINARY_HEADER_SIZE:
            logger.warning(f"Binary frame too short: {len(data)} bytes (min {BINARY_HEADER_SIZE})")
            return

        frame_type = data[0]
        sequence = int.from_bytes(data[1:5], "big")
        audio_data = data[5:]

        if frame_type == BINARY_FRAME_TYPE_AUDIO_INPUT:
            # Validate sequence number (detect out-of-order or dropped frames)
            expected_seq = self.config._audio_sequence_in
            if sequence != expected_seq and expected_seq > 0:
                gap = sequence - expected_seq
                if gap > 0:
                    logger.warning(f"[WS] Audio sequence gap: expected {expected_seq}, got {sequence}")
                    self._metrics.error_count += 1
                elif gap < 0:
                    # Out-of-order frame - drop it
                    logger.debug(f"[WS] Out-of-order audio frame: {sequence} < {expected_seq}")
                    return

            self.config._audio_sequence_in = sequence + 1

            # Send to pipeline (no base64 decode needed - direct PCM!)
            if self._pipeline_session:
                await self._pipeline_session.send_audio(audio_data)
                self._metrics.messages_received += 1
                if self._metrics.messages_received % 100 == 0:
                    logger.debug(f"[WS] Binary audio #{self._metrics.messages_received}, seq={sequence}")
        else:
            logger.warning(f"Unknown binary frame type: 0x{frame_type:02x}")

    async def _send_audio_binary(self, audio_data: bytes) -> None:
        """Send audio output as binary WebSocket frame."""
        sequence = self.config._audio_sequence_out
        self.config._audio_sequence_out += 1

        # Build frame: [type:1][sequence:4][audio:N]
        header = bytes([BINARY_FRAME_TYPE_AUDIO_OUTPUT]) + sequence.to_bytes(4, "big")
        frame = header + audio_data

        try:
            await self.websocket.send_bytes(frame)
            self._metrics.messages_sent += 1
        except Exception as e:
            logger.error(f"Error sending binary audio: {e}")
            self._metrics.error_count += 1

    async def _handle_client_message(self, message: Dict[str, Any]) -> None:
        """Handle a message from the client."""
        msg_type = message.get("type", "")

        # Debug: Log every message type (except audio.input for performance)
        if msg_type != "audio.input":
            logger.debug(f"[WS] Received message type: {msg_type}")

        if msg_type == "session.init":
            # Session initialization from client (optional config updates)
            voice_settings = message.get("voice_settings", {})
            conversation_id = message.get("conversation_id")
            advanced_settings = message.get("advanced_settings", {})

            # Protocol negotiation: check for client-requested features
            client_features = message.get("features", [])
            protocol_version = message.get("protocol_version", "1.0")

            logger.info(
                f"Session init received: conv_id={conversation_id}, "
                f"settings={voice_settings}, advanced={advanced_settings}, "
                f"features={client_features}, protocol={protocol_version}"
            )

            # Store conversation_id if provided (fallback for when not in URL params)
            # This allows clients to set conversation_id via session.init message
            if conversation_id and not self.config.conversation_id:
                self.config.conversation_id = conversation_id
                logger.info(f"Set conversation_id from session.init: {conversation_id}")
                # Update pipeline session's conversation_id if already created
                if self._pipeline_session:
                    self._pipeline_session.conversation_id = conversation_id
                    logger.info(f"Updated pipeline session conversation_id: {conversation_id}")

            # Negotiate binary protocol (feature flag controlled)
            negotiated_features = []
            if "binary_audio" in client_features:
                try:
                    from app.services.feature_flags import feature_flag_service

                    binary_enabled = await feature_flag_service.is_enabled(FEATURE_FLAG_BINARY_AUDIO, default=False)
                    if binary_enabled:
                        self.config.binary_protocol_enabled = True
                        negotiated_features.append("binary_audio")
                        logger.info(f"[WS] Binary audio enabled for {self.config.session_id}")
                except Exception as e:
                    logger.warning(f"Failed to check binary audio flag: {e}")

            # Negotiate message batching (feature flag controlled)
            if "message_batching" in client_features:
                try:
                    from app.services.feature_flags import feature_flag_service

                    batching_enabled = await feature_flag_service.is_enabled(
                        FEATURE_FLAG_MESSAGE_BATCHING, default=False
                    )
                    if batching_enabled:
                        self.config.message_batching_enabled = True
                        negotiated_features.append("message_batching")
                        # Initialize the message batcher
                        self._batcher = WebSocketMessageBatcher(
                            send_fn=self.websocket.send_json,
                            config=BatcherConfig(enabled=True),
                        )
                        await self._batcher.start()
                        logger.info(f"[WS] Message batching enabled for {self.config.session_id}")
                except Exception as e:
                    logger.warning(f"Failed to check message batching flag: {e}")

            # Negotiate audio prebuffering (feature flag controlled)
            if "audio_prebuffering" in client_features:
                try:
                    from app.services.feature_flags import feature_flag_service

                    prebuffering_enabled = await feature_flag_service.is_enabled(
                        FEATURE_FLAG_AUDIO_PREBUFFERING, default=False
                    )
                    if prebuffering_enabled:
                        negotiated_features.append("audio_prebuffering")
                        logger.info(f"[WS] Audio prebuffering enabled for {self.config.session_id}")
                except Exception as e:
                    logger.warning(f"Failed to check audio prebuffering flag: {e}")

            # Negotiate adaptive chunking (feature flag controlled)
            if "adaptive_chunking" in client_features:
                try:
                    from app.services.feature_flags import feature_flag_service

                    chunking_enabled = await feature_flag_service.is_enabled(
                        FEATURE_FLAG_ADAPTIVE_CHUNKING, default=False
                    )
                    if chunking_enabled:
                        negotiated_features.append("adaptive_chunking")
                        logger.info(f"[WS] Adaptive chunking enabled for {self.config.session_id}")
                except Exception as e:
                    logger.warning(f"Failed to check adaptive chunking flag: {e}")

            # Negotiate session persistence (feature flag controlled)
            if "session_persistence" in client_features:
                try:
                    from app.services.feature_flags import feature_flag_service

                    persistence_enabled = await feature_flag_service.is_enabled(
                        FEATURE_FLAG_SESSION_PERSISTENCE, default=False
                    )
                    if persistence_enabled:
                        negotiated_features.append("session_persistence")
                        logger.info(f"[WS] Session persistence enabled for {self.config.session_id}")
                        # Session persistence is handled by the session manager
                except Exception as e:
                    logger.warning(f"Failed to check session persistence flag: {e}")

            # Negotiate graceful degradation (feature flag controlled)
            if "graceful_degradation" in client_features:
                try:
                    from app.services.feature_flags import feature_flag_service

                    degradation_enabled = await feature_flag_service.is_enabled(
                        FEATURE_FLAG_GRACEFUL_DEGRADATION, default=False
                    )
                    if degradation_enabled:
                        negotiated_features.append("graceful_degradation")
                        logger.info(f"[WS] Graceful degradation enabled for {self.config.session_id}")
                except Exception as e:
                    logger.warning(f"Failed to check graceful degradation flag: {e}")

            # Apply voice settings to the pipeline config
            if self._pipeline_session and voice_settings:
                if "voice_id" in voice_settings:
                    self._pipeline_session.config.voice_id = voice_settings["voice_id"]
                    logger.info(f"Updated pipeline voice_id to: {voice_settings['voice_id']}")
                if "language" in voice_settings:
                    self._pipeline_session.config.stt_language = voice_settings["language"]
                if "barge_in_enabled" in voice_settings:
                    self._pipeline_session.config.barge_in_enabled = voice_settings["barge_in_enabled"]
                if "vad_sensitivity" in voice_settings:
                    # Convert to int (0-100 scale)
                    vad_sens = int(voice_settings["vad_sensitivity"])
                    self._pipeline_session.config.vad_sensitivity = max(0, min(100, vad_sens))
                    logger.info(f"Updated pipeline vad_sensitivity to: {self._pipeline_session.config.vad_sensitivity}")

            # Apply Phase 7-10 advanced settings to session config
            if advanced_settings:
                # Phase 7: Multilingual
                if "accent_profile_id" in advanced_settings:
                    self.config.accent_profile_id = advanced_settings["accent_profile_id"]
                if "auto_language_detection" in advanced_settings:
                    self.config.auto_language_detection = advanced_settings["auto_language_detection"]
                if "language_switch_confidence" in advanced_settings:
                    self.config.language_switch_confidence = advanced_settings["language_switch_confidence"]

                # Phase 8: Personalization
                if "vad_sensitivity" in advanced_settings:
                    self.config.vad_sensitivity = advanced_settings["vad_sensitivity"]
                if "personalized_vad_threshold" in advanced_settings:
                    value = advanced_settings["personalized_vad_threshold"]
                    self.config.personalized_vad_threshold = value
                    # Keep the pipeline config in sync so analytics can
                    # log the personalized threshold at session end.
                    if self._pipeline_session is not None:
                        self._pipeline_session.config.personalized_vad_threshold = value
                if "enable_behavior_learning" in advanced_settings:
                    self.config.enable_behavior_learning = advanced_settings["enable_behavior_learning"]

                # Optional VAD preset metadata used for dictation endpoint tuning.
                if "vad_preset" in advanced_settings:
                    preset = advanced_settings["vad_preset"]
                    if isinstance(preset, str) and preset:
                        self.config.vad_preset = preset
                        if self._pipeline_session is not None:
                            self._pipeline_session.config.vad_preset = preset
                if "vad_custom_silence_duration_ms" in advanced_settings:
                    value = advanced_settings["vad_custom_silence_duration_ms"]
                    if isinstance(value, (int, float)):
                        # Clamp to the same safe range used by AdaptiveVADService/custom presets.
                        clamped = max(200, min(1500, int(value)))
                        self.config.vad_custom_silence_duration_ms = clamped
                        if self._pipeline_session is not None:
                            self._pipeline_session.config.vad_custom_silence_duration_ms = clamped

                # Phase 9: Offline
                if "enable_offline_fallback" in advanced_settings:
                    self.config.enable_offline_fallback = advanced_settings["enable_offline_fallback"]
                if "tts_cache_enabled" in advanced_settings:
                    self.config.tts_cache_enabled = advanced_settings["tts_cache_enabled"]

                # Phase 10: Conversation management
                if "enable_sentiment_tracking" in advanced_settings:
                    self.config.enable_sentiment_tracking = advanced_settings["enable_sentiment_tracking"]
                if "enable_discourse_analysis" in advanced_settings:
                    self.config.enable_discourse_analysis = advanced_settings["enable_discourse_analysis"]
                if "enable_response_recommendations" in advanced_settings:
                    self.config.enable_response_recommendations = advanced_settings["enable_response_recommendations"]

                # Privacy settings (maps from frontend VoicePrivacySettings)
                # When disabled, transcripts/responses are not persisted for recovery.
                if "store_transcript_history" in advanced_settings:
                    try:
                        self.config.store_transcript_history = bool(advanced_settings["store_transcript_history"])
                    except Exception:
                        # Be conservative: default to True if value is malformed
                        self.config.store_transcript_history = True

                logger.info(f"Applied advanced settings: {advanced_settings}")

            # Acknowledge the init with negotiated features
            await self._send_message(
                {
                    "type": "session.init.ack",
                    "protocol_version": "2.0" if negotiated_features else "1.0",
                    "features": negotiated_features,
                }
            )

        elif msg_type == "audio.input":
            # Audio chunk from client
            audio_b64 = message.get("audio", "")
            if audio_b64 and self._pipeline_session:
                # Log every 100th chunk
                if self._metrics.messages_received % 100 == 0:
                    logger.debug(f"[WS] Audio chunk #{self._metrics.messages_received}, {len(audio_b64)} bytes b64")
                await self._pipeline_session.send_audio_base64(audio_b64)
            elif not audio_b64:
                logger.warning("Received audio.input with empty audio data")
            elif not self._pipeline_session:
                logger.warning("Received audio.input but no pipeline session")

        elif msg_type == "audio.input.complete":
            # User finished speaking (manual commit)
            if self._pipeline_session:
                await self._pipeline_session.commit_audio()

        elif msg_type == "message":
            # Text message (fallback mode)
            text = message.get("content", "")
            if text and self._pipeline_session:
                # Process text through Thinker directly
                # For now, we'll send it as if it were transcribed
                await self._handle_text_input(text)

        elif msg_type == "barge_in":
            # User wants to interrupt AI
            if self._pipeline_session:
                await self._pipeline_session.barge_in()
                self._metrics.barge_in_count += 1

        elif msg_type == "voice.mode":
            # Voice mode control
            mode = message.get("mode", "")
            if mode == "activate":
                await self._activate_voice_mode(message.get("config", {}))
            elif mode == "deactivate":
                await self._deactivate_voice_mode()

        elif msg_type == "ping":
            # Heartbeat response
            await self._send_message({"type": "pong"})

        elif msg_type == "session.resume":
            # Session recovery request
            await self._handle_session_resume(message)

        elif msg_type == "audio.ack":
            # Audio acknowledgment for checkpointing
            await self._handle_audio_ack(message)

        elif msg_type == "vad.state":
            # Phase 2: VAD Confidence Sharing - receive frontend Silero VAD state
            await self._handle_vad_state(message)

        else:
            logger.warning(f"Unknown message type: {msg_type}")

    async def _handle_session_resume(self, message: Dict[str, Any]) -> None:
        """
        Handle session resume request from client.

        The client sends this after reconnecting to recover the session state.

        Message format:
        {
            "type": "session.resume",
            "session_id": "...",
            "last_message_seq": 123,
            "last_audio_seq": 45
        }
        """
        if not self.config.session_recovery_enabled:
            await self._send_message(
                {
                    "type": "session.resume.nak",
                    "reason": "recovery_disabled",
                }
            )
            return

        session_id = message.get("session_id", self.config.session_id)
        last_message_seq = message.get("last_message_seq", 0)
        last_audio_seq = message.get("last_audio_seq", 0)

        logger.info(
            f"[WS Recovery] Resume request: session={session_id}, "
            f"last_msg_seq={last_message_seq}, last_audio_seq={last_audio_seq}"
        )

        try:
            # Attempt recovery
            result = await self._session_state_service.attempt_recovery(
                session_id=session_id,
                user_id=self.config.user_id,
                last_known_seq=last_message_seq,
            )

            if not result.success:
                await self._send_message(
                    {
                        "type": "session.resume.nak",
                        "reason": result.error or "recovery_failed",
                    }
                )
                return

            # Mark this as a resumed session
            self._is_resumed_session = True

            # Restore state from recovered session
            if result.session_state:
                self._session_state = result.session_state
                self._partial_transcript = result.session_state.partial_transcript
                self._partial_response = result.session_state.partial_response

                # Restore sequence numbers
                self.config._message_sequence = result.session_state.last_message_seq
                self.config._audio_sequence_in = result.session_state.last_audio_seq_in
                self.config._audio_sequence_out = result.session_state.last_audio_seq_out

            # Determine privacy preference for this recovered session
            store_history = True
            if result.session_state is not None:
                try:
                    store_history = bool(result.session_state.store_transcript_history)
                except Exception:
                    store_history = True

            # Compute canonical pipeline state for recovery snapshot
            pipeline_state = (
                result.session_state.pipeline_state
                if result.session_state is not None
                else "idle"
            )

            # Send resume acknowledgment (recovery snapshot)
            resume_ack = {
                "type": "session.resume.ack",
                "recovery_state": result.state.value,
                "conversation_id": (result.session_state.conversation_id if result.session_state else None),
                # Respect per-session privacy preference: when history is disabled,
                # omit transcript content from recovery payloads.
                "partial_transcript": self._partial_transcript if store_history else "",
                "partial_response": self._partial_response if store_history else "",
                "missed_message_count": len(result.missed_messages) if store_history else 0,
                "pipeline_state": pipeline_state,
            }

            await self._send_message(resume_ack)

            # Replay missed messages if message recovery is enabled
            if self.config.message_recovery_enabled and result.missed_messages:
                # To avoid flooding the client and causing latency spikes,
                # only replay the most recent subset of buffered messages.
                # Voice mode already has full conversation history in the
                # main chat timeline, so replaying a small tail is sufficient
                # for UI resynchronization after reconnect.
                max_replay_messages = 20
                messages_to_replay = result.missed_messages[-max_replay_messages:]

                logger.info(
                    f"[WS Recovery] Replaying {len(messages_to_replay)} of "
                    f"{len(result.missed_messages)} buffered messages for session={session_id}"
                )

                for missed_msg in messages_to_replay:
                    await self._send_message(
                        {
                            "type": "message.replay",
                            "original": missed_msg,
                        }
                    )

            # Send audio resume info if audio checkpointing is enabled
            if self.config.audio_checkpointing_enabled and result.audio_resume_seq is not None:
                await self._send_message(
                    {
                        "type": "audio.resume",
                        "resume_from_seq": result.audio_resume_seq,
                    }
                )

            logger.info(
                f"[WS Recovery] Session resumed: {session_id}, "
                f"state={result.state.value}, missed_msgs={len(result.missed_messages)}"
            )

        except Exception as e:
            logger.error(f"[WS Recovery] Resume failed: {e}", exc_info=True)
            await self._send_message(
                {
                    "type": "session.resume.nak",
                    "reason": str(e),
                }
            )

    async def _handle_audio_ack(self, message: Dict[str, Any]) -> None:
        """
        Handle audio acknowledgment from client.

        The client sends this to confirm receipt of audio chunks.

        Message format:
        {
            "type": "audio.ack",
            "seq": 123
        }
        """
        if not self.config.audio_checkpointing_enabled:
            return

        confirmed_seq = message.get("seq", 0)
        try:
            await self._session_state_service.update_audio_confirmed(self.config.session_id, confirmed_seq)
        except Exception as e:
            logger.warning(f"Failed to update audio checkpoint: {e}")

    async def _handle_vad_state(self, message: Dict[str, Any]) -> None:
        """
        Handle VAD state from frontend Silero VAD.

        Phase 2: VAD Confidence Sharing - Frontend sends periodic VAD state
        during user speech to enable hybrid VAD decisions combining:
        - Frontend Silero VAD (neural network, instant, affected by echo)
        - Backend Deepgram VAD (server-side, reliable, slight delay)

        Message format:
        {
            "type": "vad.state",
            "silero_confidence": 0.85,      # Speech probability (0-1)
            "is_speaking": true,             # Frontend VAD speaking state
            "speech_duration_ms": 250,       # Duration of current speech
            "is_playback_active": false,     # Whether AI is speaking
            "effective_threshold": 0.5,      # Current VAD threshold (may be boosted)
            "aec_quality": "good"            # Optional AEC quality: excellent/good/fair/poor/unknown
        }
        """
        silero_confidence = message.get("silero_confidence", 0.0)
        is_speaking = message.get("is_speaking", False)
        speech_duration_ms = message.get("speech_duration_ms", 0)
        is_playback_active = message.get("is_playback_active", False)
        effective_threshold = message.get("effective_threshold", 0.5)
        aec_quality = message.get("aec_quality")
        personalized_threshold = message.get("personalized_threshold")

        # Store latest VAD state for hybrid decision making
        self._last_vad_state = {
            "silero_confidence": silero_confidence,
            "is_speaking": is_speaking,
            "speech_duration_ms": speech_duration_ms,
            "is_playback_active": is_playback_active,
            "effective_threshold": effective_threshold,
            "aec_quality": aec_quality,
            "personalized_threshold": personalized_threshold,
            "timestamp": time.time(),
        }

        # Forward to pipeline for hybrid VAD decision
        if self._pipeline_session:
            await self._pipeline_session.update_frontend_vad_state(
                silero_confidence=silero_confidence,
                is_speaking=is_speaking,
                speech_duration_ms=speech_duration_ms,
                is_playback_active=is_playback_active,
                aec_quality=aec_quality,
            )

        # Log at debug level (these messages are frequent)
        if speech_duration_ms > 0 and speech_duration_ms % 500 < 100:
            logger.debug(
                f"[WS] VAD state: conf={silero_confidence:.2f}, "
                f"speaking={is_speaking}, duration={speech_duration_ms}ms, "
                f"playback={is_playback_active}"
            )

    async def _handle_text_input(self, text: str) -> None:
        """Handle text input (fallback when not using voice)."""
        # Send as if it were a transcript
        await self._send_message(
            {
                "type": "transcript.complete",
                "text": text,
                "message_id": f"text-{time.time()}",
            }
        )

        # Process through thinker (this would need integration with thinker_service)
        # For now, the pipeline handles voice input; text would go through chat endpoint

    async def _activate_voice_mode(self, config: Dict) -> None:
        """Activate voice mode with optional config."""
        if self._pipeline_session and self._pipeline_session.state == PipelineState.IDLE:
            await self._pipeline_session.start()

        await self._send_message(
            {
                "type": "voice.mode.activated",
            }
        )

    async def _deactivate_voice_mode(self) -> None:
        """Deactivate voice mode."""
        if self._pipeline_session:
            await self._pipeline_session.stop()

        await self._send_message(
            {
                "type": "voice.mode.deactivated",
            }
        )

    async def _handle_pipeline_message(self, message: PipelineMessage) -> None:
        """Handle a message from the voice pipeline.

        For audio.output messages, uses binary protocol if enabled.
        Tracks partial messages for recovery.
        """
        # Track partial messages for recovery
        await self._track_partial_messages(message)

        # Handle audio output with binary protocol if enabled
        if message.type == "audio.output" and self.config.binary_protocol_enabled:
            audio_b64 = message.data.get("audio", "")
            if audio_b64:
                try:
                    audio_bytes = base64.b64decode(audio_b64)
                    await self._send_audio_binary(audio_bytes)
                    # Send metadata separately
                    await self._send_message(
                        {
                            "type": "audio.output.meta",
                            "format": message.data.get("format"),
                            "is_final": message.data.get("is_final"),
                            "sequence": self.config._audio_sequence_out - 1,
                        }
                    )

                    # Buffer audio for checkpointing if enabled
                    if self.config.audio_checkpointing_enabled:
                        await self._buffer_audio_chunk(self.config._audio_sequence_out - 1, audio_b64)
                except Exception as e:
                    logger.error(f"Error sending binary audio: {e}")
                    # Fallback to JSON
                    await self._send_message({"type": message.type, **message.data})
        else:
            # Forward other messages as JSON
            await self._send_message(
                {
                    "type": message.type,
                    **message.data,
                }
            )

            # Buffer audio for checkpointing if enabled (JSON mode)
            if message.type == "audio.output" and self.config.audio_checkpointing_enabled and message.data.get("audio"):
                await self._buffer_audio_chunk(self.config._message_sequence - 1, message.data.get("audio", ""))

        # Track metrics
        if message.type == "transcript.complete":
            self._metrics.user_utterance_count += 1
        elif message.type == "response.complete":
            self._metrics.ai_response_count += 1
        elif message.type == "audio.output" and message.data.get("audio"):
            # Track first audio latency
            if self._metrics.first_audio_latency_ms == 0:
                self._metrics.first_audio_latency_ms = (time.time() - self._metrics.connection_start_time) * 1000

    async def _track_partial_messages(self, message: PipelineMessage) -> None:
        """Track partial transcript and response messages for recovery.

        When store_transcript_history is disabled for this session, we still
        keep in-memory partials for the current connection but avoid persisting
        them to Redis to honor privacy preferences.
        """
        if not self.config.session_recovery_enabled:
            return

        msg_type = message.type

        try:
            if msg_type == "transcript.delta":
                # Accumulate transcript delta
                delta_text = message.data.get("text", "")
                self._partial_transcript += delta_text

                # Update session state periodically (every 5 characters)
                if (
                    self.config.store_transcript_history
                    and len(self._partial_transcript) % 5 == 0
                ):
                    await self._session_state_service.update_partial_transcript(
                        self.config.session_id,
                        self._partial_transcript,
                        message.data.get("message_id"),
                    )

            elif msg_type == "transcript.complete":
                # Clear partial transcript on completion
                self._partial_transcript = ""
                if self.config.store_transcript_history:
                    await self._session_state_service.clear_partial_messages(self.config.session_id)

            elif msg_type == "response.delta":
                # Accumulate response delta
                delta_text = message.data.get("text", "")
                self._partial_response += delta_text

                # Update session state periodically (every 10 characters)
                if (
                    self.config.store_transcript_history
                    and len(self._partial_response) % 10 == 0
                ):
                    await self._session_state_service.update_partial_response(
                        self.config.session_id,
                        self._partial_response,
                        message.data.get("message_id"),
                    )

            elif msg_type == "response.complete":
                # Clear partial response on completion
                self._partial_response = ""
                if self.config.store_transcript_history:
                    await self._session_state_service.clear_partial_messages(self.config.session_id)

            elif msg_type == "tool.call":
                # Track tool call in progress
                tool_call = ActiveToolCall(
                    tool_id=message.data.get("tool_call_id", ""),
                    tool_name=message.data.get("name", ""),
                    arguments=message.data.get("arguments", {}),
                    status="running",
                )
                await self._session_state_service.add_tool_call(self.config.session_id, tool_call)

            elif msg_type == "tool.result":
                # Update tool call status
                await self._session_state_service.update_tool_call(
                    self.config.session_id,
                    message.data.get("tool_call_id", ""),
                    "completed",
                    message.data.get("result"),
                )

        except Exception as e:
            logger.warning(f"Failed to track partial message: {e}")

    async def _buffer_audio_chunk(self, seq: int, audio_data: str) -> None:
        """Buffer audio chunk for checkpointing."""
        try:
            chunk = {
                "seq": seq,
                "audio": audio_data,
                "timestamp": time.time(),
            }
            await self._session_state_service.add_pending_audio_chunk(self.config.session_id, chunk)
        except Exception as e:
            logger.warning(f"Failed to buffer audio chunk: {e}")

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeats."""
        try:
            while self._running:
                await asyncio.sleep(30)  # Every 30 seconds
                if self._running:
                    await self._send_message({"type": "heartbeat"})
        except asyncio.CancelledError:
            pass

    async def _send_message(self, message: Dict[str, Any]) -> None:
        """Send a message to the client with sequence number.

        Uses message batcher if enabled for high-frequency messages.
        Buffers messages for recovery if message recovery is enabled.
        """
        # Add sequence number to all messages
        message["seq"] = self.config._message_sequence
        self.config._message_sequence += 1

        # DEBUG: Log important message types for barge-in tracing
        msg_type = message.get("type", "")
        if msg_type in ("voice.state", "input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"):
            logger.info(f"[WS] SENDING message: type={msg_type}, seq={message.get('seq')}, data={message}")

        try:
            # Buffer message for potential recovery (if enabled)
            if self.config.message_recovery_enabled:
                await self._buffer_message_for_recovery(message)

            # Use batcher if available and enabled
            if self._batcher and self.config.message_batching_enabled:
                await self._batcher.queue_message(message)
            else:
                await self.websocket.send_json(message)
            self._metrics.messages_sent += 1
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            self._metrics.error_count += 1

    async def _buffer_message_for_recovery(self, message: Dict[str, Any]) -> None:
        """Buffer a message for potential recovery after disconnect."""
        try:
            # Only buffer certain message types that are important for recovery
            msg_type = message.get("type", "")
            bufferable_types = {
                "transcript.delta",
                "transcript.complete",
                "response.delta",
                "response.complete",
                "tool.call",
                "tool.result",
                "voice.state",
            }

            if msg_type in bufferable_types:
                # Honor per-session privacy preference: when transcript history
                # is disabled, avoid buffering transcript/response content.
                if (
                    not self.config.store_transcript_history
                    and msg_type
                    in {
                        "transcript.delta",
                        "transcript.complete",
                        "response.delta",
                        "response.complete",
                    }
                ):
                    return
                await self._session_state_service.buffer_message(self.config.session_id, message)
        except Exception as e:
            logger.warning(f"Failed to buffer message for recovery: {e}")

    async def _send_error(self, code: str, message: str, recoverable: bool = True) -> None:
        """Send an error message to the client."""
        await self._send_message(
            {
                "type": "error",
                "code": code,
                "message": message,
                "recoverable": recoverable,
            }
        )

    def _get_metrics_dict(self) -> Dict[str, Any]:
        """Get metrics as dictionary."""
        return {
            "first_audio_latency_ms": self._metrics.first_audio_latency_ms,
            "user_utterance_count": self._metrics.user_utterance_count,
            "ai_response_count": self._metrics.ai_response_count,
            "barge_in_count": self._metrics.barge_in_count,
            "error_count": self._metrics.error_count,
            "messages_sent": self._metrics.messages_sent,
            "messages_received": self._metrics.messages_received,
        }

    def get_metrics(self) -> TTSessionMetrics:
        """Get current session metrics."""
        return self._metrics


# ==============================================================================
# Session Manager
# ==============================================================================


class ThinkerTalkerSessionManager:
    """
    Manager for Thinker/Talker WebSocket sessions.

    Handles session lifecycle and provides both T/T and Realtime API modes.
    """

    def __init__(self, max_sessions: int = 100):
        self.max_sessions = max_sessions
        self._sessions: Dict[str, ThinkerTalkerWebSocketHandler] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self,
        websocket: WebSocket,
        config: TTSessionConfig,
    ) -> ThinkerTalkerWebSocketHandler:
        """
        Create a new T/T session.

        Args:
            websocket: Starlette WebSocket instance
            config: Session configuration

        Returns:
            ThinkerTalkerWebSocketHandler instance

        Raises:
            ValueError: If max sessions reached
        """
        async with self._lock:
            if len(self._sessions) >= self.max_sessions:
                raise ValueError("Maximum concurrent sessions reached")

            handler = ThinkerTalkerWebSocketHandler(
                websocket=websocket,
                config=config,
            )

            self._sessions[config.session_id] = handler
            return handler

    async def get_session(self, session_id: str) -> Optional[ThinkerTalkerWebSocketHandler]:
        """Get a session by ID."""
        return self._sessions.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """Remove a session."""
        async with self._lock:
            if session_id in self._sessions:
                handler = self._sessions.pop(session_id)
                await handler.stop()

    def get_active_session_count(self) -> int:
        """Get count of active sessions."""
        return len(self._sessions)


# Global session manager
thinker_talker_session_manager = ThinkerTalkerSessionManager()
