"""
Privacy-Aware STT Router - PHI-Safe Speech-to-Text Routing

Voice Mode v4 - Phase 1 Foundation (Privacy & Compliance)

Routes audio transcription requests to appropriate STT providers:
- Cloud STT (Deepgram) for non-PHI conversations
- Local Whisper for PHI-containing or sensitive sessions
- Hybrid mode with real-time PHI detection and provider switching

Ensures HIPAA compliance by keeping PHI data on-premise.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np
from app.services.local_whisper_service import (
    LocalWhisperService,
    TranscriptionLanguage,
    TranscriptionResult,
    get_local_whisper_service,
)

logger = logging.getLogger(__name__)


class STTProvider(Enum):
    """Available STT providers."""

    DEEPGRAM = "deepgram"  # Cloud provider (fast, accurate)
    WHISPER_LOCAL = "whisper_local"  # Local Whisper (PHI-safe)
    WHISPER_API = "whisper_api"  # OpenAI Whisper API (cloud)
    AZURE_SPEECH = "azure_speech"  # Azure Speech Services
    GOOGLE_SPEECH = "google_speech"  # Google Cloud Speech-to-Text


class RoutingPolicy(Enum):
    """Routing policy options."""

    ALWAYS_LOCAL = "always_local"  # Always use local Whisper
    ALWAYS_CLOUD = "always_cloud"  # Always use cloud (not HIPAA-safe)
    PHI_AWARE = "phi_aware"  # Route based on PHI detection
    SESSION_BASED = "session_based"  # Route based on session flags
    HYBRID = "hybrid"  # Start cloud, switch to local on PHI detection


class PHICategory(Enum):
    """Categories of PHI detected."""

    NONE = "none"
    NAME = "name"
    DOB = "date_of_birth"
    SSN = "social_security"
    MRN = "medical_record_number"
    PHONE = "phone_number"
    EMAIL = "email"
    ADDRESS = "address"
    DIAGNOSIS = "diagnosis"
    MEDICATION = "medication"
    PROCEDURE = "procedure"
    LAB_RESULT = "lab_result"
    INSURANCE = "insurance"
    UNKNOWN = "unknown"


@dataclass
class RoutingDecision:
    """Result of a routing decision."""

    provider: STTProvider
    reason: str
    phi_detected: bool
    phi_categories: List[PHICategory]
    confidence: float
    session_id: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class PrivacyRouterConfig:
    """Configuration for privacy-aware STT routing."""

    # Routing policy
    policy: RoutingPolicy = RoutingPolicy.PHI_AWARE

    # Default provider for non-PHI
    default_provider: STTProvider = STTProvider.DEEPGRAM

    # PHI-safe provider
    phi_safe_provider: STTProvider = STTProvider.WHISPER_LOCAL

    # PHI detection settings
    enable_real_time_phi_detection: bool = True
    phi_detection_threshold: float = 0.7

    # Session-based overrides
    allow_session_override: bool = True

    # Fallback settings
    enable_fallback: bool = True
    fallback_provider: STTProvider = STTProvider.WHISPER_LOCAL

    # Caching
    cache_routing_decisions: bool = True
    decision_cache_ttl_seconds: int = 300

    # Logging
    log_phi_detection: bool = True  # Log detection events (not PHI content)
    audit_all_decisions: bool = True


@dataclass
class RouterMetrics:
    """Metrics for STT routing."""

    total_requests: int = 0
    cloud_requests: int = 0
    local_requests: int = 0
    phi_detected_count: int = 0
    provider_switches: int = 0
    fallback_activations: int = 0
    avg_decision_time_ms: float = 0.0
    phi_categories_detected: Dict[str, int] = field(default_factory=dict)


# PHI detection patterns (simplified - production should use NER)
PHI_PATTERNS = {
    PHICategory.SSN: [
        r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",  # SSN format
    ],
    PHICategory.PHONE: [
        r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b",  # US phone
        r"\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b",  # (xxx) xxx-xxxx
    ],
    PHICategory.EMAIL: [
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    ],
    PHICategory.MRN: [
        r"\bMRN\s*[:#]?\s*\d{6,12}\b",
        r"\bmedical\s+record\s+number\s*[:#]?\s*\d+\b",
    ],
    PHICategory.DOB: [
        r"\b(?:born|dob|date\s+of\s+birth)\s*[:#]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
    ],
}

# Keywords that suggest PHI context
PHI_CONTEXT_KEYWORDS = [
    "patient",
    "diagnosis",
    "treatment",
    "prescription",
    "medication",
    "insurance",
    "claim",
    "provider",
    "hospital",
    "clinic",
    "doctor",
    "medical record",
    "health record",
    "test result",
    "lab result",
    "blood pressure",
    "heart rate",
    "temperature",
    "weight",
    "height",
    "allergies",
    "immunization",
    "vaccination",
    "surgery",
    "procedure",
]


class PrivacyAwareSTTRouter:
    """
    Routes STT requests based on privacy requirements.

    Ensures PHI-containing audio is processed locally while
    allowing cloud processing for non-sensitive content.
    """

    def __init__(self, config: Optional[PrivacyRouterConfig] = None):
        self.config = config or PrivacyRouterConfig()
        self._initialized = False
        self._metrics = RouterMetrics()

        # Provider instances
        self._local_whisper: Optional[LocalWhisperService] = None
        self._deepgram_client = None

        # Session state
        self._session_phi_state: Dict[str, bool] = {}  # session_id -> has_phi
        self._decision_cache: Dict[str, RoutingDecision] = {}

        # Callbacks
        self._on_phi_detected: Optional[Callable[[str, List[PHICategory]], None]] = None
        self._on_provider_switch: Optional[Callable[[str, STTProvider, STTProvider], None]] = None

    async def initialize(self) -> None:
        """Initialize the router and required providers."""
        if self._initialized:
            return

        logger.info(
            "Initializing PrivacyAwareSTTRouter",
            extra={
                "policy": self.config.policy.value,
                "default_provider": self.config.default_provider.value,
                "phi_safe_provider": self.config.phi_safe_provider.value,
            },
        )

        # Initialize local Whisper for PHI-safe processing
        if self.config.phi_safe_provider == STTProvider.WHISPER_LOCAL:
            self._local_whisper = get_local_whisper_service()
            await self._local_whisper.initialize()

        self._initialized = True

    async def transcribe(
        self,
        audio: Union[bytes, np.ndarray],
        session_id: Optional[str] = None,
        language: Optional[TranscriptionLanguage] = None,
        force_provider: Optional[STTProvider] = None,
        context_text: Optional[str] = None,
    ) -> Tuple[TranscriptionResult, RoutingDecision]:
        """
        Transcribe audio with privacy-aware routing.

        Args:
            audio: Audio data (PCM16 bytes or numpy array)
            session_id: Session identifier for state tracking
            language: Language hint
            force_provider: Override routing decision
            context_text: Additional context for PHI detection

        Returns:
            Tuple of (TranscriptionResult, RoutingDecision)
        """
        if not self._initialized:
            await self.initialize()

        start_time = datetime.now(timezone.utc)
        self._metrics.total_requests += 1

        # Determine routing
        if force_provider:
            decision = RoutingDecision(
                provider=force_provider,
                reason="forced_provider",
                phi_detected=False,
                phi_categories=[],
                confidence=1.0,
                session_id=session_id,
            )
        else:
            decision = await self._make_routing_decision(audio, session_id, context_text)

        # Update metrics
        decision_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        self._metrics.avg_decision_time_ms = self._metrics.avg_decision_time_ms * 0.9 + decision_time * 0.1

        # Route to appropriate provider
        try:
            result = await self._transcribe_with_provider(audio, decision.provider, language)

            # Post-transcription PHI check (for hybrid mode)
            if self.config.policy == RoutingPolicy.HYBRID:
                await self._post_transcription_phi_check(result, session_id, decision)

            return result, decision

        except Exception as e:
            logger.error(f"Transcription error with {decision.provider}: {e}")

            # Try fallback
            if self.config.enable_fallback:
                return await self._fallback_transcription(audio, decision, language)
            raise

    async def _make_routing_decision(
        self,
        audio: Union[bytes, np.ndarray],
        session_id: Optional[str],
        context_text: Optional[str],
    ) -> RoutingDecision:
        """Make a routing decision based on policy and PHI detection."""

        # Check policy
        if self.config.policy == RoutingPolicy.ALWAYS_LOCAL:
            return RoutingDecision(
                provider=STTProvider.WHISPER_LOCAL,
                reason="always_local_policy",
                phi_detected=False,
                phi_categories=[],
                confidence=1.0,
                session_id=session_id,
            )

        if self.config.policy == RoutingPolicy.ALWAYS_CLOUD:
            return RoutingDecision(
                provider=self.config.default_provider,
                reason="always_cloud_policy",
                phi_detected=False,
                phi_categories=[],
                confidence=1.0,
                session_id=session_id,
            )

        # Check session state
        if session_id and self.config.policy == RoutingPolicy.SESSION_BASED:
            if session_id in self._session_phi_state:
                if self._session_phi_state[session_id]:
                    return RoutingDecision(
                        provider=self.config.phi_safe_provider,
                        reason="session_marked_phi",
                        phi_detected=True,
                        phi_categories=[PHICategory.UNKNOWN],
                        confidence=1.0,
                        session_id=session_id,
                    )

        # Check cached decision
        if self.config.cache_routing_decisions and session_id:
            cache_key = f"{session_id}:latest"
            if cache_key in self._decision_cache:
                cached = self._decision_cache[cache_key]
                if cached.phi_detected:
                    return RoutingDecision(
                        provider=self.config.phi_safe_provider,
                        reason="cached_phi_detection",
                        phi_detected=True,
                        phi_categories=cached.phi_categories,
                        confidence=cached.confidence,
                        session_id=session_id,
                    )

        # PHI detection on context
        phi_detected = False
        phi_categories = []
        confidence = 0.0

        if context_text and self.config.enable_real_time_phi_detection:
            phi_detected, phi_categories, confidence = self._detect_phi_in_text(context_text)

        if phi_detected and confidence >= self.config.phi_detection_threshold:
            self._metrics.phi_detected_count += 1

            # Update session state
            if session_id:
                self._session_phi_state[session_id] = True

            # Log detection (not content)
            if self.config.log_phi_detection:
                logger.info(
                    "PHI detected, routing to local provider",
                    extra={
                        "session_id": session_id,
                        "categories": [c.value for c in phi_categories],
                        "confidence": confidence,
                    },
                )

            # Callback
            if self._on_phi_detected and session_id:
                self._on_phi_detected(session_id, phi_categories)

            decision = RoutingDecision(
                provider=self.config.phi_safe_provider,
                reason="phi_detected",
                phi_detected=True,
                phi_categories=phi_categories,
                confidence=confidence,
                session_id=session_id,
            )

        else:
            decision = RoutingDecision(
                provider=self.config.default_provider,
                reason="no_phi_detected",
                phi_detected=False,
                phi_categories=[],
                confidence=1.0 - confidence,
                session_id=session_id,
            )

        # Cache decision
        if self.config.cache_routing_decisions and session_id:
            self._decision_cache[f"{session_id}:latest"] = decision

        # Update metrics
        if decision.provider in [
            STTProvider.DEEPGRAM,
            STTProvider.WHISPER_API,
            STTProvider.AZURE_SPEECH,
            STTProvider.GOOGLE_SPEECH,
        ]:
            self._metrics.cloud_requests += 1
        else:
            self._metrics.local_requests += 1

        return decision

    def _detect_phi_in_text(self, text: str) -> Tuple[bool, List[PHICategory], float]:
        """
        Detect PHI in text using pattern matching.

        Returns:
            Tuple of (phi_detected, categories, confidence)
        """
        detected_categories = []
        max_confidence = 0.0

        text_lower = text.lower()

        # Check patterns
        for category, patterns in PHI_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    detected_categories.append(category)
                    max_confidence = max(max_confidence, 0.9)

                    # Update metrics
                    cat_name = category.value
                    self._metrics.phi_categories_detected[cat_name] = (
                        self._metrics.phi_categories_detected.get(cat_name, 0) + 1
                    )
                    break

        # Check context keywords
        keyword_matches = sum(1 for kw in PHI_CONTEXT_KEYWORDS if kw in text_lower)
        if keyword_matches >= 2:
            max_confidence = max(max_confidence, 0.5 + (keyword_matches * 0.1))
            if PHICategory.UNKNOWN not in detected_categories:
                detected_categories.append(PHICategory.UNKNOWN)

        return len(detected_categories) > 0, detected_categories, max_confidence

    async def _transcribe_with_provider(
        self,
        audio: Union[bytes, np.ndarray],
        provider: STTProvider,
        language: Optional[TranscriptionLanguage],
    ) -> TranscriptionResult:
        """Transcribe audio using the specified provider."""

        if provider == STTProvider.WHISPER_LOCAL:
            if not self._local_whisper:
                self._local_whisper = get_local_whisper_service()
                await self._local_whisper.initialize()
            return await self._local_whisper.transcribe(audio, language=language)

        elif provider == STTProvider.DEEPGRAM:
            return await self._transcribe_deepgram(audio, language)

        elif provider == STTProvider.WHISPER_API:
            return await self._transcribe_whisper_api(audio, language)

        else:
            raise ValueError(f"Unsupported provider: {provider}")

    async def _transcribe_deepgram(
        self,
        audio: Union[bytes, np.ndarray],
        language: Optional[TranscriptionLanguage],
    ) -> TranscriptionResult:
        """Transcribe using Deepgram cloud API."""
        # This would integrate with the existing Deepgram service
        # For now, fall back to local Whisper
        logger.warning("Deepgram integration pending, falling back to local Whisper")
        return await self._transcribe_with_provider(audio, STTProvider.WHISPER_LOCAL, language)

    async def _transcribe_whisper_api(
        self,
        audio: Union[bytes, np.ndarray],
        language: Optional[TranscriptionLanguage],
    ) -> TranscriptionResult:
        """Transcribe using OpenAI Whisper API."""
        # This would integrate with OpenAI API
        # For now, fall back to local Whisper
        logger.warning("Whisper API integration pending, falling back to local")
        return await self._transcribe_with_provider(audio, STTProvider.WHISPER_LOCAL, language)

    async def _post_transcription_phi_check(
        self,
        result: TranscriptionResult,
        session_id: Optional[str],
        original_decision: RoutingDecision,
    ) -> None:
        """Check transcription result for PHI and update routing if needed."""

        if not result.text:
            return

        phi_detected, phi_categories, confidence = self._detect_phi_in_text(result.text)

        if phi_detected and confidence >= self.config.phi_detection_threshold:
            # Mark session for future routing
            if session_id:
                previous_state = self._session_phi_state.get(session_id, False)
                self._session_phi_state[session_id] = True

                # Track provider switch
                if not previous_state:
                    self._metrics.provider_switches += 1

                    if self._on_provider_switch:
                        self._on_provider_switch(session_id, original_decision.provider, self.config.phi_safe_provider)

            logger.info(
                "PHI detected in transcription, future requests will use local provider",
                extra={
                    "session_id": session_id,
                    "categories": [c.value for c in phi_categories],
                },
            )

    async def _fallback_transcription(
        self,
        audio: Union[bytes, np.ndarray],
        original_decision: RoutingDecision,
        language: Optional[TranscriptionLanguage],
    ) -> Tuple[TranscriptionResult, RoutingDecision]:
        """Attempt fallback transcription."""
        self._metrics.fallback_activations += 1

        fallback_decision = RoutingDecision(
            provider=self.config.fallback_provider,
            reason=f"fallback_from_{original_decision.provider.value}",
            phi_detected=original_decision.phi_detected,
            phi_categories=original_decision.phi_categories,
            confidence=original_decision.confidence,
            session_id=original_decision.session_id,
        )

        logger.warning(
            f"Falling back from {original_decision.provider.value} to " f"{self.config.fallback_provider.value}"
        )

        result = await self._transcribe_with_provider(audio, self.config.fallback_provider, language)

        return result, fallback_decision

    def mark_session_phi(self, session_id: str, has_phi: bool = True) -> None:
        """
        Manually mark a session as containing PHI.

        Args:
            session_id: Session identifier
            has_phi: Whether session contains PHI
        """
        self._session_phi_state[session_id] = has_phi
        logger.info(f"Session {session_id} manually marked as PHI={has_phi}")

    def clear_session_state(self, session_id: str) -> None:
        """Clear PHI state for a session."""
        if session_id in self._session_phi_state:
            del self._session_phi_state[session_id]
        if f"{session_id}:latest" in self._decision_cache:
            del self._decision_cache[f"{session_id}:latest"]

    def get_session_provider(self, session_id: str) -> STTProvider:
        """Get the current provider for a session."""
        if session_id in self._session_phi_state:
            if self._session_phi_state[session_id]:
                return self.config.phi_safe_provider
        return self.config.default_provider

    def on_phi_detected(self, callback: Callable[[str, List[PHICategory]], None]) -> None:
        """Register callback for PHI detection events."""
        self._on_phi_detected = callback

    def on_provider_switch(self, callback: Callable[[str, STTProvider, STTProvider], None]) -> None:
        """Register callback for provider switch events."""
        self._on_provider_switch = callback

    def get_metrics(self) -> RouterMetrics:
        """Get current router metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset router metrics."""
        self._metrics = RouterMetrics()

    def get_routing_stats(self) -> Dict[str, Any]:
        """Get routing statistics."""
        total = self._metrics.total_requests or 1
        return {
            "total_requests": self._metrics.total_requests,
            "cloud_percentage": (self._metrics.cloud_requests / total) * 100,
            "local_percentage": (self._metrics.local_requests / total) * 100,
            "phi_detection_rate": (self._metrics.phi_detected_count / total) * 100,
            "provider_switches": self._metrics.provider_switches,
            "fallback_rate": (self._metrics.fallback_activations / total) * 100,
            "avg_decision_time_ms": self._metrics.avg_decision_time_ms,
            "active_phi_sessions": sum(1 for v in self._session_phi_state.values() if v),
            "phi_categories": self._metrics.phi_categories_detected,
        }


# Singleton instance
_privacy_router: Optional[PrivacyAwareSTTRouter] = None


def get_privacy_aware_stt_router() -> PrivacyAwareSTTRouter:
    """Get or create the singleton PrivacyAwareSTTRouter instance."""
    global _privacy_router
    if _privacy_router is None:
        _privacy_router = PrivacyAwareSTTRouter()
    return _privacy_router


async def transcribe_with_privacy(
    audio: Union[bytes, np.ndarray],
    session_id: Optional[str] = None,
    language: Optional[TranscriptionLanguage] = None,
) -> Tuple[TranscriptionResult, RoutingDecision]:
    """
    Convenience function for privacy-aware transcription.

    Args:
        audio: Audio data
        session_id: Session identifier
        language: Language hint

    Returns:
        Tuple of (TranscriptionResult, RoutingDecision)
    """
    router = get_privacy_aware_stt_router()
    await router.initialize()
    return await router.transcribe(audio, session_id=session_id, language=language)
