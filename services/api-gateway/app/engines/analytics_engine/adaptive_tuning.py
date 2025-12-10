"""
Adaptive Tuning - Feedback Loop for Pipeline Adjustments

Automatically adjusts pipeline parameters based on metrics.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


@dataclass
class TuningAdjustment:
    """A tuning adjustment recommendation"""

    parameter: str
    current_value: Any
    recommended_value: Any
    reason: str
    confidence: float
    timestamp: datetime


class AdaptiveTuning:
    """
    Adaptive tuning service.

    Adjusts pipeline parameters based on observed metrics:
    - High barge-in rate → lower response delays
    - Frequent repairs → earlier repair trigger
    - Latency spikes → provider failover

    Publishes tuning events through event bus.
    """

    # Tuning rules: (metric, condition, adjustment)
    TUNING_RULES = [
        {
            "name": "barge_in_rate_high",
            "metric": "barge_in_rate",
            "condition": lambda v: v > 0.3,  # >30% barge-in rate
            "adjustment": {
                "parameter": "response_delay_ms",
                "delta": -100,  # Reduce delay by 100ms
                "min": 100,
                "max": 1000,
            },
            "reason": "High barge-in rate suggests responses are too slow",
        },
        {
            "name": "repair_rate_high",
            "metric": "repair_rate",
            "condition": lambda v: v > 0.2,  # >20% repair rate
            "adjustment": {
                "parameter": "repair_trigger_threshold",
                "delta": -0.1,  # More sensitive repair trigger
                "min": 0.3,
                "max": 0.9,
            },
            "reason": "High repair rate suggests earlier intervention needed",
        },
        {
            "name": "latency_high",
            "metric": "latency_p95",
            "condition": lambda v: v > 1500,  # >1.5s P95
            "adjustment": {
                "parameter": "use_fallback_tts",
                "value": True,
            },
            "reason": "High latency suggests TTS provider issues",
        },
        {
            "name": "error_rate_high",
            "metric": "error_rate",
            "condition": lambda v: v > 0.05,  # >5% error rate
            "adjustment": {
                "parameter": "circuit_breaker_threshold",
                "delta": -1,
                "min": 3,
                "max": 10,
            },
            "reason": "High error rate suggests faster circuit breaking needed",
        },
    ]

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._current_params: Dict[str, Any] = {}
        self._adjustment_history: List[TuningAdjustment] = []
        logger.info("AdaptiveTuning initialized")

    async def suggest(
        self,
        metrics: Dict[str, float],
    ) -> Dict[str, Any]:
        """
        Get tuning suggestions based on current metrics.

        Returns dict with suggested adjustments.
        """
        suggestions = {}

        for rule in self.TUNING_RULES:
            metric_value = metrics.get(rule["metric"])
            if metric_value is None:
                continue

            if rule["condition"](metric_value):
                adjustment = rule["adjustment"]
                param = adjustment["parameter"]

                if "value" in adjustment:
                    # Direct value assignment
                    suggestions[param] = {
                        "value": adjustment["value"],
                        "reason": rule["reason"],
                    }
                elif "delta" in adjustment:
                    # Delta adjustment
                    current = self._current_params.get(param, 0)
                    new_value = current + adjustment["delta"]

                    # Apply bounds
                    if "min" in adjustment:
                        new_value = max(new_value, adjustment["min"])
                    if "max" in adjustment:
                        new_value = min(new_value, adjustment["max"])

                    if new_value != current:
                        suggestions[param] = {
                            "current": current,
                            "value": new_value,
                            "reason": rule["reason"],
                        }

        return suggestions

    async def apply(
        self,
        adjustments: Dict[str, Any],
    ) -> bool:
        """Apply tuning adjustments"""
        for param, details in adjustments.items():
            new_value = details["value"] if isinstance(details, dict) else details

            # Record adjustment
            adjustment = TuningAdjustment(
                parameter=param,
                current_value=self._current_params.get(param),
                recommended_value=new_value,
                reason=details.get("reason", "Manual adjustment"),
                confidence=0.8,
                timestamp=datetime.utcnow(),
            )
            self._adjustment_history.append(adjustment)

            # Update parameter
            self._current_params[param] = new_value

            logger.info(f"Applied tuning: {param} = {new_value}")

        # Publish tuning event
        if self.event_bus and adjustments:
            await self.event_bus.publish_event(
                event_type="analytics.tune",
                data={"adjustments": {k: v["value"] if isinstance(v, dict) else v for k, v in adjustments.items()}},
                session_id="system",
                source_engine="analytics",
            )

        return True

    async def trigger_adjustment(self, anomaly: "AnomalyAlert") -> None:
        """Trigger adjustment based on anomaly"""

        # Map anomaly metrics to adjustments
        if "latency" in anomaly.metric_name.lower():
            if anomaly.severity == "high":
                await self.apply(
                    {
                        "use_fallback_provider": {
                            "value": True,
                            "reason": "High latency anomaly",
                        },
                    }
                )
        elif "error" in anomaly.metric_name.lower():
            if anomaly.severity in ["medium", "high"]:
                await self.apply(
                    {
                        "circuit_breaker_threshold": {
                            "value": 3,
                            "reason": "High error rate anomaly",
                        },
                    }
                )

    async def get_current_params(self) -> Dict[str, Any]:
        """Get current parameter values"""
        return self._current_params.copy()

    async def get_adjustment_history(
        self,
        limit: int = 10,
    ) -> List[TuningAdjustment]:
        """Get recent adjustment history"""
        return self._adjustment_history[-limit:]


__all__ = ["AdaptiveTuning", "TuningAdjustment"]
