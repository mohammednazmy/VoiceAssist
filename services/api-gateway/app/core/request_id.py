"""
Request ID middleware for distributed tracing and debugging.

Adds a unique correlation ID to every request for tracking across services.
"""
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adds a unique request ID to every request.

    The request ID can be:
    1. Provided by the client via X-Request-ID header
    2. Auto-generated if not provided

    The ID is then:
    - Added to request.state for access in route handlers
    - Returned in the X-Request-ID response header
    - Included in all logs for that request
    """

    async def dispatch(self, request: Request, call_next: Callable):
        # Check if client provided a request ID
        request_id = request.headers.get("X-Request-ID")

        # Generate one if not provided
        if not request_id:
            request_id = str(uuid.uuid4())

        # Store in request state for access in route handlers
        request.state.request_id = request_id

        # Call the next middleware/route handler
        response = await call_next(request)

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        return response


def get_request_id(request: Request) -> str:
    """
    Helper function to get the request ID from the current request.

    Usage in route handlers:
    ```python
    @router.get("/example")
    async def example(request: Request):
        request_id = get_request_id(request)
        logger.info("Processing request", extra={"request_id": request_id})
    ```
    """
    return getattr(request.state, "request_id", "unknown")
