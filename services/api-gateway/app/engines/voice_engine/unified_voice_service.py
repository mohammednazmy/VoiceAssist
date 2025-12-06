"""
Unified Voice Service - Central Voice Mode v4 Orchestrator

Voice Mode v4 - Phase 2 Integration

Orchestrates all voice mode components into a unified pipeline:
- Audio preprocessing (AEC, AGC, NS)
- Privacy-aware STT routing
- Language detection and translation
- Parallel/fallback STT providers
- LLM processing (Thinker)
- TTS with caching and pronunciation
- Thinking feedback and user notifications
- Graceful degradation

This is the main entry point for voice interactions.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.services.audio_processing_service import AudioContext, AudioProcessingService, get_audio_processing_service
from app.services.language_detection_service import LanguageDetectionService, get_language_detection_service
from app.services.local_whisper_service import (
    LocalWhisperService,
    TranscriptionLanguage,
    TranscriptionResult,
    get_local_whisper_service,
)
from app.services.privacy_aware_stt_router import (
    PrivacyAwareSTTRouter,
    RoutingDecision,
    STTProvider,
    get_privacy_aware_stt_router,
)
from app.services.thinking_feedback_service import ThinkingFeedbackService, get_thinking_feedback_service
from app.services.tts_cache_service import TTSCacheService, get_tts_cache_service
from app.services.voice_fallback_orchestrator import VoiceFallbackOrchestrator, get_voice_fallback_orchestrator

logger = logging.getLogger(__name__)


class VoicePipelineState(Enum):
    """State of the voice pipeline."""

    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING_AUDIO = "processing_audio"
    TRANSCRIBING = "transcribing"
    THINKING = "thinking"
    GENERATING_SPEECH = "generating_speech"
    SPEAKING = "speaking"
    ERROR = "error"


class VoiceMode(Enum):
    """Voice interaction mode."""

    PUSH_TO_TALK = "push_to_talk"
    VOICE_ACTIVITY = "voice_activity"
    ALWAYS_ON = "always_on"
    HYBRID = "hybrid"


@dataclass
class VoicePipelineConfig:
    """Configuration for the unified voice pipeline."""

    # Mode
    voice_mode: VoiceMode = VoiceMode.VOICE_ACTIVITY

    # Audio processing
    enable_audio_processing: bool = True
    enable_noise_suppression: bool = True
    enable_echo_cancellation: bool = True
    enable_auto_gain: bool = True

    # STT
    enable_parallel_stt: bool = False
    enable_local_whisper: bool = True
    enable_phi_routing: bool = True
    stt_language_hint: Optional[str] = None

    # Language
    enable_language_detection: bool = True
    enable_translation: bool = True
    default_language: str = "en"

    # LLM
    enable_streaming_response: bool = True
    max_response_tokens: int = 1000

    # TTS
    enable_tts_cache: bool = True
    voice_id: str = "default"
    speech_rate: float = 1.0

    # Feedback
    enable_thinking_tones: bool = True
    thinking_tone_style: str = "subtle"

    # Fallback
    enable_graceful_degradation: bool = True
    fallback_to_text: bool = True

    # Timeouts
    stt_timeout_seconds: float = 10.0
    llm_timeout_seconds: float = 30.0
    tts_timeout_seconds: float = 15.0


@dataclass
class VoiceInteractionResult:
    """Result of a voice interaction."""

    success: bool
    transcript: str
    response_text: str
    response_audio: Optional[bytes]
    detected_language: str
    phi_detected: bool
    stt_provider: str
    total_latency_ms: float
    stt_latency_ms: float
    llm_latency_ms: float
    tts_latency_ms: float
    state_transitions: List[str]
    degradation_applied: bool
    error: Optional[str] = None


@dataclass
class PipelineMetrics:
    """Metrics for voice pipeline performance."""

    total_interactions: int = 0
    successful_interactions: int = 0
    failed_interactions: int = 0
    avg_total_latency_ms: float = 0.0
    avg_stt_latency_ms: float = 0.0
    avg_llm_latency_ms: float = 0.0
    avg_tts_latency_ms: float = 0.0
    phi_routing_count: int = 0
    fallback_count: int = 0
    language_distribution: Dict[str, int] = field(default_factory=dict)


class UnifiedVoiceService:
    """
    Unified orchestrator for Voice Mode v4.

    Coordinates all voice services to provide a seamless
    voice interaction experience.
    """

    def __init__(self, config: Optional[VoicePipelineConfig] = None):
        self.config = config or VoicePipelineConfig()
        self._initialized = False
        self._state = VoicePipelineState.IDLE
        self._metrics = PipelineMetrics()

        # Services (lazy-loaded)
        self._audio_processor: Optional[AudioProcessingService] = None
        self._stt_router: Optional[PrivacyAwareSTTRouter] = None
        self._local_whisper: Optional[LocalWhisperService] = None
        self._language_detector: Optional[LanguageDetectionService] = None
        self._tts_cache: Optional[TTSCacheService] = None
        self._thinking_feedback: Optional[ThinkingFeedbackService] = None
        self._fallback_orchestrator: Optional[VoiceFallbackOrchestrator] = None

        # Callbacks
        self._on_state_change: Optional[Callable[[VoicePipelineState], None]] = None
        self._on_partial_transcript: Optional[Callable[[str], None]] = None
        self._on_thinking_start: Optional[Callable[[], None]] = None
        self._on_audio_chunk: Optional[Callable[[bytes], None]] = None

        # Session state
        self._current_session_id: Optional[str] = None
        self._state_history: List[Tuple[VoicePipelineState, datetime]] = []

    async def initialize(self) -> None:
        """Initialize all voice services."""
        if self._initialized:
            return

        logger.info("Initializing UnifiedVoiceService")

        # Initialize services based on config
        if self.config.enable_audio_processing:
            self._audio_processor = get_audio_processing_service()
            await self._audio_processor.initialize()

        if self.config.enable_phi_routing:
            self._stt_router = get_privacy_aware_stt_router()
            await self._stt_router.initialize()

        if self.config.enable_local_whisper:
            self._local_whisper = get_local_whisper_service()
            # Don't initialize until needed (heavy)

        if self.config.enable_language_detection:
            self._language_detector = get_language_detection_service()
            await self._language_detector.initialize()

        if self.config.enable_tts_cache:
            self._tts_cache = get_tts_cache_service()
            await self._tts_cache.initialize()

        if self.config.enable_thinking_tones:
            self._thinking_feedback = get_thinking_feedback_service()
            await self._thinking_feedback.initialize()

        if self.config.enable_graceful_degradation:
            self._fallback_orchestrator = get_voice_fallback_orchestrator()
            await self._fallback_orchestrator.initialize()

        self._initialized = True
        logger.info("UnifiedVoiceService initialized")

    async def process_voice_input(
        self,
        audio_data: bytes,
        session_id: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> VoiceInteractionResult:
        """
        Process voice input through the full pipeline.

        Args:
            audio_data: PCM16 audio bytes
            session_id: Session identifier
            context: Additional context (conversation history, etc.)

        Returns:
            VoiceInteractionResult with full interaction details
        """
        if not self._initialized:
            await self.initialize()

        start_time = time.time()
        self._current_session_id = session_id
        self._metrics.total_interactions += 1
        state_transitions = []
        context = context or {}

        try:
            # 1. Audio preprocessing
            self._set_state(VoicePipelineState.PROCESSING_AUDIO)
            state_transitions.append("processing_audio")

            processed_audio = audio_data
            if self.config.enable_audio_processing and self._audio_processor:
                audio_context = AudioContext(
                    playback_active=context.get("playback_active", False),
                    playback_buffer=context.get("playback_buffer"),
                )
                processed_audio = await self._audio_processor.process_frame(audio_data, audio_context)

            audio_process_time = time.time()

            # 2. Transcription (with privacy routing)
            self._set_state(VoicePipelineState.TRANSCRIBING)
            state_transitions.append("transcribing")

            transcript_result, routing_decision = await self._transcribe(processed_audio, session_id, context)

            stt_time = time.time()
            stt_latency = (stt_time - audio_process_time) * 1000

            if routing_decision.phi_detected:
                self._metrics.phi_routing_count += 1

            # 3. Language detection
            detected_language = self.config.default_language
            if self.config.enable_language_detection and transcript_result.text:
                lang_result = await self._language_detector.detect(transcript_result.text)
                detected_language = lang_result.primary_language.value

                # Track language distribution
                self._metrics.language_distribution[detected_language] = (
                    self._metrics.language_distribution.get(detected_language, 0) + 1
                )

            # 4. LLM processing (Thinker)
            self._set_state(VoicePipelineState.THINKING)
            state_transitions.append("thinking")

            # Start thinking feedback
            if self.config.enable_thinking_tones and self._thinking_feedback:
                await self._thinking_feedback.start_thinking_loop(
                    session_id, on_tone=lambda audio: self._on_audio_chunk(audio) if self._on_audio_chunk else None
                )

            if self._on_thinking_start:
                self._on_thinking_start()

            # Generate response (placeholder - integrate with Thinker)
            response_text = await self._generate_response(transcript_result.text, detected_language, context)

            llm_time = time.time()
            llm_latency = (llm_time - stt_time) * 1000

            # Stop thinking feedback
            if self.config.enable_thinking_tones and self._thinking_feedback:
                await self._thinking_feedback.stop_thinking_loop(
                    session_id,
                    play_end_tone=True,
                    on_tone=lambda audio: self._on_audio_chunk(audio) if self._on_audio_chunk else None,
                )

            # 5. TTS generation
            self._set_state(VoicePipelineState.GENERATING_SPEECH)
            state_transitions.append("generating_speech")

            response_audio = None
            if response_text:
                response_audio = await self._generate_speech(response_text, detected_language)

            tts_time = time.time()
            tts_latency = (tts_time - llm_time) * 1000

            # 6. Complete
            self._set_state(VoicePipelineState.IDLE)
            state_transitions.append("idle")

            total_latency = (time.time() - start_time) * 1000

            # Update metrics
            self._metrics.successful_interactions += 1
            self._update_latency_metrics(stt_latency, llm_latency, tts_latency, total_latency)

            return VoiceInteractionResult(
                success=True,
                transcript=transcript_result.text,
                response_text=response_text,
                response_audio=response_audio,
                detected_language=detected_language,
                phi_detected=routing_decision.phi_detected,
                stt_provider=routing_decision.provider.value,
                total_latency_ms=total_latency,
                stt_latency_ms=stt_latency,
                llm_latency_ms=llm_latency,
                tts_latency_ms=tts_latency,
                state_transitions=state_transitions,
                degradation_applied=False,
            )

        except Exception as e:
            logger.error(f"Voice pipeline error: {e}")
            self._metrics.failed_interactions += 1
            self._set_state(VoicePipelineState.ERROR)
            state_transitions.append("error")

            # Attempt graceful degradation
            if self.config.enable_graceful_degradation:
                return await self._handle_degradation(audio_data, session_id, context, str(e), state_transitions)

            return VoiceInteractionResult(
                success=False,
                transcript="",
                response_text="",
                response_audio=None,
                detected_language=self.config.default_language,
                phi_detected=False,
                stt_provider="none",
                total_latency_ms=(time.time() - start_time) * 1000,
                stt_latency_ms=0,
                llm_latency_ms=0,
                tts_latency_ms=0,
                state_transitions=state_transitions,
                degradation_applied=False,
                error=str(e),
            )

    async def _transcribe(
        self, audio_data: bytes, session_id: str, context: Dict[str, Any]
    ) -> Tuple[TranscriptionResult, RoutingDecision]:
        """Transcribe audio with privacy-aware routing."""
        if self.config.enable_phi_routing and self._stt_router:
            # Use privacy-aware router
            language = None
            if self.config.stt_language_hint:
                language = TranscriptionLanguage(self.config.stt_language_hint)

            return await self._stt_router.transcribe(
                audio_data,
                session_id=session_id,
                language=language,
                context_text=context.get("recent_text"),
            )

        # Default: use local whisper
        if self._local_whisper:
            await self._local_whisper.initialize()
            result = await self._local_whisper.transcribe(audio_data)

            decision = RoutingDecision(
                provider=STTProvider.WHISPER_LOCAL,
                reason="default_local",
                phi_detected=False,
                phi_categories=[],
                confidence=1.0,
                session_id=session_id,
            )

            return result, decision

        raise RuntimeError("No STT provider available")

    async def _generate_response(self, transcript: str, language: str, context: Dict[str, Any]) -> str:
        """Generate LLM response (integrate with Thinker service)."""
        # Placeholder - integrate with existing thinker_service
        # This would call the Thinker service with the transcript
        # For now, return a placeholder
        if not transcript.strip():
            return ""

        # TODO: Integrate with thinker_service.py
        # response = await self._thinker.generate(transcript, context)
        # return response.text

        return f"I heard: {transcript}"

    async def _generate_speech(self, text: str, language: str) -> Optional[bytes]:
        """Generate TTS audio with caching."""
        if not text.strip():
            return None

        if self.config.enable_tts_cache and self._tts_cache:
            # Try cache first
            cached, _ = await self._tts_cache.get(
                text,
                self.config.voice_id,
                ssml=False,
                speed=self.config.speech_rate,
            )

            if cached:
                return cached

        # TODO: Integrate with talker_service.py for actual TTS
        # audio = await self._talker.synthesize(text, voice_id=self.config.voice_id)

        # For now, return None (no audio)
        return None

    async def _handle_degradation(
        self,
        audio_data: bytes,
        session_id: str,
        context: Dict[str, Any],
        error: str,
        state_transitions: List[str],
    ) -> VoiceInteractionResult:
        """Handle graceful degradation on failure."""
        self._metrics.fallback_count += 1

        logger.warning(f"Applying graceful degradation: {error}")

        if self.config.fallback_to_text:
            # Return a text-mode fallback response
            return VoiceInteractionResult(
                success=True,
                transcript="",
                response_text="I'm having trouble with voice right now. Please try typing your message.",
                response_audio=None,
                detected_language=self.config.default_language,
                phi_detected=False,
                stt_provider="degraded",
                total_latency_ms=0,
                stt_latency_ms=0,
                llm_latency_ms=0,
                tts_latency_ms=0,
                state_transitions=state_transitions + ["degraded"],
                degradation_applied=True,
            )

        return VoiceInteractionResult(
            success=False,
            transcript="",
            response_text="",
            response_audio=None,
            detected_language=self.config.default_language,
            phi_detected=False,
            stt_provider="none",
            total_latency_ms=0,
            stt_latency_ms=0,
            llm_latency_ms=0,
            tts_latency_ms=0,
            state_transitions=state_transitions,
            degradation_applied=True,
            error=error,
        )

    def _set_state(self, state: VoicePipelineState) -> None:
        """Set pipeline state with callback."""
        self._state = state
        self._state_history.append((state, datetime.now(timezone.utc)))

        if self._on_state_change:
            self._on_state_change(state)

    def _update_latency_metrics(self, stt: float, llm: float, tts: float, total: float) -> None:
        """Update rolling average latency metrics using exponential smoothing."""
        # Note: Could switch to cumulative average using n = self._metrics.successful_interactions
        alpha = 0.1  # Smoothing factor for exponential moving average

        self._metrics.avg_stt_latency_ms = self._metrics.avg_stt_latency_ms * (1 - alpha) + stt * alpha
        self._metrics.avg_llm_latency_ms = self._metrics.avg_llm_latency_ms * (1 - alpha) + llm * alpha
        self._metrics.avg_tts_latency_ms = self._metrics.avg_tts_latency_ms * (1 - alpha) + tts * alpha
        self._metrics.avg_total_latency_ms = self._metrics.avg_total_latency_ms * (1 - alpha) + total * alpha

    def on_state_change(self, callback: Callable[[VoicePipelineState], None]) -> None:
        """Register callback for state changes."""
        self._on_state_change = callback

    def on_partial_transcript(self, callback: Callable[[str], None]) -> None:
        """Register callback for partial transcripts."""
        self._on_partial_transcript = callback

    def on_thinking_start(self, callback: Callable[[], None]) -> None:
        """Register callback for thinking start."""
        self._on_thinking_start = callback

    def on_audio_chunk(self, callback: Callable[[bytes], None]) -> None:
        """Register callback for audio output chunks."""
        self._on_audio_chunk = callback

    def get_state(self) -> VoicePipelineState:
        """Get current pipeline state."""
        return self._state

    def get_metrics(self) -> PipelineMetrics:
        """Get pipeline metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset pipeline metrics."""
        self._metrics = PipelineMetrics()

    def update_config(self, **kwargs) -> None:
        """Update pipeline configuration."""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

    async def cleanup(self) -> None:
        """Clean up resources."""
        if self._thinking_feedback:
            await self._thinking_feedback.cleanup()

        if self._fallback_orchestrator:
            await self._fallback_orchestrator.cleanup()

        self._initialized = False


# Singleton instance
_unified_voice_service: Optional[UnifiedVoiceService] = None


def get_unified_voice_service() -> UnifiedVoiceService:
    """Get or create the singleton UnifiedVoiceService instance."""
    global _unified_voice_service
    if _unified_voice_service is None:
        _unified_voice_service = UnifiedVoiceService()
    return _unified_voice_service
