"""
Repair Tracker - Multi-Turn Repair Strategy Management

Tracks repair attempts across conversation turns.
Selects appropriate repair strategy based on context and history.
Escalates when repeated repairs fail.

Phase 3 Enhancements:
- Detailed repair attempt logging for analytics
- Metrics collection for repair success rates
- Enhanced escalation with repair.escalation events
- User-specific repair history tracking
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class RepairMetrics:
    """Metrics for repair tracking analytics"""

    total_repairs: int = 0
    successful_repairs: int = 0
    escalations: int = 0
    strategy_usage: Dict[str, int] = field(default_factory=dict)
    strategy_success: Dict[str, int] = field(default_factory=dict)
    avg_attempts_to_resolve: float = 0.0
    emotion_triggered_escalations: int = 0


@dataclass
class RepairSession:
    """Tracks repair state for a session"""

    session_id: str
    user_id: str
    attempts: List["RepairAttempt"] = field(default_factory=list)
    current_strategy: Optional[str] = None
    escalation_level: int = 0  # 0=normal, 1=simplified, 2=human
    started_at: datetime = field(default_factory=datetime.utcnow)
    resolved: bool = False
    emotion_at_start: Optional[str] = None
    resolution_latency_ms: Optional[int] = None


class RepairTracker:
    """
    Multi-turn repair strategy manager with enhanced tracking.

    Repair strategies (in escalation order):
    1. echo: Repeat back what was heard, ask for confirmation
    2. clarify: Ask targeted clarification question
    3. rephrase: Ask user to rephrase their request
    4. simplify: Break request into simpler parts
    5. text_fallback: Offer text input option
    6. human_handoff: Escalate to human support

    Escalation triggers:
    - 3 failed repairs in 2 minutes
    - User frustration detected
    - Explicit user request

    Phase 3 Enhancements:
    - Detailed metrics collection per user
    - Enhanced event publishing for repair.escalation
    - Emotion-aware escalation thresholds
    - Analytics-ready logging
    """

    STRATEGIES = [
        "echo",
        "clarify",
        "rephrase",
        "simplify",
        "text_fallback",
        "human_handoff",
    ]

    # Strategy response templates
    STRATEGY_RESPONSES = {
        "echo": "I heard '{transcript}'. Is that correct?",
        "clarify": "Just to make sure I understand - {clarification_question}",
        "rephrase": "Could you please rephrase that? I want to make sure I understand correctly.",
        "simplify": "Let's break this down. {first_part_question}",
        "text_fallback": "Would you prefer to type your message instead? I can help you that way too.",
        "human_handoff": "I'm having trouble understanding. Would you like to speak with a person?",
    }

    # Escalation thresholds
    MAX_REPAIRS_BEFORE_ESCALATION = 3
    ESCALATION_WINDOW_MINUTES = 2

    # Emotion-based thresholds
    FRUSTRATED_ESCALATION_THRESHOLD = 2  # Escalate faster when frustrated
    ANXIOUS_ESCALATION_THRESHOLD = 2  # Escalate faster when anxious

    def __init__(self, event_bus=None, policy_service=None):
        self.event_bus = event_bus
        self.policy_service = policy_service
        self._sessions: Dict[str, RepairSession] = {}
        self._user_metrics: Dict[str, RepairMetrics] = {}
        self._global_metrics = RepairMetrics()
        logger.info("RepairTracker initialized")

    async def start_repair(
        self,
        session_id: str,
        user_id: str,
        transcript: str,
        error_type: str,
        emotion_state: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Start or continue a repair sequence.

        Returns dict with:
        - strategy: Selected repair strategy
        - response: Suggested response text
        - escalation_level: Current escalation level
        - should_escalate: Whether to trigger escalation
        - attempt_count: Number of repair attempts
        - emotion_triggered: Whether escalation was emotion-triggered
        """
        from . import RepairAttempt

        # Get or create repair session
        session = self._sessions.get(session_id)
        is_new_session = session is None
        if is_new_session:
            session = RepairSession(
                session_id=session_id,
                user_id=user_id,
                emotion_at_start=emotion_state.get("dominant_emotion") if emotion_state else None,
            )
            self._sessions[session_id] = session

        # Check for escalation need
        recent_attempts = self._get_recent_attempts(session)
        escalation_threshold = self.MAX_REPAIRS_BEFORE_ESCALATION
        emotion_triggered = False

        # Check for emotion-based escalation
        if emotion_state:
            emotion = emotion_state.get("dominant_emotion", "neutral")
            if emotion in ["frustration", "anger"]:
                escalation_threshold = self.FRUSTRATED_ESCALATION_THRESHOLD
                emotion_triggered = True
            elif emotion in ["anxious", "stressed"]:
                escalation_threshold = self.ANXIOUS_ESCALATION_THRESHOLD
                emotion_triggered = True

        should_escalate = len(recent_attempts) >= escalation_threshold

        if emotion_triggered and should_escalate:
            logger.info(
                f"Emotion-triggered escalation for {session_id}: "
                f"emotion={emotion_state.get('dominant_emotion')}, "
                f"attempts={len(recent_attempts)}"
            )
            # Track emotion-triggered escalations
            self._global_metrics.emotion_triggered_escalations += 1

        # Select strategy
        if should_escalate:
            session.escalation_level = min(session.escalation_level + 1, len(self.STRATEGIES) - 1)
            self._global_metrics.escalations += 1

        strategy = self._select_strategy(session, error_type, emotion_state)
        session.current_strategy = strategy

        # Generate response
        response = self._generate_response(strategy, transcript, error_type)

        # Record attempt
        attempt = RepairAttempt(
            strategy=strategy,
            transcript_before=transcript,
        )
        session.attempts.append(attempt)

        # Update metrics
        self._global_metrics.total_repairs += 1
        self._global_metrics.strategy_usage[strategy] = self._global_metrics.strategy_usage.get(strategy, 0) + 1

        # Update user metrics
        if user_id not in self._user_metrics:
            self._user_metrics[user_id] = RepairMetrics()
        user_metrics = self._user_metrics[user_id]
        user_metrics.total_repairs += 1
        user_metrics.strategy_usage[strategy] = user_metrics.strategy_usage.get(strategy, 0) + 1

        # Publish repair event with detailed data
        if self.event_bus:
            event_type = "repair.escalation" if should_escalate else "repair.started"
            await self.event_bus.publish_event(
                event_type=event_type,
                data={
                    "session_id": session_id,
                    "user_id": user_id,
                    "strategy": strategy,
                    "escalation_level": session.escalation_level,
                    "attempt_count": len(session.attempts),
                    "error_type": error_type,
                    "emotion_triggered": emotion_triggered,
                    "emotion_state": emotion_state.get("dominant_emotion") if emotion_state else None,
                    "recent_attempts": len(recent_attempts),
                },
                session_id=session_id,
                source_engine="conversation",
            )

        logger.info(
            f"Repair started: session={session_id}, strategy={strategy}, "
            f"level={session.escalation_level}, attempts={len(session.attempts)}"
        )

        return {
            "strategy": strategy,
            "response": response,
            "escalation_level": session.escalation_level,
            "should_escalate": should_escalate,
            "attempt_count": len(session.attempts),
            "emotion_triggered": emotion_triggered,
        }

    async def record_outcome(
        self,
        session_id: str,
        resolved: bool,
        transcript_after: Optional[str] = None,
    ) -> None:
        """Record outcome of repair attempt with metrics tracking"""
        session = self._sessions.get(session_id)
        if not session or not session.attempts:
            return

        # Update last attempt
        last_attempt = session.attempts[-1]
        last_attempt.resolved = resolved
        last_attempt.transcript_after = transcript_after
        strategy = last_attempt.strategy

        # Update metrics
        if resolved:
            session.resolved = True
            session.resolution_latency_ms = int((datetime.utcnow() - session.started_at).total_seconds() * 1000)

            # Update success metrics
            self._global_metrics.successful_repairs += 1
            self._global_metrics.strategy_success[strategy] = self._global_metrics.strategy_success.get(strategy, 0) + 1

            # Update user metrics
            if session.user_id in self._user_metrics:
                user_metrics = self._user_metrics[session.user_id]
                user_metrics.successful_repairs += 1
                user_metrics.strategy_success[strategy] = user_metrics.strategy_success.get(strategy, 0) + 1

            # Update average attempts to resolve
            if self._global_metrics.successful_repairs > 0:
                total_attempts = sum(len(s.attempts) for s in self._sessions.values() if s.resolved)
                self._global_metrics.avg_attempts_to_resolve = total_attempts / self._global_metrics.successful_repairs

            logger.info(
                f"Repair resolved for {session_id} with strategy "
                f"'{strategy}' after {len(session.attempts)} attempts "
                f"({session.resolution_latency_ms}ms)"
            )

            # Publish success event
            if self.event_bus:
                await self.event_bus.publish_event(
                    event_type="repair.resolved",
                    data={
                        "session_id": session_id,
                        "user_id": session.user_id,
                        "strategy": strategy,
                        "attempts": len(session.attempts),
                        "resolution_latency_ms": session.resolution_latency_ms,
                    },
                    session_id=session_id,
                    source_engine="conversation",
                )
        else:
            logger.info(
                f"Repair attempt failed for {session_id} with strategy "
                f"'{strategy}' (attempt {len(session.attempts)})"
            )

    def _get_recent_attempts(self, session: RepairSession) -> List["RepairAttempt"]:
        """Get attempts within escalation window"""
        cutoff = datetime.utcnow() - timedelta(minutes=self.ESCALATION_WINDOW_MINUTES)
        return [a for a in session.attempts if a.timestamp > cutoff]

    def _select_strategy(
        self,
        session: RepairSession,
        error_type: str,
        emotion_state: Optional[Dict],
    ) -> str:
        """Select appropriate repair strategy"""
        # Get strategy based on escalation level
        strategy_index = min(session.escalation_level, len(self.STRATEGIES) - 1)

        # Adjust based on error type
        if error_type == "no_speech":
            return "echo"  # Just confirm we're listening
        elif error_type == "low_confidence":
            return self.STRATEGIES[max(0, strategy_index)]
        elif error_type == "ambiguous":
            return "clarify"

        # Emotion-aware adjustments
        if emotion_state:
            emotion = emotion_state.get("dominant_emotion", "neutral")
            if emotion == "frustration" and strategy_index < 3:
                # Skip to text fallback for frustrated users
                return "text_fallback"

        return self.STRATEGIES[strategy_index]

    def _generate_response(
        self,
        strategy: str,
        transcript: str,
        error_type: str,
    ) -> str:
        """Generate response text for strategy"""
        template = self.STRATEGY_RESPONSES.get(strategy, "")

        if strategy == "echo":
            return template.format(transcript=transcript[:100])
        elif strategy == "clarify":
            # Generate context-appropriate clarification
            if "order" in transcript.lower():
                question = "which medication did you want to order?"
            elif "patient" in transcript.lower():
                question = "which patient are you referring to?"
            else:
                question = "what specifically would you like me to do?"
            return template.format(clarification_question=question)
        elif strategy == "simplify":
            return template.format(first_part_question="What's the first thing you'd like to do?")
        else:
            return template

    async def get_repair_history(self, session_id: str) -> Optional[RepairSession]:
        """Get repair history for session"""
        return self._sessions.get(session_id)

    def cleanup_old_sessions(self, max_age_hours: int = 24) -> int:
        """Clean up old repair sessions"""
        cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
        old_sessions = [sid for sid, session in self._sessions.items() if session.started_at < cutoff]
        for sid in old_sessions:
            del self._sessions[sid]
        return len(old_sessions)

    def get_global_metrics(self) -> RepairMetrics:
        """Get global repair metrics for analytics"""
        return self._global_metrics

    def get_user_metrics(self, user_id: str) -> Optional[RepairMetrics]:
        """Get repair metrics for a specific user"""
        return self._user_metrics.get(user_id)

    def get_strategy_effectiveness(self) -> Dict[str, float]:
        """Calculate success rate per strategy"""
        effectiveness = {}
        for strategy in self.STRATEGIES:
            usage = self._global_metrics.strategy_usage.get(strategy, 0)
            success = self._global_metrics.strategy_success.get(strategy, 0)
            if usage > 0:
                effectiveness[strategy] = success / usage
            else:
                effectiveness[strategy] = 0.0
        return effectiveness

    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get comprehensive metrics summary for analytics"""
        effectiveness = self.get_strategy_effectiveness()
        return {
            "total_repairs": self._global_metrics.total_repairs,
            "successful_repairs": self._global_metrics.successful_repairs,
            "success_rate": (
                self._global_metrics.successful_repairs / self._global_metrics.total_repairs
                if self._global_metrics.total_repairs > 0
                else 0.0
            ),
            "escalations": self._global_metrics.escalations,
            "escalation_rate": (
                self._global_metrics.escalations / self._global_metrics.total_repairs
                if self._global_metrics.total_repairs > 0
                else 0.0
            ),
            "emotion_triggered_escalations": self._global_metrics.emotion_triggered_escalations,
            "avg_attempts_to_resolve": self._global_metrics.avg_attempts_to_resolve,
            "strategy_usage": self._global_metrics.strategy_usage,
            "strategy_effectiveness": effectiveness,
            "active_sessions": len(self._sessions),
            "tracked_users": len(self._user_metrics),
        }


__all__ = [
    "RepairTracker",
    "RepairSession",
    "RepairMetrics",
]
