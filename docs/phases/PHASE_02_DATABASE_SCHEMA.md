---
title: "Phase 02 Database Schema"
slug: "phases/phase-02-database-schema"
summary: "> **WARNING: LEGACY V1 PHASE - NOT CANONICAL FOR V2**"
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["backend"]
tags: ["phase", "database", "schema"]
---

# Phase 2: Database Schema & Models

> **WARNING: LEGACY V1 PHASE - NOT CANONICAL FOR V2**
> This describes the original V1 phase.
> For the current 15-phase V2 plan, see:
>
> - [DEVELOPMENT_PHASES_V2.md](../DEVELOPMENT_PHASES_V2.md)
> - [PHASE_00_INITIALIZATION.md](PHASE_00_INITIALIZATION.md)
> - [CURRENT_PHASE.md](../../CURRENT_PHASE.md)
> - [PHASE_STATUS.md](../../PHASE_STATUS.md)
>
> **Note**: New V2 phase docs will be created later. Do not use this as an implementation guide for V2.

## Goal

Create complete database schema with SQLAlchemy models, set up Alembic migrations, configure pgvector, and create Qdrant collections for vector storage.

## Estimated Time

3-4 hours

## Prerequisites

- Phase 1 completed
- PostgreSQL running with pgvector extension
- Qdrant running
- FastAPI application can start

## Entry Checklist

- [ ] Phase 1 is complete
- [ ] All services are running (`~/VoiceAssist/scripts/start-services.sh`)
- [ ] Can connect to PostgreSQL: `psql voiceassist`
- [ ] Can connect to Qdrant: `curl http://localhost:6333`
- [ ] FastAPI app runs without errors

## Tasks

### Task 1: Install Alembic for Migrations

```bash
cd ~/VoiceAssist/server
source venv/bin/activate

# Should already be installed from Phase 1, but verify
pip install alembic

# Initialize Alembic
alembic init alembic
```

### Task 2: Configure Alembic

Edit `~/VoiceAssist/server/alembic.ini`:

```ini
# Update this line:
sqlalchemy.url = postgresql://localhost/voiceassist

# Change to read from environment:
# sqlalchemy.url = driver://user:pass@localhost/dbname
```

Edit `~/VoiceAssist/server/alembic/env.py`:

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parents[1]))

from app.core.config import settings
from app.models.base import Base  # We'll create this

# this is the Alembic Config object
config = context.config

# Override sqlalchemy.url with our config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models here so Alembic can detect them
from app.models import user, conversation, document, embedding  # We'll create these

target_metadata = Base.metadata

# ... rest of the file stays the same
```

### Task 3: Create Database Models

Create `~/VoiceAssist/server/app/models/__init__.py`:

```python
"""Database models"""
from app.models.base import Base
from app.models.user import User
from app.models.conversation import Conversation, Message
from app.models.document import Document, DocumentChunk
from app.models.embedding import Embedding

__all__ = [
    "Base",
    "User",
    "Conversation",
    "Message",
    "Document",
    "DocumentChunk",
    "Embedding",
]
```

Create `~/VoiceAssist/server/app/models/base.py`:

```python
"""Base model for all database models"""
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, DateTime
from datetime import datetime

Base = declarative_base()


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps"""
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

Create `~/VoiceAssist/server/app/models/user.py`:

```python
"""User model"""
from sqlalchemy import Column, String, Boolean, Integer
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """User account"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)

    # Relationships
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email}>"
```

Create `~/VoiceAssist/server/app/models/conversation.py`:

```python
"""Conversation and Message models"""
from sqlalchemy import Column, String, Integer, ForeignKey, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin
import enum


class MessageRole(str, enum.Enum):
    """Message role enum"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(Base, TimestampMixin):
    """Conversation (chat session)"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=True)  # Auto-generated or user-set
    is_archived = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")

    def __repr__(self):
        return f"<Conversation {self.id}: {self.title}>"


class Message(Base, TimestampMixin):
    """Message in a conversation"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    role = Column(SQLEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    metadata = Column(JSON, default={})  # For citations, attachments, etc.

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")

    def __repr__(self):
        return f"<Message {self.id}: {self.role}>"
```

Create `~/VoiceAssist/server/app/models/document.py`:

```python
"""Document and DocumentChunk models"""
from sqlalchemy import Column, String, Integer, ForeignKey, Text, JSON, Enum as SQLEnum, Float
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin
import enum


class DocumentType(str, enum.Enum):
    """Document type enum"""
    TEXTBOOK = "textbook"
    JOURNAL = "journal"
    GUIDELINE = "guideline"
    NOTE = "note"
    OTHER = "other"


class Document(Base, TimestampMixin):
    """Uploaded or indexed document"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    document_type = Column(SQLEnum(DocumentType), nullable=False)
    file_path = Column(String, nullable=True)  # Path to original file
    file_size = Column(Integer, nullable=True)  # Size in bytes
    page_count = Column(Integer, nullable=True)
    metadata = Column(JSON, default={})  # Author, year, edition, etc.
    is_indexed = Column(Boolean, default=False)
    specialty = Column(String, nullable=True)  # Medical specialty

    # Relationships
    user = relationship("User", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document {self.id}: {self.title}>"


class DocumentChunk(Base, TimestampMixin):
    """Chunk of a document for RAG"""
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)  # Order in document
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    chapter = Column(String, nullable=True)
    section = Column(String, nullable=True)
    metadata = Column(JSON, default={})
    embedding_id = Column(String, nullable=True)  # ID in Qdrant

    # Relationships
    document = relationship("Document", back_populates="chunks")

    def __repr__(self):
        return f"<DocumentChunk {self.id} of Document {self.document_id}>"
```

Create `~/VoiceAssist/server/app/models/embedding.py`:

```python
"""Embedding model for tracking"""
from sqlalchemy import Column, String, Integer, Float
from app.models.base import Base, TimestampMixin


class Embedding(Base, TimestampMixin):
    """Track embeddings (optional, for analytics)"""
    __tablename__ = "embeddings"

    id = Column(Integer, primary_key=True, index=True)
    embedding_id = Column(String, unique=True, index=True)  # ID in Qdrant
    source_type = Column(String)  # document_chunk, message, etc.
    source_id = Column(Integer)
    model = Column(String)  # Embedding model used
    dimension = Column(Integer)  # Vector dimension

    def __repr__(self):
        return f"<Embedding {self.embedding_id}>"
```

### Task 4: Create Database Session Dependency

Create `~/VoiceAssist/server/app/core/database.py`:

```python
"""Database session management"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

# Create engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Task 5: Create Initial Migration

```bash
cd ~/VoiceAssist/server
source venv/bin/activate

# Create initial migration
alembic revision --autogenerate -m "Initial schema"

# Review the generated migration in alembic/versions/
# Make sure it includes all tables

# Apply migration
alembic upgrade head
```

**Verify:**

```bash
# Check tables were created
psql voiceassist -c "\dt"

# Should show: users, conversations, messages, documents, document_chunks, embeddings, alembic_version
```

### Task 6: Create Qdrant Collections

Create `~/VoiceAssist/server/app/core/vector_db.py`:

```python
"""Qdrant vector database client"""
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class VectorDB:
    """Qdrant vector database wrapper"""

    def __init__(self):
        self.client = QdrantClient(url=settings.QDRANT_URL)
        self.collection_name = settings.QDRANT_COLLECTION_NAME

    def create_collection(self, dimension: int = 1536):
        """Create collection if it doesn't exist"""
        try:
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]

            if self.collection_name not in collection_names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=dimension,
                        distance=Distance.COSINE
                    )
                )
                logger.info(f"Created collection: {self.collection_name}")
            else:
                logger.info(f"Collection already exists: {self.collection_name}")
        except Exception as e:
            logger.error(f"Error creating collection: {e}")
            raise

    def collection_exists(self) -> bool:
        """Check if collection exists"""
        try:
            collections = self.client.get_collections().collections
            return any(c.name == self.collection_name for c in collections)
        except Exception as e:
            logger.error(f"Error checking collection: {e}")
            return False


# Global instance
vector_db = VectorDB()
```

Create initialization script: `~/VoiceAssist/server/app/core/init_db.py`:

```python
"""Initialize database and vector DB"""
from app.core.database import engine
from app.models.base import Base
from app.core.vector_db import vector_db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_db():
    """Initialize database"""
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    logger.info("Creating Qdrant collection...")
    vector_db.create_collection()
    logger.info("Qdrant collection created")


if __name__ == "__main__":
    init_db()
    print("✅ Database initialized successfully")
```

Run initialization:

```bash
cd ~/VoiceAssist/server
source venv/bin/activate
python -m app.core.init_db
```

### Task 7: Add Database Check to Health Endpoint

Update `~/VoiceAssist/server/app/main.py`:

```python
# Add at top
from app.core.database import SessionLocal
from sqlalchemy import text

# Update health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint with service status"""
    health_status = {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION,
        "services": {}
    }

    # Check database
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        health_status["services"]["database"] = "connected"
    except Exception as e:
        health_status["services"]["database"] = f"error: {str(e)}"
        health_status["status"] = "unhealthy"

    # Check Qdrant
    try:
        from app.core.vector_db import vector_db
        if vector_db.collection_exists():
            health_status["services"]["qdrant"] = "connected"
        else:
            health_status["services"]["qdrant"] = "collection not found"
    except Exception as e:
        health_status["services"]["qdrant"] = f"error: {str(e)}"

    return health_status
```

### Task 8: Create Test Data Script

Create `~/VoiceAssist/server/scripts/create_test_data.py`:

```python
"""Create test data for development"""
from app.core.database import SessionLocal
from app.models.user import User
from app.models.conversation import Conversation, Message, MessageRole
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_test_user():
    """Create a test user"""
    db = SessionLocal()

    # Check if test user exists
    existing = db.query(User).filter(User.email == "test@voiceassist.io").first()
    if existing:
        print("Test user already exists")
        return existing

    # Create test user
    user = User(
        email="test@voiceassist.io",
        username="testuser",
        hashed_password=pwd_context.hash("testpassword123"),
        full_name="Test User",
        is_active=True,
        is_superuser=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    print(f"✅ Created test user: {user.email}")
    print(f"   Password: testpassword123")

    # Create a test conversation
    conversation = Conversation(
        user_id=user.id,
        title="Test Conversation"
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    # Add test messages
    messages = [
        Message(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content="Hello! This is a test message."
        ),
        Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content="Hello! I'm VoiceAssist. How can I help you today?"
        )
    ]
    for msg in messages:
        db.add(msg)

    db.commit()
    print(f"✅ Created test conversation with {len(messages)} messages")

    db.close()
    return user


if __name__ == "__main__":
    create_test_user()
```

Run it:

```bash
cd ~/VoiceAssist/server
source venv/bin/activate
python scripts/create_test_data.py
```

## Testing

### Test Database Schema

```bash
cd ~/VoiceAssist/server
source venv/bin/activate

# Check all tables exist
psql voiceassist -c "\dt"

# Check user table structure
psql voiceassist -c "\d users"

# Check that test data was created
psql voiceassist -c "SELECT * FROM users;"
psql voiceassist -c "SELECT * FROM conversations;"
psql voiceassist -c "SELECT * FROM messages;"
```

### Test Qdrant Collection

```bash
# Check collection exists
curl http://localhost:6333/collections

# Should show medical_knowledge collection
```

### Test Health Endpoint

```bash
# Start FastAPI if not running
cd ~/VoiceAssist/server
source venv/bin/activate
python app/main.py &

# Test health endpoint
curl http://localhost:8000/health | jq

# Should show all services as "connected"
```

### Test Database Queries

Create a test script: `~/VoiceAssist/server/scripts/test_queries.py`:

```python
"""Test database queries"""
from app.core.database import SessionLocal
from app.models.user import User
from app.models.conversation import Conversation
from sqlalchemy.orm import joinedload

db = SessionLocal()

# Test query users
users = db.query(User).all()
print(f"Found {len(users)} users")
for user in users:
    print(f"  - {user.email}")

# Test query conversations with messages
conversations = db.query(Conversation).options(
    joinedload(Conversation.messages)
).all()
print(f"\nFound {len(conversations)} conversations")
for conv in conversations:
    print(f"  - {conv.title}: {len(conv.messages)} messages")

db.close()
print("\n✅ All queries successful")
```

Run it:

```bash
python scripts/test_queries.py
```

## Documentation Updates

1. Update `~/VoiceAssist/PHASE_STATUS.md`:

```markdown
- [x] Phase 1: Local Development Environment - Completed [DATE]
- [x] Phase 2: Database Schema & Models - Completed [DATE]
- [ ] Phase 3: Authentication System - Not Started
```

2. Update `~/VoiceAssist/DEVELOPMENT_LOG.md`:

```markdown
## Phase 2: Database Schema & Models

**Completed:** [DATE]

### What Was Built

- SQLAlchemy models for users, conversations, messages, documents
- Alembic migrations setup
- Qdrant collection created
- Database initialization script
- Test data creation script
- Health check includes database status

### Database Tables

- users
- conversations
- messages
- documents
- document_chunks
- embeddings

### Qdrant Collections

- medical_knowledge (1536 dimensions, cosine similarity)

### Next Phase

Phase 3: Authentication System
```

3. Commit changes:

```bash
cd ~/VoiceAssist
git add .
git commit -m "Phase 2: Database schema and models with Alembic migrations"
```

## Exit Checklist

- [ ] All database tables created successfully
- [ ] Alembic migrations working
- [ ] Qdrant collection created
- [ ] Test user and data created
- [ ] Health endpoint shows all services connected
- [ ] Can query database successfully
- [ ] No errors in application logs
- [ ] Git commit created
- [ ] PHASE_STATUS.md updated
- [ ] DEVELOPMENT_LOG.md updated

## Troubleshooting

### Migration errors

```bash
# Drop all tables and start fresh
psql voiceassist -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql voiceassist -c "CREATE EXTENSION vector;"
alembic upgrade head
```

### Qdrant collection issues

```python
# Delete and recreate collection
from app.core.vector_db import vector_db
vector_db.client.delete_collection(collection_name="medical_knowledge")
vector_db.create_collection()
```

## Next Phase

**Phase 3: Authentication System** (`PHASE_03_AUTHENTICATION.md`)
