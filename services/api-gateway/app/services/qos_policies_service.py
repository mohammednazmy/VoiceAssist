"""
Quality of Service (QoS) Policies Service for Voice Mode v4

Phase 3 Deliverable: Observability > QoS Policies

Provides:
- Latency budgets and enforcement
- Priority-based traffic management
- Graceful degradation policies
- SLO tracking and alerting
- Resource quotas per user/session

Reference: ~/.claude/plans/noble-bubbling-trinket.md (Phase 3)
"""

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class Priority(Enum):
    """Request priority levels."""

    CRITICAL = 1  # Health checks, admin operations
    HIGH = 2  # Real-time voice
    NORMAL = 3  # Standard requests
    LOW = 4  # Background tasks, analytics
    BEST_EFFORT = 5  # Non-essential, can be dropped


class DegradationAction(Enum):
    """Actions to take when QoS thresholds are exceeded."""

    NONE = "none"
    REDUCE_QUALITY = "reduce_quality"
    SKIP_FEATURES = "skip_features"
    USE_CACHE = "use_cache"
    QUEUE = "queue"
    REJECT = "reject"
    FALLBACK = "fallback"


@dataclass
class LatencyBudget:
    """Latency budget configuration for voice pipeline stages."""

    stt_budget_ms: int = 200
    llm_budget_ms: int = 300
    tts_budget_ms: int = 150
    network_buffer_ms: int = 50
    total_budget_ms: int = 700

    @property
    def processing_budget_ms(self) -> int:
        """Total processing budget (excluding network)."""
        return self.stt_budget_ms + self.llm_budget_ms + self.tts_budget_ms

    def is_within_budget(
        self,
        stt_actual_ms: int,
        llm_actual_ms: int,
        tts_actual_ms: int,
    ) -> bool:
        """Check if actual latencies are within budget."""
        total = stt_actual_ms + llm_actual_ms + tts_actual_ms
        return total <= self.total_budget_ms


@dataclass
class SLOTarget:
    """Service Level Objective target."""

    name: str
    metric: str
    threshold: float
    percentile: int = 95  # P95 by default
    window_minutes: int = 5
    alert_threshold: float = 0.9  # Alert when below 90% of target


@dataclass
class QoSConfig:
    """QoS configuration."""

    # Latency budgets
    default_latency_budget: LatencyBudget = field(default_factory=LatencyBudget)

    # Rate limits
    max_requests_per_minute: int = 60
    max_concurrent_voice_sessions: int = 10

    # Queue settings
    max_queue_size: int = 100
    queue_timeout_seconds: int = 30

    # Degradation thresholds
    high_load_threshold: float = 0.8  # 80% capacity
    critical_load_threshold: float = 0.95  # 95% capacity

    # SLO targets
    slo_targets: List[SLOTarget] = field(
        default_factory=lambda: [
            SLOTarget(
                name="voice_e2e_latency",
                metric="voice_e2e_latency_ms",
                threshold=500,
                percentile=95,
            ),
            SLOTarget(
                name="stt_latency",
                metric="stt_latency_ms",
                threshold=200,
                percentile=95,
            ),
            SLOTarget(
                name="tts_latency",
                metric="tts_latency_ms",
                threshold=150,
                percentile=95,
            ),
            SLOTarget(
                name="availability",
                metric="success_rate",
                threshold=99.5,
                percentile=100,
            ),
        ]
    )


@dataclass
class QoSMetrics:
    """Real-time QoS metrics."""

    current_load: float = 0.0
    active_sessions: int = 0
    queued_requests: int = 0
    requests_per_minute: float = 0.0
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    error_rate: float = 0.0
    slo_compliance: Dict[str, float] = field(default_factory=dict)
    degradation_level: DegradationAction = DegradationAction.NONE


@dataclass
class RequestContext:
    """Context for a QoS-managed request."""

    request_id: str
    session_id: Optional[str]
    user_id: Optional[str]
    priority: Priority
    started_at: datetime
    deadline: Optional[datetime] = None
    budget: Optional[LatencyBudget] = None


class QoSPoliciesService:
    """
    Quality of Service management for voice pipeline.

    Implements:
    - Latency budget enforcement
    - Priority-based scheduling
    - Graceful degradation
    - SLO monitoring
    - Resource quotas
    """

    def __init__(self, config: Optional[QoSConfig] = None):
        self.config = config or QoSConfig()
        self._initialized = False

        # Metrics storage
        self._latency_samples: List[Tuple[datetime, float]] = []
        self._error_samples: List[Tuple[datetime, bool]] = []
        self._request_counts: Dict[str, int] = defaultdict(int)

        # Session tracking
        self._active_sessions: Dict[str, RequestContext] = {}
        self._request_queue: asyncio.Queue = asyncio.Queue(maxsize=self.config.max_queue_size)

        # Rate limiting
        self._rate_limit_windows: Dict[str, List[datetime]] = defaultdict(list)

        # Degradation state
        self._current_degradation = DegradationAction.NONE

        # Callbacks
        self._on_slo_breach: Optional[Callable[[SLOTarget, float], None]] = None
        self._on_degradation_change: Optional[Callable[[DegradationAction, DegradationAction], None]] = None

    async def initialize(self) -> None:
        """Initialize the QoS service."""
        if self._initialized:
            return

        logger.info(
            "Initializing QoSPoliciesService",
            extra={
                "max_concurrent_sessions": self.config.max_concurrent_voice_sessions,
                "default_budget_ms": self.config.default_latency_budget.total_budget_ms,
            },
        )

        # Start background tasks
        asyncio.create_task(self._metrics_cleanup_loop())
        asyncio.create_task(self._slo_monitor_loop())

        self._initialized = True

    async def acquire_slot(
        self,
        request_id: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        priority: Priority = Priority.NORMAL,
        timeout_seconds: Optional[float] = None,
    ) -> Tuple[bool, Optional[RequestContext]]:
        """
        Acquire a processing slot for a voice request.

        Returns:
            Tuple of (success, context) - context is None if rejected
        """
        # Check rate limits
        if user_id and not self._check_rate_limit(user_id):
            logger.warning(f"Rate limit exceeded for user {user_id}")
            return False, None

        # Check concurrent session limit
        if len(self._active_sessions) >= self.config.max_concurrent_voice_sessions:
            # High priority can preempt lower priority
            if priority.value <= Priority.HIGH.value:
                preempted = self._try_preempt_low_priority()
                if not preempted:
                    return False, None
            else:
                return False, None

        # Create request context
        timeout = timeout_seconds or self.config.queue_timeout_seconds
        deadline = datetime.now(timezone.utc) + timedelta(seconds=timeout)

        context = RequestContext(
            request_id=request_id,
            session_id=session_id,
            user_id=user_id,
            priority=priority,
            started_at=datetime.now(timezone.utc),
            deadline=deadline,
            budget=self._get_budget_for_priority(priority),
        )

        self._active_sessions[request_id] = context
        self._request_counts[user_id or "anonymous"] += 1

        logger.debug(
            f"Acquired slot for request {request_id}",
            extra={
                "priority": priority.name,
                "active_sessions": len(self._active_sessions),
            },
        )

        return True, context

    def release_slot(
        self,
        request_id: str,
        latency_ms: float,
        success: bool = True,
    ) -> None:
        """Release a processing slot and record metrics."""
        if request_id not in self._active_sessions:
            return

        context = self._active_sessions.pop(request_id)

        # Record metrics
        now = datetime.now(timezone.utc)
        self._latency_samples.append((now, latency_ms))
        self._error_samples.append((now, not success))

        # Check if latency exceeded budget
        if context.budget and latency_ms > context.budget.total_budget_ms:
            logger.warning(
                f"Request {request_id} exceeded latency budget",
                extra={
                    "actual_ms": latency_ms,
                    "budget_ms": context.budget.total_budget_ms,
                },
            )

        # Update degradation level
        self._update_degradation_level()

    def get_current_metrics(self) -> QoSMetrics:
        """Get current QoS metrics."""
        now = datetime.now(timezone.utc)
        window = now - timedelta(minutes=5)

        # Filter recent samples
        recent_latencies = [lat for ts, lat in self._latency_samples if ts > window]

        recent_errors = [err for ts, err in self._error_samples if ts > window]

        # Calculate metrics
        avg_latency = sum(recent_latencies) / len(recent_latencies) if recent_latencies else 0
        p95_latency = self._calculate_percentile(recent_latencies, 95)
        p99_latency = self._calculate_percentile(recent_latencies, 99)
        error_rate = sum(recent_errors) / len(recent_errors) * 100 if recent_errors else 0

        # Calculate SLO compliance
        slo_compliance = {}
        for slo in self.config.slo_targets:
            compliance = self._calculate_slo_compliance(slo, recent_latencies)
            slo_compliance[slo.name] = compliance

        return QoSMetrics(
            current_load=len(self._active_sessions) / self.config.max_concurrent_voice_sessions,
            active_sessions=len(self._active_sessions),
            queued_requests=self._request_queue.qsize(),
            requests_per_minute=len(recent_latencies) / 5,  # 5-minute window
            avg_latency_ms=avg_latency,
            p95_latency_ms=p95_latency,
            p99_latency_ms=p99_latency,
            error_rate=error_rate,
            slo_compliance=slo_compliance,
            degradation_level=self._current_degradation,
        )

    def get_degradation_action(self) -> DegradationAction:
        """Get the current recommended degradation action."""
        return self._current_degradation

    def should_degrade(self, feature: str) -> bool:
        """Check if a specific feature should be degraded."""
        if self._current_degradation == DegradationAction.NONE:
            return False

        # Define which features are affected by each degradation level
        degradation_map = {
            DegradationAction.REDUCE_QUALITY: ["high_quality_tts", "parallel_stt"],
            DegradationAction.SKIP_FEATURES: ["translation", "code_switching", "thinking_tones"],
            DegradationAction.USE_CACHE: ["tts", "pronunciation"],
            DegradationAction.FALLBACK: ["cloud_stt", "cloud_tts"],
        }

        affected = degradation_map.get(self._current_degradation, [])
        return feature in affected

    def get_adjusted_budget(
        self,
        base_budget: LatencyBudget,
        priority: Priority,
    ) -> LatencyBudget:
        """Get adjusted latency budget based on current load and priority."""
        metrics = self.get_current_metrics()

        # High priority gets full budget
        if priority.value <= Priority.HIGH.value:
            return base_budget

        # Reduce budget under high load
        if metrics.current_load > self.config.high_load_threshold:
            factor = 0.8  # 20% reduction
            return LatencyBudget(
                stt_budget_ms=int(base_budget.stt_budget_ms * factor),
                llm_budget_ms=int(base_budget.llm_budget_ms * factor),
                tts_budget_ms=int(base_budget.tts_budget_ms * factor),
                total_budget_ms=int(base_budget.total_budget_ms * factor),
            )

        return base_budget

    def _check_rate_limit(self, user_id: str) -> bool:
        """Check if user is within rate limit."""
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=1)

        # Clean old entries
        self._rate_limit_windows[user_id] = [ts for ts in self._rate_limit_windows[user_id] if ts > window_start]

        # Check limit
        if len(self._rate_limit_windows[user_id]) >= self.config.max_requests_per_minute:
            return False

        # Record request
        self._rate_limit_windows[user_id].append(now)
        return True

    def _try_preempt_low_priority(self) -> bool:
        """Try to preempt a low priority request."""
        for request_id, context in list(self._active_sessions.items()):
            if context.priority.value >= Priority.LOW.value:
                logger.info(f"Preempting low priority request {request_id}")
                del self._active_sessions[request_id]
                return True
        return False

    def _get_budget_for_priority(self, priority: Priority) -> LatencyBudget:
        """Get latency budget based on priority."""
        base = self.config.default_latency_budget

        if priority == Priority.CRITICAL:
            # Critical gets unlimited budget
            return LatencyBudget(
                stt_budget_ms=base.stt_budget_ms * 2,
                llm_budget_ms=base.llm_budget_ms * 2,
                tts_budget_ms=base.tts_budget_ms * 2,
                total_budget_ms=base.total_budget_ms * 2,
            )
        elif priority == Priority.HIGH:
            return base
        elif priority == Priority.LOW:
            # Low priority gets reduced budget
            return LatencyBudget(
                stt_budget_ms=int(base.stt_budget_ms * 1.5),
                llm_budget_ms=int(base.llm_budget_ms * 1.5),
                tts_budget_ms=int(base.tts_budget_ms * 1.5),
                total_budget_ms=int(base.total_budget_ms * 1.5),
            )

        return base

    def _calculate_percentile(self, values: List[float], percentile: int) -> float:
        """Calculate percentile of a list of values."""
        if not values:
            return 0.0

        sorted_values = sorted(values)
        index = int(len(sorted_values) * percentile / 100)
        index = min(index, len(sorted_values) - 1)
        return sorted_values[index]

    def _calculate_slo_compliance(
        self,
        slo: SLOTarget,
        latencies: List[float],
    ) -> float:
        """Calculate SLO compliance percentage."""
        if not latencies:
            return 100.0

        if "latency" in slo.metric:
            percentile_value = self._calculate_percentile(latencies, slo.percentile)
            return 100.0 if percentile_value <= slo.threshold else (slo.threshold / percentile_value) * 100
        elif slo.metric == "success_rate":
            success_count = sum(1 for _, err in self._error_samples[-1000:] if not err)
            total = min(len(self._error_samples), 1000)
            return (success_count / total * 100) if total > 0 else 100.0

        return 100.0

    def _update_degradation_level(self) -> None:
        """Update degradation level based on current metrics."""
        metrics = self.get_current_metrics()
        old_level = self._current_degradation

        if metrics.current_load > self.config.critical_load_threshold:
            new_level = DegradationAction.FALLBACK
        elif metrics.current_load > self.config.high_load_threshold:
            new_level = DegradationAction.SKIP_FEATURES
        elif metrics.p95_latency_ms > self.config.default_latency_budget.total_budget_ms * 1.5:
            new_level = DegradationAction.REDUCE_QUALITY
        else:
            new_level = DegradationAction.NONE

        if new_level != old_level:
            self._current_degradation = new_level
            logger.info(f"Degradation level changed: {old_level.value} -> {new_level.value}")
            if self._on_degradation_change:
                self._on_degradation_change(old_level, new_level)

    async def _metrics_cleanup_loop(self) -> None:
        """Background task to clean up old metrics."""
        while True:
            await asyncio.sleep(60)  # Every minute

            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=1)

            # Clean latency samples
            self._latency_samples = [(ts, lat) for ts, lat in self._latency_samples if ts > cutoff]

            # Clean error samples
            self._error_samples = [(ts, err) for ts, err in self._error_samples if ts > cutoff]

    async def _slo_monitor_loop(self) -> None:
        """Background task to monitor SLO compliance."""
        while True:
            await asyncio.sleep(30)  # Every 30 seconds

            for slo in self.config.slo_targets:
                recent_latencies = [
                    lat
                    for ts, lat in self._latency_samples
                    if ts > datetime.now(timezone.utc) - timedelta(minutes=slo.window_minutes)
                ]

                compliance = self._calculate_slo_compliance(slo, recent_latencies)

                if compliance < slo.alert_threshold * 100:
                    logger.warning(
                        f"SLO breach: {slo.name}",
                        extra={
                            "compliance": compliance,
                            "threshold": slo.threshold,
                            "percentile": slo.percentile,
                        },
                    )
                    if self._on_slo_breach:
                        self._on_slo_breach(slo, compliance)


# Singleton instance
_qos_service: Optional[QoSPoliciesService] = None


def get_qos_service() -> QoSPoliciesService:
    """Get the singleton QoS service instance."""
    global _qos_service
    if _qos_service is None:
        _qos_service = QoSPoliciesService()
    return _qos_service
