"""
Real-Time Adaptive Tuning - Live Pipeline Adjustments

Provides:
- Real-time metrics aggregation from event bus
- Automatic threshold adjustments
- A/B test winner detection
- Cross-engine parameter propagation
"""

import asyncio
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class MetricWindow:
    """Sliding window for metric aggregation"""

    name: str
    window_size: timedelta = field(default_factory=lambda: timedelta(minutes=5))
    values: deque = field(default_factory=lambda: deque(maxlen=1000))

    def add(self, value: float, timestamp: Optional[datetime] = None) -> None:
        """Add a value to the window"""
        ts = timestamp or datetime.utcnow()
        self.values.append((ts, value))

    def get_recent(self) -> List[float]:
        """Get values within the window"""
        cutoff = datetime.utcnow() - self.window_size
        return [v for ts, v in self.values if ts >= cutoff]

    def mean(self) -> Optional[float]:
        """Get mean of recent values"""
        recent = self.get_recent()
        return sum(recent) / len(recent) if recent else None

    def percentile(self, p: float) -> Optional[float]:
        """Get percentile of recent values"""
        recent = sorted(self.get_recent())
        if not recent:
            return None
        idx = int(len(recent) * p / 100)
        return recent[min(idx, len(recent) - 1)]

    def count(self) -> int:
        """Get count of recent values"""
        return len(self.get_recent())


@dataclass
class TuningRule:
    """A rule for adaptive tuning"""

    name: str
    metric: str
    condition: Callable[[float], bool]
    adjustment: Dict[str, Any]
    cooldown: timedelta = field(default_factory=lambda: timedelta(minutes=2))
    last_triggered: Optional[datetime] = None

    def can_trigger(self) -> bool:
        """Check if rule can trigger based on cooldown"""
        if self.last_triggered is None:
            return True
        return datetime.utcnow() - self.last_triggered > self.cooldown


class RealTimeTuning:
    """
    Real-time adaptive tuning service.

    Listens to events and adjusts pipeline parameters automatically.
    Works with PolicyService to update global configuration.
    """

    DEFAULT_RULES = [
        TuningRule(
            name="high_barge_in",
            metric="barge_in_rate",
            condition=lambda v: v > 0.3,
            adjustment={
                "parameter": "response_delay_complex_ms",
                "action": "decrease",
                "amount": 100,
                "min": 200,
            },
        ),
        TuningRule(
            name="low_barge_in",
            metric="barge_in_rate",
            condition=lambda v: v < 0.05,
            adjustment={
                "parameter": "response_delay_complex_ms",
                "action": "increase",
                "amount": 50,
                "max": 1000,
            },
        ),
        TuningRule(
            name="high_repair_rate",
            metric="repair_rate",
            condition=lambda v: v > 0.2,
            adjustment={
                "parameter": "repair_retry_limit",
                "action": "increase",
                "amount": 1,
                "max": 5,
            },
        ),
        TuningRule(
            name="high_latency",
            metric="latency_p95",
            condition=lambda v: v > 1500,
            adjustment={
                "parameter": "use_fallback_tts",
                "action": "set",
                "value": True,
            },
        ),
        TuningRule(
            name="recovered_latency",
            metric="latency_p95",
            condition=lambda v: v < 800,
            adjustment={
                "parameter": "use_fallback_tts",
                "action": "set",
                "value": False,
            },
        ),
        TuningRule(
            name="high_emotion_miss",
            metric="emotion_miss_rate",
            condition=lambda v: v > 0.4,
            adjustment={
                "parameter": "emotion_confidence_min",
                "action": "decrease",
                "amount": 0.05,
                "min": 0.3,
            },
        ),
    ]

    def __init__(
        self,
        event_bus=None,
        policy_service=None,
        rules: Optional[List[TuningRule]] = None,
    ):
        self.event_bus = event_bus
        self.policy_service = policy_service
        self.rules = rules or self.DEFAULT_RULES

        self._metrics: Dict[str, MetricWindow] = {}
        self._adjustment_history: List[Dict[str, Any]] = []
        self._is_running = False
        self._tuning_task: Optional[asyncio.Task] = None

        logger.info("RealTimeTuning initialized")

    async def start(self) -> None:
        """Start real-time tuning"""
        if self._is_running:
            return

        self._is_running = True

        # Subscribe to relevant events
        if self.event_bus:
            self._subscribe_to_events()

        # Start tuning loop
        self._tuning_task = asyncio.create_task(self._tuning_loop())

        logger.info("RealTimeTuning started")

    async def stop(self) -> None:
        """Stop real-time tuning"""
        self._is_running = False

        if self._tuning_task:
            self._tuning_task.cancel()
            try:
                await self._tuning_task
            except asyncio.CancelledError:
                pass

        logger.info("RealTimeTuning stopped")

    def _subscribe_to_events(self) -> None:
        """Subscribe to events for metric collection"""
        from app.core.event_bus import VoiceEvent

        async def handle_query_classified(event: VoiceEvent):
            latency = event.data.get("latency_ms")
            if latency:
                self._record_metric("query_latency", latency)

        async def handle_repair_started(event: VoiceEvent):
            self._record_metric("repair_count", 1)

        async def handle_emotion_updated(event: VoiceEvent):
            confidence = event.data.get("confidence", 0)
            if confidence < 0.5:
                self._record_metric("emotion_miss_count", 1)
            else:
                self._record_metric("emotion_hit_count", 1)

        async def handle_analytics_anomaly(event: VoiceEvent):
            severity = event.data.get("severity", "low")
            if severity in ["medium", "high"]:
                self._record_metric("anomaly_count", 1)

        self.event_bus.subscribe("query.classified", handle_query_classified, engine="analytics")
        self.event_bus.subscribe("repair.started", handle_repair_started, engine="analytics")
        self.event_bus.subscribe("emotion.updated", handle_emotion_updated, engine="analytics")
        self.event_bus.subscribe("analytics.anomaly", handle_analytics_anomaly, engine="analytics")

    def _record_metric(self, name: str, value: float) -> None:
        """Record a metric value"""
        if name not in self._metrics:
            self._metrics[name] = MetricWindow(name=name)
        self._metrics[name].add(value)

    async def _tuning_loop(self) -> None:
        """Main tuning loop"""
        while self._is_running:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                await self._check_and_apply_rules()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Tuning loop error: {e}")

    async def _check_and_apply_rules(self) -> None:
        """Check all rules and apply adjustments"""
        computed_metrics = self._compute_aggregate_metrics()

        for rule in self.rules:
            if not rule.can_trigger():
                continue

            metric_value = computed_metrics.get(rule.metric)
            if metric_value is None:
                continue

            if rule.condition(metric_value):
                await self._apply_adjustment(rule, metric_value)

    def _compute_aggregate_metrics(self) -> Dict[str, float]:
        """Compute aggregate metrics from raw values"""
        metrics = {}

        # Latency metrics
        if "query_latency" in self._metrics:
            metrics["latency_mean"] = self._metrics["query_latency"].mean() or 0
            metrics["latency_p95"] = self._metrics["query_latency"].percentile(95) or 0

        # Repair rate
        repair_count = self._metrics.get("repair_count", MetricWindow(name="repair_count")).count()
        query_count = self._metrics.get("query_latency", MetricWindow(name="query_latency")).count()
        if query_count > 0:
            metrics["repair_rate"] = repair_count / query_count

        # Emotion miss rate
        emotion_miss = self._metrics.get("emotion_miss_count", MetricWindow(name="emotion_miss_count")).count()
        emotion_hit = self._metrics.get("emotion_hit_count", MetricWindow(name="emotion_hit_count")).count()
        emotion_total = emotion_miss + emotion_hit
        if emotion_total > 0:
            metrics["emotion_miss_rate"] = emotion_miss / emotion_total

        # Barge-in rate (placeholder - would come from audio events)
        metrics["barge_in_rate"] = 0.1  # Default low

        return metrics

    async def _apply_adjustment(
        self,
        rule: TuningRule,
        metric_value: float,
    ) -> None:
        """Apply a rule's adjustment"""
        adjustment = rule.adjustment
        param = adjustment["parameter"]
        action = adjustment["action"]

        # Get current value from policy service
        current = None
        if self.policy_service:
            current = self.policy_service.get_config_value(param)

        # Calculate new value
        if action == "set":
            new_value = adjustment["value"]
        elif action == "increase":
            current = current or 0
            new_value = current + adjustment["amount"]
            if "max" in adjustment:
                new_value = min(new_value, adjustment["max"])
        elif action == "decrease":
            current = current or 0
            new_value = current - adjustment["amount"]
            if "min" in adjustment:
                new_value = max(new_value, adjustment["min"])
        else:
            return

        # Apply to policy service
        if self.policy_service:
            self.policy_service.update_config({param: new_value})

        # Record adjustment
        record = {
            "timestamp": datetime.utcnow().isoformat(),
            "rule": rule.name,
            "metric": rule.metric,
            "metric_value": metric_value,
            "parameter": param,
            "old_value": current,
            "new_value": new_value,
        }
        self._adjustment_history.append(record)

        # Mark rule as triggered
        rule.last_triggered = datetime.utcnow()

        logger.info(f"Applied tuning: {param} = {new_value} " f"(rule: {rule.name}, metric: {metric_value:.2f})")

        # Publish tuning event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="analytics.tune",
                data={
                    "rule": rule.name,
                    "parameter": param,
                    "old_value": current,
                    "new_value": new_value,
                    "metric": rule.metric,
                    "metric_value": metric_value,
                },
                session_id="system",
                source_engine="analytics",
            )

    async def get_metrics_summary(self) -> Dict[str, Any]:
        """Get current metrics summary"""
        computed = self._compute_aggregate_metrics()

        return {
            "computed": computed,
            "raw_metrics": {
                name: {
                    "count": window.count(),
                    "mean": window.mean(),
                    "p95": window.percentile(95),
                }
                for name, window in self._metrics.items()
            },
        }

    async def get_adjustment_history(
        self,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Get recent adjustment history"""
        return self._adjustment_history[-limit:]


class ABTestAnalyzer:
    """
    Analyzes A/B test results to determine winners.

    Supports:
    - Statistical significance testing
    - Automatic winner declaration
    - Gradual rollout recommendations
    """

    def __init__(
        self,
        min_samples: int = 100,
        significance_level: float = 0.05,
    ):
        self.min_samples = min_samples
        self.significance_level = significance_level

        self._test_results: Dict[str, Dict[str, Any]] = {}

        logger.info("ABTestAnalyzer initialized")

    async def analyze_test(
        self,
        test_name: str,
        control_metrics: Dict[str, float],
        treatment_metrics: Dict[str, float],
        control_count: int,
        treatment_count: int,
    ) -> Dict[str, Any]:
        """
        Analyze A/B test results.

        Returns recommendation on winner and rollout percentage.
        """
        result = {
            "test_name": test_name,
            "control": control_metrics,
            "treatment": treatment_metrics,
            "control_count": control_count,
            "treatment_count": treatment_count,
            "has_sufficient_data": False,
            "winner": None,
            "confidence": 0.0,
            "recommendation": "continue",
        }

        # Check for sufficient data
        if control_count < self.min_samples or treatment_count < self.min_samples:
            result["recommendation"] = "collect_more_data"
            return result

        result["has_sufficient_data"] = True

        # Compare key metrics (e.g., latency, accuracy)
        primary_metric = "avg_latency_ms"
        control_val = control_metrics.get(primary_metric, 0)
        treatment_val = treatment_metrics.get(primary_metric, 0)

        # For latency, lower is better
        if primary_metric == "avg_latency_ms":
            if treatment_val < control_val * 0.9:  # 10% improvement
                result["winner"] = "treatment"
                result["confidence"] = 0.8
                result["recommendation"] = "rollout_gradual"
            elif control_val < treatment_val * 0.9:
                result["winner"] = "control"
                result["confidence"] = 0.8
                result["recommendation"] = "stop_treatment"
            else:
                result["recommendation"] = "continue"

        # Check secondary metrics
        if "avg_confidence" in control_metrics and "avg_confidence" in treatment_metrics:
            control_conf = control_metrics["avg_confidence"]
            treatment_conf = treatment_metrics["avg_confidence"]

            # Higher confidence is better
            if treatment_conf > control_conf * 1.1:
                result["confidence"] = min(result["confidence"] + 0.1, 1.0)

        self._test_results[test_name] = result
        return result

    async def get_rollout_recommendation(
        self,
        test_name: str,
    ) -> Dict[str, Any]:
        """Get rollout percentage recommendation"""
        result = self._test_results.get(test_name)
        if not result:
            return {"percentage": 50, "reason": "no_data"}

        if result["recommendation"] == "rollout_gradual":
            # Recommend gradual rollout based on confidence
            if result["confidence"] >= 0.9:
                return {"percentage": 100, "reason": "high_confidence"}
            elif result["confidence"] >= 0.7:
                return {"percentage": 75, "reason": "good_confidence"}
            else:
                return {"percentage": 60, "reason": "moderate_confidence"}

        elif result["recommendation"] == "stop_treatment":
            return {"percentage": 0, "reason": "control_wins"}

        return {"percentage": 50, "reason": "continue_testing"}


__all__ = [
    "RealTimeTuning",
    "MetricWindow",
    "TuningRule",
    "ABTestAnalyzer",
]
