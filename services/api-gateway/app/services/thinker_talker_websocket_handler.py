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

WebSocket Reliability Enhancement (Phase 1):
- Binary audio frame support (feature flag: backend.voice_ws_binary_audio)
- Reduces bandwidth by ~25% by eliminating base64 encoding
- Protocol version negotiation via session.init message
"""

import asyncio
import base64
import json
import struct
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger
from app.services.voice_pipeline_service import (
    PipelineConfig,
    PipelineMessage,
    PipelineState,
    VoicePipelineService,
    VoicePipelineSession,
    voice_pipeline_service,
)
from starlette.websockets import WebSocket, WebSocketDisconnect

logger = get_logger(__name__)


# ==============================================================================
# Binary Audio Frame Protocol Constants
# ==============================================================================

# Binary frame type identifiers
BINARY_FRAME_AUDIO_INPUT = 0x01  # Client → Server: Audio input
BINARY_FRAME_AUDIO_OUTPUT = 0x02  # Server → Client: Audio output

# Minimum binary frame size (1 byte type + 4 bytes sequence)
BINARY_FRAME_HEADER_SIZE = 5

# Protocol version for feature negotiation
PROTOCOL_VERSION = "2.0"


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

    # Phase 9: Offline/fallback settings
    enable_offline_fallback: bool = True
    tts_cache_enabled: bool = True

    # Phase 10: Conversation management settings
    enable_sentiment_tracking: bool = True
    enable_discourse_analysis: bool = True
    enable_response_recommendations: bool = True

    # WebSocket Reliability Enhancement: Protocol features
    # These are negotiated during session.init and depend on feature flags
    protocol_version: str = "1.0"  # Default to 1.0 (base64 only)
    binary_audio_enabled: bool = False  # Set via feature flag + client negotiation
    supported_features: List[str] = field(default_factory=list)


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

        # Binary audio frame tracking
        self._audio_output_sequence: int = 0  # Sequence counter for binary output frames
        self._binary_audio_feature_flag_checked: bool = False
        self._binary_audio_feature_flag_enabled: bool = False

    @property
    def connection_state(self) -> TTConnectionState:
        """Get current connection state."""
        return self._connection_state

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

            # Create pipeline session
            pipeline_config = PipelineConfig(
                stt_language=self.config.language,
                stt_sample_rate=self.config.stt_sample_rate,
                stt_endpointing_ms=self.config.stt_endpointing_ms,
                stt_utterance_end_ms=self.config.stt_utterance_end_ms,
                voice_id=self.config.voice_id,
                tts_model=self.config.tts_model,
                barge_in_enabled=self.config.barge_in_enabled,
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

            # Send ready message to client
            await self._send_message(
                {
                    "type": "session.ready",
                    "session_id": self.config.session_id,
                    "pipeline_mode": "thinker_talker",
                }
            )

            # Start receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            logger.info(
                f"T/T WebSocket handler started: {self.config.session_id}",
                extra={"user_id": self.config.user_id},
            )
            return True

        except Exception as e:
            logger.error(f"Failed to start T/T handler: {e}")
            self._connection_state = TTConnectionState.ERROR
            await self._send_error("connection_failed", str(e))
            return False

    async def stop(self) -> TTSessionMetrics:
        """
        Stop the handler and cleanup.

        Returns:
            Session metrics
        """
        if not self._running:
            return self._metrics

        self._running = False

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

        # Stop pipeline session
        if self._pipeline_session:
            await self._pipeline_session.stop()

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

    async def _receive_loop(self) -> None:
        """Receive and process messages from client.

        Supports both text (JSON) and binary (audio) frames.
        Binary frame support is enabled via feature flag and client negotiation.
        """
        logger.debug(f"[WS] Starting receive loop for {self.config.session_id}")
        try:
            while self._running:
                try:
                    # Use low-level receive to handle both text and binary
                    message = await self.websocket.receive()

                    if message["type"] == "websocket.receive":
                        if "bytes" in message and message["bytes"] is not None:
                            # Binary frame - audio data
                            await self._handle_binary_frame(message["bytes"])
                        elif "text" in message and message["text"] is not None:
                            # Text frame - JSON message
                            try:
                                json_message = json.loads(message["text"])
                                self._metrics.messages_received += 1
                                await self._handle_client_message(json_message)
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
        """Handle a binary WebSocket frame.

        Binary Frame Format:
        - Byte 0: Frame type (0x01 = audio input, 0x02 = audio output)
        - Bytes 1-4: Sequence number (big-endian uint32)
        - Bytes 5+: Payload (raw PCM16 audio data)

        Args:
            data: Raw binary frame data
        """
        if len(data) < BINARY_FRAME_HEADER_SIZE:
            logger.warning(f"Binary frame too small: {len(data)} bytes")
            return

        # Parse header
        frame_type = data[0]
        sequence = struct.unpack(">I", data[1:5])[0]  # Big-endian uint32
        audio_data = data[5:]

        if frame_type == BINARY_FRAME_AUDIO_INPUT:
            # Audio input from client
            self._metrics.messages_received += 1

            # Log every 100th chunk for debugging
            if self._metrics.messages_received % 100 == 0:
                logger.debug(
                    f"[WS] Binary audio chunk #{self._metrics.messages_received}, "
                    f"seq={sequence}, {len(audio_data)} bytes raw"
                )

            # Send directly to pipeline (no base64 decode needed!)
            if self._pipeline_session:
                await self._pipeline_session.send_audio(audio_data)
            else:
                logger.warning("Received binary audio but no pipeline session")
        else:
            logger.warning(f"Unknown binary frame type: {frame_type}")

    async def _is_binary_audio_enabled(self) -> bool:
        """Check if binary audio is enabled via feature flag.

        Caches the result to avoid repeated feature flag checks.
        """
        if not self._binary_audio_feature_flag_checked:
            self._binary_audio_feature_flag_checked = True
            try:
                from app.services.feature_flags import feature_flag_service

                self._binary_audio_feature_flag_enabled = await feature_flag_service.is_enabled(
                    "backend.voice_ws_binary_audio"
                )
                logger.debug(f"Binary audio feature flag: {self._binary_audio_feature_flag_enabled}")
            except Exception as e:
                logger.warning(f"Failed to check binary audio feature flag: {e}")
                self._binary_audio_feature_flag_enabled = False

        return self._binary_audio_feature_flag_enabled

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

            # WebSocket Reliability: Protocol negotiation
            client_protocol_version = message.get("protocol_version", "1.0")
            client_features = message.get("features", [])

            logger.info(
                f"Session init received: conv_id={conversation_id}, "
                f"settings={voice_settings}, advanced={advanced_settings}, "
                f"protocol_version={client_protocol_version}, features={client_features}"
            )

            # Negotiate binary audio support
            # Binary audio is enabled if:
            # 1. Feature flag is enabled AND
            # 2. Client requests "binary_audio" feature
            binary_audio_requested = "binary_audio" in client_features
            binary_audio_enabled = False

            if binary_audio_requested:
                binary_audio_enabled = await self._is_binary_audio_enabled()
                if binary_audio_enabled:
                    self.config.binary_audio_enabled = True
                    self.config.protocol_version = PROTOCOL_VERSION
                    self.config.supported_features = ["binary_audio"]
                    logger.info(f"Binary audio enabled for session {self.config.session_id}")
                else:
                    logger.info(
                        f"Binary audio requested but feature flag disabled for session {self.config.session_id}"
                    )

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
                    self.config.personalized_vad_threshold = advanced_settings["personalized_vad_threshold"]
                if "enable_behavior_learning" in advanced_settings:
                    self.config.enable_behavior_learning = advanced_settings["enable_behavior_learning"]

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

                logger.info(f"Applied advanced settings: {advanced_settings}")

            # Acknowledge the init with negotiated features
            await self._send_message(
                {
                    "type": "session.init.ack",
                    "protocol_version": self.config.protocol_version,
                    "features": self.config.supported_features,
                    "binary_audio_enabled": self.config.binary_audio_enabled,
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

        else:
            logger.warning(f"Unknown message type: {msg_type}")

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

        For audio.output messages, sends binary frames if binary audio is enabled,
        otherwise falls back to base64-encoded JSON.
        """
        # Special handling for audio output
        if message.type == "audio.output" and message.data.get("audio"):
            audio_data = message.data.get("audio")

            # Track first audio latency
            if self._metrics.first_audio_latency_ms == 0:
                self._metrics.first_audio_latency_ms = (time.time() - self._metrics.connection_start_time) * 1000

            # Send as binary if enabled, otherwise use base64 JSON
            if self.config.binary_audio_enabled:
                # Decode base64 audio from pipeline and send as binary
                try:
                    raw_audio = base64.b64decode(audio_data)
                    await self._send_binary_audio(raw_audio)
                except Exception as e:
                    logger.warning(f"Failed to send binary audio: {e}, falling back to base64")
                    await self._send_message({"type": message.type, **message.data})
            else:
                # Send as base64 JSON (legacy)
                await self._send_message({"type": message.type, **message.data})
        else:
            # Forward other pipeline messages to client as JSON
            await self._send_message({"type": message.type, **message.data})

        # Track metrics
        if message.type == "transcript.complete":
            self._metrics.user_utterance_count += 1
        elif message.type == "response.complete":
            self._metrics.ai_response_count += 1

    async def _send_binary_audio(self, audio_data: bytes) -> None:
        """Send audio data as a binary WebSocket frame.

        Binary Frame Format:
        - Byte 0: Frame type (0x02 = audio output)
        - Bytes 1-4: Sequence number (big-endian uint32)
        - Bytes 5+: Raw PCM audio data

        Args:
            audio_data: Raw PCM audio bytes
        """
        try:
            # Build binary frame header
            header = struct.pack(
                ">BI",  # Big-endian: 1 byte type + 4 byte uint32
                BINARY_FRAME_AUDIO_OUTPUT,
                self._audio_output_sequence,
            )
            self._audio_output_sequence += 1

            # Send binary frame
            await self.websocket.send_bytes(header + audio_data)
            self._metrics.messages_sent += 1

            # Log every 100th frame
            if self._audio_output_sequence % 100 == 0:
                logger.debug(
                    f"[WS] Sent binary audio frame #{self._audio_output_sequence}, " f"{len(audio_data)} bytes"
                )
        except Exception as e:
            logger.error(f"Error sending binary audio: {e}")
            self._metrics.error_count += 1

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
        """Send a message to the client."""
        try:
            await self.websocket.send_json(message)
            self._metrics.messages_sent += 1
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            self._metrics.error_count += 1

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
