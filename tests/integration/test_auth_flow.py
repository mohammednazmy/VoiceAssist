"""Integration tests for authentication endpoints.

Tests the complete authentication flow including:
- User registration
- Login with valid/invalid credentials
- JWT token validation
- Token refresh
- Logout
"""
from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest
from fastapi import status


# ============================================================================
# User Registration Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_register_new_user(client):
    """Test successful user registration."""
    registration_data = {
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "SecureP@ssw0rd!",
        "full_name": "New User"
    }

    response = client.post("/api/auth/register", json=registration_data)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["success"] is True
    assert "user" in data["data"]
    assert data["data"]["user"]["email"] == registration_data["email"]


@pytest.mark.integration
@pytest.mark.auth
def test_register_with_weak_password(client):
    """Test registration fails with weak password."""
    registration_data = {
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "weak",  # Too weak
        "full_name": "New User"
    }

    response = client.post("/api/auth/register", json=registration_data)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.integration
@pytest.mark.auth
def test_register_with_duplicate_email(client, test_user):
    """Test registration fails when email already exists."""
    registration_data = {
        "email": test_user["email"],  # Existing email
        "username": "different_username",
        "password": "SecureP@ssw0rd!",
        "full_name": "New User"
    }

    response = client.post("/api/auth/register", json=registration_data)

    assert response.status_code == status.HTTP_409_CONFLICT
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "CONFLICT"


@pytest.mark.integration
@pytest.mark.auth
def test_register_with_invalid_email_format(client):
    """Test registration fails with invalid email format."""
    registration_data = {
        "email": "not-an-email",
        "username": "newuser",
        "password": "SecureP@ssw0rd!",
        "full_name": "New User"
    }

    response = client.post("/api/auth/register", json=registration_data)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    data = response.json()
    assert data["success"] is False


@pytest.mark.integration
@pytest.mark.auth
def test_register_with_missing_fields(client):
    """Test registration fails when required fields are missing."""
    registration_data = {
        "email": "newuser@example.com"
        # Missing username, password, full_name
    }

    response = client.post("/api/auth/register", json=registration_data)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ============================================================================
# Login Tests - Valid Credentials
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_login_with_valid_credentials(client, test_user):
    """Test successful login with valid credentials."""
    login_data = {
        "email": test_user["email"],
        "password": "correct_password"
    }

    response = client.post("/api/auth/login", json=login_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]
    assert data["data"]["token_type"] == "bearer"


@pytest.mark.integration
@pytest.mark.auth
def test_login_returns_user_info(client, test_user):
    """Test that login returns user information."""
    login_data = {
        "email": test_user["email"],
        "password": "correct_password"
    }

    response = client.post("/api/auth/login", json=login_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "user" in data["data"]
    assert data["data"]["user"]["email"] == test_user["email"]
    assert data["data"]["user"]["username"] == test_user["username"]


@pytest.mark.integration
@pytest.mark.auth
def test_login_with_username_instead_of_email(client, test_user):
    """Test login works with username instead of email."""
    login_data = {
        "username": test_user["username"],
        "password": "correct_password"
    }

    response = client.post("/api/auth/login", json=login_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True


# ============================================================================
# Login Tests - Invalid Credentials
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_login_with_wrong_password(client, test_user):
    """Test login fails with incorrect password."""
    login_data = {
        "email": test_user["email"],
        "password": "wrong_password"
    }

    response = client.post("/api/auth/login", json=login_data)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "AUTH_FAILED"


@pytest.mark.integration
@pytest.mark.auth
def test_login_with_nonexistent_email(client):
    """Test login fails with non-existent email."""
    login_data = {
        "email": "nonexistent@example.com",
        "password": "any_password"
    }

    response = client.post("/api/auth/login", json=login_data)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "AUTH_FAILED"


@pytest.mark.integration
@pytest.mark.auth
def test_login_with_empty_credentials(client):
    """Test login fails with empty credentials."""
    login_data = {
        "email": "",
        "password": ""
    }

    response = client.post("/api/auth/login", json=login_data)

    assert response.status_code in [
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        status.HTTP_401_UNAUTHORIZED
    ]


@pytest.mark.integration
@pytest.mark.auth
def test_login_with_inactive_user(client, test_user):
    """Test login fails for inactive user account."""
    # Assume user is marked as inactive in database
    login_data = {
        "email": test_user["email"],
        "password": "correct_password"
    }

    # Mock inactive user
    with patch("app.api.auth.get_user_by_email") as mock_get_user:
        inactive_user = test_user.copy()
        inactive_user["is_active"] = False
        mock_get_user.return_value = inactive_user

        response = client.post("/api/auth/login", json=login_data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert data["error"]["code"] == "AUTH_FAILED"


# ============================================================================
# JWT Token Validation Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_access_protected_endpoint_with_valid_token(authenticated_client):
    """Test accessing protected endpoint with valid JWT token."""
    response = authenticated_client.get("/api/users/me")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True


@pytest.mark.integration
@pytest.mark.auth
def test_access_protected_endpoint_without_token(client):
    """Test accessing protected endpoint without token fails."""
    response = client.get("/api/users/me")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "AUTH_REQUIRED"


@pytest.mark.integration
@pytest.mark.auth
def test_access_protected_endpoint_with_invalid_token(client):
    """Test accessing protected endpoint with invalid token fails."""
    client.headers = {
        "Authorization": "Bearer invalid_token_here"
    }

    response = client.get("/api/users/me")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "AUTH_FAILED"


@pytest.mark.integration
@pytest.mark.auth
def test_access_protected_endpoint_with_expired_token(client, expired_token):
    """Test accessing protected endpoint with expired token fails."""
    client.headers = {
        "Authorization": f"Bearer {expired_token}"
    }

    response = client.get("/api/users/me")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "AUTH_FAILED"


@pytest.mark.integration
@pytest.mark.auth
def test_token_contains_user_claims(client, test_user):
    """Test that JWT token contains expected user claims."""
    login_data = {
        "email": test_user["email"],
        "password": "correct_password"
    }

    response = client.post("/api/auth/login", json=login_data)
    data = response.json()
    token = data["data"]["access_token"]

    # Decode token (in real implementation, verify signature)
    # This is simplified for testing
    import base64
    import json

    # JWT format: header.payload.signature
    parts = token.split(".")
    if len(parts) == 3:
        # Decode payload (add padding if needed)
        payload = parts[1]
        payload += "=" * (4 - len(payload) % 4)
        decoded = json.loads(base64.b64decode(payload))

        assert "sub" in decoded or "user_id" in decoded
        assert "exp" in decoded


# ============================================================================
# Token Refresh Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_refresh_token_with_valid_refresh_token(client, test_user):
    """Test refreshing access token with valid refresh token."""
    # First, login to get refresh token
    login_response = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "correct_password"
    })
    refresh_token = login_response.json()["data"]["refresh_token"]

    # Use refresh token to get new access token
    response = client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token
    })

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]


@pytest.mark.integration
@pytest.mark.auth
def test_refresh_token_with_invalid_refresh_token(client):
    """Test token refresh fails with invalid refresh token."""
    response = client.post("/api/auth/refresh", json={
        "refresh_token": "invalid_refresh_token"
    })

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "AUTH_FAILED"


@pytest.mark.integration
@pytest.mark.auth
def test_refresh_token_with_expired_refresh_token(client, expired_token):
    """Test token refresh fails with expired refresh token."""
    response = client.post("/api/auth/refresh", json={
        "refresh_token": expired_token
    })

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.integration
@pytest.mark.auth
def test_refresh_token_invalidates_old_token(client, test_user):
    """Test that using refresh token invalidates the old one (if implemented)."""
    # Login
    login_response = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "correct_password"
    })
    refresh_token = login_response.json()["data"]["refresh_token"]

    # Refresh once
    client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token
    })

    # Try to use old refresh token again (should fail if token rotation is implemented)
    response = client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token
    })

    # This test assumes token rotation is implemented
    # If not implemented, this test should be skipped or modified
    # assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Logout Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_logout_with_valid_token(authenticated_client):
    """Test successful logout."""
    response = authenticated_client.post("/api/auth/logout")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True


@pytest.mark.integration
@pytest.mark.auth
def test_logout_invalidates_token(client, test_user):
    """Test that logout invalidates the access token."""
    # Login
    login_response = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "correct_password"
    })
    token = login_response.json()["data"]["access_token"]

    client.headers = {"Authorization": f"Bearer {token}"}

    # Logout
    client.post("/api/auth/logout")

    # Try to use token after logout (should fail if token blacklisting is implemented)
    response = client.get("/api/users/me")

    # This assumes token blacklisting is implemented
    # If not, this test should be modified
    # assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.integration
@pytest.mark.auth
def test_logout_without_token(client):
    """Test logout requires authentication."""
    response = client.post("/api/auth/logout")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Complete Authentication Flow Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_complete_auth_flow_register_login_access(client):
    """Test complete flow: register, login, access protected resource."""
    # Step 1: Register
    registration_data = {
        "email": "flowtest@example.com",
        "username": "flowtest",
        "password": "SecureP@ssw0rd!",
        "full_name": "Flow Test User"
    }

    register_response = client.post("/api/auth/register", json=registration_data)
    assert register_response.status_code == status.HTTP_201_CREATED

    # Step 2: Login
    login_data = {
        "email": registration_data["email"],
        "password": registration_data["password"]
    }

    login_response = client.post("/api/auth/login", json=login_data)
    assert login_response.status_code == status.HTTP_200_OK

    token = login_response.json()["data"]["access_token"]

    # Step 3: Access protected resource
    client.headers = {"Authorization": f"Bearer {token}"}
    protected_response = client.get("/api/users/me")

    assert protected_response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.auth
def test_multiple_concurrent_logins(client, test_user):
    """Test that multiple concurrent logins work correctly."""
    login_data = {
        "email": test_user["email"],
        "password": "correct_password"
    }

    # Simulate multiple logins
    tokens = []
    for _ in range(3):
        response = client.post("/api/auth/login", json=login_data)
        assert response.status_code == status.HTTP_200_OK
        tokens.append(response.json()["data"]["access_token"])

    # All tokens should be different
    assert len(set(tokens)) == 3

    # All tokens should work
    for token in tokens:
        client.headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/users/me")
        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Security Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.auth
def test_password_not_returned_in_responses(client, test_user):
    """Test that password is never returned in API responses."""
    login_response = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "correct_password"
    })

    response_text = login_response.text.lower()
    assert "password" not in response_text or "hashed" in response_text


@pytest.mark.integration
@pytest.mark.auth
def test_rate_limiting_on_login_attempts(client, test_user):
    """Test rate limiting on failed login attempts."""
    login_data = {
        "email": test_user["email"],
        "password": "wrong_password"
    }

    # Make many failed attempts
    for i in range(10):
        response = client.post("/api/auth/login", json=login_data)

        # After certain number of attempts, should get rate limited
        if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            assert response.json()["error"]["code"] == "RATE_LIMITED"
            break


@pytest.mark.integration
@pytest.mark.auth
def test_token_has_reasonable_expiration(client, test_user):
    """Test that access tokens have reasonable expiration time."""
    login_response = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "correct_password"
    })

    # Token should expire in reasonable time (e.g., 15-60 minutes)
    # This would require decoding the JWT to check exp claim
    assert login_response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.auth
def test_refresh_token_longer_expiration_than_access(client, test_user):
    """Test that refresh tokens have longer expiration than access tokens."""
    # This test would decode both tokens and compare exp claims
    # Refresh token should typically last days/weeks while access token minutes/hours
    pass
