"""
Provider Monitor - External Provider Health Tracking with Automated Failover

Provides:
- Real-time health monitoring of external providers
- Circuit breaker pattern with automatic recovery
- Weighted provider selection for load balancing
- Gradual traffic shifting during failover
- Automatic recovery testing (canary requests)
- Provider priority configuration
"""

import asyncio
import logging
import random
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states"""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Blocking requests
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class ProviderConfig:
    """Configuration for a provider"""

    name: str
    priority: int = 1  # Higher = preferred
    weight: float = 1.0  # For weighted selection
    fallback: Optional[str] = None
    health_check_url: Optional[str] = None
    health_check_interval_s: int = 30
    circuit_breaker_threshold: int = 5
    circuit_recovery_timeout_s: int = 30
    max_latency_ms: float = 2000


@dataclass
class ProviderMetrics:
    """Metrics for a provider"""

    latencies: deque = field(default_factory=lambda: deque(maxlen=100))
    errors: deque = field(default_factory=lambda: deque(maxlen=100))
    last_success: Optional[datetime] = None
    last_error: Optional[datetime] = None
    consecutive_errors: int = 0
    consecutive_successes: int = 0
    total_requests: int = 0
    total_errors: int = 0
    circuit_state: CircuitState = CircuitState.CLOSED
    circuit_opened_at: Optional[datetime] = None
    last_health_check: Optional[datetime] = None
    traffic_weight: float = 1.0  # Current traffic weight (0-1)


class ProviderMonitor:
    """
    External provider health monitoring service with automated failover.

    Monitors:
    - Deepgram (STT)
    - ElevenLabs (TTS)
    - Hume AI (emotion)
    - OpenAI (LLM)
    - Epic FHIR (EHR)

    Features:
    - Circuit breaker with half-open recovery testing
    - Weighted provider selection
    - Gradual traffic shifting during recovery
    - Automatic health check scheduling
    - Fallback chain management
    """

    # Default provider configurations
    DEFAULT_CONFIGS: Dict[str, ProviderConfig] = {
        "deepgram": ProviderConfig(
            name="deepgram",
            priority=1,
            weight=1.0,
            fallback="whisper",
            circuit_breaker_threshold=5,
            max_latency_ms=1000,
        ),
        "whisper": ProviderConfig(
            name="whisper",
            priority=2,
            weight=0.5,
            fallback=None,
            max_latency_ms=3000,
        ),
        "elevenlabs": ProviderConfig(
            name="elevenlabs",
            priority=1,
            weight=1.0,
            fallback="openai_tts",
            circuit_breaker_threshold=3,
            max_latency_ms=500,
        ),
        "openai_tts": ProviderConfig(
            name="openai_tts",
            priority=2,
            weight=0.7,
            fallback="system_tts",
            max_latency_ms=1000,
        ),
        "hume": ProviderConfig(
            name="hume",
            priority=1,
            weight=1.0,
            fallback="prosody_only",
            circuit_breaker_threshold=5,
            max_latency_ms=800,
        ),
        "openai": ProviderConfig(
            name="openai",
            priority=1,
            weight=1.0,
            fallback="anthropic",
            circuit_breaker_threshold=3,
            max_latency_ms=5000,
        ),
        "anthropic": ProviderConfig(
            name="anthropic",
            priority=2,
            weight=0.8,
            fallback=None,
            max_latency_ms=5000,
        ),
        "epic_fhir": ProviderConfig(
            name="epic_fhir",
            priority=1,
            weight=1.0,
            fallback="cached_context",
            circuit_breaker_threshold=3,
            max_latency_ms=2000,
        ),
    }

    # Thresholds for status
    LATENCY_DEGRADED_MS = 500
    LATENCY_DOWN_MS = 2000
    ERROR_RATE_DEGRADED = 0.05
    ERROR_RATE_DOWN = 0.20

    # Traffic shifting configuration
    RECOVERY_TRAFFIC_START = 0.1  # Start with 10% traffic
    RECOVERY_TRAFFIC_INCREMENT = 0.2  # Increase by 20%
    RECOVERY_SUCCESS_THRESHOLD = 5  # Successes needed to increment

    def __init__(
        self,
        event_bus=None,
        configs: Optional[Dict[str, ProviderConfig]] = None,
    ):
        self.event_bus = event_bus
        self._configs = configs or self.DEFAULT_CONFIGS

        self._metrics: Dict[str, ProviderMetrics] = {name: ProviderMetrics() for name in self._configs.keys()}

        self._health_check_task: Optional[asyncio.Task] = None
        self._health_check_handlers: Dict[str, Callable[[], Awaitable[bool]]] = {}
        self._is_running = False

        logger.info(f"ProviderMonitor initialized with {len(self._configs)} providers")

    async def start(self) -> None:
        """Start health check monitoring"""
        if self._is_running:
            return

        self._is_running = True
        self._health_check_task = asyncio.create_task(self._health_check_loop())
        logger.info("ProviderMonitor health checks started")

    async def stop(self) -> None:
        """Stop health check monitoring"""
        self._is_running = False

        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

        logger.info("ProviderMonitor stopped")

    def register_health_check(
        self,
        provider: str,
        handler: Callable[[], Awaitable[bool]],
    ) -> None:
        """Register a health check handler for a provider"""
        self._health_check_handlers[provider] = handler

    async def record_latency(
        self,
        provider: str,
        latency_ms: float,
    ) -> None:
        """Record a latency sample for a provider"""
        if provider not in self._metrics:
            self._metrics[provider] = ProviderMetrics()

        metrics = self._metrics[provider]
        metrics.latencies.append((datetime.utcnow(), latency_ms))
        metrics.last_success = datetime.utcnow()
        metrics.consecutive_errors = 0
        metrics.consecutive_successes += 1
        metrics.total_requests += 1

        # Handle circuit state transitions
        if metrics.circuit_state == CircuitState.HALF_OPEN:
            await self._handle_half_open_success(provider, metrics)
        elif metrics.circuit_state == CircuitState.OPEN:
            await self._check_circuit_recovery(provider)

    async def record_error(
        self,
        provider: str,
        error_type: str,
    ) -> None:
        """Record an error for a provider"""
        if provider not in self._metrics:
            self._metrics[provider] = ProviderMetrics()

        metrics = self._metrics[provider]
        metrics.errors.append((datetime.utcnow(), error_type))
        metrics.last_error = datetime.utcnow()
        metrics.consecutive_errors += 1
        metrics.consecutive_successes = 0
        metrics.total_errors += 1

        # Get provider config
        config = self._configs.get(provider)
        threshold = config.circuit_breaker_threshold if config else 5

        # Handle circuit state transitions
        if metrics.circuit_state == CircuitState.HALF_OPEN:
            # Any error in half-open state reopens circuit
            await self._open_circuit(provider)
        elif metrics.circuit_state == CircuitState.CLOSED:
            # Check circuit breaker threshold
            if metrics.consecutive_errors >= threshold:
                await self._open_circuit(provider)

    async def get_status(self, provider: str) -> Optional["ProviderStatus"]:
        """Get current status of a provider"""
        from . import ProviderStatus

        if provider not in self._metrics:
            return None

        metrics = self._metrics[provider]

        # Calculate P95 latency
        latencies = [l for _, l in metrics.latencies]
        if latencies:
            latencies_sorted = sorted(latencies)
            p95_idx = int(len(latencies_sorted) * 0.95)
            latency_p95 = latencies_sorted[min(p95_idx, len(latencies_sorted) - 1)]
        else:
            latency_p95 = 0.0

        # Calculate error rate
        recent_cutoff = datetime.utcnow() - timedelta(minutes=5)
        recent_errors = sum(1 for t, _ in metrics.errors if t > recent_cutoff)
        recent_requests = sum(1 for t, _ in metrics.latencies if t > recent_cutoff)
        total_recent = recent_requests + recent_errors

        if total_recent > 0:
            error_rate = recent_errors / total_recent
        else:
            error_rate = 0.0

        # Determine status from circuit state
        if metrics.circuit_state == CircuitState.OPEN:
            status = "down"
        elif metrics.circuit_state == CircuitState.HALF_OPEN:
            status = "recovering"
        elif error_rate > self.ERROR_RATE_DOWN or latency_p95 > self.LATENCY_DOWN_MS:
            status = "down"
        elif error_rate > self.ERROR_RATE_DEGRADED or latency_p95 > self.LATENCY_DEGRADED_MS:
            status = "degraded"
        else:
            status = "healthy"

        return ProviderStatus(
            provider=provider,
            status=status,
            latency_p95_ms=latency_p95,
            error_rate=error_rate,
            last_check=datetime.utcnow(),
        )

    # === Provider Selection ===

    async def select_provider(
        self,
        category: str,
        exclude: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Select best available provider for a category.

        Uses weighted selection based on:
        - Circuit state (exclude open circuits)
        - Traffic weight (gradual recovery)
        - Provider priority
        - Current availability score
        """
        exclude = exclude or []

        # Get providers in this category
        category_providers = self._get_category_providers(category)

        # Filter out excluded and unavailable
        available = []
        for name in category_providers:
            if name in exclude:
                continue

            metrics = self._metrics.get(name)
            if not metrics:
                continue

            if metrics.circuit_state == CircuitState.OPEN:
                continue

            config = self._configs.get(name)
            priority = config.priority if config else 1

            # Calculate selection weight
            weight = metrics.traffic_weight
            if metrics.circuit_state == CircuitState.HALF_OPEN:
                weight *= 0.1  # Minimal traffic during recovery

            available.append((name, priority, weight))

        if not available:
            return None

        # Sort by priority (lower = better) then select by weight
        available.sort(key=lambda x: x[1])

        # Use weighted random selection among same-priority providers
        best_priority = available[0][1]
        candidates = [(name, weight) for name, prio, weight in available if prio == best_priority]

        if len(candidates) == 1:
            return candidates[0][0]

        # Weighted random selection
        total_weight = sum(w for _, w in candidates)
        if total_weight <= 0:
            return candidates[0][0]

        r = random.random() * total_weight  # nosec B311 - non-cryptographic load balancing
        cumulative = 0
        for name, weight in candidates:
            cumulative += weight
            if r <= cumulative:
                return name

        return candidates[0][0]

    def _get_category_providers(self, category: str) -> List[str]:
        """Get providers for a category"""
        categories = {
            "stt": ["deepgram", "whisper"],
            "tts": ["elevenlabs", "openai_tts", "system_tts"],
            "emotion": ["hume", "prosody_only"],
            "llm": ["openai", "anthropic"],
            "ehr": ["epic_fhir", "cached_context"],
        }
        return categories.get(category, [])

    async def get_fallback_chain(self, provider: str) -> List[str]:
        """Get ordered list of fallback providers"""
        chain = [provider]
        current = provider

        while current:
            config = self._configs.get(current)
            if not config or not config.fallback:
                break

            fallback = config.fallback
            if fallback in chain:  # Avoid cycles
                break

            chain.append(fallback)
            current = fallback

        return chain

    async def get_next_fallback(self, provider: str) -> Optional[str]:
        """Get next available fallback for a provider"""
        config = self._configs.get(provider)
        if not config or not config.fallback:
            return None

        fallback = config.fallback
        metrics = self._metrics.get(fallback)

        # Check if fallback is available
        if metrics and metrics.circuit_state != CircuitState.OPEN:
            return fallback

        # Recurse to next fallback
        return await self.get_next_fallback(fallback)

    async def get_all_statuses(self) -> Dict[str, "ProviderStatus"]:
        """Get status of all providers"""
        statuses = {}
        for provider in self._configs.keys():
            status = await self.get_status(provider)
            if status:
                statuses[provider] = status
        return statuses

    # === Circuit Breaker ===

    async def _open_circuit(self, provider: str) -> None:
        """Open circuit breaker for provider"""
        metrics = self._metrics.get(provider)
        if not metrics:
            return

        if metrics.circuit_state == CircuitState.OPEN:
            return  # Already open

        metrics.circuit_state = CircuitState.OPEN
        metrics.circuit_opened_at = datetime.utcnow()
        metrics.traffic_weight = 0.0

        logger.warning(f"Circuit opened for provider: {provider}")

        # Get fallback
        config = self._configs.get(provider)
        fallback = config.fallback if config else None

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="provider.status",
                data={
                    "provider": provider,
                    "status": "down",
                    "reason": "circuit_breaker_open",
                    "fallback": fallback,
                },
                session_id="system",
                source_engine="analytics",
            )

            await self.event_bus.publish_event(
                event_type="degradation.activated",
                data={
                    "component": provider,
                    "fallback": fallback,
                },
                session_id="system",
                source_engine="analytics",
            )

    async def _check_circuit_recovery(self, provider: str) -> None:
        """Check if circuit should transition to half-open for recovery testing"""
        metrics = self._metrics.get(provider)
        if not metrics or metrics.circuit_state != CircuitState.OPEN:
            return

        config = self._configs.get(provider)
        timeout = config.circuit_recovery_timeout_s if config else 30

        # Check if recovery timeout has passed
        if metrics.circuit_opened_at:
            elapsed = (datetime.utcnow() - metrics.circuit_opened_at).total_seconds()
            if elapsed >= timeout:
                await self._enter_half_open(provider)

    async def _enter_half_open(self, provider: str) -> None:
        """Enter half-open state for recovery testing"""
        metrics = self._metrics.get(provider)
        if not metrics:
            return

        metrics.circuit_state = CircuitState.HALF_OPEN
        metrics.consecutive_successes = 0
        metrics.traffic_weight = self.RECOVERY_TRAFFIC_START

        logger.info(f"Circuit entering half-open state for: {provider}")

        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="provider.status",
                data={
                    "provider": provider,
                    "status": "recovering",
                    "traffic_weight": metrics.traffic_weight,
                },
                session_id="system",
                source_engine="analytics",
            )

    async def _handle_half_open_success(
        self,
        provider: str,
        metrics: ProviderMetrics,
    ) -> None:
        """Handle successful request in half-open state"""
        if metrics.consecutive_successes >= self.RECOVERY_SUCCESS_THRESHOLD:
            # Increase traffic weight
            new_weight = min(1.0, metrics.traffic_weight + self.RECOVERY_TRAFFIC_INCREMENT)

            if new_weight >= 1.0:
                # Fully recovered - close circuit
                await self._close_circuit(provider)
            else:
                metrics.traffic_weight = new_weight
                metrics.consecutive_successes = 0

                logger.info(f"Increasing traffic for {provider} to {new_weight:.0%}")

    async def _close_circuit(self, provider: str) -> None:
        """Close circuit breaker - full recovery"""
        metrics = self._metrics.get(provider)
        if not metrics:
            return

        metrics.circuit_state = CircuitState.CLOSED
        metrics.circuit_opened_at = None
        metrics.traffic_weight = 1.0
        metrics.consecutive_errors = 0

        logger.info(f"Circuit closed for provider: {provider}")

        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="provider.status",
                data={
                    "provider": provider,
                    "status": "healthy",
                    "reason": "circuit_breaker_closed",
                },
                session_id="system",
                source_engine="analytics",
            )

            await self.event_bus.publish_event(
                event_type="degradation.recovered",
                data={"component": provider},
                session_id="system",
                source_engine="analytics",
            )

    # === Health Checks ===

    async def _health_check_loop(self) -> None:
        """Background loop for health checks"""
        while self._is_running:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds

                for provider in self._configs.keys():
                    await self._perform_health_check(provider)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check loop error: {e}")

    async def _perform_health_check(self, provider: str) -> None:
        """Perform health check for a provider"""
        metrics = self._metrics.get(provider)
        config = self._configs.get(provider)

        if not metrics or not config:
            return

        # Check if health check is due
        interval = config.health_check_interval_s
        if metrics.last_health_check:
            elapsed = (datetime.utcnow() - metrics.last_health_check).total_seconds()
            if elapsed < interval:
                return

        metrics.last_health_check = datetime.utcnow()

        # Use registered handler if available
        handler = self._health_check_handlers.get(provider)
        if handler:
            try:
                is_healthy = await handler()
                if is_healthy:
                    # Simulate successful latency
                    await self.record_latency(provider, 100)
                else:
                    await self.record_error(provider, "health_check_failed")
            except Exception as e:
                await self.record_error(provider, f"health_check_error: {e}")
        else:
            # Check if circuit needs recovery testing
            if metrics.circuit_state == CircuitState.OPEN:
                await self._check_circuit_recovery(provider)

    async def check_health(self, provider: str) -> "ProviderStatus":
        """Perform active health check and return status"""
        await self._perform_health_check(provider)
        return await self.get_status(provider)

    # === Metrics ===

    def get_availability_score(self, provider: str) -> float:
        """Get provider availability score (0-1)"""
        metrics = self._metrics.get(provider)
        if not metrics:
            return 1.0

        if metrics.circuit_state == CircuitState.OPEN:
            return 0.0

        if metrics.circuit_state == CircuitState.HALF_OPEN:
            return metrics.traffic_weight

        # Calculate based on recent history
        recent_cutoff = datetime.utcnow() - timedelta(minutes=5)
        recent_errors = sum(1 for t, _ in metrics.errors if t > recent_cutoff)
        recent_successes = sum(1 for t, _ in metrics.latencies if t > recent_cutoff)
        total = recent_successes + recent_errors

        if total == 0:
            return 1.0

        return recent_successes / total

    def get_stats(self) -> Dict[str, Any]:
        """Get provider monitor statistics"""
        stats = {}
        for name, metrics in self._metrics.items():
            stats[name] = {
                "circuit_state": metrics.circuit_state.value,
                "traffic_weight": metrics.traffic_weight,
                "total_requests": metrics.total_requests,
                "total_errors": metrics.total_errors,
                "consecutive_errors": metrics.consecutive_errors,
                "availability": self.get_availability_score(name),
            }
        return stats


__all__ = [
    "ProviderMonitor",
    "ProviderMetrics",
    "ProviderConfig",
    "CircuitState",
]
