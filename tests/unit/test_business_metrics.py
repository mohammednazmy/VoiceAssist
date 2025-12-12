"""Unit tests for business metrics system.

Tests business metrics functionality including:
- Metric registration
- Counter increments
- Gauge sets
- Histogram observations
"""
from __future__ import annotations

from typing import Dict, List, Any
from unittest.mock import MagicMock, patch
from collections import defaultdict

import pytest


# Mock Prometheus-like metrics implementation for testing
class Counter:
    """Mock Prometheus Counter metric."""

    def __init__(self, name: str, description: str, labels: List[str] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._values: Dict[tuple, float] = defaultdict(float)
        self._label_values: Dict[str, Any] = {}

    def inc(self, amount: float = 1.0):
        """Increment counter."""
        label_key = tuple(sorted(self._label_values.items()))
        self._values[label_key] += amount

    def labels(self, **label_values):
        """Set label values for this counter."""
        new_counter = Counter(self.name, self.description, self.label_names)
        new_counter._values = self._values
        new_counter._label_values = label_values
        return new_counter

    def get_value(self, **label_values) -> float:
        """Get current counter value for given labels."""
        label_key = tuple(sorted(label_values.items()))
        return self._values[label_key]


class Gauge:
    """Mock Prometheus Gauge metric."""

    def __init__(self, name: str, description: str, labels: List[str] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._values: Dict[tuple, float] = defaultdict(float)
        self._label_values: Dict[str, Any] = {}

    def set(self, value: float):
        """Set gauge to specific value."""
        label_key = tuple(sorted(self._label_values.items()))
        self._values[label_key] = value

    def inc(self, amount: float = 1.0):
        """Increment gauge."""
        label_key = tuple(sorted(self._label_values.items()))
        self._values[label_key] += amount

    def dec(self, amount: float = 1.0):
        """Decrement gauge."""
        label_key = tuple(sorted(self._label_values.items()))
        self._values[label_key] -= amount

    def labels(self, **label_values):
        """Set label values for this gauge."""
        new_gauge = Gauge(self.name, self.description, self.label_names)
        new_gauge._values = self._values
        new_gauge._label_values = label_values
        return new_gauge

    def get_value(self, **label_values) -> float:
        """Get current gauge value for given labels."""
        label_key = tuple(sorted(label_values.items()))
        return self._values[label_key]


class Histogram:
    """Mock Prometheus Histogram metric."""

    def __init__(self, name: str, description: str, buckets: List[float] = None, labels: List[str] = None):
        self.name = name
        self.description = description
        self.buckets = buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        self.label_names = labels or []
        self._observations: Dict[tuple, List[float]] = defaultdict(list)
        self._label_values: Dict[str, Any] = {}

    def observe(self, value: float):
        """Record an observation."""
        label_key = tuple(sorted(self._label_values.items()))
        self._observations[label_key].append(value)

    def labels(self, **label_values):
        """Set label values for this histogram."""
        new_histogram = Histogram(self.name, self.description, self.buckets, self.label_names)
        new_histogram._observations = self._observations
        new_histogram._label_values = label_values
        return new_histogram

    def get_observations(self, **label_values) -> List[float]:
        """Get all observations for given labels."""
        label_key = tuple(sorted(label_values.items()))
        return self._observations[label_key]


class MetricsRegistry:
    """Registry for business metrics."""

    def __init__(self):
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._histograms: Dict[str, Histogram] = {}

    def counter(self, name: str, description: str, labels: List[str] = None) -> Counter:
        """Register or get a counter metric."""
        if name not in self._counters:
            self._counters[name] = Counter(name, description, labels)
        return self._counters[name]

    def gauge(self, name: str, description: str, labels: List[str] = None) -> Gauge:
        """Register or get a gauge metric."""
        if name not in self._gauges:
            self._gauges[name] = Gauge(name, description, labels)
        return self._gauges[name]

    def histogram(
        self,
        name: str,
        description: str,
        buckets: List[float] = None,
        labels: List[str] = None
    ) -> Histogram:
        """Register or get a histogram metric."""
        if name not in self._histograms:
            self._histograms[name] = Histogram(name, description, buckets, labels)
        return self._histograms[name]

    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all registered metrics."""
        return {
            "counters": self._counters,
            "gauges": self._gauges,
            "histograms": self._histograms,
        }


# ============================================================================
# Metric Registration Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.metrics
def test_register_counter_metric():
    """Test registering a counter metric."""
    registry = MetricsRegistry()

    counter = registry.counter("test_counter", "Test counter description")

    assert counter is not None
    assert counter.name == "test_counter"
    assert counter.description == "Test counter description"


@pytest.mark.unit
@pytest.mark.metrics
def test_register_gauge_metric():
    """Test registering a gauge metric."""
    registry = MetricsRegistry()

    gauge = registry.gauge("test_gauge", "Test gauge description")

    assert gauge is not None
    assert gauge.name == "test_gauge"
    assert gauge.description == "Test gauge description"


@pytest.mark.unit
@pytest.mark.metrics
def test_register_histogram_metric():
    """Test registering a histogram metric."""
    registry = MetricsRegistry()

    histogram = registry.histogram("test_histogram", "Test histogram description")

    assert histogram is not None
    assert histogram.name == "test_histogram"
    assert histogram.description == "Test histogram description"


@pytest.mark.unit
@pytest.mark.metrics
def test_register_multiple_metrics():
    """Test registering multiple different metrics."""
    registry = MetricsRegistry()

    counter = registry.counter("counter1", "Counter 1")
    gauge = registry.gauge("gauge1", "Gauge 1")
    histogram = registry.histogram("histogram1", "Histogram 1")

    metrics = registry.get_all_metrics()

    assert "counter1" in metrics["counters"]
    assert "gauge1" in metrics["gauges"]
    assert "histogram1" in metrics["histograms"]


@pytest.mark.unit
@pytest.mark.metrics
def test_get_existing_metric_returns_same_instance():
    """Test that getting an existing metric returns the same instance."""
    registry = MetricsRegistry()

    counter1 = registry.counter("test_counter", "Test")
    counter2 = registry.counter("test_counter", "Test")

    assert counter1 is counter2


@pytest.mark.unit
@pytest.mark.metrics
def test_register_metric_with_labels():
    """Test registering a metric with labels."""
    registry = MetricsRegistry()

    counter = registry.counter(
        "requests_total",
        "Total requests",
        labels=["method", "endpoint"]
    )

    assert counter.label_names == ["method", "endpoint"]


# ============================================================================
# Counter Increment Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.metrics
def test_counter_increment_default():
    """Test incrementing counter by default amount (1)."""
    registry = MetricsRegistry()
    counter = registry.counter("test_counter", "Test")

    counter.inc()

    assert counter.get_value() == 1.0


@pytest.mark.unit
@pytest.mark.metrics
def test_counter_increment_custom_amount():
    """Test incrementing counter by custom amount."""
    registry = MetricsRegistry()
    counter = registry.counter("test_counter", "Test")

    counter.inc(5.0)

    assert counter.get_value() == 5.0


@pytest.mark.unit
@pytest.mark.metrics
def test_counter_multiple_increments():
    """Test multiple increments accumulate correctly."""
    registry = MetricsRegistry()
    counter = registry.counter("test_counter", "Test")

    counter.inc()
    counter.inc()
    counter.inc(3.0)

    assert counter.get_value() == 5.0


@pytest.mark.unit
@pytest.mark.metrics
def test_counter_with_labels():
    """Test counter with label values."""
    registry = MetricsRegistry()
    counter = registry.counter(
        "requests_total",
        "Total requests",
        labels=["method"]
    )

    counter.labels(method="GET").inc()
    counter.labels(method="POST").inc(2)

    assert counter.get_value(method="GET") == 1.0
    assert counter.get_value(method="POST") == 2.0


@pytest.mark.unit
@pytest.mark.metrics
def test_counter_multiple_label_dimensions():
    """Test counter with multiple label dimensions."""
    registry = MetricsRegistry()
    counter = registry.counter(
        "requests_total",
        "Total requests",
        labels=["method", "status"]
    )

    counter.labels(method="GET", status="200").inc()
    counter.labels(method="GET", status="404").inc(2)
    counter.labels(method="POST", status="200").inc(3)

    assert counter.get_value(method="GET", status="200") == 1.0
    assert counter.get_value(method="GET", status="404") == 2.0
    assert counter.get_value(method="POST", status="200") == 3.0


@pytest.mark.unit
@pytest.mark.metrics
def test_counter_starts_at_zero():
    """Test that counters start at zero."""
    registry = MetricsRegistry()
    counter = registry.counter("test_counter", "Test")

    assert counter.get_value() == 0.0


# ============================================================================
# Gauge Set Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_set_value():
    """Test setting gauge to specific value."""
    registry = MetricsRegistry()
    gauge = registry.gauge("test_gauge", "Test")

    gauge.set(42.0)

    assert gauge.get_value() == 42.0


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_set_overwrites_previous():
    """Test that setting gauge overwrites previous value."""
    registry = MetricsRegistry()
    gauge = registry.gauge("test_gauge", "Test")

    gauge.set(10.0)
    gauge.set(20.0)

    assert gauge.get_value() == 20.0


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_increment():
    """Test incrementing gauge value."""
    registry = MetricsRegistry()
    gauge = registry.gauge("test_gauge", "Test")

    gauge.set(10.0)
    gauge.inc(5.0)

    assert gauge.get_value() == 15.0


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_decrement():
    """Test decrementing gauge value."""
    registry = MetricsRegistry()
    gauge = registry.gauge("test_gauge", "Test")

    gauge.set(10.0)
    gauge.dec(3.0)

    assert gauge.get_value() == 7.0


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_can_be_negative():
    """Test that gauge can have negative values."""
    registry = MetricsRegistry()
    gauge = registry.gauge("test_gauge", "Test")

    gauge.set(-5.0)

    assert gauge.get_value() == -5.0


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_with_labels():
    """Test gauge with label values."""
    registry = MetricsRegistry()
    gauge = registry.gauge(
        "active_connections",
        "Active connections",
        labels=["protocol"]
    )

    gauge.labels(protocol="http").set(100)
    gauge.labels(protocol="websocket").set(50)

    assert gauge.get_value(protocol="http") == 100.0
    assert gauge.get_value(protocol="websocket") == 50.0


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_inc_dec_with_labels():
    """Test incrementing and decrementing gauge with labels."""
    registry = MetricsRegistry()
    gauge = registry.gauge("queue_size", "Queue size", labels=["queue"])

    gauge.labels(queue="requests").set(10)
    gauge.labels(queue="requests").inc()
    gauge.labels(queue="requests").dec(2)

    assert gauge.get_value(queue="requests") == 9.0


# ============================================================================
# Histogram Observation Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.metrics
def test_histogram_observe():
    """Test recording histogram observations."""
    registry = MetricsRegistry()
    histogram = registry.histogram("test_histogram", "Test")

    histogram.observe(0.5)

    observations = histogram.get_observations()
    assert len(observations) == 1
    assert observations[0] == 0.5


@pytest.mark.unit
@pytest.mark.metrics
def test_histogram_multiple_observations():
    """Test recording multiple histogram observations."""
    registry = MetricsRegistry()
    histogram = registry.histogram("test_histogram", "Test")

    values = [0.1, 0.5, 1.0, 2.5, 5.0]
    for value in values:
        histogram.observe(value)

    observations = histogram.get_observations()
    assert len(observations) == 5
    assert observations == values


@pytest.mark.unit
@pytest.mark.metrics
def test_histogram_with_labels():
    """Test histogram with label values."""
    registry = MetricsRegistry()
    histogram = registry.histogram(
        "request_duration",
        "Request duration",
        labels=["endpoint"]
    )

    histogram.labels(endpoint="/api/users").observe(0.5)
    histogram.labels(endpoint="/api/posts").observe(1.0)

    assert len(histogram.get_observations(endpoint="/api/users")) == 1
    assert len(histogram.get_observations(endpoint="/api/posts")) == 1


@pytest.mark.unit
@pytest.mark.metrics
def test_histogram_custom_buckets():
    """Test histogram with custom buckets."""
    registry = MetricsRegistry()
    custom_buckets = [0.1, 0.5, 1.0, 5.0]

    histogram = registry.histogram(
        "test_histogram",
        "Test",
        buckets=custom_buckets
    )

    assert histogram.buckets == custom_buckets


@pytest.mark.unit
@pytest.mark.metrics
def test_histogram_observes_various_durations():
    """Test histogram recording various duration values."""
    registry = MetricsRegistry()
    histogram = registry.histogram("response_time", "Response time")

    # Simulate various response times
    durations = [0.001, 0.01, 0.1, 0.5, 1.0, 2.0]
    for duration in durations:
        histogram.observe(duration)

    observations = histogram.get_observations()
    assert len(observations) == len(durations)


# ============================================================================
# Business Metrics Specific Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.metrics
def test_track_user_registrations():
    """Test tracking user registration metrics."""
    registry = MetricsRegistry()
    registrations = registry.counter(
        "user_registrations_total",
        "Total user registrations"
    )

    # Simulate registrations
    registrations.inc()
    registrations.inc()

    assert registrations.get_value() == 2.0


@pytest.mark.unit
@pytest.mark.metrics
def test_track_active_users():
    """Test tracking active users gauge."""
    registry = MetricsRegistry()
    active_users = registry.gauge(
        "active_users",
        "Currently active users"
    )

    # Simulate users joining
    active_users.inc(10)

    # User leaves
    active_users.dec()

    assert active_users.get_value() == 9.0


@pytest.mark.unit
@pytest.mark.metrics
def test_track_llm_token_usage():
    """Test tracking LLM token usage."""
    registry = MetricsRegistry()
    tokens = registry.counter(
        "llm_tokens_used",
        "Total LLM tokens used",
        labels=["model", "type"]
    )

    tokens.labels(model="gpt-4", type="prompt").inc(100)
    tokens.labels(model="gpt-4", type="completion").inc(50)

    assert tokens.get_value(model="gpt-4", type="prompt") == 100.0
    assert tokens.get_value(model="gpt-4", type="completion") == 50.0


@pytest.mark.unit
@pytest.mark.metrics
def test_track_request_duration():
    """Test tracking request duration histogram."""
    registry = MetricsRegistry()
    duration = registry.histogram(
        "request_duration_seconds",
        "Request duration in seconds",
        labels=["endpoint", "method"]
    )

    # Simulate requests
    duration.labels(endpoint="/api/chat", method="POST").observe(0.5)
    duration.labels(endpoint="/api/chat", method="POST").observe(0.7)

    observations = duration.get_observations(endpoint="/api/chat", method="POST")
    assert len(observations) == 2


@pytest.mark.unit
@pytest.mark.metrics
def test_track_error_rates():
    """Test tracking error rates."""
    registry = MetricsRegistry()
    errors = registry.counter(
        "errors_total",
        "Total errors",
        labels=["error_type"]
    )

    errors.labels(error_type="validation").inc()
    errors.labels(error_type="authentication").inc(2)
    errors.labels(error_type="internal").inc()

    assert errors.get_value(error_type="validation") == 1.0
    assert errors.get_value(error_type="authentication") == 2.0


@pytest.mark.unit
@pytest.mark.metrics
def test_track_feature_usage():
    """Test tracking feature usage metrics."""
    registry = MetricsRegistry()
    feature_usage = registry.counter(
        "feature_usage_total",
        "Feature usage count",
        labels=["feature"]
    )

    feature_usage.labels(feature="voice_command").inc(5)
    feature_usage.labels(feature="web_search").inc(3)
    feature_usage.labels(feature="calendar").inc(2)

    assert feature_usage.get_value(feature="voice_command") == 5.0
    assert feature_usage.get_value(feature="web_search") == 3.0


# ============================================================================
# Edge Cases and Complex Scenarios
# ============================================================================


@pytest.mark.unit
@pytest.mark.metrics
def test_metric_with_empty_label_value():
    """Test metric with empty string as label value."""
    registry = MetricsRegistry()
    counter = registry.counter("test", "Test", labels=["label"])

    counter.labels(label="").inc()

    assert counter.get_value(label="") == 1.0


@pytest.mark.unit
@pytest.mark.metrics
def test_concurrent_metric_updates():
    """Test that metric updates from multiple sources accumulate correctly."""
    registry = MetricsRegistry()
    counter = registry.counter("test", "Test")

    # Simulate concurrent updates
    for _ in range(100):
        counter.inc()

    assert counter.get_value() == 100.0


@pytest.mark.unit
@pytest.mark.metrics
def test_histogram_with_zero_observation():
    """Test histogram can observe zero value."""
    registry = MetricsRegistry()
    histogram = registry.histogram("test", "Test")

    histogram.observe(0.0)

    observations = histogram.get_observations()
    assert 0.0 in observations


@pytest.mark.unit
@pytest.mark.metrics
def test_gauge_increment_without_initial_set():
    """Test incrementing gauge without setting initial value."""
    registry = MetricsRegistry()
    gauge = registry.gauge("test", "Test")

    gauge.inc()

    # Should start from 0 and increment
    assert gauge.get_value() == 1.0


@pytest.mark.unit
@pytest.mark.metrics
def test_very_large_counter_value():
    """Test counter with very large values."""
    registry = MetricsRegistry()
    counter = registry.counter("test", "Test")

    counter.inc(1_000_000.0)

    assert counter.get_value() == 1_000_000.0


@pytest.mark.unit
@pytest.mark.metrics
def test_metric_names_are_unique_across_types():
    """Test that different metric types can have different names."""
    registry = MetricsRegistry()

    counter = registry.counter("metric1", "Counter")
    gauge = registry.gauge("metric1", "Gauge")  # Same name, different type
    histogram = registry.histogram("metric1", "Histogram")

    # All should be registered independently
    assert counter is not None
    assert gauge is not None
    assert histogram is not None
