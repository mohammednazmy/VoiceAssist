# VoiceAssist Major Development Roadmap

## Executive Summary

This document outlines 9 major development initiatives for VoiceAssist, organized by implementation order based on dependencies and value delivery. Total estimated scope: 12-16 weeks of focused development.

### Implementation Order (Dependency-Aware)

```
Phase 1 (Foundation):
  └── 7. Background Processing Queue (Week 1-2)
      └── Enables reliable async processing for all other features

Phase 2 (Core Capabilities):
  ├── 1. Voice Narration Caching (Week 3-4)
  ├── 3. Answer Validation & Citation (Week 4-5)
  └── 4. Document Versioning & Freshness (Week 5-6)

Phase 3 (Advanced Features):
  ├── 2. Knowledge Graph Construction (Week 7-9)
  ├── 6. Multi-Modal Search (Week 9-10)
  └── 5. Learning Mode / Spaced Repetition (Week 10-12)

Phase 4 (Scale & Operations):
  ├── 8. Multi-Tenancy (Week 12-14)
  └── 9. Analytics Dashboard (Week 14-16)
```

---

# Phase 1: Foundation

## 7. Background Processing Queue

### Overview
Replace FastAPI's `BackgroundTasks` with a robust distributed task queue for reliable async processing. This is foundational - all subsequent features depend on reliable background processing.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│   Redis Broker  │────▶│  Celery Workers │
│   (Producer)    │     │   (Queue)       │     │  (Consumers)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Redis Results  │     │   PostgreSQL    │
                        │  (Short-term)   │     │   (Job State)   │
                        └─────────────────┘     └─────────────────┘
```

### Technology Choice: Celery + Redis

**Why Celery:**
- Mature, battle-tested in production
- Native Python async support
- Built-in retry, rate limiting, scheduling
- Flower dashboard for monitoring
- Easy horizontal scaling

**Alternatives Considered:**
- `arq` - Lighter weight but less ecosystem
- `dramatiq` - Good but smaller community
- `RQ` - Simpler but fewer features

### Database Schema

```sql
-- New table: background_jobs
CREATE TABLE background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    celery_task_id VARCHAR(255) UNIQUE,
    job_type VARCHAR(100) NOT NULL,  -- 'enhanced_extraction', 'tts_generation', etc.
    status VARCHAR(50) DEFAULT 'pending',  -- pending, running, completed, failed, cancelled
    priority INTEGER DEFAULT 5,  -- 1 (highest) to 10 (lowest)

    -- Job context
    document_id UUID REFERENCES kb_documents(id),
    tenant_id UUID,  -- For future multi-tenancy
    user_id UUID,

    -- Payload and results
    input_payload JSONB,
    result_payload JSONB,
    error_message TEXT,

    -- Progress tracking
    progress INTEGER DEFAULT 0,  -- 0-100
    progress_message VARCHAR(500),

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_jobs_status ON background_jobs(status);
CREATE INDEX idx_jobs_document ON background_jobs(document_id);
CREATE INDEX idx_jobs_type_status ON background_jobs(job_type, status);
CREATE INDEX idx_jobs_created ON background_jobs(created_at DESC);
```

### New Files Structure

```
services/api-gateway/
├── app/
│   ├── tasks/
│   │   ├── __init__.py
│   │   ├── celery_app.py           # Celery configuration
│   │   ├── base.py                 # Base task class with common logic
│   │   ├── enhanced_extraction.py  # PDF processing tasks
│   │   ├── tts_generation.py       # Voice synthesis tasks
│   │   ├── embedding_tasks.py      # Embedding generation tasks
│   │   └── maintenance.py          # Cleanup, reindexing tasks
│   ├── services/
│   │   └── job_service.py          # Job management service
│   └── api/
│       └── jobs.py                 # Job status endpoints
├── celery_worker.py                # Worker entrypoint
└── celery_beat.py                  # Scheduler entrypoint
```

### Core Implementation

**celery_app.py:**
```python
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "voiceassist",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.enhanced_extraction",
        "app.tasks.tts_generation",
        "app.tasks.embedding_tasks",
        "app.tasks.maintenance",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3000,  # 50 min soft limit
    worker_prefetch_multiplier=1,  # Fair distribution
    task_acks_late=True,  # Reliability
    task_reject_on_worker_lost=True,
    result_expires=86400,  # 24 hours

    # Rate limiting
    task_annotations={
        "app.tasks.enhanced_extraction.*": {"rate_limit": "10/m"},
        "app.tasks.tts_generation.*": {"rate_limit": "30/m"},
    },

    # Routing
    task_routes={
        "app.tasks.enhanced_extraction.*": {"queue": "extraction"},
        "app.tasks.tts_generation.*": {"queue": "tts"},
        "app.tasks.embedding_tasks.*": {"queue": "embeddings"},
        "app.tasks.maintenance.*": {"queue": "maintenance"},
    },
)

# Scheduled tasks
celery_app.conf.beat_schedule = {
    "cleanup-old-jobs": {
        "task": "app.tasks.maintenance.cleanup_old_jobs",
        "schedule": 3600.0,  # Every hour
    },
    "check-stale-documents": {
        "task": "app.tasks.maintenance.check_document_freshness",
        "schedule": 86400.0,  # Daily
    },
}
```

**base.py:**
```python
from celery import Task
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.background_job import BackgroundJob
import logging

logger = logging.getLogger(__name__)

class BaseTask(Task):
    """Base task with database session and job tracking."""

    _db: Session = None

    @property
    def db(self) -> Session:
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Cleanup after task completion."""
        if self._db is not None:
            self._db.close()
            self._db = None

    def update_progress(self, job_id: str, progress: int, message: str = None):
        """Update job progress in database."""
        job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
        if job:
            job.progress = progress
            if message:
                job.progress_message = message
            self.db.commit()

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        job_id = kwargs.get("job_id")
        if job_id:
            job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(exc)
                self.db.commit()
        logger.error(f"Task {task_id} failed: {exc}", exc_info=True)

    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success."""
        job_id = kwargs.get("job_id")
        if job_id:
            job = self.db.query(BackgroundJob).filter_by(id=job_id).first()
            if job:
                job.status = "completed"
                job.progress = 100
                job.result_payload = retval
                job.completed_at = datetime.utcnow()
                self.db.commit()
```

**enhanced_extraction.py:**
```python
from app.tasks.celery_app import celery_app
from app.tasks.base import BaseTask
from app.services.kb_indexer import KBIndexer
from app.services.enhanced_pdf_processor import get_enhanced_pdf_processor

@celery_app.task(bind=True, base=BaseTask, name="enhanced_extraction.process_document")
def process_document_enhanced(
    self,
    job_id: str,
    document_id: str,
    file_path: str,
):
    """Process document with enhanced GPT-4 Vision extraction."""

    def progress_callback(progress: int):
        self.update_progress(job_id, progress, f"Processing: {progress}%")

    # Read file
    with open(file_path, "rb") as f:
        pdf_bytes = f.read()

    # Get document from DB
    document = self.db.query(KBDocument).filter_by(document_id=document_id).first()
    if not document:
        raise ValueError(f"Document {document_id} not found")

    # Run enhanced extraction
    indexer = KBIndexer()
    result, enhanced_structure, page_images_path = await indexer.index_document_with_enhanced_extraction(
        pdf_bytes=pdf_bytes,
        document_id=document_id,
        title=document.name,
        progress_callback=progress_callback,
    )

    # Update document
    document.enhanced_structure = enhanced_structure
    document.page_images_path = page_images_path
    document.processing_stage = "complete" if result.success else "failed"
    document.processing_progress = 100
    self.db.commit()

    return {
        "success": result.success,
        "chunks_indexed": result.chunks_indexed,
        "error": result.error_message,
    }
```

### API Endpoints

**jobs.py:**
```python
from fastapi import APIRouter, Depends, HTTPException
from app.services.job_service import JobService
from app.api.deps import get_current_user, get_db

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

@router.get("/{job_id}")
async def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Get job status and progress."""
    job = JobService(db).get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        "id": job.id,
        "status": job.status,
        "progress": job.progress,
        "progress_message": job.progress_message,
        "result": job.result_payload,
        "error": job.error_message,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
    }

@router.get("/document/{document_id}")
async def get_document_jobs(
    document_id: str,
    db: Session = Depends(get_db),
):
    """Get all jobs for a document."""
    jobs = JobService(db).get_jobs_for_document(document_id)
    return {"jobs": [job.to_dict() for job in jobs]}

@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Cancel a pending or running job."""
    success = JobService(db).cancel_job(job_id)
    if not success:
        raise HTTPException(400, "Cannot cancel job")
    return {"status": "cancelled"}

@router.get("/")
async def list_jobs(
    status: str = None,
    job_type: str = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List jobs with filtering."""
    jobs, total = JobService(db).list_jobs(
        status=status,
        job_type=job_type,
        limit=limit,
        offset=offset,
    )
    return {
        "jobs": [j.to_dict() for j in jobs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
```

### WebSocket Progress Updates

**websocket_jobs.py:**
```python
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import asyncio
import json

class JobProgressManager:
    """Manage WebSocket connections for job progress updates."""

    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}  # job_id -> connections

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.connections:
            self.connections[job_id] = set()
        self.connections[job_id].add(websocket)

    def disconnect(self, websocket: WebSocket, job_id: str):
        if job_id in self.connections:
            self.connections[job_id].discard(websocket)
            if not self.connections[job_id]:
                del self.connections[job_id]

    async def broadcast_progress(self, job_id: str, progress: dict):
        if job_id in self.connections:
            dead_connections = set()
            for websocket in self.connections[job_id]:
                try:
                    await websocket.send_json(progress)
                except:
                    dead_connections.add(websocket)
            for ws in dead_connections:
                self.connections[job_id].discard(ws)

progress_manager = JobProgressManager()

@router.websocket("/ws/jobs/{job_id}")
async def job_progress_websocket(websocket: WebSocket, job_id: str):
    await progress_manager.connect(websocket, job_id)
    try:
        while True:
            # Keep connection alive, wait for client messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        progress_manager.disconnect(websocket, job_id)
```

### Docker Compose Updates

```yaml
# docker-compose.yml additions
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  celery-worker:
    build:
      context: ./services/api-gateway
      dockerfile: Dockerfile
    command: celery -A app.tasks.celery_app worker --loglevel=info -Q extraction,tts,embeddings,default
    environment:
      - REDIS_URL=redis://redis:6379/0
      - DATABASE_URL=${DATABASE_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - redis
      - postgres
    volumes:
      - ./uploads:/app/uploads
    deploy:
      replicas: 2

  celery-beat:
    build:
      context: ./services/api-gateway
      dockerfile: Dockerfile
    command: celery -A app.tasks.celery_app beat --loglevel=info
    environment:
      - REDIS_URL=redis://redis:6379/0
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - redis
      - celery-worker

  flower:
    image: mher/flower
    command: celery --broker=redis://redis:6379/0 flower --port=5555
    ports:
      - "5555:5555"
    depends_on:
      - redis
      - celery-worker

volumes:
  redis_data:
```

### Migration from BackgroundTasks

**Before (current):**
```python
@router.post("/documents/{document_id}/process-enhanced")
async def process_enhanced(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    background_tasks.add_task(process_document_task, document_id, db)
    return {"status": "processing"}
```

**After (with Celery):**
```python
@router.post("/documents/{document_id}/process-enhanced")
async def process_enhanced(
    document_id: str,
    db: Session = Depends(get_db),
):
    # Create job record
    job = BackgroundJob(
        job_type="enhanced_extraction",
        document_id=document_id,
        status="pending",
    )
    db.add(job)
    db.commit()

    # Queue Celery task
    task = process_document_enhanced.delay(
        job_id=str(job.id),
        document_id=document_id,
        file_path=f"./uploads/kb_documents/{document_id}.pdf",
    )

    # Store Celery task ID
    job.celery_task_id = task.id
    db.commit()

    return {
        "job_id": str(job.id),
        "status": "queued",
    }
```

### Testing Strategy

```python
# tests/tasks/test_enhanced_extraction.py
import pytest
from unittest.mock import patch, MagicMock
from app.tasks.enhanced_extraction import process_document_enhanced

@pytest.fixture
def mock_celery_task():
    """Mock Celery task context."""
    task = MagicMock()
    task.db = MagicMock()
    task.update_progress = MagicMock()
    return task

def test_process_document_success(mock_celery_task, sample_pdf):
    """Test successful document processing."""
    with patch.object(process_document_enhanced, "bind", mock_celery_task):
        result = process_document_enhanced(
            job_id="test-job",
            document_id="test-doc",
            file_path=sample_pdf,
        )
    assert result["success"] is True
    assert result["chunks_indexed"] > 0

def test_process_document_failure(mock_celery_task):
    """Test handling of processing failure."""
    with patch.object(process_document_enhanced, "bind", mock_celery_task):
        result = process_document_enhanced(
            job_id="test-job",
            document_id="nonexistent",
            file_path="/nonexistent/path.pdf",
        )
    assert result["success"] is False
    mock_celery_task.update_progress.assert_called()
```

### Monitoring & Alerts

**Prometheus Metrics:**
```python
# app/tasks/metrics.py
from prometheus_client import Counter, Histogram, Gauge

TASK_STARTED = Counter(
    "celery_task_started_total",
    "Total tasks started",
    ["task_name", "queue"]
)

TASK_COMPLETED = Counter(
    "celery_task_completed_total",
    "Total tasks completed",
    ["task_name", "status"]  # success, failure, retry
)

TASK_DURATION = Histogram(
    "celery_task_duration_seconds",
    "Task duration in seconds",
    ["task_name"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600]
)

QUEUE_LENGTH = Gauge(
    "celery_queue_length",
    "Number of tasks in queue",
    ["queue"]
)
```

### Implementation Steps

1. **Week 1:**
   - Set up Redis in Docker Compose
   - Create Celery configuration
   - Implement base task class
   - Create background_jobs table migration

2. **Week 2:**
   - Migrate enhanced_extraction to Celery task
   - Implement job status endpoints
   - Add WebSocket progress updates
   - Set up Flower monitoring
   - Write tests
   - Update frontend to use new job endpoints

---

# Phase 2: Core Capabilities

## 1. Voice Narration Caching & Streaming

### Overview
Pre-generate and cache TTS audio for page narrations, enabling instant playback without real-time synthesis latency.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Enhanced PDF   │────▶│  TTS Generator  │────▶│  Audio Storage  │
│  Processing     │     │  (Celery Task)  │     │  (S3/Local)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Client Player  │◀────│  Audio Streamer │◀────│  CDN (Optional) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Database Schema

```sql
-- New table: audio_narrations
CREATE TABLE audio_narrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,

    -- Audio metadata
    audio_format VARCHAR(20) DEFAULT 'mp3',  -- mp3, wav, opus
    duration_seconds FLOAT,
    file_size_bytes INTEGER,
    sample_rate INTEGER DEFAULT 24000,

    -- Storage
    storage_path VARCHAR(500) NOT NULL,
    storage_type VARCHAR(50) DEFAULT 'local',  -- local, s3
    cdn_url VARCHAR(500),

    -- Source content
    narration_text TEXT NOT NULL,
    narration_hash VARCHAR(64) NOT NULL,  -- SHA256 for cache invalidation

    -- TTS configuration
    voice_id VARCHAR(100),
    voice_provider VARCHAR(50) DEFAULT 'openai',  -- openai, elevenlabs, azure
    voice_settings JSONB,

    -- Status
    status VARCHAR(50) DEFAULT 'pending',  -- pending, generating, ready, failed
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    generated_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,

    UNIQUE(document_id, page_number),
    CONSTRAINT valid_format CHECK (audio_format IN ('mp3', 'wav', 'opus', 'aac'))
);

CREATE INDEX idx_audio_document ON audio_narrations(document_id);
CREATE INDEX idx_audio_status ON audio_narrations(status);
CREATE INDEX idx_audio_access ON audio_narrations(last_accessed_at);
```

### New Files

```
services/api-gateway/
├── app/
│   ├── services/
│   │   ├── tts_service.py              # TTS abstraction layer
│   │   ├── audio_storage_service.py    # Audio file management
│   │   └── narration_cache_service.py  # Cache management
│   ├── tasks/
│   │   └── tts_generation.py           # Celery TTS tasks
│   └── api/
│       └── audio.py                    # Audio streaming endpoints
apps/admin-panel/
├── src/
│   └── components/
│       └── audio/
│           ├── AudioPlayer.tsx         # Audio player component
│           ├── NarrationControls.tsx   # Playback controls
│           └── AudioWaveform.tsx       # Visualization
```

### TTS Service Implementation

**tts_service.py:**
```python
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional
from dataclasses import dataclass
import hashlib

@dataclass
class TTSConfig:
    voice_id: str
    speed: float = 1.0
    pitch: float = 1.0
    format: str = "mp3"

@dataclass
class AudioChunk:
    data: bytes
    duration_ms: int

class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> bytes:
        """Synthesize text to audio bytes."""
        pass

    @abstractmethod
    async def stream_synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> AsyncGenerator[AudioChunk, None]:
        """Stream synthesized audio chunks."""
        pass

class OpenAITTSProvider(TTSProvider):
    def __init__(self, api_key: str):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)

    async def synthesize(self, text: str, config: TTSConfig) -> bytes:
        response = await self.client.audio.speech.create(
            model="tts-1-hd",
            voice=config.voice_id,
            input=text,
            response_format=config.format,
            speed=config.speed,
        )
        return response.content

    async def stream_synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> AsyncGenerator[AudioChunk, None]:
        response = await self.client.audio.speech.create(
            model="tts-1-hd",
            voice=config.voice_id,
            input=text,
            response_format=config.format,
            speed=config.speed,
        )
        # OpenAI doesn't support true streaming, so yield in chunks
        content = response.content
        chunk_size = 8192
        for i in range(0, len(content), chunk_size):
            yield AudioChunk(
                data=content[i:i + chunk_size],
                duration_ms=0,  # Calculate from format
            )

class ElevenLabsTTSProvider(TTSProvider):
    """ElevenLabs provider for higher quality voices."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.elevenlabs.io/v1"

    async def synthesize(self, text: str, config: TTSConfig) -> bytes:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/text-to-speech/{config.voice_id}",
                headers={"xi-api-key": self.api_key},
                json={
                    "text": text,
                    "model_id": "eleven_turbo_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    }
                },
            ) as response:
                return await response.read()

class TTSService:
    """Main TTS service with provider abstraction."""

    def __init__(self):
        self.providers = {}
        self._init_providers()

    def _init_providers(self):
        import os
        if os.getenv("OPENAI_API_KEY"):
            self.providers["openai"] = OpenAITTSProvider(os.getenv("OPENAI_API_KEY"))
        if os.getenv("ELEVENLABS_API_KEY"):
            self.providers["elevenlabs"] = ElevenLabsTTSProvider(os.getenv("ELEVENLABS_API_KEY"))

    def get_provider(self, name: str = "openai") -> TTSProvider:
        if name not in self.providers:
            raise ValueError(f"TTS provider '{name}' not configured")
        return self.providers[name]

    @staticmethod
    def hash_text(text: str) -> str:
        """Generate hash for cache key."""
        return hashlib.sha256(text.encode()).hexdigest()
```

### Celery TTS Task

**tts_generation.py:**
```python
from app.tasks.celery_app import celery_app
from app.tasks.base import BaseTask
from app.services.tts_service import TTSService, TTSConfig
from app.services.audio_storage_service import AudioStorageService
from app.models.audio_narration import AudioNarration

@celery_app.task(
    bind=True,
    base=BaseTask,
    name="tts_generation.generate_page_audio",
    rate_limit="30/m",
)
def generate_page_audio(
    self,
    job_id: str,
    document_id: str,
    page_number: int,
    narration_text: str,
    voice_config: dict = None,
):
    """Generate TTS audio for a page narration."""

    tts_service = TTSService()
    storage_service = AudioStorageService()

    # Default voice config
    config = TTSConfig(
        voice_id=voice_config.get("voice_id", "alloy") if voice_config else "alloy",
        speed=voice_config.get("speed", 1.0) if voice_config else 1.0,
        format="mp3",
    )

    # Check if already exists with same text
    text_hash = tts_service.hash_text(narration_text)
    existing = self.db.query(AudioNarration).filter_by(
        document_id=document_id,
        page_number=page_number,
        narration_hash=text_hash,
        status="ready",
    ).first()

    if existing:
        return {"status": "cached", "audio_id": str(existing.id)}

    # Create or update record
    narration = self.db.query(AudioNarration).filter_by(
        document_id=document_id,
        page_number=page_number,
    ).first()

    if not narration:
        narration = AudioNarration(
            document_id=document_id,
            page_number=page_number,
        )
        self.db.add(narration)

    narration.narration_text = narration_text
    narration.narration_hash = text_hash
    narration.status = "generating"
    narration.voice_id = config.voice_id
    narration.voice_settings = voice_config
    self.db.commit()

    self.update_progress(job_id, 20, "Synthesizing audio...")

    try:
        # Generate audio
        provider = tts_service.get_provider("openai")
        audio_bytes = asyncio.run(provider.synthesize(narration_text, config))

        self.update_progress(job_id, 60, "Storing audio...")

        # Store audio
        storage_path = storage_service.store_audio(
            audio_bytes=audio_bytes,
            document_id=document_id,
            page_number=page_number,
            format=config.format,
        )

        # Update record
        narration.storage_path = storage_path
        narration.file_size_bytes = len(audio_bytes)
        narration.duration_seconds = storage_service.get_audio_duration(audio_bytes)
        narration.status = "ready"
        narration.generated_at = datetime.utcnow()
        self.db.commit()

        self.update_progress(job_id, 100, "Audio ready")

        return {
            "status": "generated",
            "audio_id": str(narration.id),
            "duration": narration.duration_seconds,
        }

    except Exception as e:
        narration.status = "failed"
        narration.error_message = str(e)
        self.db.commit()
        raise

@celery_app.task(
    bind=True,
    base=BaseTask,
    name="tts_generation.generate_document_audio",
)
def generate_document_audio(
    self,
    job_id: str,
    document_id: str,
    voice_config: dict = None,
):
    """Generate TTS audio for all pages in a document."""

    # Get document with enhanced structure
    document = self.db.query(KBDocument).filter_by(document_id=document_id).first()
    if not document or not document.enhanced_structure:
        raise ValueError("Document not found or not enhanced")

    pages = document.enhanced_structure.get("pages", [])
    total_pages = len(pages)

    for i, page_data in enumerate(pages):
        page_number = page_data["page_number"]
        narration_text = page_data.get("voice_narration", "")

        if not narration_text:
            continue

        # Queue individual page task
        generate_page_audio.delay(
            job_id=f"{job_id}_page_{page_number}",
            document_id=document_id,
            page_number=page_number,
            narration_text=narration_text,
            voice_config=voice_config,
        )

        progress = int(((i + 1) / total_pages) * 100)
        self.update_progress(job_id, progress, f"Queued page {page_number}/{total_pages}")

    return {"status": "queued", "pages": total_pages}
```

### Audio Streaming Endpoint

**audio.py:**
```python
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from app.services.audio_storage_service import AudioStorageService
from app.models.audio_narration import AudioNarration

router = APIRouter(prefix="/api/audio", tags=["audio"])

@router.get("/documents/{document_id}/pages/{page_number}")
async def get_page_audio(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
):
    """Get or generate audio for a page."""

    narration = db.query(AudioNarration).filter_by(
        document_id=document_id,
        page_number=page_number,
    ).first()

    if not narration:
        raise HTTPException(404, "Audio not found. Trigger generation first.")

    if narration.status == "generating":
        return {"status": "generating", "progress": "in_progress"}

    if narration.status == "failed":
        raise HTTPException(500, f"Audio generation failed: {narration.error_message}")

    # Update access time
    narration.last_accessed_at = datetime.utcnow()
    db.commit()

    return {
        "audio_id": str(narration.id),
        "status": "ready",
        "duration_seconds": narration.duration_seconds,
        "format": narration.audio_format,
        "url": f"/api/audio/stream/{narration.id}",
    }

@router.get("/stream/{audio_id}")
async def stream_audio(
    audio_id: str,
    db: Session = Depends(get_db),
):
    """Stream audio file."""

    narration = db.query(AudioNarration).filter_by(id=audio_id).first()
    if not narration or narration.status != "ready":
        raise HTTPException(404, "Audio not found")

    storage_service = AudioStorageService()

    def audio_generator():
        with open(narration.storage_path, "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    return StreamingResponse(
        audio_generator(),
        media_type=f"audio/{narration.audio_format}",
        headers={
            "Content-Length": str(narration.file_size_bytes),
            "Accept-Ranges": "bytes",
        }
    )

@router.post("/documents/{document_id}/generate-all")
async def generate_all_audio(
    document_id: str,
    voice_config: dict = None,
    db: Session = Depends(get_db),
):
    """Queue audio generation for all pages."""

    from app.tasks.tts_generation import generate_document_audio

    job = BackgroundJob(
        job_type="tts_generation",
        document_id=document_id,
        status="pending",
    )
    db.add(job)
    db.commit()

    task = generate_document_audio.delay(
        job_id=str(job.id),
        document_id=document_id,
        voice_config=voice_config,
    )

    job.celery_task_id = task.id
    db.commit()

    return {"job_id": str(job.id), "status": "queued"}
```

### Frontend Audio Player

**AudioPlayer.tsx:**
```typescript
import { useState, useRef, useEffect } from "react";

interface AudioPlayerProps {
  documentId: string;
  pageNumber: number;
  onEnded?: () => void;
}

export function AudioPlayer({ documentId, pageNumber, onEnded }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioUrl = `/api/audio/documents/${documentId}/pages/${pageNumber}`;

  useEffect(() => {
    // Check audio availability
    fetch(audioUrl)
      .then(res => res.json())
      .then(data => {
        if (data.status === "ready") {
          setIsLoading(false);
          if (audioRef.current) {
            audioRef.current.src = data.url;
          }
        } else if (data.status === "generating") {
          // Poll for completion
          const interval = setInterval(async () => {
            const res = await fetch(audioUrl);
            const d = await res.json();
            if (d.status === "ready") {
              setIsLoading(false);
              if (audioRef.current) {
                audioRef.current.src = d.url;
              }
              clearInterval(interval);
            }
          }, 2000);
          return () => clearInterval(interval);
        }
      })
      .catch(err => setError("Audio not available"));
  }, [documentId, pageNumber]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setProgress(audioRef.current.currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setProgress(time);
  };

  const handleRateChange = (rate: number) => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-300">
        {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg flex items-center gap-3">
        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
        <span className="text-slate-400">Preparing audio...</span>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-800 rounded-lg space-y-3">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
      />

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Play/Pause */}
        <button
          onClick={togglePlayPause}
          className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full"
        >
          {isPlaying ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
        </button>

        {/* Progress bar */}
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration}
            value={progress}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Time display */}
        <span className="text-sm text-slate-400 min-w-[80px]">
          {formatTime(progress)} / {formatTime(duration)}
        </span>

        {/* Speed control */}
        <select
          value={playbackRate}
          onChange={(e) => handleRateChange(parseFloat(e.target.value))}
          className="bg-slate-700 text-slate-200 text-sm rounded px-2 py-1"
        >
          <option value={0.5}>0.5x</option>
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>
    </div>
  );
}
```

### Implementation Steps

1. **Week 3:**
   - Create audio_narrations table migration
   - Implement TTSService with OpenAI provider
   - Implement AudioStorageService
   - Create Celery TTS tasks

2. **Week 4:**
   - Implement audio streaming endpoints
   - Build frontend AudioPlayer component
   - Integrate into DocumentContentEditor
   - Add batch generation capability
   - Write tests

---

## 3. Answer Validation & Citation

### Overview
Add source verification to RAG responses with inline citations, confidence scoring, and hallucination detection.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   RAG Query     │────▶│  Answer Gen     │────▶│  Validator      │
│                 │     │  (LLM)          │     │  Service        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        ▼                               ▼                               ▼
                ┌───────────────┐            ┌───────────────┐            ┌───────────────┐
                │ Claim         │            │ Source        │            │ Confidence    │
                │ Extraction    │            │ Attribution   │            │ Scoring       │
                └───────────────┘            └───────────────┘            └───────────────┘
```

### Database Schema

```sql
-- Response validation storage
CREATE TABLE response_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID,  -- Link to original query
    response_text TEXT NOT NULL,

    -- Validation results
    overall_confidence FLOAT,  -- 0.0 to 1.0
    claims_validated INTEGER,
    claims_unsupported INTEGER,
    claims_total INTEGER,

    -- Detailed breakdown
    validation_details JSONB,  -- Per-claim validation
    citations JSONB,  -- Citation mapping

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    validation_time_ms INTEGER
);

-- Citation tracking
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID REFERENCES response_validations(id),

    -- Claim info
    claim_text TEXT NOT NULL,
    claim_index INTEGER,

    -- Source info
    document_id UUID,
    document_title VARCHAR(500),
    page_number INTEGER,
    chunk_id UUID,
    chunk_text TEXT,

    -- Match quality
    similarity_score FLOAT,
    exact_match BOOLEAN DEFAULT FALSE,

    -- Status
    status VARCHAR(50),  -- supported, partial, unsupported
    confidence FLOAT
);

CREATE INDEX idx_citations_validation ON citations(validation_id);
CREATE INDEX idx_citations_document ON citations(document_id);
```

### Implementation

**answer_validator.py:**
```python
from dataclasses import dataclass
from typing import List, Optional, Tuple
import re
from openai import AsyncOpenAI

@dataclass
class Claim:
    text: str
    index: int
    start_char: int
    end_char: int

@dataclass
class Citation:
    claim_index: int
    document_id: str
    document_title: str
    page_number: Optional[int]
    chunk_text: str
    similarity_score: float
    status: str  # supported, partial, unsupported

@dataclass
class ValidationResult:
    overall_confidence: float
    claims: List[Claim]
    citations: List[Citation]
    annotated_response: str
    unsupported_claims: List[Claim]

class AnswerValidator:
    """Validates RAG answers against source documents."""

    CLAIM_EXTRACTION_PROMPT = """Extract factual claims from this response.
Return a JSON array of claims, each with:
- "text": the claim text
- "type": "factual" | "opinion" | "procedural"

Only extract factual claims that can be verified against sources.

Response:
{response}

Return JSON array only."""

    CLAIM_VERIFICATION_PROMPT = """Verify if this claim is supported by the source text.

Claim: {claim}

Source text:
{source_text}

Return JSON:
{{
  "supported": true/false,
  "confidence": 0.0-1.0,
  "relevant_excerpt": "exact quote from source if supported",
  "explanation": "brief explanation"
}}"""

    def __init__(self):
        self.openai = AsyncOpenAI()

    async def validate_response(
        self,
        response_text: str,
        source_chunks: List[dict],
        query: str,
    ) -> ValidationResult:
        """
        Validate a response against source documents.

        Args:
            response_text: The generated response
            source_chunks: Retrieved chunks used for generation
            query: Original user query

        Returns:
            ValidationResult with citations and confidence
        """

        # Step 1: Extract claims from response
        claims = await self._extract_claims(response_text)

        # Step 2: Find supporting evidence for each claim
        citations = []
        unsupported = []

        for claim in claims:
            # Find best matching source
            best_match = await self._find_best_source(claim, source_chunks)

            if best_match:
                citation = Citation(
                    claim_index=claim.index,
                    document_id=best_match["document_id"],
                    document_title=best_match["title"],
                    page_number=best_match.get("page_number"),
                    chunk_text=best_match["text"],
                    similarity_score=best_match["score"],
                    status=best_match["status"],
                )
                citations.append(citation)

                if best_match["status"] == "unsupported":
                    unsupported.append(claim)
            else:
                unsupported.append(claim)
                citations.append(Citation(
                    claim_index=claim.index,
                    document_id="",
                    document_title="",
                    page_number=None,
                    chunk_text="",
                    similarity_score=0.0,
                    status="unsupported",
                ))

        # Step 3: Calculate overall confidence
        supported_count = len([c for c in citations if c.status == "supported"])
        partial_count = len([c for c in citations if c.status == "partial"])
        total = len(claims) or 1

        overall_confidence = (supported_count + 0.5 * partial_count) / total

        # Step 4: Generate annotated response with citations
        annotated = self._annotate_response(response_text, claims, citations)

        return ValidationResult(
            overall_confidence=overall_confidence,
            claims=claims,
            citations=citations,
            annotated_response=annotated,
            unsupported_claims=unsupported,
        )

    async def _extract_claims(self, response_text: str) -> List[Claim]:
        """Extract verifiable claims from response."""

        response = await self.openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": self.CLAIM_EXTRACTION_PROMPT.format(
                    response=response_text
                )}
            ],
            response_format={"type": "json_object"},
        )

        claims_data = json.loads(response.choices[0].message.content)
        claims = []

        for i, claim_data in enumerate(claims_data.get("claims", [])):
            if claim_data.get("type") == "factual":
                # Find position in original text
                claim_text = claim_data["text"]
                start = response_text.find(claim_text)
                end = start + len(claim_text) if start >= 0 else -1

                claims.append(Claim(
                    text=claim_text,
                    index=i,
                    start_char=start,
                    end_char=end,
                ))

        return claims

    async def _find_best_source(
        self,
        claim: Claim,
        source_chunks: List[dict],
    ) -> Optional[dict]:
        """Find best supporting source for a claim."""

        best_match = None
        best_score = 0.0

        for chunk in source_chunks:
            # Check semantic similarity
            similarity = await self._compute_similarity(claim.text, chunk["content"])

            if similarity > best_score:
                best_score = similarity

                # Verify with LLM
                verification = await self._verify_claim(claim.text, chunk["content"])

                best_match = {
                    "document_id": chunk.get("document_id"),
                    "title": chunk.get("title", "Unknown"),
                    "page_number": chunk.get("page_number"),
                    "text": chunk["content"],
                    "score": similarity,
                    "status": "supported" if verification["supported"] else (
                        "partial" if verification["confidence"] > 0.5 else "unsupported"
                    ),
                }

        return best_match if best_score > 0.3 else None

    async def _verify_claim(self, claim: str, source_text: str) -> dict:
        """Verify a claim against source text using LLM."""

        response = await self.openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": self.CLAIM_VERIFICATION_PROMPT.format(
                    claim=claim,
                    source_text=source_text[:2000],  # Truncate for token limits
                )}
            ],
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    async def _compute_similarity(self, text1: str, text2: str) -> float:
        """Compute semantic similarity between texts."""

        # Use embeddings for similarity
        response = await self.openai.embeddings.create(
            model="text-embedding-3-small",
            input=[text1, text2],
        )

        emb1 = response.data[0].embedding
        emb2 = response.data[1].embedding

        # Cosine similarity
        import numpy as np
        return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))

    def _annotate_response(
        self,
        response_text: str,
        claims: List[Claim],
        citations: List[Citation],
    ) -> str:
        """Add citation markers to response text."""

        # Sort claims by position (reverse to preserve indices)
        sorted_claims = sorted(claims, key=lambda c: c.start_char, reverse=True)

        annotated = response_text
        for claim in sorted_claims:
            if claim.start_char >= 0:
                citation = next((c for c in citations if c.claim_index == claim.index), None)
                if citation:
                    marker = f" [{citation.claim_index + 1}]"
                    if citation.status == "unsupported":
                        marker = f" [?{citation.claim_index + 1}]"
                    annotated = annotated[:claim.end_char] + marker + annotated[claim.end_char:]

        return annotated
```

### Integration with RAG Service

**rag_service.py updates:**
```python
class RAGService:
    def __init__(self, ...):
        ...
        self.validator = AnswerValidator()
        self.enable_validation = True

    async def query(self, request: QueryRequest) -> QueryResponse:
        # ... existing RAG logic ...

        # Add validation if enabled
        validation = None
        if self.enable_validation and request.validate_response:
            validation = await self.validator.validate_response(
                response_text=response_text,
                source_chunks=search_results,
                query=request.query,
            )

            # Use annotated response if validation confidence is good
            if validation.overall_confidence > 0.7:
                response_text = validation.annotated_response

        return QueryResponse(
            answer=response_text,
            sources=self._format_sources(search_results),
            validation=validation.to_dict() if validation else None,
            confidence=validation.overall_confidence if validation else None,
        )
```

### Frontend Citation Display

**CitationView.tsx:**
```typescript
interface Citation {
  claimIndex: number;
  documentTitle: string;
  pageNumber?: number;
  chunkText: string;
  status: "supported" | "partial" | "unsupported";
  similarityScore: number;
}

interface CitationViewProps {
  response: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

export function CitationView({ response, citations, onCitationClick }: CitationViewProps) {
  const renderResponse = () => {
    // Parse citation markers [1], [2], [?3], etc.
    const parts = response.split(/(\[\???\d+\])/g);

    return parts.map((part, i) => {
      const match = part.match(/\[(\??)(\d+)\]/);
      if (match) {
        const isUnsupported = match[1] === "?";
        const index = parseInt(match[2]) - 1;
        const citation = citations[index];

        return (
          <button
            key={i}
            onClick={() => onCitationClick?.(citation)}
            className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium ${
              isUnsupported
                ? "bg-amber-900/50 text-amber-300 hover:bg-amber-900"
                : "bg-blue-900/50 text-blue-300 hover:bg-blue-900"
            }`}
            title={citation?.documentTitle}
          >
            {part}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4">
      {/* Response with inline citations */}
      <div className="prose prose-invert max-w-none">
        {renderResponse()}
      </div>

      {/* Citation list */}
      <div className="border-t border-slate-700 pt-4">
        <h4 className="text-sm font-medium text-slate-300 mb-2">Sources</h4>
        <div className="space-y-2">
          {citations.map((citation, i) => (
            <div
              key={i}
              className={`p-2 rounded text-sm ${
                citation.status === "supported"
                  ? "bg-emerald-900/20 border border-emerald-800"
                  : citation.status === "partial"
                  ? "bg-amber-900/20 border border-amber-800"
                  : "bg-rose-900/20 border border-rose-800"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">[{i + 1}] {citation.documentTitle}</span>
                {citation.pageNumber && (
                  <span className="text-xs text-slate-400">Page {citation.pageNumber}</span>
                )}
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{citation.chunkText}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Implementation Steps

1. **Week 4:**
   - Create validation tables migration
   - Implement AnswerValidator service
   - Add claim extraction logic

2. **Week 5:**
   - Implement source matching and verification
   - Integrate with RAG service
   - Build frontend CitationView
   - Add validation toggle in settings
   - Write tests

---

## 4. Document Versioning & Freshness

### Overview
Track document versions, detect stale content, and manage updates while preserving history.

### Database Schema

```sql
-- Document versions table
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,

    -- Version metadata
    change_type VARCHAR(50),  -- initial, update, correction, superseded
    change_summary TEXT,
    changed_by UUID,  -- User who made the change

    -- Content snapshot
    content_hash VARCHAR(64),
    file_path VARCHAR(500),  -- Path to versioned file
    enhanced_structure JSONB,

    -- Source tracking
    source_url VARCHAR(1000),
    source_published_date DATE,
    source_accessed_date DATE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(document_id, version_number)
);

-- Add versioning columns to kb_documents
ALTER TABLE kb_documents ADD COLUMN current_version INTEGER DEFAULT 1;
ALTER TABLE kb_documents ADD COLUMN published_date DATE;
ALTER TABLE kb_documents ADD COLUMN last_verified_at TIMESTAMPTZ;
ALTER TABLE kb_documents ADD COLUMN freshness_status VARCHAR(50) DEFAULT 'current';
ALTER TABLE kb_documents ADD COLUMN superseded_by UUID REFERENCES kb_documents(id);
ALTER TABLE kb_documents ADD COLUMN source_url VARCHAR(1000);
ALTER TABLE kb_documents ADD COLUMN auto_update_enabled BOOLEAN DEFAULT FALSE;

-- Freshness alerts
CREATE TABLE freshness_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    alert_type VARCHAR(50),  -- stale, source_changed, superseded
    severity VARCHAR(20),  -- info, warning, critical
    message TEXT,
    source_check_result JSONB,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_versions_document ON document_versions(document_id);
CREATE INDEX idx_alerts_document ON freshness_alerts(document_id);
CREATE INDEX idx_alerts_unacknowledged ON freshness_alerts(acknowledged) WHERE NOT acknowledged;
```

### Implementation

**document_versioning_service.py:**
```python
from datetime import datetime, timedelta
from typing import Optional, List
import hashlib

class DocumentVersioningService:
    """Manages document versions and freshness tracking."""

    # Freshness thresholds
    STALE_THRESHOLD_DAYS = 365 * 2  # 2 years
    WARNING_THRESHOLD_DAYS = 365  # 1 year

    def __init__(self, db: Session):
        self.db = db

    async def create_version(
        self,
        document_id: str,
        file_bytes: bytes,
        change_type: str = "update",
        change_summary: str = None,
        changed_by: str = None,
    ) -> DocumentVersion:
        """Create a new version of a document."""

        document = self.db.query(KBDocument).filter_by(document_id=document_id).first()
        if not document:
            raise ValueError(f"Document {document_id} not found")

        # Get next version number
        current_max = self.db.query(func.max(DocumentVersion.version_number)).filter_by(
            document_id=document_id
        ).scalar() or 0

        new_version_number = current_max + 1

        # Store version file
        content_hash = hashlib.sha256(file_bytes).hexdigest()
        file_path = f"./uploads/versions/{document_id}/v{new_version_number}.pdf"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        # Create version record
        version = DocumentVersion(
            document_id=document_id,
            version_number=new_version_number,
            change_type=change_type,
            change_summary=change_summary,
            changed_by=changed_by,
            content_hash=content_hash,
            file_path=file_path,
            enhanced_structure=document.enhanced_structure,
            source_url=document.source_url,
            created_at=datetime.utcnow(),
        )
        self.db.add(version)

        # Update document version
        document.current_version = new_version_number
        document.last_verified_at = datetime.utcnow()

        self.db.commit()
        return version

    async def check_freshness(self, document_id: str) -> dict:
        """Check document freshness and create alerts if needed."""

        document = self.db.query(KBDocument).filter_by(document_id=document_id).first()
        if not document:
            return {"status": "not_found"}

        now = datetime.utcnow()
        alerts = []

        # Check age based on published date
        if document.published_date:
            age_days = (now.date() - document.published_date).days

            if age_days > self.STALE_THRESHOLD_DAYS:
                document.freshness_status = "stale"
                alerts.append({
                    "type": "stale",
                    "severity": "warning",
                    "message": f"Document is {age_days // 365} years old. Consider updating.",
                })
            elif age_days > self.WARNING_THRESHOLD_DAYS:
                document.freshness_status = "aging"
                alerts.append({
                    "type": "aging",
                    "severity": "info",
                    "message": f"Document is {age_days // 365} years old.",
                })
            else:
                document.freshness_status = "current"

        # Check source URL if available
        if document.source_url:
            source_check = await self._check_source_url(document.source_url)
            if source_check.get("changed"):
                alerts.append({
                    "type": "source_changed",
                    "severity": "critical",
                    "message": "Source URL content has changed since last fetch.",
                    "details": source_check,
                })

        # Create alert records
        for alert_data in alerts:
            existing = self.db.query(FreshnessAlert).filter_by(
                document_id=document_id,
                alert_type=alert_data["type"],
                acknowledged=False,
            ).first()

            if not existing:
                alert = FreshnessAlert(
                    document_id=document_id,
                    alert_type=alert_data["type"],
                    severity=alert_data["severity"],
                    message=alert_data["message"],
                    source_check_result=alert_data.get("details"),
                )
                self.db.add(alert)

        self.db.commit()

        return {
            "status": document.freshness_status,
            "published_date": document.published_date,
            "last_verified_at": document.last_verified_at,
            "alerts": alerts,
        }

    async def _check_source_url(self, url: str) -> dict:
        """Check if source URL content has changed."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(url, timeout=10) as response:
                    etag = response.headers.get("ETag")
                    last_modified = response.headers.get("Last-Modified")

                    return {
                        "accessible": response.status == 200,
                        "etag": etag,
                        "last_modified": last_modified,
                        "changed": False,  # Would compare with stored values
                    }
        except Exception as e:
            return {
                "accessible": False,
                "error": str(e),
            }

    def get_version_history(self, document_id: str) -> List[DocumentVersion]:
        """Get version history for a document."""
        return self.db.query(DocumentVersion).filter_by(
            document_id=document_id
        ).order_by(DocumentVersion.version_number.desc()).all()

    def rollback_to_version(self, document_id: str, version_number: int) -> bool:
        """Rollback document to a previous version."""

        version = self.db.query(DocumentVersion).filter_by(
            document_id=document_id,
            version_number=version_number,
        ).first()

        if not version:
            return False

        document = self.db.query(KBDocument).filter_by(document_id=document_id).first()

        # Create new version from old
        with open(version.file_path, "rb") as f:
            file_bytes = f.read()

        # This will create a new version
        self.create_version(
            document_id=document_id,
            file_bytes=file_bytes,
            change_type="rollback",
            change_summary=f"Rolled back to version {version_number}",
        )

        return True
```

### Freshness Check Celery Task

**maintenance.py:**
```python
@celery_app.task(name="maintenance.check_document_freshness")
def check_document_freshness():
    """Daily task to check all documents for freshness."""

    db = SessionLocal()
    versioning_service = DocumentVersioningService(db)

    try:
        # Get all active documents
        documents = db.query(KBDocument).filter(
            KBDocument.status == "indexed",
            KBDocument.superseded_by.is_(None),
        ).all()

        for document in documents:
            try:
                asyncio.run(versioning_service.check_freshness(document.document_id))
            except Exception as e:
                logger.error(f"Freshness check failed for {document.document_id}: {e}")

        logger.info(f"Checked freshness for {len(documents)} documents")

    finally:
        db.close()
```

### Implementation Steps

1. **Week 5:**
   - Create versioning tables migration
   - Implement DocumentVersioningService
   - Add freshness check logic

2. **Week 6:**
   - Create Celery maintenance tasks
   - Build version history UI
   - Add freshness alerts to admin dashboard
   - Implement rollback functionality
   - Write tests

---

# Phase 3: Advanced Features

## 2. Knowledge Graph Construction

### Overview
Extract medical entities and relationships to enable semantic navigation and advanced queries like "what drugs interact with aspirin?".

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Document      │────▶│  Entity         │────▶│  Relationship   │
│   Processing    │     │  Extractor      │     │  Extractor      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  Neo4j Graph    │
                                                │  Database       │
                                                └─────────────────┘
```

### Database Schema (Neo4j + PostgreSQL)

**Neo4j Schema:**
```cypher
// Node types
(:Entity {
  id: string,
  name: string,
  type: string,  // drug, condition, procedure, anatomy, symptom
  aliases: [string],
  external_ids: {umls: string, rxnorm: string, snomed: string},
  created_at: datetime
})

(:Document {
  id: string,
  title: string,
  source_type: string
})

(:Chunk {
  id: string,
  document_id: string,
  page_number: int,
  text: string
})

// Relationship types
(Entity)-[:TREATS]->(Entity)
(Entity)-[:CAUSES]->(Entity)
(Entity)-[:CONTRAINDICATED_WITH]->(Entity)
(Entity)-[:INTERACTS_WITH]->(Entity)
(Entity)-[:SYMPTOM_OF]->(Entity)
(Entity)-[:SIDE_EFFECT_OF]->(Entity)
(Entity)-[:LOCATED_IN]->(Entity)  // anatomy
(Entity)-[:MENTIONED_IN {page: int, context: string}]->(Chunk)
(Chunk)-[:PART_OF]->(Document)
```

**PostgreSQL additions:**
```sql
-- Entity reference table (for fast lookups)
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    neo4j_id VARCHAR(100) UNIQUE,
    name VARCHAR(500) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    aliases TEXT[],
    external_ids JSONB,
    mention_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entity mentions in documents
CREATE TABLE entity_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id),
    document_id UUID REFERENCES kb_documents(id),
    chunk_id UUID,
    page_number INTEGER,
    context_text TEXT,
    confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mentions_document ON entity_mentions(document_id);
```

### Implementation

**entity_extractor.py:**
```python
from dataclasses import dataclass
from typing import List, Optional
import spacy
from scispacy.linking import EntityLinker

@dataclass
class ExtractedEntity:
    text: str
    entity_type: str
    start_char: int
    end_char: int
    confidence: float
    umls_cui: Optional[str] = None
    canonical_name: Optional[str] = None

class MedicalEntityExtractor:
    """Extract medical entities using scispaCy and UMLS linking."""

    ENTITY_TYPE_MAP = {
        "DISEASE": "condition",
        "CHEMICAL": "drug",
        "PROCEDURE": "procedure",
        "ANATOMY": "anatomy",
        "SYMPTOM": "symptom",
    }

    def __init__(self):
        # Load scispaCy model with UMLS linker
        self.nlp = spacy.load("en_core_sci_lg")
        self.nlp.add_pipe("scispacy_linker", config={
            "resolve_abbreviations": True,
            "linker_name": "umls"
        })

    def extract_entities(self, text: str) -> List[ExtractedEntity]:
        """Extract medical entities from text."""

        doc = self.nlp(text)
        entities = []

        for ent in doc.ents:
            # Map entity type
            entity_type = self.ENTITY_TYPE_MAP.get(ent.label_, "other")

            # Get UMLS linking
            umls_cui = None
            canonical_name = None
            confidence = 0.0

            if hasattr(ent._, "kb_ents") and ent._.kb_ents:
                top_match = ent._.kb_ents[0]
                umls_cui = top_match[0]
                confidence = top_match[1]
                # Look up canonical name from UMLS
                canonical_name = self._get_canonical_name(umls_cui)

            entities.append(ExtractedEntity(
                text=ent.text,
                entity_type=entity_type,
                start_char=ent.start_char,
                end_char=ent.end_char,
                confidence=confidence,
                umls_cui=umls_cui,
                canonical_name=canonical_name or ent.text,
            ))

        return self._deduplicate_entities(entities)

    def _get_canonical_name(self, cui: str) -> Optional[str]:
        """Look up canonical name from UMLS CUI."""
        # Implementation depends on UMLS access
        pass

    def _deduplicate_entities(self, entities: List[ExtractedEntity]) -> List[ExtractedEntity]:
        """Merge duplicate entities."""
        seen = {}
        for ent in entities:
            key = (ent.canonical_name or ent.text).lower()
            if key not in seen or ent.confidence > seen[key].confidence:
                seen[key] = ent
        return list(seen.values())


class RelationshipExtractor:
    """Extract relationships between medical entities."""

    RELATIONSHIP_PATTERNS = {
        "treats": [
            r"(\w+)\s+(?:is used to|treats|for treatment of)\s+(\w+)",
            r"(\w+)\s+(?:indicated for|approved for)\s+(\w+)",
        ],
        "causes": [
            r"(\w+)\s+(?:causes|leads to|results in)\s+(\w+)",
            r"(\w+)\s+(?:can cause|may cause)\s+(\w+)",
        ],
        "contraindicated_with": [
            r"(\w+)\s+(?:contraindicated|should not be used)\s+.*?(\w+)",
        ],
        "interacts_with": [
            r"(\w+)\s+(?:interacts with|drug interaction with)\s+(\w+)",
        ],
        "side_effect_of": [
            r"(\w+)\s+(?:is a side effect of|adverse effect of)\s+(\w+)",
        ],
    }

    def __init__(self):
        from openai import AsyncOpenAI
        self.openai = AsyncOpenAI()

    async def extract_relationships(
        self,
        text: str,
        entities: List[ExtractedEntity],
    ) -> List[dict]:
        """Extract relationships between entities using LLM."""

        if len(entities) < 2:
            return []

        entity_names = [e.canonical_name or e.text for e in entities]

        prompt = f"""Analyze this medical text and identify relationships between these entities:

Entities: {', '.join(entity_names)}

Text: {text[:3000]}

Return a JSON array of relationships:
[
  {{
    "source": "entity name",
    "target": "entity name",
    "relationship": "treats|causes|contraindicated_with|interacts_with|side_effect_of|symptom_of",
    "evidence": "quote from text supporting this relationship"
  }}
]

Only include relationships clearly stated in the text."""

        response = await self.openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("relationships", [])
```

**knowledge_graph_service.py:**
```python
from neo4j import GraphDatabase

class KnowledgeGraphService:
    """Manages the medical knowledge graph in Neo4j."""

    def __init__(self, uri: str, user: str, password: str):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def add_entity(self, entity: ExtractedEntity) -> str:
        """Add or update an entity in the graph."""

        with self.driver.session() as session:
            result = session.run("""
                MERGE (e:Entity {name: $name})
                ON CREATE SET
                    e.id = randomUUID(),
                    e.type = $type,
                    e.aliases = $aliases,
                    e.external_ids = $external_ids,
                    e.created_at = datetime()
                ON MATCH SET
                    e.aliases = e.aliases + $aliases
                RETURN e.id as id
            """, {
                "name": entity.canonical_name or entity.text,
                "type": entity.entity_type,
                "aliases": [entity.text] if entity.text != entity.canonical_name else [],
                "external_ids": {"umls": entity.umls_cui} if entity.umls_cui else {},
            })
            return result.single()["id"]

    def add_relationship(
        self,
        source_name: str,
        target_name: str,
        relationship_type: str,
        evidence: str = None,
        document_id: str = None,
    ):
        """Add a relationship between entities."""

        with self.driver.session() as session:
            # Map relationship type to Cypher
            rel_type = relationship_type.upper()

            session.run(f"""
                MATCH (source:Entity {{name: $source}})
                MATCH (target:Entity {{name: $target}})
                MERGE (source)-[r:{rel_type}]->(target)
                ON CREATE SET
                    r.evidence = $evidence,
                    r.document_id = $document_id,
                    r.created_at = datetime()
            """, {
                "source": source_name,
                "target": target_name,
                "evidence": evidence,
                "document_id": document_id,
            })

    def add_mention(
        self,
        entity_name: str,
        document_id: str,
        chunk_id: str,
        page_number: int,
        context: str,
    ):
        """Link entity to document chunk."""

        with self.driver.session() as session:
            session.run("""
                MATCH (e:Entity {name: $entity_name})
                MERGE (d:Document {id: $document_id})
                MERGE (c:Chunk {id: $chunk_id})
                ON CREATE SET c.document_id = $document_id, c.page_number = $page_number
                MERGE (c)-[:PART_OF]->(d)
                MERGE (e)-[m:MENTIONED_IN]->(c)
                ON CREATE SET m.context = $context, m.page = $page_number
            """, {
                "entity_name": entity_name,
                "document_id": document_id,
                "chunk_id": chunk_id,
                "page_number": page_number,
                "context": context,
            })

    def find_related_entities(
        self,
        entity_name: str,
        relationship_types: List[str] = None,
        max_depth: int = 2,
    ) -> List[dict]:
        """Find entities related to a given entity."""

        with self.driver.session() as session:
            if relationship_types:
                rel_filter = "|".join(r.upper() for r in relationship_types)
                query = f"""
                    MATCH path = (e:Entity {{name: $name}})-[r:{rel_filter}*1..{max_depth}]-(related:Entity)
                    RETURN DISTINCT related.name as name, related.type as type,
                           [rel in relationships(path) | type(rel)] as relationships,
                           length(path) as distance
                    ORDER BY distance
                    LIMIT 50
                """
            else:
                query = f"""
                    MATCH path = (e:Entity {{name: $name}})-[*1..{max_depth}]-(related:Entity)
                    RETURN DISTINCT related.name as name, related.type as type,
                           [rel in relationships(path) | type(rel)] as relationships,
                           length(path) as distance
                    ORDER BY distance
                    LIMIT 50
                """

            result = session.run(query, {"name": entity_name})
            return [dict(record) for record in result]

    def query_relationships(self, query: str) -> List[dict]:
        """Natural language query to graph query."""

        # Use LLM to convert natural language to Cypher
        # This is a simplified example
        patterns = {
            r"what (?:drugs?|medications?) (?:treat|for) (.+)": """
                MATCH (drug:Entity {type: 'drug'})-[:TREATS]->(condition:Entity {name: $condition})
                RETURN drug.name as drug, condition.name as condition
            """,
            r"what (?:are the )?side effects of (.+)": """
                MATCH (effect:Entity)-[:SIDE_EFFECT_OF]->(drug:Entity {name: $drug})
                RETURN effect.name as side_effect, drug.name as drug
            """,
            r"what interacts with (.+)": """
                MATCH (drug1:Entity {name: $drug})-[:INTERACTS_WITH]-(drug2:Entity)
                RETURN drug1.name as drug, drug2.name as interacts_with
            """,
        }

        # Match query pattern and execute
        for pattern, cypher_template in patterns.items():
            import re
            match = re.match(pattern, query.lower())
            if match:
                with self.driver.session() as session:
                    params = {"condition": match.group(1)} if "condition" in cypher_template else {"drug": match.group(1)}
                    result = session.run(cypher_template, params)
                    return [dict(record) for record in result]

        return []
```

### Docker Compose Addition

```yaml
  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    environment:
      - NEO4J_AUTH=neo4j/voiceassist_graph
      - NEO4J_PLUGINS=["apoc"]
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs

volumes:
  neo4j_data:
  neo4j_logs:
```

### Implementation Steps

1. **Week 7:**
   - Set up Neo4j in Docker
   - Install scispaCy and UMLS linker
   - Implement MedicalEntityExtractor

2. **Week 8:**
   - Implement RelationshipExtractor
   - Build KnowledgeGraphService
   - Create entity extraction Celery task

3. **Week 9:**
   - Build graph query API endpoints
   - Create entity browser UI
   - Add graph visualization component
   - Write tests

---

## 6. Multi-Modal Search

### Overview
Enable searching by image content, similar figures, and cross-referencing visual elements.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Image Upload   │────▶│  CLIP Encoder   │────▶│  Vector Search  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┘
        ▼
┌─────────────────┐     ┌─────────────────┐
│  Similar Figs   │     │  Related Text   │
│  (Image→Image)  │     │  (Image→Text)   │
└─────────────────┘     └─────────────────┘
```

### Database Schema

```sql
-- Figure embeddings for similarity search
CREATE TABLE figure_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    figure_index INTEGER NOT NULL,

    -- Figure metadata
    figure_type VARCHAR(50),  -- diagram, chart, photo, illustration
    caption TEXT,
    description TEXT,

    -- CLIP embeddings
    image_embedding VECTOR(512),  -- CLIP image embedding
    text_embedding VECTOR(512),   -- CLIP text embedding from caption/description

    -- Storage
    image_path VARCHAR(500),
    thumbnail_path VARCHAR(500),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(document_id, page_number, figure_index)
);

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Indexes for similarity search
CREATE INDEX idx_figure_image_embedding ON figure_embeddings
    USING ivfflat (image_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_figure_text_embedding ON figure_embeddings
    USING ivfflat (text_embedding vector_cosine_ops) WITH (lists = 100);
```

### Implementation

**multimodal_search_service.py:**
```python
import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
from typing import List, Tuple, Optional
import io

class MultiModalSearchService:
    """Multi-modal search using CLIP embeddings."""

    def __init__(self):
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        self.model.eval()

    def encode_image(self, image_bytes: bytes) -> List[float]:
        """Encode image to CLIP embedding."""

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")

        with torch.no_grad():
            image_features = self.model.get_image_features(**inputs)
            embedding = image_features[0].numpy().tolist()

        return embedding

    def encode_text(self, text: str) -> List[float]:
        """Encode text to CLIP embedding."""

        inputs = self.processor(text=[text], return_tensors="pt", padding=True, truncation=True)

        with torch.no_grad():
            text_features = self.model.get_text_features(**inputs)
            embedding = text_features[0].numpy().tolist()

        return embedding

    async def search_by_image(
        self,
        image_bytes: bytes,
        top_k: int = 10,
        db: Session = None,
    ) -> List[dict]:
        """Search for similar figures by image."""

        query_embedding = self.encode_image(image_bytes)

        # Search using pgvector
        results = db.execute("""
            SELECT
                fe.id,
                fe.document_id,
                fe.page_number,
                fe.figure_index,
                fe.caption,
                fe.description,
                fe.image_path,
                d.name as document_name,
                1 - (fe.image_embedding <=> :embedding) as similarity
            FROM figure_embeddings fe
            JOIN kb_documents d ON fe.document_id = d.document_id
            ORDER BY fe.image_embedding <=> :embedding
            LIMIT :top_k
        """, {"embedding": query_embedding, "top_k": top_k})

        return [dict(row) for row in results]

    async def search_figures_by_text(
        self,
        query: str,
        top_k: int = 10,
        db: Session = None,
    ) -> List[dict]:
        """Search for figures using text query."""

        query_embedding = self.encode_text(query)

        results = db.execute("""
            SELECT
                fe.id,
                fe.document_id,
                fe.page_number,
                fe.figure_index,
                fe.caption,
                fe.description,
                fe.image_path,
                d.name as document_name,
                1 - (fe.text_embedding <=> :embedding) as similarity
            FROM figure_embeddings fe
            JOIN kb_documents d ON fe.document_id = d.document_id
            ORDER BY fe.text_embedding <=> :embedding
            LIMIT :top_k
        """, {"embedding": query_embedding, "top_k": top_k})

        return [dict(row) for row in results]

    async def find_similar_figures(
        self,
        figure_id: str,
        top_k: int = 5,
        db: Session = None,
    ) -> List[dict]:
        """Find figures similar to a given figure."""

        # Get the figure's embedding
        figure = db.query(FigureEmbedding).filter_by(id=figure_id).first()
        if not figure:
            return []

        results = db.execute("""
            SELECT
                fe.id,
                fe.document_id,
                fe.page_number,
                fe.caption,
                fe.image_path,
                d.name as document_name,
                1 - (fe.image_embedding <=> :embedding) as similarity
            FROM figure_embeddings fe
            JOIN kb_documents d ON fe.document_id = d.document_id
            WHERE fe.id != :figure_id
            ORDER BY fe.image_embedding <=> :embedding
            LIMIT :top_k
        """, {
            "embedding": figure.image_embedding,
            "figure_id": figure_id,
            "top_k": top_k,
        })

        return [dict(row) for row in results]


class FigureExtractionService:
    """Extract and index figures from documents."""

    def __init__(self, multimodal_service: MultiModalSearchService):
        self.multimodal = multimodal_service

    async def extract_and_index_figures(
        self,
        document_id: str,
        enhanced_structure: dict,
        page_images_path: str,
        db: Session,
    ):
        """Extract figures from document and create embeddings."""

        for page_data in enhanced_structure.get("pages", []):
            page_number = page_data["page_number"]

            for i, block in enumerate(page_data.get("content_blocks", [])):
                if block["type"] != "figure":
                    continue

                # Get figure image region (would need bbox extraction)
                # For now, use the full page image
                page_image_path = f"{page_images_path}/page_{page_number:04d}.jpg"

                if not os.path.exists(page_image_path):
                    continue

                with open(page_image_path, "rb") as f:
                    image_bytes = f.read()

                # Create embeddings
                image_embedding = self.multimodal.encode_image(image_bytes)

                caption = block.get("caption", "")
                description = block.get("description", "")
                text_content = f"{caption} {description}".strip()
                text_embedding = self.multimodal.encode_text(text_content) if text_content else None

                # Store in database
                figure_record = FigureEmbedding(
                    document_id=document_id,
                    page_number=page_number,
                    figure_index=i,
                    figure_type=block.get("figure_type", "diagram"),
                    caption=caption,
                    description=description,
                    image_embedding=image_embedding,
                    text_embedding=text_embedding,
                    image_path=page_image_path,
                )
                db.add(figure_record)

        db.commit()
```

### API Endpoints

**multimodal_search.py:**
```python
from fastapi import APIRouter, UploadFile, File

router = APIRouter(prefix="/api/search/multimodal", tags=["multimodal-search"])

@router.post("/by-image")
async def search_by_image(
    file: UploadFile = File(...),
    top_k: int = 10,
    db: Session = Depends(get_db),
):
    """Search for similar figures by uploading an image."""

    image_bytes = await file.read()
    service = MultiModalSearchService()

    results = await service.search_by_image(image_bytes, top_k, db)

    return {
        "results": results,
        "total": len(results),
    }

@router.get("/figures")
async def search_figures(
    query: str,
    top_k: int = 10,
    db: Session = Depends(get_db),
):
    """Search for figures using text query."""

    service = MultiModalSearchService()
    results = await service.search_figures_by_text(query, top_k, db)

    return {
        "results": results,
        "total": len(results),
    }

@router.get("/figures/{figure_id}/similar")
async def get_similar_figures(
    figure_id: str,
    top_k: int = 5,
    db: Session = Depends(get_db),
):
    """Find figures similar to a given figure."""

    service = MultiModalSearchService()
    results = await service.find_similar_figures(figure_id, top_k, db)

    return {
        "results": results,
        "total": len(results),
    }
```

### Implementation Steps

1. **Week 9:**
   - Install CLIP model and dependencies
   - Create figure_embeddings table with pgvector
   - Implement MultiModalSearchService

2. **Week 10:**
   - Build FigureExtractionService
   - Create figure indexing Celery task
   - Implement API endpoints
   - Build figure search UI
   - Write tests

---

## 5. Learning Mode / Spaced Repetition

### Overview
Transform content into educational quizzes with spaced repetition scheduling for effective learning.

### Database Schema

```sql
-- Quiz questions generated from content
CREATE TABLE quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES kb_documents(id),
    page_number INTEGER,
    chunk_id UUID,

    -- Question content
    question_type VARCHAR(50),  -- multiple_choice, true_false, fill_blank, short_answer
    question_text TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    incorrect_answers TEXT[],  -- For multiple choice
    explanation TEXT,

    -- Difficulty and metadata
    difficulty VARCHAR(20),  -- easy, medium, hard
    topic_tags TEXT[],
    entity_refs TEXT[],  -- Referenced medical entities

    -- Statistics
    times_shown INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User learning progress
CREATE TABLE user_learning_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    question_id UUID NOT NULL REFERENCES quiz_questions(id),

    -- Spaced repetition state
    ease_factor FLOAT DEFAULT 2.5,  -- SM-2 algorithm
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,

    -- Review history
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,

    -- Performance
    total_reviews INTEGER DEFAULT 0,
    correct_reviews INTEGER DEFAULT 0,

    UNIQUE(user_id, question_id)
);

-- Learning sessions
CREATE TABLE learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    -- Session config
    document_id UUID,  -- Optional focus on specific document
    topic_filter TEXT[],
    question_count INTEGER,

    -- Results
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    time_spent_seconds INTEGER,

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Document mastery tracking
CREATE TABLE document_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES kb_documents(id),

    -- Mastery metrics
    mastery_level FLOAT DEFAULT 0,  -- 0.0 to 1.0
    questions_available INTEGER DEFAULT 0,
    questions_mastered INTEGER DEFAULT 0,

    -- Time tracking
    total_study_time_seconds INTEGER DEFAULT 0,
    last_studied_at TIMESTAMPTZ,

    UNIQUE(user_id, document_id)
);

CREATE INDEX idx_progress_user ON user_learning_progress(user_id);
CREATE INDEX idx_progress_next_review ON user_learning_progress(user_id, next_review_at);
CREATE INDEX idx_questions_document ON quiz_questions(document_id);
CREATE INDEX idx_mastery_user ON document_mastery(user_id);
```

### Implementation

**question_generator.py:**
```python
from typing import List
from dataclasses import dataclass

@dataclass
class GeneratedQuestion:
    question_type: str
    question_text: str
    correct_answer: str
    incorrect_answers: List[str]
    explanation: str
    difficulty: str
    topic_tags: List[str]

class QuestionGenerator:
    """Generate quiz questions from document content."""

    GENERATION_PROMPT = """Generate educational quiz questions from this medical content.

Content:
{content}

Generate {count} questions of varying types and difficulty.
Return JSON array:
[
  {{
    "type": "multiple_choice" | "true_false" | "fill_blank",
    "question": "The question text",
    "correct_answer": "The correct answer",
    "incorrect_answers": ["Wrong 1", "Wrong 2", "Wrong 3"],  // For multiple choice
    "explanation": "Brief explanation of the correct answer",
    "difficulty": "easy" | "medium" | "hard",
    "topics": ["relevant", "topic", "tags"]
  }}
]

Ensure questions test understanding, not just recall. Include clinical application questions."""

    def __init__(self):
        from openai import AsyncOpenAI
        self.openai = AsyncOpenAI()

    async def generate_questions(
        self,
        content: str,
        count: int = 5,
        existing_questions: List[str] = None,
    ) -> List[GeneratedQuestion]:
        """Generate questions from content."""

        prompt = self.GENERATION_PROMPT.format(content=content[:4000], count=count)

        if existing_questions:
            prompt += f"\n\nAvoid duplicating these existing questions:\n" + "\n".join(existing_questions[:10])

        response = await self.openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )

        data = json.loads(response.choices[0].message.content)
        questions = []

        for q in data.get("questions", []):
            questions.append(GeneratedQuestion(
                question_type=q["type"],
                question_text=q["question"],
                correct_answer=q["correct_answer"],
                incorrect_answers=q.get("incorrect_answers", []),
                explanation=q.get("explanation", ""),
                difficulty=q.get("difficulty", "medium"),
                topic_tags=q.get("topics", []),
            ))

        return questions

    async def generate_from_document(
        self,
        document_id: str,
        enhanced_structure: dict,
        questions_per_page: int = 2,
        db: Session = None,
    ):
        """Generate questions for entire document."""

        existing = [q.question_text for q in db.query(QuizQuestion).filter_by(
            document_id=document_id
        ).limit(50).all()]

        for page_data in enhanced_structure.get("pages", []):
            page_number = page_data["page_number"]

            # Combine content
            content_parts = [page_data.get("voice_narration", "")]
            for block in page_data.get("content_blocks", []):
                if block["type"] in ("text", "heading"):
                    content_parts.append(block.get("content", ""))

            content = "\n\n".join(filter(None, content_parts))

            if len(content) < 100:
                continue

            # Generate questions
            questions = await self.generate_questions(
                content=content,
                count=questions_per_page,
                existing_questions=existing,
            )

            # Store questions
            for q in questions:
                question = QuizQuestion(
                    document_id=document_id,
                    page_number=page_number,
                    question_type=q.question_type,
                    question_text=q.question_text,
                    correct_answer=q.correct_answer,
                    incorrect_answers=q.incorrect_answers,
                    explanation=q.explanation,
                    difficulty=q.difficulty,
                    topic_tags=q.topic_tags,
                )
                db.add(question)
                existing.append(q.question_text)

        db.commit()


class SpacedRepetitionService:
    """SM-2 based spaced repetition scheduling."""

    def __init__(self, db: Session):
        self.db = db

    def get_due_questions(
        self,
        user_id: str,
        limit: int = 20,
        document_id: str = None,
    ) -> List[dict]:
        """Get questions due for review."""

        now = datetime.utcnow()

        query = self.db.query(
            QuizQuestion, UserLearningProgress
        ).outerjoin(
            UserLearningProgress,
            (UserLearningProgress.question_id == QuizQuestion.id) &
            (UserLearningProgress.user_id == user_id)
        ).filter(
            or_(
                UserLearningProgress.next_review_at <= now,
                UserLearningProgress.id.is_(None)  # Never reviewed
            )
        )

        if document_id:
            query = query.filter(QuizQuestion.document_id == document_id)

        results = query.order_by(
            # Prioritize: never seen, then overdue, then by ease
            UserLearningProgress.next_review_at.asc().nullsfirst(),
            UserLearningProgress.ease_factor.asc(),
        ).limit(limit).all()

        return [
            {
                "question": q.to_dict(),
                "progress": p.to_dict() if p else None,
            }
            for q, p in results
        ]

    def record_answer(
        self,
        user_id: str,
        question_id: str,
        quality: int,  # 0-5: 0=complete blackout, 5=perfect response
    ) -> dict:
        """Record answer and update spaced repetition schedule."""

        # Get or create progress record
        progress = self.db.query(UserLearningProgress).filter_by(
            user_id=user_id,
            question_id=question_id,
        ).first()

        if not progress:
            progress = UserLearningProgress(
                user_id=user_id,
                question_id=question_id,
            )
            self.db.add(progress)

        # SM-2 algorithm
        if quality >= 3:  # Correct response
            if progress.repetitions == 0:
                progress.interval_days = 1
            elif progress.repetitions == 1:
                progress.interval_days = 6
            else:
                progress.interval_days = round(progress.interval_days * progress.ease_factor)

            progress.repetitions += 1
            progress.correct_reviews += 1
        else:  # Incorrect
            progress.repetitions = 0
            progress.interval_days = 1

        # Update ease factor
        progress.ease_factor = max(
            1.3,
            progress.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        )

        # Schedule next review
        progress.last_reviewed_at = datetime.utcnow()
        progress.next_review_at = progress.last_reviewed_at + timedelta(days=progress.interval_days)
        progress.total_reviews += 1

        self.db.commit()

        return {
            "next_review": progress.next_review_at.isoformat(),
            "interval_days": progress.interval_days,
            "ease_factor": progress.ease_factor,
        }

    def get_user_stats(self, user_id: str) -> dict:
        """Get learning statistics for user."""

        # Due today
        now = datetime.utcnow()
        today_end = now.replace(hour=23, minute=59, second=59)

        due_today = self.db.query(func.count(UserLearningProgress.id)).filter(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.next_review_at <= today_end,
        ).scalar()

        # Overall stats
        total_questions = self.db.query(func.count(UserLearningProgress.id)).filter_by(
            user_id=user_id
        ).scalar()

        mastered = self.db.query(func.count(UserLearningProgress.id)).filter(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.interval_days >= 21,  # 3+ weeks = mastered
        ).scalar()

        # Retention rate
        retention = self.db.query(
            func.sum(UserLearningProgress.correct_reviews),
            func.sum(UserLearningProgress.total_reviews),
        ).filter_by(user_id=user_id).first()

        retention_rate = (retention[0] / retention[1]) if retention[1] else 0

        return {
            "due_today": due_today,
            "total_questions": total_questions,
            "mastered": mastered,
            "retention_rate": retention_rate,
        }
```

### Implementation Steps

1. **Week 10:**
   - Create learning tables migration
   - Implement QuestionGenerator
   - Build question generation Celery task

2. **Week 11:**
   - Implement SpacedRepetitionService
   - Create learning session endpoints
   - Build quiz UI components

3. **Week 12:**
   - Add progress dashboard
   - Implement document mastery tracking
   - Add learning reminders
   - Write tests

---

# Phase 4: Scale & Operations

## 8. Multi-Tenancy

### Overview
Support multiple organizations with isolated data, configuration, and billing.

### Database Schema

```sql
-- Tenants
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,

    -- Configuration
    settings JSONB DEFAULT '{}',
    feature_flags JSONB DEFAULT '{}',

    -- Limits
    max_documents INTEGER DEFAULT 100,
    max_users INTEGER DEFAULT 10,
    max_storage_gb INTEGER DEFAULT 10,

    -- Billing
    plan VARCHAR(50) DEFAULT 'free',  -- free, starter, professional, enterprise
    stripe_customer_id VARCHAR(255),
    billing_email VARCHAR(255),

    -- Status
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    suspended_at TIMESTAMPTZ
);

-- Add tenant_id to existing tables
ALTER TABLE kb_documents ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE background_jobs ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE audio_narrations ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Tenant usage tracking
CREATE TABLE tenant_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Usage metrics
    documents_count INTEGER DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    gpt4_vision_pages INTEGER DEFAULT 0,
    tts_characters INTEGER DEFAULT 0,

    -- Costs
    estimated_cost_usd DECIMAL(10, 2) DEFAULT 0,

    UNIQUE(tenant_id, period_start)
);

-- Indexes
CREATE INDEX idx_documents_tenant ON kb_documents(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_usage_tenant_period ON tenant_usage(tenant_id, period_start);
```

### Implementation

**tenant_service.py:**
```python
from contextvars import ContextVar
from typing import Optional

# Context variable for current tenant
current_tenant_id: ContextVar[Optional[str]] = ContextVar("current_tenant_id", default=None)

class TenantService:
    """Tenant management and isolation."""

    def __init__(self, db: Session):
        self.db = db

    def create_tenant(
        self,
        name: str,
        slug: str,
        admin_email: str,
        plan: str = "free",
    ) -> Tenant:
        """Create a new tenant."""

        tenant = Tenant(
            name=name,
            slug=slug,
            plan=plan,
            settings=self._default_settings(plan),
            feature_flags=self._default_features(plan),
        )
        self.db.add(tenant)
        self.db.commit()

        # Create admin user
        from app.services.user_service import UserService
        UserService(self.db).create_user(
            email=admin_email,
            tenant_id=tenant.id,
            role="admin",
        )

        return tenant

    def _default_settings(self, plan: str) -> dict:
        """Get default settings for plan."""

        base = {
            "default_voice": "alloy",
            "enable_phi_detection": True,
            "default_embedding_model": "text-embedding-3-small",
        }

        if plan in ("professional", "enterprise"):
            base.update({
                "enable_gpt4_vision": True,
                "custom_prompts_enabled": True,
            })

        return base

    def _default_features(self, plan: str) -> dict:
        """Get feature flags for plan."""

        return {
            "knowledge_graph": plan in ("professional", "enterprise"),
            "learning_mode": plan != "free",
            "multimodal_search": plan in ("professional", "enterprise"),
            "answer_validation": plan != "free",
            "custom_voices": plan == "enterprise",
            "api_access": plan != "free",
        }

    def check_limit(self, tenant_id: str, limit_type: str) -> tuple[bool, str]:
        """Check if tenant is within limits."""

        tenant = self.db.query(Tenant).filter_by(id=tenant_id).first()
        if not tenant:
            return False, "Tenant not found"

        if limit_type == "documents":
            current = self.db.query(func.count(KBDocument.id)).filter_by(
                tenant_id=tenant_id
            ).scalar()
            if current >= tenant.max_documents:
                return False, f"Document limit reached ({tenant.max_documents})"

        elif limit_type == "storage":
            # Calculate total storage
            total_bytes = self.db.query(func.sum(KBDocument.file_size)).filter_by(
                tenant_id=tenant_id
            ).scalar() or 0
            max_bytes = tenant.max_storage_gb * 1024 * 1024 * 1024
            if total_bytes >= max_bytes:
                return False, f"Storage limit reached ({tenant.max_storage_gb} GB)"

        return True, ""

    def get_usage(self, tenant_id: str, period_start: date = None) -> dict:
        """Get usage for current billing period."""

        if not period_start:
            period_start = date.today().replace(day=1)

        usage = self.db.query(TenantUsage).filter_by(
            tenant_id=tenant_id,
            period_start=period_start,
        ).first()

        if not usage:
            return {
                "documents_count": 0,
                "storage_bytes": 0,
                "api_calls": 0,
                "estimated_cost_usd": 0,
            }

        return usage.to_dict()

    def increment_usage(
        self,
        tenant_id: str,
        documents: int = 0,
        storage_bytes: int = 0,
        api_calls: int = 0,
        gpt4_vision_pages: int = 0,
        tts_characters: int = 0,
    ):
        """Increment usage counters."""

        period_start = date.today().replace(day=1)
        period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)

        usage = self.db.query(TenantUsage).filter_by(
            tenant_id=tenant_id,
            period_start=period_start,
        ).first()

        if not usage:
            usage = TenantUsage(
                tenant_id=tenant_id,
                period_start=period_start,
                period_end=period_end,
            )
            self.db.add(usage)

        usage.documents_count += documents
        usage.storage_bytes += storage_bytes
        usage.api_calls += api_calls
        usage.gpt4_vision_pages += gpt4_vision_pages
        usage.tts_characters += tts_characters

        # Estimate cost
        usage.estimated_cost_usd = (
            gpt4_vision_pages * 0.01275 +
            tts_characters * 0.000015  # ~$15 per 1M characters
        )

        self.db.commit()


class TenantMiddleware:
    """FastAPI middleware for tenant isolation."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Extract tenant from various sources
            tenant_id = None

            # From header
            headers = dict(scope.get("headers", []))
            if b"x-tenant-id" in headers:
                tenant_id = headers[b"x-tenant-id"].decode()

            # From subdomain
            host = headers.get(b"host", b"").decode()
            if host and "." in host:
                subdomain = host.split(".")[0]
                # Look up tenant by slug
                # tenant_id = get_tenant_id_by_slug(subdomain)

            # Set context
            token = current_tenant_id.set(tenant_id)
            try:
                await self.app(scope, receive, send)
            finally:
                current_tenant_id.reset(token)
        else:
            await self.app(scope, receive, send)


def tenant_filter(query, model):
    """Apply tenant filter to SQLAlchemy query."""
    tenant_id = current_tenant_id.get()
    if tenant_id and hasattr(model, "tenant_id"):
        return query.filter(model.tenant_id == tenant_id)
    return query
```

### Implementation Steps

1. **Week 12:**
   - Create tenant tables migration
   - Add tenant_id columns to existing tables
   - Implement TenantService

2. **Week 13:**
   - Build TenantMiddleware
   - Update all queries with tenant filtering
   - Implement usage tracking

3. **Week 14:**
   - Build tenant management UI
   - Add billing integration (Stripe)
   - Implement rate limiting per tenant
   - Write tests

---

## 9. Analytics Dashboard

### Overview
Comprehensive analytics for usage patterns, content gaps, costs, and user engagement.

### Database Schema

```sql
-- Query analytics
CREATE TABLE query_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID,
    query_text TEXT NOT NULL,
    query_embedding VECTOR(1536),  -- For similar query detection

    -- Results
    documents_retrieved INTEGER,
    top_document_id UUID,
    retrieval_confidence FLOAT,

    -- Validation
    was_validated BOOLEAN DEFAULT FALSE,
    validation_confidence FLOAT,

    -- User feedback
    user_rating INTEGER,  -- 1-5
    user_feedback TEXT,

    -- Timing
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content gap detection
CREATE TABLE content_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),

    -- Gap details
    query_pattern TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    avg_retrieval_confidence FLOAT,

    -- Status
    status VARCHAR(50) DEFAULT 'detected',  -- detected, reviewing, addressed, dismissed
    addressed_document_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Cost tracking
CREATE TABLE cost_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),

    -- Time period
    date DATE NOT NULL,

    -- Costs by service
    openai_embeddings_cost DECIMAL(10, 4) DEFAULT 0,
    openai_gpt4_cost DECIMAL(10, 4) DEFAULT 0,
    openai_gpt4_vision_cost DECIMAL(10, 4) DEFAULT 0,
    openai_tts_cost DECIMAL(10, 4) DEFAULT 0,

    -- Usage counts
    embedding_tokens INTEGER DEFAULT 0,
    gpt4_input_tokens INTEGER DEFAULT 0,
    gpt4_output_tokens INTEGER DEFAULT 0,
    gpt4_vision_images INTEGER DEFAULT 0,
    tts_characters INTEGER DEFAULT 0,

    UNIQUE(tenant_id, date)
);

-- Indexes
CREATE INDEX idx_query_analytics_tenant ON query_analytics(tenant_id);
CREATE INDEX idx_query_analytics_created ON query_analytics(created_at);
CREATE INDEX idx_content_gaps_tenant ON content_gaps(tenant_id);
CREATE INDEX idx_cost_tracking_tenant_date ON cost_tracking(tenant_id, date);
```

### Implementation

**analytics_service.py:**
```python
from datetime import date, timedelta
from typing import List, Optional
import numpy as np

class AnalyticsService:
    """Analytics and reporting service."""

    def __init__(self, db: Session):
        self.db = db

    async def record_query(
        self,
        tenant_id: str,
        user_id: str,
        query_text: str,
        results: dict,
        response_time_ms: int,
    ):
        """Record a query for analytics."""

        # Generate embedding for similarity detection
        from app.services.kb_indexer import KBIndexer
        indexer = KBIndexer()
        embedding = await indexer.generate_embedding(query_text)

        record = QueryAnalytics(
            tenant_id=tenant_id,
            user_id=user_id,
            query_text=query_text,
            query_embedding=embedding,
            documents_retrieved=len(results.get("sources", [])),
            top_document_id=results.get("sources", [{}])[0].get("document_id") if results.get("sources") else None,
            retrieval_confidence=results.get("confidence"),
            was_validated=results.get("validation") is not None,
            validation_confidence=results.get("validation", {}).get("confidence"),
            response_time_ms=response_time_ms,
        )
        self.db.add(record)
        self.db.commit()

        # Check for content gaps
        if (record.retrieval_confidence or 0) < 0.5:
            await self._detect_content_gap(tenant_id, query_text, embedding)

    async def _detect_content_gap(
        self,
        tenant_id: str,
        query_text: str,
        embedding: List[float],
    ):
        """Detect and record content gaps."""

        # Check for similar existing gaps
        similar = self.db.execute("""
            SELECT id, query_pattern, occurrence_count
            FROM content_gaps
            WHERE tenant_id = :tenant_id
              AND status IN ('detected', 'reviewing')
            ORDER BY query_embedding <=> :embedding
            LIMIT 1
        """, {"tenant_id": tenant_id, "embedding": embedding}).first()

        if similar and similar[0]:
            # Update existing gap
            self.db.execute("""
                UPDATE content_gaps
                SET occurrence_count = occurrence_count + 1,
                    updated_at = NOW()
                WHERE id = :id
            """, {"id": similar[0]})
        else:
            # Create new gap
            gap = ContentGap(
                tenant_id=tenant_id,
                query_pattern=query_text,
                avg_retrieval_confidence=0.0,
            )
            self.db.add(gap)

        self.db.commit()

    def get_usage_dashboard(
        self,
        tenant_id: str,
        start_date: date,
        end_date: date,
    ) -> dict:
        """Get usage dashboard data."""

        # Query volume over time
        query_volume = self.db.execute("""
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM query_analytics
            WHERE tenant_id = :tenant_id
              AND created_at BETWEEN :start AND :end
            GROUP BY DATE(created_at)
            ORDER BY date
        """, {
            "tenant_id": tenant_id,
            "start": start_date,
            "end": end_date,
        }).fetchall()

        # Top queries
        top_queries = self.db.execute("""
            SELECT query_text, COUNT(*) as count, AVG(retrieval_confidence) as avg_confidence
            FROM query_analytics
            WHERE tenant_id = :tenant_id
              AND created_at BETWEEN :start AND :end
            GROUP BY query_text
            ORDER BY count DESC
            LIMIT 20
        """, {
            "tenant_id": tenant_id,
            "start": start_date,
            "end": end_date,
        }).fetchall()

        # Top documents
        top_documents = self.db.execute("""
            SELECT d.name, COUNT(*) as retrieval_count
            FROM query_analytics qa
            JOIN kb_documents d ON qa.top_document_id = d.document_id
            WHERE qa.tenant_id = :tenant_id
              AND qa.created_at BETWEEN :start AND :end
              AND qa.top_document_id IS NOT NULL
            GROUP BY d.name
            ORDER BY retrieval_count DESC
            LIMIT 10
        """, {
            "tenant_id": tenant_id,
            "start": start_date,
            "end": end_date,
        }).fetchall()

        # Confidence distribution
        confidence_dist = self.db.execute("""
            SELECT
                CASE
                    WHEN retrieval_confidence >= 0.8 THEN 'high'
                    WHEN retrieval_confidence >= 0.5 THEN 'medium'
                    ELSE 'low'
                END as confidence_level,
                COUNT(*) as count
            FROM query_analytics
            WHERE tenant_id = :tenant_id
              AND created_at BETWEEN :start AND :end
            GROUP BY confidence_level
        """, {
            "tenant_id": tenant_id,
            "start": start_date,
            "end": end_date,
        }).fetchall()

        return {
            "query_volume": [{"date": str(r[0]), "count": r[1]} for r in query_volume],
            "top_queries": [{"query": r[0], "count": r[1], "confidence": r[2]} for r in top_queries],
            "top_documents": [{"name": r[0], "count": r[1]} for r in top_documents],
            "confidence_distribution": {r[0]: r[1] for r in confidence_dist},
        }

    def get_content_gaps(
        self,
        tenant_id: str,
        status: str = None,
        limit: int = 50,
    ) -> List[dict]:
        """Get detected content gaps."""

        query = self.db.query(ContentGap).filter_by(tenant_id=tenant_id)

        if status:
            query = query.filter_by(status=status)

        gaps = query.order_by(
            ContentGap.occurrence_count.desc()
        ).limit(limit).all()

        return [g.to_dict() for g in gaps]

    def get_cost_breakdown(
        self,
        tenant_id: str,
        start_date: date,
        end_date: date,
    ) -> dict:
        """Get cost breakdown by service."""

        costs = self.db.execute("""
            SELECT
                SUM(openai_embeddings_cost) as embeddings,
                SUM(openai_gpt4_cost) as gpt4,
                SUM(openai_gpt4_vision_cost) as gpt4_vision,
                SUM(openai_tts_cost) as tts,
                SUM(embedding_tokens) as embedding_tokens,
                SUM(gpt4_input_tokens) as gpt4_input_tokens,
                SUM(gpt4_output_tokens) as gpt4_output_tokens,
                SUM(gpt4_vision_images) as vision_images,
                SUM(tts_characters) as tts_chars
            FROM cost_tracking
            WHERE tenant_id = :tenant_id
              AND date BETWEEN :start AND :end
        """, {
            "tenant_id": tenant_id,
            "start": start_date,
            "end": end_date,
        }).first()

        # Daily breakdown
        daily = self.db.execute("""
            SELECT date,
                   openai_embeddings_cost + openai_gpt4_cost +
                   openai_gpt4_vision_cost + openai_tts_cost as total_cost
            FROM cost_tracking
            WHERE tenant_id = :tenant_id
              AND date BETWEEN :start AND :end
            ORDER BY date
        """, {
            "tenant_id": tenant_id,
            "start": start_date,
            "end": end_date,
        }).fetchall()

        total = sum([
            float(costs[0] or 0),
            float(costs[1] or 0),
            float(costs[2] or 0),
            float(costs[3] or 0),
        ])

        return {
            "total_cost": total,
            "breakdown": {
                "embeddings": float(costs[0] or 0),
                "gpt4": float(costs[1] or 0),
                "gpt4_vision": float(costs[2] or 0),
                "tts": float(costs[3] or 0),
            },
            "usage": {
                "embedding_tokens": int(costs[4] or 0),
                "gpt4_input_tokens": int(costs[5] or 0),
                "gpt4_output_tokens": int(costs[6] or 0),
                "gpt4_vision_images": int(costs[7] or 0),
                "tts_characters": int(costs[8] or 0),
            },
            "daily": [{"date": str(r[0]), "cost": float(r[1])} for r in daily],
        }
```

### Implementation Steps

1. **Week 14:**
   - Create analytics tables migration
   - Implement AnalyticsService
   - Add query recording to RAG service

2. **Week 15:**
   - Build analytics API endpoints
   - Create dashboard UI components
   - Add cost tracking integration

3. **Week 16:**
   - Implement content gap detection
   - Add alerting for anomalies
   - Build export functionality
   - Write tests

---

# Appendix

## A. Dependencies to Add

**requirements.txt additions:**
```
# Phase 1 - Background Processing
celery>=5.3.0
redis>=5.0.0
flower>=2.0.0

# Phase 2 - Voice & Validation
# (No new deps - uses existing OpenAI)

# Phase 3 - Advanced Features
neo4j>=5.0.0
scispacy>=0.5.0
en_core_sci_lg @ https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.0/en_core_sci_lg-0.5.0.tar.gz
transformers>=4.30.0
torch>=2.0.0

# Phase 4 - Scale
stripe>=7.0.0
pgvector>=0.2.0
```

## B. Environment Variables

```bash
# Phase 1
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Phase 2
ELEVENLABS_API_KEY=  # Optional, for premium voices

# Phase 3
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=voiceassist_graph

# Phase 4
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=
```

## C. Testing Strategy

Each phase should include:

1. **Unit Tests**
   - Service layer tests with mocked dependencies
   - Task tests with mocked Celery context

2. **Integration Tests**
   - API endpoint tests
   - Database integration tests
   - External service integration tests

3. **End-to-End Tests**
   - Full workflow tests
   - UI interaction tests (Playwright/Cypress)

4. **Performance Tests**
   - Load testing for background jobs
   - Query performance benchmarks

## D. Rollback Procedures

Each phase should have documented rollback procedures:

1. **Database migrations**: Alembic downgrade scripts
2. **Feature flags**: Disable features without deployment
3. **Service versions**: Docker image version pinning
4. **Configuration**: Environment variable rollback

---

*This roadmap provides a comprehensive foundation for VoiceAssist's evolution into a full-featured medical knowledge assistant platform.*
