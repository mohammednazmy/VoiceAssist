"""Tracing utilities for distributed tracing context propagation.

Provides utilities for W3C Trace Context propagation across service boundaries.
"""

from typing import Dict

from opentelemetry import trace
from opentelemetry.propagate import inject


def get_trace_headers() -> Dict[str, str]:
    """Get W3C Trace Context headers for the current span.

    Returns:
        Dictionary of trace headers (traceparent, tracestate) that can be
        added to HTTP requests for distributed tracing.

    Example:
        headers = get_trace_headers()
        response = await client.get(url, headers=headers)
    """
    headers = {}
    inject(headers)
    return headers


def get_current_trace_id() -> str:
    """Get the current trace ID as a hex string.

    Returns:
        Trace ID in hex format, or empty string if no active span.
    """
    span = trace.get_current_span()
    if span and span.get_span_context().is_valid:
        return format(span.get_span_context().trace_id, "032x")
    return ""


def get_current_span_id() -> str:
    """Get the current span ID as a hex string.

    Returns:
        Span ID in hex format, or empty string if no active span.
    """
    span = trace.get_current_span()
    if span and span.get_span_context().is_valid:
        return format(span.get_span_context().span_id, "016x")
    return ""
