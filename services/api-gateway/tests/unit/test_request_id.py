"""Unit tests for Request ID middleware."""
import pytest
import uuid
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from app.core.request_id import RequestIDMiddleware, get_request_id


@pytest.fixture
def app():
    """Create a test FastAPI app with RequestIDMiddleware."""
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    @app.get("/test")
    async def test_endpoint(request: Request):
        request_id = get_request_id(request)
        return {"request_id": request_id}

    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


def test_request_id_auto_generation(client):
    """Test that request ID is auto-generated when not provided."""
    response = client.get("/test")
    assert response.status_code == 200

    # Check response header
    assert "X-Request-ID" in response.headers
    request_id = response.headers["X-Request-ID"]

    # Validate it's a valid UUID
    try:
        uuid.UUID(request_id)
        is_valid_uuid = True
    except ValueError:
        is_valid_uuid = False

    assert is_valid_uuid, f"Request ID '{request_id}' is not a valid UUID"

    # Check response body
    data = response.json()
    assert data["request_id"] == request_id


def test_request_id_from_client(client):
    """Test that client-provided request ID is used."""
    client_request_id = str(uuid.uuid4())

    response = client.get("/test", headers={"X-Request-ID": client_request_id})
    assert response.status_code == 200

    # Check that the same request ID is returned
    assert response.headers["X-Request-ID"] == client_request_id

    data = response.json()
    assert data["request_id"] == client_request_id


def test_request_id_consistency_across_calls(client):
    """Test that each request gets a unique request ID."""
    response1 = client.get("/test")
    response2 = client.get("/test")

    request_id1 = response1.headers["X-Request-ID"]
    request_id2 = response2.headers["X-Request-ID"]

    # Each request should have a different ID
    assert request_id1 != request_id2


def test_get_request_id_helper_with_missing_id():
    """Test get_request_id helper when request ID is not set."""
    # Create a mock request without request_id in state
    class MockRequest:
        class State:
            pass
        state = State()

    request = MockRequest()
    request_id = get_request_id(request)

    # Should return 'unknown' as fallback
    assert request_id == "unknown"


def test_request_id_propagation():
    """Test that request ID is properly stored in request.state."""
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    received_request_ids = []

    @app.get("/capture")
    async def capture_endpoint(request: Request):
        # Access request.state.request_id directly
        request_id = getattr(request.state, "request_id", None)
        received_request_ids.append(request_id)
        return {"ok": True}

    client = TestClient(app)
    response = client.get("/capture")

    assert response.status_code == 200
    assert len(received_request_ids) == 1
    assert received_request_ids[0] is not None

    # Should be a valid UUID
    try:
        uuid.UUID(received_request_ids[0])
        is_valid = True
    except ValueError:
        is_valid = False

    assert is_valid


def test_request_id_with_custom_non_uuid_value(client):
    """Test that non-UUID custom request IDs are accepted."""
    custom_id = "custom-request-123"

    response = client.get("/test", headers={"X-Request-ID": custom_id})
    assert response.status_code == 200

    # Should accept and return the custom ID
    assert response.headers["X-Request-ID"] == custom_id

    data = response.json()
    assert data["request_id"] == custom_id
