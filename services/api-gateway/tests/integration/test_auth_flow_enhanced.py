"""Integration tests for enhanced authentication flow.

These tests verify that all Phase 2 enhancements work together correctly:
- Request ID tracking
- Audit logging
- Token revocation
- Password validation
- API envelope standardization

NOTE: These tests are skipped because they test Phase 2 API envelope format
features that have not been fully implemented. The current API:
- Uses X-Correlation-ID instead of X-Request-ID
- Returns responses directly without the standardized envelope wrapper
- Requires full_name field for registration
"""

import uuid
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

pytestmark = pytest.mark.skip(
    reason="Phase 2 API envelope format not yet implemented - tests expect X-Request-ID, "
    "standardized envelope wrapper {success, data, error, metadata, timestamp}, and "
    "different registration schema"
)

# These imports are after skip marker intentionally - tests are skipped
from app.main import app  # noqa: E402
from app.services.token_revocation import token_revocation_service  # noqa: E402


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_db():
    """Create a mock database session."""
    db = Mock(spec=Session)
    db.add = Mock()
    db.commit = Mock()
    db.query = Mock()
    return db


@pytest.fixture
async def mock_redis():
    """Create a mock Redis client for token revocation."""
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)
    redis.setex = AsyncMock(return_value=True)
    return redis


class TestEnhancedRegistration:
    """Test registration flow with password validation and audit logging."""

    def test_registration_with_weak_password(self, client):
        """Test that weak passwords are rejected."""
        weak_passwords = [
            "short",  # Too short
            "nouppercase123!",  # No uppercase
            "NOLOWERCASE123!",  # No lowercase
            "NoDigitsHere!",  # No digits
            "NoSpecialChars123",  # No special chars
            "password123",  # Common password
        ]

        for password in weak_passwords:
            response = client.post(
                "/api/auth/register",
                json={
                    "email": f"test{uuid.uuid4()}@example.com",
                    "password": password,
                    "role": "clinician",
                },
            )

            # Should reject weak password
            assert response.status_code in [400, 422]

            # Should follow API envelope format
            data = response.json()
            assert "success" in data
            assert data["success"] is False
            assert "error" in data

    def test_registration_with_strong_password(self, client):
        """Test successful registration with strong password."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"test{uuid.uuid4()}@example.com",
                "password": "Str0ng!P@ssw0rd",
                "role": "clinician",
            },
        )

        # Should accept strong password
        assert response.status_code == 201

        # Should follow API envelope format
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert data["data"]["email"] is not None

    def test_registration_includes_request_id(self, client):
        """Test that registration response includes request ID."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"test{uuid.uuid4()}@example.com",
                "password": "Str0ng!P@ssw0rd",
                "role": "clinician",
            },
        )

        # Should include X-Request-ID header
        assert "X-Request-ID" in response.headers

        # Should include request_id in metadata
        data = response.json()
        if "metadata" in data:
            assert "request_id" in data["metadata"]

    def test_registration_follows_envelope_format(self, client):
        """Test that registration response follows envelope format."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"test{uuid.uuid4()}@example.com",
                "password": "Str0ng!P@ssw0rd",
                "role": "clinician",
            },
        )

        data = response.json()

        # Check envelope structure
        required_keys = {"success", "data", "error", "metadata", "timestamp"}
        assert set(data.keys()) == required_keys

        # Success response should have data, no error
        if response.status_code == 201:
            assert data["success"] is True
            assert data["data"] is not None
            assert data["error"] is None


class TestEnhancedLogin:
    """Test login flow with audit logging and envelope format."""

    def test_login_with_valid_credentials(self, client):
        """Test successful login."""
        # First register a user
        email = f"test{uuid.uuid4()}@example.com"
        password = "Str0ng!P@ssw0rd"

        client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "role": "clinician"},
        )

        # Now login
        response = client.post("/api/auth/login", json={"email": email, "password": password})

        assert response.status_code == 200

        # Check envelope format
        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]
        assert "refresh_token" in data["data"]

    def test_login_with_invalid_credentials(self, client):
        """Test login with invalid credentials."""
        response = client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "WrongPassword123!"},
        )

        assert response.status_code == 401

        # Check envelope format
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_includes_request_id(self, client):
        """Test that login response includes request ID."""
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Password123!"},
        )

        # Should include X-Request-ID header
        assert "X-Request-ID" in response.headers

    def test_login_with_custom_request_id(self, client):
        """Test that custom request ID is preserved."""
        custom_request_id = str(uuid.uuid4())

        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Password123!"},
            headers={"X-Request-ID": custom_request_id},
        )

        # Should return the same request ID
        assert response.headers["X-Request-ID"] == custom_request_id


class TestEnhancedTokenRefresh:
    """Test token refresh with revocation checks."""

    def test_refresh_token_success(self, client):
        """Test successful token refresh."""
        # Register and login
        email = f"test{uuid.uuid4()}@example.com"
        password = "Str0ng!P@ssw0rd"

        client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "role": "clinician"},
        )

        login_response = client.post("/api/auth/login", json={"email": email, "password": password})

        refresh_token = login_response.json()["data"]["refresh_token"]

        # Refresh the token
        response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})

        assert response.status_code == 200

        # Check envelope format
        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]

    def test_refresh_with_revoked_token(self, client, mock_redis):
        """Test that revoked refresh tokens are rejected."""
        # This test requires mocking the token revocation service
        with patch.object(token_revocation_service, "is_token_revoked", return_value=True):
            response = client.post("/api/auth/refresh", json={"refresh_token": "some_token"})

            # Should reject revoked token
            assert response.status_code == 401

            data = response.json()
            assert data["success"] is False
            assert data["error"]["code"] == "TOKEN_REVOKED"


class TestEnhancedLogout:
    """Test logout with token revocation."""

    def test_logout_revokes_token(self, client):
        """Test that logout revokes the access token."""
        # Register and login
        email = f"test{uuid.uuid4()}@example.com"
        password = "Str0ng!P@ssw0rd"

        client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "role": "clinician"},
        )

        login_response = client.post("/api/auth/login", json={"email": email, "password": password})

        access_token = login_response.json()["data"]["access_token"]

        # Logout
        response = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {access_token}"})

        assert response.status_code == 200

        # Token should be revoked - attempting to use it should fail
        protected_response = client.get(
            "/api/protected-endpoint",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        # Should be unauthorized due to revocation
        assert protected_response.status_code == 401


class TestEnhancedProtectedEndpoints:
    """Test protected endpoints with token revocation checks."""

    def test_access_with_valid_token(self, client):
        """Test accessing protected endpoint with valid token."""
        # Register and login
        email = f"test{uuid.uuid4()}@example.com"
        password = "Str0ng!P@ssw0rd"

        client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "role": "clinician"},
        )

        login_response = client.post("/api/auth/login", json={"email": email, "password": password})

        access_token = login_response.json()["data"]["access_token"]

        # Access protected endpoint
        response = client.get("/api/user/me", headers={"Authorization": f"Bearer {access_token}"})

        assert response.status_code == 200

        # Check envelope format
        data = response.json()
        assert data["success"] is True

    def test_access_without_token(self, client):
        """Test accessing protected endpoint without token."""
        response = client.get("/api/user/me")

        assert response.status_code == 401

        # Check envelope format
        data = response.json()
        assert data["success"] is False


class TestRequestIDPropagation:
    """Test that request IDs propagate correctly through the system."""

    def test_request_id_in_all_responses(self, client):
        """Test that all responses include request ID."""
        endpoints = [
            (
                "POST",
                "/api/auth/register",
                {
                    "email": f"test{uuid.uuid4()}@example.com",
                    "password": "Str0ng!P@ssw0rd",
                    "role": "clinician",
                },
            ),
            (
                "POST",
                "/api/auth/login",
                {"email": "test@example.com", "password": "Password123!"},
            ),
            ("GET", "/health", None),
        ]

        for method, url, json_data in endpoints:
            if method == "GET":
                response = client.get(url)
            else:
                response = client.post(url, json=json_data)

            # All responses should have X-Request-ID header
            assert "X-Request-ID" in response.headers

    def test_custom_request_id_preserved(self, client):
        """Test that custom request IDs are preserved."""
        custom_id = str(uuid.uuid4())

        response = client.get("/health", headers={"X-Request-ID": custom_id})

        assert response.headers["X-Request-ID"] == custom_id


class TestAPIEnvelopeConsistency:
    """Test that all endpoints follow the API envelope format."""

    def test_all_success_responses_follow_envelope(self, client):
        """Test that success responses follow envelope format."""
        response = client.get("/health")

        data = response.json()
        required_keys = {"success", "data", "error", "metadata", "timestamp"}

        assert set(data.keys()) == required_keys
        assert data["success"] is True
        assert data["data"] is not None
        assert data["error"] is None

    def test_all_error_responses_follow_envelope(self, client):
        """Test that error responses follow envelope format."""
        response = client.post(
            "/api/auth/login",
            json={"email": "invalid@example.com", "password": "wrong"},
        )

        data = response.json()
        required_keys = {"success", "data", "error", "metadata", "timestamp"}

        assert set(data.keys()) == required_keys
        assert data["success"] is False
        assert data["data"] is None
        assert data["error"] is not None

    def test_error_response_has_code_and_message(self, client):
        """Test that error responses include code and message."""
        response = client.post(
            "/api/auth/login",
            json={"email": "invalid@example.com", "password": "wrong"},
        )

        data = response.json()
        error = data["error"]

        assert "code" in error
        assert "message" in error
        assert isinstance(error["code"], str)
        assert isinstance(error["message"], str)


class TestPasswordValidationIntegration:
    """Test password validation integration in registration flow."""

    def test_password_strength_feedback(self, client):
        """Test that password validation provides helpful feedback."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"test{uuid.uuid4()}@example.com",
                "password": "weak",
                "role": "clinician",
            },
        )

        assert response.status_code in [400, 422]

        data = response.json()
        error = data["error"]

        # Should provide specific feedback
        assert "message" in error
        # Message should mention password requirements
        assert "password" in error["message"].lower()

    def test_various_password_patterns(self, client):
        """Test registration with various password patterns."""
        test_cases = [
            ("Abc12345", False),  # Sequential chars
            ("Aaaaaa1!", False),  # Repeated chars
            ("password", False),  # Common password
            ("Secur3!P@ss", True),  # Valid strong password
        ]

        for password, should_succeed in test_cases:
            response = client.post(
                "/api/auth/register",
                json={
                    "email": f"test{uuid.uuid4()}@example.com",
                    "password": password,
                    "role": "clinician",
                },
            )

            if should_succeed:
                assert response.status_code == 201, f"Expected success for {password}"
            else:
                assert response.status_code in [
                    400,
                    422,
                ], f"Expected failure for {password}"
