"""
Utility functions for Locust load testing.

Provides helper functions for:
- Authentication
- Random data generation
- Custom event hooks
- Result formatting
- Metric tracking
"""
import random
import string
import time
import json
from datetime import datetime
from typing import Dict, Any, Optional, List
import logging

from locust import events
from config import config, TestUser


logger = logging.getLogger(__name__)


# ============================================================================
# Authentication Helpers
# ============================================================================

class AuthHelper:
    """Helper class for authentication operations."""

    @staticmethod
    def login(client, email: str, password: str) -> Optional[Dict[str, str]]:
        """
        Login and return tokens.

        Args:
            client: Locust HTTP client
            email: User email
            password: User password

        Returns:
            Dictionary with access_token and refresh_token, or None on failure
        """
        try:
            with client.post(
                config.ENDPOINTS["login"],
                json={"email": email, "password": password},
                name="/api/auth/login",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "access_token": data.get("access_token"),
                        "refresh_token": data.get("refresh_token")
                    }
                else:
                    response.failure(f"Login failed: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Login error: {e}")
            return None

    @staticmethod
    def register(client, email: str, password: str, full_name: str) -> bool:
        """
        Register a new user.

        Args:
            client: Locust HTTP client
            email: User email
            password: User password
            full_name: User's full name

        Returns:
            True if registration successful, False otherwise
        """
        try:
            with client.post(
                config.ENDPOINTS["register"],
                json={
                    "email": email,
                    "password": password,
                    "full_name": full_name
                },
                name="/api/auth/register",
                catch_response=True
            ) as response:
                if response.status_code == 201:
                    return True
                elif response.status_code == 400:
                    # User already exists - that's okay for load testing
                    response.success()
                    return True
                else:
                    response.failure(f"Registration failed: {response.status_code}")
                    return False
        except Exception as e:
            logger.error(f"Registration error: {e}")
            return False

    @staticmethod
    def refresh_token(client, refresh_token: str) -> Optional[Dict[str, str]]:
        """
        Refresh access token.

        Args:
            client: Locust HTTP client
            refresh_token: Refresh token

        Returns:
            Dictionary with new tokens, or None on failure
        """
        try:
            with client.post(
                config.ENDPOINTS["refresh"],
                json={"refresh_token": refresh_token},
                name="/api/auth/refresh",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "access_token": data.get("access_token"),
                        "refresh_token": data.get("refresh_token")
                    }
                else:
                    response.failure(f"Token refresh failed: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return None

    @staticmethod
    def get_auth_headers(access_token: str) -> Dict[str, str]:
        """
        Get authorization headers.

        Args:
            access_token: JWT access token

        Returns:
            Headers dictionary with Authorization
        """
        return {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }


# ============================================================================
# Random Data Generators
# ============================================================================

class DataGenerator:
    """Generate random test data."""

    @staticmethod
    def random_email() -> str:
        """Generate random email address."""
        username = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
        return f"{username}@loadtest.com"

    @staticmethod
    def random_password(length: int = 12) -> str:
        """Generate random password."""
        chars = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(random.choices(chars, k=length))

    @staticmethod
    def random_name() -> str:
        """Generate random full name."""
        first_names = ["John", "Jane", "Bob", "Alice", "Charlie", "Diana", "Eve", "Frank"]
        last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller"]
        return f"{random.choice(first_names)} {random.choice(last_names)}"

    @staticmethod
    def random_query(difficulty: str = "moderate") -> str:
        """
        Get random query based on difficulty.

        Args:
            difficulty: 'simple', 'moderate', or 'complex'

        Returns:
            Random query string
        """
        queries = config.SAMPLE_QUERIES.get(difficulty, config.SAMPLE_QUERIES["moderate"])
        return random.choice(queries)

    @staticmethod
    def random_document_content(size: str = "medium") -> Dict[str, Any]:
        """
        Get random document content for upload testing.

        Args:
            size: 'small', 'medium', or 'large'

        Returns:
            Dictionary with filename, content, and title
        """
        doc_template = config.TEST_DOCUMENTS.get(size, config.TEST_DOCUMENTS["medium"])

        # Add uniqueness to avoid conflicts
        timestamp = int(time.time())
        return {
            "filename": f"{timestamp}_{doc_template['filename']}",
            "content": doc_template["content"],
            "title": f"{doc_template['title']} - {timestamp}"
        }

    @staticmethod
    def random_session_id() -> str:
        """Generate random session ID."""
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))


# ============================================================================
# WebSocket Message Helpers
# ============================================================================

class WebSocketHelper:
    """Helper for WebSocket message creation."""

    @staticmethod
    def create_message(content: str, session_id: Optional[str] = None) -> str:
        """
        Create WebSocket message.

        Args:
            content: Message content
            session_id: Optional session ID

        Returns:
            JSON string of WebSocket message
        """
        message = {
            "type": "message",
            "content": content,
        }
        if session_id:
            message["session_id"] = session_id

        return json.dumps(message)

    @staticmethod
    def create_ping() -> str:
        """Create ping message."""
        return json.dumps({"type": "ping"})

    @staticmethod
    def parse_message(raw_message: str) -> Optional[Dict[str, Any]]:
        """
        Parse WebSocket message.

        Args:
            raw_message: Raw message string

        Returns:
            Parsed message dictionary or None on error
        """
        try:
            return json.loads(raw_message)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse WebSocket message: {raw_message}")
            return None


# ============================================================================
# Custom Event Tracking
# ============================================================================

class MetricsTracker:
    """Track custom metrics during load testing."""

    def __init__(self):
        self.metrics = {
            "auth_failures": 0,
            "rate_limit_hits": 0,
            "websocket_connections": 0,
            "websocket_failures": 0,
            "document_uploads": 0,
            "document_upload_failures": 0,
            "queries_with_citations": 0,
            "queries_without_citations": 0,
        }
        self.response_times = {
            "auth": [],
            "chat": [],
            "admin": [],
            "websocket": [],
        }

    def record_auth_failure(self):
        """Record authentication failure."""
        self.metrics["auth_failures"] += 1

    def record_rate_limit_hit(self):
        """Record rate limit hit."""
        self.metrics["rate_limit_hits"] += 1

    def record_websocket_connection(self, success: bool):
        """Record WebSocket connection attempt."""
        if success:
            self.metrics["websocket_connections"] += 1
        else:
            self.metrics["websocket_failures"] += 1

    def record_document_upload(self, success: bool):
        """Record document upload attempt."""
        if success:
            self.metrics["document_uploads"] += 1
        else:
            self.metrics["document_upload_failures"] += 1

    def record_query_result(self, has_citations: bool):
        """Record query result with/without citations."""
        if has_citations:
            self.metrics["queries_with_citations"] += 1
        else:
            self.metrics["queries_without_citations"] += 1

    def record_response_time(self, category: str, response_time: float):
        """Record response time for a category."""
        if category in self.response_times:
            self.response_times[category].append(response_time)

    def get_summary(self) -> Dict[str, Any]:
        """Get metrics summary."""
        summary = dict(self.metrics)

        # Calculate averages for response times
        for category, times in self.response_times.items():
            if times:
                summary[f"{category}_avg_response_time"] = sum(times) / len(times)
                summary[f"{category}_max_response_time"] = max(times)
                summary[f"{category}_min_response_time"] = min(times)
            else:
                summary[f"{category}_avg_response_time"] = 0
                summary[f"{category}_max_response_time"] = 0
                summary[f"{category}_min_response_time"] = 0

        return summary


# Global metrics tracker
metrics_tracker = MetricsTracker()


# ============================================================================
# Event Hooks
# ============================================================================

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Hook called when test starts."""
    logger.info("="*80)
    logger.info("VoiceAssist Load Test Starting")
    logger.info(f"Target URL: {config.BASE_URL}")
    logger.info(f"WebSocket URL: {config.WS_URL}")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}")
    logger.info("="*80)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Hook called when test stops."""
    logger.info("="*80)
    logger.info("VoiceAssist Load Test Completed")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}")

    # Print custom metrics summary
    summary = metrics_tracker.get_summary()
    logger.info("\nCustom Metrics Summary:")
    logger.info("-"*80)
    for key, value in summary.items():
        logger.info(f"{key}: {value}")
    logger.info("="*80)


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response,
               context, exception, **kwargs):
    """Hook called for each request."""

    # Track rate limit hits (429 status code)
    if response and response.status_code == 429:
        metrics_tracker.record_rate_limit_hit()

    # Track authentication failures
    if response and "/auth/" in name and response.status_code >= 400:
        metrics_tracker.record_auth_failure()

    # Categorize and track response times
    if "/auth/" in name:
        metrics_tracker.record_response_time("auth", response_time)
    elif "/chat" in name or "/realtime" in name:
        metrics_tracker.record_response_time("chat", response_time)
    elif "/admin/" in name:
        metrics_tracker.record_response_time("admin", response_time)


# ============================================================================
# Result Formatters
# ============================================================================

class ResultFormatter:
    """Format test results for output."""

    @staticmethod
    def format_summary(stats: Dict[str, Any]) -> str:
        """
        Format statistics summary.

        Args:
            stats: Statistics dictionary

        Returns:
            Formatted string
        """
        lines = [
            "\n" + "="*80,
            "LOAD TEST SUMMARY",
            "="*80,
        ]

        for key, value in stats.items():
            lines.append(f"{key:.<50} {value}")

        lines.append("="*80)
        return "\n".join(lines)

    @staticmethod
    def export_to_json(stats: Dict[str, Any], filename: str):
        """
        Export statistics to JSON file.

        Args:
            stats: Statistics dictionary
            filename: Output filename
        """
        with open(filename, 'w') as f:
            json.dump(stats, f, indent=2)
        logger.info(f"Results exported to {filename}")

    @staticmethod
    def export_to_csv(stats: List[Dict[str, Any]], filename: str):
        """
        Export statistics to CSV file.

        Args:
            stats: List of statistics dictionaries
            filename: Output filename
        """
        import csv

        if not stats:
            return

        keys = stats[0].keys()
        with open(filename, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(stats)

        logger.info(f"Results exported to {filename}")


# ============================================================================
# Validation Helpers
# ============================================================================

class ResponseValidator:
    """Validate API responses."""

    @staticmethod
    def validate_auth_response(response: Any) -> bool:
        """Validate authentication response."""
        if response.status_code != 200:
            return False

        try:
            data = response.json()
            return "access_token" in data and "refresh_token" in data
        except:
            return False

    @staticmethod
    def validate_chat_response(response: Any) -> bool:
        """Validate chat response."""
        if response.status_code != 200:
            return False

        try:
            data = response.json()
            # Check for expected response structure
            return "answer" in data or "response" in data
        except:
            return False

    @staticmethod
    def validate_admin_response(response: Any) -> bool:
        """Validate admin response."""
        return response.status_code in [200, 201]

    @staticmethod
    def check_performance_threshold(response_time: float, threshold: float) -> bool:
        """
        Check if response time meets threshold.

        Args:
            response_time: Actual response time in ms
            threshold: Threshold in ms

        Returns:
            True if within threshold, False otherwise
        """
        return response_time <= threshold
