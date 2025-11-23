"""
Standard API response envelope for consistent responses across all endpoints.

All API responses should use this envelope for consistency and easier client handling.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class APIEnvelope(BaseModel):
    """
    Standard API response envelope.

    Wraps all API responses in a consistent structure with metadata.
    """

    success: bool
    data: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "data": {"user_id": "123", "email": "user@example.com"},
                "error": None,
                "metadata": {
                    "request_id": "550e8400-e29b-41d4-a716-446655440000",
                    "version": "2.0.0",
                },
                "timestamp": "2025-11-21T00:00:00.000Z",
            }
        }
    )


class ErrorDetail(BaseModel):
    """Detailed error information."""

    code: str  # Machine-readable error code (e.g., "INVALID_PASSWORD")
    message: str  # Human-readable error message
    details: Optional[Dict[str, Any]] = None  # Additional error details
    field: Optional[str] = None  # Field name if validation error


class PaginationMetadata(BaseModel):
    """Pagination metadata for list responses."""

    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: Optional[bool] = None
    has_prev: Optional[bool] = None

    @model_validator(mode="after")
    def compute_pagination_flags(self):
        """Automatically compute has_next and has_prev if not provided."""
        if self.has_next is None:
            self.has_next = self.page < self.total_pages
        if self.has_prev is None:
            self.has_prev = self.page > 1
        return self


def success_response(
    data: Any,
    request_id: Optional[str] = None,
    version: str = "2.0.0",
    pagination: Optional[PaginationMetadata] = None,
    **extra_metadata
) -> Dict[str, Any]:
    """
    Create a successful API response.

    Args:
        data: Response data
        request_id: Request correlation ID
        version: API version
        pagination: Pagination metadata (if applicable)
        extra_metadata: Additional metadata fields

    Returns:
        API envelope dictionary
    """
    metadata = {
        "version": version,
        **({"request_id": request_id} if request_id else {}),
        **({"pagination": pagination.model_dump()} if pagination else {}),
        **extra_metadata,
    }

    return {
        "success": True,
        "data": data,
        "error": None,
        "metadata": metadata if metadata else None,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    field: Optional[str] = None,
    request_id: Optional[str] = None,
    version: str = "2.0.0",
    **extra_metadata
) -> Dict[str, Any]:
    """
    Create an error API response.

    Args:
        code: Machine-readable error code (e.g., "INVALID_PASSWORD")
        message: Human-readable error message
        details: Additional error details
        field: Field name if validation error
        request_id: Request correlation ID
        version: API version
        extra_metadata: Additional metadata fields

    Returns:
        API envelope dictionary
    """
    metadata = {
        "version": version,
        **({"request_id": request_id} if request_id else {}),
        **extra_metadata,
    }

    error = {"code": code, "message": message, "details": details, "field": field}

    return {
        "success": False,
        "data": None,
        "error": error,
        "metadata": metadata if metadata else None,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def validation_error_response(
    errors: List[Dict[str, Any]],
    request_id: Optional[str] = None,
    version: str = "2.0.0",
) -> Dict[str, Any]:
    """
    Create a validation error response for multiple field errors.

    Args:
        errors: List of validation errors [{field, message}, ...]
        request_id: Request correlation ID
        version: API version

    Returns:
        API envelope dictionary
    """
    return error_response(
        code="VALIDATION_ERROR",
        message="One or more fields failed validation",
        details={"errors": errors},
        request_id=request_id,
        version=version,
    )


# Common error codes
class ErrorCodes:
    """Standard error codes for consistent error handling."""

    # Authentication errors (401)
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_INVALID = "TOKEN_INVALID"
    TOKEN_REVOKED = "TOKEN_REVOKED"
    UNAUTHORIZED = "UNAUTHORIZED"

    # Authorization errors (403)
    FORBIDDEN = "FORBIDDEN"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"

    # Validation errors (400)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_PASSWORD = "INVALID_PASSWORD"
    WEAK_PASSWORD = "WEAK_PASSWORD"
    EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"
    INVALID_EMAIL = "INVALID_EMAIL"

    # Resource errors (404)
    NOT_FOUND = "NOT_FOUND"
    USER_NOT_FOUND = "USER_NOT_FOUND"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"

    # Rate limiting (429)
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"

    # Server errors (500)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
