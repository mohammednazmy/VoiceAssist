"""
Metrics Collector - Metrics Collection and Aggregation

Collects and aggregates metrics from the voice pipeline.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class MetricBucket:
    """Aggregated metric bucket"""

    samples: List[float] = field(default_factory=list)
    count: int = 0
    sum: float = 0.0
    min_val: float = float("inf")
    max_val: float = float("-inf")
    last_update: datetime = field(default_factory=datetime.utcnow)


class MetricsCollector:
    """
    Metrics collection and aggregation service.

    Collects:
    - Latency metrics (histograms)
    - Count metrics (counters)
    - Gauge metrics (current values)

    Aggregates over time windows for percentile calculation.
    """

    # Time window for aggregation
    AGGREGATION_WINDOW_SECONDS = 60
    MAX_SAMPLES_PER_BUCKET = 1000

    def __init__(self):
        self._histograms: Dict[str, List[float]] = defaultdict(list)
        self._counters: Dict[str, float] = defaultdict(float)
        self._gauges: Dict[str, float] = {}
        self._buckets: Dict[str, MetricBucket] = {}
        self._last_reset: datetime = datetime.utcnow()
        logger.info("MetricsCollector initialized")

    async def record(self, sample: "MetricSample") -> None:
        """Record a metric sample"""

        metric_key = self._build_key(sample.name, sample.labels)

        # Add to histogram
        self._histograms[metric_key].append(sample.value)

        # Trim if too large
        if len(self._histograms[metric_key]) > self.MAX_SAMPLES_PER_BUCKET:
            self._histograms[metric_key] = self._histograms[metric_key][-self.MAX_SAMPLES_PER_BUCKET :]

        # Update bucket
        if metric_key not in self._buckets:
            self._buckets[metric_key] = MetricBucket()

        bucket = self._buckets[metric_key]
        bucket.samples.append(sample.value)
        bucket.count += 1
        bucket.sum += sample.value
        bucket.min_val = min(bucket.min_val, sample.value)
        bucket.max_val = max(bucket.max_val, sample.value)
        bucket.last_update = datetime.utcnow()

    async def increment(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
        value: float = 1.0,
    ) -> None:
        """Increment a counter"""
        metric_key = self._build_key(name, labels or {})
        self._counters[metric_key] += value

    async def set_gauge(
        self,
        name: str,
        value: float,
        labels: Optional[Dict[str, str]] = None,
    ) -> None:
        """Set a gauge value"""
        metric_key = self._build_key(name, labels or {})
        self._gauges[metric_key] = value

    async def get_gauge(self, name: str) -> Optional[float]:
        """Get current gauge value"""
        return self._gauges.get(name)

    async def get_counter(self, name: str) -> float:
        """Get counter value"""
        return self._counters.get(name, 0.0)

    async def get_percentile(
        self,
        name: str,
        percentile: float,
        labels: Optional[Dict[str, str]] = None,
    ) -> Optional[float]:
        """Get percentile value for a metric"""
        metric_key = self._build_key(name, labels or {})
        samples = self._histograms.get(metric_key, [])

        if not samples:
            return None

        sorted_samples = sorted(samples)
        idx = int(len(sorted_samples) * percentile / 100)
        idx = min(idx, len(sorted_samples) - 1)

        return sorted_samples[idx]

    async def get_rate(
        self,
        name: str,
        window: str = "1m",
    ) -> Optional[float]:
        """Get rate of a counter over time window"""
        # Parse window (reserved for future window-based rate calculation)
        if window.endswith("m"):
            _seconds = int(window[:-1]) * 60  # noqa: F841
        elif window.endswith("s"):
            _seconds = int(window[:-1])  # noqa: F841
        else:
            _seconds = 60  # noqa: F841

        counter_value = self._counters.get(name, 0.0)

        # Simple rate calculation
        elapsed = (datetime.utcnow() - self._last_reset).total_seconds()
        if elapsed > 0:
            return counter_value / elapsed
        return 0.0

    async def get_stats(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ) -> Dict[str, float]:
        """Get statistics for a metric"""
        metric_key = self._build_key(name, labels or {})
        bucket = self._buckets.get(metric_key)

        if not bucket or bucket.count == 0:
            return {
                "count": 0,
                "sum": 0.0,
                "avg": 0.0,
                "min": 0.0,
                "max": 0.0,
                "p50": 0.0,
                "p95": 0.0,
                "p99": 0.0,
            }

        samples = bucket.samples
        sorted_samples = sorted(samples)

        return {
            "count": bucket.count,
            "sum": bucket.sum,
            "avg": bucket.sum / bucket.count,
            "min": bucket.min_val,
            "max": bucket.max_val,
            "p50": self._percentile(sorted_samples, 50),
            "p95": self._percentile(sorted_samples, 95),
            "p99": self._percentile(sorted_samples, 99),
        }

    def _build_key(self, name: str, labels: Dict[str, str]) -> str:
        """Build metric key from name and labels"""
        if not labels:
            return name
        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"

    def _percentile(self, sorted_samples: List[float], p: float) -> float:
        """Calculate percentile from sorted samples"""
        if not sorted_samples:
            return 0.0
        idx = int(len(sorted_samples) * p / 100)
        idx = min(idx, len(sorted_samples) - 1)
        return sorted_samples[idx]

    async def reset(self) -> None:
        """Reset all metrics"""
        self._histograms.clear()
        self._counters.clear()
        self._gauges.clear()
        self._buckets.clear()
        self._last_reset = datetime.utcnow()


__all__ = ["MetricsCollector", "MetricBucket"]
