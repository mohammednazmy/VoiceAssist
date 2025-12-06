"""
Adaptive Quality Service - Voice Mode v4.1 Phase 3

Dynamically adjusts voice processing quality based on network conditions
and system load to maintain optimal user experience.

Features:
- Real-time network condition monitoring
- Adaptive STT/TTS quality levels
- Graceful degradation strategies
- Load-based feature toggling
- Latency budget management

Reference: docs/voice/phase3-implementation-plan.md

Feature Flag: backend.voice_v4_adaptive_quality
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from app.core.feature_flags import feature_flag_service

logger = logging.getLogger(__name__)


# ==============================================================================
# Quality Levels and Presets
# ==============================================================================


class QualityLevel(str, Enum):
    """Voice processing quality levels."""

    ULTRA = "ultra"  # Maximum quality, higher latency
    HIGH = "high"  # High quality, balanced latency
    MEDIUM = "medium"  # Standard quality, optimized latency
    LOW = "low"  # Reduced quality, minimum latency
    MINIMAL = "minimal"  # Emergency fallback, fastest


class NetworkCondition(str, Enum):
    """Detected network condition."""

    EXCELLENT = "excellent"  # <50ms RTT, >10 Mbps
    GOOD = "good"  # 50-150ms RTT, 2-10 Mbps
    FAIR = "fair"  # 150-300ms RTT, 0.5-2 Mbps
    POOR = "poor"  # 300-500ms RTT, <0.5 Mbps
    CRITICAL = "critical"  # >500ms RTT or frequent drops


class DegradationType(str, Enum):
    """Types of quality degradation."""

    STT_MODEL_DOWNGRADE = "stt_model_downgrade"
    TTS_MODEL_DOWNGRADE = "tts_model_downgrade"
    AUDIO_BITRATE_REDUCE = "audio_bitrate_reduce"
    SAMPLE_RATE_REDUCE = "sample_rate_reduce"
    CONTEXT_LENGTH_REDUCE = "context_length_reduce"
    FEATURE_DISABLE = "feature_disable"
    RESPONSE_TRUNCATE = "response_truncate"
    CACHE_FALLBACK = "cache_fallback"


@dataclass
class QualitySettings:
    """Quality settings for a specific level."""

    level: QualityLevel
    stt_model: str
    tts_model: str
    audio_bitrate_kbps: int
    sample_rate_hz: int
    max_context_tokens: int
    max_response_tokens: int
    enable_speaker_diarization: bool
    enable_sentiment_analysis: bool
    enable_language_detection: bool
    target_latency_ms: int
    description: str


# Quality presets
QUALITY_PRESETS: Dict[QualityLevel, QualitySettings] = {
    QualityLevel.ULTRA: QualitySettings(
        level=QualityLevel.ULTRA,
        stt_model="whisper-large-v3",
        tts_model="eleven_turbo_v2",
        audio_bitrate_kbps=128,
        sample_rate_hz=48000,
        max_context_tokens=8000,
        max_response_tokens=2000,
        enable_speaker_diarization=True,
        enable_sentiment_analysis=True,
        enable_language_detection=True,
        target_latency_ms=800,
        description="Maximum quality for premium experience",
    ),
    QualityLevel.HIGH: QualitySettings(
        level=QualityLevel.HIGH,
        stt_model="whisper-1",
        tts_model="eleven_turbo_v2",
        audio_bitrate_kbps=96,
        sample_rate_hz=24000,
        max_context_tokens=6000,
        max_response_tokens=1500,
        enable_speaker_diarization=True,
        enable_sentiment_analysis=True,
        enable_language_detection=True,
        target_latency_ms=600,
        description="High quality with balanced latency",
    ),
    QualityLevel.MEDIUM: QualitySettings(
        level=QualityLevel.MEDIUM,
        stt_model="whisper-1",
        tts_model="tts-1",
        audio_bitrate_kbps=64,
        sample_rate_hz=16000,
        max_context_tokens=4000,
        max_response_tokens=1000,
        enable_speaker_diarization=False,
        enable_sentiment_analysis=True,
        enable_language_detection=True,
        target_latency_ms=500,
        description="Standard quality optimized for latency",
    ),
    QualityLevel.LOW: QualitySettings(
        level=QualityLevel.LOW,
        stt_model="whisper-1",
        tts_model="tts-1",
        audio_bitrate_kbps=48,
        sample_rate_hz=16000,
        max_context_tokens=2000,
        max_response_tokens=500,
        enable_speaker_diarization=False,
        enable_sentiment_analysis=False,
        enable_language_detection=False,
        target_latency_ms=400,
        description="Reduced quality for poor connections",
    ),
    QualityLevel.MINIMAL: QualitySettings(
        level=QualityLevel.MINIMAL,
        stt_model="whisper-1",
        tts_model="tts-1",
        audio_bitrate_kbps=32,
        sample_rate_hz=8000,
        max_context_tokens=1000,
        max_response_tokens=250,
        enable_speaker_diarization=False,
        enable_sentiment_analysis=False,
        enable_language_detection=False,
        target_latency_ms=300,
        description="Emergency fallback mode",
    ),
}


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class NetworkMetrics:
    """Network performance metrics."""

    rtt_ms: float  # Round-trip time
    bandwidth_kbps: float  # Estimated bandwidth
    packet_loss_pct: float  # Packet loss percentage
    jitter_ms: float  # Jitter
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def condition(self) -> NetworkCondition:
        """Determine network condition from metrics."""
        if self.rtt_ms < 50 and self.packet_loss_pct < 0.1:
            return NetworkCondition.EXCELLENT
        elif self.rtt_ms < 150 and self.packet_loss_pct < 1:
            return NetworkCondition.GOOD
        elif self.rtt_ms < 300 and self.packet_loss_pct < 5:
            return NetworkCondition.FAIR
        elif self.rtt_ms < 500 and self.packet_loss_pct < 10:
            return NetworkCondition.POOR
        else:
            return NetworkCondition.CRITICAL


@dataclass
class LatencyBudget:
    """Latency budget tracking for voice pipeline."""

    total_budget_ms: int
    stt_budget_ms: int
    llm_budget_ms: int
    tts_budget_ms: int
    network_budget_ms: int

    # Actual measurements
    stt_actual_ms: float = 0
    llm_actual_ms: float = 0
    tts_actual_ms: float = 0
    network_actual_ms: float = 0

    @property
    def total_actual_ms(self) -> float:
        return self.stt_actual_ms + self.llm_actual_ms + self.tts_actual_ms + self.network_actual_ms

    @property
    def remaining_ms(self) -> float:
        return self.total_budget_ms - self.total_actual_ms

    @property
    def is_exceeded(self) -> bool:
        return self.total_actual_ms > self.total_budget_ms

    def to_dict(self) -> Dict[str, Any]:
        return {
            "totalBudgetMs": self.total_budget_ms,
            "totalActualMs": round(self.total_actual_ms, 2),
            "remainingMs": round(self.remaining_ms, 2),
            "isExceeded": self.is_exceeded,
            "components": {
                "stt": {"budget": self.stt_budget_ms, "actual": round(self.stt_actual_ms, 2)},
                "llm": {"budget": self.llm_budget_ms, "actual": round(self.llm_actual_ms, 2)},
                "tts": {"budget": self.tts_budget_ms, "actual": round(self.tts_actual_ms, 2)},
                "network": {"budget": self.network_budget_ms, "actual": round(self.network_actual_ms, 2)},
            },
        }


@dataclass
class DegradationEvent:
    """Record of a quality degradation event."""

    degradation_type: DegradationType
    from_level: QualityLevel
    to_level: QualityLevel
    reason: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    session_id: Optional[str] = None


@dataclass
class QualityState:
    """Current quality state for a session."""

    session_id: str
    current_level: QualityLevel
    current_settings: QualitySettings
    network_condition: NetworkCondition
    degradations: List[DegradationEvent] = field(default_factory=list)
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "currentLevel": self.current_level.value,
            "networkCondition": self.network_condition.value,
            "targetLatencyMs": self.current_settings.target_latency_ms,
            "degradationCount": len(self.degradations),
            "lastUpdated": self.last_updated.isoformat(),
        }


# ==============================================================================
# Adaptive Quality Service
# ==============================================================================


class AdaptiveQualityService:
    """
    Service for adaptive voice processing quality management.

    Monitors network conditions and system load to dynamically adjust
    processing quality for optimal user experience.

    Usage:
        service = AdaptiveQualityService()

        # Initialize session with quality state
        state = await service.init_session(session_id, initial_level=QualityLevel.HIGH)

        # Update based on network metrics
        state = await service.update_network_metrics(session_id, metrics)

        # Get current settings for processing
        settings = service.get_current_settings(session_id)

        # Record latency for budget tracking
        service.record_latency(session_id, component="stt", latency_ms=150)
    """

    def __init__(self):
        self._sessions: Dict[str, QualityState] = {}
        self._network_history: Dict[str, List[NetworkMetrics]] = {}
        self._latency_budgets: Dict[str, LatencyBudget] = {}
        self._quality_change_callbacks: List[Callable] = []
        self._lock = asyncio.Lock()
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize the adaptive quality service."""
        if self._initialized:
            return True

        async with self._lock:
            if self._initialized:
                return True

            try:
                # Check feature flag
                if not await feature_flag_service.is_enabled("backend.voice_v4_adaptive_quality"):
                    logger.info("Adaptive quality feature flag is disabled")
                    # Still allow basic operation
                    self._initialized = True
                    return True

                self._initialized = True
                logger.info("Adaptive quality service initialized")
                return True

            except Exception as e:
                logger.error(f"Failed to initialize adaptive quality service: {e}")
                return False

    async def init_session(
        self,
        session_id: str,
        initial_level: QualityLevel = QualityLevel.HIGH,
        user_preference: Optional[QualityLevel] = None,
    ) -> QualityState:
        """
        Initialize quality state for a session.

        Args:
            session_id: Voice session ID
            initial_level: Starting quality level
            user_preference: User's preferred quality level (overrides initial)

        Returns:
            QualityState for the session.
        """
        level = user_preference or initial_level
        settings = QUALITY_PRESETS[level]

        state = QualityState(
            session_id=session_id,
            current_level=level,
            current_settings=settings,
            network_condition=NetworkCondition.GOOD,  # Assume good until measured
        )

        # Create latency budget
        budget = LatencyBudget(
            total_budget_ms=settings.target_latency_ms,
            stt_budget_ms=int(settings.target_latency_ms * 0.25),  # 25% for STT
            llm_budget_ms=int(settings.target_latency_ms * 0.35),  # 35% for LLM
            tts_budget_ms=int(settings.target_latency_ms * 0.25),  # 25% for TTS
            network_budget_ms=int(settings.target_latency_ms * 0.15),  # 15% for network
        )

        async with self._lock:
            self._sessions[session_id] = state
            self._network_history[session_id] = []
            self._latency_budgets[session_id] = budget

        logger.info(
            "Quality session initialized",
            extra={
                "session_id": session_id,
                "level": level.value,
                "target_latency_ms": settings.target_latency_ms,
            },
        )

        return state

    async def update_network_metrics(
        self,
        session_id: str,
        metrics: NetworkMetrics,
    ) -> QualityState:
        """
        Update network metrics and potentially adjust quality.

        Args:
            session_id: Voice session ID
            metrics: Current network metrics

        Returns:
            Updated QualityState.
        """
        state = self._sessions.get(session_id)
        if not state:
            state = await self.init_session(session_id)

        # Add to history
        history = self._network_history.get(session_id, [])
        history.append(metrics)
        if len(history) > 20:
            history = history[-20:]
        self._network_history[session_id] = history

        # Determine if quality adjustment needed
        new_condition = metrics.condition
        old_condition = state.network_condition

        if new_condition != old_condition:
            state.network_condition = new_condition

            # Map network condition to quality level
            condition_to_level = {
                NetworkCondition.EXCELLENT: QualityLevel.ULTRA,
                NetworkCondition.GOOD: QualityLevel.HIGH,
                NetworkCondition.FAIR: QualityLevel.MEDIUM,
                NetworkCondition.POOR: QualityLevel.LOW,
                NetworkCondition.CRITICAL: QualityLevel.MINIMAL,
            }

            target_level = condition_to_level[new_condition]

            # Only downgrade, never upgrade mid-session unless significantly better
            if self._should_change_quality(state.current_level, target_level, history):
                await self._change_quality(state, target_level, f"network_{new_condition.value}")

        state.last_updated = datetime.now(timezone.utc)
        return state

    def _should_change_quality(
        self,
        current: QualityLevel,
        target: QualityLevel,
        history: List[NetworkMetrics],
    ) -> bool:
        """Determine if quality change is warranted."""
        if len(history) < 3:
            return False

        # Get quality level values (lower = better quality)
        levels = list(QualityLevel)
        current_idx = levels.index(current)
        target_idx = levels.index(target)

        # Downgrade more readily than upgrade
        if target_idx > current_idx:  # Downgrade
            # Check if recent metrics consistently poor
            recent = history[-3:]
            poor_count = sum(1 for m in recent if m.condition.value in ["poor", "critical"])
            return poor_count >= 2

        elif target_idx < current_idx:  # Upgrade
            # Require sustained good conditions to upgrade
            recent = history[-5:]
            if len(recent) < 5:
                return False
            good_count = sum(1 for m in recent if m.condition.value in ["excellent", "good"])
            return good_count >= 4

        return False

    async def _change_quality(
        self,
        state: QualityState,
        new_level: QualityLevel,
        reason: str,
    ) -> None:
        """Change quality level and record degradation."""
        old_level = state.current_level
        new_settings = QUALITY_PRESETS[new_level]

        # Record degradation event
        event = DegradationEvent(
            degradation_type=DegradationType.STT_MODEL_DOWNGRADE,  # Primary degradation
            from_level=old_level,
            to_level=new_level,
            reason=reason,
            session_id=state.session_id,
        )
        state.degradations.append(event)

        # Update state
        state.current_level = new_level
        state.current_settings = new_settings
        state.last_updated = datetime.now(timezone.utc)

        # Update latency budget
        budget = LatencyBudget(
            total_budget_ms=new_settings.target_latency_ms,
            stt_budget_ms=int(new_settings.target_latency_ms * 0.25),
            llm_budget_ms=int(new_settings.target_latency_ms * 0.35),
            tts_budget_ms=int(new_settings.target_latency_ms * 0.25),
            network_budget_ms=int(new_settings.target_latency_ms * 0.15),
        )
        self._latency_budgets[state.session_id] = budget

        logger.info(
            "Quality level changed",
            extra={
                "session_id": state.session_id,
                "from_level": old_level.value,
                "to_level": new_level.value,
                "reason": reason,
            },
        )

        # Notify callbacks
        for callback in self._quality_change_callbacks:
            try:
                callback(state, event)
            except Exception as e:
                logger.error(f"Quality change callback error: {e}")

    def record_latency(
        self,
        session_id: str,
        component: str,
        latency_ms: float,
    ) -> Optional[LatencyBudget]:
        """
        Record latency for a pipeline component.

        Args:
            session_id: Voice session ID
            component: Component name ("stt", "llm", "tts", "network")
            latency_ms: Measured latency in milliseconds

        Returns:
            Updated LatencyBudget or None if session not found.
        """
        budget = self._latency_budgets.get(session_id)
        if not budget:
            return None

        if component == "stt":
            budget.stt_actual_ms = latency_ms
        elif component == "llm":
            budget.llm_actual_ms = latency_ms
        elif component == "tts":
            budget.tts_actual_ms = latency_ms
        elif component == "network":
            budget.network_actual_ms = latency_ms

        # Check if budget exceeded and trigger degradation if needed
        if budget.is_exceeded:
            state = self._sessions.get(session_id)
            if state:
                # Find next lower quality level
                levels = list(QualityLevel)
                current_idx = levels.index(state.current_level)
                if current_idx < len(levels) - 1:
                    asyncio.create_task(
                        self._change_quality(
                            state,
                            levels[current_idx + 1],
                            f"latency_budget_exceeded_{component}",
                        )
                    )

        return budget

    def get_current_settings(self, session_id: str) -> Optional[QualitySettings]:
        """Get current quality settings for a session."""
        state = self._sessions.get(session_id)
        if state:
            return state.current_settings
        return None

    def get_quality_state(self, session_id: str) -> Optional[QualityState]:
        """Get current quality state for a session."""
        return self._sessions.get(session_id)

    def get_latency_budget(self, session_id: str) -> Optional[LatencyBudget]:
        """Get latency budget for a session."""
        return self._latency_budgets.get(session_id)

    def on_quality_change(self, callback: Callable[[QualityState, DegradationEvent], None]) -> None:
        """Register callback for quality change events."""
        self._quality_change_callbacks.append(callback)

    async def end_session(self, session_id: str) -> Optional[QualityState]:
        """
        End a quality tracking session.

        Returns:
            Final QualityState with degradation history.
        """
        async with self._lock:
            state = self._sessions.pop(session_id, None)
            self._network_history.pop(session_id, None)
            self._latency_budgets.pop(session_id, None)

            if state:
                logger.info(
                    "Quality session ended",
                    extra={
                        "session_id": session_id,
                        "final_level": state.current_level.value,
                        "degradation_count": len(state.degradations),
                    },
                )

            return state


# ==============================================================================
# Load Testing Utilities
# ==============================================================================


@dataclass
class LoadTestResult:
    """Result of a load test run."""

    test_name: str
    concurrent_sessions: int
    duration_seconds: float
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    degradations_triggered: int
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.successful_requests / self.total_requests * 100

    def to_dict(self) -> Dict[str, Any]:
        return {
            "testName": self.test_name,
            "concurrentSessions": self.concurrent_sessions,
            "durationSeconds": round(self.duration_seconds, 2),
            "totalRequests": self.total_requests,
            "successfulRequests": self.successful_requests,
            "failedRequests": self.failed_requests,
            "successRate": round(self.success_rate, 2),
            "avgLatencyMs": round(self.avg_latency_ms, 2),
            "p50LatencyMs": round(self.p50_latency_ms, 2),
            "p95LatencyMs": round(self.p95_latency_ms, 2),
            "p99LatencyMs": round(self.p99_latency_ms, 2),
            "degradationsTriggered": self.degradations_triggered,
            "timestamp": self.timestamp.isoformat(),
        }


class LoadTestRunner:
    """
    Load testing utility for voice pipeline.

    Simulates concurrent voice sessions to test quality degradation
    and system behavior under load.
    """

    def __init__(self, quality_service: AdaptiveQualityService):
        self.quality_service = quality_service
        self._results: List[LoadTestResult] = []

    async def run_concurrent_session_test(
        self,
        num_sessions: int,
        duration_seconds: int = 60,
        requests_per_second: int = 10,
    ) -> LoadTestResult:
        """
        Run concurrent session load test.

        Args:
            num_sessions: Number of concurrent sessions
            duration_seconds: Test duration
            requests_per_second: Target RPS per session

        Returns:
            LoadTestResult with metrics.
        """
        import random
        import statistics

        latencies: List[float] = []
        successful = 0
        failed = 0
        degradation_count = 0

        start_time = time.monotonic()
        session_ids = []

        # Initialize sessions
        for i in range(num_sessions):
            session_id = f"loadtest-{i}-{int(time.time())}"
            await self.quality_service.init_session(session_id)
            session_ids.append(session_id)

        # Track degradations
        def on_degradation(state: QualityState, event: DegradationEvent):
            nonlocal degradation_count
            degradation_count += 1

        self.quality_service.on_quality_change(on_degradation)

        try:
            while time.monotonic() - start_time < duration_seconds:
                tasks = []

                for session_id in session_ids:
                    # Simulate request with random latency
                    async def simulate_request(sid: str):
                        nonlocal successful, failed, latencies

                        try:
                            # Simulate varying network conditions
                            rtt = random.gauss(100, 50)
                            rtt = max(10, min(800, rtt))

                            metrics = NetworkMetrics(
                                rtt_ms=rtt,
                                bandwidth_kbps=random.gauss(5000, 2000),
                                packet_loss_pct=random.expovariate(5) * 2,
                                jitter_ms=random.gauss(10, 5),
                            )

                            await self.quality_service.update_network_metrics(sid, metrics)

                            # Simulate processing latency
                            processing_time = random.gauss(200, 50)
                            await asyncio.sleep(processing_time / 1000)

                            latencies.append(rtt + processing_time)
                            successful += 1

                        except Exception:
                            failed += 1

                    tasks.append(simulate_request(session_id))

                await asyncio.gather(*tasks)
                await asyncio.sleep(1.0 / requests_per_second)

        finally:
            # Cleanup sessions
            for session_id in session_ids:
                await self.quality_service.end_session(session_id)

        # Calculate results
        duration = time.monotonic() - start_time

        if latencies:
            sorted_latencies = sorted(latencies)
            avg_latency = statistics.mean(latencies)
            p50 = sorted_latencies[int(len(sorted_latencies) * 0.5)]
            p95 = sorted_latencies[int(len(sorted_latencies) * 0.95)]
            p99 = sorted_latencies[int(len(sorted_latencies) * 0.99)]
        else:
            avg_latency = p50 = p95 = p99 = 0

        result = LoadTestResult(
            test_name=f"concurrent_sessions_{num_sessions}",
            concurrent_sessions=num_sessions,
            duration_seconds=duration,
            total_requests=successful + failed,
            successful_requests=successful,
            failed_requests=failed,
            avg_latency_ms=avg_latency,
            p50_latency_ms=p50,
            p95_latency_ms=p95,
            p99_latency_ms=p99,
            degradations_triggered=degradation_count,
        )

        self._results.append(result)
        return result

    async def run_degradation_test(
        self,
        session_id: str,
        simulate_poor_network: bool = True,
    ) -> List[DegradationEvent]:
        """
        Test quality degradation behavior.

        Args:
            session_id: Session to test
            simulate_poor_network: Whether to simulate degrading network

        Returns:
            List of degradation events triggered.
        """
        state = await self.quality_service.init_session(session_id, QualityLevel.HIGH)

        if simulate_poor_network:
            # Gradually degrade network conditions
            conditions = [
                (100, 5000, 0.1),  # Good
                (200, 2000, 2),  # Fair
                (400, 500, 8),  # Poor
                (600, 100, 15),  # Critical
            ]

            for rtt, bw, loss in conditions:
                for _ in range(5):  # Multiple samples per condition
                    metrics = NetworkMetrics(
                        rtt_ms=rtt,
                        bandwidth_kbps=bw,
                        packet_loss_pct=loss,
                        jitter_ms=rtt * 0.1,
                    )
                    await self.quality_service.update_network_metrics(session_id, metrics)
                    await asyncio.sleep(0.1)

        state = self.quality_service.get_quality_state(session_id)
        await self.quality_service.end_session(session_id)

        return state.degradations if state else []


# ==============================================================================
# Singleton Instance
# ==============================================================================

_adaptive_quality_service: Optional[AdaptiveQualityService] = None


def get_adaptive_quality_service() -> AdaptiveQualityService:
    """Get or create adaptive quality service instance."""
    global _adaptive_quality_service
    if _adaptive_quality_service is None:
        _adaptive_quality_service = AdaptiveQualityService()
    return _adaptive_quality_service


def get_load_test_runner() -> LoadTestRunner:
    """Get load test runner instance."""
    return LoadTestRunner(get_adaptive_quality_service())
