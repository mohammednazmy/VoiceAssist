"""
Voice-specific error taxonomy for structured error tracking.

Provides a comprehensive error classification system with:
- Error categories (CONNECTION, STT, TTS, LLM, AUDIO, TIMEOUT, PROVIDER, INTERNAL)
- Detailed error codes with descriptions
- Recoverability flags for automatic retry logic
- Prometheus metrics integration
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class VoiceErrorCategory(str, Enum):
    """Voice error categories for classification."""

    CONNECTION = "connection"  # WebSocket and network errors
    STT = "stt"  # Speech-to-text errors
    TTS = "tts"  # Text-to-speech errors
    LLM = "llm"  # Language model errors
    AUDIO = "audio"  # Audio processing errors
    TIMEOUT = "timeout"  # Various timeout errors
    PROVIDER = "provider"  # External service provider errors
    INTERNAL = "internal"  # Internal server errors


@dataclass
class VoiceErrorCode:
    """Voice error code with metadata."""

    code: str
    category: VoiceErrorCategory
    description: str
    recoverable: bool
    retry_after_seconds: Optional[int] = None
    max_retries: int = 3


# ============================================================================
# Connection Errors (CONN_001 - CONN_010)
# ============================================================================

CONN_001 = VoiceErrorCode(
    code="CONN_001",
    category=VoiceErrorCategory.CONNECTION,
    description="WebSocket connection failed",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=5,
)

CONN_002 = VoiceErrorCode(
    code="CONN_002",
    category=VoiceErrorCategory.CONNECTION,
    description="WebSocket connection lost",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=5,
)

CONN_003 = VoiceErrorCode(
    code="CONN_003",
    category=VoiceErrorCategory.CONNECTION,
    description="Heartbeat timeout - connection zombie",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=3,
)

CONN_004 = VoiceErrorCode(
    code="CONN_004",
    category=VoiceErrorCategory.CONNECTION,
    description="Authentication failed",
    recoverable=False,
    max_retries=0,
)

CONN_005 = VoiceErrorCode(
    code="CONN_005",
    category=VoiceErrorCategory.CONNECTION,
    description="Session limit exceeded",
    recoverable=False,
    max_retries=0,
)

CONN_006 = VoiceErrorCode(
    code="CONN_006",
    category=VoiceErrorCategory.CONNECTION,
    description="Protocol error - invalid message format",
    recoverable=False,
    max_retries=0,
)

CONN_007 = VoiceErrorCode(
    code="CONN_007",
    category=VoiceErrorCategory.CONNECTION,
    description="Client disconnected unexpectedly",
    recoverable=False,
    max_retries=0,
)

# ============================================================================
# Speech-to-Text Errors (STT_001 - STT_010)
# ============================================================================

STT_001 = VoiceErrorCode(
    code="STT_001",
    category=VoiceErrorCategory.STT,
    description="Deepgram connection failed",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=3,
)

STT_002 = VoiceErrorCode(
    code="STT_002",
    category=VoiceErrorCategory.STT,
    description="Deepgram streaming error",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=3,
)

STT_003 = VoiceErrorCode(
    code="STT_003",
    category=VoiceErrorCategory.STT,
    description="No speech detected",
    recoverable=False,  # User needs to speak
    max_retries=0,
)

STT_004 = VoiceErrorCode(
    code="STT_004",
    category=VoiceErrorCategory.STT,
    description="Audio format not supported",
    recoverable=False,
    max_retries=0,
)

STT_005 = VoiceErrorCode(
    code="STT_005",
    category=VoiceErrorCategory.STT,
    description="STT rate limit exceeded",
    recoverable=True,
    retry_after_seconds=5,
    max_retries=2,
)

STT_006 = VoiceErrorCode(
    code="STT_006",
    category=VoiceErrorCategory.STT,
    description="STT transcript empty",
    recoverable=False,
    max_retries=0,
)

STT_007 = VoiceErrorCode(
    code="STT_007",
    category=VoiceErrorCategory.STT,
    description="STT language detection failed",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=2,
)

# ============================================================================
# Text-to-Speech Errors (TTS_001 - TTS_010)
# ============================================================================

TTS_001 = VoiceErrorCode(
    code="TTS_001",
    category=VoiceErrorCategory.TTS,
    description="ElevenLabs API error",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=3,
)

TTS_002 = VoiceErrorCode(
    code="TTS_002",
    category=VoiceErrorCategory.TTS,
    description="OpenAI TTS API error",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=3,
)

TTS_003 = VoiceErrorCode(
    code="TTS_003",
    category=VoiceErrorCategory.TTS,
    description="TTS rate limit exceeded",
    recoverable=True,
    retry_after_seconds=10,
    max_retries=2,
)

TTS_004 = VoiceErrorCode(
    code="TTS_004",
    category=VoiceErrorCategory.TTS,
    description="Voice ID not found",
    recoverable=False,
    max_retries=0,
)

TTS_005 = VoiceErrorCode(
    code="TTS_005",
    category=VoiceErrorCategory.TTS,
    description="Text too long for TTS",
    recoverable=False,
    max_retries=0,
)

TTS_006 = VoiceErrorCode(
    code="TTS_006",
    category=VoiceErrorCategory.TTS,
    description="TTS provider unavailable",
    recoverable=True,
    retry_after_seconds=5,
    max_retries=3,
)

TTS_007 = VoiceErrorCode(
    code="TTS_007",
    category=VoiceErrorCategory.TTS,
    description="Audio encoding error",
    recoverable=False,
    max_retries=0,
)

# ============================================================================
# Language Model Errors (LLM_001 - LLM_010)
# ============================================================================

LLM_001 = VoiceErrorCode(
    code="LLM_001",
    category=VoiceErrorCategory.LLM,
    description="OpenAI API error",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=3,
)

LLM_002 = VoiceErrorCode(
    code="LLM_002",
    category=VoiceErrorCategory.LLM,
    description="LLM rate limit exceeded",
    recoverable=True,
    retry_after_seconds=10,
    max_retries=2,
)

LLM_003 = VoiceErrorCode(
    code="LLM_003",
    category=VoiceErrorCategory.LLM,
    description="Context length exceeded",
    recoverable=False,
    max_retries=0,
)

LLM_004 = VoiceErrorCode(
    code="LLM_004",
    category=VoiceErrorCategory.LLM,
    description="LLM response parsing error",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=2,
)

LLM_005 = VoiceErrorCode(
    code="LLM_005",
    category=VoiceErrorCategory.LLM,
    description="Tool execution failed",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=2,
)

LLM_006 = VoiceErrorCode(
    code="LLM_006",
    category=VoiceErrorCategory.LLM,
    description="LLM content filtered",
    recoverable=False,
    max_retries=0,
)

# ============================================================================
# Audio Processing Errors (AUDIO_001 - AUDIO_010)
# ============================================================================

AUDIO_001 = VoiceErrorCode(
    code="AUDIO_001",
    category=VoiceErrorCategory.AUDIO,
    description="Microphone access denied",
    recoverable=False,
    max_retries=0,
)

AUDIO_002 = VoiceErrorCode(
    code="AUDIO_002",
    category=VoiceErrorCategory.AUDIO,
    description="Audio context suspended",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=3,
)

AUDIO_003 = VoiceErrorCode(
    code="AUDIO_003",
    category=VoiceErrorCategory.AUDIO,
    description="Audio buffer overflow",
    recoverable=True,
    retry_after_seconds=0,
    max_retries=5,
)

AUDIO_004 = VoiceErrorCode(
    code="AUDIO_004",
    category=VoiceErrorCategory.AUDIO,
    description="Audio decode error",
    recoverable=True,
    retry_after_seconds=0,
    max_retries=3,
)

AUDIO_005 = VoiceErrorCode(
    code="AUDIO_005",
    category=VoiceErrorCategory.AUDIO,
    description="Echo cancellation failed",
    recoverable=True,
    retry_after_seconds=0,
    max_retries=2,
)

AUDIO_006 = VoiceErrorCode(
    code="AUDIO_006",
    category=VoiceErrorCategory.AUDIO,
    description="Sample rate mismatch",
    recoverable=False,
    max_retries=0,
)

# ============================================================================
# Timeout Errors (TIMEOUT_001 - TIMEOUT_010)
# ============================================================================

TIMEOUT_001 = VoiceErrorCode(
    code="TIMEOUT_001",
    category=VoiceErrorCategory.TIMEOUT,
    description="Connection timeout",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=3,
)

TIMEOUT_002 = VoiceErrorCode(
    code="TIMEOUT_002",
    category=VoiceErrorCategory.TIMEOUT,
    description="First audio timeout",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=2,
)

TIMEOUT_003 = VoiceErrorCode(
    code="TIMEOUT_003",
    category=VoiceErrorCategory.TIMEOUT,
    description="Transcript timeout",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=2,
)

TIMEOUT_004 = VoiceErrorCode(
    code="TIMEOUT_004",
    category=VoiceErrorCategory.TIMEOUT,
    description="LLM response timeout",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=2,
)

TIMEOUT_005 = VoiceErrorCode(
    code="TIMEOUT_005",
    category=VoiceErrorCategory.TIMEOUT,
    description="TTS synthesis timeout",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=2,
)

TIMEOUT_006 = VoiceErrorCode(
    code="TIMEOUT_006",
    category=VoiceErrorCategory.TIMEOUT,
    description="Session idle timeout",
    recoverable=False,
    max_retries=0,
)

TIMEOUT_007 = VoiceErrorCode(
    code="TIMEOUT_007",
    category=VoiceErrorCategory.TIMEOUT,
    description="Max session duration exceeded",
    recoverable=False,
    max_retries=0,
)

# ============================================================================
# Provider Errors (PROVIDER_001 - PROVIDER_010)
# ============================================================================

PROVIDER_001 = VoiceErrorCode(
    code="PROVIDER_001",
    category=VoiceErrorCategory.PROVIDER,
    description="Deepgram service unavailable",
    recoverable=True,
    retry_after_seconds=5,
    max_retries=3,
)

PROVIDER_002 = VoiceErrorCode(
    code="PROVIDER_002",
    category=VoiceErrorCategory.PROVIDER,
    description="ElevenLabs service unavailable",
    recoverable=True,
    retry_after_seconds=5,
    max_retries=3,
)

PROVIDER_003 = VoiceErrorCode(
    code="PROVIDER_003",
    category=VoiceErrorCategory.PROVIDER,
    description="OpenAI service unavailable",
    recoverable=True,
    retry_after_seconds=5,
    max_retries=3,
)

PROVIDER_004 = VoiceErrorCode(
    code="PROVIDER_004",
    category=VoiceErrorCategory.PROVIDER,
    description="Provider API key invalid",
    recoverable=False,
    max_retries=0,
)

PROVIDER_005 = VoiceErrorCode(
    code="PROVIDER_005",
    category=VoiceErrorCategory.PROVIDER,
    description="Provider quota exceeded",
    recoverable=False,
    max_retries=0,
)

PROVIDER_006 = VoiceErrorCode(
    code="PROVIDER_006",
    category=VoiceErrorCategory.PROVIDER,
    description="All providers failed (after failover)",
    recoverable=False,
    max_retries=0,
)

# ============================================================================
# Internal Errors (INTERNAL_001 - INTERNAL_010)
# ============================================================================

INTERNAL_001 = VoiceErrorCode(
    code="INTERNAL_001",
    category=VoiceErrorCategory.INTERNAL,
    description="Unexpected server error",
    recoverable=True,
    retry_after_seconds=1,
    max_retries=2,
)

INTERNAL_002 = VoiceErrorCode(
    code="INTERNAL_002",
    category=VoiceErrorCategory.INTERNAL,
    description="Redis connection error",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=3,
)

INTERNAL_003 = VoiceErrorCode(
    code="INTERNAL_003",
    category=VoiceErrorCategory.INTERNAL,
    description="Database error",
    recoverable=True,
    retry_after_seconds=2,
    max_retries=2,
)

INTERNAL_004 = VoiceErrorCode(
    code="INTERNAL_004",
    category=VoiceErrorCategory.INTERNAL,
    description="Memory limit exceeded",
    recoverable=False,
    max_retries=0,
)

INTERNAL_005 = VoiceErrorCode(
    code="INTERNAL_005",
    category=VoiceErrorCategory.INTERNAL,
    description="Configuration error",
    recoverable=False,
    max_retries=0,
)


# ============================================================================
# Error Code Registry
# ============================================================================

ERROR_CODE_MAP: dict[str, VoiceErrorCode] = {
    # Connection errors
    "CONN_001": CONN_001,
    "CONN_002": CONN_002,
    "CONN_003": CONN_003,
    "CONN_004": CONN_004,
    "CONN_005": CONN_005,
    "CONN_006": CONN_006,
    "CONN_007": CONN_007,
    # STT errors
    "STT_001": STT_001,
    "STT_002": STT_002,
    "STT_003": STT_003,
    "STT_004": STT_004,
    "STT_005": STT_005,
    "STT_006": STT_006,
    "STT_007": STT_007,
    # TTS errors
    "TTS_001": TTS_001,
    "TTS_002": TTS_002,
    "TTS_003": TTS_003,
    "TTS_004": TTS_004,
    "TTS_005": TTS_005,
    "TTS_006": TTS_006,
    "TTS_007": TTS_007,
    # LLM errors
    "LLM_001": LLM_001,
    "LLM_002": LLM_002,
    "LLM_003": LLM_003,
    "LLM_004": LLM_004,
    "LLM_005": LLM_005,
    "LLM_006": LLM_006,
    # Audio errors
    "AUDIO_001": AUDIO_001,
    "AUDIO_002": AUDIO_002,
    "AUDIO_003": AUDIO_003,
    "AUDIO_004": AUDIO_004,
    "AUDIO_005": AUDIO_005,
    "AUDIO_006": AUDIO_006,
    # Timeout errors
    "TIMEOUT_001": TIMEOUT_001,
    "TIMEOUT_002": TIMEOUT_002,
    "TIMEOUT_003": TIMEOUT_003,
    "TIMEOUT_004": TIMEOUT_004,
    "TIMEOUT_005": TIMEOUT_005,
    "TIMEOUT_006": TIMEOUT_006,
    "TIMEOUT_007": TIMEOUT_007,
    # Provider errors
    "PROVIDER_001": PROVIDER_001,
    "PROVIDER_002": PROVIDER_002,
    "PROVIDER_003": PROVIDER_003,
    "PROVIDER_004": PROVIDER_004,
    "PROVIDER_005": PROVIDER_005,
    "PROVIDER_006": PROVIDER_006,
    # Internal errors
    "INTERNAL_001": INTERNAL_001,
    "INTERNAL_002": INTERNAL_002,
    "INTERNAL_003": INTERNAL_003,
    "INTERNAL_004": INTERNAL_004,
    "INTERNAL_005": INTERNAL_005,
}


def get_error_code(code: str) -> Optional[VoiceErrorCode]:
    """Get error code by string code."""
    return ERROR_CODE_MAP.get(code)


class VoiceError(Exception):
    """
    Voice-specific exception with structured error info.

    Usage:
        raise VoiceError(CONN_001, provider="deepgram", session_id="abc123")
        raise VoiceError(TTS_001, original_error=e)
    """

    def __init__(
        self,
        error_code: VoiceErrorCode,
        message: Optional[str] = None,
        provider: Optional[str] = None,
        session_id: Optional[str] = None,
        original_error: Optional[Exception] = None,
        **extra,
    ):
        self.error_code = error_code
        self.provider = provider
        self.session_id = session_id
        self.original_error = original_error
        self.extra = extra

        # Build message
        self.message = message or error_code.description
        if original_error:
            self.message = f"{self.message}: {str(original_error)}"

        super().__init__(self.message)

        # Log the error
        self._log_error()

    def _log_error(self):
        """Log error with structured fields."""
        log_data = {
            "error_code": self.error_code.code,
            "category": self.error_code.category.value,
            "recoverable": self.error_code.recoverable,
            "message": self.message,
        }
        if self.provider:
            log_data["provider"] = self.provider
        if self.session_id:
            log_data["session_id"] = self.session_id
        if self.extra:
            log_data.update(self.extra)

        if self.error_code.recoverable:
            logger.warning("voice_error", **log_data)
        else:
            logger.error("voice_error", **log_data)

    @property
    def is_recoverable(self) -> bool:
        """Check if error can be recovered from."""
        return self.error_code.recoverable

    @property
    def retry_after(self) -> Optional[int]:
        """Get recommended retry delay in seconds."""
        return self.error_code.retry_after_seconds

    @property
    def max_retries(self) -> int:
        """Get maximum retry count."""
        return self.error_code.max_retries

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON response."""
        result = {
            "code": self.error_code.code,
            "category": self.error_code.category.value,
            "message": self.message,
            "recoverable": self.error_code.recoverable,
        }
        if self.error_code.retry_after_seconds:
            result["retry_after_seconds"] = self.error_code.retry_after_seconds
        if self.provider:
            result["provider"] = self.provider
        return result

    def to_client_message(self) -> dict:
        """Convert to WebSocket message format for client."""
        return {
            "type": "error",
            "error": {
                "code": self.error_code.code,
                "category": self.error_code.category.value,
                "message": self.message,
                "recoverable": self.error_code.recoverable,
                "retry_after_seconds": self.error_code.retry_after_seconds,
            },
        }


# ============================================================================
# Error Recording Functions (for metrics)
# ============================================================================


def record_voice_error(
    error_code: VoiceErrorCode,
    provider: Optional[str] = None,
) -> None:
    """
    Record a voice error for metrics.

    Imports metrics lazily to avoid circular imports.
    """
    from app.core.metrics import voice_errors_total, voice_provider_failures_total

    # Record general error
    voice_errors_total.labels(
        category=error_code.category.value,
        code=error_code.code,
        provider=provider or "unknown",
        recoverable=str(error_code.recoverable).lower(),
    ).inc()

    # Record provider failure if provider specified
    if provider and error_code.category == VoiceErrorCategory.PROVIDER:
        voice_provider_failures_total.labels(
            provider=provider,
            operation="unknown",
            status_code="500",
        ).inc()


def record_error_recovery(
    error_code: VoiceErrorCode,
    recovery_method: str,
) -> None:
    """
    Record successful error recovery for metrics.

    recovery_method: "retry", "failover", "reconnect", "reset"
    """
    from app.core.metrics import voice_error_recovery_total

    voice_error_recovery_total.labels(
        category=error_code.category.value,
        recovery_method=recovery_method,
    ).inc()
