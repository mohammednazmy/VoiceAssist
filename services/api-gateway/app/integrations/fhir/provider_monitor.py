"""
Epic Provider Monitor

Monitors Epic FHIR API health and publishes status events:
- Periodic health checks
- Latency tracking
- Error rate monitoring
- Circuit breaker pattern
- Automatic fallback triggers

Integrates with event bus for provider.status events.
"""

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ==============================================================================
# Enums
# ==============================================================================


class ProviderStatus(str, Enum):
    """Provider health status"""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class CircuitState(str, Enum):
    """Circuit breaker state"""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Blocking requests
    HALF_OPEN = "half_open"  # Testing recovery


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class HealthCheckResult:
    """Result of a health check"""

    timestamp: datetime
    latency_ms: float
    success: bool
    status_code: Optional[int] = None
    error: Optional[str] = None


@dataclass
class ProviderMetrics:
    """Aggregated metrics for a provider"""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_latency_ms: float = 0.0
    latency_samples: deque = field(default_factory=lambda: deque(maxlen=100))

    # Phase 6b: Write operation metrics
    write_requests: int = 0
    write_successes: int = 0
    write_failures: int = 0
    write_latency_samples: deque = field(default_factory=lambda: deque(maxlen=100))

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 1.0
        return self.successful_requests / self.total_requests

    @property
    def error_rate(self) -> float:
        return 1.0 - self.success_rate

    @property
    def avg_latency_ms(self) -> float:
        if not self.latency_samples:
            return 0.0
        return sum(self.latency_samples) / len(self.latency_samples)

    @property
    def p95_latency_ms(self) -> float:
        if not self.latency_samples:
            return 0.0
        sorted_samples = sorted(self.latency_samples)
        idx = int(len(sorted_samples) * 0.95)
        return sorted_samples[min(idx, len(sorted_samples) - 1)]

    @property
    def p99_latency_ms(self) -> float:
        if not self.latency_samples:
            return 0.0
        sorted_samples = sorted(self.latency_samples)
        idx = int(len(sorted_samples) * 0.99)
        return sorted_samples[min(idx, len(sorted_samples) - 1)]

    @property
    def write_success_rate(self) -> float:
        if self.write_requests == 0:
            return 1.0
        return self.write_successes / self.write_requests

    @property
    def avg_write_latency_ms(self) -> float:
        if not self.write_latency_samples:
            return 0.0
        return sum(self.write_latency_samples) / len(self.write_latency_samples)

    def record_request(self, latency_ms: float, success: bool) -> None:
        """Record a request"""
        self.total_requests += 1
        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1
        self.total_latency_ms += latency_ms
        self.latency_samples.append(latency_ms)

    def record_write_request(self, latency_ms: float, success: bool) -> None:
        """Record a write operation request"""
        self.write_requests += 1
        if success:
            self.write_successes += 1
        else:
            self.write_failures += 1
        self.write_latency_samples.append(latency_ms)
        # Also record in general metrics
        self.record_request(latency_ms, success)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": self.success_rate,
            "error_rate": self.error_rate,
            "avg_latency_ms": self.avg_latency_ms,
            "p95_latency_ms": self.p95_latency_ms,
            "p99_latency_ms": self.p99_latency_ms,
            # Write operation metrics
            "write_requests": self.write_requests,
            "write_successes": self.write_successes,
            "write_failures": self.write_failures,
            "write_success_rate": self.write_success_rate,
            "avg_write_latency_ms": self.avg_write_latency_ms,
        }


@dataclass
class CircuitBreaker:
    """Circuit breaker for provider protection"""

    # Thresholds
    failure_threshold: int = 5
    success_threshold: int = 3
    open_timeout_seconds: int = 60

    # State
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[datetime] = None
    last_state_change: datetime = field(default_factory=datetime.utcnow)

    def record_success(self) -> None:
        """Record successful request"""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self._transition_to(CircuitState.CLOSED)
        else:
            self.failure_count = 0
            self.success_count = 0

    def record_failure(self) -> None:
        """Record failed request"""
        self.last_failure_time = datetime.utcnow()
        self.failure_count += 1
        self.success_count = 0

        if self.state == CircuitState.HALF_OPEN:
            self._transition_to(CircuitState.OPEN)
        elif self.failure_count >= self.failure_threshold:
            self._transition_to(CircuitState.OPEN)

    def should_allow_request(self) -> bool:
        """Check if request should be allowed"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # Check if enough time has passed
            if self.last_failure_time:
                elapsed = datetime.utcnow() - self.last_failure_time
                if elapsed.total_seconds() >= self.open_timeout_seconds:
                    self._transition_to(CircuitState.HALF_OPEN)
                    return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return True

        return False

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to new state"""
        old_state = self.state
        self.state = new_state
        self.last_state_change = datetime.utcnow()

        if new_state == CircuitState.CLOSED:
            self.failure_count = 0
            self.success_count = 0

        logger.info(f"Circuit breaker: {old_state.value} -> {new_state.value}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_state_change": self.last_state_change.isoformat(),
        }


# ==============================================================================
# Provider Monitor
# ==============================================================================


class EpicProviderMonitor:
    """
    Monitors Epic FHIR API health.

    Provides:
    - Periodic health checks
    - Latency and error tracking
    - Circuit breaker protection
    - Event publishing for status changes
    - Fallback triggering
    """

    def __init__(
        self,
        epic_adapter=None,
        event_bus=None,
        health_check_interval_seconds: int = 30,
        latency_threshold_ms: float = 2000.0,
        error_rate_threshold: float = 0.1,
    ):
        self.epic_adapter = epic_adapter
        self.event_bus = event_bus
        self.health_check_interval = health_check_interval_seconds
        self.latency_threshold_ms = latency_threshold_ms
        self.error_rate_threshold = error_rate_threshold

        self._status = ProviderStatus.UNKNOWN
        self._metrics = ProviderMetrics()
        self._circuit_breaker = CircuitBreaker()
        self._health_check_history: deque = deque(maxlen=100)
        self._monitoring_task: Optional[asyncio.Task] = None
        self._is_monitoring = False
        self._fallback_active = False

        logger.info("EpicProviderMonitor initialized")

    async def start_monitoring(self) -> None:
        """Start background health monitoring"""
        if self._is_monitoring:
            return

        self._is_monitoring = True
        self._monitoring_task = asyncio.create_task(self._monitoring_loop())
        logger.info("Epic health monitoring started")

    async def stop_monitoring(self) -> None:
        """Stop background health monitoring"""
        self._is_monitoring = False
        if self._monitoring_task:
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass
            self._monitoring_task = None
        logger.info("Epic health monitoring stopped")

    async def _monitoring_loop(self) -> None:
        """Background monitoring loop"""
        while self._is_monitoring:
            try:
                await self.check_health()
            except Exception as e:
                logger.error(f"Health check error: {e}")

            await asyncio.sleep(self.health_check_interval)

    async def check_health(self) -> HealthCheckResult:
        """
        Perform health check.

        Returns HealthCheckResult and updates internal state.
        """
        if not self.epic_adapter:
            result = HealthCheckResult(
                timestamp=datetime.utcnow(),
                latency_ms=0,
                success=False,
                error="No adapter configured",
            )
            self._update_status(result)
            return result

        start = time.monotonic()

        try:
            health_data = await self.epic_adapter.check_health()
            latency_ms = (time.monotonic() - start) * 1000

            success = health_data.get("status") == "healthy"
            result = HealthCheckResult(
                timestamp=datetime.utcnow(),
                latency_ms=latency_ms,
                success=success,
                status_code=200 if success else None,
                error=health_data.get("error"),
            )

        except Exception as e:
            latency_ms = (time.monotonic() - start) * 1000
            result = HealthCheckResult(
                timestamp=datetime.utcnow(),
                latency_ms=latency_ms,
                success=False,
                error=str(e),
            )

        self._health_check_history.append(result)
        self._update_status(result)

        return result

    def _update_status(self, result: HealthCheckResult) -> None:
        """Update provider status based on health check"""
        old_status = self._status

        # Update metrics
        self._metrics.record_request(result.latency_ms, result.success)

        # Update circuit breaker
        if result.success:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure()

        # Determine new status
        if self._circuit_breaker.state == CircuitState.OPEN:
            self._status = ProviderStatus.UNHEALTHY
        elif self._metrics.error_rate > self.error_rate_threshold:
            self._status = ProviderStatus.DEGRADED
        elif self._metrics.avg_latency_ms > self.latency_threshold_ms:
            self._status = ProviderStatus.DEGRADED
        elif result.success:
            self._status = ProviderStatus.HEALTHY
        else:
            self._status = ProviderStatus.DEGRADED

        # Publish status change event
        if self._status != old_status:
            asyncio.create_task(self._publish_status_change(old_status))

        # Check if fallback should be activated
        if self._status == ProviderStatus.UNHEALTHY and not self._fallback_active:
            asyncio.create_task(self._activate_fallback())
        elif self._status == ProviderStatus.HEALTHY and self._fallback_active:
            asyncio.create_task(self._deactivate_fallback())

    async def _publish_status_change(self, old_status: ProviderStatus) -> None:
        """Publish provider.status event"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="provider.status",
            data={
                "provider": "epic",
                "old_status": old_status.value,
                "new_status": self._status.value,
                "circuit_state": self._circuit_breaker.state.value,
                "error_rate": self._metrics.error_rate,
                "avg_latency_ms": self._metrics.avg_latency_ms,
            },
            session_id="system",
            source_engine="integration",
        )

        logger.info(f"Epic status changed: {old_status.value} -> {self._status.value}")

    async def _activate_fallback(self) -> None:
        """Activate fallback mode"""
        self._fallback_active = True

        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="degradation.activated",
                data={
                    "provider": "epic",
                    "reason": "provider_unhealthy",
                    "fallback_mode": "cached_context",
                },
                session_id="system",
                source_engine="integration",
            )

        logger.warning("Epic fallback mode activated")

    async def _deactivate_fallback(self) -> None:
        """Deactivate fallback mode"""
        self._fallback_active = False

        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="degradation.recovered",
                data={
                    "provider": "epic",
                    "recovery_status": "healthy",
                },
                session_id="system",
                source_engine="integration",
            )

        logger.info("Epic fallback mode deactivated")

    # =========================================================================
    # Request Gating
    # =========================================================================

    def should_allow_request(self) -> bool:
        """Check if a request should be allowed (circuit breaker)"""
        return self._circuit_breaker.should_allow_request()

    def record_request_result(
        self,
        latency_ms: float,
        success: bool,
    ) -> None:
        """Record a request result for monitoring"""
        self._metrics.record_request(latency_ms, success)

        if success:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure()

    def record_write_result(
        self,
        latency_ms: float,
        success: bool,
        operation_type: str = "write",
    ) -> None:
        """Record a write operation result for monitoring"""
        self._metrics.record_write_request(latency_ms, success)

        if success:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure()

        # Log write operations
        logger.info(
            f"Epic write operation: {operation_type} - " f"{'success' if success else 'failure'} - {latency_ms:.0f}ms"
        )

    # =========================================================================
    # Status Methods
    # =========================================================================

    def get_status(self) -> Dict[str, Any]:
        """Get current provider status"""
        return {
            "status": self._status.value,
            "is_healthy": self._status == ProviderStatus.HEALTHY,
            "is_available": self._status in (ProviderStatus.HEALTHY, ProviderStatus.DEGRADED),
            "fallback_active": self._fallback_active,
            "circuit_breaker": self._circuit_breaker.to_dict(),
            "metrics": self._metrics.to_dict(),
            "recent_health_checks": [
                {
                    "timestamp": h.timestamp.isoformat(),
                    "latency_ms": h.latency_ms,
                    "success": h.success,
                    "error": h.error,
                }
                for h in list(self._health_check_history)[-10:]
            ],
        }

    def is_healthy(self) -> bool:
        """Check if provider is healthy"""
        return self._status == ProviderStatus.HEALTHY

    def is_available(self) -> bool:
        """Check if provider is available (healthy or degraded)"""
        return self._status in (ProviderStatus.HEALTHY, ProviderStatus.DEGRADED)

    def is_fallback_active(self) -> bool:
        """Check if fallback mode is active"""
        return self._fallback_active


# ==============================================================================
# Factory
# ==============================================================================


def create_provider_monitor(
    epic_adapter=None,
    event_bus=None,
) -> EpicProviderMonitor:
    """Create provider monitor with default configuration"""
    return EpicProviderMonitor(
        epic_adapter=epic_adapter,
        event_bus=event_bus,
    )


__all__ = [
    "EpicProviderMonitor",
    "ProviderStatus",
    "CircuitState",
    "HealthCheckResult",
    "ProviderMetrics",
    "CircuitBreaker",
    "create_provider_monitor",
]
