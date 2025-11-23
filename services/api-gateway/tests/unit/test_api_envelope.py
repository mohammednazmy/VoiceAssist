"""Unit tests for API Envelope helpers."""

from datetime import datetime

from app.core.api_envelope import ErrorCodes, PaginationMetadata, error_response, success_response


class TestSuccessResponse:
    """Tests for success_response helper."""

    def test_basic_success_response(self):
        """Test creating a basic success response."""
        data = {"message": "Operation successful"}

        response = success_response(data)

        assert response["success"] is True
        assert response["data"] == data
        assert response["error"] is None
        assert "timestamp" in response
        assert "metadata" in response

    def test_success_response_with_request_id(self):
        """Test success response includes request ID."""
        data = {"user_id": 123}
        request_id = "test-request-123"

        response = success_response(data, request_id=request_id)

        assert response["metadata"]["request_id"] == request_id

    def test_success_response_with_version(self):
        """Test success response includes API version."""
        data = {"status": "ok"}
        version = "2.1.0"

        response = success_response(data, version=version)

        assert response["metadata"]["version"] == version

    def test_success_response_with_pagination(self):
        """Test success response with pagination metadata."""
        data = {"items": [1, 2, 3]}
        pagination = PaginationMetadata(
            page=1, page_size=10, total_items=50, total_pages=5
        )

        response = success_response(data, pagination=pagination)

        assert response["metadata"]["pagination"] is not None
        assert response["metadata"]["pagination"]["page"] == 1
        assert response["metadata"]["pagination"]["page_size"] == 10
        assert response["metadata"]["pagination"]["total_items"] == 50
        assert response["metadata"]["pagination"]["total_pages"] == 5

    def test_success_response_timestamp_format(self):
        """Test that timestamp is in ISO format with Z suffix."""
        data = {"test": "data"}

        response = success_response(data)

        timestamp = response["timestamp"]
        assert timestamp.endswith("Z")

        # Verify it's a valid ISO timestamp
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        assert isinstance(parsed, datetime)

    def test_success_response_with_list_data(self):
        """Test success response with list data."""
        data = [{"id": 1}, {"id": 2}, {"id": 3}]

        response = success_response(data)

        assert response["success"] is True
        assert response["data"] == data
        assert len(response["data"]) == 3

    def test_success_response_with_none_data(self):
        """Test success response with None data."""
        response = success_response(None)

        assert response["success"] is True
        assert response["data"] is None

    def test_success_response_with_empty_dict(self):
        """Test success response with empty dict."""
        data = {}

        response = success_response(data)

        assert response["success"] is True
        assert response["data"] == {}

    def test_success_response_default_version(self):
        """Test that default version is included."""
        data = {"test": "data"}

        response = success_response(data)

        assert "version" in response["metadata"]
        assert response["metadata"]["version"] == "2.0.0"


class TestErrorResponse:
    """Tests for error_response helper."""

    def test_basic_error_response(self):
        """Test creating a basic error response."""
        code = "TEST_ERROR"
        message = "Something went wrong"

        response = error_response(code, message)

        assert response["success"] is False
        assert response["data"] is None
        assert response["error"]["code"] == code
        assert response["error"]["message"] == message

    def test_error_response_with_details(self):
        """Test error response with additional details."""
        code = "VALIDATION_ERROR"
        message = "Validation failed"
        details = {"field_errors": {"email": "Invalid format"}}

        response = error_response(code, message, details=details)

        assert response["error"]["details"] == details

    def test_error_response_with_field(self):
        """Test error response with field information."""
        code = "FIELD_ERROR"
        message = "Invalid value"
        field = "email"

        response = error_response(code, message, field=field)

        assert response["error"]["field"] == field

    def test_error_response_with_request_id(self):
        """Test error response includes request ID."""
        code = "ERROR"
        message = "Error occurred"
        request_id = "req-456"

        response = error_response(code, message, request_id=request_id)

        assert response["metadata"]["request_id"] == request_id

    def test_error_response_timestamp_format(self):
        """Test that error response timestamp is in ISO format."""
        code = "ERROR"
        message = "Error"

        response = error_response(code, message)

        timestamp = response["timestamp"]
        assert timestamp.endswith("Z")

        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        assert isinstance(parsed, datetime)

    def test_error_response_has_metadata(self):
        """Test that error response includes metadata."""
        code = "ERROR"
        message = "Error"

        response = error_response(code, message)

        assert "metadata" in response
        assert "version" in response["metadata"]

    def test_error_response_none_details(self):
        """Test error response with None details."""
        code = "ERROR"
        message = "Error"

        response = error_response(code, message, details=None)

        assert response["error"]["details"] is None

    def test_error_response_none_field(self):
        """Test error response with None field."""
        code = "ERROR"
        message = "Error"

        response = error_response(code, message, field=None)

        assert response["error"]["field"] is None


class TestErrorCodes:
    """Tests for ErrorCodes constants."""

    def test_error_codes_exist(self):
        """Test that standard error codes are defined."""
        assert hasattr(ErrorCodes, "INVALID_CREDENTIALS")
        assert hasattr(ErrorCodes, "TOKEN_EXPIRED")
        assert hasattr(ErrorCodes, "TOKEN_REVOKED")
        assert hasattr(ErrorCodes, "WEAK_PASSWORD")
        assert hasattr(ErrorCodes, "VALIDATION_ERROR")
        assert hasattr(ErrorCodes, "NOT_FOUND")
        assert hasattr(ErrorCodes, "UNAUTHORIZED")
        assert hasattr(ErrorCodes, "FORBIDDEN")
        assert hasattr(ErrorCodes, "INTERNAL_ERROR")

    def test_error_codes_are_strings(self):
        """Test that error codes are strings."""
        assert isinstance(ErrorCodes.INVALID_CREDENTIALS, str)
        assert isinstance(ErrorCodes.TOKEN_EXPIRED, str)
        assert isinstance(ErrorCodes.VALIDATION_ERROR, str)

    def test_error_codes_format(self):
        """Test that error codes follow expected format (UPPER_SNAKE_CASE)."""
        codes = [
            ErrorCodes.INVALID_CREDENTIALS,
            ErrorCodes.TOKEN_EXPIRED,
            ErrorCodes.VALIDATION_ERROR,
        ]

        for code in codes:
            assert code.isupper()
            assert "_" in code or code.isalpha()

    def test_error_codes_in_error_response(self):
        """Test using error codes in error response."""
        response = error_response(
            ErrorCodes.INVALID_CREDENTIALS, "Invalid username or password"
        )

        assert response["error"]["code"] == ErrorCodes.INVALID_CREDENTIALS


class TestPaginationMetadata:
    """Tests for PaginationMetadata model."""

    def test_create_pagination_metadata(self):
        """Test creating pagination metadata."""
        pagination = PaginationMetadata(
            page=2, page_size=20, total_items=100, total_pages=5
        )

        assert pagination.page == 2
        assert pagination.page_size == 20
        assert pagination.total_items == 100
        assert pagination.total_pages == 5

    def test_pagination_dict_conversion(self):
        """Test converting pagination to dict."""
        pagination = PaginationMetadata(
            page=1, page_size=10, total_items=50, total_pages=5
        )

        data = pagination.model_dump()

        assert data["page"] == 1
        assert data["page_size"] == 10
        assert data["total_items"] == 50
        assert data["total_pages"] == 5

    def test_pagination_metadata_types(self):
        """Test that pagination metadata has correct types."""
        pagination = PaginationMetadata(
            page=1, page_size=10, total_items=50, total_pages=5
        )

        assert isinstance(pagination.page, int)
        assert isinstance(pagination.page_size, int)
        assert isinstance(pagination.total_items, int)
        assert isinstance(pagination.total_pages, int)


class TestAPIEnvelopeIntegration:
    """Integration tests for API envelope patterns."""

    def test_success_and_error_have_same_structure_keys(self):
        """Test that success and error responses have the same top-level keys."""
        success = success_response({"data": "value"})
        error = error_response("ERROR", "message")

        success_keys = set(success.keys())
        error_keys = set(error.keys())

        # Both should have the same structure
        assert success_keys == error_keys

    def test_envelope_consistency(self):
        """Test that envelopes are consistent across different responses."""
        responses = [
            success_response({"test": 1}),
            success_response([1, 2, 3]),
            error_response("ERROR", "message"),
            error_response("OTHER_ERROR", "other message", details={"x": 1}),
        ]

        required_keys = {"success", "data", "error", "metadata", "timestamp"}

        for response in responses:
            assert set(response.keys()) == required_keys

    def test_mutually_exclusive_data_and_error(self):
        """Test that data and error are mutually exclusive."""
        success = success_response({"data": "value"})
        error = error_response("ERROR", "message")

        # Success should have data, no error
        assert success["data"] is not None
        assert success["error"] is None

        # Error should have error, no data
        assert error["error"] is not None
        assert error["data"] is None

    def test_envelope_with_complex_data(self):
        """Test envelope with complex nested data."""
        complex_data = {
            "users": [
                {"id": 1, "name": "Alice", "metadata": {"role": "admin"}},
                {"id": 2, "name": "Bob", "metadata": {"role": "user"}},
            ],
            "total": 2,
            "filters": {"active": True},
        }

        response = success_response(complex_data)

        assert response["success"] is True
        assert response["data"] == complex_data
        assert response["data"]["users"][0]["name"] == "Alice"

    def test_error_with_nested_details(self):
        """Test error response with nested details."""
        details = {
            "validation_errors": {
                "email": ["Invalid format", "Already exists"],
                "password": ["Too short"],
            },
            "suggestions": ["Use a valid email", "Choose a longer password"],
        }

        response = error_response(
            ErrorCodes.VALIDATION_ERROR, "Validation failed", details=details
        )

        assert response["error"]["details"] == details
        assert len(response["error"]["details"]["validation_errors"]["email"]) == 2
