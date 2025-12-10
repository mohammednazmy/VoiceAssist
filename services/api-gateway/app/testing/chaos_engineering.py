"""
Chaos Engineering Test Framework

Phase 7: Provides tools for testing system resilience:
- Provider outage simulation
- Latency injection
- Error rate injection
- Circuit breaker testing
- Fallback validation
- Load testing utilities

Usage:
    chaos = ChaosController(event_bus=event_bus)

    # Simulate Epic outage
    await chaos.simulate_provider_outage("epic", duration_seconds=60)

    # Inject latency
    chaos.inject_latency("epic", min_ms=500, max_ms=2000)

    # Inject error rate
    chaos.inject_error_rate("epic", rate=0.3)
"""

import asyncio
import logging
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


# ==============================================================================
# Enums and Models
# ==============================================================================


class ChaosType(str, Enum):
    """Types of chaos injection"""

    OUTAGE = "outage"
    LATENCY = "latency"
    ERROR_RATE = "error_rate"
    TIMEOUT = "timeout"
    PARTIAL_FAILURE = "partial_failure"
    DATA_CORRUPTION = "data_corruption"


class TargetService(str, Enum):
    """Services that can be targeted for chaos"""

    EPIC = "epic"
    STT = "stt"
    TTS = "tts"
    LLM = "llm"
    DATABASE = "database"
    REDIS = "redis"


@dataclass
class ChaosConfig:
    """Configuration for a chaos experiment"""

    chaos_type: ChaosType
    target: TargetService
    enabled: bool = True

    # Timing
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: int = 60

    # Latency injection
    latency_min_ms: int = 100
    latency_max_ms: int = 5000

    # Error injection
    error_rate: float = 0.5  # 50% error rate
    error_codes: List[int] = field(default_factory=lambda: [500, 503])

    # Timeout injection
    timeout_after_ms: int = 10000

    # Schedule
    repeat_interval_minutes: Optional[int] = None

    def is_active(self) -> bool:
        """Check if chaos is currently active"""
        if not self.enabled:
            return False

        now = datetime.utcnow()

        if self.start_time and now < self.start_time:
            return False

        if self.end_time and now > self.end_time:
            return False

        return True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chaos_type": self.chaos_type.value,
            "target": self.target.value,
            "enabled": self.enabled,
            "is_active": self.is_active(),
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": self.duration_seconds,
        }


@dataclass
class ChaosExperiment:
    """A chaos engineering experiment"""

    id: str
    name: str
    description: str
    configs: List[ChaosConfig] = field(default_factory=list)

    # Status
    status: str = "pending"  # pending, running, completed, failed
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Results
    results: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status,
            "configs": [c.to_dict() for c in self.configs],
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (self.completed_at.isoformat() if self.completed_at else None),
            "results": self.results,
        }


# ==============================================================================
# Chaos Controller
# ==============================================================================


class ChaosController:
    """
    Controller for chaos engineering experiments.

    Provides methods to inject failures and measure system resilience.
    """

    def __init__(
        self,
        event_bus=None,
        provider_monitor=None,
        enabled: bool = False,
    ):
        self.event_bus = event_bus
        self.provider_monitor = provider_monitor
        self._enabled = enabled

        # Active chaos configurations
        self._active_chaos: Dict[str, ChaosConfig] = {}

        # Experiments
        self._experiments: Dict[str, ChaosExperiment] = {}

        # Middleware hooks
        self._interceptors: Dict[str, Callable] = {}

        logger.info(f"ChaosController initialized (enabled={enabled})")

    @property
    def is_enabled(self) -> bool:
        """Check if chaos engineering is enabled"""
        return self._enabled

    def enable(self) -> None:
        """Enable chaos engineering"""
        self._enabled = True
        logger.warning("Chaos engineering ENABLED - this should only be used in testing")

    def disable(self) -> None:
        """Disable chaos engineering and clear all active chaos"""
        self._enabled = False
        self._active_chaos.clear()
        logger.info("Chaos engineering disabled")

    # =========================================================================
    # Chaos Injection
    # =========================================================================

    async def simulate_provider_outage(
        self,
        target: str,
        duration_seconds: int = 60,
    ) -> ChaosConfig:
        """
        Simulate a provider outage.

        Args:
            target: Service to target (epic, stt, tts, llm)
            duration_seconds: How long to simulate the outage

        Returns:
            ChaosConfig for the active chaos
        """
        if not self._enabled:
            raise RuntimeError("Chaos engineering is not enabled")

        config = ChaosConfig(
            chaos_type=ChaosType.OUTAGE,
            target=TargetService(target),
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(seconds=duration_seconds),
            duration_seconds=duration_seconds,
        )

        self._active_chaos[f"outage:{target}"] = config

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="chaos.outage_started",
                data={
                    "target": target,
                    "duration_seconds": duration_seconds,
                },
                session_id="system",
                source_engine="chaos",
            )

        logger.warning(f"Simulating {target} outage for {duration_seconds}s")

        # Schedule cleanup
        asyncio.create_task(
            self._cleanup_after_duration(
                f"outage:{target}",
                duration_seconds,
            )
        )

        return config

    def inject_latency(
        self,
        target: str,
        min_ms: int = 100,
        max_ms: int = 2000,
        duration_seconds: int = 300,
    ) -> ChaosConfig:
        """
        Inject latency into a service.

        Args:
            target: Service to target
            min_ms: Minimum latency to add
            max_ms: Maximum latency to add
            duration_seconds: How long to inject latency

        Returns:
            ChaosConfig for the active chaos
        """
        if not self._enabled:
            raise RuntimeError("Chaos engineering is not enabled")

        config = ChaosConfig(
            chaos_type=ChaosType.LATENCY,
            target=TargetService(target),
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(seconds=duration_seconds),
            duration_seconds=duration_seconds,
            latency_min_ms=min_ms,
            latency_max_ms=max_ms,
        )

        self._active_chaos[f"latency:{target}"] = config

        logger.warning(f"Injecting {min_ms}-{max_ms}ms latency into {target}")

        # Schedule cleanup
        asyncio.create_task(
            self._cleanup_after_duration(
                f"latency:{target}",
                duration_seconds,
            )
        )

        return config

    def inject_error_rate(
        self,
        target: str,
        rate: float = 0.3,
        error_codes: Optional[List[int]] = None,
        duration_seconds: int = 300,
    ) -> ChaosConfig:
        """
        Inject errors at a specified rate.

        Args:
            target: Service to target
            rate: Error rate (0.0-1.0)
            error_codes: HTTP error codes to return
            duration_seconds: How long to inject errors

        Returns:
            ChaosConfig for the active chaos
        """
        if not self._enabled:
            raise RuntimeError("Chaos engineering is not enabled")

        config = ChaosConfig(
            chaos_type=ChaosType.ERROR_RATE,
            target=TargetService(target),
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(seconds=duration_seconds),
            duration_seconds=duration_seconds,
            error_rate=rate,
            error_codes=error_codes or [500, 503],
        )

        self._active_chaos[f"error:{target}"] = config

        logger.warning(f"Injecting {rate*100}% error rate into {target}")

        # Schedule cleanup
        asyncio.create_task(
            self._cleanup_after_duration(
                f"error:{target}",
                duration_seconds,
            )
        )

        return config

    async def _cleanup_after_duration(
        self,
        key: str,
        duration_seconds: int,
    ) -> None:
        """Clean up chaos config after duration"""
        await asyncio.sleep(duration_seconds)

        if key in self._active_chaos:
            del self._active_chaos[key]
            logger.info(f"Chaos {key} expired")

            # Publish event
            if self.event_bus:
                chaos_type, target = key.split(":")
                await self.event_bus.publish_event(
                    event_type=f"chaos.{chaos_type}_ended",
                    data={"target": target},
                    session_id="system",
                    source_engine="chaos",
                )

    # =========================================================================
    # Chaos Interceptors
    # =========================================================================

    def should_fail(self, target: str) -> bool:
        """Check if a request to target should fail due to chaos"""
        if not self._enabled:
            return False

        # Check outage
        outage_key = f"outage:{target}"
        if outage_key in self._active_chaos:
            config = self._active_chaos[outage_key]
            if config.is_active():
                return True

        # Check error rate (intentionally non-cryptographic for chaos testing)
        error_key = f"error:{target}"
        if error_key in self._active_chaos:
            config = self._active_chaos[error_key]
            if config.is_active():
                return random.random() < config.error_rate  # nosec B311

        return False

    def get_injected_latency(self, target: str) -> int:
        """Get injected latency for target in milliseconds"""
        if not self._enabled:
            return 0

        latency_key = f"latency:{target}"
        if latency_key in self._active_chaos:
            config = self._active_chaos[latency_key]
            if config.is_active():
                # Intentionally non-cryptographic for chaos testing
                return random.randint(  # nosec B311
                    config.latency_min_ms,
                    config.latency_max_ms,
                )

        return 0

    def get_error_code(self, target: str) -> Optional[int]:
        """Get error code to return if failing"""
        error_key = f"error:{target}"
        if error_key in self._active_chaos:
            config = self._active_chaos[error_key]
            if config.error_codes:
                return random.choice(config.error_codes)  # nosec B311
        return 500

    async def intercept_request(
        self,
        target: str,
        request_func: Callable[[], Awaitable[Any]],
    ) -> Any:
        """
        Intercept a request and apply chaos if configured.

        Usage:
            result = await chaos.intercept_request(
                "epic",
                lambda: adapter.get_patient(patient_id)
            )
        """
        if not self._enabled:
            return await request_func()

        # Check for outage
        if self.should_fail(target):
            error_code = self.get_error_code(target)
            raise Exception(f"Chaos: simulated {target} failure (HTTP {error_code})")

        # Apply latency
        latency_ms = self.get_injected_latency(target)
        if latency_ms > 0:
            await asyncio.sleep(latency_ms / 1000)

        # Execute request
        return await request_func()

    # =========================================================================
    # Experiments
    # =========================================================================

    def create_experiment(
        self,
        name: str,
        description: str,
        configs: List[ChaosConfig],
    ) -> ChaosExperiment:
        """Create a chaos experiment"""
        import uuid

        experiment = ChaosExperiment(
            id=str(uuid.uuid4())[:8],
            name=name,
            description=description,
            configs=configs,
        )

        self._experiments[experiment.id] = experiment
        return experiment

    async def run_experiment(
        self,
        experiment_id: str,
        metrics_collector: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """
        Run a chaos experiment.

        Args:
            experiment_id: ID of experiment to run
            metrics_collector: Optional function to collect metrics

        Returns:
            Experiment results
        """
        if experiment_id not in self._experiments:
            raise ValueError(f"Experiment {experiment_id} not found")

        experiment = self._experiments[experiment_id]
        experiment.status = "running"
        experiment.started_at = datetime.utcnow()

        # Collect baseline metrics
        baseline_metrics = {}
        if metrics_collector:
            baseline_metrics = await metrics_collector()

        # Apply chaos configs
        for config in experiment.configs:
            key = f"{config.chaos_type.value}:{config.target.value}"
            self._active_chaos[key] = config

        # Wait for experiment duration
        max_duration = max(c.duration_seconds for c in experiment.configs)
        await asyncio.sleep(max_duration)

        # Collect post-chaos metrics
        post_metrics = {}
        if metrics_collector:
            post_metrics = await metrics_collector()

        # Clean up
        for config in experiment.configs:
            key = f"{config.chaos_type.value}:{config.target.value}"
            if key in self._active_chaos:
                del self._active_chaos[key]

        experiment.status = "completed"
        experiment.completed_at = datetime.utcnow()
        experiment.results = {
            "baseline_metrics": baseline_metrics,
            "post_metrics": post_metrics,
            "duration_seconds": max_duration,
            "configs_applied": len(experiment.configs),
        }

        return experiment.results

    # =========================================================================
    # Status
    # =========================================================================

    def get_status(self) -> Dict[str, Any]:
        """Get chaos controller status"""
        return {
            "enabled": self._enabled,
            "active_chaos_count": len(self._active_chaos),
            "active_chaos": {k: v.to_dict() for k, v in self._active_chaos.items()},
            "experiments_count": len(self._experiments),
        }

    def get_active_chaos(self) -> List[Dict[str, Any]]:
        """Get list of active chaos configurations"""
        return [{"key": k, **v.to_dict()} for k, v in self._active_chaos.items() if v.is_active()]

    def clear_all(self) -> None:
        """Clear all active chaos"""
        self._active_chaos.clear()
        logger.info("Cleared all active chaos")


# ==============================================================================
# Predefined Experiments
# ==============================================================================


def create_epic_outage_experiment(duration_seconds: int = 60) -> ChaosExperiment:
    """Create an experiment simulating Epic outage"""
    return ChaosExperiment(
        id="epic-outage",
        name="Epic API Outage",
        description="Simulate complete Epic API unavailability",
        configs=[
            ChaosConfig(
                chaos_type=ChaosType.OUTAGE,
                target=TargetService.EPIC,
                duration_seconds=duration_seconds,
            ),
        ],
    )


def create_network_degradation_experiment(
    duration_seconds: int = 300,
) -> ChaosExperiment:
    """Create an experiment simulating network degradation"""
    return ChaosExperiment(
        id="network-degraded",
        name="Network Degradation",
        description="Simulate slow network with high latency",
        configs=[
            ChaosConfig(
                chaos_type=ChaosType.LATENCY,
                target=TargetService.EPIC,
                duration_seconds=duration_seconds,
                latency_min_ms=500,
                latency_max_ms=3000,
            ),
            ChaosConfig(
                chaos_type=ChaosType.LATENCY,
                target=TargetService.STT,
                duration_seconds=duration_seconds,
                latency_min_ms=200,
                latency_max_ms=1000,
            ),
        ],
    )


def create_partial_failure_experiment(duration_seconds: int = 300) -> ChaosExperiment:
    """Create an experiment simulating partial failures"""
    return ChaosExperiment(
        id="partial-failure",
        name="Partial Failure",
        description="Simulate intermittent failures across services",
        configs=[
            ChaosConfig(
                chaos_type=ChaosType.ERROR_RATE,
                target=TargetService.EPIC,
                duration_seconds=duration_seconds,
                error_rate=0.3,
            ),
            ChaosConfig(
                chaos_type=ChaosType.ERROR_RATE,
                target=TargetService.TTS,
                duration_seconds=duration_seconds,
                error_rate=0.1,
            ),
        ],
    )


# ==============================================================================
# Global Instance
# ==============================================================================


_chaos_controller: Optional[ChaosController] = None


def get_chaos_controller() -> ChaosController:
    """Get the global chaos controller instance"""
    global _chaos_controller
    if _chaos_controller is None:
        _chaos_controller = ChaosController(enabled=False)
    return _chaos_controller


def reset_chaos_controller() -> None:
    """Reset the global chaos controller"""
    global _chaos_controller
    if _chaos_controller:
        _chaos_controller.disable()
    _chaos_controller = None


__all__ = [
    "ChaosController",
    "ChaosConfig",
    "ChaosExperiment",
    "ChaosType",
    "TargetService",
    "get_chaos_controller",
    "reset_chaos_controller",
    "create_epic_outage_experiment",
    "create_network_degradation_experiment",
    "create_partial_failure_experiment",
]
