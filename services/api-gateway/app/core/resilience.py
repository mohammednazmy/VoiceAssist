"""
Resilience patterns: Circuit Breaker and Retry Logic

Provides resilience utilities for external service calls:
- Circuit breakers: Prevent cascading failures by failing fast when services are down
- Retry decorators: Automatic retry with exponential backoff for transient failures

Usage:
    @retry_openai_operation()
    @openai_breaker
    async def call_openai():
        ...

Circuit Breaker States:
- CLOSED: Normal operation, requests pass through
- OPEN: Service is failing, requests fail immediately
- HALF-OPEN: Testing if service recovered
"""

import logging

import httpx
import structlog
from openai import APIConnectionError, APITimeoutError, RateLimitError
from pybreaker import CircuitBreaker
from redis.exceptions import RedisError
from sqlalchemy.exc import DatabaseError, OperationalError
from tenacity import after_log, before_sleep_log, retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = structlog.get_logger(__name__)


# =============================================================================
# Circuit Breakers for External Dependencies
# =============================================================================

# Database Circuit Breaker
db_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="database_circuit_breaker",
)

# Redis Circuit Breaker
redis_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="redis_circuit_breaker",
)

# Qdrant Vector DB Circuit Breaker
qdrant_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="qdrant_circuit_breaker",
)

# OpenAI API Circuit Breaker
# Higher fail threshold and longer reset for external API
openai_breaker = CircuitBreaker(
    fail_max=10,  # More tolerant - transient failures common
    reset_timeout=120,  # 2 min reset - API issues may persist
    name="openai_circuit_breaker",
)

# ElevenLabs TTS API Circuit Breaker
elevenlabs_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=90,  # 90s reset - TTS issues tend to be transient
    name="elevenlabs_circuit_breaker",
)

# OpenAI TTS API Circuit Breaker (fallback provider)
openai_tts_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=90,  # Same as ElevenLabs - TTS failover needs quick recovery
    name="openai_tts_circuit_breaker",
)

# Generic External API Circuit Breaker (for other HTTP services)
external_api_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="external_api_circuit_breaker",
)


# Retry decorators with exponential backoff
def retry_database_operation():
    """
    Retry decorator for database operations
    Retries up to 3 times with exponential backoff
    """
    return retry(
        retry=retry_if_exception_type((OperationalError, DatabaseError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


def retry_redis_operation():
    """
    Retry decorator for Redis operations
    Retries up to 3 times with exponential backoff
    """
    return retry(
        retry=retry_if_exception_type(RedisError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


def retry_qdrant_operation():
    """
    Retry decorator for Qdrant operations
    Retries up to 3 times with exponential backoff
    """
    return retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


# =============================================================================
# External API Retry Decorators
# =============================================================================


def retry_openai_operation(max_attempts: int = 3):
    """
    Retry decorator for OpenAI API operations.

    Handles transient errors and rate limits with exponential backoff.
    Does NOT retry on authentication errors or invalid requests.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)

    Usage:
        @retry_openai_operation()
        @openai_breaker
        async def call_openai():
            ...
    """
    return retry(
        retry=retry_if_exception_type(
            (
                APIConnectionError,
                APITimeoutError,
                RateLimitError,
                # Also catch httpx errors that may occur during connection
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
            )
        ),
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=2, min=1, max=30),  # Longer waits for API
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


def retry_elevenlabs_operation(max_attempts: int = 3):
    """
    Retry decorator for ElevenLabs TTS API operations.

    Handles transient HTTP errors with exponential backoff.
    TTS requests may take longer, so uses moderate backoff timing.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)

    Usage:
        @retry_elevenlabs_operation()
        @elevenlabs_breaker
        async def call_elevenlabs():
            ...
    """
    return retry(
        retry=retry_if_exception_type(
            (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
                httpx.HTTPStatusError,  # Retry on 5xx errors
            )
        ),
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


def retry_openai_tts_operation(max_attempts: int = 2):
    """
    Retry decorator for OpenAI TTS API operations.

    Lower retry count than ElevenLabs since this is the fallback provider.
    We want to fail faster to avoid cascading delays in voice pipeline.

    Args:
        max_attempts: Maximum number of retry attempts (default: 2)

    Usage:
        @retry_openai_tts_operation()
        @openai_tts_breaker
        async def call_openai_tts():
            ...
    """
    return retry(
        retry=retry_if_exception_type(
            (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
                httpx.HTTPStatusError,  # Retry on 5xx errors
            )
        ),
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=0.5, max=5),  # Faster backoff for fallback
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


def retry_external_api_operation(max_attempts: int = 3):
    """
    Generic retry decorator for external HTTP API operations.

    Use this for any external API that doesn't have a specific retry decorator.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)

    Usage:
        @retry_external_api_operation()
        @external_api_breaker
        async def call_external_api():
            ...
    """
    return retry(
        retry=retry_if_exception_type(
            (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
            )
        ),
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.DEBUG),
        reraise=True,
    )


# =============================================================================
# Circuit Breaker Status Utilities
# =============================================================================


def get_circuit_breaker_status() -> dict:
    """
    Get status of all circuit breakers for health monitoring.

    Returns:
        Dict with breaker name -> status info
    """
    breakers = {
        "database": db_breaker,
        "redis": redis_breaker,
        "qdrant": qdrant_breaker,
        "openai": openai_breaker,
        "elevenlabs": elevenlabs_breaker,
        "openai_tts": openai_tts_breaker,
        "external_api": external_api_breaker,
    }

    return {
        name: {
            "state": str(breaker.current_state),
            "fail_count": breaker.fail_counter,
            "fail_max": breaker.fail_max,
            "reset_timeout": breaker.reset_timeout,
        }
        for name, breaker in breakers.items()
    }
