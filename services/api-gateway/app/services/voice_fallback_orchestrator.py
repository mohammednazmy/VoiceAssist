"""
Voice Fallback Orchestrator - Graceful Degradation for Voice Pipeline

Voice Mode v4 - Phase 1 Foundation

Provides automatic failover and graceful degradation for voice services:
- STT fallback chain (Deepgram -> Local Whisper -> Degraded mode)
- TTS fallback chain (ElevenLabs -> OpenAI -> Browser TTS)
- LLM fallback chain (GPT-4o -> GPT-4 -> GPT-3.5)
- Health monitoring and circuit breakers
- Automatic recovery with exponential backoff

Ensures voice mode remains functional even during provider outages.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, Generic, List, Optional, Tuple, TypeVar

logger = logging.getLogger(__name__)


class ServiceType(Enum):
    """Voice service types."""

    STT = "stt"  # Speech-to-Text
    TTS = "tts"  # Text-to-Speech
    LLM = "llm"  # Language Model
    VAD = "vad"  # Voice Activity Detection
    TRANSLATION = "translation"


class ServiceHealth(Enum):
    """Service health status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class CircuitState(Enum):
    """Circuit breaker state."""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, not attempting calls
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class ProviderConfig:
    """Configuration for a voice provider."""

    name: str
    service_type: ServiceType
    priority: int  # Lower = higher priority
    enabled: bool = True
    timeout_seconds: float = 10.0
    max_retries: int = 2
    health_check_interval_seconds: float = 30.0

    # Circuit breaker settings
    failure_threshold: int = 5
    recovery_timeout_seconds: float = 60.0
    half_open_max_calls: int = 3


@dataclass
class ProviderState:
    """Runtime state for a provider."""

    config: ProviderConfig
    health: ServiceHealth = ServiceHealth.UNKNOWN
    circuit_state: CircuitState = CircuitState.CLOSED
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    last_failure_time: Optional[datetime] = None
    last_success_time: Optional[datetime] = None
    last_health_check: Optional[datetime] = None
    total_calls: int = 0
    total_failures: int = 0
    avg_latency_ms: float = 0.0
    half_open_calls: int = 0


@dataclass
class FallbackResult:
    """Result of a fallback operation."""

    success: bool
    provider_used: str
    providers_tried: List[str]
    result: Any
    latency_ms: float
    fallback_activated: bool
    error: Optional[str] = None


@dataclass
class OrchestratorConfig:
    """Configuration for the fallback orchestrator."""

    # Health monitoring
    enable_health_checks: bool = True
    health_check_interval_seconds: float = 30.0

    # Fallback behavior
    enable_automatic_fallback: bool = True
    max_fallback_attempts: int = 3

    # Recovery
    enable_automatic_recovery: bool = True
    recovery_check_interval_seconds: float = 60.0

    # Logging
    log_fallback_events: bool = True
    log_health_transitions: bool = True

    # Degraded mode
    enable_degraded_mode: bool = True
    degraded_mode_timeout_seconds: float = 300.0


@dataclass
class OrchestratorMetrics:
    """Metrics for the fallback orchestrator."""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    fallback_activations: int = 0
    circuit_opens: int = 0
    circuit_closes: int = 0
    recovery_attempts: int = 0
    successful_recoveries: int = 0
    provider_switches: int = 0
    degraded_mode_activations: int = 0


T = TypeVar("T")


class VoiceFallbackOrchestrator:
    """
    Orchestrates fallback behavior across voice services.

    Manages provider health, circuit breakers, and automatic failover
    to ensure continuous voice operation.
    """

    def __init__(self, config: Optional[OrchestratorConfig] = None):
        self.config = config or OrchestratorConfig()
        self._initialized = False
        self._metrics = OrchestratorMetrics()

        # Provider registry
        self._providers: Dict[ServiceType, List[ProviderState]] = {service_type: [] for service_type in ServiceType}

        # Provider handlers
        self._handlers: Dict[str, Callable] = {}

        # Health check task
        self._health_check_task: Optional[asyncio.Task] = None

        # Recovery task
        self._recovery_task: Optional[asyncio.Task] = None

        # Callbacks
        self._on_fallback: Optional[Callable[[str, str, str], None]] = None
        self._on_health_change: Optional[Callable[[str, ServiceHealth, ServiceHealth], None]] = None

    async def initialize(self) -> None:
        """Initialize the orchestrator."""
        if self._initialized:
            return

        logger.info("Initializing VoiceFallbackOrchestrator")

        # Register default providers
        await self._register_default_providers()

        # Start health checks
        if self.config.enable_health_checks:
            self._health_check_task = asyncio.create_task(self._health_check_loop())

        # Start recovery checks
        if self.config.enable_automatic_recovery:
            self._recovery_task = asyncio.create_task(self._recovery_check_loop())

        self._initialized = True

    async def _register_default_providers(self) -> None:
        """Register default voice providers."""
        # STT providers
        self.register_provider(
            ProviderConfig(
                name="deepgram",
                service_type=ServiceType.STT,
                priority=1,
                timeout_seconds=10.0,
            )
        )
        self.register_provider(
            ProviderConfig(
                name="whisper_local",
                service_type=ServiceType.STT,
                priority=2,
                timeout_seconds=30.0,  # Local can be slower
            )
        )
        self.register_provider(
            ProviderConfig(
                name="browser_stt",
                service_type=ServiceType.STT,
                priority=3,
                enabled=True,  # Last resort
            )
        )

        # TTS providers
        self.register_provider(
            ProviderConfig(
                name="elevenlabs",
                service_type=ServiceType.TTS,
                priority=1,
                timeout_seconds=15.0,
            )
        )
        self.register_provider(
            ProviderConfig(
                name="openai_tts",
                service_type=ServiceType.TTS,
                priority=2,
                timeout_seconds=10.0,
            )
        )
        self.register_provider(
            ProviderConfig(
                name="browser_tts",
                service_type=ServiceType.TTS,
                priority=3,
                enabled=True,  # Last resort
            )
        )

        # LLM providers
        self.register_provider(
            ProviderConfig(
                name="gpt-4o",
                service_type=ServiceType.LLM,
                priority=1,
                timeout_seconds=30.0,
            )
        )
        self.register_provider(
            ProviderConfig(
                name="gpt-4",
                service_type=ServiceType.LLM,
                priority=2,
                timeout_seconds=45.0,
            )
        )
        self.register_provider(
            ProviderConfig(
                name="gpt-3.5-turbo",
                service_type=ServiceType.LLM,
                priority=3,
                timeout_seconds=20.0,
            )
        )

    def register_provider(self, config: ProviderConfig) -> None:
        """Register a new provider."""
        state = ProviderState(config=config)
        self._providers[config.service_type].append(state)

        # Sort by priority
        self._providers[config.service_type].sort(key=lambda p: p.config.priority)

        logger.debug(f"Registered provider {config.name} for {config.service_type.value}")

    def register_handler(self, provider_name: str, handler: Callable[..., Any]) -> None:
        """
        Register a handler function for a provider.

        Args:
            provider_name: Name of the provider
            handler: Async callable that handles requests
        """
        self._handlers[provider_name] = handler

    async def execute_with_fallback(
        self, service_type: ServiceType, *args, preferred_provider: Optional[str] = None, **kwargs
    ) -> FallbackResult:
        """
        Execute a service call with automatic fallback.

        Args:
            service_type: Type of service to call
            *args: Arguments to pass to handler
            preferred_provider: Optional preferred provider name
            **kwargs: Keyword arguments to pass to handler

        Returns:
            FallbackResult with operation outcome
        """
        if not self._initialized:
            await self.initialize()

        start_time = time.time()
        self._metrics.total_requests += 1
        providers_tried = []
        fallback_activated = False

        # Get available providers
        available = self._get_available_providers(service_type, preferred_provider)

        if not available:
            self._metrics.failed_requests += 1
            return FallbackResult(
                success=False,
                provider_used="none",
                providers_tried=[],
                result=None,
                latency_ms=0,
                fallback_activated=False,
                error="No available providers",
            )

        for provider_state in available:
            provider_name = provider_state.config.name
            providers_tried.append(provider_name)

            # Check circuit breaker
            if not self._can_call_provider(provider_state):
                logger.debug(f"Circuit open for {provider_name}, skipping")
                continue

            try:
                # Get handler
                handler = self._handlers.get(provider_name)
                if not handler:
                    logger.warning(f"No handler registered for {provider_name}")
                    continue

                # Execute with timeout
                timeout = provider_state.config.timeout_seconds
                result = await asyncio.wait_for(handler(*args, **kwargs), timeout=timeout)

                # Success
                self._record_success(provider_state)
                latency_ms = (time.time() - start_time) * 1000

                self._metrics.successful_requests += 1
                if fallback_activated:
                    self._metrics.fallback_activations += 1

                return FallbackResult(
                    success=True,
                    provider_used=provider_name,
                    providers_tried=providers_tried,
                    result=result,
                    latency_ms=latency_ms,
                    fallback_activated=fallback_activated,
                )

            except asyncio.TimeoutError:
                logger.warning(f"Timeout calling {provider_name}")
                self._record_failure(provider_state, "timeout")
                fallback_activated = True

            except Exception as e:
                logger.warning(f"Error calling {provider_name}: {e}")
                self._record_failure(provider_state, str(e))
                fallback_activated = True

        # All providers failed
        self._metrics.failed_requests += 1
        latency_ms = (time.time() - start_time) * 1000

        return FallbackResult(
            success=False,
            provider_used="none",
            providers_tried=providers_tried,
            result=None,
            latency_ms=latency_ms,
            fallback_activated=True,
            error="All providers failed",
        )

    def _get_available_providers(
        self, service_type: ServiceType, preferred: Optional[str] = None
    ) -> List[ProviderState]:
        """Get available providers for a service type."""
        providers = self._providers.get(service_type, [])

        # Filter enabled providers
        available = [p for p in providers if p.config.enabled]

        # Reorder if preferred provider specified
        if preferred:
            preferred_state = None
            others = []
            for p in available:
                if p.config.name == preferred:
                    preferred_state = p
                else:
                    others.append(p)
            if preferred_state:
                return [preferred_state] + others

        return available

    def _can_call_provider(self, provider_state: ProviderState) -> bool:
        """Check if a provider can be called (circuit breaker logic)."""
        state = provider_state.circuit_state

        if state == CircuitState.CLOSED:
            return True

        if state == CircuitState.OPEN:
            # Check if recovery timeout has passed
            if provider_state.last_failure_time:
                elapsed = (datetime.now(timezone.utc) - provider_state.last_failure_time).total_seconds()
                if elapsed >= provider_state.config.recovery_timeout_seconds:
                    # Transition to half-open
                    self._set_circuit_state(provider_state, CircuitState.HALF_OPEN)
                    return True
            return False

        if state == CircuitState.HALF_OPEN:
            # Allow limited calls in half-open state
            if provider_state.half_open_calls < provider_state.config.half_open_max_calls:
                provider_state.half_open_calls += 1
                return True
            return False

        return False

    def _record_success(self, provider_state: ProviderState) -> None:
        """Record a successful call."""
        provider_state.consecutive_successes += 1
        provider_state.consecutive_failures = 0
        provider_state.total_calls += 1
        provider_state.last_success_time = datetime.now(timezone.utc)

        # Update circuit state
        if provider_state.circuit_state == CircuitState.HALF_OPEN:
            if provider_state.consecutive_successes >= provider_state.config.half_open_max_calls:
                self._set_circuit_state(provider_state, CircuitState.CLOSED)
                provider_state.half_open_calls = 0
                self._metrics.circuit_closes += 1
                self._metrics.successful_recoveries += 1

    def _record_failure(self, provider_state: ProviderState, error: str) -> None:
        """Record a failed call."""
        provider_state.consecutive_failures += 1
        provider_state.consecutive_successes = 0
        provider_state.total_calls += 1
        provider_state.total_failures += 1
        provider_state.last_failure_time = datetime.now(timezone.utc)

        # Check if circuit should open
        if provider_state.circuit_state == CircuitState.CLOSED:
            if provider_state.consecutive_failures >= provider_state.config.failure_threshold:
                self._set_circuit_state(provider_state, CircuitState.OPEN)
                self._metrics.circuit_opens += 1
                logger.warning(
                    f"Circuit opened for {provider_state.config.name} "
                    f"after {provider_state.consecutive_failures} failures"
                )

        elif provider_state.circuit_state == CircuitState.HALF_OPEN:
            # Failed during recovery, reopen circuit
            self._set_circuit_state(provider_state, CircuitState.OPEN)
            provider_state.half_open_calls = 0

    def _set_circuit_state(self, provider_state: ProviderState, new_state: CircuitState) -> None:
        """Set circuit state with logging and callbacks."""
        old_state = provider_state.circuit_state
        provider_state.circuit_state = new_state

        if self.config.log_health_transitions:
            logger.info(
                f"Circuit state change for {provider_state.config.name}: " f"{old_state.value} -> {new_state.value}"
            )

    def _update_health(self, provider_state: ProviderState, new_health: ServiceHealth) -> None:
        """Update provider health with callbacks."""
        old_health = provider_state.health
        provider_state.health = new_health
        provider_state.last_health_check = datetime.now(timezone.utc)

        if old_health != new_health:
            if self.config.log_health_transitions:
                logger.info(
                    f"Health change for {provider_state.config.name}: " f"{old_health.value} -> {new_health.value}"
                )

            if self._on_health_change:
                self._on_health_change(provider_state.config.name, old_health, new_health)

    async def _health_check_loop(self) -> None:
        """Background task for health checking."""
        while True:
            try:
                await asyncio.sleep(self.config.health_check_interval_seconds)

                for service_type in ServiceType:
                    for provider_state in self._providers.get(service_type, []):
                        await self._check_provider_health(provider_state)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check error: {e}")

    async def _check_provider_health(self, provider_state: ProviderState) -> None:
        """Check health of a single provider."""
        # Determine health based on circuit state and recent failures
        if provider_state.circuit_state == CircuitState.OPEN:
            self._update_health(provider_state, ServiceHealth.UNHEALTHY)
        elif provider_state.circuit_state == CircuitState.HALF_OPEN:
            self._update_health(provider_state, ServiceHealth.DEGRADED)
        else:
            # Check failure rate
            if provider_state.total_calls > 0:
                failure_rate = provider_state.total_failures / provider_state.total_calls
                if failure_rate > 0.5:
                    self._update_health(provider_state, ServiceHealth.DEGRADED)
                elif failure_rate > 0.1:
                    self._update_health(provider_state, ServiceHealth.DEGRADED)
                else:
                    self._update_health(provider_state, ServiceHealth.HEALTHY)
            else:
                self._update_health(provider_state, ServiceHealth.UNKNOWN)

    async def _recovery_check_loop(self) -> None:
        """Background task for recovery attempts."""
        while True:
            try:
                await asyncio.sleep(self.config.recovery_check_interval_seconds)

                for service_type in ServiceType:
                    for provider_state in self._providers.get(service_type, []):
                        if provider_state.circuit_state == CircuitState.OPEN:
                            # Check if ready for recovery attempt
                            if provider_state.last_failure_time:
                                elapsed = (
                                    datetime.now(timezone.utc) - provider_state.last_failure_time
                                ).total_seconds()

                                if elapsed >= provider_state.config.recovery_timeout_seconds:
                                    self._set_circuit_state(provider_state, CircuitState.HALF_OPEN)
                                    self._metrics.recovery_attempts += 1

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Recovery check error: {e}")

    def get_provider_status(self, service_type: Optional[ServiceType] = None) -> Dict[str, Any]:
        """Get status of all providers or providers of a specific type."""
        status = {}

        service_types = [service_type] if service_type else list(ServiceType)

        for svc_type in service_types:
            providers = self._providers.get(svc_type, [])
            status[svc_type.value] = [
                {
                    "name": p.config.name,
                    "priority": p.config.priority,
                    "enabled": p.config.enabled,
                    "health": p.health.value,
                    "circuit_state": p.circuit_state.value,
                    "consecutive_failures": p.consecutive_failures,
                    "total_calls": p.total_calls,
                    "failure_rate": p.total_failures / p.total_calls if p.total_calls > 0 else 0,
                    "avg_latency_ms": p.avg_latency_ms,
                    "last_success": p.last_success_time.isoformat() if p.last_success_time else None,
                    "last_failure": p.last_failure_time.isoformat() if p.last_failure_time else None,
                }
                for p in providers
            ]

        return status

    def get_healthy_providers(self, service_type: ServiceType) -> List[str]:
        """Get list of healthy provider names for a service type."""
        providers = self._providers.get(service_type, [])
        return [
            p.config.name
            for p in providers
            if p.health in [ServiceHealth.HEALTHY, ServiceHealth.UNKNOWN]
            and p.circuit_state == CircuitState.CLOSED
            and p.config.enabled
        ]

    def set_provider_enabled(self, provider_name: str, enabled: bool) -> bool:
        """Enable or disable a provider."""
        for providers in self._providers.values():
            for p in providers:
                if p.config.name == provider_name:
                    p.config.enabled = enabled
                    logger.info(f"Provider {provider_name} " f"{'enabled' if enabled else 'disabled'}")
                    return True
        return False

    def reset_circuit(self, provider_name: str) -> bool:
        """Manually reset a provider's circuit breaker."""
        for providers in self._providers.values():
            for p in providers:
                if p.config.name == provider_name:
                    p.circuit_state = CircuitState.CLOSED
                    p.consecutive_failures = 0
                    p.half_open_calls = 0
                    logger.info(f"Circuit reset for {provider_name}")
                    return True
        return False

    def on_fallback(self, callback: Callable[[str, str, str], None]) -> None:
        """Register callback for fallback events (from, to, reason)."""
        self._on_fallback = callback

    def on_health_change(self, callback: Callable[[str, ServiceHealth, ServiceHealth], None]) -> None:
        """Register callback for health change events."""
        self._on_health_change = callback

    def get_metrics(self) -> OrchestratorMetrics:
        """Get orchestrator metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset orchestrator metrics."""
        self._metrics = OrchestratorMetrics()

    async def cleanup(self) -> None:
        """Clean up background tasks."""
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

        if self._recovery_task:
            self._recovery_task.cancel()
            try:
                await self._recovery_task
            except asyncio.CancelledError:
                pass

        self._initialized = False


# Singleton instance
_fallback_orchestrator: Optional[VoiceFallbackOrchestrator] = None


def get_voice_fallback_orchestrator() -> VoiceFallbackOrchestrator:
    """Get or create the singleton VoiceFallbackOrchestrator instance."""
    global _fallback_orchestrator
    if _fallback_orchestrator is None:
        _fallback_orchestrator = VoiceFallbackOrchestrator()
    return _fallback_orchestrator


async def execute_with_fallback(service_type: ServiceType, *args, **kwargs) -> FallbackResult:
    """
    Convenience function for executing with fallback.

    Args:
        service_type: Type of service to call
        *args: Arguments to pass to handler
        **kwargs: Keyword arguments to pass to handler

    Returns:
        FallbackResult with operation outcome
    """
    orchestrator = get_voice_fallback_orchestrator()
    await orchestrator.initialize()
    return await orchestrator.execute_with_fallback(service_type, *args, **kwargs)
