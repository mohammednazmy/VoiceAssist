"""
Talker Service - Text-to-Speech Orchestration

Unified TTS service that manages streaming audio synthesis with:
- Sentence-based chunking from LLM output
- Audio queue management for gapless playback
- Cancellation support for barge-in
- Provider abstraction (ElevenLabs primary, OpenAI fallback)

Phase: Thinker/Talker Voice Pipeline Migration
"""

import asyncio
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Awaitable, Callable, Dict, List, Optional

from app.core.logging import get_logger
from app.core.resilience import elevenlabs_breaker
from app.services.elevenlabs_service import ElevenLabsService, elevenlabs_service
from app.services.openai_tts_service import OpenAITTSService, map_elevenlabs_voice_to_openai, openai_tts_service
from app.services.sentence_chunker import AdaptiveChunkerConfig, ChunkerConfig, SentenceChunker
from app.services.ssml_processor import SSMLProcessor, VoiceStyle
from app.services.tts.quality_presets import QualityPreset, get_preset_config
from pybreaker import CircuitBreakerError

logger = get_logger(__name__)


# ==============================================================================
# Markdown Stripping for TTS
# ==============================================================================


def strip_markdown_for_tts(text: str) -> str:
    """
    Strip markdown and LaTeX formatting from text for natural TTS speech.

    Converts markdown to plain text that sounds natural when spoken:
    - [Link Text](URL) → "Link Text"
    - **bold** → "bold"
    - *italic* → "italic"
    - `code` → "code"
    - ```code blocks``` → (removed entirely)
    - # Headers → "Headers"
    - - bullet points → text only
    - URLs → (removed or simplified)
    - LaTeX formulas → (removed entirely)

    Args:
        text: Text that may contain markdown or LaTeX

    Returns:
        Clean text suitable for TTS
    """
    if not text:
        return text

    result = text

    # ===========================================
    # Remove LaTeX/Math formulas FIRST
    # ===========================================

    # Remove display math: \[ ... \] (can span multiple lines)
    result = re.sub(r"\\\[[\s\S]*?\\\]", "", result)

    # Remove display math: $$ ... $$ (can span multiple lines)
    result = re.sub(r"\$\$[\s\S]*?\$\$", "", result)

    # Remove display math: [ ... ] when it contains LaTeX commands
    # This pattern matches [ ... ] blocks that contain backslashes (LaTeX)
    result = re.sub(r"\[\s*\\[^]]+\]", "", result)

    # Remove inline math: \( ... \)
    result = re.sub(r"\\\(.*?\\\)", "", result)

    # Remove inline math: $ ... $ (single dollars, not greedy)
    # Be careful not to match currency like "$5"
    result = re.sub(r"\$[^$\d][^$]*\$", "", result)

    # Remove standalone LaTeX commands that might remain
    result = re.sub(r"\\(?:text|frac|sqrt|sum|int|times|div|approx|neq|leq|geq|pm)\{[^}]*\}", "", result)
    result = re.sub(r"\\(?:text|frac|sqrt|sum|int|times|div|approx|neq|leq|geq|pm)", "", result)

    # Remove superscripts/subscripts: ^{...} and _{...}
    result = re.sub(r"[\^_]\{[^}]*\}", "", result)
    result = re.sub(r"[\^_]\d+", "", result)  # Also ^2, _1, etc.

    # ===========================================
    # Remove Markdown formatting
    # ===========================================

    # Remove code blocks first (``` ... ```)
    result = re.sub(r"```[\s\S]*?```", "", result)

    # Remove inline code (`code`)
    result = re.sub(r"`([^`]+)`", r"\1", result)

    # Convert markdown links [text](url) to just "text"
    result = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", result)

    # Remove reference-style links [text][ref]
    result = re.sub(r"\[([^\]]+)\]\[[^\]]*\]", r"\1", result)

    # Remove bare URLs (http:// or https://)
    # Replace with empty or say "link" to indicate there was a URL
    result = re.sub(r"https?://[^\s\)]+", "", result)

    # Remove bold (**text** or __text__)
    result = re.sub(r"\*\*([^*]+)\*\*", r"\1", result)
    result = re.sub(r"__([^_]+)__", r"\1", result)

    # Remove italic (*text* or _text_) - be careful not to catch asterisks in lists
    result = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", result)
    result = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"\1", result)

    # Remove strikethrough (~~text~~)
    result = re.sub(r"~~([^~]+)~~", r"\1", result)

    # Remove headers (# text, ## text, etc.) - keep the text
    result = re.sub(r"^#{1,6}\s*", "", result, flags=re.MULTILINE)

    # Remove horizontal rules
    result = re.sub(r"^[-*_]{3,}\s*$", "", result, flags=re.MULTILINE)

    # Remove blockquotes (> text) - keep the text
    result = re.sub(r"^>\s*", "", result, flags=re.MULTILINE)

    # Remove list markers (- item, * item, 1. item)
    result = re.sub(r"^[\s]*[-*+]\s+", "", result, flags=re.MULTILINE)
    result = re.sub(r"^[\s]*\d+\.\s+", "", result, flags=re.MULTILINE)

    # Remove image markdown ![alt](url)
    result = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", result)

    # Clean up extra whitespace (but preserve single spaces for word boundaries)
    result = re.sub(r"\n{3,}", "\n\n", result)  # Max 2 newlines
    result = re.sub(r"  +", " ", result)  # Multiple spaces to single
    # Don't strip - preserve leading/trailing spaces for proper word joining
    # The sentence chunker will handle final whitespace normalization

    return result


# ==============================================================================
# Data Classes
# ==============================================================================


class TTSProvider(str, Enum):
    """Supported TTS providers."""

    ELEVENLABS = "elevenlabs"
    OPENAI = "openai"


class TalkerState(str, Enum):
    """State of the Talker service."""

    IDLE = "idle"
    SPEAKING = "speaking"
    CANCELLED = "cancelled"


@dataclass
class VoiceConfig:
    """Configuration for voice synthesis."""

    provider: TTSProvider = TTSProvider.ELEVENLABS
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"  # Josh (premium male voice)
    model_id: str = "eleven_turbo_v2_5"  # Best balance of quality and latency
    stability: float = 0.78  # Higher for consistent voice (0.65-0.85 range)
    similarity_boost: float = 0.85  # Higher for voice clarity and consistency
    style: float = 0.08  # Lower for more natural, less dramatic speech
    use_speaker_boost: bool = True
    output_format: str = "pcm_24000"  # Raw PCM for low-latency streaming playback

    # SSML processing for natural pauses
    enable_ssml: bool = True  # Enable SSML break tags for natural rhythm
    voice_style: VoiceStyle = VoiceStyle.CONVERSATIONAL  # Affects pause durations

    # Quality preset (overrides individual settings when set)
    quality_preset: Optional[QualityPreset] = None

    def apply_preset(self, preset: QualityPreset) -> "VoiceConfig":
        """
        Apply a quality preset to this config.

        Returns a new VoiceConfig with preset values applied.
        """
        preset_config = get_preset_config(preset)

        return VoiceConfig(
            provider=self.provider,
            voice_id=self.voice_id,
            model_id=self.model_id,
            stability=preset_config.stability,
            similarity_boost=preset_config.similarity_boost,
            style=preset_config.style_exaggeration,
            use_speaker_boost=self.use_speaker_boost,
            output_format=self.output_format,
            enable_ssml=preset_config.enable_ssml,
            voice_style=preset_config.voice_style,
            quality_preset=preset,
        )


@dataclass
class AudioChunk:
    """A chunk of audio data ready for playback."""

    data: bytes
    format: str  # "mp3" or "pcm16"
    is_final: bool = False
    sentence_index: int = 0
    latency_ms: int = 0


@dataclass
class TalkerMetrics:
    """Metrics for a TTS session."""

    sentences_processed: int = 0
    total_chars_synthesized: int = 0
    total_audio_bytes: int = 0
    total_latency_ms: int = 0
    first_audio_latency_ms: int = 0
    cancelled: bool = False


# ==============================================================================
# Audio Queue for Gapless Playback
# ==============================================================================


class AudioQueue:
    """
    Manages audio chunks for gapless playback with cancellation support.

    Features:
    - Async queue for audio chunks
    - Cancellation clears pending audio
    - Tracks queue state
    """

    def __init__(self, max_size: int = 50):
        self._queue: asyncio.Queue[Optional[AudioChunk]] = asyncio.Queue(maxsize=max_size)
        self._cancelled = False
        self._finished = False

    async def put(self, chunk: AudioChunk) -> bool:
        """
        Add an audio chunk to the queue.

        Returns:
            True if added, False if cancelled
        """
        if self._cancelled:
            return False

        try:
            await asyncio.wait_for(self._queue.put(chunk), timeout=5.0)
            return True
        except asyncio.TimeoutError:
            logger.warning("Audio queue full, dropping chunk")
            return False

    async def get(self) -> Optional[AudioChunk]:
        """
        Get the next audio chunk.

        Returns:
            AudioChunk or None if queue is empty/cancelled/finished
        """
        if self._cancelled and self._queue.empty():
            return None

        try:
            chunk = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            return chunk
        except asyncio.TimeoutError:
            if self._finished:
                return None
            return None  # Timeout but not finished - caller should retry

    async def cancel(self) -> None:
        """Cancel the queue and clear pending audio."""
        self._cancelled = True
        # Drain the queue
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def finish(self) -> None:
        """Signal that no more audio will be added."""
        self._finished = True

    def is_cancelled(self) -> bool:
        """Check if the queue was cancelled."""
        return self._cancelled

    def is_empty(self) -> bool:
        """Check if the queue is empty."""
        return self._queue.empty()

    def reset(self) -> None:
        """Reset the queue for reuse."""
        self._cancelled = False
        self._finished = False
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break


# ==============================================================================
# Talker Service
# ==============================================================================


class TalkerService:
    """
    Unified TTS service for the Thinker/Talker pipeline.

    Handles:
    - Streaming LLM tokens through sentence chunker
    - Parallel TTS synthesis for each sentence
    - Audio queue management for gapless output
    - Cancellation (barge-in support)
    - TTS provider failover (ElevenLabs → OpenAI)

    Usage:
        talker = TalkerService()

        # Start a speaking session
        session = await talker.start_session(
            voice_config=VoiceConfig(),
            on_audio_chunk=handle_audio,  # Called for each audio chunk
        )

        # Feed tokens from LLM
        for token in llm_stream:
            if session.is_cancelled():
                break
            await session.add_token(token)

        # Finish and get final audio
        await session.finish()
    """

    def __init__(self):
        self._elevenlabs = elevenlabs_service
        self._openai_tts = openai_tts_service
        self._default_config = VoiceConfig()

    def is_enabled(self) -> bool:
        """Check if TTS is available (either provider)."""
        return self._elevenlabs.is_enabled() or self._openai_tts.is_enabled()

    def get_provider(self) -> TTSProvider:
        """Get the primary TTS provider."""
        if self._elevenlabs.is_enabled():
            return TTSProvider.ELEVENLABS
        return TTSProvider.OPENAI

    def get_fallback_available(self) -> bool:
        """Check if fallback TTS provider is available."""
        return self._openai_tts.is_enabled()

    async def start_session(
        self,
        on_audio_chunk: Callable[[AudioChunk], Awaitable[None]],
        voice_config: Optional[VoiceConfig] = None,
    ) -> "TalkerSession":
        """
        Start a new TTS session.

        Args:
            on_audio_chunk: Async callback for each audio chunk
            voice_config: Voice configuration (uses defaults if not provided)

        Returns:
            TalkerSession for managing the TTS process
        """
        config = voice_config or self._default_config

        return TalkerSession(
            elevenlabs=self._elevenlabs,
            openai_tts=self._openai_tts,
            config=config,
            on_audio_chunk=on_audio_chunk,
        )

    async def synthesize_text(
        self,
        text: str,
        voice_config: Optional[VoiceConfig] = None,
    ) -> AsyncIterator[bytes]:
        """
        Simple streaming synthesis for a complete text.

        Args:
            text: Text to synthesize
            voice_config: Voice configuration

        Yields:
            Audio data chunks
        """
        config = voice_config or self._default_config

        async for chunk in self._elevenlabs.synthesize_stream(
            text=text,
            voice_id=config.voice_id,
            model_id=config.model_id,
            output_format=config.output_format,
            stability=config.stability,
            similarity_boost=config.similarity_boost,
            style=config.style,
            use_speaker_boost=config.use_speaker_boost,
        ):
            yield chunk

    def get_available_voices(self) -> List[Dict]:
        """Get list of available ElevenLabs voices."""
        return [
            # Premium Voices (Recommended)
            {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "gender": "male", "accent": "American", "premium": True},
            {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "gender": "male", "accent": "American", "premium": True},
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "gender": "female", "accent": "American", "premium": True},
            {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "gender": "female", "accent": "American", "premium": True},
            # Standard Voices
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "gender": "female", "accent": "American", "premium": False},
            {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "gender": "male", "accent": "American", "premium": False},
            {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "gender": "female", "accent": "American", "premium": False},
            {"id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "gender": "male", "accent": "American", "premium": False},
            {"id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam", "gender": "male", "accent": "American", "premium": False},
        ]


class TalkerSession:
    """
    A single TTS speaking session with streaming support.

    Manages the flow:
    1. Receive LLM tokens
    2. Chunk into sentences
    3. Synthesize each sentence (with failover)
    4. Stream audio chunks to callback

    Failover Strategy:
    - Primary: ElevenLabs (premium quality)
    - Fallback: OpenAI TTS (reliable, good quality)
    - Triggers: Circuit breaker open, connection errors, API errors
    """

    def __init__(
        self,
        elevenlabs: ElevenLabsService,
        openai_tts: OpenAITTSService,
        config: VoiceConfig,
        on_audio_chunk: Callable[[AudioChunk], Awaitable[None]],
    ):
        self._elevenlabs = elevenlabs
        self._openai_tts = openai_tts
        self._config = config
        self._on_audio_chunk = on_audio_chunk

        # Track failover state for this session
        self._using_fallback = False
        self._fallback_triggered_at: Optional[float] = None

        # Get adaptive chunking config from quality preset (if set) or use defaults
        if config.quality_preset:
            preset_config = get_preset_config(config.quality_preset)
            adaptive_config = preset_config.adaptive_chunking
            self._audio_chunk_size = preset_config.audio_chunk_size
        else:
            # Default adaptive config (BALANCED preset behavior)
            adaptive_config = AdaptiveChunkerConfig(
                first_chunk_min=20,
                first_chunk_optimal=30,
                first_chunk_max=50,
                subsequent_min=40,
                subsequent_optimal=120,
                subsequent_max=200,
                chunks_before_natural=1,
                enabled=True,
            )
            self._audio_chunk_size = 8192  # Default chunk size

        # Adaptive chunking for optimal TTFA AND naturalness
        # Strategy: Small first chunk for fast time-to-first-audio (~150ms),
        # then larger natural chunks for better prosody after first audio plays.
        self._chunker = SentenceChunker(
            config=ChunkerConfig(
                min_chunk_chars=40,  # Fallback when adaptive is disabled
                optimal_chunk_chars=120,
                max_chunk_chars=200,
            ),
            adaptive_config=adaptive_config,
        )

        # Markdown-aware buffer for TTS
        # Accumulates tokens to detect and strip markdown before chunking
        self._markdown_buffer = ""

        # SSML processor for natural speech pauses
        self._ssml_processor = SSMLProcessor() if config.enable_ssml else None
        self._voice_style = config.voice_style

        # Voice continuity tracking
        # Store previous sentence text to pass as context for consistent voice
        self._previous_text: str = ""

        # State
        self._state = TalkerState.IDLE
        self._sentence_index = 0
        self._first_audio_time: Optional[float] = None
        self._start_time: Optional[float] = None

        # Metrics
        self._metrics = TalkerMetrics()

        # Sequential synthesis for voice consistency
        # (parallel synthesis can cause voice variations between chunks)
        self._synthesis_tasks: List[asyncio.Task] = []
        self._synthesis_semaphore = asyncio.Semaphore(1)  # Sequential synthesis for consistency

    @property
    def state(self) -> TalkerState:
        """Get current state."""
        return self._state

    def is_cancelled(self) -> bool:
        """Check if session was cancelled."""
        return self._state == TalkerState.CANCELLED

    async def add_token(self, token: str) -> None:
        """
        Add a token from the LLM stream.

        Args:
            token: Token from LLM response
        """
        if self._state == TalkerState.CANCELLED:
            return

        if self._start_time is None:
            self._start_time = time.time()

        self._state = TalkerState.SPEAKING

        # Process token through markdown-aware buffer before chunking
        clean_text = self._process_markdown_token(token)

        if clean_text:
            # Add cleaned text to chunker and get any complete sentences
            sentences = self._chunker.add_token(clean_text)

            # Synthesize each sentence (may run concurrently)
            for sentence in sentences:
                await self._synthesize_sentence(sentence)

    def _process_markdown_token(self, token: str) -> str:
        """
        Process a token through the markdown/LaTeX-aware buffer.

        Accumulates tokens to detect patterns that should be stripped for TTS:
        - Markdown links: [text](url)
        - LaTeX display math: [ ... ] with backslashes
        - LaTeX inline: \\( ... \\) and \\[ ... \\]
        - Bold/italic: **text** and *text*

        Args:
            token: Raw token from LLM

        Returns:
            Clean text to send to chunker (may be empty if buffering)
        """
        self._markdown_buffer += token

        # ===========================================
        # Check for incomplete LaTeX blocks FIRST
        # ===========================================

        # Check for LaTeX display math: [ \... ] (square brackets with backslash)
        # This is common in LLM responses for formulas
        open_bracket = self._markdown_buffer.rfind("[")
        if open_bracket != -1:
            after_bracket = self._markdown_buffer[open_bracket:]
            # If this looks like LaTeX (contains backslash after bracket)
            if "\\" in after_bracket:
                # Wait for closing ] if not present
                # Count brackets to handle nested cases
                bracket_count = after_bracket.count("[") - after_bracket.count("]")
                if bracket_count > 0 and len(self._markdown_buffer) < 1000:
                    # Unclosed LaTeX block, keep buffering
                    return ""

        # Check for LaTeX \[ ... \] blocks
        if "\\[" in self._markdown_buffer:
            last_open = self._markdown_buffer.rfind("\\[")
            after_open = self._markdown_buffer[last_open:]
            if "\\]" not in after_open and len(self._markdown_buffer) < 1000:
                # Unclosed \[ block, keep buffering
                return ""

        # Check for LaTeX \( ... \) blocks
        if "\\(" in self._markdown_buffer:
            last_open = self._markdown_buffer.rfind("\\(")
            after_open = self._markdown_buffer[last_open:]
            if "\\)" not in after_open and len(self._markdown_buffer) < 500:
                # Unclosed \( block, keep buffering
                return ""

        # Check for $$ ... $$ blocks
        dollar_count = self._markdown_buffer.count("$$")
        if dollar_count % 2 == 1 and len(self._markdown_buffer) < 1000:
            # Unclosed $$ block, keep buffering
            return ""

        # ===========================================
        # Check for incomplete Markdown patterns
        # ===========================================

        # Check for markdown links [text](url)
        if open_bracket != -1:
            after_bracket = self._markdown_buffer[open_bracket:]
            # Only treat as markdown link if no backslash (not LaTeX)
            if "\\" not in after_bracket:
                if "](" in after_bracket:
                    # We have [text]( - check if URL is complete
                    if ")" not in after_bracket.split("](")[1]:
                        # URL not complete, keep buffering
                        return ""
                elif "]" not in after_bracket:
                    # Link text not complete, keep buffering
                    if len(self._markdown_buffer) < 500:
                        return ""

        # Check for unclosed bold/italic (but don't wait too long)
        if self._markdown_buffer.endswith("*") and len(self._markdown_buffer) < 200:
            trailing_asterisks = len(self._markdown_buffer) - len(self._markdown_buffer.rstrip("*"))
            if trailing_asterisks in (1, 2):
                if len(self._markdown_buffer) < 50:
                    return ""

        # Strip markdown/LaTeX from the buffer and return clean text
        clean = strip_markdown_for_tts(self._markdown_buffer)
        self._markdown_buffer = ""
        return clean

    def _flush_markdown_buffer(self) -> str:
        """Flush any remaining content in the markdown buffer."""
        if self._markdown_buffer:
            clean = strip_markdown_for_tts(self._markdown_buffer)
            self._markdown_buffer = ""
            return clean
        return ""

    async def _synthesize_sentence(self, sentence: str) -> None:
        """
        Synthesize a single sentence and stream audio chunks.

        Implements failover strategy:
        1. Check if ElevenLabs circuit breaker is open → use OpenAI immediately
        2. Try ElevenLabs synthesis
        3. On failure, fall back to OpenAI TTS
        4. Continue with fallback for rest of session

        Args:
            sentence: Text to synthesize
        """
        if self._state == TalkerState.CANCELLED:
            return

        # Strip markdown formatting for natural TTS speech
        # This converts [Link Text](URL) to "Link Text", removes **bold**, etc.
        # The original markdown is preserved in the chat transcript
        tts_text = strip_markdown_for_tts(sentence)

        # Skip if text is empty after stripping (e.g., was just a code block)
        if not tts_text or not tts_text.strip():
            logger.debug(f"Skipping empty TTS text (original: {sentence[:50]}...)")
            return

        # Apply SSML processing for natural pauses (if enabled)
        if self._ssml_processor:
            tts_text = self._ssml_processor.process(tts_text, style=self._voice_style)

        sentence_idx = self._sentence_index
        self._sentence_index += 1
        self._metrics.sentences_processed += 1
        self._metrics.total_chars_synthesized += len(tts_text)

        start_time = time.time()

        try:
            # Use semaphore for sequential synthesis (ensures voice consistency)
            async with self._synthesis_semaphore:
                if self._state == TalkerState.CANCELLED:
                    return

                # Determine which provider to use
                use_fallback = self._using_fallback

                # Check if ElevenLabs circuit breaker is open
                if not use_fallback:
                    try:
                        elevenlabs_breaker.call(lambda: None)
                    except CircuitBreakerError:
                        logger.warning(
                            "ElevenLabs circuit breaker OPEN, using OpenAI TTS fallback",
                            extra={"sentence_idx": sentence_idx},
                        )
                        use_fallback = True
                        self._using_fallback = True
                        self._fallback_triggered_at = time.time()

                chunk_count = 0
                provider_used = "openai" if use_fallback else "elevenlabs"

                if use_fallback and self._openai_tts.is_enabled():
                    # Use OpenAI TTS fallback
                    chunk_count = await self._synthesize_with_openai(tts_text, sentence_idx, start_time)
                else:
                    # Try ElevenLabs (primary)
                    try:
                        chunk_count = await self._synthesize_with_elevenlabs(tts_text, sentence_idx, start_time)
                    except (CircuitBreakerError, Exception) as e:
                        # ElevenLabs failed, try OpenAI fallback
                        if self._openai_tts.is_enabled():
                            logger.warning(
                                f"ElevenLabs TTS failed ({type(e).__name__}), " "falling back to OpenAI TTS",
                                extra={
                                    "error": str(e)[:100],
                                    "sentence_idx": sentence_idx,
                                },
                            )
                            self._using_fallback = True
                            self._fallback_triggered_at = time.time()
                            provider_used = "openai"
                            chunk_count = await self._synthesize_with_openai(tts_text, sentence_idx, start_time)
                        else:
                            # No fallback available, re-raise
                            raise

                # Update previous text for next synthesis (maintains voice continuity)
                self._previous_text = tts_text

                latency_ms = int((time.time() - start_time) * 1000)
                self._metrics.total_latency_ms += latency_ms

                # Log with context info
                stripped = len(tts_text) != len(sentence)
                logger.debug(
                    f"Synthesized sentence {sentence_idx}",
                    extra={
                        "chars": len(tts_text),
                        "original_chars": len(sentence) if stripped else None,
                        "markdown_stripped": stripped,
                        "chunks": chunk_count,
                        "latency_ms": latency_ms,
                        "provider": provider_used,
                        "has_previous_context": bool(self._previous_text),
                    },
                )

        except Exception as e:
            logger.error(f"TTS synthesis error (all providers failed): {e}")
            # Don't fail the entire session, just log the error

    async def _synthesize_with_elevenlabs(self, tts_text: str, sentence_idx: int, start_time: float) -> int:
        """Synthesize using ElevenLabs (primary provider)."""
        chunk_count = 0
        async for audio_data in self._elevenlabs.synthesize_stream(
            text=tts_text,
            voice_id=self._config.voice_id,
            model_id=self._config.model_id,
            output_format=self._config.output_format,
            stability=self._config.stability,
            similarity_boost=self._config.similarity_boost,
            style=self._config.style,
            use_speaker_boost=self._config.use_speaker_boost,
            chunk_size=self._audio_chunk_size,
            previous_text=self._previous_text,
        ):
            if self._state == TalkerState.CANCELLED:
                return chunk_count

            chunk_count += 1
            latency_ms = int((time.time() - start_time) * 1000)

            # Track first audio latency
            if self._first_audio_time is None:
                self._first_audio_time = time.time()
                self._metrics.first_audio_latency_ms = int((self._first_audio_time - self._start_time) * 1000)
                logger.info(f"First audio latency: {self._metrics.first_audio_latency_ms}ms")

            self._metrics.total_audio_bytes += len(audio_data)

            # Send audio chunk to callback
            chunk = AudioChunk(
                data=audio_data,
                format="pcm16",  # Raw PCM16 at 24kHz
                is_final=False,
                sentence_index=sentence_idx,
                latency_ms=latency_ms,
            )
            await self._on_audio_chunk(chunk)

        return chunk_count

    async def _synthesize_with_openai(self, tts_text: str, sentence_idx: int, start_time: float) -> int:
        """Synthesize using OpenAI TTS (fallback provider)."""
        # Map ElevenLabs voice to OpenAI voice
        openai_voice = map_elevenlabs_voice_to_openai(self._config.voice_id)

        chunk_count = 0
        async for audio_data in self._openai_tts.synthesize_stream(
            text=tts_text,
            voice=openai_voice,
            model="tts-1",  # Use fast model for low latency
            speed=1.0,
            response_format="pcm",  # Raw PCM for streaming
            chunk_size=self._audio_chunk_size,
        ):
            if self._state == TalkerState.CANCELLED:
                return chunk_count

            chunk_count += 1
            latency_ms = int((time.time() - start_time) * 1000)

            # Track first audio latency
            if self._first_audio_time is None:
                self._first_audio_time = time.time()
                self._metrics.first_audio_latency_ms = int((self._first_audio_time - self._start_time) * 1000)
                logger.info(f"First audio latency (OpenAI fallback): " f"{self._metrics.first_audio_latency_ms}ms")

            self._metrics.total_audio_bytes += len(audio_data)

            # Send audio chunk to callback
            # Note: OpenAI PCM is 24kHz 16-bit mono, same as ElevenLabs pcm_24000
            chunk = AudioChunk(
                data=audio_data,
                format="pcm16",
                is_final=False,
                sentence_index=sentence_idx,
                latency_ms=latency_ms,
            )
            await self._on_audio_chunk(chunk)

        return chunk_count

    async def finish(self) -> TalkerMetrics:
        """
        Finish the session and synthesize any remaining text.

        Returns:
            TalkerMetrics with session statistics
        """
        if self._state == TalkerState.CANCELLED:
            return self._metrics

        # Flush any remaining markdown buffer content first
        remaining_markdown = self._flush_markdown_buffer()
        if remaining_markdown:
            # Add to chunker for proper sentence handling
            sentences = self._chunker.add_token(remaining_markdown)
            for sentence in sentences:
                await self._synthesize_sentence(sentence)

        # Flush remaining text from chunker
        final_text = self._chunker.flush()
        if final_text:
            await self._synthesize_sentence(final_text)

        # Wait for any pending synthesis tasks
        if self._synthesis_tasks:
            await asyncio.gather(*self._synthesis_tasks, return_exceptions=True)

        # Send final chunk marker
        final_chunk = AudioChunk(
            data=b"",
            format="pcm16",
            is_final=True,
            sentence_index=self._sentence_index,
        )
        await self._on_audio_chunk(final_chunk)

        self._state = TalkerState.IDLE

        logger.info(
            "TTS session complete",
            extra={
                "sentences": self._metrics.sentences_processed,
                "chars": self._metrics.total_chars_synthesized,
                "audio_bytes": self._metrics.total_audio_bytes,
                "first_audio_ms": self._metrics.first_audio_latency_ms,
            },
        )

        return self._metrics

    async def cancel(self) -> None:
        """
        Cancel the session (for barge-in).

        Stops all synthesis and clears pending audio.
        """
        self._state = TalkerState.CANCELLED
        self._metrics.cancelled = True

        # Cancel pending synthesis tasks
        for task in self._synthesis_tasks:
            if not task.done():
                task.cancel()

        logger.info("TTS session cancelled (barge-in)")

    def get_metrics(self) -> TalkerMetrics:
        """Get current session metrics."""
        return self._metrics


# Global service instance
talker_service = TalkerService()
