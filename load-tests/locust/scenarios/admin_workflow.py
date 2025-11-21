"""
Admin Workflow Scenario for Locust Load Testing.

Tests complete admin workflow including:
- Document upload
- Document management
- User management
- System monitoring
- Cache operations

Usage:
    locust -f scenarios/admin_workflow.py --host=http://localhost:8000
"""
import random
import time
from locust import HttpUser, task, between, SequentialTaskSet

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import config
from utils import AuthHelper, DataGenerator, logger
from tasks import AdminTasks, AuthenticationTasks, HealthTasks


class AdminWorkflowTasks(SequentialTaskSet):
    """
    Sequential task set simulating admin workflow.

    Flow:
    1. Login as admin
    2. View dashboard
    3. Check system health
    4. Upload small document
    5. Upload medium document
    6. List documents
    7. Check cache stats
    8. View metrics
    9. Manage feature flags
    10. Clear cache (optional)
    11. Final dashboard check
    """

    def on_start(self):
        """Initialize admin workflow."""
        # Use admin test user
        self.test_user = next(
            user for user in config.TEST_USERS
            if user.role == "admin"
        )

        logger.info(f"Admin workflow started for: {self.test_user.email}")

    @task
    def step_1_login(self):
        """Step 1: Login as admin."""
        logger.info(f"Admin workflow - Step 1: Login")

        # Ensure admin is registered
        AuthHelper.register(
            self.client,
            self.test_user.email,
            self.test_user.password,
            self.test_user.full_name
        )

        # Login
        tokens = AuthHelper.login(
            self.client,
            self.test_user.email,
            self.test_user.password
        )

        if tokens:
            self.tokens = tokens
            logger.info(f"Admin login successful: {self.test_user.email}")
        else:
            logger.error(f"Admin login failed: {self.test_user.email}")
            self.interrupt()

        time.sleep(2)

    @task
    def step_2_view_dashboard(self):
        """Step 2: View admin dashboard."""
        logger.info(f"Admin workflow - Step 2: View dashboard")
        AdminTasks.view_dashboard_task(self)
        time.sleep(3)

    @task
    def step_3_check_health(self):
        """Step 3: Check system health."""
        logger.info(f"Admin workflow - Step 3: Check health")
        HealthTasks.detailed_health_check(self)
        time.sleep(2)

    @task
    def step_4_upload_small_doc(self):
        """Step 4: Upload small document."""
        logger.info(f"Admin workflow - Step 4: Upload small document")
        AdminTasks.upload_document_task(self, size="small")
        time.sleep(3)

    @task
    def step_5_upload_medium_doc(self):
        """Step 5: Upload medium document."""
        logger.info(f"Admin workflow - Step 5: Upload medium document")
        AdminTasks.upload_document_task(self, size="medium")
        time.sleep(5)

    @task
    def step_6_list_documents(self):
        """Step 6: List all documents."""
        logger.info(f"Admin workflow - Step 6: List documents")
        AdminTasks.list_documents_task(self)
        time.sleep(2)

    @task
    def step_7_check_cache(self):
        """Step 7: Check cache statistics."""
        logger.info(f"Admin workflow - Step 7: Check cache")
        AdminTasks.manage_cache_task(self)
        time.sleep(2)

    @task
    def step_8_view_metrics(self):
        """Step 8: View system metrics."""
        logger.info(f"Admin workflow - Step 8: View metrics")
        AdminTasks.view_metrics_task(self)
        time.sleep(3)

    @task
    def step_9_feature_flags(self):
        """Step 9: Manage feature flags."""
        logger.info(f"Admin workflow - Step 9: Feature flags")
        AdminTasks.manage_feature_flags_task(self)
        time.sleep(2)

    @task
    def step_10_upload_large_doc(self):
        """Step 10: Upload large document (stress test)."""
        logger.info(f"Admin workflow - Step 10: Upload large document")

        # Only 30% of the time to avoid overwhelming system
        if random.random() < 0.3:
            AdminTasks.upload_document_task(self, size="large")
            time.sleep(10)
        else:
            logger.info(f"Skipping large document upload (30% probability)")
            time.sleep(2)

    @task
    def step_11_list_documents_again(self):
        """Step 11: List documents again."""
        logger.info(f"Admin workflow - Step 11: List documents again")
        AdminTasks.list_documents_task(self)
        time.sleep(2)

    @task
    def step_12_final_dashboard(self):
        """Step 12: Final dashboard check."""
        logger.info(f"Admin workflow - Step 12: Final dashboard check")
        AdminTasks.view_dashboard_task(self)
        time.sleep(2)

        # Complete workflow
        logger.info(f"Admin workflow completed for: {self.test_user.email}")
        self.interrupt()


class AdminWorkflowUser(HttpUser):
    """
    User simulating admin workflow.

    This user executes admin-specific operations in sequence.
    """
    tasks = [AdminWorkflowTasks]
    wait_time = between(2, 5)
    host = config.BASE_URL


# For running this scenario standalone
if __name__ == "__main__":
    import os
    os.system(f"locust -f {__file__} --host={config.BASE_URL}")
