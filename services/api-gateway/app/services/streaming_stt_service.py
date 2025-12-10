"""
Streaming Speech-to-Text Service

Provides real-time speech transcription with multiple provider support.
Primary: Deepgram (100-150ms latency, true streaming)
Fallback: OpenAI Whisper (batch API)

Phase: Thinker/Talker Voice Pipeline Migration
"""

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Dict, List, Optional

import httpx
import websockets
from app.core.config import settings
from app.core.logging import get_logger
from websockets.exceptions import ConnectionClosed

logger = get_logger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


class STTProvider(str, Enum):
    """Supported STT providers."""

    DEEPGRAM = "deepgram"
    WHISPER = "whisper"


@dataclass
class TranscriptChunk:
    """A chunk of transcribed text."""

    text: str
    is_final: bool
    confidence: float = 0.0
    start_time: float = 0.0
    end_time: float = 0.0
    words: List[Dict] = field(default_factory=list)
    # Prosody-related fields
    speech_final: bool = False  # True when speech segment is complete


@dataclass
class TranscriptionResult:
    """Final result of a transcription session."""

    text: str
    confidence: float
    duration_ms: int
    provider: STTProvider
    language: Optional[str] = None
    words: List[Dict] = field(default_factory=list)


@dataclass
class STTSessionConfig:
    """Configuration for an STT session."""

    language: str = "en"
    sample_rate: int = 16000
    encoding: str = "linear16"  # PCM16
    channels: int = 1
    interim_results: bool = True
    punctuate: bool = True
    # Endpointing: Time of silence before considering speech ended
    # 800ms allows for natural pauses in speech (was 120ms - too aggressive)
    endpointing_ms: int = 800
    # Utterance end: Time after speech stops before finalizing
    # 1500ms allows users to think mid-sentence (was 1000ms hardcoded)
    utterance_end_ms: int = 1500
    vad_events: bool = True
    smart_format: bool = True


# ==============================================================================
# Deepgram Streaming STT
# ==============================================================================


class DeepgramStreamingSession:
    """
    Real-time streaming STT session using Deepgram WebSocket API.

    Features:
    - True streaming transcription (100-150ms latency)
    - Interim results as user speaks
    - Endpoint detection (speech end)
    - VAD events
    """

    WEBSOCKET_URL = "wss://api.deepgram.com/v1/listen"

    def __init__(
        self,
        api_key: str,
        config: STTSessionConfig,
        on_partial: Callable[[str, float], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
        on_endpoint: Callable[[], Awaitable[None]],
        on_speech_start: Optional[Callable[[], Awaitable[None]]] = None,
        on_words: Optional[Callable[[List[Dict]], Awaitable[None]]] = None,
    ):
        self.api_key = api_key
        self.config = config
        self.on_partial = on_partial
        self.on_final = on_final
        self.on_endpoint = on_endpoint
        self.on_speech_start = on_speech_start
        self.on_words = on_words  # Callback for word-level data (prosody analysis)

        self._websocket: Optional[websockets.WebSocketClientProtocol] = None
        self._running = False
        self._receive_task: Optional[asyncio.Task] = None
        self._final_transcript = ""
        self._start_time: float = 0

    def _build_url(self) -> str:
        """Build WebSocket URL with query parameters."""
        params = [
            f"language={self.config.language}",
            f"sample_rate={self.config.sample_rate}",
            f"encoding={self.config.encoding}",
            f"channels={self.config.channels}",
            f"interim_results={str(self.config.interim_results).lower()}",
            f"punctuate={str(self.config.punctuate).lower()}",
            f"endpointing={self.config.endpointing_ms}",
            f"vad_events={str(self.config.vad_events).lower()}",
            f"smart_format={str(self.config.smart_format).lower()}",
            "model=nova-2",  # Best accuracy/latency balance
            f"utterance_end_ms={self.config.utterance_end_ms}",  # Send UtteranceEnd after speech stops
        ]
        logger.info(
            f"[Deepgram] Connecting with params: endpointing={self.config.endpointing_ms}ms, "
            f"utterance_end={self.config.utterance_end_ms}ms"
        )
        return f"{self.WEBSOCKET_URL}?{'&'.join(params)}"

    async def start(self, max_retries: int = 3) -> bool:
        """Start the streaming session with retry logic."""
        if self._running:
            logger.warning("Deepgram session already running")
            return False

        url = self._build_url()
        headers = {"Authorization": f"Token {self.api_key}"}

        for attempt in range(max_retries):
            try:
                self._websocket = await websockets.connect(
                    url,
                    additional_headers=headers,
                    ping_interval=20,
                    ping_timeout=10,
                )

                self._running = True
                self._start_time = time.time()
                self._final_transcript = ""
                # Reset drop logging flag for new session
                if hasattr(self, "_drop_logged"):
                    delattr(self, "_drop_logged")

                # Start receiving messages
                self._receive_task = asyncio.create_task(self._receive_loop())

                logger.info(f"Deepgram streaming session started (attempt {attempt + 1})")
                return True

            except Exception as e:
                logger.warning(f"Deepgram connection attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    # Wait before retrying (exponential backoff)
                    delay = 0.5 * (2 ** attempt)
                    logger.info(f"Retrying Deepgram connection in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Failed to start Deepgram session after {max_retries} attempts: {e}")

        self._running = False
        return False

    async def send_audio(self, audio_chunk: bytes) -> None:
        """Send audio chunk to Deepgram."""
        if not self._running or not self._websocket:
            if not hasattr(self, "_drop_logged"):
                logger.warning(f"[Deepgram] Dropping audio: running={self._running}, ws={self._websocket is not None}")
                self._drop_logged = True
            return

        try:
            # Track audio sent
            if not hasattr(self, "_audio_sent_count"):
                self._audio_sent_count = 0
            self._audio_sent_count += 1
            if self._audio_sent_count % 50 == 0:
                logger.debug(f"[Deepgram] Sent audio chunk #{self._audio_sent_count}, {len(audio_chunk)} bytes")
            await self._websocket.send(audio_chunk)
        except ConnectionClosed:
            logger.warning("Deepgram connection closed while sending audio")
            self._running = False
        except Exception as e:
            logger.error(f"Error sending audio to Deepgram: {e}")

    async def stop(self) -> str:
        """Stop the session and return final transcript."""
        if not self._running:
            return self._final_transcript

        self._running = False

        try:
            # Send close message to Deepgram
            if self._websocket:
                await self._websocket.send(json.dumps({"type": "CloseStream"}))
                await asyncio.sleep(0.1)  # Allow final messages
                await self._websocket.close()
        except Exception as e:
            logger.debug(f"Error closing Deepgram connection: {e}")

        # Cancel receive task
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass

        logger.info(
            "Deepgram session stopped",
            extra={
                "duration_ms": int((time.time() - self._start_time) * 1000),
                "transcript_length": len(self._final_transcript),
            },
        )

        return self._final_transcript

    async def _receive_loop(self) -> None:
        """Receive and process messages from Deepgram."""
        try:
            while self._running and self._websocket:
                try:
                    message = await asyncio.wait_for(self._websocket.recv(), timeout=30.0)
                    await self._handle_message(message)
                except asyncio.TimeoutError:
                    # Send keepalive
                    if self._websocket:
                        await self._websocket.send(json.dumps({"type": "KeepAlive"}))
                except ConnectionClosed:
                    logger.info("Deepgram connection closed")
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in Deepgram receive loop: {e}")
        finally:
            self._running = False

    async def _handle_message(self, message: str) -> None:
        """Handle a message from Deepgram."""
        try:
            data = json.loads(message)
            msg_type = data.get("type", "")

            # Log all message types for debugging
            if not hasattr(self, "_dg_msg_counts"):
                self._dg_msg_counts = {}
            self._dg_msg_counts[msg_type] = self._dg_msg_counts.get(msg_type, 0) + 1
            if self._dg_msg_counts[msg_type] <= 3 or self._dg_msg_counts[msg_type] % 50 == 0:
                logger.info(f"[Deepgram] Received {msg_type} message #{self._dg_msg_counts[msg_type]}")

            if msg_type == "Results":
                await self._handle_results(data)
            elif msg_type == "UtteranceEnd":
                # Speech endpoint detected
                logger.info("[Deepgram] UtteranceEnd - speech endpoint detected")
                await self.on_endpoint()
            elif msg_type == "SpeechStarted":
                logger.info("[Deepgram] SpeechStarted detected - triggering barge-in callback")
                if self.on_speech_start:
                    await self.on_speech_start()
            elif msg_type == "Metadata":
                logger.info(f"[Deepgram] Metadata: request_id={data.get('request_id', 'N/A')}")
            elif msg_type == "Error":
                logger.error(f"[Deepgram] ERROR: {data}")
            else:
                logger.debug(f"[Deepgram] Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON from Deepgram: {message[:100]}")

    async def _handle_results(self, data: dict) -> None:
        """Handle transcription results."""
        channel = data.get("channel", {})
        alternatives = channel.get("alternatives", [])

        if not alternatives:
            logger.debug("[Deepgram] Results with no alternatives")
            return

        best = alternatives[0]
        transcript = best.get("transcript", "")
        confidence = best.get("confidence", 0.0)
        is_final = data.get("is_final", False)
        words = best.get("words", [])

        # Log all results for debugging
        if transcript:
            logger.info(f"[Deepgram] TRANSCRIPT: '{transcript}' (final={is_final}, conf={confidence:.2f})")
        else:
            # Log empty transcripts occasionally
            if not hasattr(self, "_empty_count"):
                self._empty_count = 0
            self._empty_count += 1
            if self._empty_count <= 3 or self._empty_count % 20 == 0:
                logger.debug(f"[Deepgram] Empty transcript #{self._empty_count} (final={is_final})")
            return

        # Send word-level data for prosody analysis
        if words and self.on_words:
            await self.on_words(words)

        if is_final:
            # Append to final transcript
            if self._final_transcript:
                self._final_transcript += " " + transcript
            else:
                self._final_transcript = transcript

            logger.info(f"[Deepgram] Calling on_final callback with: '{transcript}'")
            await self.on_final(transcript)
        else:
            # Interim result
            logger.info(f"[Deepgram] Calling on_partial callback with: '{transcript}'")
            await self.on_partial(transcript, confidence)


# ==============================================================================
# Whisper Fallback STT
# ==============================================================================


class WhisperSTTService:
    """
    OpenAI Whisper STT service (batch mode fallback).

    Used when Deepgram is unavailable or for offline processing.
    Higher latency (~500ms) but more robust.
    """

    TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(max_connections=5),
            )
        return self._http_client

    async def transcribe(
        self,
        audio_data: bytes,
        language: str = "en",
        prompt: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio using Whisper API.

        Args:
            audio_data: Raw audio bytes (WAV, MP3, etc.)
            language: Language code
            prompt: Optional prompt for context

        Returns:
            TranscriptionResult with text and metadata
        """
        start_time = time.time()

        try:
            client = await self._get_client()

            # Prepare multipart form data
            files = {
                "file": ("audio.wav", audio_data, "audio/wav"),
            }
            data = {
                "model": "whisper-1",
                "language": language,
                "response_format": "verbose_json",
            }
            if prompt:
                data["prompt"] = prompt

            response = await client.post(
                self.TRANSCRIPTION_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                files=files,
                data=data,
            )

            if response.status_code != 200:
                raise ValueError(f"Whisper API error: {response.status_code} - {response.text}")

            result = response.json()
            duration_ms = int((time.time() - start_time) * 1000)

            return TranscriptionResult(
                text=result.get("text", ""),
                confidence=1.0,  # Whisper doesn't provide confidence
                duration_ms=duration_ms,
                provider=STTProvider.WHISPER,
                language=result.get("language"),
                words=result.get("words", []),
            )

        except Exception as e:
            logger.error(f"Whisper transcription failed: {e}")
            raise

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None


# ==============================================================================
# Unified Streaming STT Service
# ==============================================================================


class StreamingSTTService:
    """
    Unified streaming STT service with provider fallback.

    Primary: Deepgram (streaming, 100-150ms latency)
    Fallback: Whisper (batch, ~500ms latency)

    Usage:
        service = StreamingSTTService()
        session = await service.create_session(
            on_partial=handle_partial,
            on_final=handle_final,
            on_endpoint=handle_endpoint,
        )
        await session.start()
        await session.send_audio(audio_chunk)
        final_text = await session.stop()
    """

    def __init__(self):
        self.deepgram_api_key = settings.DEEPGRAM_API_KEY
        self.openai_api_key = settings.OPENAI_API_KEY

        self.deepgram_enabled = bool(self.deepgram_api_key)
        self.whisper_enabled = bool(self.openai_api_key)

        self._whisper_service: Optional[WhisperSTTService] = None

        logger.info(
            "StreamingSTTService initialized",
            extra={
                "deepgram_enabled": self.deepgram_enabled,
                "whisper_enabled": self.whisper_enabled,
            },
        )

    def is_streaming_available(self) -> bool:
        """Check if streaming STT is available."""
        return self.deepgram_enabled

    def is_fallback_available(self) -> bool:
        """Check if fallback STT is available."""
        return self.whisper_enabled

    async def create_session(
        self,
        on_partial: Callable[[str, float], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
        on_endpoint: Callable[[], Awaitable[None]],
        on_speech_start: Optional[Callable[[], Awaitable[None]]] = None,
        on_words: Optional[Callable[[List[Dict]], Awaitable[None]]] = None,
        config: Optional[STTSessionConfig] = None,
    ) -> DeepgramStreamingSession:
        """
        Create a new streaming STT session.

        Args:
            on_partial: Callback for partial transcripts (text, confidence)
            on_final: Callback for final transcripts
            on_endpoint: Callback for speech endpoint detection
            on_speech_start: Optional callback for speech start (barge-in)
            on_words: Optional callback for word-level data (prosody analysis)
            config: Optional session configuration

        Returns:
            DeepgramStreamingSession instance

        Raises:
            ValueError: If Deepgram is not available
        """
        if not self.deepgram_enabled:
            raise ValueError("Deepgram STT is not configured. Check DEEPGRAM_API_KEY.")

        config = config or STTSessionConfig()

        return DeepgramStreamingSession(
            api_key=self.deepgram_api_key,
            config=config,
            on_partial=on_partial,
            on_final=on_final,
            on_endpoint=on_endpoint,
            on_speech_start=on_speech_start,
            on_words=on_words,
        )

    async def transcribe_batch(
        self,
        audio_data: bytes,
        language: str = "en",
        prompt: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio using batch API (Whisper fallback).

        Use this when streaming is unavailable or for offline processing.

        Args:
            audio_data: Raw audio bytes
            language: Language code
            prompt: Optional context prompt

        Returns:
            TranscriptionResult with transcribed text
        """
        if not self.whisper_enabled:
            raise ValueError("Whisper STT is not configured. Check OPENAI_API_KEY.")

        if self._whisper_service is None:
            self._whisper_service = WhisperSTTService(self.openai_api_key)

        return await self._whisper_service.transcribe(
            audio_data=audio_data,
            language=language,
            prompt=prompt,
        )

    async def transcribe_with_fallback(
        self,
        audio_data: bytes,
        language: str = "en",
    ) -> TranscriptionResult:
        """
        Transcribe audio with automatic provider fallback.

        Tries Deepgram first (via batch endpoint), falls back to Whisper.

        Args:
            audio_data: Raw audio bytes
            language: Language code

        Returns:
            TranscriptionResult with provider information
        """
        # For batch transcription, use Whisper (more reliable)
        # Deepgram streaming is preferred for real-time
        if self.whisper_enabled:
            try:
                return await self.transcribe_batch(audio_data, language)
            except Exception as e:
                logger.warning(f"Whisper transcription failed, no fallback: {e}")
                raise

        raise ValueError("No STT provider available")

    async def close(self) -> None:
        """Clean up resources."""
        if self._whisper_service:
            await self._whisper_service.close()
            self._whisper_service = None


# Global service instance
streaming_stt_service = StreamingSTTService()
