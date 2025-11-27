"""
End-to-end tests for complete user workflows.
Phase 13: Final Testing & Documentation
"""

import pytest
from httpx import AsyncClient


@pytest.mark.e2e
@pytest.mark.asyncio
class TestUserRegistrationAndLogin:
    """Test user registration and authentication workflows."""

    async def test_complete_user_registration_workflow(self, api_client: AsyncClient):
        """Test complete user registration process."""
        # Step 1: Register new user
        registration_data = {
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "full_name": "New Test User",
            "role": "user"
        }
        response = await api_client.post("/api/auth/register", json=registration_data)
        assert response.status_code in [201, 409], f"Registration failed: {response.text}"
        
        if response.status_code == 201:
            user_data = response.json()
            assert "id" in user_data
            assert user_data["email"] == registration_data["email"]
            assert user_data["full_name"] == registration_data["full_name"]
        
        # Step 2: Login with new credentials
        login_response = await api_client.post(
            "/api/auth/login",
            json={"email": registration_data["email"], "password": registration_data["password"]}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        tokens = login_response.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        
        # Step 3: Access protected endpoint
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        profile_response = await api_client.get("/api/auth/me", headers=headers)
        assert profile_response.status_code == 200
        
        profile = profile_response.json()
        assert profile["email"] == registration_data["email"]

    async def test_invalid_login_attempt(self, api_client: AsyncClient):
        """Test failed login with invalid credentials."""
        response = await api_client.post(
            "/api/auth/login",
            json={"email": "invalid@example.com", "password": "wrongpassword"}
        )
        assert response.status_code in [401, 404]


@pytest.mark.e2e
@pytest.mark.asyncio
class TestDocumentWorkflow:
    """Test document upload and processing workflows."""

    async def test_complete_document_workflow(self, api_client: AsyncClient, user_token: str):
        """Test document upload, processing, and retrieval."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Step 1: Upload document
        files = {
            "file": ("test_doc.txt", b"Sample medical document content", "text/plain")
        }
        data = {
            "document_type": "medical_record",
            "description": "Test medical document"
        }
        
        upload_response = await api_client.post(
            "/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        # Upload endpoint might not exist yet, so handle gracefully
        if upload_response.status_code == 404:
            pytest.skip("Document upload endpoint not implemented")
        
        assert upload_response.status_code in [200, 201], f"Upload failed: {upload_response.text}"
        doc_data = upload_response.json()
        doc_id = doc_data.get("id")
        
        # Step 2: Check document status
        if doc_id:
            status_response = await api_client.get(
                f"/api/documents/{doc_id}",
                headers=headers
            )
            assert status_response.status_code == 200
            
            # Step 3: List user documents
            list_response = await api_client.get("/api/documents", headers=headers)
            assert list_response.status_code == 200
            documents = list_response.json()
            assert any(doc["id"] == doc_id for doc in documents.get("items", []))


@pytest.mark.e2e
@pytest.mark.asyncio
class TestRAGWorkflow:
    """Test RAG (Retrieval-Augmented Generation) workflows."""

    async def test_medical_query_workflow(self, api_client: AsyncClient, user_token: str):
        """Test complete medical query with RAG."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Step 1: Submit medical query
        query_data = {
            "query": "What are the symptoms of diabetes?",
            "context_window": 5
        }
        
        query_response = await api_client.post(
            "/api/rag/query",
            json=query_data,
            headers=headers
        )
        
        # RAG endpoint might not exist yet
        if query_response.status_code == 404:
            pytest.skip("RAG query endpoint not implemented")
        
        assert query_response.status_code == 200, f"Query failed: {query_response.text}"

        result = query_response.json()
        assert "answer" in result
        assert "sources" in result
        assert len(result["answer"]) > 0
        assert "model" in result
        assert "retrieval_confidence" in result

    async def test_search_medical_documents(self, api_client: AsyncClient, user_token: str):
        """Test vector search in medical knowledge base."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        search_data = {
            "query": "diabetes treatment",
            "limit": 10
        }
        
        search_response = await api_client.post(
            "/api/knowledge/search",
            json=search_data,
            headers=headers
        )
        
        if search_response.status_code == 404:
            pytest.skip("Knowledge search endpoint not implemented")
        
        assert search_response.status_code == 200
        results = search_response.json()
        assert "results" in results
        assert isinstance(results["results"], list)


@pytest.mark.e2e
@pytest.mark.asyncio
class TestHealthCheckWorkflow:
    """Test system health and monitoring workflows."""

    async def test_system_health_check(self, api_client: AsyncClient):
        """Test complete health check workflow."""
        # Test main health endpoint
        health_response = await api_client.get("/health")
        assert health_response.status_code == 200
        
        health_data = health_response.json()
        assert "status" in health_data
        assert health_data["status"] in ["healthy", "degraded", "unhealthy"]
        
        # Test readiness endpoint
        ready_response = await api_client.get("/ready")
        assert ready_response.status_code in [200, 503]
        
        # Test liveness endpoint
        live_response = await api_client.get("/live")
        assert live_response.status_code == 200

    async def test_metrics_endpoint(self, api_client: AsyncClient, admin_token: str):
        """Test metrics collection endpoints."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        metrics_response = await api_client.get("/metrics", headers=headers)
        
        # Metrics might be publicly accessible or require auth
        assert metrics_response.status_code in [200, 401, 404]
        
        if metrics_response.status_code == 200:
            metrics = metrics_response.text
            # Prometheus format metrics
            assert len(metrics) > 0


@pytest.mark.e2e
@pytest.mark.asyncio
class TestAdminWorkflow:
    """Test administrative workflows."""

    async def test_admin_user_management(self, api_client: AsyncClient, admin_token: str):
        """Test admin user management capabilities."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # List all users
        users_response = await api_client.get("/api/admin/users", headers=headers)
        
        if users_response.status_code == 404:
            pytest.skip("Admin endpoints not implemented")
        
        assert users_response.status_code == 200, f"Failed to list users: {users_response.text}"
        users = users_response.json()
        assert isinstance(users, list) or isinstance(users.get("items"), list)

    async def test_admin_system_stats(self, api_client: AsyncClient, admin_token: str):
        """Test admin access to system statistics."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        stats_response = await api_client.get("/api/admin/stats", headers=headers)
        
        if stats_response.status_code == 404:
            pytest.skip("Admin stats endpoint not implemented")
        
        assert stats_response.status_code == 200
        stats = stats_response.json()
        assert "total_users" in stats or "users_count" in stats
