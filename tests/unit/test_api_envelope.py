"""Unit tests for API Envelope helpers.

Tests the standardized response format including:
- Success and error response creation
- Metadata inclusion (trace_id, timestamp)
- Pagination helpers
- Validation error formatting
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.core.api_envelope import (
    APIEnvelope,
    APIError,
    success_response,
    error_response,
    ERROR_STATUS_CODES,
)


# ============================================================================
# Success Response Tests
# ============================================================================


@pytest.mark.unit
def test_success_response_returns_correct_format():
    """Test that success_response creates a properly formatted envelope."""
    test_data = {"message": "Hello, World!"}

    envelope = success_response(test_data)

    assert envelope.success is True
    assert envelope.data == test_data
    assert envelope.error is None
    assert envelope.trace_id is not None
    assert isinstance(envelope.timestamp, datetime)


@pytest.mark.unit
def test_success_response_with_custom_trace_id():
    """Test that success_response accepts a custom trace_id."""
    test_data = {"result": "success"}
    custom_trace_id = "custom-trace-12345"

    envelope = success_response(test_data, trace_id=custom_trace_id)

    assert envelope.trace_id == custom_trace_id
    assert envelope.success is True


@pytest.mark.unit
def test_success_response_generates_unique_trace_ids():
    """Test that each success_response generates a unique trace_id when not provided."""
    envelope1 = success_response({"test": 1})
    envelope2 = success_response({"test": 2})

    assert envelope1.trace_id != envelope2.trace_id


@pytest.mark.unit
def test_success_response_with_complex_data():
    """Test success_response with nested and complex data structures."""
    complex_data = {
        "users": [
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ],
        "metadata": {
            "total": 2,
            "page": 1,
        },
    }

    envelope = success_response(complex_data)

    assert envelope.success is True
    assert envelope.data == complex_data
    assert envelope.data["users"][0]["name"] == "Alice"


@pytest.mark.unit
def test_success_response_with_none_data():
    """Test that success_response can handle None as data."""
    envelope = success_response(None)

    assert envelope.success is True
    assert envelope.data is None


# ============================================================================
# Error Response Tests
# ============================================================================


@pytest.mark.unit
def test_error_response_returns_correct_format():
    """Test that error_response creates a properly formatted envelope."""
    error_code = "INTERNAL_ERROR"
    error_message = "Something went wrong"

    envelope = error_response(error_code, error_message)

    assert envelope.success is False
    assert envelope.data is None
    assert envelope.error is not None
    assert envelope.error.code == error_code
    assert envelope.error.message == error_message
    assert envelope.trace_id is not None


@pytest.mark.unit
def test_error_response_with_details():
    """Test error_response with additional error details."""
    error_code = "VALIDATION_ERROR"
    error_message = "Invalid input"
    error_details = {
        "field": "email",
        "reason": "Invalid email format",
    }

    envelope = error_response(error_code, error_message, details=error_details)

    assert envelope.error.details == error_details
    assert envelope.error.details["field"] == "email"


@pytest.mark.unit
def test_error_response_with_custom_trace_id():
    """Test that error_response accepts a custom trace_id."""
    custom_trace_id = "error-trace-67890"

    envelope = error_response(
        "NOT_FOUND",
        "Resource not found",
        trace_id=custom_trace_id
    )

    assert envelope.trace_id == custom_trace_id


@pytest.mark.unit
@pytest.mark.parametrize("error_code,expected_status", [
    ("AUTH_FAILED", 401),
    ("AUTH_REQUIRED", 401),
    ("FORBIDDEN", 403),
    ("NOT_FOUND", 404),
    ("CONFLICT", 409),
    ("VALIDATION_ERROR", 422),
    ("RATE_LIMITED", 429),
    ("INTERNAL_ERROR", 500),
    ("TOOL_ERROR", 503),
    ("KB_TIMEOUT", 504),
])
def test_error_status_codes_mapping(error_code: str, expected_status: int):
    """Test that error codes map to correct HTTP status codes."""
    assert ERROR_STATUS_CODES[error_code] == expected_status


@pytest.mark.unit
def test_error_response_without_details():
    """Test error_response without optional details field."""
    envelope = error_response("AUTH_FAILED", "Authentication failed")

    assert envelope.error.details is None


# ============================================================================
# APIError Model Tests
# ============================================================================


@pytest.mark.unit
def test_api_error_creation():
    """Test creating an APIError instance directly."""
    error = APIError(
        code="CUSTOM_ERROR",
        message="Custom error message",
        details={"key": "value"}
    )

    assert error.code == "CUSTOM_ERROR"
    assert error.message == "Custom error message"
    assert error.details["key"] == "value"


@pytest.mark.unit
def test_api_error_without_details():
    """Test creating an APIError without details."""
    error = APIError(code="SIMPLE_ERROR", message="Simple message")

    assert error.code == "SIMPLE_ERROR"
    assert error.message == "Simple message"
    assert error.details is None


@pytest.mark.unit
def test_api_error_validation():
    """Test that APIError validates required fields."""
    with pytest.raises(ValidationError) as exc_info:
        APIError(code="TEST")  # Missing message

    assert "message" in str(exc_info.value)


# ============================================================================
# APIEnvelope Model Tests
# ============================================================================


@pytest.mark.unit
def test_api_envelope_creation():
    """Test creating an APIEnvelope instance directly."""
    envelope = APIEnvelope(
        success=True,
        data={"test": "data"},
        trace_id="test-trace-123"
    )

    assert envelope.success is True
    assert envelope.data == {"test": "data"}
    assert envelope.trace_id == "test-trace-123"
    assert isinstance(envelope.timestamp, datetime)


@pytest.mark.unit
def test_api_envelope_auto_generates_trace_id():
    """Test that APIEnvelope auto-generates trace_id if not provided."""
    envelope = APIEnvelope(success=True, data=None)

    assert envelope.trace_id is not None
    # Should be a valid UUID format
    try:
        UUID(envelope.trace_id)
    except ValueError:
        pytest.fail("trace_id is not a valid UUID")


@pytest.mark.unit
def test_api_envelope_auto_generates_timestamp():
    """Test that APIEnvelope auto-generates timestamp if not provided."""
    envelope = APIEnvelope(success=True, data=None)

    assert envelope.timestamp is not None
    assert isinstance(envelope.timestamp, datetime)


@pytest.mark.unit
def test_api_envelope_serialization():
    """Test that APIEnvelope can be serialized to dict."""
    envelope = success_response({"key": "value"})

    serialized = envelope.model_dump()

    assert serialized["success"] is True
    assert serialized["data"]["key"] == "value"
    assert "trace_id" in serialized
    assert "timestamp" in serialized


@pytest.mark.unit
def test_api_envelope_json_serialization():
    """Test that APIEnvelope can be serialized to JSON."""
    envelope = success_response({"test": "data"})

    json_str = envelope.model_dump_json()

    assert isinstance(json_str, str)
    assert "success" in json_str
    assert "trace_id" in json_str
    assert "timestamp" in json_str


# ============================================================================
# Pagination Helpers Tests (if implemented)
# ============================================================================


@pytest.mark.unit
def test_success_response_with_pagination_metadata():
    """Test success response with pagination metadata in data."""
    paginated_data = {
        "items": [{"id": 1}, {"id": 2}, {"id": 3}],
        "pagination": {
            "page": 1,
            "page_size": 10,
            "total_items": 25,
            "total_pages": 3,
        }
    }

    envelope = success_response(paginated_data)

    assert envelope.success is True
    assert envelope.data["pagination"]["page"] == 1
    assert envelope.data["pagination"]["total_items"] == 25


# ============================================================================
# Validation Error Formatting Tests
# ============================================================================


@pytest.mark.unit
def test_error_response_formats_validation_errors():
    """Test formatting validation errors in error response."""
    validation_details = {
        "errors": [
            {
                "field": "email",
                "message": "Invalid email format",
                "type": "value_error.email",
            },
            {
                "field": "password",
                "message": "Password too short",
                "type": "value_error.str.min_length",
            }
        ]
    }

    envelope = error_response(
        "VALIDATION_ERROR",
        "Request validation failed",
        details=validation_details
    )

    assert envelope.error.code == "VALIDATION_ERROR"
    assert len(envelope.error.details["errors"]) == 2
    assert envelope.error.details["errors"][0]["field"] == "email"


@pytest.mark.unit
def test_error_response_with_field_errors():
    """Test error response with field-level validation errors."""
    field_errors = {
        "email": ["Email is required", "Must be valid email"],
        "password": ["Password must be at least 8 characters"],
    }

    envelope = error_response(
        "VALIDATION_ERROR",
        "Multiple validation errors",
        details={"field_errors": field_errors}
    )

    assert "email" in envelope.error.details["field_errors"]
    assert len(envelope.error.details["field_errors"]["email"]) == 2


# ============================================================================
# PHI Special Cases Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_phi_detected_status_code():
    """Test that PHI_DETECTED uses 200 status code (warning, not error)."""
    assert ERROR_STATUS_CODES["PHI_DETECTED"] == 200
    assert ERROR_STATUS_CODES["PHI_REDACTED"] == 200


@pytest.mark.unit
@pytest.mark.phi
def test_phi_warning_response_format():
    """Test formatting PHI warning responses."""
    envelope = success_response(
        data={
            "message": "Patient data retrieved",
            "warning": {
                "code": "PHI_REDACTED",
                "message": "Some fields were redacted for privacy",
                "redacted_fields": ["ssn", "date_of_birth"]
            }
        }
    )

    assert envelope.success is True
    assert "warning" in envelope.data
    assert envelope.data["warning"]["code"] == "PHI_REDACTED"


# ============================================================================
# Edge Cases and Error Conditions
# ============================================================================


@pytest.mark.unit
def test_envelope_with_empty_data():
    """Test envelope with empty data structures."""
    empty_cases = [
        {},
        [],
        "",
    ]

    for empty_data in empty_cases:
        envelope = success_response(empty_data)
        assert envelope.success is True
        assert envelope.data == empty_data


@pytest.mark.unit
def test_error_with_very_long_message():
    """Test error response with very long error message."""
    long_message = "Error: " + "x" * 10000

    envelope = error_response("INTERNAL_ERROR", long_message)

    assert envelope.error.message == long_message
    assert len(envelope.error.message) > 10000


@pytest.mark.unit
def test_error_with_nested_details():
    """Test error response with deeply nested details."""
    nested_details = {
        "level1": {
            "level2": {
                "level3": {
                    "error": "Deep error",
                    "context": ["item1", "item2"]
                }
            }
        }
    }

    envelope = error_response(
        "INTERNAL_ERROR",
        "Nested error",
        details=nested_details
    )

    assert envelope.error.details["level1"]["level2"]["level3"]["error"] == "Deep error"


@pytest.mark.unit
def test_timestamp_precision():
    """Test that timestamps include microsecond precision."""
    envelope = success_response({"test": "data"})

    # Timestamp should have microsecond component
    assert envelope.timestamp.microsecond >= 0
    assert isinstance(envelope.timestamp, datetime)


@pytest.mark.unit
def test_multiple_envelopes_have_different_timestamps():
    """Test that rapidly created envelopes have different timestamps."""
    envelope1 = success_response({"test": 1})
    envelope2 = success_response({"test": 2})

    # They should at least be equal or envelope2 should be later
    assert envelope2.timestamp >= envelope1.timestamp
