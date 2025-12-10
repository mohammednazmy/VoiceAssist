"""
Analytics Engine - Adaptive Analytics and Monitoring

This engine handles all analytics and monitoring functionality:
- Collector: Metrics collection and aggregation
- Anomaly Detector: Real-time anomaly detection
- Adaptive Tuning: Feedback into pipeline adjustments
- Provider Monitor: External provider health tracking
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class MetricSample:
    """A single metric sample"""

    name: str
    value: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    labels: Dict[str, str] = field(default_factory=dict)


@dataclass
class AnomalyAlert:
    """An anomaly detection alert"""

    metric_name: str
    current_value: float
    expected_value: float
    deviation_percent: float
    severity: str  # low, medium, high
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ProviderStatus:
    """Status of an external provider"""

    provider: str
    status: str  # healthy, degraded, down
    latency_p95_ms: float
    error_rate: float
    last_check: datetime = field(default_factory=datetime.utcnow)


class AnalyticsEngine:
    """
    Facade for all analytics and monitoring functionality.

    Consolidates:
    - NEW collector.py (metrics collection)
    - NEW anomaly_detector.py (real-time detection)
    - NEW adaptive_tuning.py (feedback loop)
    - NEW provider_monitor.py (provider health)
    """

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._collector = None
        self._anomaly_detector = None
        self._adaptive_tuning = None
        self._provider_monitor = None
        logger.info("AnalyticsEngine initialized")

    async def initialize(self):
        """Initialize sub-components lazily"""
        from .adaptive_tuning import AdaptiveTuning
        from .anomaly_detector import AnomalyDetector
        from .collector import MetricsCollector
        from .provider_monitor import ProviderMonitor
        from .realtime_tuning import ABTestAnalyzer, RealTimeTuning

        self._collector = MetricsCollector()
        self._anomaly_detector = AnomalyDetector(self.policy_config)
        self._adaptive_tuning = AdaptiveTuning(self.event_bus)
        self._provider_monitor = ProviderMonitor(self.event_bus)
        self._realtime_tuning = RealTimeTuning(
            event_bus=self.event_bus,
            policy_service=self.policy_config,
        )
        self._ab_analyzer = ABTestAnalyzer()

        # Start real-time tuning
        await self._realtime_tuning.start()

        logger.info("AnalyticsEngine sub-components initialized")

    async def record_metric(
        self,
        name: str,
        value: float,
        labels: Optional[Dict[str, str]] = None,
    ) -> None:
        """Record a metric sample"""
        if not self._collector:
            await self.initialize()

        sample = MetricSample(
            name=name,
            value=value,
            labels=labels or {},
        )

        await self._collector.record(sample)

        # Check for anomalies
        anomaly = await self._anomaly_detector.check(sample)
        if anomaly:
            await self._handle_anomaly(anomaly)

    async def record_latency(
        self,
        operation: str,
        latency_ms: float,
        provider: Optional[str] = None,
    ) -> None:
        """Record operation latency"""
        labels = {"operation": operation}
        if provider:
            labels["provider"] = provider
            # Update provider monitor
            if self._provider_monitor:
                await self._provider_monitor.record_latency(provider, latency_ms)

        await self.record_metric(f"latency_{operation}", latency_ms, labels)

    async def record_error(
        self,
        operation: str,
        error_type: str,
        provider: Optional[str] = None,
    ) -> None:
        """Record an error occurrence"""
        if not self._collector:
            await self.initialize()

        labels = {"operation": operation, "error_type": error_type}
        if provider:
            labels["provider"] = provider
            # Update provider error tracking
            if self._provider_monitor:
                await self._provider_monitor.record_error(provider, error_type)

        await self._collector.increment(f"errors_{operation}", labels)

    async def get_provider_status(self, provider: str) -> Optional[ProviderStatus]:
        """Get current status of a provider"""
        if not self._provider_monitor:
            await self.initialize()
        return await self._provider_monitor.get_status(provider)

    async def get_all_provider_statuses(self) -> Dict[str, ProviderStatus]:
        """Get status of all monitored providers"""
        if not self._provider_monitor:
            await self.initialize()
        return await self._provider_monitor.get_all_statuses()

    async def suggest_tuning(
        self,
        metrics: Dict[str, float],
    ) -> Dict[str, Any]:
        """
        Get tuning suggestions based on metrics.

        Returns dict with suggested parameter adjustments.
        """
        if not self._adaptive_tuning:
            await self.initialize()
        return await self._adaptive_tuning.suggest(metrics)

    async def apply_tuning(
        self,
        adjustments: Dict[str, Any],
    ) -> bool:
        """Apply tuning adjustments to pipeline"""
        if not self._adaptive_tuning:
            await self.initialize()
        return await self._adaptive_tuning.apply(adjustments)

    async def get_dashboard_metrics(self) -> Dict[str, Any]:
        """Get metrics for real-time dashboard"""
        if not self._collector:
            await self.initialize()

        return {
            "active_sessions": await self._collector.get_gauge("active_sessions"),
            "latency_p95": await self._collector.get_percentile("latency_e2e", 95),
            "error_rate": await self._collector.get_rate("errors_total", "1m"),
            "provider_health": await self.get_all_provider_statuses(),
        }

    async def get_realtime_metrics(self) -> Dict[str, Any]:
        """Get real-time tuning metrics"""
        if not self._realtime_tuning:
            await self.initialize()
        return await self._realtime_tuning.get_metrics_summary()

    async def get_tuning_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get tuning adjustment history"""
        if not self._realtime_tuning:
            await self.initialize()
        return await self._realtime_tuning.get_adjustment_history(limit)

    async def analyze_ab_test(
        self,
        test_name: str,
        control_metrics: Dict[str, float],
        treatment_metrics: Dict[str, float],
        control_count: int,
        treatment_count: int,
    ) -> Dict[str, Any]:
        """Analyze A/B test results"""
        if not self._ab_analyzer:
            await self.initialize()
        return await self._ab_analyzer.analyze_test(
            test_name,
            control_metrics,
            treatment_metrics,
            control_count,
            treatment_count,
        )

    async def get_ab_rollout_recommendation(
        self,
        test_name: str,
    ) -> Dict[str, Any]:
        """Get rollout recommendation for A/B test"""
        if not self._ab_analyzer:
            await self.initialize()
        return await self._ab_analyzer.get_rollout_recommendation(test_name)

    async def shutdown(self) -> None:
        """Shutdown analytics engine"""
        if self._realtime_tuning:
            await self._realtime_tuning.stop()
        logger.info("AnalyticsEngine shutdown")

    async def _handle_anomaly(self, anomaly: AnomalyAlert) -> None:
        """Handle detected anomaly"""
        logger.warning(
            f"Anomaly detected: {anomaly.metric_name} "
            f"({anomaly.current_value} vs expected {anomaly.expected_value}, "
            f"{anomaly.deviation_percent:.1f}% deviation)"
        )

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="analytics.anomaly",
                data={
                    "metric": anomaly.metric_name,
                    "current": anomaly.current_value,
                    "expected": anomaly.expected_value,
                    "deviation_percent": anomaly.deviation_percent,
                    "severity": anomaly.severity,
                },
                session_id="system",
                source_engine="analytics",
            )

        # Trigger adaptive tuning if high severity
        if anomaly.severity == "high" and self._adaptive_tuning:
            await self._adaptive_tuning.trigger_adjustment(anomaly)


__all__ = [
    "AnalyticsEngine",
    "MetricSample",
    "AnomalyAlert",
    "ProviderStatus",
]
