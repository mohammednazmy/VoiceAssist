"""Unit tests for API Envelope helpers.

Tests the standardized response format including:
- Success and error response creation
- Metadata inclusion (request_id, timestamp)
- Pagination helpers
- Validation error formatting
"""
from __future__ import annotations

from datetime import datetime, timezone
import re

import pytest

from app.core.api_envelope import (
    APIEnvelope,
    ErrorDetail,
    PaginationMetadata,
    ErrorCodes,
    success_response,
    error_response,
    validation_error_response,
)


# ============================================================================
# Success Response Tests
# ============================================================================


@pytest.mark.unit
def test_success_response_returns_correct_format():
    """Test that success_response creates a properly formatted dict."""
    test_data = {"message": "Hello, World!"}

    response = success_response(test_data)

    assert response["success"] is True
    assert response["data"] == test_data
    assert response["error"] is None
    assert "timestamp" in response
    # Timestamp should be ISO 8601 format with Z
    assert response["timestamp"].endswith("Z")


@pytest.mark.unit
def test_success_response_with_custom_request_id():
    """Test that success_response accepts a custom request_id."""
    test_data = {"result": "success"}
    custom_request_id = "custom-request-12345"

    response = success_response(test_data, request_id=custom_request_id)

    assert response["metadata"]["request_id"] == custom_request_id
    assert response["success"] is True


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

    response = success_response(complex_data)

    assert response["success"] is True
    assert response["data"] == complex_data
    assert response["data"]["users"][0]["name"] == "Alice"


@pytest.mark.unit
def test_success_response_with_none_data():
    """Test that success_response can handle None as data."""
    response = success_response(None)

    assert response["success"] is True
    assert response["data"] is None


@pytest.mark.unit
def test_success_response_with_pagination():
    """Test success_response with pagination metadata."""
    test_data = {"items": [1, 2, 3]}
    pagination = PaginationMetadata(
        page=1,
        page_size=10,
        total_items=25,
        total_pages=3
    )

    response = success_response(test_data, pagination=pagination)

    assert response["success"] is True
    assert "pagination" in response["metadata"]
    assert response["metadata"]["pagination"]["page"] == 1
    assert response["metadata"]["pagination"]["total_pages"] == 3
    assert response["metadata"]["pagination"]["has_next"] is True
    assert response["metadata"]["pagination"]["has_prev"] is False


# ============================================================================
# Error Response Tests
# ============================================================================


@pytest.mark.unit
def test_error_response_returns_correct_format():
    """Test that error_response creates a properly formatted dict."""
    error_code = "INTERNAL_ERROR"
    error_message = "Something went wrong"

    response = error_response(error_code, error_message)

    assert response["success"] is False
    assert response["data"] is None
    assert response["error"] is not None
    assert response["error"]["code"] == error_code
    assert response["error"]["message"] == error_message
    assert "timestamp" in response


@pytest.mark.unit
def test_error_response_with_details():
    """Test error_response with additional error details."""
    error_code = "VALIDATION_ERROR"
    error_message = "Validation failed"
    error_details = {"field": "email", "issue": "invalid format"}

    response = error_response(
        code=error_code,
        message=error_message,
        details=error_details
    )

    assert response["success"] is False
    assert response["error"]["code"] == error_code
    assert response["error"]["message"] == error_message
    assert response["error"]["details"] == error_details


@pytest.mark.unit
def test_error_response_with_field():
    """Test error_response with field parameter for field-specific errors."""
    response = error_response(
        code="INVALID_EMAIL",
        message="Email format is invalid",
        field="email"
    )

    assert response["error"]["field"] == "email"


@pytest.mark.unit
def test_validation_error_response():
    """Test validation_error_response for multiple field errors."""
    errors = [
        {"field": "email", "message": "Invalid email format"},
        {"field": "password", "message": "Password too short"},
    ]

    response = validation_error_response(errors)

    assert response["success"] is False
    assert response["error"]["code"] == "VALIDATION_ERROR"
    assert response["error"]["message"] == "One or more fields failed validation"
    assert response["error"]["details"]["errors"] == errors


# ============================================================================
# Pagination Metadata Tests
# ============================================================================


@pytest.mark.unit
def test_pagination_metadata_computes_flags():
    """Test that PaginationMetadata automatically computes has_next and has_prev."""
    # First page
    pagination = PaginationMetadata(
        page=1,
        page_size=10,
        total_items=25,
        total_pages=3
    )
    assert pagination.has_next is True
    assert pagination.has_prev is False

    # Middle page
    pagination = PaginationMetadata(
        page=2,
        page_size=10,
        total_items=25,
        total_pages=3
    )
    assert pagination.has_next is True
    assert pagination.has_prev is True

    # Last page
    pagination = PaginationMetadata(
        page=3,
        page_size=10,
        total_items=25,
        total_pages=3
    )
    assert pagination.has_next is False
    assert pagination.has_prev is True


# ============================================================================
# Error Codes Tests
# ============================================================================


@pytest.mark.unit
def test_error_codes_constants():
    """Test that ErrorCodes class has expected constants."""
    # Authentication errors
    assert hasattr(ErrorCodes, "INVALID_CREDENTIALS")
    assert hasattr(ErrorCodes, "TOKEN_EXPIRED")
    assert hasattr(ErrorCodes, "TOKEN_INVALID")
    assert hasattr(ErrorCodes, "UNAUTHORIZED")

    # Validation errors
    assert hasattr(ErrorCodes, "VALIDATION_ERROR")
    assert hasattr(ErrorCodes, "INVALID_PASSWORD")
    assert hasattr(ErrorCodes, "EMAIL_ALREADY_EXISTS")

    # Resource errors
    assert hasattr(ErrorCodes, "NOT_FOUND")
    assert hasattr(ErrorCodes, "USER_NOT_FOUND")

    # Server errors
    assert hasattr(ErrorCodes, "INTERNAL_ERROR")
    assert hasattr(ErrorCodes, "DATABASE_ERROR")


@pytest.mark.unit
def test_error_codes_usage():
    """Test using ErrorCodes in error_response."""
    response = error_response(
        code=ErrorCodes.INVALID_CREDENTIALS,
        message="Invalid email or password"
    )

    assert response["error"]["code"] == "INVALID_CREDENTIALS"


# ============================================================================
# Timestamp Format Tests
# ============================================================================


@pytest.mark.unit
def test_timestamp_format():
    """Test that timestamps are in ISO 8601 format with Z suffix."""
    response = success_response({"test": "data"})
    timestamp = response["timestamp"]

    # Should be ISO format ending with Z
    assert timestamp.endswith("Z")
    # Should be parseable as datetime
    # Remove Z and parse
    dt_str = timestamp.rstrip("Z")
    dt = datetime.fromisoformat(dt_str)
    assert isinstance(dt, datetime)


# ============================================================================
# Metadata Tests
# ============================================================================


@pytest.mark.unit
def test_success_response_with_extra_metadata():
    """Test success_response with additional metadata fields."""
    response = success_response(
        {"test": "data"},
        request_id="req-123",
        custom_field="custom_value"
    )

    assert response["metadata"]["version"] == "2.0.0"
    assert response["metadata"]["request_id"] == "req-123"
    assert response["metadata"]["custom_field"] == "custom_value"


@pytest.mark.unit
def test_error_response_with_extra_metadata():
    """Test error_response with additional metadata fields."""
    response = error_response(
        code="TEST_ERROR",
        message="Test error message",
        request_id="req-456",
        custom_meta="value"
    )

    assert response["metadata"]["version"] == "2.0.0"
    assert response["metadata"]["request_id"] == "req-456"
    assert response["metadata"]["custom_meta"] == "value"
