"""
Stress Testing Scenario for Locust Load Testing.

High-load stress testing to identify system breaking points.

Characteristics:
- High user count
- Aggressive spawn rate
- Heavy operations
- Sustained load
- Resource-intensive queries

Usage:
    locust -f scenarios/stress_scenario.py --host=http://localhost:8000 \
           --users=500 --spawn-rate=50 --run-time=15m
"""
import random
import time
from locust import HttpUser, task, between, TaskSet

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import config
from utils import AuthHelper, DataGenerator, logger, metrics_tracker
from tasks import (
    AuthenticationTasks,
    ChatTasks,
    AdminTasks,
    HealthTasks
)


class StressTestUserTasks(TaskSet):
    """
    Task set for stress testing.

    Focus on resource-intensive operations:
    - Complex queries
    - Document uploads
    - Concurrent operations
    """

    def on_start(self):
        """Setup - create and login user."""
        # Create random user for stress test
        self.test_user_email = DataGenerator.random_email()
        self.test_user_password = DataGenerator.random_password()
        self.test_user_name = DataGenerator.random_name()

        # Register
        AuthHelper.register(
            self.client,
            self.test_user_email,
            self.test_user_password,
            self.test_user_name
        )

        # Login
        tokens = AuthHelper.login(
            self.client,
            self.test_user_email,
            self.test_user_password
        )

        if tokens:
            self.tokens = tokens
            logger.info(f"Stress test user logged in: {self.test_user_email}")
        else:
            logger.error(f"Stress test user login failed: {self.test_user_email}")

    @task(40)
    def complex_query_stress(self):
        """Execute complex query - high CPU/memory."""
        ChatTasks.complex_query_task(self)

    @task(30)
    def multi_turn_stress(self):
        """Execute multi-turn conversation - session management stress."""
        ChatTasks.multi_turn_conversation_task(self)

    @task(15)
    def rapid_fire_queries(self):
        """Execute multiple queries rapidly - connection pool stress."""
        for _ in range(3):
            ChatTasks.simple_query_task(self)
            time.sleep(0.5)  # Minimal wait

    @task(10)
    def concurrent_operations(self):
        """Execute concurrent operations - concurrency stress."""
        # Query profile and health simultaneously
        AuthenticationTasks.get_profile_task(self)
        HealthTasks.basic_health_check(self)

    @task(5)
    def token_refresh_stress(self):
        """Force token refresh - auth system stress."""
        AuthenticationTasks.refresh_token_task(self)


class StressTestAdminTasks(TaskSet):
    """
    Admin stress test tasks.

    Focus on admin-heavy operations:
    - Document uploads
    - Cache operations
    """

    def on_start(self):
        """Setup - login as admin."""
        self.test_user = next(
            user for user in config.TEST_USERS
            if user.role == "admin"
        )

        AuthHelper.register(
            self.client,
            self.test_user.email,
            self.test_user.password,
            self.test_user.full_name
        )

        tokens = AuthHelper.login(
            self.client,
            self.test_user.email,
            self.test_user.password
        )

        if tokens:
            self.tokens = tokens
            logger.info(f"Stress test admin logged in: {self.test_user.email}")

    @task(50)
    def upload_documents_stress(self):
        """Rapid document uploads - storage/indexing stress."""
        # Mix of document sizes
        size = random.choice(["small", "medium", "large"])
        AdminTasks.upload_document_task(self, size=size)

    @task(30)
    def list_documents_stress(self):
        """Frequent document listings - database query stress."""
        AdminTasks.list_documents_task(self)

    @task(20)
    def dashboard_stress(self):
        """Frequent dashboard loads - aggregation stress."""
        AdminTasks.view_dashboard_task(self)


class StressTestUser(HttpUser):
    """
    Regular user for stress testing.

    Characteristics:
    - Short wait times
    - Resource-intensive operations
    - High frequency
    """
    tasks = [StressTestUserTasks]
    weight = 80
    wait_time = between(0.5, 2)  # Very short wait times
    host = config.BASE_URL


class StressTestAdmin(HttpUser):
    """
    Admin user for stress testing.

    Characteristics:
    - Document upload stress
    - Admin operations
    - Short wait times
    """
    tasks = [StressTestAdminTasks]
    weight = 20
    wait_time = between(1, 3)
    host = config.BASE_URL


# For running this scenario standalone
if __name__ == "__main__":
    import os
    scenario = config.TEST_SCENARIOS["stress"]
    os.system(
        f"locust -f {__file__} "
        f"--host={config.BASE_URL} "
        f"--users={scenario['users']} "
        f"--spawn-rate={scenario['spawn_rate']} "
        f"--run-time={scenario['duration']} "
        f"--headless "
        f"--html=../results/stress_test_report.html "
        f"--csv=../results/stress_test"
    )
