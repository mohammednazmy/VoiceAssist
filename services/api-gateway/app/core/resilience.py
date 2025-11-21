"""
Resilience patterns: Circuit Breaker and Retry Logic
"""
from pybreaker import CircuitBreaker
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    after_log,
)
from sqlalchemy.exc import OperationalError, DatabaseError
from redis.exceptions import RedisError
import structlog


logger = structlog.get_logger(__name__)


# Circuit Breakers for external dependencies
db_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="database_circuit_breaker",
)

redis_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="redis_circuit_breaker",
)

qdrant_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="qdrant_circuit_breaker",
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


# Import logging for retry decorators
import logging
