"""
Database connection and session management

Provides:
- Sync and async database sessions with proper pooling
- Transaction context managers for ACID compliance
- Redis and Qdrant client connections
- Connection pool monitoring utilities
"""

from contextlib import asynccontextmanager, contextmanager
from typing import AsyncGenerator, Callable, Generator, TypeVar

import redis
import structlog
from app.core.config import settings
from app.core.resilience import db_breaker, redis_breaker, retry_database_operation, retry_redis_operation
from qdrant_client import AsyncQdrantClient
from redis.connection import ConnectionPool
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

logger = structlog.get_logger(__name__)
T = TypeVar("T")

# PostgreSQL - Optimized connection pooling with configurable settings
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=getattr(settings, "DB_POOL_SIZE", 20),  # Configurable, default 20
    max_overflow=getattr(settings, "DB_MAX_OVERFLOW", 40),  # Configurable, default 40
    pool_recycle=getattr(settings, "DB_POOL_RECYCLE", 3600),  # Configurable, default 1 hour
    pool_timeout=getattr(settings, "DB_POOL_TIMEOUT", 30),  # Configurable, default 30s
    echo_pool=(settings.DEBUG if hasattr(settings, "DEBUG") else False),  # Log pool events in debug mode
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


# Async PostgreSQL Engine for async operations
# Convert postgresql:// to postgresql+asyncpg:// for async driver
_async_db_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
async_engine = create_async_engine(
    _async_db_url,
    pool_pre_ping=True,
    pool_size=getattr(settings, "DB_POOL_SIZE", 20),
    max_overflow=getattr(settings, "DB_MAX_OVERFLOW", 40),
    pool_recycle=getattr(settings, "DB_POOL_RECYCLE", 3600),
    pool_timeout=getattr(settings, "DB_POOL_TIMEOUT", 30),
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session for async operations."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# =============================================================================
# Transaction Context Managers
# =============================================================================


@contextmanager
def transaction(db: Session) -> Generator[Session, None, None]:
    """
    Synchronous transaction context manager with automatic commit/rollback.

    Usage:
        with transaction(db) as session:
            session.add(new_object)
            # Commits automatically on success, rolls back on exception

    Args:
        db: SQLAlchemy Session instance

    Yields:
        The same session for use within the transaction

    Raises:
        Any exception raised within the context (after rollback)
    """
    try:
        yield db
        db.commit()
        logger.debug("Transaction committed successfully")
    except Exception as e:
        db.rollback()
        logger.error(
            "Transaction rolled back due to error",
            error=str(e),
            error_type=type(e).__name__,
        )
        raise


@asynccontextmanager
async def async_transaction(db: AsyncSession) -> AsyncGenerator[AsyncSession, None]:
    """
    Asynchronous transaction context manager with automatic commit/rollback.

    Usage:
        async with async_transaction(db) as session:
            session.add(new_object)
            # Commits automatically on success, rolls back on exception

    Args:
        db: SQLAlchemy AsyncSession instance

    Yields:
        The same session for use within the transaction

    Raises:
        Any exception raised within the context (after rollback)
    """
    try:
        yield db
        await db.commit()
        logger.debug("Async transaction committed successfully")
    except Exception as e:
        await db.rollback()
        logger.error(
            "Async transaction rolled back due to error",
            error=str(e),
            error_type=type(e).__name__,
        )
        raise


def transactional(func: Callable[..., T]) -> Callable[..., T]:
    """
    Decorator for wrapping a function in a transaction.

    The decorated function must accept a 'db' keyword argument of type Session.
    The transaction will commit on success or rollback on exception.

    Usage:
        @transactional
        def create_user(db: Session, name: str) -> User:
            user = User(name=name)
            db.add(user)
            return user

    Note: For async functions, use @async_transactional instead.
    """
    from functools import wraps

    @wraps(func)
    def wrapper(*args, **kwargs):
        db = kwargs.get("db")
        if db is None:
            # Try to find db in positional args (common pattern: def func(db, ...))
            for arg in args:
                if isinstance(arg, Session):
                    db = arg
                    break

        if db is None:
            raise ValueError("transactional decorator requires a 'db' Session argument")

        with transaction(db):
            return func(*args, **kwargs)

    return wrapper


def async_transactional(func: Callable[..., T]) -> Callable[..., T]:
    """
    Decorator for wrapping an async function in a transaction.

    The decorated function must accept a 'db' keyword argument of type AsyncSession.
    The transaction will commit on success or rollback on exception.

    Usage:
        @async_transactional
        async def create_user(db: AsyncSession, name: str) -> User:
            user = User(name=name)
            db.add(user)
            return user
    """
    from functools import wraps

    @wraps(func)
    async def wrapper(*args, **kwargs):
        db = kwargs.get("db")
        if db is None:
            # Try to find db in positional args
            for arg in args:
                if isinstance(arg, AsyncSession):
                    db = arg
                    break

        if db is None:
            raise ValueError("async_transactional decorator requires a 'db' AsyncSession argument")

        async with async_transaction(db):
            return await func(*args, **kwargs)

    return wrapper


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
    max_connections=getattr(settings, "REDIS_MAX_CONNECTIONS", 50),  # Configurable, default 50
    socket_connect_timeout=getattr(settings, "REDIS_CONNECT_TIMEOUT", 5),  # Configurable, default 5s
    socket_keepalive=True,
    health_check_interval=getattr(settings, "REDIS_HEALTH_CHECK_INTERVAL", 30),  # Configurable, default 30s
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
                ((pool.checkedout() + pool.overflow()) / (pool.size() + pool._max_overflow)) * 100,
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
        "available_connections": redis_pool.max_connections - len(redis_pool._available_connections),
        "in_use_connections": (
            len(redis_pool._in_use_connections) if hasattr(redis_pool, "_in_use_connections") else 0
        ),
        "created_connections": (redis_pool._created_connections if hasattr(redis_pool, "_created_connections") else 0),
    }
