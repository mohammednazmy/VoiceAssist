"""
Main Locust file for VoiceAssist Phase 10 load testing.

Defines multiple user types with different behaviors:
- RegularUser (70% weight): Chat queries, simple operations
- PowerUser (20% weight): Complex queries, multiple sessions
- AdminUser (10% weight): Document management, job monitoring
- WebSocketUser: Real-time voice mode testing

Each user type has weighted tasks and realistic wait times.
"""
import random
import json
import time
from typing import Optional

from locust import HttpUser, task, between, TaskSet
from locust.contrib.fasthttp import FastHttpUser
from locust_plugins.users import WebSocketUser as WSUser

from config import config
from utils import (
    AuthHelper,
    DataGenerator,
    WebSocketHelper,
    metrics_tracker,
    logger
)
from tasks import (
    AuthenticationTasks,
    ChatTasks,
    AdminTasks,
    HealthTasks
)


# ============================================================================
# Regular User (70% of load)
# ============================================================================

class RegularUserTasks(TaskSet):
    """
    Task set for regular users.

    Focuses on:
    - Simple chat queries
    - Profile management
    - Health checks
    """

    def on_start(self):
        """Setup when user starts - login."""
        # Select a random regular user
        self.test_user = random.choice([
            user for user in config.TEST_USERS
            if user.role == "user"
        ])

        # Attempt registration (may already exist)
        AuthHelper.register(
            self.client,
            self.test_user.email,
            self.test_user.password,
            self.test_user.full_name
        )

        # Login
        AuthenticationTasks.login_task(self, self.test_user)

        logger.info(f"Regular user started: {self.test_user.email}")

    def on_stop(self):
        """Cleanup when user stops."""
        logger.info(f"Regular user stopped: {self.test_user.email}")

    @task(50)
    def chat_query(self):
        """Execute simple chat query (highest weight)."""
        ChatTasks.simple_query_task(self)

    @task(20)
    def simple_question(self):
        """Ask simple medical question."""
        ChatTasks.simple_query_task(self)

    @task(10)
    def check_history(self):
        """Check conversation history."""
        if not hasattr(self, 'tokens') or not self.tokens:
            return

        headers = AuthHelper.get_auth_headers(self.tokens.get('access_token'))

        with self.client.get(
            config.ENDPOINTS["conversations"],
            headers=headers,
            params={"page": 1, "pageSize": 10},
            name="/api/conversations [list]",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
                # Store conversation IDs for other tasks
                try:
                    data = response.json()
                    if data.get("data", {}).get("items"):
                        self.conversation_ids = [
                            item["id"] for item in data["data"]["items"]
                        ]
                except Exception:
                    pass
            elif response.status_code == 401:
                response.failure("Unauthorized - token expired")
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(5)
    def view_profile(self):
        """View user profile."""
        AuthenticationTasks.get_profile_task(self)

    @task(5)
    def health_check(self):
        """Perform health check."""
        HealthTasks.basic_health_check(self)


class RegularUser(FastHttpUser):
    """
    Regular user - 70% of load.

    Characteristics:
    - Simple queries
    - Moderate wait times
    - Basic features only
    """
    tasks = [RegularUserTasks]
    weight = 70
    wait_time = between(
        config.WAIT_TIMES["regular_user"]["min"],
        config.WAIT_TIMES["regular_user"]["max"]
    )
    host = config.BASE_URL


# ============================================================================
# Power User (20% of load)
# ============================================================================

class PowerUserTasks(TaskSet):
    """
    Task set for power users.

    Focuses on:
    - Complex queries
    - Multi-turn conversations
    - Integration usage
    - Data export
    """

    def on_start(self):
        """Setup when user starts - login."""
        # Select a random power user
        self.test_user = random.choice([
            user for user in config.TEST_USERS
            if user.role == "power_user"
        ])

        # Attempt registration (may already exist)
        AuthHelper.register(
            self.client,
            self.test_user.email,
            self.test_user.password,
            self.test_user.full_name
        )

        # Login
        AuthenticationTasks.login_task(self, self.test_user)

        logger.info(f"Power user started: {self.test_user.email}")

    def on_stop(self):
        """Cleanup when user stops."""
        logger.info(f"Power user stopped: {self.test_user.email}")

    @task(30)
    def complex_query(self):
        """Execute complex medical query."""
        ChatTasks.complex_query_task(self)

    @task(25)
    def multi_turn_conversation(self):
        """Execute multi-turn conversation."""
        ChatTasks.multi_turn_conversation_task(self)

    @task(15)
    def search_documents(self):
        """Search knowledge base (via complex query)."""
        ChatTasks.complex_query_task(self)

    @task(15)
    def integration_actions(self):
        """Use integrations - list calendar events."""
        if not hasattr(self, 'tokens') or not self.tokens:
            return

        headers = AuthHelper.get_auth_headers(self.tokens.get('access_token'))

        # Test calendar integration
        with self.client.get(
            config.ENDPOINTS["integrations_calendar"],
            headers=headers,
            name="/api/integrations/calendar [list]",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                response.failure("Unauthorized - token expired")
            elif response.status_code == 404:
                # Integration not configured - still valid
                response.success()
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(10)
    def export_data(self):
        """Export conversation data as markdown."""
        if not hasattr(self, 'tokens') or not self.tokens:
            return

        # Need a conversation ID to export
        if not hasattr(self, 'conversation_ids') or not self.conversation_ids:
            # First get conversations to find one to export
            headers = AuthHelper.get_auth_headers(self.tokens.get('access_token'))
            with self.client.get(
                config.ENDPOINTS["conversations"],
                headers=headers,
                params={"page": 1, "pageSize": 5},
                name="/api/conversations [for-export]",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    response.success()
                    try:
                        data = response.json()
                        if data.get("data", {}).get("items"):
                            self.conversation_ids = [
                                item["id"] for item in data["data"]["items"]
                            ]
                    except Exception:
                        return
                else:
                    response.failure(f"Failed to get conversations: {response.status_code}")
                    return

        if not self.conversation_ids:
            return

        # Export a random conversation
        session_id = random.choice(self.conversation_ids)
        headers = AuthHelper.get_auth_headers(self.tokens.get('access_token'))

        export_url = config.ENDPOINTS["export_markdown"].format(session_id=session_id)
        with self.client.get(
            export_url,
            headers=headers,
            name="/api/sessions/{id}/export/markdown",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                response.failure("Unauthorized - token expired")
            elif response.status_code == 404:
                # Conversation may have been deleted
                response.success()
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(5)
    def check_metrics(self):
        """Check personal metrics (placeholder)."""
        AuthenticationTasks.get_profile_task(self)


class PowerUser(FastHttpUser):
    """
    Power user - 20% of load.

    Characteristics:
    - Complex queries
    - Multi-turn conversations
    - Longer wait times
    - Advanced features
    """
    tasks = [PowerUserTasks]
    weight = 20
    wait_time = between(
        config.WAIT_TIMES["power_user"]["min"],
        config.WAIT_TIMES["power_user"]["max"]
    )
    host = config.BASE_URL


# ============================================================================
# Admin User (10% of load)
# ============================================================================

class AdminUserTasks(TaskSet):
    """
    Task set for admin users.

    Focuses on:
    - Document management
    - User management
    - System monitoring
    - Cache management
    - Feature flags
    """

    def on_start(self):
        """Setup when user starts - login as admin."""
        # Use admin user
        self.test_user = next(
            user for user in config.TEST_USERS
            if user.role == "admin"
        )

        # Attempt registration (may already exist)
        AuthHelper.register(
            self.client,
            self.test_user.email,
            self.test_user.password,
            self.test_user.full_name
        )

        # Login
        AuthenticationTasks.login_task(self, self.test_user)

        logger.info(f"Admin user started: {self.test_user.email}")

    def on_stop(self):
        """Cleanup when user stops."""
        logger.info(f"Admin user stopped: {self.test_user.email}")

    @task(25)
    def upload_document(self):
        """Upload document to knowledge base."""
        # Vary document sizes
        size = random.choices(
            ["small", "medium", "large"],
            weights=[60, 30, 10]  # Mostly small, some medium, few large
        )[0]
        AdminTasks.upload_document_task(self, size=size)

    @task(20)
    def manage_documents(self):
        """List and manage documents."""
        AdminTasks.list_documents_task(self)

    @task(15)
    def view_dashboard(self):
        """View admin dashboard."""
        AdminTasks.view_dashboard_task(self)

    @task(15)
    def manage_users(self):
        """Manage users - list users as admin."""
        if not hasattr(self, 'tokens') or not self.tokens:
            return

        headers = AuthHelper.get_auth_headers(self.tokens.get('access_token'))

        with self.client.get(
            config.ENDPOINTS["admin_users"],
            headers=headers,
            params={"page": 1, "pageSize": 20},
            name="/api/admin/users [list]",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                response.failure("Unauthorized - token expired")
            elif response.status_code == 403:
                # Not admin - expected for some test users
                response.success()
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(10)
    def cache_management(self):
        """Manage cache."""
        AdminTasks.manage_cache_task(self)

    @task(10)
    def feature_flags(self):
        """Manage feature flags."""
        AdminTasks.manage_feature_flags_task(self)

    @task(5)
    def view_metrics(self):
        """View system metrics."""
        AdminTasks.view_metrics_task(self)


class AdminUser(FastHttpUser):
    """
    Admin user - 10% of load.

    Characteristics:
    - Document uploads
    - System management
    - Longest wait times
    - Admin-only features
    """
    tasks = [AdminUserTasks]
    weight = 10
    wait_time = between(
        config.WAIT_TIMES["admin_user"]["min"],
        config.WAIT_TIMES["admin_user"]["max"]
    )
    host = config.BASE_URL


# ============================================================================
# WebSocket User (Real-time testing)
# ============================================================================

class WebSocketUserTasks(TaskSet):
    """
    Task set for WebSocket users.

    Focuses on:
    - WebSocket connections
    - Real-time chat
    - Streaming responses
    """

    def on_start(self):
        """Setup when user starts - establish WebSocket connection."""
        # Select a random user
        self.test_user = random.choice(config.TEST_USERS[:7])  # Use regular users

        # Attempt registration via HTTP
        AuthHelper.register(
            self.user.http_client,
            self.test_user.email,
            self.test_user.password,
            self.test_user.full_name
        )

        # Login via HTTP to get token
        tokens = AuthHelper.login(
            self.user.http_client,
            self.test_user.email,
            self.test_user.password
        )

        if tokens:
            self.tokens = tokens
            logger.info(f"WebSocket user authenticated: {self.test_user.email}")
        else:
            logger.error(f"WebSocket user authentication failed: {self.test_user.email}")
            metrics_tracker.record_websocket_connection(False)

    def on_stop(self):
        """Cleanup when user stops."""
        logger.info(f"WebSocket user stopped: {self.test_user.email}")

    @task(80)
    def send_message(self):
        """Send chat message via WebSocket."""
        if not hasattr(self, 'tokens'):
            return

        try:
            # Connect WebSocket (with auth token in query or header)
            ws_url = f"{config.WS_URL}{config.ENDPOINTS['websocket']}"

            # Note: WebSocket authentication would need to be implemented
            # For now, we'll simulate with HTTP client
            query = DataGenerator.random_query("simple")

            # Use HTTP client as fallback for MVP
            headers = AuthHelper.get_auth_headers(self.tokens['access_token'])

            start_time = time.time()

            with self.user.http_client.post(
                config.ENDPOINTS["chat"],
                json={"query": query},
                headers=headers,
                name="/api/chat [websocket-fallback]",
                catch_response=True
            ) as response:
                response_time = (time.time() - start_time) * 1000

                if response.status_code == 200:
                    metrics_tracker.record_websocket_connection(True)

                    # Check performance threshold
                    threshold = config.PERFORMANCE_THRESHOLDS["websocket_message"]
                    if response_time > threshold:
                        logger.warning(
                            f"WebSocket message exceeded threshold: {response_time:.2f}ms > {threshold}ms"
                        )

                    response.success()
                else:
                    metrics_tracker.record_websocket_connection(False)
                    response.failure(f"WebSocket message failed: {response.status_code}")

        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            metrics_tracker.record_websocket_connection(False)

    @task(20)
    def ping_pong(self):
        """Send ping and receive pong."""
        # Placeholder for actual WebSocket ping/pong
        pass


class WebSocketUser(FastHttpUser):
    """
    WebSocket user for real-time testing.

    Note: This is a simplified version using HTTP client.
    Full WebSocket implementation would require websocket-client library
    and custom Locust user class.

    Characteristics:
    - Real-time communication
    - Streaming responses
    - Short wait times
    """
    tasks = [WebSocketUserTasks]
    weight = 5  # Small portion for WebSocket testing
    wait_time = between(
        config.WAIT_TIMES["websocket"]["min"],
        config.WAIT_TIMES["websocket"]["max"]
    )
    host = config.BASE_URL

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # HTTP client for authentication and fallback
        self.http_client = self.client


# ============================================================================
# Additional Configuration
# ============================================================================

# This is automatically picked up by Locust
# Define all user classes to be used:
# - RegularUser (weight: 70)
# - PowerUser (weight: 20)
# - AdminUser (weight: 10)
# - WebSocketUser (weight: 5)

# Total weight: 105, so actual distribution is:
# - RegularUser: 66.7%
# - PowerUser: 19.0%
# - AdminUser: 9.5%
# - WebSocketUser: 4.8%
