"""Unit tests for tracing utilities.

Tests distributed tracing functionality including:
- Trace context propagation
- Span creation and management
- Trace ID generation
- Baggage handling
"""
from __future__ import annotations

from typing import Dict, Optional, Any, List
from unittest.mock import MagicMock, patch
from uuid import uuid4
import time

import pytest


# Mock OpenTelemetry-like tracing implementation for testing
class SpanContext:
    """Represents the context of a span."""

    def __init__(self, trace_id: str, span_id: str, trace_flags: int = 1):
        self.trace_id = trace_id
        self.span_id = span_id
        self.trace_flags = trace_flags


class Span:
    """Represents a distributed tracing span."""

    def __init__(
        self,
        name: str,
        context: SpanContext,
        parent: Optional[Span] = None,
        attributes: Optional[Dict[str, Any]] = None
    ):
        self.name = name
        self.context = context
        self.parent = parent
        self.attributes = attributes or {}
        self.events: List[Dict[str, Any]] = []
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.status = "unset"
        self.status_message = ""

    def set_attribute(self, key: str, value: Any):
        """Set a span attribute."""
        self.attributes[key] = value

    def add_event(self, name: str, attributes: Optional[Dict[str, Any]] = None):
        """Add an event to the span."""
        self.events.append({
            "name": name,
            "timestamp": time.time(),
            "attributes": attributes or {}
        })

    def set_status(self, status: str, description: str = ""):
        """Set span status."""
        self.status = status
        self.status_message = description

    def end(self):
        """End the span."""
        self.end_time = time.time()

    def is_recording(self) -> bool:
        """Check if span is still recording."""
        return self.end_time is None

    def get_span_context(self) -> SpanContext:
        """Get the span context."""
        return self.context


class Tracer:
    """Tracer for creating and managing spans."""

    def __init__(self, name: str):
        self.name = name
        self.spans: List[Span] = []

    def start_span(
        self,
        name: str,
        parent: Optional[Span] = None,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Span:
        """Start a new span."""
        trace_id = parent.context.trace_id if parent else generate_trace_id()
        span_id = generate_span_id()

        context = SpanContext(trace_id, span_id)
        span = Span(name, context, parent, attributes)
        self.spans.append(span)

        return span

    def start_as_current_span(self, name: str, **kwargs):
        """Context manager for starting a span."""
        return SpanContextManager(self, name, **kwargs)


class SpanContextManager:
    """Context manager for spans."""

    def __init__(self, tracer: Tracer, name: str, **kwargs):
        self.tracer = tracer
        self.name = name
        self.kwargs = kwargs
        self.span: Optional[Span] = None

    def __enter__(self) -> Span:
        self.span = self.tracer.start_span(self.name, **self.kwargs)
        return self.span

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.span:
            if exc_type is not None:
                self.span.set_status("error", str(exc_val))
            else:
                self.span.set_status("ok")
            self.span.end()


class TracingContext:
    """Context for managing current trace and baggage."""

    def __init__(self):
        self._current_span: Optional[Span] = None
        self._baggage: Dict[str, str] = {}

    def set_current_span(self, span: Span):
        """Set the current active span."""
        self._current_span = span

    def get_current_span(self) -> Optional[Span]:
        """Get the current active span."""
        return self._current_span

    def set_baggage(self, key: str, value: str):
        """Set baggage item."""
        self._baggage[key] = value

    def get_baggage(self, key: str) -> Optional[str]:
        """Get baggage item."""
        return self._baggage.get(key)

    def get_all_baggage(self) -> Dict[str, str]:
        """Get all baggage items."""
        return self._baggage.copy()

    def clear_baggage(self):
        """Clear all baggage."""
        self._baggage.clear()


def generate_trace_id() -> str:
    """Generate a unique trace ID."""
    return str(uuid4())


def generate_span_id() -> str:
    """Generate a unique span ID."""
    return str(uuid4())[:16]


def extract_trace_context(headers: Dict[str, str]) -> Optional[SpanContext]:
    """Extract trace context from HTTP headers."""
    traceparent = headers.get("traceparent")
    if not traceparent:
        return None

    # Parse W3C traceparent format: version-trace_id-span_id-flags
    parts = traceparent.split("-")
    if len(parts) != 4:
        return None

    version, trace_id, span_id, flags = parts
    return SpanContext(trace_id, span_id, int(flags, 16))


def inject_trace_context(context: SpanContext, headers: Dict[str, str]):
    """Inject trace context into HTTP headers."""
    # W3C traceparent format
    traceparent = f"00-{context.trace_id}-{context.span_id}-{context.trace_flags:02x}"
    headers["traceparent"] = traceparent


# ============================================================================
# Trace Context Propagation Tests
# ============================================================================


@pytest.mark.unit
def test_extract_trace_context_from_headers():
    """Test extracting trace context from HTTP headers."""
    headers = {
        "traceparent": "00-trace123-span456-01"
    }

    context = extract_trace_context(headers)

    assert context is not None
    assert context.trace_id == "trace123"
    assert context.span_id == "span456"
    assert context.trace_flags == 1


@pytest.mark.unit
def test_extract_trace_context_returns_none_when_missing():
    """Test that extraction returns None when headers are missing."""
    headers = {}

    context = extract_trace_context(headers)

    assert context is None


@pytest.mark.unit
def test_extract_trace_context_handles_invalid_format():
    """Test that extraction handles invalid traceparent format."""
    headers = {
        "traceparent": "invalid-format"
    }

    context = extract_trace_context(headers)

    assert context is None


@pytest.mark.unit
def test_inject_trace_context_into_headers():
    """Test injecting trace context into HTTP headers."""
    context = SpanContext("trace123", "span456", 1)
    headers = {}

    inject_trace_context(context, headers)

    assert "traceparent" in headers
    assert "trace123" in headers["traceparent"]
    assert "span456" in headers["traceparent"]


@pytest.mark.unit
def test_inject_and_extract_roundtrip():
    """Test that inject and extract are compatible."""
    original_context = SpanContext("trace789", "span012", 1)
    headers = {}

    inject_trace_context(original_context, headers)
    extracted_context = extract_trace_context(headers)

    assert extracted_context is not None
    assert extracted_context.trace_id == original_context.trace_id
    assert extracted_context.span_id == original_context.span_id


@pytest.mark.unit
def test_trace_context_propagates_through_services():
    """Test trace context propagation across service boundaries."""
    # Service A creates trace
    tracer_a = Tracer("service-a")
    span_a = tracer_a.start_span("operation-a")

    # Inject context into headers
    headers = {}
    inject_trace_context(span_a.context, headers)

    # Service B extracts context
    context = extract_trace_context(headers)

    # Service B should use same trace ID
    assert context.trace_id == span_a.context.trace_id


# ============================================================================
# Span Creation Tests
# ============================================================================


@pytest.mark.unit
def test_create_span():
    """Test creating a basic span."""
    tracer = Tracer("test-service")

    span = tracer.start_span("test-operation")

    assert span is not None
    assert span.name == "test-operation"
    assert span.context.trace_id is not None
    assert span.context.span_id is not None


@pytest.mark.unit
def test_span_has_attributes():
    """Test adding attributes to span."""
    tracer = Tracer("test-service")
    span = tracer.start_span("test-operation")

    span.set_attribute("user_id", "user123")
    span.set_attribute("request_id", "req456")

    assert span.attributes["user_id"] == "user123"
    assert span.attributes["request_id"] == "req456"


@pytest.mark.unit
def test_span_with_initial_attributes():
    """Test creating span with initial attributes."""
    tracer = Tracer("test-service")

    span = tracer.start_span(
        "test-operation",
        attributes={"key": "value"}
    )

    assert span.attributes["key"] == "value"


@pytest.mark.unit
def test_span_add_event():
    """Test adding events to span."""
    tracer = Tracer("test-service")
    span = tracer.start_span("test-operation")

    span.add_event("processing_started")
    span.add_event("cache_hit", {"cache_key": "key123"})

    assert len(span.events) == 2
    assert span.events[0]["name"] == "processing_started"
    assert span.events[1]["attributes"]["cache_key"] == "key123"


@pytest.mark.unit
def test_span_set_status():
    """Test setting span status."""
    tracer = Tracer("test-service")
    span = tracer.start_span("test-operation")

    span.set_status("ok")

    assert span.status == "ok"


@pytest.mark.unit
def test_span_set_error_status():
    """Test setting error status on span."""
    tracer = Tracer("test-service")
    span = tracer.start_span("test-operation")

    span.set_status("error", "Operation failed")

    assert span.status == "error"
    assert span.status_message == "Operation failed"


@pytest.mark.unit
def test_span_end():
    """Test ending a span."""
    tracer = Tracer("test-service")
    span = tracer.start_span("test-operation")

    assert span.is_recording()

    span.end()

    assert not span.is_recording()
    assert span.end_time is not None


@pytest.mark.unit
def test_nested_spans():
    """Test creating nested child spans."""
    tracer = Tracer("test-service")

    parent_span = tracer.start_span("parent-operation")
    child_span = tracer.start_span("child-operation", parent=parent_span)

    assert child_span.parent == parent_span
    assert child_span.context.trace_id == parent_span.context.trace_id


@pytest.mark.unit
def test_span_context_manager():
    """Test using span as context manager."""
    tracer = Tracer("test-service")

    with tracer.start_as_current_span("test-operation") as span:
        span.set_attribute("key", "value")
        assert span.is_recording()

    # Span should be ended after context
    assert not span.is_recording()
    assert span.status == "ok"


@pytest.mark.unit
def test_span_context_manager_handles_exceptions():
    """Test span context manager handles exceptions properly."""
    tracer = Tracer("test-service")

    try:
        with tracer.start_as_current_span("test-operation") as span:
            raise ValueError("Test error")
    except ValueError:
        pass

    # Span should have error status
    assert span.status == "error"
    assert "Test error" in span.status_message


# ============================================================================
# Trace ID Generation Tests
# ============================================================================


@pytest.mark.unit
def test_generate_unique_trace_ids():
    """Test that trace ID generation produces unique IDs."""
    trace_ids = [generate_trace_id() for _ in range(100)]

    # All should be unique
    assert len(set(trace_ids)) == 100


@pytest.mark.unit
def test_trace_id_format():
    """Test that trace IDs have valid format."""
    trace_id = generate_trace_id()

    # Should be a valid UUID string
    assert isinstance(trace_id, str)
    assert len(trace_id) > 0


@pytest.mark.unit
def test_span_id_generation():
    """Test span ID generation."""
    span_id = generate_span_id()

    assert isinstance(span_id, str)
    assert len(span_id) == 16


@pytest.mark.unit
def test_child_span_inherits_trace_id():
    """Test that child spans inherit parent's trace ID."""
    tracer = Tracer("test-service")

    parent = tracer.start_span("parent")
    child = tracer.start_span("child", parent=parent)

    assert child.context.trace_id == parent.context.trace_id
    assert child.context.span_id != parent.context.span_id


# ============================================================================
# Baggage Handling Tests
# ============================================================================


@pytest.mark.unit
def test_set_baggage():
    """Test setting baggage items."""
    context = TracingContext()

    context.set_baggage("user_id", "user123")
    context.set_baggage("tenant_id", "tenant456")

    assert context.get_baggage("user_id") == "user123"
    assert context.get_baggage("tenant_id") == "tenant456"


@pytest.mark.unit
def test_get_nonexistent_baggage():
    """Test getting baggage that doesn't exist."""
    context = TracingContext()

    result = context.get_baggage("nonexistent")

    assert result is None


@pytest.mark.unit
def test_get_all_baggage():
    """Test getting all baggage items."""
    context = TracingContext()

    context.set_baggage("key1", "value1")
    context.set_baggage("key2", "value2")

    baggage = context.get_all_baggage()

    assert baggage == {"key1": "value1", "key2": "value2"}


@pytest.mark.unit
def test_clear_baggage():
    """Test clearing all baggage."""
    context = TracingContext()

    context.set_baggage("key1", "value1")
    context.clear_baggage()

    assert len(context.get_all_baggage()) == 0


@pytest.mark.unit
def test_baggage_overwrites_existing():
    """Test that setting baggage overwrites existing value."""
    context = TracingContext()

    context.set_baggage("key", "value1")
    context.set_baggage("key", "value2")

    assert context.get_baggage("key") == "value2"


# ============================================================================
# Current Span Management Tests
# ============================================================================


@pytest.mark.unit
def test_set_current_span():
    """Test setting current active span."""
    context = TracingContext()
    tracer = Tracer("test-service")
    span = tracer.start_span("test-operation")

    context.set_current_span(span)

    assert context.get_current_span() == span


@pytest.mark.unit
def test_get_current_span_returns_none_initially():
    """Test that current span is None initially."""
    context = TracingContext()

    assert context.get_current_span() is None


@pytest.mark.unit
def test_current_span_updates():
    """Test that current span can be updated."""
    context = TracingContext()
    tracer = Tracer("test-service")

    span1 = tracer.start_span("operation1")
    span2 = tracer.start_span("operation2")

    context.set_current_span(span1)
    assert context.get_current_span() == span1

    context.set_current_span(span2)
    assert context.get_current_span() == span2


# ============================================================================
# Integration Scenarios
# ============================================================================


@pytest.mark.unit
def test_complete_tracing_flow():
    """Test a complete distributed tracing flow."""
    # Create tracer
    tracer = Tracer("api-service")

    # Start parent span
    with tracer.start_as_current_span("handle_request") as parent_span:
        parent_span.set_attribute("http.method", "POST")
        parent_span.set_attribute("http.path", "/api/users")

        # Add event
        parent_span.add_event("request_validation")

        # Create child span
        child_span = tracer.start_span("database_query", parent=parent_span)
        child_span.set_attribute("db.system", "postgresql")
        child_span.end()

        # Another child span
        cache_span = tracer.start_span("cache_lookup", parent=parent_span)
        cache_span.add_event("cache_hit", {"key": "user:123"})
        cache_span.end()

    # Verify trace
    assert parent_span.status == "ok"
    assert len(tracer.spans) == 3


@pytest.mark.unit
def test_trace_across_async_operations():
    """Test tracing across simulated async operations."""
    tracer = Tracer("async-service")

    # Parent span
    parent = tracer.start_span("async_handler")

    # Simulate multiple async operations
    async_spans = []
    for i in range(3):
        span = tracer.start_span(f"async_op_{i}", parent=parent)
        span.set_attribute("operation_id", i)
        span.end()
        async_spans.append(span)

    parent.end()

    # All should share same trace ID
    trace_ids = [s.context.trace_id for s in async_spans]
    assert len(set(trace_ids)) == 1


@pytest.mark.unit
def test_error_propagation_in_trace():
    """Test error status propagation in trace."""
    tracer = Tracer("error-service")

    parent = tracer.start_span("parent")

    # Child operation fails
    child = tracer.start_span("child", parent=parent)
    child.set_status("error", "Database connection failed")
    child.end()

    parent.set_status("error", "Child operation failed")
    parent.end()

    assert parent.status == "error"
    assert child.status == "error"


# ============================================================================
# Edge Cases
# ============================================================================


@pytest.mark.unit
def test_span_with_special_characters_in_name():
    """Test span with special characters in name."""
    tracer = Tracer("test-service")

    span = tracer.start_span("operation/with/slashes")

    assert span.name == "operation/with/slashes"


@pytest.mark.unit
def test_span_attributes_with_various_types():
    """Test span attributes with various data types."""
    tracer = Tracer("test-service")
    span = tracer.start_span("test")

    span.set_attribute("string", "value")
    span.set_attribute("int", 42)
    span.set_attribute("float", 3.14)
    span.set_attribute("bool", True)

    assert span.attributes["string"] == "value"
    assert span.attributes["int"] == 42
    assert span.attributes["float"] == 3.14
    assert span.attributes["bool"] is True


@pytest.mark.unit
def test_very_deep_span_nesting():
    """Test deeply nested span hierarchy."""
    tracer = Tracer("test-service")

    current = tracer.start_span("root")
    for i in range(10):
        current = tracer.start_span(f"level_{i}", parent=current)

    # All should have same trace ID
    assert len(set(s.context.trace_id for s in tracer.spans)) == 1


@pytest.mark.unit
def test_baggage_with_special_characters():
    """Test baggage with special characters."""
    context = TracingContext()

    context.set_baggage("user@email.com", "value")
    context.set_baggage("key-with-dash", "value2")

    assert context.get_baggage("user@email.com") == "value"
    assert context.get_baggage("key-with-dash") == "value2"
