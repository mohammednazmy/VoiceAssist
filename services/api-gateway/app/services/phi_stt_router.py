"""
PHI-Aware STT Routing Service
Routes speech-to-text processing based on PHI sensitivity detection.

Part of Voice Mode Enhancement Plan v4.1 - Workstream 3
Reference: docs/voice/phi-aware-stt-routing.md

Features:
- PHI detection with sensitivity scoring
- Dynamic routing: Cloud STT / Hybrid / Local Whisper
- Session-level PHI context tracking
- Audit logging for HIPAA compliance
"""

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services.phi_detector import PHIDetectionResult, PHIDetector

logger = logging.getLogger(__name__)


class STTRouting(str, Enum):
    """STT routing decisions."""

    CLOUD = "cloud"  # Use cloud STT (fastest)
    HYBRID = "hybrid"  # Use cloud with redaction
    LOCAL = "local"  # Use local Whisper (most secure)


class STTProvider(str, Enum):
    """Available STT providers."""

    OPENAI_WHISPER = "openai_whisper"
    OPENAI_WHISPER_REDACTED = "openai_whisper_redacted"
    LOCAL_WHISPER = "local_whisper"
    GOOGLE_STT = "google_stt"
    AZURE_STT = "azure_stt"


@dataclass
class PHIRoutingConfig:
    """Configuration for PHI-aware STT routing."""

    # Threshold for routing to local Whisper (high PHI probability)
    local_threshold: float = 0.7

    # Threshold for hybrid mode (moderate PHI probability)
    hybrid_threshold: float = 0.3

    # Session context window (number of messages to consider)
    session_context_window: int = 10

    # Whether to bias toward local for medical context
    medical_context_bias: bool = True

    # Default provider for cloud routing
    cloud_provider: STTProvider = STTProvider.OPENAI_WHISPER

    # Local Whisper model configuration
    local_model_size: str = "large-v3"
    local_model_device: str = "cuda"


@dataclass
class STTRoutingResult:
    """Result of STT routing decision."""

    routing: STTRouting
    provider: STTProvider
    phi_score: float
    phi_entities: List[str] = field(default_factory=list)
    from_session_context: bool = False
    latency_ms: float = 0.0
    decision_reason: str = ""


@dataclass
class TranscriptionResult:
    """Result of speech-to-text transcription."""

    text: str
    routing: STTRouting
    provider: STTProvider
    phi_score: float
    phi_entities: List[str] = field(default_factory=list)
    redacted_entities: List[str] = field(default_factory=list)
    latency_ms: float = 0.0
    confidence: float = 1.0
    language: str = "en"


class SessionPHIContext:
    """Tracks PHI context within a session."""

    def __init__(self, session_id: str, window_size: int = 10):
        self.session_id = session_id
        self.window_size = window_size
        self._phi_history: List[PHIDetectionResult] = []
        self._has_prior_phi: bool = False
        self._phi_types_seen: set = set()

    def add_detection(self, result: PHIDetectionResult) -> None:
        """Add a PHI detection result to session history."""
        self._phi_history.append(result)
        if len(self._phi_history) > self.window_size:
            self._phi_history.pop(0)

        if result.contains_phi:
            self._has_prior_phi = True
            self._phi_types_seen.update(result.phi_types)

    @property
    def has_prior_phi(self) -> bool:
        """Check if PHI was detected in this session."""
        return self._has_prior_phi

    @property
    def phi_types_seen(self) -> set:
        """Get all PHI types seen in this session."""
        return self._phi_types_seen

    def get_session_phi_score(self) -> float:
        """Calculate aggregate PHI score for session."""
        if not self._phi_history:
            return 0.0

        # Weight recent detections more heavily
        weights = [0.5 + (i * 0.05) for i in range(len(self._phi_history))]
        total_weight = sum(weights)

        weighted_score = sum(w * (1.0 if r.contains_phi else 0.0) for w, r in zip(weights, self._phi_history))

        return weighted_score / total_weight if total_weight > 0 else 0.0


class LocalWhisperTranscriber:
    """Local Whisper transcription for PHI-sensitive audio."""

    def __init__(self, model_size: str = "large-v3", device: str = "cuda"):
        self.model_size = model_size
        self.device = device
        self._model = None
        self._initialized = False

    async def _ensure_initialized(self) -> None:
        """Lazy initialization of Whisper model."""
        if self._initialized:
            return

        try:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(self.model_size, device=self.device, compute_type="float16")
            self._initialized = True
            logger.info(f"Local Whisper model loaded: {self.model_size} on {self.device}")
        except ImportError:
            logger.warning("faster-whisper not installed, local transcription unavailable")
        except Exception as e:
            logger.error(f"Failed to initialize local Whisper: {e}")

    async def transcribe(self, audio_data: bytes, language: Optional[str] = None) -> TranscriptionResult:
        """Transcribe audio using local Whisper."""
        await self._ensure_initialized()

        if not self._model:
            raise RuntimeError("Local Whisper model not available")

        start_time = time.monotonic()

        try:
            # Write audio to temp file (faster-whisper requires file path)
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(audio_data)
                temp_path = f.name

            # Transcribe
            segments, info = self._model.transcribe(
                temp_path,
                language=language,
                beam_size=5,
                vad_filter=True,
            )

            # Collect transcription
            text = " ".join(segment.text for segment in segments)
            detected_language = info.language

            # Clean up temp file
            import os

            os.unlink(temp_path)

            latency_ms = (time.monotonic() - start_time) * 1000

            return TranscriptionResult(
                text=text.strip(),
                routing=STTRouting.LOCAL,
                provider=STTProvider.LOCAL_WHISPER,
                phi_score=1.0,  # Local processing implies PHI present
                latency_ms=latency_ms,
                language=detected_language,
            )

        except Exception as e:
            logger.error(f"Local Whisper transcription failed: {e}")
            raise


class CloudSTTClient:
    """Cloud STT client with optional redaction."""

    def __init__(self, provider: STTProvider = STTProvider.OPENAI_WHISPER):
        self.provider = provider
        self._phi_detector = PHIDetector()

    async def transcribe(
        self,
        audio_data: bytes,
        language: Optional[str] = None,
        redact_phi: bool = False,
    ) -> TranscriptionResult:
        """Transcribe audio using cloud STT."""
        start_time = time.monotonic()

        if self.provider == STTProvider.OPENAI_WHISPER:
            text, detected_lang = await self._transcribe_openai(audio_data, language)
        elif self.provider == STTProvider.GOOGLE_STT:
            text, detected_lang = await self._transcribe_google(audio_data, language)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

        redacted_entities = []
        if redact_phi:
            # Detect and redact PHI from transcript
            phi_result = self._phi_detector.detect(text)
            if phi_result.contains_phi:
                text = self._phi_detector.sanitize(text)
                redacted_entities = phi_result.phi_types

        latency_ms = (time.monotonic() - start_time) * 1000

        return TranscriptionResult(
            text=text,
            routing=STTRouting.HYBRID if redact_phi else STTRouting.CLOUD,
            provider=self.provider,
            phi_score=0.0 if not redact_phi else 0.5,
            redacted_entities=redacted_entities,
            latency_ms=latency_ms,
            language=detected_lang or language or "en",
        )

    async def _transcribe_openai(self, audio_data: bytes, language: Optional[str] = None) -> tuple[str, str]:
        """Transcribe using OpenAI Whisper API."""
        import httpx

        api_key = getattr(settings, "openai_api_key", None)
        if not api_key:
            raise RuntimeError("OpenAI API key not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("audio.wav", audio_data, "audio/wav")},
                data={
                    "model": "whisper-1",
                    "language": language or "",
                    "response_format": "verbose_json",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("text", ""), data.get("language", "en")

    async def _transcribe_google(self, audio_data: bytes, language: Optional[str] = None) -> tuple[str, str]:
        """Transcribe using Google Cloud Speech-to-Text."""
        # Placeholder for Google STT integration
        raise NotImplementedError("Google STT not implemented")


class PHISTTRouter:
    """
    PHI-aware STT router that dynamically routes audio based on sensitivity.

    Routing decisions:
    - PHI score < 0.3: Cloud STT (fastest)
    - PHI score 0.3-0.7: Hybrid mode with redaction
    - PHI score >= 0.7: Local Whisper (most secure)
    """

    def __init__(
        self,
        config: Optional[PHIRoutingConfig] = None,
        phi_detector: Optional[PHIDetector] = None,
    ):
        self.config = config or PHIRoutingConfig()
        self.phi_detector = phi_detector or PHIDetector()
        self._session_contexts: Dict[str, SessionPHIContext] = {}
        self._local_transcriber: Optional[LocalWhisperTranscriber] = None
        self._cloud_client: Optional[CloudSTTClient] = None

    def _get_session_context(self, session_id: str) -> SessionPHIContext:
        """Get or create session PHI context."""
        if session_id not in self._session_contexts:
            self._session_contexts[session_id] = SessionPHIContext(
                session_id=session_id,
                window_size=self.config.session_context_window,
            )
        return self._session_contexts[session_id]

    def _get_local_transcriber(self) -> LocalWhisperTranscriber:
        """Get or create local Whisper transcriber."""
        if self._local_transcriber is None:
            self._local_transcriber = LocalWhisperTranscriber(
                model_size=self.config.local_model_size,
                device=self.config.local_model_device,
            )
        return self._local_transcriber

    def _get_cloud_client(self) -> CloudSTTClient:
        """Get or create cloud STT client."""
        if self._cloud_client is None:
            self._cloud_client = CloudSTTClient(provider=self.config.cloud_provider)
        return self._cloud_client

    def route(
        self,
        text_hint: Optional[str] = None,
        session_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> STTRoutingResult:
        """
        Determine STT routing based on PHI indicators.

        Args:
            text_hint: Optional text hint (e.g., from partial transcription)
            session_id: Session ID for context tracking
            context: Additional context (e.g., has_prior_phi)

        Returns:
            STTRoutingResult with routing decision
        """
        start_time = time.monotonic()
        context = context or {}

        phi_score = 0.0
        phi_entities = []
        from_session_context = False
        decision_reason = "default"

        # Check session context
        if session_id:
            session_context = self._get_session_context(session_id)
            if session_context.has_prior_phi:
                phi_score = max(phi_score, 0.6)  # Bias toward secure routing
                from_session_context = True
                phi_entities.extend(session_context.phi_types_seen)
                decision_reason = "session_has_prior_phi"

        # Check explicit context flags
        if context.get("has_prior_phi"):
            phi_score = max(phi_score, 0.8)
            from_session_context = True
            decision_reason = "explicit_prior_phi_flag"

        # Medical context bias
        if self.config.medical_context_bias and context.get("is_medical_session"):
            phi_score = max(phi_score, 0.4)
            decision_reason = "medical_context_bias"

        # Analyze text hint if provided
        if text_hint:
            detection = self.phi_detector.detect(text_hint, context.get("clinical_context"))
            if detection.contains_phi:
                phi_score = max(phi_score, detection.confidence)
                phi_entities.extend(detection.phi_types)
                decision_reason = f"phi_detected_in_hint: {detection.phi_types}"

                # Update session context
                if session_id:
                    self._get_session_context(session_id).add_detection(detection)

        # Determine routing based on score
        if phi_score >= self.config.local_threshold:
            routing = STTRouting.LOCAL
            provider = STTProvider.LOCAL_WHISPER
        elif phi_score >= self.config.hybrid_threshold:
            routing = STTRouting.HYBRID
            provider = STTProvider.OPENAI_WHISPER_REDACTED
        else:
            routing = STTRouting.CLOUD
            provider = self.config.cloud_provider

        latency_ms = (time.monotonic() - start_time) * 1000

        result = STTRoutingResult(
            routing=routing,
            provider=provider,
            phi_score=phi_score,
            phi_entities=list(set(phi_entities)),
            from_session_context=from_session_context,
            latency_ms=latency_ms,
            decision_reason=decision_reason,
        )

        # Audit log
        logger.info(
            "PHI routing decision",
            extra={
                "session_id": session_id,
                "phi_score": phi_score,
                "routing": routing.value,
                "provider": provider.value,
                "phi_entities": phi_entities,
                "decision_reason": decision_reason,
                "latency_ms": latency_ms,
            },
        )

        return result

    async def transcribe(
        self,
        audio_data: bytes,
        session_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio with PHI-aware routing.

        Args:
            audio_data: Raw audio bytes (WAV format)
            session_id: Session ID for context tracking
            context: Additional context
            language: Expected language code

        Returns:
            TranscriptionResult with transcript and routing info
        """
        # Get routing decision
        routing_result = self.route(
            text_hint=None,  # No hint available yet
            session_id=session_id,
            context=context,
        )

        try:
            if routing_result.routing == STTRouting.LOCAL:
                # Use local Whisper
                transcriber = self._get_local_transcriber()
                result = await transcriber.transcribe(audio_data, language)

            elif routing_result.routing == STTRouting.HYBRID:
                # Use cloud with redaction
                client = self._get_cloud_client()
                result = await client.transcribe(audio_data, language, redact_phi=True)

            else:
                # Use cloud directly
                client = self._get_cloud_client()
                result = await client.transcribe(audio_data, language, redact_phi=False)

            # Update with routing info
            result.phi_score = routing_result.phi_score
            result.phi_entities = routing_result.phi_entities

            # Update session context with transcript
            if session_id and result.text:
                detection = self.phi_detector.detect(result.text)
                self._get_session_context(session_id).add_detection(detection)
                if detection.contains_phi:
                    result.phi_entities = list(set(result.phi_entities + detection.phi_types))

            return result

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            # Fall back to cloud if local fails
            if routing_result.routing == STTRouting.LOCAL:
                logger.warning("Falling back to cloud STT after local failure")
                client = self._get_cloud_client()
                return await client.transcribe(audio_data, language, redact_phi=True)
            raise

    def clear_session(self, session_id: str) -> None:
        """Clear session context."""
        if session_id in self._session_contexts:
            del self._session_contexts[session_id]


# Singleton instance
_phi_stt_router: Optional[PHISTTRouter] = None


async def get_phi_stt_router() -> PHISTTRouter:
    """Get or create PHI STT router instance."""
    global _phi_stt_router
    if _phi_stt_router is None:
        _phi_stt_router = PHISTTRouter()
    return _phi_stt_router
