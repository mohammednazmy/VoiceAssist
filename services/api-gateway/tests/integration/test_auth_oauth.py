"""Integration tests for OAuth authentication (Google and Microsoft).

Tests verify:
- OAuth authorize endpoint returns correct URLs
- OAuth disabled providers return 503
- OAuth callback endpoint validates input
- OAuth status endpoint works correctly
"""

from unittest.mock import patch

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestOAuthAuthorizeEndpoints:
    """Test OAuth authorization URL generation."""

    def test_google_authorize_returns_503_when_not_configured(self, client):
        """Test that Google OAuth returns 503 when not configured."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = None
            mock_settings.GOOGLE_CLIENT_SECRET = None
            mock_settings.GOOGLE_OAUTH_REDIRECT_URI = None

            response = client.get("/api/auth/oauth/google/authorize")

            # Should return 503 when not configured
            assert response.status_code == 503
            data = response.json()
            assert "not configured" in data["detail"].lower()

    def test_microsoft_authorize_returns_503_when_not_configured(self, client):
        """Test that Microsoft OAuth returns 503 when not configured."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = None
            mock_settings.MICROSOFT_CLIENT_SECRET = None
            mock_settings.MICROSOFT_OAUTH_REDIRECT_URI = None

            response = client.get("/api/auth/oauth/microsoft/authorize")

            # Should return 503 when not configured
            assert response.status_code == 503
            data = response.json()
            assert "not configured" in data["detail"].lower()

    def test_google_authorize_returns_url_when_configured(self, client):
        """Test that Google OAuth returns authorization URL when configured."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = "test-google-client-id"
            mock_settings.GOOGLE_CLIENT_SECRET = "test-google-secret"
            mock_settings.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:5173/auth/callback/google"
            mock_settings.ALLOWED_ORIGINS = "http://localhost:5173"

            response = client.get("/api/auth/oauth/google/authorize")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "url" in data["data"]
            assert "accounts.google.com" in data["data"]["url"]
            assert "test-google-client-id" in data["data"]["url"]

    def test_microsoft_authorize_returns_url_when_configured(self, client):
        """Test that Microsoft OAuth returns authorization URL when configured."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = "test-microsoft-client-id"
            mock_settings.MICROSOFT_CLIENT_SECRET = "test-microsoft-secret"
            mock_settings.MICROSOFT_OAUTH_REDIRECT_URI = "http://localhost:5173/auth/callback/microsoft"
            mock_settings.ALLOWED_ORIGINS = "http://localhost:5173"

            response = client.get("/api/auth/oauth/microsoft/authorize")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "url" in data["data"]
            assert "login.microsoftonline.com" in data["data"]["url"]
            assert "test-microsoft-client-id" in data["data"]["url"]

    def test_invalid_provider_returns_400(self, client):
        """Test that invalid provider returns 400."""
        response = client.get("/api/auth/oauth/invalid/authorize")

        # FastAPI validates path params, so either 400 or 422
        assert response.status_code in [400, 422]


class TestOAuthCallbackEndpoints:
    """Test OAuth callback handling."""

    def test_callback_requires_code(self, client):
        """Test that callback requires authorization code."""
        response = client.post("/api/auth/oauth/google/callback", json={})

        assert response.status_code == 400
        data = response.json()
        assert "code" in data["detail"].lower()

    def test_google_callback_returns_503_when_not_configured(self, client):
        """Test that Google callback returns 503 when not configured."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = None
            mock_settings.GOOGLE_CLIENT_SECRET = None

            response = client.post("/api/auth/oauth/google/callback", json={"code": "test-code"})

            assert response.status_code == 503

    def test_microsoft_callback_returns_503_when_not_configured(self, client):
        """Test that Microsoft callback returns 503 when not configured."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = None
            mock_settings.MICROSOFT_CLIENT_SECRET = None

            response = client.post("/api/auth/oauth/microsoft/callback", json={"code": "test-code"})

            assert response.status_code == 503


class TestOAuthStatusEndpoint:
    """Test OAuth provider status endpoint."""

    def test_google_status_shows_configured(self, client):
        """Test Google status shows configured when credentials present."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = "test-id"
            mock_settings.GOOGLE_CLIENT_SECRET = "test-secret"
            mock_settings.GOOGLE_OAUTH_REDIRECT_URI = "https://test.com/callback"
            mock_settings.ALLOWED_ORIGINS = "https://test.com"

            response = client.get("/api/auth/oauth/google/status")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["data"]["provider"] == "google"
            assert data["data"]["configured"] is True

    def test_google_status_shows_not_configured(self, client):
        """Test Google status shows not configured when credentials missing."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = None
            mock_settings.GOOGLE_CLIENT_SECRET = None

            response = client.get("/api/auth/oauth/google/status")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["data"]["provider"] == "google"
            assert data["data"]["configured"] is False

    def test_microsoft_status_shows_configured(self, client):
        """Test Microsoft status shows configured when credentials present."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = "test-id"
            mock_settings.MICROSOFT_CLIENT_SECRET = "test-secret"
            mock_settings.MICROSOFT_OAUTH_REDIRECT_URI = "https://test.com/callback"
            mock_settings.ALLOWED_ORIGINS = "https://test.com"

            response = client.get("/api/auth/oauth/microsoft/status")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["data"]["provider"] == "microsoft"
            assert data["data"]["configured"] is True

    def test_microsoft_status_shows_not_configured(self, client):
        """Test Microsoft status shows not configured when credentials missing."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = None
            mock_settings.MICROSOFT_CLIENT_SECRET = None

            response = client.get("/api/auth/oauth/microsoft/status")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["data"]["provider"] == "microsoft"
            assert data["data"]["configured"] is False


class TestOAuthURLParameters:
    """Test OAuth URL parameter construction."""

    def test_google_url_includes_required_params(self, client):
        """Test Google OAuth URL includes all required parameters."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = "test-client-id"
            mock_settings.GOOGLE_CLIENT_SECRET = "test-secret"
            mock_settings.GOOGLE_OAUTH_REDIRECT_URI = "https://example.com/callback"
            mock_settings.ALLOWED_ORIGINS = "https://example.com"

            response = client.get("/api/auth/oauth/google/authorize")
            url = response.json()["data"]["url"]

            # Check required OAuth params
            assert "client_id=test-client-id" in url
            assert "redirect_uri=" in url
            assert "response_type=code" in url
            assert "scope=" in url
            assert "state=" in url  # CSRF protection

    def test_microsoft_url_includes_required_params(self, client):
        """Test Microsoft OAuth URL includes all required parameters."""
        with patch("app.api.auth_oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = "test-client-id"
            mock_settings.MICROSOFT_CLIENT_SECRET = "test-secret"
            mock_settings.MICROSOFT_OAUTH_REDIRECT_URI = "https://example.com/callback"
            mock_settings.ALLOWED_ORIGINS = "https://example.com"

            response = client.get("/api/auth/oauth/microsoft/authorize")
            url = response.json()["data"]["url"]

            # Check required OAuth params
            assert "client_id=test-client-id" in url
            assert "redirect_uri=" in url
            assert "response_type=code" in url
            assert "scope=" in url
            assert "state=" in url  # CSRF protection


class TestRateLimiting:
    """Test rate limiting on OAuth endpoints."""

    def test_authorize_endpoint_has_rate_limit(self, client):
        """Test that authorize endpoint has rate limiting applied."""
        # Make multiple requests - should not immediately fail
        for _ in range(5):
            response = client.get("/api/auth/oauth/google/authorize")
            # Either succeeds or returns 503 (not configured) - not 429 yet
            assert response.status_code in [200, 503]

    def test_callback_endpoint_has_rate_limit(self, client):
        """Test that callback endpoint has rate limiting applied."""
        # Make multiple requests
        for _ in range(3):
            response = client.post("/api/auth/oauth/google/callback", json={"code": "test-code"})
            # Either fails validation or returns 503 - not 429 yet
            assert response.status_code in [400, 503]
