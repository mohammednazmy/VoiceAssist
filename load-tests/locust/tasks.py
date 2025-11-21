"""
Modular task definitions for Locust load testing.

Contains reusable task functions for:
- Authentication tasks
- Chat/query tasks
- Admin tasks
- WebSocket tasks
- Each task tracks custom metrics
"""
import time
import random
import io
from typing import Optional, Dict, Any

from locust import task, between
from config import config
from utils import (
    AuthHelper,
    DataGenerator,
    WebSocketHelper,
    metrics_tracker,
    ResponseValidator,
    logger
)


# ============================================================================
# Authentication Tasks
# ============================================================================

class AuthenticationTasks:
    """Authentication-related tasks."""

    @staticmethod
    def login_task(user, test_user):
        """
        Perform login task.

        Args:
            user: Locust user instance
            test_user: TestUser with credentials
        """
        start_time = time.time()
        tokens = AuthHelper.login(user.client, test_user.email, test_user.password)

        if tokens:
            user.tokens = tokens
            response_time = (time.time() - start_time) * 1000

            # Check performance threshold
            threshold = config.PERFORMANCE_THRESHOLDS["auth_login"]
            if response_time > threshold:
                logger.warning(
                    f"Login exceeded threshold: {response_time:.2f}ms > {threshold}ms"
                )
        else:
            metrics_tracker.record_auth_failure()

    @staticmethod
    def refresh_token_task(user):
        """
        Refresh access token.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('refresh_token'):
            return

        new_tokens = AuthHelper.refresh_token(
            user.client,
            user.tokens['refresh_token']
        )

        if new_tokens:
            user.tokens = new_tokens
        else:
            metrics_tracker.record_auth_failure()

    @staticmethod
    def get_profile_task(user):
        """
        Get current user profile.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        with user.client.get(
            config.ENDPOINTS["me"],
            headers=headers,
            name="/api/auth/me",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                # Token expired, try to refresh
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Profile fetch failed: {response.status_code}")


# ============================================================================
# Chat/Query Tasks
# ============================================================================

class ChatTasks:
    """Chat and query-related tasks."""

    @staticmethod
    def simple_query_task(user):
        """
        Execute simple query.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        query = DataGenerator.random_query("simple")
        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        start_time = time.time()

        with user.client.post(
            config.ENDPOINTS["chat"],
            json={"query": query},
            headers=headers,
            name="/api/chat [simple]",
            catch_response=True
        ) as response:
            response_time = (time.time() - start_time) * 1000

            if response.status_code == 200:
                try:
                    data = response.json()
                    has_citations = "citations" in data and len(data["citations"]) > 0
                    metrics_tracker.record_query_result(has_citations)

                    # Check performance threshold
                    threshold = config.PERFORMANCE_THRESHOLDS["chat_query"]
                    if response_time > threshold:
                        logger.warning(
                            f"Chat query exceeded threshold: {response_time:.2f}ms > {threshold}ms"
                        )

                    response.success()
                except Exception as e:
                    response.failure(f"Invalid response format: {e}")
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Chat query failed: {response.status_code}")

    @staticmethod
    def complex_query_task(user):
        """
        Execute complex query.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        query = DataGenerator.random_query("complex")
        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        start_time = time.time()

        with user.client.post(
            config.ENDPOINTS["chat"],
            json={
                "query": query,
                "clinical_context": {
                    "patient_age": random.randint(20, 80),
                    "patient_gender": random.choice(["male", "female"]),
                }
            },
            headers=headers,
            name="/api/chat [complex]",
            catch_response=True
        ) as response:
            response_time = (time.time() - start_time) * 1000

            if response.status_code == 200:
                try:
                    data = response.json()
                    has_citations = "citations" in data and len(data["citations"]) > 0
                    metrics_tracker.record_query_result(has_citations)

                    # Complex queries should have citations
                    if not has_citations:
                        logger.warning("Complex query returned no citations")

                    response.success()
                except Exception as e:
                    response.failure(f"Invalid response format: {e}")
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Chat query failed: {response.status_code}")

    @staticmethod
    def multi_turn_conversation_task(user):
        """
        Execute multi-turn conversation.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        # Get random conversation
        conversation = random.choice(config.SAMPLE_QUERIES["multi_turn"])
        session_id = DataGenerator.random_session_id()
        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        # Execute each turn in the conversation
        for i, query in enumerate(conversation):
            with user.client.post(
                config.ENDPOINTS["chat"],
                json={
                    "query": query,
                    "session_id": session_id
                },
                headers=headers,
                name=f"/api/chat [multi-turn {i+1}]",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    response.success()
                elif response.status_code == 401:
                    AuthenticationTasks.refresh_token_task(user)
                    break
                else:
                    response.failure(f"Chat query failed: {response.status_code}")
                    break

            # Wait between turns
            time.sleep(random.uniform(1, 3))


# ============================================================================
# Admin Tasks
# ============================================================================

class AdminTasks:
    """Admin-related tasks."""

    @staticmethod
    def upload_document_task(user, size: str = "small"):
        """
        Upload document to knowledge base.

        Args:
            user: Locust user instance
            size: Document size ('small', 'medium', 'large')
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        doc = DataGenerator.random_document_content(size)
        headers = {"Authorization": f"Bearer {user.tokens['access_token']}"}

        # Create file-like object
        file_content = doc["content"].encode('utf-8')
        files = {
            'file': (doc["filename"], io.BytesIO(file_content), 'text/plain')
        }

        start_time = time.time()

        with user.client.post(
            config.ENDPOINTS["admin_kb_documents"],
            files=files,
            data={"title": doc["title"], "source_type": "uploaded"},
            headers=headers,
            name=f"/api/admin/kb/documents [upload {size}]",
            catch_response=True
        ) as response:
            response_time = (time.time() - start_time) * 1000
            success = response.status_code in [200, 201]

            metrics_tracker.record_document_upload(success)

            if success:
                # Check performance threshold
                threshold = config.PERFORMANCE_THRESHOLDS["document_upload"]
                if response_time > threshold:
                    logger.warning(
                        f"Document upload exceeded threshold: {response_time:.2f}ms > {threshold}ms"
                    )
                response.success()
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Document upload failed: {response.status_code}")

    @staticmethod
    def list_documents_task(user):
        """
        List knowledge base documents.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        with user.client.get(
            config.ENDPOINTS["admin_kb_documents"],
            headers=headers,
            name="/api/admin/kb/documents [list]",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"List documents failed: {response.status_code}")

    @staticmethod
    def view_dashboard_task(user):
        """
        View admin dashboard.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        with user.client.get(
            config.ENDPOINTS["admin_dashboard"],
            headers=headers,
            name="/api/admin/dashboard",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Dashboard load failed: {response.status_code}")

    @staticmethod
    def manage_cache_task(user):
        """
        Manage cache (view stats, clear).

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        # View cache stats
        with user.client.get(
            config.ENDPOINTS["admin_cache_stats"],
            headers=headers,
            name="/api/admin/cache/stats",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Cache stats failed: {response.status_code}")

    @staticmethod
    def manage_feature_flags_task(user):
        """
        Manage feature flags.

        Args:
            user: Locust user instance
        """
        if not hasattr(user, 'tokens') or not user.tokens.get('access_token'):
            return

        headers = AuthHelper.get_auth_headers(user.tokens['access_token'])

        # List feature flags
        with user.client.get(
            config.ENDPOINTS["admin_feature_flags"],
            headers=headers,
            name="/api/admin/feature-flags",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                AuthenticationTasks.refresh_token_task(user)
            else:
                response.failure(f"Feature flags failed: {response.status_code}")

    @staticmethod
    def view_metrics_task(user):
        """
        View system metrics.

        Args:
            user: Locust user instance
        """
        with user.client.get(
            config.ENDPOINTS["metrics"],
            name="/metrics",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Metrics fetch failed: {response.status_code}")


# ============================================================================
# Health Check Tasks
# ============================================================================

class HealthTasks:
    """Health check tasks."""

    @staticmethod
    def basic_health_check(user):
        """
        Perform basic health check.

        Args:
            user: Locust user instance
        """
        start_time = time.time()

        with user.client.get(
            config.ENDPOINTS["health"],
            name="/health",
            catch_response=True
        ) as response:
            response_time = (time.time() - start_time) * 1000

            if response.status_code == 200:
                # Check performance threshold
                threshold = config.PERFORMANCE_THRESHOLDS["health_check"]
                if response_time > threshold:
                    logger.warning(
                        f"Health check exceeded threshold: {response_time:.2f}ms > {threshold}ms"
                    )
                response.success()
            else:
                response.failure(f"Health check failed: {response.status_code}")

    @staticmethod
    def detailed_health_check(user):
        """
        Perform detailed health check.

        Args:
            user: Locust user instance
        """
        with user.client.get(
            config.ENDPOINTS["health_detailed"],
            name="/health/detailed",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    # Check that all services are healthy
                    if "services" in data:
                        unhealthy = [
                            svc for svc, status in data["services"].items()
                            if status.get("status") != "healthy"
                        ]
                        if unhealthy:
                            logger.warning(f"Unhealthy services: {unhealthy}")

                    response.success()
                except Exception as e:
                    response.failure(f"Invalid health response: {e}")
            else:
                response.failure(f"Detailed health check failed: {response.status_code}")
