"""
Spike Testing Scenario for Locust Load Testing.

Tests system behavior under sudden traffic spikes.

Characteristics:
- Sudden user increase
- Very high spawn rate
- Short duration
- Tests auto-scaling and circuit breakers

Usage:
    locust -f scenarios/spike_scenario.py --host=http://localhost:8000 \
           --users=1000 --spawn-rate=200 --run-time=5m
"""
import random
import time
from locust import HttpUser, task, between, TaskSet, events

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


# Track spike test metrics
spike_metrics = {
    "requests_during_spike": 0,
    "failures_during_spike": 0,
    "spike_start_time": None,
    "first_minute_requests": 0,
    "first_minute_failures": 0,
}


@events.test_start.add_listener
def on_spike_test_start(environment, **kwargs):
    """Record spike test start time."""
    spike_metrics["spike_start_time"] = time.time()
    logger.info("="*80)
    logger.info("SPIKE TEST STARTING - Sudden Traffic Increase")
    logger.info("Monitoring system response to traffic spike...")
    logger.info("="*80)


@events.request.add_listener
def on_spike_request(request_type, name, response_time, response_length, response,
                     context, exception, **kwargs):
    """Track requests during spike test."""
    if spike_metrics["spike_start_time"]:
        elapsed = time.time() - spike_metrics["spike_start_time"]
        spike_metrics["requests_during_spike"] += 1

        if exception or (response and response.status_code >= 400):
            spike_metrics["failures_during_spike"] += 1

        # Track first minute separately
        if elapsed <= 60:
            spike_metrics["first_minute_requests"] += 1
            if exception or (response and response.status_code >= 400):
                spike_metrics["first_minute_failures"] += 1


@events.test_stop.add_listener
def on_spike_test_stop(environment, **kwargs):
    """Report spike test results."""
    total = spike_metrics["requests_during_spike"]
    failures = spike_metrics["failures_during_spike"]
    first_min_total = spike_metrics["first_minute_requests"]
    first_min_failures = spike_metrics["first_minute_failures"]

    logger.info("="*80)
    logger.info("SPIKE TEST RESULTS")
    logger.info("-"*80)
    logger.info(f"Total requests during spike: {total}")
    logger.info(f"Total failures during spike: {failures}")
    if total > 0:
        failure_rate = (failures / total) * 100
        logger.info(f"Overall failure rate: {failure_rate:.2f}%")

    logger.info("")
    logger.info("First Minute (Critical Period):")
    logger.info(f"  Requests: {first_min_total}")
    logger.info(f"  Failures: {first_min_failures}")
    if first_min_total > 0:
        first_min_failure_rate = (first_min_failures / first_min_total) * 100
        logger.info(f"  Failure rate: {first_min_failure_rate:.2f}%")

    logger.info("="*80)


class SpikeTestUserTasks(TaskSet):
    """
    Task set for spike testing.

    Simulates realistic user behavior during traffic spike.
    """

    def on_start(self):
        """Setup - quick login."""
        # Use existing test users to reduce registration load
        self.test_user = random.choice(config.TEST_USERS[:7])

        # Quick registration (may already exist)
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
        else:
            logger.error(f"Spike test user login failed: {self.test_user.email}")

    @task(50)
    def quick_query(self):
        """Quick simple query - most common spike behavior."""
        ChatTasks.simple_query_task(self)

    @task(20)
    def health_check(self):
        """Health check - users checking if system is responsive."""
        HealthTasks.basic_health_check(self)

    @task(15)
    def profile_check(self):
        """Quick profile check."""
        AuthenticationTasks.get_profile_task(self)

    @task(10)
    def complex_query(self):
        """Some users still do complex queries."""
        ChatTasks.complex_query_task(self)

    @task(5)
    def retry_on_failure(self):
        """Simulate retry behavior on failure."""
        # Try a query, if it fails, retry once
        for attempt in range(2):
            try:
                ChatTasks.simple_query_task(self)
                break  # Success, stop retrying
            except:
                if attempt == 0:
                    time.sleep(1)  # Wait before retry
                    logger.info("Retrying after failure...")


class SpikeTestUser(HttpUser):
    """
    User for spike testing.

    Characteristics:
    - Very short wait times (simulating spike)
    - Mix of operations
    - Some retry behavior
    """
    tasks = [SpikeTestUserTasks]
    wait_time = between(0.1, 1)  # Very aggressive - simulating spike
    host = config.BASE_URL


# For running this scenario standalone
if __name__ == "__main__":
    import os
    scenario = config.TEST_SCENARIOS["spike"]

    logger.info("="*80)
    logger.info("SPIKE TEST CONFIGURATION")
    logger.info(f"Target: {config.BASE_URL}")
    logger.info(f"Users: {scenario['users']}")
    logger.info(f"Spawn Rate: {scenario['spawn_rate']} users/sec")
    logger.info(f"Duration: {scenario['duration']}")
    logger.info("")
    logger.info("This will simulate a sudden traffic spike to test:")
    logger.info("- Auto-scaling capabilities")
    logger.info("- Circuit breaker behavior")
    logger.info("- Rate limiting effectiveness")
    logger.info("- Error handling under stress")
    logger.info("="*80)

    os.system(
        f"locust -f {__file__} "
        f"--host={config.BASE_URL} "
        f"--users={scenario['users']} "
        f"--spawn-rate={scenario['spawn_rate']} "
        f"--run-time={scenario['duration']} "
        f"--headless "
        f"--html=../results/spike_test_report.html "
        f"--csv=../results/spike_test"
    )
