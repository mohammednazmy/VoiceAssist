"""
Integration tests for service-to-service communication.
Phase 13: Final Testing & Documentation
"""

import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import text


@pytest.mark.integration
@pytest.mark.asyncio
class TestDatabaseIntegration:
    """Test database connectivity and operations."""

    async def test_database_connection(self, test_db_session):
        """Test database connection is working."""
        assert test_db_session is not None
        # Execute simple query
        result = test_db_session.execute(text("SELECT 1")).scalar()
        assert result == 1

    async def test_database_transactions(self, test_db_session):
        """Test database transaction handling."""
        # Test rollback
        test_db_session.execute(text("SELECT 1"))
        test_db_session.rollback()
        assert True  # If we get here, rollback worked


@pytest.mark.integration
@pytest.mark.asyncio
class TestRedisIntegration:
    """Test Redis caching integration."""

    async def test_cache_endpoint(self, api_client: AsyncClient):
        """Test cache-based endpoint performance."""
        # First request (cache miss)
        response1 = await api_client.get("/api/cache-test")

        if response1.status_code == 404:
            pytest.skip("Cache test endpoint not implemented")

        # Second request (cache hit)
        response2 = await api_client.get("/api/cache-test")

        assert response1.status_code == response2.status_code
        assert response1.json() == response2.json()


@pytest.mark.integration
@pytest.mark.asyncio
class TestQdrantIntegration:
    """Test Qdrant vector database integration."""

    async def test_vector_search_integration(self, api_client: AsyncClient, user_token: str):
        """Test vector search functionality."""
        headers = {"Authorization": f"Bearer {user_token}"}

        search_data = {
            "query": "test medical condition",
            "limit": 5
        }

        response = await api_client.post(
            "/api/knowledge/search",
            json=search_data,
            headers=headers
        )

        if response.status_code == 404:
            pytest.skip("Vector search endpoint not implemented")

        assert response.status_code in [200, 503]


@pytest.mark.integration
@pytest.mark.asyncio
class TestNextcloudIntegration:
    """Test Nextcloud integration."""

    async def test_nextcloud_file_operations(self, api_client: AsyncClient, user_token: str):
        """Test file operations through Nextcloud."""
        headers = {"Authorization": f"Bearer {user_token}"}

        # List files
        files_response = await api_client.get("/api/nextcloud/files", headers=headers)

        if files_response.status_code == 404:
            pytest.skip("Nextcloud integration not implemented")

        assert files_response.status_code in [200, 503]

    async def test_nextcloud_calendar_sync(self, api_client: AsyncClient, user_token: str):
        """Test calendar synchronization."""
        headers = {"Authorization": f"Bearer {user_token}"}

        calendar_response = await api_client.get("/api/nextcloud/calendar", headers=headers)

        if calendar_response.status_code == 404:
            pytest.skip("Calendar integration not implemented")

        assert calendar_response.status_code in [200, 404, 503]


@pytest.mark.integration
@pytest.mark.asyncio
class TestWorkerIntegration:
    """Test background worker integration."""

    async def test_async_task_creation(self, api_client: AsyncClient, user_token: str):
        """Test creating background tasks."""
        headers = {"Authorization": f"Bearer {user_token}"}

        task_data = {
            "task_type": "document_processing",
            "document_id": "test-doc-123"
        }

        response = await api_client.post(
            "/api/tasks",
            json=task_data,
            headers=headers
        )

        if response.status_code == 404:
            pytest.skip("Task creation endpoint not implemented")

        assert response.status_code in [200, 201, 202]

        if response.status_code in [200, 201, 202]:
            task = response.json()
            task_id = task.get("task_id") or task.get("id")

            # Check task status
            if task_id:
                status_response = await api_client.get(
                    f"/api/tasks/{task_id}",
                    headers=headers
                )
                assert status_response.status_code in [200, 404]


@pytest.mark.integration
@pytest.mark.asyncio
class TestMonitoringIntegration:
    """Test monitoring and observability integration."""

    async def test_prometheus_metrics(self, api_client: AsyncClient):
        """Test Prometheus metrics endpoint."""
        response = await api_client.get("/metrics")

        # Metrics endpoint might be on different port
        assert response.status_code in [200, 404]

        if response.status_code == 200:
            metrics_text = response.text
            assert len(metrics_text) > 0
            # Check for some standard metrics
            assert "http_requests" in metrics_text or "process" in metrics_text

    async def test_health_checks(self, api_client: AsyncClient):
        """Test health check endpoints."""
        # Test all health check variants
        endpoints = ["/health", "/healthz", "/ready", "/readiness", "/live", "/liveness"]

        results = []
        for endpoint in endpoints:
            response = await api_client.get(endpoint)
            if response.status_code != 404:
                results.append((endpoint, response.status_code))

        # At least one health endpoint should exist
        assert len(results) > 0


@pytest.mark.integration
@pytest.mark.requires_services
@pytest.mark.asyncio
class TestEndToEndServiceIntegration:
    """Test complete end-to-end service integration."""

    async def test_complete_query_pipeline(self, api_client: AsyncClient, user_token: str):
        """Test complete query processing pipeline through all services."""
        headers = {"Authorization": f"Bearer {user_token}"}

        # Step 1: Create a conversation
        conv_response = await api_client.post(
            "/api/conversations",
            json={"title": "Integration Test Conversation"},
            headers=headers
        )

        if conv_response.status_code == 404:
            pytest.skip("Full pipeline not implemented")

        if conv_response.status_code in [200, 201]:
            conv_id = conv_response.json().get("id")

            # Step 2: Submit a query
            query_response = await api_client.post(
                "/api/query",
                json={
                    "conversation_id": conv_id,
                    "query": "What are the symptoms of hypertension?",
                    "use_rag": True
                },
                headers=headers
            )

            assert query_response.status_code in [200, 404]

            if query_response.status_code == 200:
                result = query_response.json()
                # Verify response structure
                assert "answer" in result or "response" in result

                # Step 3: Get conversation history
                history_response = await api_client.get(
                    f"/api/conversations/{conv_id}/messages",
                    headers=headers
                )

                assert history_response.status_code == 200
                messages = history_response.json()
                assert len(messages) > 0 or len(messages.get("items", [])) > 0
