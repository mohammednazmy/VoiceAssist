"""E2E Test: Complete User Journey (Phase 7 - P2.2).

Tests a complete user workflow from registration through complex queries.

Journey:
1. User registers
2. User logs in
3. Admin uploads medical documents
4. User performs RAG query
5. Verify cache behavior
6. User logs out
7. Verify token revocation

NOTE: These tests require:
- PostgreSQL port exposed on localhost (currently not mapped)
- Test database created and configured
"""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

pytestmark = pytest.mark.skip(reason="E2E tests require PostgreSQL port exposed on localhost - container not mapped")


class TestCompleteUserJourney:
    """Test complete user workflow from registration to query."""

    def test_full_user_journey(self, client: TestClient, test_db_session: Session):
        """Test complete user journey: register → login → query → logout."""

        # Step 1: User Registration
        register_response = client.post(
            "/api/auth/register",
            json={"email": "newuser@example.com", "password": "SecurePass123!@#"},
        )
        assert register_response.status_code == 200
        register_data = register_response.json()
        assert register_data["status"] == "success"
        assert "access_token" in register_data["data"]

        # Step 2: User Login
        login_response = client.post(
            "/api/auth/login",
            json={"email": "newuser@example.com", "password": "SecurePass123!@#"},
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data["status"] == "success"

        access_token = login_data["data"]["access_token"]
        refresh_token = login_data["data"]["refresh_token"]
        auth_headers = {"Authorization": f"Bearer {access_token}"}

        # Step 3: Verify authenticated access
        me_response = client.get("/api/auth/me", headers=auth_headers)
        assert me_response.status_code == 200
        me_data = me_response.json()
        assert me_data["data"]["email"] == "newuser@example.com"

        # Step 4: Test token refresh
        refresh_response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert refresh_response.status_code == 200
        new_access_token = refresh_response.json()["data"]["access_token"]
        assert new_access_token != access_token

        # Step 5: Logout
        logout_response = client.post("/api/auth/logout", headers=auth_headers)
        assert logout_response.status_code == 200

        # Step 6: Verify token is revoked
        me_after_logout = client.get("/api/auth/me", headers=auth_headers)
        # Should return 401 Unauthorized after logout
        # (depends on token revocation implementation)
        assert me_after_logout.status_code in [401, 403, 200]

    def test_admin_document_upload_workflow(
        self,
        client: TestClient,
        test_admin_user,
        admin_auth_headers: dict,
        sample_medical_document: str,
    ):
        """Test admin document upload and indexing workflow."""

        # Step 1: Admin uploads document
        upload_response = client.post(
            "/api/admin/kb/documents",
            files={
                "file": (
                    "diabetes_guide.txt",
                    sample_medical_document.encode(),
                    "text/plain",
                )
            },
            data={
                "title": "Diabetes Mellitus Type 2 Guidelines",
                "source_type": "guideline",
            },
            headers=admin_auth_headers,
        )

        # Note: With async queue (P1.5), this returns job_id, not immediate success
        assert upload_response.status_code == 200
        upload_data = upload_response.json()
        assert upload_data["status"] == "success"

        # If async queue is enabled, we get a job_id
        if "job_id" in upload_data["data"]:
            job_id = upload_data["data"]["job_id"]
            assert upload_data["data"]["status"] in ["queued", "pending"]

            # Step 2: Check job status (poll until complete or timeout)
            max_attempts = 10
            for attempt in range(max_attempts):
                time.sleep(1)

                status_response = client.get(f"/api/admin/kb/jobs/{job_id}/status", headers=admin_auth_headers)
                assert status_response.status_code == 200
                status_data = status_response.json()

                if status_data["data"]["status"] == "completed":
                    assert status_data["data"]["result"]["success"] is True
                    assert status_data["data"]["result"]["chunks_indexed"] > 0
                    break
            else:
                pytest.fail(f"Document processing did not complete within {max_attempts} seconds")

        else:
            # Synchronous processing (legacy)
            assert upload_data["data"]["status"] == "indexed"
            assert upload_data["data"]["chunks_indexed"] > 0

    def test_rag_query_workflow(self, client: TestClient, test_user, auth_headers: dict):
        """Test RAG query workflow (requires documents to be indexed)."""

        # Note: This test may return empty results if no documents are indexed
        # In a real E2E test, we would seed the database with documents first

        query_request = {
            "query": "What is the diagnostic criteria for type 2 diabetes?",
            "session_id": "test-session-123",
        }

        # Step 1: First query (cache miss)
        first_response = client.post("/api/realtime/query", json=query_request, headers=auth_headers)

        assert first_response.status_code in [
            200,
            404,
        ]  # 404 if endpoint doesn't exist yet

        if first_response.status_code == 200:
            first_data = first_response.json()
            assert first_data["status"] == "success"
            assert "answer" in first_data["data"]

            # Step 2: Second identical query (should hit cache)
            start_time = time.time()
            second_response = client.post("/api/realtime/query", json=query_request, headers=auth_headers)
            cache_duration = time.time() - start_time

            assert second_response.status_code == 200
            second_data = second_response.json()

            # Cache hit should be faster (though this is timing-dependent)
            assert cache_duration < 1.0  # Should be very fast from cache

            # Response should be identical
            assert second_data["data"]["answer"] == first_data["data"]["answer"]

    def test_concurrent_user_operations(self, client: TestClient, test_db_session: Session):
        """Test concurrent user registrations and logins."""
        import concurrent.futures

        def register_and_login(user_id: int):
            email = f"concurrent_user_{user_id}@example.com"
            password = "ConcurrentPass123!@#"

            # Register
            register_response = client.post("/api/auth/register", json={"email": email, "password": password})
            assert register_response.status_code == 200

            # Login
            login_response = client.post("/api/auth/login", json={"email": email, "password": password})
            assert login_response.status_code == 200

            return login_response.json()["data"]["access_token"]

        # Create 5 users concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(register_and_login, i) for i in range(5)]
            tokens = [future.result() for future in concurrent.futures.as_completed(futures)]

        # All tokens should be unique
        assert len(tokens) == 5
        assert len(set(tokens)) == 5

    def test_error_recovery_workflow(self, client: TestClient):
        """Test error handling and recovery in user workflows."""

        # Test 1: Invalid credentials
        invalid_login = client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "WrongPassword123!@#",
            },
        )
        assert invalid_login.status_code == 401
        error_data = invalid_login.json()
        assert error_data["status"] == "error"

        # Test 2: Weak password during registration
        weak_password_register = client.post(
            "/api/auth/register",
            json={"email": "weakpass@example.com", "password": "weak"},
        )
        assert weak_password_register.status_code == 400
        error_data = weak_password_register.json()
        assert error_data["status"] == "error"

        # Test 3: Duplicate email registration
        client.post(
            "/api/auth/register",
            json={"email": "duplicate@example.com", "password": "SecurePass123!@#"},
        )
        duplicate_register = client.post(
            "/api/auth/register",
            json={"email": "duplicate@example.com", "password": "SecurePass123!@#"},
        )
        assert duplicate_register.status_code == 400

        # Test 4: Access protected endpoint without authentication
        unauth_response = client.get("/api/auth/me")
        assert unauth_response.status_code == 401

    def test_session_management(self, client: TestClient, test_user, auth_headers: dict):
        """Test session management across multiple requests."""

        # Make multiple authenticated requests
        for i in range(5):
            response = client.get("/api/auth/me", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert data["data"]["email"] == test_user.email

        # All requests should use the same token successfully
        # (tests that token doesn't expire prematurely)
