"""
Session Analytics Service - Voice Session Performance Analytics

Phase 10: Frontend Integration - Analytics and metrics collection.

Features:
- Real-time session metrics tracking
- Latency measurements (STT, LLM, TTS)
- Voice interaction quality metrics
- Turn-taking analysis
- Emotion tracking summaries
- Dictation productivity metrics
"""

import statistics
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums and Types
# ==============================================================================


class SessionPhase(str, Enum):
    """Phase of a voice session."""

    CONNECTING = "connecting"
    INITIALIZING = "initializing"
    ACTIVE = "active"
    PAUSED = "paused"
    ENDING = "ending"
    COMPLETED = "completed"
    ERROR = "error"


class InteractionType(str, Enum):
    """Type of voice interaction."""

    USER_UTTERANCE = "user_utterance"
    AI_RESPONSE = "ai_response"
    TOOL_CALL = "tool_call"
    BARGE_IN = "barge_in"
    BACKCHANNEL = "backchannel"
    FILLER = "filler"
    REPAIR = "repair"
    COMMAND = "command"


class MetricType(str, Enum):
    """Type of metric being tracked."""

    LATENCY = "latency"
    QUALITY = "quality"
    COUNT = "count"
    DURATION = "duration"
    RATE = "rate"


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class LatencyMetrics:
    """Latency metrics for a session."""

    # STT latency (speech end to transcript)
    stt_latencies_ms: List[float] = field(default_factory=list)
    stt_avg_ms: float = 0.0
    stt_p50_ms: float = 0.0
    stt_p95_ms: float = 0.0

    # LLM latency (transcript to first token)
    llm_latencies_ms: List[float] = field(default_factory=list)
    llm_avg_ms: float = 0.0
    llm_p50_ms: float = 0.0
    llm_p95_ms: float = 0.0

    # TTS latency (response to first audio)
    tts_latencies_ms: List[float] = field(default_factory=list)
    tts_avg_ms: float = 0.0
    tts_p50_ms: float = 0.0
    tts_p95_ms: float = 0.0

    # End-to-end latency (speech end to first audio)
    e2e_latencies_ms: List[float] = field(default_factory=list)
    e2e_avg_ms: float = 0.0
    e2e_p50_ms: float = 0.0
    e2e_p95_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stt": {
                "avg_ms": self.stt_avg_ms,
                "p50_ms": self.stt_p50_ms,
                "p95_ms": self.stt_p95_ms,
                "samples": len(self.stt_latencies_ms),
            },
            "llm": {
                "avg_ms": self.llm_avg_ms,
                "p50_ms": self.llm_p50_ms,
                "p95_ms": self.llm_p95_ms,
                "samples": len(self.llm_latencies_ms),
            },
            "tts": {
                "avg_ms": self.tts_avg_ms,
                "p50_ms": self.tts_p50_ms,
                "p95_ms": self.tts_p95_ms,
                "samples": len(self.tts_latencies_ms),
            },
            "e2e": {
                "avg_ms": self.e2e_avg_ms,
                "p50_ms": self.e2e_p50_ms,
                "p95_ms": self.e2e_p95_ms,
                "samples": len(self.e2e_latencies_ms),
            },
        }


@dataclass
class InteractionMetrics:
    """Interaction counts and rates for a session."""

    user_utterance_count: int = 0
    ai_response_count: int = 0
    tool_call_count: int = 0
    barge_in_count: int = 0
    backchannel_count: int = 0
    filler_count: int = 0
    repair_count: int = 0
    command_count: int = 0

    # Word counts
    user_word_count: int = 0
    ai_word_count: int = 0

    # Durations (ms)
    total_user_speaking_ms: float = 0.0
    total_ai_speaking_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "counts": {
                "user_utterances": self.user_utterance_count,
                "ai_responses": self.ai_response_count,
                "tool_calls": self.tool_call_count,
                "barge_ins": self.barge_in_count,
                "backchannels": self.backchannel_count,
                "fillers": self.filler_count,
                "repairs": self.repair_count,
                "commands": self.command_count,
            },
            "words": {
                "user": self.user_word_count,
                "ai": self.ai_word_count,
            },
            "speaking_time_ms": {
                "user": self.total_user_speaking_ms,
                "ai": self.total_ai_speaking_ms,
            },
        }


@dataclass
class QualityMetrics:
    """Quality and accuracy metrics for a session."""

    # STT confidence scores
    stt_confidence_scores: List[float] = field(default_factory=list)
    stt_avg_confidence: float = 0.0

    # AI response confidence
    ai_confidence_scores: List[float] = field(default_factory=list)
    ai_avg_confidence: float = 0.0

    # Emotion detection
    emotions_detected: Dict[str, int] = field(default_factory=dict)
    avg_valence: float = 0.0
    avg_arousal: float = 0.0

    # Turn-taking quality
    smooth_transitions: int = 0
    interrupted_transitions: int = 0
    overlap_events: int = 0

    # Repair rate (lower is better)
    clarification_requests: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stt_confidence": {
                "avg": self.stt_avg_confidence,
                "samples": len(self.stt_confidence_scores),
            },
            "ai_confidence": {
                "avg": self.ai_avg_confidence,
                "samples": len(self.ai_confidence_scores),
            },
            "emotion": {
                "detected": self.emotions_detected,
                "avg_valence": self.avg_valence,
                "avg_arousal": self.avg_arousal,
            },
            "turn_taking": {
                "smooth": self.smooth_transitions,
                "interrupted": self.interrupted_transitions,
                "overlaps": self.overlap_events,
            },
            "repairs": self.clarification_requests,
        }


@dataclass
class DictationMetrics:
    """Dictation-specific metrics for a session."""

    note_type: Optional[str] = None
    sections_used: List[str] = field(default_factory=list)
    total_words_dictated: int = 0
    commands_executed: int = 0
    commands_failed: int = 0
    formatting_corrections: int = 0
    abbreviations_expanded: int = 0
    phi_alerts: int = 0
    dictation_duration_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "note_type": self.note_type,
            "sections_used": self.sections_used,
            "words_dictated": self.total_words_dictated,
            "commands": {
                "executed": self.commands_executed,
                "failed": self.commands_failed,
            },
            "formatting_corrections": self.formatting_corrections,
            "abbreviations_expanded": self.abbreviations_expanded,
            "phi_alerts": self.phi_alerts,
            "duration_ms": self.dictation_duration_ms,
        }


@dataclass
class SessionAnalytics:
    """Complete analytics for a voice session."""

    session_id: str
    user_id: Optional[str]
    phase: SessionPhase = SessionPhase.CONNECTING
    mode: str = "conversation"  # conversation or dictation
    # Optional conversation/session metadata
    conversation_id: Optional[str] = None

    # PHI-conscious and reading-mode metadata for this session
    phi_mode: str = "clinical"  # "clinical" | "demo"
    exclude_phi: bool = False
    reading_mode_enabled: bool = False
    reading_detail: str = "full"  # "short" | "full"
    reading_speed: str = "normal"  # "slow" | "normal" | "fast"

    # Timestamps
    started_at: datetime = field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    duration_ms: float = 0.0

    # Metrics
    latency: LatencyMetrics = field(default_factory=LatencyMetrics)
    interactions: InteractionMetrics = field(default_factory=InteractionMetrics)
    quality: QualityMetrics = field(default_factory=QualityMetrics)
    dictation: DictationMetrics = field(default_factory=DictationMetrics)

    # Errors
    error_count: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "phase": self.phase.value,
            "mode": self.mode,
            "conversation_id": self.conversation_id,
            "timing": {
                "started_at": self.started_at.isoformat(),
                "ended_at": self.ended_at.isoformat() if self.ended_at else None,
                "duration_ms": self.duration_ms,
            },
            "latency": self.latency.to_dict(),
            "interactions": self.interactions.to_dict(),
            "quality": self.quality.to_dict(),
            "dictation": self.dictation.to_dict() if self.mode == "dictation" else None,
            "errors": {
                "count": self.error_count,
                "details": self.errors[-10:],  # Last 10 errors
            },
            "privacy": {
                "phi_mode": self.phi_mode,
                "exclude_phi": self.exclude_phi,
            },
            "reading": {
                "reading_mode_enabled": self.reading_mode_enabled,
                "reading_detail": self.reading_detail,
                "reading_speed": self.reading_speed,
            },
        }


# ==============================================================================
# Session Analytics Service
# ==============================================================================


class SessionAnalyticsService:
    """
    Service for tracking voice session analytics.

    Collects and aggregates metrics during voice sessions,
    provides real-time analytics updates to frontend,
    and stores session summaries for reporting.

    Usage:
        analytics = SessionAnalyticsService()

        # Start tracking a session
        session = analytics.create_session("session_123", "user_456")

        # Record events
        analytics.record_latency(session.session_id, "stt", 120.5)
        analytics.record_interaction(session.session_id, InteractionType.USER_UTTERANCE)
        analytics.record_emotion(session.session_id, "happy", 0.8, 0.6)

        # Get current analytics
        current = analytics.get_session_analytics(session.session_id)

        # End session
        summary = analytics.end_session(session.session_id)
    """

    def __init__(self):
        self._sessions: Dict[str, SessionAnalytics] = {}
        self._message_callbacks: Dict[str, Callable] = {}
        self._analytics_interval_ms = 5000  # Send analytics update every 5s

    # Valid enum values for PHI and reading settings
    VALID_PHI_MODES = {"clinical", "demo"}
    VALID_READING_DETAILS = {"short", "full"}
    VALID_READING_SPEEDS = {"slow", "normal", "fast"}

    def create_session(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        mode: str = "conversation",
        on_analytics_update: Optional[Callable] = None,
        conversation_id: Optional[str] = None,
        phi_mode: str = "clinical",
        exclude_phi: bool = False,
        reading_mode_enabled: bool = False,
        reading_detail: str = "full",
        reading_speed: str = "normal",
    ) -> SessionAnalytics:
        """
        Create a new analytics session.

        Args:
            session_id: Unique session identifier
            user_id: User ID (optional)
            mode: Session mode (conversation or dictation)
            on_analytics_update: Callback for real-time updates
            conversation_id: Optional conversation ID for linking
            phi_mode: PHI policy ("clinical" or "demo")
            exclude_phi: Whether to exclude high-risk PHI from RAG
            reading_mode_enabled: Whether reading mode is active
            reading_detail: Reading detail level ("short" or "full")
            reading_speed: Reading speed ("slow", "normal", or "fast")

        Returns:
            SessionAnalytics object
        """
        # Validate and normalize PHI/reading settings
        if phi_mode not in self.VALID_PHI_MODES:
            logger.warning(
                f"Invalid phi_mode '{phi_mode}' for session {session_id}, defaulting to 'clinical'"
            )
            phi_mode = "clinical"

        if reading_detail not in self.VALID_READING_DETAILS:
            logger.warning(
                f"Invalid reading_detail '{reading_detail}' for session {session_id}, defaulting to 'full'"
            )
            reading_detail = "full"

        if reading_speed not in self.VALID_READING_SPEEDS:
            logger.warning(
                f"Invalid reading_speed '{reading_speed}' for session {session_id}, defaulting to 'normal'"
            )
            reading_speed = "normal"

        # Ensure consistency: demo mode implies exclude_phi=True
        if phi_mode == "demo" and not exclude_phi:
            logger.debug(
                f"Session {session_id}: phi_mode='demo' implies exclude_phi=True"
            )
            exclude_phi = True

        analytics = SessionAnalytics(
            session_id=session_id,
            user_id=user_id,
            mode=mode,
            phase=SessionPhase.INITIALIZING,
            conversation_id=conversation_id,
            phi_mode=phi_mode,
            exclude_phi=exclude_phi,
            reading_mode_enabled=reading_mode_enabled,
            reading_detail=reading_detail,
            reading_speed=reading_speed,
        )

        self._sessions[session_id] = analytics

        if on_analytics_update:
            self._message_callbacks[session_id] = on_analytics_update

        logger.info(f"Created analytics session: {session_id}, mode={mode}")
        return analytics

    def set_session_active(self, session_id: str) -> None:
        """Mark session as active."""
        if session_id in self._sessions:
            self._sessions[session_id].phase = SessionPhase.ACTIVE
            logger.debug(f"Session {session_id} is now active")

    def record_latency(
        self,
        session_id: str,
        latency_type: str,
        latency_ms: float,
    ) -> None:
        """
        Record a latency measurement.

        Args:
            session_id: Session identifier
            latency_type: Type of latency (stt, llm, tts, e2e)
            latency_ms: Latency in milliseconds
        """
        if session_id not in self._sessions:
            return

        analytics = self._sessions[session_id]
        latency = analytics.latency

        if latency_type == "stt":
            latency.stt_latencies_ms.append(latency_ms)
            self._update_latency_stats(latency.stt_latencies_ms, "stt", latency)
        elif latency_type == "llm":
            latency.llm_latencies_ms.append(latency_ms)
            self._update_latency_stats(latency.llm_latencies_ms, "llm", latency)
        elif latency_type == "tts":
            latency.tts_latencies_ms.append(latency_ms)
            self._update_latency_stats(latency.tts_latencies_ms, "tts", latency)
        elif latency_type == "e2e":
            latency.e2e_latencies_ms.append(latency_ms)
            self._update_latency_stats(latency.e2e_latencies_ms, "e2e", latency)

        logger.debug(f"[Analytics] {latency_type} latency: {latency_ms:.1f}ms")

    def _update_latency_stats(
        self,
        values: List[float],
        prefix: str,
        latency: LatencyMetrics,
    ) -> None:
        """Update latency statistics."""
        if not values:
            return

        avg = statistics.mean(values)
        sorted_vals = sorted(values)
        p50 = sorted_vals[len(sorted_vals) // 2]
        p95_idx = int(len(sorted_vals) * 0.95)
        p95 = sorted_vals[min(p95_idx, len(sorted_vals) - 1)]

        setattr(latency, f"{prefix}_avg_ms", round(avg, 1))
        setattr(latency, f"{prefix}_p50_ms", round(p50, 1))
        setattr(latency, f"{prefix}_p95_ms", round(p95, 1))

    def record_interaction(
        self,
        session_id: str,
        interaction_type: InteractionType,
        word_count: int = 0,
        duration_ms: float = 0.0,
    ) -> None:
        """
        Record an interaction event.

        Args:
            session_id: Session identifier
            interaction_type: Type of interaction
            word_count: Number of words (if applicable)
            duration_ms: Duration in milliseconds (if applicable)
        """
        if session_id not in self._sessions:
            return

        interactions = self._sessions[session_id].interactions

        if interaction_type == InteractionType.USER_UTTERANCE:
            interactions.user_utterance_count += 1
            interactions.user_word_count += word_count
            interactions.total_user_speaking_ms += duration_ms
        elif interaction_type == InteractionType.AI_RESPONSE:
            interactions.ai_response_count += 1
            interactions.ai_word_count += word_count
            interactions.total_ai_speaking_ms += duration_ms
        elif interaction_type == InteractionType.TOOL_CALL:
            interactions.tool_call_count += 1
        elif interaction_type == InteractionType.BARGE_IN:
            interactions.barge_in_count += 1
        elif interaction_type == InteractionType.BACKCHANNEL:
            interactions.backchannel_count += 1
        elif interaction_type == InteractionType.FILLER:
            interactions.filler_count += 1
        elif interaction_type == InteractionType.REPAIR:
            interactions.repair_count += 1
        elif interaction_type == InteractionType.COMMAND:
            interactions.command_count += 1

        logger.debug(f"[Analytics] Interaction: {interaction_type.value}")

    def record_stt_confidence(
        self,
        session_id: str,
        confidence: float,
    ) -> None:
        """Record STT confidence score."""
        if session_id not in self._sessions:
            return

        quality = self._sessions[session_id].quality
        quality.stt_confidence_scores.append(confidence)
        quality.stt_avg_confidence = statistics.mean(quality.stt_confidence_scores)

    def record_ai_confidence(
        self,
        session_id: str,
        confidence: float,
    ) -> None:
        """Record AI response confidence score."""
        if session_id not in self._sessions:
            return

        quality = self._sessions[session_id].quality
        quality.ai_confidence_scores.append(confidence)
        quality.ai_avg_confidence = statistics.mean(quality.ai_confidence_scores)

    def record_emotion(
        self,
        session_id: str,
        emotion: str,
        valence: float,
        arousal: float,
    ) -> None:
        """Record detected emotion."""
        if session_id not in self._sessions:
            return

        quality = self._sessions[session_id].quality

        # Track emotion counts
        if emotion not in quality.emotions_detected:
            quality.emotions_detected[emotion] = 0
        quality.emotions_detected[emotion] += 1

        # Update average valence/arousal (simple moving average)
        n = sum(quality.emotions_detected.values())
        quality.avg_valence = (quality.avg_valence * (n - 1) + valence) / n
        quality.avg_arousal = (quality.avg_arousal * (n - 1) + arousal) / n

    def record_turn_taking(
        self,
        session_id: str,
        smooth: bool = True,
        overlap: bool = False,
    ) -> None:
        """Record turn-taking event."""
        if session_id not in self._sessions:
            return

        quality = self._sessions[session_id].quality

        if overlap:
            quality.overlap_events += 1
        elif smooth:
            quality.smooth_transitions += 1
        else:
            quality.interrupted_transitions += 1

    def record_repair(
        self,
        session_id: str,
    ) -> None:
        """Record a clarification/repair request."""
        if session_id not in self._sessions:
            return

        self._sessions[session_id].quality.clarification_requests += 1
        self._sessions[session_id].interactions.repair_count += 1

    def record_dictation_event(
        self,
        session_id: str,
        event_type: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Record a dictation-specific event.

        Args:
            session_id: Session identifier
            event_type: Type of dictation event
            data: Additional event data
        """
        if session_id not in self._sessions:
            return

        dictation = self._sessions[session_id].dictation
        data = data or {}

        if event_type == "note_type_set":
            dictation.note_type = data.get("note_type")
        elif event_type == "section_used":
            section = data.get("section")
            if section and section not in dictation.sections_used:
                dictation.sections_used.append(section)
        elif event_type == "words_added":
            dictation.total_words_dictated += data.get("count", 0)
        elif event_type == "command_executed":
            dictation.commands_executed += 1
        elif event_type == "command_failed":
            dictation.commands_failed += 1
        elif event_type == "formatting_correction":
            dictation.formatting_corrections += 1
        elif event_type == "abbreviation_expanded":
            dictation.abbreviations_expanded += data.get("count", 1)
        elif event_type == "phi_alert":
            dictation.phi_alerts += 1

    def record_error(
        self,
        session_id: str,
        error_type: str,
        message: str,
        recoverable: bool = True,
    ) -> None:
        """Record an error."""
        if session_id not in self._sessions:
            return

        analytics = self._sessions[session_id]
        analytics.error_count += 1
        analytics.errors.append(
            {
                "type": error_type,
                "message": message,
                "recoverable": recoverable,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

        if not recoverable:
            analytics.phase = SessionPhase.ERROR

    def get_session_analytics(
        self,
        session_id: str,
    ) -> Optional[SessionAnalytics]:
        """Get current analytics for a session."""
        return self._sessions.get(session_id)

    def get_analytics_summary(
        self,
        session_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get analytics summary as a dictionary."""
        analytics = self._sessions.get(session_id)
        if not analytics:
            return None

        # Update duration
        if analytics.phase == SessionPhase.ACTIVE:
            analytics.duration_ms = (datetime.utcnow() - analytics.started_at).total_seconds() * 1000

        return analytics.to_dict()

    async def send_analytics_update(
        self,
        session_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Generate and send an analytics update.

        Returns the analytics data that was sent.
        """
        summary = self.get_analytics_summary(session_id)
        if not summary:
            return None

        # Call the registered callback if any
        if session_id in self._message_callbacks:
            try:
                callback = self._message_callbacks[session_id]
                await callback(summary)
            except Exception as e:
                logger.warning(f"Analytics callback error: {e}")

        return summary

    def get_phi_summary(self) -> Dict[str, Any]:
        """
        Get a lightweight summary of PHI-conscious settings across active sessions.

        Returns:
            Dict with counts of clinical vs demo sessions and PHI-conscious rate.
        """
        active_phases = {
            SessionPhase.CONNECTING,
            SessionPhase.INITIALIZING,
            SessionPhase.ACTIVE,
            SessionPhase.PAUSED,
        }

        total_active = 0
        clinical = 0
        demo = 0
        phi_conscious_sessions = 0

        for session in self._sessions.values():
            if session.phase not in active_phases:
                continue

            total_active += 1

            if session.phi_mode == "demo":
                demo += 1
            else:
                clinical += 1

            if session.exclude_phi:
                phi_conscious_sessions += 1

        phi_conscious_rate = (
            (phi_conscious_sessions / total_active) * 100.0 if total_active > 0 else 0.0
        )

        return {
            "active_sessions_total": total_active,
            "active_sessions_clinical": clinical,
            "active_sessions_demo": demo,
            "phi_conscious_sessions": phi_conscious_sessions,
            "phi_conscious_rate": phi_conscious_rate,
        }

    def end_session(
        self,
        session_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        End a session and return final analytics.

        Args:
            session_id: Session identifier

        Returns:
            Final analytics summary
        """
        if session_id not in self._sessions:
            return None

        analytics = self._sessions[session_id]
        analytics.phase = SessionPhase.COMPLETED
        analytics.ended_at = datetime.utcnow()
        analytics.duration_ms = (analytics.ended_at - analytics.started_at).total_seconds() * 1000

        # Update dictation duration if applicable
        if analytics.mode == "dictation":
            analytics.dictation.dictation_duration_ms = analytics.duration_ms

        summary = analytics.to_dict()

        # Cleanup
        if session_id in self._message_callbacks:
            del self._message_callbacks[session_id]

        logger.info(
            f"Session {session_id} ended: duration={analytics.duration_ms:.0f}ms, "
            f"utterances={analytics.interactions.user_utterance_count}, "
            f"e2e_avg={analytics.latency.e2e_avg_ms:.0f}ms"
        )

        return summary

    def remove_session(self, session_id: str) -> None:
        """Remove a session from tracking."""
        if session_id in self._sessions:
            del self._sessions[session_id]
        if session_id in self._message_callbacks:
            del self._message_callbacks[session_id]


# Global service instance
session_analytics_service = SessionAnalyticsService()
