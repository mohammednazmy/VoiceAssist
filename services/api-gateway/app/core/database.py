"""
Database connection and session management
"""

from typing import Generator

import redis
from app.core.config import settings
from app.core.resilience import db_breaker, redis_breaker, retry_database_operation, retry_redis_operation
from qdrant_client import AsyncQdrantClient
from redis.connection import ConnectionPool
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

# PostgreSQL - Optimized connection pooling with configurable settings
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=getattr(settings, "DB_POOL_SIZE", 20),  # Configurable, default 20
    max_overflow=getattr(settings, "DB_MAX_OVERFLOW", 40),  # Configurable, default 40
    pool_recycle=getattr(
        settings, "DB_POOL_RECYCLE", 3600
    ),  # Configurable, default 1 hour
    pool_timeout=getattr(settings, "DB_POOL_TIMEOUT", 30),  # Configurable, default 30s
    echo_pool=(
        settings.DEBUG if hasattr(settings, "DEBUG") else False
    ),  # Log pool events in debug mode
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@retry_database_operation()
@db_breaker
def check_postgres_connection() -> bool:
    """Check if PostgreSQL is accessible with retry and circuit breaker"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# Redis - Optimized connection pooling with configurable settings
redis_pool = ConnectionPool.from_url(
    settings.REDIS_URL,
    max_connections=getattr(
        settings, "REDIS_MAX_CONNECTIONS", 50
    ),  # Configurable, default 50
    socket_connect_timeout=getattr(
        settings, "REDIS_CONNECT_TIMEOUT", 5
    ),  # Configurable, default 5s
    socket_keepalive=True,
    health_check_interval=getattr(
        settings, "REDIS_HEALTH_CHECK_INTERVAL", 30
    ),  # Configurable, default 30s
    decode_responses=True,
)

redis_client = redis.Redis(connection_pool=redis_pool)


@retry_redis_operation()
@redis_breaker
def check_redis_connection() -> bool:
    """Check if Redis is accessible with retry and circuit breaker"""
    try:
        redis_client.ping()
        return True
    except Exception:
        return False


# Qdrant - Async client with gRPC for better performance (optional)
qdrant_client: AsyncQdrantClient | None = None
if settings.QDRANT_ENABLED:
    qdrant_client = AsyncQdrantClient(
        host=settings.QDRANT_HOST,
        port=settings.QDRANT_PORT,
        timeout=10,
        grpc_port=6334,
        prefer_grpc=True,  # Use gRPC for better performance
    )


async def check_qdrant_connection() -> bool:
    """Check if Qdrant is accessible with retry and circuit breaker"""
    if not settings.QDRANT_ENABLED:
        return True  # Skip check when disabled - report as healthy
    if qdrant_client is None:
        return False
    try:
        await qdrant_client.get_collections()
        return True
    except Exception:
        return False


# Connection Pool Monitoring Functions
def get_db_pool_stats() -> dict:
    """Get PostgreSQL connection pool statistics"""
    pool = engine.pool
    return {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "max_overflow": pool._max_overflow,
        "total_connections": pool.size() + pool.overflow(),
        "utilization_percent": (
            round(
                (
                    (pool.checkedout() + pool.overflow())
                    / (pool.size() + pool._max_overflow)
                )
                * 100,
                2,
            )
            if (pool.size() + pool._max_overflow) > 0
            else 0
        ),
    }


def get_redis_pool_stats() -> dict:
    """Get Redis connection pool statistics"""
    return {
        "max_connections": redis_pool.max_connections,
        "available_connections": redis_pool.max_connections
        - len(redis_pool._available_connections),
        "in_use_connections": (
            len(redis_pool._in_use_connections)
            if hasattr(redis_pool, "_in_use_connections")
            else 0
        ),
        "created_connections": (
            redis_pool._created_connections
            if hasattr(redis_pool, "_created_connections")
            else 0
        ),
    }
