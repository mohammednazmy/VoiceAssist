"""
Structured logging configuration using structlog

Includes voice-specific logging with configurable verbosity levels:
- MINIMAL: Errors only
- STANDARD: + Session lifecycle (start/end/state changes)
- VERBOSE: + All latency measurements
- DEBUG: + Audio frame details, chunk timing
"""

import logging
import sys
from enum import IntEnum
from functools import wraps
from typing import Callable, Dict, Optional

import structlog
from app.core.config import settings


class VoiceLogLevel(IntEnum):
    """Voice logging verbosity levels.

    Higher values include all lower level logs.
    """

    MINIMAL = 1  # Errors only
    STANDARD = 2  # + Session lifecycle
    VERBOSE = 3  # + Latency measurements
    DEBUG = 4  # + Audio frame details


# Parse configured voice log level
_VOICE_LOG_LEVEL_MAP = {
    "MINIMAL": VoiceLogLevel.MINIMAL,
    "STANDARD": VoiceLogLevel.STANDARD,
    "VERBOSE": VoiceLogLevel.VERBOSE,
    "DEBUG": VoiceLogLevel.DEBUG,
}

_voice_log_level: VoiceLogLevel = _VOICE_LOG_LEVEL_MAP.get(settings.VOICE_LOG_LEVEL.upper(), VoiceLogLevel.STANDARD)


def get_voice_log_level() -> VoiceLogLevel:
    """Get the current voice logging level."""
    return _voice_log_level


def set_voice_log_level(level: VoiceLogLevel) -> None:
    """Set the voice logging level (useful for testing)."""
    global _voice_log_level
    _voice_log_level = level


def configure_logging():
    """Configure structured logging for the application"""
    # Import lazily to avoid circular import
    from app.services.log_stream_service import get_log_stream_handler

    # Determine log level
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    # Attach streaming handler for WebSocket log subscribers
    streaming_handler = get_log_stream_handler()
    streaming_handler.setLevel(log_level)
    logging.getLogger().addHandler(streaming_handler)

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer() if not settings.DEBUG else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = None):
    """
    Get a structured logger instance

    Args:
        name: Logger name (usually __name__ of the module)

    Returns:
        Structured logger instance
    """
    return structlog.get_logger(name)


# =============================================================================
# Voice-Specific Logging Utilities (Phase 3 - Observability)
# =============================================================================


class VoiceLogger:
    """
    Voice-specific logger with configurable verbosity levels.

    Usage:
        voice_log = get_voice_logger(__name__)

        # Always logged (errors)
        voice_log.error("voice_connection_failed", error=str(e))

        # Logged at STANDARD+
        voice_log.session_start(session_id="abc123", user_id="user456")
        voice_log.session_end(session_id="abc123", duration_ms=5000)

        # Logged at VERBOSE+
        voice_log.latency("stt_transcribe", duration_ms=150.5)
        voice_log.latency("tts_synthesize", duration_ms=200.3)

        # Logged at DEBUG only
        voice_log.audio_frame(chunk_size=1024, sequence=42)
    """

    def __init__(self, name: str):
        self._logger = structlog.get_logger(name)
        self._name = name

    def _should_log(self, min_level: VoiceLogLevel) -> bool:
        """Check if the current log level is at least min_level."""
        return _voice_log_level >= min_level

    # -------------------------------------------------------------------------
    # MINIMAL level - Errors (always logged)
    # -------------------------------------------------------------------------

    def error(
        self,
        event: str,
        session_id: Optional[str] = None,
        error_code: Optional[str] = None,
        error_category: Optional[str] = None,
        recoverable: bool = False,
        **kwargs,
    ):
        """Log voice error (always logged at any level)."""
        self._logger.error(
            event,
            session_id=session_id,
            error_code=error_code,
            error_category=error_category,
            recoverable=recoverable,
            voice_log_level="MINIMAL",
            **kwargs,
        )

    def warning(self, event: str, session_id: Optional[str] = None, **kwargs):
        """Log voice warning (always logged at any level)."""
        self._logger.warning(
            event,
            session_id=session_id,
            voice_log_level="MINIMAL",
            **kwargs,
        )

    # -------------------------------------------------------------------------
    # STANDARD level - Session lifecycle
    # -------------------------------------------------------------------------

    def session_start(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        provider: Optional[str] = None,
        **kwargs,
    ):
        """Log voice session start."""
        if not self._should_log(VoiceLogLevel.STANDARD):
            return
        self._logger.info(
            "voice_session_start",
            session_id=session_id,
            user_id=user_id,
            provider=provider,
            voice_log_level="STANDARD",
            **kwargs,
        )

    def session_end(
        self,
        session_id: str,
        duration_ms: float,
        status: str = "completed",
        turn_count: int = 0,
        **kwargs,
    ):
        """Log voice session end."""
        if not self._should_log(VoiceLogLevel.STANDARD):
            return
        self._logger.info(
            "voice_session_end",
            session_id=session_id,
            duration_ms=round(duration_ms, 2),
            status=status,
            turn_count=turn_count,
            voice_log_level="STANDARD",
            **kwargs,
        )

    def state_change(
        self,
        session_id: str,
        from_state: str,
        to_state: str,
        trigger: Optional[str] = None,
        **kwargs,
    ):
        """Log voice session state change."""
        if not self._should_log(VoiceLogLevel.STANDARD):
            return
        self._logger.info(
            "voice_state_change",
            session_id=session_id,
            from_state=from_state,
            to_state=to_state,
            trigger=trigger,
            voice_log_level="STANDARD",
            **kwargs,
        )

    def provider_switch(
        self,
        session_id: str,
        from_provider: str,
        to_provider: str,
        reason: str,
        **kwargs,
    ):
        """Log provider switch (e.g., STT fallback)."""
        if not self._should_log(VoiceLogLevel.STANDARD):
            return
        self._logger.info(
            "voice_provider_switch",
            session_id=session_id,
            from_provider=from_provider,
            to_provider=to_provider,
            reason=reason,
            voice_log_level="STANDARD",
            **kwargs,
        )

    def barge_in(self, session_id: str, at_position_ms: Optional[float] = None, **kwargs):
        """Log barge-in event."""
        if not self._should_log(VoiceLogLevel.STANDARD):
            return
        self._logger.info(
            "voice_barge_in",
            session_id=session_id,
            at_position_ms=at_position_ms,
            voice_log_level="STANDARD",
            **kwargs,
        )

    # -------------------------------------------------------------------------
    # VERBOSE level - Latency measurements
    # -------------------------------------------------------------------------

    def latency(
        self,
        stage: str,
        duration_ms: float,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        **kwargs,
    ):
        """Log pipeline stage latency."""
        if not self._should_log(VoiceLogLevel.VERBOSE):
            return
        self._logger.info(
            "voice_latency",
            stage=stage,
            duration_ms=round(duration_ms, 2),
            session_id=session_id,
            request_id=request_id,
            voice_log_level="VERBOSE",
            **kwargs,
        )

    def ttfa(
        self,
        session_id: str,
        ttfa_ms: float,
        request_id: Optional[str] = None,
        **kwargs,
    ):
        """Log time-to-first-audio."""
        if not self._should_log(VoiceLogLevel.VERBOSE):
            return
        self._logger.info(
            "voice_ttfa",
            session_id=session_id,
            ttfa_ms=round(ttfa_ms, 2),
            request_id=request_id,
            voice_log_level="VERBOSE",
            **kwargs,
        )

    def pipeline_complete(
        self,
        session_id: str,
        request_id: str,
        total_ms: float,
        stages: Dict[str, float],
        **kwargs,
    ):
        """Log complete pipeline timing summary."""
        if not self._should_log(VoiceLogLevel.VERBOSE):
            return
        self._logger.info(
            "voice_pipeline_complete",
            session_id=session_id,
            request_id=request_id,
            total_ms=round(total_ms, 2),
            stages={k: round(v, 2) for k, v in stages.items()},
            voice_log_level="VERBOSE",
            **kwargs,
        )

    def stt_result(
        self,
        session_id: str,
        transcript_length: int,
        duration_ms: float,
        provider: str,
        is_final: bool = True,
        confidence: Optional[float] = None,
        **kwargs,
    ):
        """Log STT transcription result."""
        if not self._should_log(VoiceLogLevel.VERBOSE):
            return
        self._logger.info(
            "voice_stt_result",
            session_id=session_id,
            transcript_length=transcript_length,
            duration_ms=round(duration_ms, 2),
            provider=provider,
            is_final=is_final,
            confidence=confidence,
            voice_log_level="VERBOSE",
            **kwargs,
        )

    def tts_chunk(
        self,
        session_id: str,
        chunk_index: int,
        chunk_size_bytes: int,
        elapsed_ms: float,
        provider: str,
        **kwargs,
    ):
        """Log TTS audio chunk delivery."""
        if not self._should_log(VoiceLogLevel.VERBOSE):
            return
        self._logger.info(
            "voice_tts_chunk",
            session_id=session_id,
            chunk_index=chunk_index,
            chunk_size_bytes=chunk_size_bytes,
            elapsed_ms=round(elapsed_ms, 2),
            provider=provider,
            voice_log_level="VERBOSE",
            **kwargs,
        )

    # -------------------------------------------------------------------------
    # DEBUG level - Audio frame details
    # -------------------------------------------------------------------------

    def audio_frame(
        self,
        session_id: str,
        direction: str,  # "inbound" or "outbound"
        chunk_size: int,
        sequence: int,
        timestamp_ms: Optional[float] = None,
        **kwargs,
    ):
        """Log individual audio frame (very verbose)."""
        if not self._should_log(VoiceLogLevel.DEBUG):
            return
        self._logger.debug(
            "voice_audio_frame",
            session_id=session_id,
            direction=direction,
            chunk_size=chunk_size,
            sequence=sequence,
            timestamp_ms=timestamp_ms,
            voice_log_level="DEBUG",
            **kwargs,
        )

    def vad_event(
        self,
        session_id: str,
        event_type: str,  # "speech_start", "speech_end", "silence"
        energy: Optional[float] = None,
        duration_ms: Optional[float] = None,
        **kwargs,
    ):
        """Log VAD (Voice Activity Detection) event."""
        if not self._should_log(VoiceLogLevel.DEBUG):
            return
        self._logger.debug(
            "voice_vad_event",
            session_id=session_id,
            event_type=event_type,
            energy=energy,
            duration_ms=duration_ms,
            voice_log_level="DEBUG",
            **kwargs,
        )

    def websocket_message(
        self,
        session_id: str,
        direction: str,  # "send" or "receive"
        message_type: str,
        size_bytes: int,
        **kwargs,
    ):
        """Log WebSocket message (very verbose)."""
        if not self._should_log(VoiceLogLevel.DEBUG):
            return
        self._logger.debug(
            "voice_ws_message",
            session_id=session_id,
            direction=direction,
            message_type=message_type,
            size_bytes=size_bytes,
            voice_log_level="DEBUG",
            **kwargs,
        )

    def buffer_state(
        self,
        session_id: str,
        buffer_type: str,  # "input", "output", "playback"
        size_bytes: int,
        duration_ms: Optional[float] = None,
        **kwargs,
    ):
        """Log audio buffer state."""
        if not self._should_log(VoiceLogLevel.DEBUG):
            return
        self._logger.debug(
            "voice_buffer_state",
            session_id=session_id,
            buffer_type=buffer_type,
            size_bytes=size_bytes,
            duration_ms=duration_ms,
            voice_log_level="DEBUG",
            **kwargs,
        )

    # -------------------------------------------------------------------------
    # Generic info (respects STANDARD level)
    # -------------------------------------------------------------------------

    def info(self, event: str, session_id: Optional[str] = None, **kwargs):
        """Log generic voice info message at STANDARD level."""
        if not self._should_log(VoiceLogLevel.STANDARD):
            return
        self._logger.info(
            event,
            session_id=session_id,
            voice_log_level="STANDARD",
            **kwargs,
        )

    def debug(self, event: str, session_id: Optional[str] = None, **kwargs):
        """Log generic voice debug message at DEBUG level."""
        if not self._should_log(VoiceLogLevel.DEBUG):
            return
        self._logger.debug(
            event,
            session_id=session_id,
            voice_log_level="DEBUG",
            **kwargs,
        )


# Cache for voice logger instances
_voice_loggers: Dict[str, VoiceLogger] = {}


def get_voice_logger(name: str = None) -> VoiceLogger:
    """
    Get a voice-specific logger instance with configurable verbosity.

    Args:
        name: Logger name (usually __name__ of the module)

    Returns:
        VoiceLogger instance
    """
    key = name or "__root__"
    if key not in _voice_loggers:
        _voice_loggers[key] = VoiceLogger(name)
    return _voice_loggers[key]


def voice_log_latency(stage: str):
    """
    Decorator to automatically log latency for a function.

    Usage:
        @voice_log_latency("stt_transcribe")
        async def transcribe(audio: bytes) -> str:
            ...
    """

    def decorator(func: Callable) -> Callable:
        logger = get_voice_logger(func.__module__)

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            import time

            start = time.time()
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.time() - start) * 1000
                session_id = kwargs.get("session_id")
                logger.latency(stage, duration_ms, session_id=session_id)
                return result
            except Exception:
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            import time

            start = time.time()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start) * 1000
                session_id = kwargs.get("session_id")
                logger.latency(stage, duration_ms, session_id=session_id)
                return result
            except Exception:
                raise

        import asyncio

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
