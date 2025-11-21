"""
User Journey Scenario for Locust Load Testing.

Complete user journey from registration to queries, simulating
realistic end-to-end user behavior.

Usage:
    locust -f scenarios/user_journey.py --host=http://localhost:8000
"""
import random
import time
from locust import HttpUser, task, between, SequentialTaskSet

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import config
from utils import AuthHelper, DataGenerator, logger
from tasks import ChatTasks, AuthenticationTasks, HealthTasks


class UserJourneyTasks(SequentialTaskSet):
    """
    Sequential task set simulating complete user journey.

    Flow:
    1. Check system health
    2. Register new account
    3. Login
    4. Ask simple question
    5. Ask follow-up questions
    6. Check profile
    7. Ask complex question
    8. Logout
    """

    def on_start(self):
        """Initialize user journey."""
        self.test_user_email = DataGenerator.random_email()
        self.test_user_password = DataGenerator.random_password()
        self.test_user_name = DataGenerator.random_name()

        logger.info(f"User journey started for: {self.test_user_email}")

    @task
    def step_1_health_check(self):
        """Step 1: Check system health before registration."""
        logger.info(f"User journey - Step 1: Health check")
        HealthTasks.basic_health_check(self)
        time.sleep(1)

    @task
    def step_2_register(self):
        """Step 2: Register new account."""
        logger.info(f"User journey - Step 2: Register account")

        success = AuthHelper.register(
            self.client,
            self.test_user_email,
            self.test_user_password,
            self.test_user_name
        )

        if success:
            logger.info(f"Registration successful: {self.test_user_email}")
        else:
            logger.error(f"Registration failed: {self.test_user_email}")

        time.sleep(2)

    @task
    def step_3_login(self):
        """Step 3: Login with new account."""
        logger.info(f"User journey - Step 3: Login")

        tokens = AuthHelper.login(
            self.client,
            self.test_user_email,
            self.test_user_password
        )

        if tokens:
            self.tokens = tokens
            logger.info(f"Login successful: {self.test_user_email}")
        else:
            logger.error(f"Login failed: {self.test_user_email}")
            self.interrupt()

        time.sleep(2)

    @task
    def step_4_simple_question(self):
        """Step 4: Ask first simple question."""
        logger.info(f"User journey - Step 4: Simple question")
        ChatTasks.simple_query_task(self)
        time.sleep(3)

    @task
    def step_5_follow_up_1(self):
        """Step 5: Ask follow-up question."""
        logger.info(f"User journey - Step 5: Follow-up question 1")
        ChatTasks.simple_query_task(self)
        time.sleep(3)

    @task
    def step_6_follow_up_2(self):
        """Step 6: Ask another follow-up question."""
        logger.info(f"User journey - Step 6: Follow-up question 2")
        ChatTasks.simple_query_task(self)
        time.sleep(4)

    @task
    def step_7_check_profile(self):
        """Step 7: Check user profile."""
        logger.info(f"User journey - Step 7: Check profile")
        AuthenticationTasks.get_profile_task(self)
        time.sleep(2)

    @task
    def step_8_complex_question(self):
        """Step 8: Ask complex medical question."""
        logger.info(f"User journey - Step 8: Complex question")
        ChatTasks.complex_query_task(self)
        time.sleep(5)

    @task
    def step_9_review_answer(self):
        """Step 9: Simulate reviewing answer (wait)."""
        logger.info(f"User journey - Step 9: Review answer")
        time.sleep(10)  # User reading response

    @task
    def step_10_final_question(self):
        """Step 10: Ask final clarifying question."""
        logger.info(f"User journey - Step 10: Final question")
        ChatTasks.simple_query_task(self)
        time.sleep(3)

    @task
    def step_11_logout(self):
        """Step 11: Logout."""
        logger.info(f"User journey - Step 11: Logout")

        if hasattr(self, 'tokens'):
            headers = AuthHelper.get_auth_headers(self.tokens['access_token'])

            with self.client.post(
                config.ENDPOINTS["logout"],
                headers=headers,
                name="/api/auth/logout",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    logger.info(f"Logout successful: {self.test_user_email}")
                    response.success()
                else:
                    response.failure(f"Logout failed: {response.status_code}")

        # Stop after completing journey
        self.interrupt()


class UserJourneyUser(HttpUser):
    """
    User simulating complete user journey.

    This user executes a sequential flow from registration to logout.
    """
    tasks = [UserJourneyTasks]
    wait_time = between(2, 5)
    host = config.BASE_URL


# For running this scenario standalone
if __name__ == "__main__":
    import os
    os.system(f"locust -f {__file__} --host={config.BASE_URL}")
