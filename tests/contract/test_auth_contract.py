"""Contract tests for authentication endpoints (Phase 7 - P3.4).

Tests the contract between:
- Consumer: Frontend/Mobile clients
- Provider: VoiceAssist API Gateway (/api/auth/*)

Run with: pytest tests/contract/test_auth_contract.py
"""
import os

import pytest
import requests
from pact import Consumer, Like, Provider, Term

# Pact broker configuration - use environment variables with defaults
PACT_BROKER_URL = os.environ.get("PACT_BROKER_URL", "http://localhost:9292")
PACT_BROKER_USERNAME = os.environ.get("PACT_BROKER_USERNAME", "pact")
PACT_BROKER_PASSWORD = os.environ.get("PACT_BROKER_PASSWORD", "pact")

# Provider configuration
PROVIDER_HOST = os.environ.get("PROVIDER_HOST", "localhost")
PROVIDER_PORT = int(os.environ.get("PROVIDER_PORT", "8000"))
PROVIDER_BASE_URL = f"http://{PROVIDER_HOST}:{PROVIDER_PORT}"


# ============================================
# Consumer Tests (Client Expectations)
# ============================================

@pytest.fixture(scope="session")
def pact(request):
    """Create Pact consumer for frontend client."""
    pact = Consumer("VoiceAssistFrontend").has_pact_with(
        Provider("VoiceAssistAPI"),
        host_name="localhost",
        port=1234,  # Mock server port
        pact_dir="./pacts",  # Where to save pact files
        version="2.0.0"
    )

    pact.start_service()
    yield pact
    pact.stop_service()


class TestAuthContractConsumer:
    """Consumer contract tests - Define what the frontend expects."""

    def test_login_success_contract(self, pact):
        """Contract: POST /api/auth/login with valid credentials returns tokens."""
        expected_response = {
            "access_token": Like("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."),
            "refresh_token": Like("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."),
            "token_type": "bearer",
            "expires_in": Like(900)  # 15 minutes in seconds
        }

        (pact
         .given("user exists with valid credentials")
         .upon_receiving("a request to login")
         .with_request(
             method="POST",
             path="/api/auth/login",
             headers={
                 "Content-Type": "application/json"
             },
             body={
                 "email": "test@example.com",
                 "password": "testpassword123"
             }
         )
         .will_respond_with(200, body=expected_response))

        with pact:
            # Make actual request to mock server
            response = requests.post(
                f"{pact.uri}/api/auth/login",
                json={
                    "email": "test@example.com",
                    "password": "testpassword123"
                },
                headers={"Content-Type": "application/json"}
            )

            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data
            assert "refresh_token" in data
            assert data["token_type"] == "bearer"
            assert "expires_in" in data

    def test_login_invalid_credentials_contract(self, pact):
        """Contract: POST /api/auth/login with invalid credentials returns 401."""
        (pact
         .given("user exists but password is wrong")
         .upon_receiving("a request to login with invalid password")
         .with_request(
             method="POST",
             path="/api/auth/login",
             headers={"Content-Type": "application/json"},
             body={
                 "email": "test@example.com",
                 "password": "wrongpassword"
             }
         )
         .will_respond_with(401, body={
             "detail": Like("Incorrect email or password")
         }))

        with pact:
            response = requests.post(
                f"{pact.uri}/api/auth/login",
                json={
                    "email": "test@example.com",
                    "password": "wrongpassword"
                },
                headers={"Content-Type": "application/json"}
            )

            assert response.status_code == 401
            assert "detail" in response.json()

    def test_register_success_contract(self, pact):
        """Contract: POST /api/auth/register with valid data creates user."""
        expected_response = {
            "id": Like("550e8400-e29b-41d4-a716-446655440000"),
            "email": "newuser@example.com",
            "full_name": "New User",
            "is_active": True,
            "is_admin": False,
            "created_at": Term(
                r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+",
                "2025-11-21T12:00:00.000000"
            )
        }

        (pact
         .given("user does not exist")
         .upon_receiving("a request to register")
         .with_request(
             method="POST",
             path="/api/auth/register",
             headers={"Content-Type": "application/json"},
             body={
                 "email": "newuser@example.com",
                 "password": "securepassword123",
                 "full_name": "New User"
             }
         )
         .will_respond_with(201, body=expected_response))

        with pact:
            response = requests.post(
                f"{pact.uri}/api/auth/register",
                json={
                    "email": "newuser@example.com",
                    "password": "securepassword123",
                    "full_name": "New User"
                },
                headers={"Content-Type": "application/json"}
            )

            assert response.status_code == 201
            data = response.json()
            assert data["email"] == "newuser@example.com"
            assert data["is_active"] is True
            assert "id" in data


# ============================================
# Provider Tests (Backend Verification)
# ============================================

def test_verify_pact_with_provider():
    """Verify that the actual API meets the contract expectations.

    This test runs against the real API to verify it satisfies
    all contracts defined by consumers.

    Run separately with: pytest tests/contract/test_auth_contract.py::test_verify_pact_with_provider
    """
    from pact import Verifier

    verifier = Verifier(
        provider="VoiceAssistAPI",
        provider_base_url=PROVIDER_BASE_URL
    )

    # Verify against pact files generated by consumer tests
    success, logs = verifier.verify_pacts(
        "./pacts/voiceassistfrontend-voiceassistapi.json",
        enable_pending=False,
        publish_version="1.0.0",
        publish_verification_results=True,
        broker_url=PACT_BROKER_URL,
        broker_username=PACT_BROKER_USERNAME,
        broker_password=PACT_BROKER_PASSWORD,
        verbose=True
    )

    assert success == 0, f"Pact verification failed: {logs}"


# ============================================
# State Setup for Provider Verification
# ============================================

def provider_state_setup(state):
    """Setup provider state for contract verification.

    Called before each provider verification to ensure the API
    is in the correct state (e.g., test user exists).
    """
    if state == "user exists with valid credentials":
        # Create test user in database
        # This would be implemented with actual database setup
        pass
    elif state == "user exists but password is wrong":
        # Ensure test user exists
        pass
    elif state == "user does not exist":
        # Clean up any existing test users
        pass
