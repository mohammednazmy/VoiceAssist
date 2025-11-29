"""
Enhanced Voice WebSocket Handler

Provides bidirectional voice streaming with:
- Barge-in support (interrupt AI speech when user speaks)
- Echo cancellation integration
- Noise suppression integration
- OpenAI Realtime API proxy
- Connection state management
- Metrics and observability

This handler acts as a proxy between the client and OpenAI's Realtime API,
adding audio processing and conversation control features.
"""

import asyncio
import base64
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

import websockets
from app.core.config import settings
from app.core.logging import get_logger
from app.services.audio_processor import StreamingAudioProcessor
from app.services.voice_activity_detector import StreamingVAD, VADConfig
from websockets.asyncio.client import ClientConnection

logger = get_logger(__name__)

# Import tool service for function calling support
try:
    from app.services.tools import tool_service
    from app.services.tools.tool_service import ToolExecutionContext

    TOOLS_AVAILABLE = True
except ImportError:
    TOOLS_AVAILABLE = False
    logger.warning("Tool service not available - function calling disabled")


class ConnectionState(Enum):
    """Voice connection states"""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    AUTHENTICATED = "authenticated"
    READY = "ready"
    ERROR = "error"


class ConversationState(Enum):
    """Conversation turn states"""

    IDLE = "idle"
    USER_SPEAKING = "user_speaking"
    AI_THINKING = "ai_thinking"
    AI_SPEAKING = "ai_speaking"
    BARGE_IN = "barge_in"


@dataclass
class VoiceSessionConfig:
    """Configuration for a voice session"""

    # User and session identifiers
    user_id: str
    session_id: str
    conversation_id: Optional[str] = None

    # OpenAI configuration
    model: str = "gpt-4o-realtime-preview-2024-12-17"
    voice: str = "alloy"

    # Audio processing settings
    echo_cancellation: bool = True
    noise_suppression: bool = True

    # VAD settings
    vad_threshold: float = 0.5
    vad_prefix_padding_ms: int = 300
    vad_silence_duration_ms: int = 500

    # Barge-in settings
    barge_in_enabled: bool = True
    barge_in_threshold_ms: int = 200  # Min speech duration to trigger barge-in
    barge_in_debounce_ms: int = 100  # Debounce to prevent false positives

    # Timeouts
    connection_timeout_sec: float = 10.0
    response_timeout_sec: float = 30.0
    idle_timeout_sec: float = 300.0  # 5 minutes

    # Tool/Function calling settings
    tools_enabled: bool = True  # Enable function calling
    tool_categories: Optional[List[str]] = None  # Filter tool categories (None = all)


@dataclass
class SessionMetrics:
    """Metrics collected during a voice session"""

    connection_start_time: float = 0.0
    connection_time_ms: float = 0.0
    first_audio_latency_ms: float = 0.0
    total_user_speech_ms: float = 0.0
    total_ai_speech_ms: float = 0.0
    user_utterance_count: int = 0
    ai_response_count: int = 0
    barge_in_count: int = 0
    reconnect_count: int = 0
    error_count: int = 0
    messages_sent: int = 0
    messages_received: int = 0


@dataclass
class VoiceSessionState:
    """State for a voice session"""

    connection_state: ConnectionState = ConnectionState.DISCONNECTED
    conversation_state: ConversationState = ConversationState.IDLE
    current_response_id: Optional[str] = None
    current_item_id: Optional[str] = None
    is_playing_audio: bool = False
    user_speech_start_time: Optional[float] = None
    ai_speech_start_time: Optional[float] = None
    barge_in_pending: bool = False
    metrics: SessionMetrics = field(default_factory=SessionMetrics)


class VoiceWebSocketHandler:
    """
    Enhanced voice WebSocket handler with barge-in and audio processing.

    This handler manages the bidirectional communication between the client
    and OpenAI's Realtime API, adding audio processing features like echo
    cancellation, noise suppression, and barge-in support.
    """

    def __init__(
        self,
        config: VoiceSessionConfig,
        client_secret: str,
        on_state_change: Optional[Callable[[ConnectionState], None]] = None,
        on_transcript: Optional[Callable[[str, str], None]] = None,  # (role, text)
        on_audio: Optional[Callable[[bytes], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        self.config = config
        self.client_secret = client_secret
        self.state = VoiceSessionState()

        # Callbacks
        self._on_state_change = on_state_change
        self._on_transcript = on_transcript
        self._on_audio = on_audio
        self._on_error = on_error

        # Audio processing
        # Phase 11: Enable audio processor for both echo cancellation and noise suppression
        if config.echo_cancellation or config.noise_suppression:
            from app.services.audio_processor import AudioProcessorConfig

            processor_config = AudioProcessorConfig(
                sample_rate=24000,  # Match OpenAI Realtime API sample rate
                echo_enabled=config.echo_cancellation,
                noise_enabled=config.noise_suppression,
                agc_enabled=True,  # Always enable AGC for consistent levels
                highpass_enabled=True,  # Remove DC offset
            )
            self._audio_processor = StreamingAudioProcessor(processor_config)
            logger.debug(
                "Audio processor initialized",
                extra={
                    "echo_cancellation": config.echo_cancellation,
                    "noise_suppression": config.noise_suppression,
                },
            )
        else:
            self._audio_processor = None

        self._vad = StreamingVAD(
            VADConfig(
                threshold=config.vad_threshold,
                prefix_padding_ms=config.vad_prefix_padding_ms,
                silence_duration_ms=config.vad_silence_duration_ms,
            )
        )

        # WebSocket connections
        self._openai_ws: Optional[ClientConnection] = None
        self._tasks: List[asyncio.Task] = []

        # Buffers
        self._outgoing_audio_buffer: asyncio.Queue[bytes] = asyncio.Queue()
        self._incoming_audio_buffer: asyncio.Queue[bytes] = asyncio.Queue()
        self._speaker_audio_buffer: bytes = b""  # For echo cancellation

        # Control
        self._running = False
        self._shutdown_event = asyncio.Event()

    async def start(self) -> bool:
        """
        Start the voice session.

        Connects to OpenAI Realtime API and begins processing.

        Returns:
            True if connection successful, False otherwise
        """
        if self._running:
            logger.warning("Session already running")
            return True

        self._running = True
        self.state.metrics.connection_start_time = time.monotonic()
        self._update_connection_state(ConnectionState.CONNECTING)

        try:
            # Connect to OpenAI Realtime API
            connected = await self._connect_to_openai()
            if not connected:
                self._update_connection_state(ConnectionState.ERROR)
                return False

            # Configure session
            await self._configure_session()

            self._update_connection_state(ConnectionState.READY)

            # Start processing tasks
            self._tasks = [
                asyncio.create_task(self._openai_receiver()),
                asyncio.create_task(self._audio_sender()),
                asyncio.create_task(self._idle_monitor()),
            ]

            return True

        except Exception as e:
            logger.error(f"Failed to start voice session: {e}")
            self._update_connection_state(ConnectionState.ERROR)
            self._emit_error(str(e))
            return False

    async def stop(self) -> None:
        """Stop the voice session and cleanup resources."""
        if not self._running:
            return

        self._running = False
        self._shutdown_event.set()

        # Cancel all tasks
        for task in self._tasks:
            if not task.done():
                task.cancel()

        # Wait for tasks to finish
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        # Close WebSocket connection
        if self._openai_ws:
            try:
                await self._openai_ws.close()
            except Exception as e:
                logger.debug(f"Error closing OpenAI WebSocket: {e}")

        self._update_connection_state(ConnectionState.DISCONNECTED)
        logger.info(
            "Voice session stopped",
            extra={
                "session_id": self.config.session_id,
                "metrics": self._get_metrics_dict(),
            },
        )

    async def send_audio(self, audio_data: bytes) -> None:
        """
        Send audio data from the client.

        The audio is processed (VAD, noise suppression) before being
        sent to OpenAI.

        Args:
            audio_data: PCM16 audio data from the client
        """
        if not self._running:
            return

        # Apply noise suppression if enabled
        if self._audio_processor:
            audio_data = await self._audio_processor.process_chunk(audio_data, self._speaker_audio_buffer)

        # Process through VAD
        vad_state = await self._vad.process_chunk(audio_data)

        # Handle barge-in
        if self.config.barge_in_enabled:
            await self._handle_barge_in(vad_state)

        # Queue audio for sending to OpenAI
        await self._outgoing_audio_buffer.put(audio_data)

    async def send_text(self, text: str) -> None:
        """
        Send a text message to the conversation.

        Args:
            text: Text message from the user
        """
        if not self._openai_ws or not self._running:
            return

        # Create conversation item
        event = {
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": text}],
            },
        }
        await self._send_to_openai(event)

        # Trigger response generation
        await self._send_to_openai({"type": "response.create"})

    async def cancel_response(self) -> None:
        """Cancel the current AI response (barge-in)."""
        if not self._openai_ws or not self._running:
            return

        if self.state.current_response_id:
            logger.info(
                f"Cancelling response: {self.state.current_response_id}",
                extra={"session_id": self.config.session_id},
            )

            await self._send_to_openai({"type": "response.cancel"})
            self.state.barge_in_pending = False
            self.state.metrics.barge_in_count += 1

    async def _connect_to_openai(self) -> bool:
        """Connect to OpenAI Realtime API."""
        try:
            url = f"{settings.REALTIME_BASE_URL}?model={self.config.model}"

            self._openai_ws = await asyncio.wait_for(
                websockets.connect(
                    url,
                    additional_headers={
                        "Authorization": f"Bearer {self.client_secret}",
                        "OpenAI-Beta": "realtime=v1",
                    },
                ),
                timeout=self.config.connection_timeout_sec,
            )

            self.state.metrics.connection_time_ms = (time.monotonic() - self.state.metrics.connection_start_time) * 1000

            self._update_connection_state(ConnectionState.CONNECTED)
            logger.info(
                "Connected to OpenAI Realtime API",
                extra={
                    "session_id": self.config.session_id,
                    "connection_time_ms": self.state.metrics.connection_time_ms,
                },
            )
            return True

        except asyncio.TimeoutError:
            logger.error("OpenAI connection timeout")
            self._emit_error("Connection timeout")
            return False
        except Exception as e:
            logger.error(f"OpenAI connection error: {e}")
            self._emit_error(str(e))
            return False

    async def _configure_session(self) -> None:
        """Configure the OpenAI session with desired settings."""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": self._get_system_instructions(),
                "voice": self.config.voice,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": self.config.vad_threshold,
                    "prefix_padding_ms": self.config.vad_prefix_padding_ms,
                    "silence_duration_ms": self.config.vad_silence_duration_ms,
                },
            },
        }

        # Add tools if enabled and available
        if self.config.tools_enabled and TOOLS_AVAILABLE:
            try:
                tools = tool_service.get_openai_tools_for_realtime()
                if tools:
                    session_config["session"]["tools"] = tools
                    session_config["session"]["tool_choice"] = "auto"
                    logger.info(
                        f"Configured {len(tools)} tools for voice session",
                        extra={"session_id": self.config.session_id},
                    )
            except Exception as e:
                logger.warning(f"Failed to configure tools: {e}")

        await self._send_to_openai(session_config)
        self._update_connection_state(ConnectionState.AUTHENTICATED)

    def _get_system_instructions(self) -> str:
        """Get system instructions for the AI."""
        return """You are a helpful medical AI assistant in voice mode.

Guidelines:
- Keep responses concise and conversational
- Use natural spoken language, not written text
- Ask clarifying questions when needed
- Be empathetic and professional
- Cite sources when providing medical information
- Maintain HIPAA compliance at all times

When speaking:
- Use short sentences
- Avoid complex medical jargon unless requested
- Confirm understanding before proceeding
- Offer to provide more details if needed"""

    async def _openai_receiver(self) -> None:
        """Receive and process messages from OpenAI."""
        try:
            async for message in self._openai_ws:
                if not self._running:
                    break

                try:
                    event = json.loads(message)
                    await self._handle_openai_event(event)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON from OpenAI")
                except Exception as e:
                    logger.error(f"Error handling OpenAI event: {e}")
                    self.state.metrics.error_count += 1

        except websockets.ConnectionClosed as e:
            logger.info(f"OpenAI connection closed: {e}")
            if self._running:
                self._update_connection_state(ConnectionState.DISCONNECTED)
        except Exception as e:
            logger.error(f"OpenAI receiver error: {e}")
            self._emit_error(str(e))

    async def _handle_openai_event(self, event: Dict[str, Any]) -> None:
        """Handle an event from OpenAI."""
        event_type = event.get("type", "")
        self.state.metrics.messages_received += 1

        if event_type == "session.created":
            logger.debug("Session created successfully")

        elif event_type == "session.updated":
            logger.debug("Session updated")

        elif event_type == "response.created":
            self.state.current_response_id = event.get("response", {}).get("id")
            self._update_conversation_state(ConversationState.AI_THINKING)

        elif event_type == "response.output_item.added":
            item = event.get("item", {})
            self.state.current_item_id = item.get("id")

        elif event_type == "response.audio.delta":
            # AI is sending audio
            if self.state.conversation_state != ConversationState.AI_SPEAKING:
                self._update_conversation_state(ConversationState.AI_SPEAKING)
                self.state.ai_speech_start_time = time.monotonic()

                # Record first audio latency
                if self.state.metrics.first_audio_latency_ms == 0:
                    self.state.metrics.first_audio_latency_ms = (
                        time.monotonic() - self.state.metrics.connection_start_time
                    ) * 1000

            # Decode and forward audio
            audio_b64 = event.get("delta", "")
            if audio_b64:
                audio_data = base64.b64decode(audio_b64)
                self._speaker_audio_buffer = audio_data  # For echo cancellation
                if self._on_audio:
                    self._on_audio(audio_data)

        elif event_type == "response.audio.done":
            # AI finished sending audio
            if self.state.ai_speech_start_time:
                duration = (time.monotonic() - self.state.ai_speech_start_time) * 1000
                self.state.metrics.total_ai_speech_ms += duration
                self.state.ai_speech_start_time = None

        elif event_type == "response.audio_transcript.delta":
            # AI transcript chunk
            transcript = event.get("delta", "")
            if transcript and self._on_transcript:
                self._on_transcript("assistant", transcript)

        elif event_type == "response.audio_transcript.done":
            # Complete AI transcript
            transcript = event.get("transcript", "")
            logger.debug(f"AI transcript complete: {transcript[:100]}...")

        elif event_type == "response.done":
            # Response complete
            self.state.current_response_id = None
            self.state.current_item_id = None
            self.state.metrics.ai_response_count += 1
            self._update_conversation_state(ConversationState.IDLE)

        elif event_type == "input_audio_buffer.speech_started":
            # User started speaking
            self._update_conversation_state(ConversationState.USER_SPEAKING)
            self.state.user_speech_start_time = time.monotonic()

        elif event_type == "input_audio_buffer.speech_stopped":
            # User stopped speaking
            if self.state.user_speech_start_time:
                duration = (time.monotonic() - self.state.user_speech_start_time) * 1000
                self.state.metrics.total_user_speech_ms += duration
                self.state.user_speech_start_time = None
            self.state.metrics.user_utterance_count += 1

        elif event_type == "conversation.item.input_audio_transcription.completed":
            # User transcript complete
            transcript = event.get("transcript", "")
            if transcript and self._on_transcript:
                self._on_transcript("user", transcript)

        elif event_type == "response.function_call_arguments.done":
            # Function call is complete - execute the tool
            await self._handle_function_call(event)

        elif event_type == "response.output_item.done":
            item = event.get("item", {})
            if item.get("type") == "function_call":
                # Function call item completed - execute if not already handled
                await self._handle_function_call_item(item)

        elif event_type == "error":
            error = event.get("error", {})
            error_msg = error.get("message", "Unknown error")
            logger.error(f"OpenAI error: {error_msg}")
            self.state.metrics.error_count += 1
            self._emit_error(error_msg)

        elif event_type == "rate_limits.updated":
            # Rate limit info - log for monitoring
            rate_limits = event.get("rate_limits", [])
            logger.debug(f"Rate limits: {rate_limits}")

    async def _handle_function_call(self, event: Dict[str, Any]) -> None:
        """
        Handle a completed function call from OpenAI.

        Executes the tool and sends the result back to OpenAI.
        """
        if not TOOLS_AVAILABLE:
            logger.warning("Function call received but tools not available")
            return

        call_id = event.get("call_id")
        name = event.get("name")
        arguments_str = event.get("arguments", "{}")

        logger.info(
            f"Executing tool: {name}",
            extra={
                "session_id": self.config.session_id,
                "call_id": call_id,
                "arguments": arguments_str[:200],
            },
        )

        try:
            # Parse arguments
            arguments = json.loads(arguments_str)

            # Create execution context
            context = ToolExecutionContext(
                user_id=self.config.user_id,
                session_id=self.config.session_id,
                mode="voice",
            )

            # Execute the tool
            result = await tool_service.execute(name, arguments, context)

            # Prepare output
            if result.success:
                output = result.data
                if result.message:
                    # Include message in output for the AI to speak
                    if isinstance(output, dict):
                        output["_message"] = result.message
                    else:
                        output = {"result": output, "_message": result.message}
            else:
                output = {
                    "error": result.error,
                    "needs_clarification": result.needs_clarification,
                    "needs_connection": result.needs_connection,
                }
                if result.available_calendars:
                    output["available_calendars"] = result.available_calendars
                if result.message:
                    output["_message"] = result.message

            # Send result back to OpenAI
            output_event = {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": json.dumps(output),
                },
            }
            await self._send_to_openai(output_event)

            # Trigger response generation
            await self._send_to_openai({"type": "response.create"})

            logger.info(
                f"Tool executed: {name} - {'success' if result.success else 'failed'}",
                extra={
                    "session_id": self.config.session_id,
                    "duration_ms": result.duration_ms,
                },
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse function arguments: {e}")
            await self._send_function_error(call_id, f"Invalid arguments: {e}")
        except Exception as e:
            logger.exception(f"Error executing tool {name}: {e}")
            await self._send_function_error(call_id, str(e))

    async def _handle_function_call_item(self, item: Dict[str, Any]) -> None:
        """Handle a function call item from response.output_item.done."""
        # This is an alternative event format - extract call info and handle
        call_id = item.get("call_id")
        name = item.get("name")
        arguments_str = item.get("arguments", "{}")

        if call_id and name:
            # Create a compatible event and handle it
            event = {
                "call_id": call_id,
                "name": name,
                "arguments": arguments_str,
            }
            await self._handle_function_call(event)

    async def _send_function_error(self, call_id: str, error_message: str) -> None:
        """Send a function call error back to OpenAI."""
        output_event = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps({"error": error_message}),
            },
        }
        await self._send_to_openai(output_event)
        await self._send_to_openai({"type": "response.create"})

    async def _audio_sender(self) -> None:
        """Send audio from buffer to OpenAI."""
        try:
            while self._running:
                try:
                    audio_data = await asyncio.wait_for(self._outgoing_audio_buffer.get(), timeout=0.1)

                    if self._openai_ws and audio_data:
                        # Encode audio as base64
                        audio_b64 = base64.b64encode(audio_data).decode()

                        event = {
                            "type": "input_audio_buffer.append",
                            "audio": audio_b64,
                        }
                        await self._send_to_openai(event)

                except asyncio.TimeoutError:
                    continue

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Audio sender error: {e}")

    async def _idle_monitor(self) -> None:
        """Monitor for idle timeout."""
        try:
            last_activity = time.monotonic()

            while self._running:
                await asyncio.sleep(10)  # Check every 10 seconds

                # Update activity time if there was recent activity
                if self.state.conversation_state != ConversationState.IDLE:
                    last_activity = time.monotonic()

                # Check for idle timeout
                idle_time = time.monotonic() - last_activity
                if idle_time > self.config.idle_timeout_sec:
                    logger.info(
                        f"Session idle timeout after {idle_time:.0f}s",
                        extra={"session_id": self.config.session_id},
                    )
                    await self.stop()
                    break

        except asyncio.CancelledError:
            pass

    async def _handle_barge_in(self, vad_state) -> None:
        """Handle barge-in when user speaks during AI speech."""
        from app.services.voice_activity_detector import SpeechState

        if self.state.conversation_state != ConversationState.AI_SPEAKING:
            return

        if vad_state in (SpeechState.SPEECH_START, SpeechState.SPEAKING):
            if not self.state.barge_in_pending:
                self.state.barge_in_pending = True
                # Small delay to avoid false positives
                await asyncio.sleep(self.config.barge_in_debounce_ms / 1000)

                # Check if still speaking after debounce
                if self._vad.is_speaking():
                    logger.info(
                        "Barge-in detected, cancelling AI response",
                        extra={"session_id": self.config.session_id},
                    )
                    await self.cancel_response()
                    self._update_conversation_state(ConversationState.BARGE_IN)

    async def _send_to_openai(self, event: Dict[str, Any]) -> None:
        """Send an event to OpenAI."""
        if not self._openai_ws:
            return

        try:
            message = json.dumps(event)
            await self._openai_ws.send(message)
            self.state.metrics.messages_sent += 1
        except Exception as e:
            logger.error(f"Error sending to OpenAI: {e}")
            self.state.metrics.error_count += 1

    def _update_connection_state(self, new_state: ConnectionState) -> None:
        """Update connection state and notify callback."""
        old_state = self.state.connection_state
        self.state.connection_state = new_state

        if old_state != new_state:
            logger.debug(f"Connection state: {old_state.value} -> {new_state.value}")
            if self._on_state_change:
                self._on_state_change(new_state)

    def _update_conversation_state(self, new_state: ConversationState) -> None:
        """Update conversation state."""
        old_state = self.state.conversation_state
        self.state.conversation_state = new_state

        if old_state != new_state:
            logger.debug(f"Conversation state: {old_state.value} -> {new_state.value}")

    def _emit_error(self, message: str) -> None:
        """Emit error to callback."""
        self.state.metrics.error_count += 1
        if self._on_error:
            self._on_error(message)

    def _get_metrics_dict(self) -> Dict[str, Any]:
        """Get metrics as dictionary."""
        return {
            "connection_time_ms": self.state.metrics.connection_time_ms,
            "first_audio_latency_ms": self.state.metrics.first_audio_latency_ms,
            "total_user_speech_ms": self.state.metrics.total_user_speech_ms,
            "total_ai_speech_ms": self.state.metrics.total_ai_speech_ms,
            "user_utterance_count": self.state.metrics.user_utterance_count,
            "ai_response_count": self.state.metrics.ai_response_count,
            "barge_in_count": self.state.metrics.barge_in_count,
            "error_count": self.state.metrics.error_count,
            "messages_sent": self.state.metrics.messages_sent,
            "messages_received": self.state.metrics.messages_received,
        }

    def get_metrics(self) -> SessionMetrics:
        """Get current session metrics."""
        return self.state.metrics


class VoiceSessionManager:
    """
    Manager for multiple concurrent voice sessions.

    Handles session lifecycle, cleanup, and resource management.
    """

    def __init__(self, max_sessions: int = 100):
        self.max_sessions = max_sessions
        self._sessions: Dict[str, VoiceWebSocketHandler] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self,
        config: VoiceSessionConfig,
        client_secret: str,
        **callbacks,
    ) -> VoiceWebSocketHandler:
        """
        Create a new voice session.

        Args:
            config: Session configuration
            client_secret: OpenAI ephemeral client secret
            **callbacks: Optional callback functions

        Returns:
            VoiceWebSocketHandler instance

        Raises:
            ValueError: If max sessions reached
        """
        async with self._lock:
            if len(self._sessions) >= self.max_sessions:
                raise ValueError("Maximum concurrent sessions reached")

            handler = VoiceWebSocketHandler(
                config=config,
                client_secret=client_secret,
                **callbacks,
            )

            self._sessions[config.session_id] = handler
            return handler

    async def get_session(self, session_id: str) -> Optional[VoiceWebSocketHandler]:
        """Get a session by ID."""
        return self._sessions.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """Remove a session."""
        async with self._lock:
            if session_id in self._sessions:
                handler = self._sessions.pop(session_id)
                await handler.stop()

    async def cleanup_stale_sessions(self, max_age_sec: float = 3600) -> int:
        """
        Clean up sessions that have been running too long.

        Args:
            max_age_sec: Maximum session age in seconds

        Returns:
            Number of sessions cleaned up
        """
        async with self._lock:
            to_remove = []
            current_time = time.monotonic()

            for session_id, handler in self._sessions.items():
                session_age = current_time - handler.state.metrics.connection_start_time
                if session_age > max_age_sec:
                    to_remove.append(session_id)

            for session_id in to_remove:
                handler = self._sessions.pop(session_id)
                await handler.stop()
                logger.info(f"Cleaned up stale session: {session_id}")

            return len(to_remove)

    def get_active_session_count(self) -> int:
        """Get count of active sessions."""
        return len(self._sessions)

    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get metrics for all sessions."""
        return {session_id: handler._get_metrics_dict() for session_id, handler in self._sessions.items()}


# Global session manager instance
voice_session_manager = VoiceSessionManager()
