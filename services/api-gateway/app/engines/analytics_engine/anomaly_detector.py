"""
Anomaly Detector - Real-Time Anomaly Detection

Detects anomalies in metrics using statistical methods.
"""

import logging
import math
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class BaselineStats:
    """Baseline statistics for a metric"""

    mean: float = 0.0
    std_dev: float = 0.0
    min_val: float = 0.0
    max_val: float = 0.0
    sample_count: int = 0
    last_update: datetime = field(default_factory=datetime.utcnow)


class AnomalyDetector:
    """
    Real-time anomaly detection service.

    Uses statistical methods:
    - Z-score for deviation detection
    - Moving average for baseline
    - Percentile-based thresholds

    Anomaly severity levels:
    - low: 2-3 standard deviations
    - medium: 3-4 standard deviations
    - high: >4 standard deviations or critical threshold exceeded
    """

    # Z-score thresholds for severity
    SEVERITY_THRESHOLDS = {
        "low": 2.0,
        "medium": 3.0,
        "high": 4.0,
    }

    # Window size for baseline calculation
    BASELINE_WINDOW = 100
    MIN_SAMPLES_FOR_DETECTION = 20

    def __init__(self, policy_config=None):
        self.policy_config = policy_config
        self._baselines: Dict[str, BaselineStats] = {}
        self._samples: Dict[str, deque] = {}

        # Get config thresholds
        if policy_config:
            self.deviation_threshold = getattr(policy_config, "latency_anomaly_threshold", 0.2)
        else:
            self.deviation_threshold = 0.2

        logger.info("AnomalyDetector initialized")

    async def check(self, sample: "MetricSample") -> Optional["AnomalyAlert"]:
        """
        Check if a metric sample is anomalous.

        Returns AnomalyAlert if anomaly detected, None otherwise.
        """
        from . import AnomalyAlert, MetricSample

        metric_key = sample.name

        # Initialize if needed
        if metric_key not in self._samples:
            self._samples[metric_key] = deque(maxlen=self.BASELINE_WINDOW)
            self._baselines[metric_key] = BaselineStats()

        # Add sample to window
        self._samples[metric_key].append(sample.value)

        # Update baseline
        baseline = await self._update_baseline(metric_key)

        # Skip if not enough samples
        if baseline.sample_count < self.MIN_SAMPLES_FOR_DETECTION:
            return None

        # Calculate z-score
        if baseline.std_dev > 0:
            z_score = abs(sample.value - baseline.mean) / baseline.std_dev
        else:
            z_score = 0.0

        # Check for anomaly
        if z_score >= self.SEVERITY_THRESHOLDS["low"]:
            # Determine severity
            if z_score >= self.SEVERITY_THRESHOLDS["high"]:
                severity = "high"
            elif z_score >= self.SEVERITY_THRESHOLDS["medium"]:
                severity = "medium"
            else:
                severity = "low"

            deviation_percent = (sample.value - baseline.mean) / baseline.mean * 100 if baseline.mean != 0 else 0

            return AnomalyAlert(
                metric_name=metric_key,
                current_value=sample.value,
                expected_value=baseline.mean,
                deviation_percent=abs(deviation_percent),
                severity=severity,
            )

        return None

    async def _update_baseline(self, metric_key: str) -> BaselineStats:
        """Update baseline statistics for a metric"""
        samples = list(self._samples[metric_key])
        baseline = self._baselines[metric_key]

        if not samples:
            return baseline

        n = len(samples)
        mean = sum(samples) / n

        if n > 1:
            variance = sum((x - mean) ** 2 for x in samples) / (n - 1)
            std_dev = math.sqrt(variance)
        else:
            std_dev = 0.0

        baseline.mean = mean
        baseline.std_dev = std_dev
        baseline.min_val = min(samples)
        baseline.max_val = max(samples)
        baseline.sample_count = n
        baseline.last_update = datetime.utcnow()

        return baseline

    async def get_baseline(self, metric_name: str) -> Optional[BaselineStats]:
        """Get current baseline for a metric"""
        return self._baselines.get(metric_name)

    async def set_threshold(
        self,
        metric_name: str,
        threshold: float,
        severity: str = "high",
    ) -> None:
        """Set custom threshold for a metric"""
        # TODO: Implement custom per-metric thresholds
        pass

    async def reset_baseline(self, metric_name: str) -> bool:
        """Reset baseline for a metric"""
        if metric_name in self._baselines:
            del self._baselines[metric_name]
        if metric_name in self._samples:
            del self._samples[metric_name]
        return True


__all__ = ["AnomalyDetector", "BaselineStats"]
