"""
Database connection and session management
"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import redis
from qdrant_client import QdrantClient

from app.core.config import settings


# PostgreSQL
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
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


def check_postgres_connection() -> bool:
    """Check if PostgreSQL is accessible"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# Redis
redis_client = redis.Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=5,
)


def check_redis_connection() -> bool:
    """Check if Redis is accessible"""
    try:
        redis_client.ping()
        return True
    except Exception:
        return False


# Qdrant
qdrant_client = QdrantClient(
    host=settings.QDRANT_HOST,
    port=settings.QDRANT_PORT,
    timeout=5,
)


def check_qdrant_connection() -> bool:
    """Check if Qdrant is accessible"""
    try:
        qdrant_client.get_collections()
        return True
    except Exception:
        return False
