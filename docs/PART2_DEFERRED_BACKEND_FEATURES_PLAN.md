---
title: Part2 Deferred Backend Features Plan
slug: part2-deferred-backend-features-plan
summary: "**Date:** 2025-11-26"
status: stable
stability: beta
owner: docs
lastUpdated: "2025-11-27"
audience:
  - backend
  - ai-agents
tags:
  - part2
  - deferred
  - backend
  - features
category: planning
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/main.py"
ai_summary: >-
  Version: 1.0 Date: 2025-11-26 Status: Planning Complete - Ready for
  Implementation Priority: High - Enables Full Frontend Functionality Estimated
  Total Effort: 17-21 weeks (2-3 developers) --- This document consolidates and
  expands upon all deferred backend features from the VoiceAssist developme...
---

# Part 2: Deferred Backend Features Implementation Plan

**Version:** 1.0
**Date:** 2025-11-26
**Status:** Planning Complete - Ready for Implementation
**Priority:** High - Enables Full Frontend Functionality
**Estimated Total Effort:** 17-21 weeks (2-3 developers)

---

## Executive Summary

This document consolidates and expands upon all deferred backend features from the VoiceAssist development phases. It provides detailed implementation plans with improvements, optimizations, comprehensive testing strategies, and security considerations.

**Sources Consolidated:**

- `BACKEND_IMPLEMENTATION_PLAN.md` - Priority 2-3 features
- `CONTINUOUS_IMPROVEMENT_PLAN.md` - Phase 4-6 deferrals
- Phase completion reports - Deferred items
- Frontend requirements - Backend gaps

**Key Deliverables:**

1. Advanced File Processing Pipeline
2. Conversation Sharing & Collaboration
3. Full Voice Pipeline (WebRTC, VAD, Barge-in, Voice Auth)
4. OpenAI Realtime API Integration
5. Advanced Medical AI (BioGPT, PubMedBERT, Medical NER)
6. External Medical Integrations (UpToDate, OpenEvidence, PubMed)
7. Medical Calculators Library
8. OIDC/SSO Authentication with MFA
9. Complete Email Integration (IMAP/SMTP)
10. CardDAV Contacts Synchronization
11. Google Calendar Sync
12. Nextcloud App Store Packaging
13. Advanced RAG (Hybrid Search, Re-ranking)
14. Multi-Hop Reasoning Engine

---

## Table of Contents

1. [Feature Category A: File & Media Processing](#feature-category-a-file--media-processing)
2. [Feature Category B: Collaboration Features](#feature-category-b-collaboration-features)
3. [Feature Category C: Voice Pipeline Completion](#feature-category-c-voice-pipeline-completion)
4. [Feature Category D: Advanced Medical AI](#feature-category-d-advanced-medical-ai)
5. [Feature Category E: External Medical Integrations](#feature-category-e-external-medical-integrations)
6. [Feature Category F: Authentication & Security](#feature-category-f-authentication--security)
7. [Feature Category G: Nextcloud Integration Completion](#feature-category-g-nextcloud-integration-completion)
8. [Feature Category H: Advanced RAG & Reasoning](#feature-category-h-advanced-rag--reasoning)
9. [Comprehensive Testing Strategy](#comprehensive-testing-strategy)
10. [Performance Benchmarks](#performance-benchmarks)
11. [Security Considerations](#security-considerations)
12. [Implementation Timeline](#implementation-timeline)
13. [Dependencies & Prerequisites](#dependencies--prerequisites)
14. [Risk Assessment & Mitigation](#risk-assessment--mitigation)

---

## Feature Category A: File & Media Processing

### A.1 Advanced File Processing Pipeline

**Original Scope:** Basic file upload with text extraction
**Enhanced Scope:** Full document intelligence pipeline with OCR, medical entity extraction, and contextual indexing

#### A.1.1 Implementation Details

**Database Schema:**

```sql
-- Enhanced file processing tracking
CREATE TABLE file_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID NOT NULL REFERENCES message_attachments(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    processing_type VARCHAR(50) NOT NULL,  -- ocr, text_extraction, entity_extraction, embedding
    input_params JSONB,
    output_data JSONB,
    error_message TEXT,
    processing_time_ms INTEGER,
    worker_id VARCHAR(100),
    retries INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Extracted entities from documents
CREATE TABLE document_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID NOT NULL REFERENCES message_attachments(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,  -- medication, diagnosis, procedure, lab_value, vital_sign
    entity_value TEXT NOT NULL,
    entity_normalized TEXT,  -- standardized form (e.g., RxNorm, ICD-10)
    confidence DECIMAL(3,2),
    position_start INTEGER,
    position_end INTEGER,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_file_processing_jobs_status ON file_processing_jobs(status);
CREATE INDEX idx_file_processing_jobs_attachment ON file_processing_jobs(attachment_id);
CREATE INDEX idx_document_entities_type ON document_entities(entity_type);
CREATE INDEX idx_document_entities_attachment ON document_entities(attachment_id);
```

**Service Implementation:**

```python
# services/api-gateway/app/services/file_processing_service.py

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import asyncio
from concurrent.futures import ThreadPoolExecutor

@dataclass
class ProcessingResult:
    """Result of file processing operation"""
    success: bool
    extracted_text: Optional[str] = None
    entities: Optional[List[Dict[str, Any]]] = None
    embeddings: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    processing_time_ms: int = 0

class FileProcessor(ABC):
    """Abstract base class for file processors"""

    @abstractmethod
    async def process(self, file_path: str, options: Dict[str, Any]) -> ProcessingResult:
        pass

    @abstractmethod
    def supports_type(self, mime_type: str) -> bool:
        pass

class PDFProcessor(FileProcessor):
    """PDF processing with OCR fallback"""

    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=4)

    def supports_type(self, mime_type: str) -> bool:
        return mime_type in ['application/pdf', 'application/x-pdf']

    async def process(self, file_path: str, options: Dict[str, Any]) -> ProcessingResult:
        import time
        start_time = time.time()

        try:
            # Try text extraction first (faster)
            text = await self._extract_text(file_path)

            # If minimal text, fall back to OCR
            if len(text.strip()) < 100:
                text = await self._perform_ocr(file_path)

            # Extract medical entities
            entities = await self._extract_medical_entities(text)

            # Generate embeddings for searchability
            embeddings = await self._generate_embeddings(text)

            processing_time = int((time.time() - start_time) * 1000)

            return ProcessingResult(
                success=True,
                extracted_text=text,
                entities=entities,
                embeddings=embeddings,
                metadata={
                    'page_count': await self._get_page_count(file_path),
                    'extraction_method': 'ocr' if len(text.strip()) < 100 else 'text'
                },
                processing_time_ms=processing_time
            )
        except Exception as e:
            return ProcessingResult(
                success=False,
                error=str(e),
                processing_time_ms=int((time.time() - start_time) * 1000)
            )

    async def _extract_text(self, file_path: str) -> str:
        """Extract text using PyPDF2"""
        import pypdf
        loop = asyncio.get_event_loop()

        def extract():
            reader = pypdf.PdfReader(file_path)
            text_parts = []
            for page in reader.pages:
                text_parts.append(page.extract_text())
            return '\n'.join(text_parts)

        return await loop.run_in_executor(self.executor, extract)

    async def _perform_ocr(self, file_path: str) -> str:
        """Perform OCR using Tesseract via pdf2image"""
        import pytesseract
        from pdf2image import convert_from_path

        loop = asyncio.get_event_loop()

        def ocr():
            images = convert_from_path(file_path, dpi=300)
            text_parts = []
            for image in images:
                text_parts.append(pytesseract.image_to_string(image))
            return '\n'.join(text_parts)

        return await loop.run_in_executor(self.executor, ocr)

    async def _extract_medical_entities(self, text: str) -> List[Dict[str, Any]]:
        """Extract medical entities using spaCy with scispacy models"""
        # Placeholder - integrate with medical NER model
        # Consider: scispacy, clinicalBERT, or custom trained model
        return []

    async def _generate_embeddings(self, text: str) -> List[float]:
        """Generate embeddings for vector search"""
        from app.services.embedding_service import EmbeddingService
        embedding_service = EmbeddingService()
        return await embedding_service.generate_embedding(text[:8000])  # Token limit

    async def _get_page_count(self, file_path: str) -> int:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        return len(reader.pages)

class ImageProcessor(FileProcessor):
    """Image processing with OCR and medical image analysis"""

    SUPPORTED_TYPES = [
        'image/png', 'image/jpeg', 'image/jpg', 'image/tiff',
        'image/bmp', 'image/gif', 'image/webp'
    ]

    def supports_type(self, mime_type: str) -> bool:
        return mime_type in self.SUPPORTED_TYPES

    async def process(self, file_path: str, options: Dict[str, Any]) -> ProcessingResult:
        import time
        import pytesseract
        from PIL import Image

        start_time = time.time()

        try:
            image = Image.open(file_path)

            # Perform OCR
            text = pytesseract.image_to_string(image)

            # Image metadata
            metadata = {
                'width': image.width,
                'height': image.height,
                'format': image.format,
                'mode': image.mode
            }

            # Optional: Medical image classification (if enabled)
            if options.get('medical_classification', False):
                # Integrate with medical vision model
                pass

            processing_time = int((time.time() - start_time) * 1000)

            return ProcessingResult(
                success=True,
                extracted_text=text if text.strip() else None,
                metadata=metadata,
                processing_time_ms=processing_time
            )
        except Exception as e:
            return ProcessingResult(
                success=False,
                error=str(e),
                processing_time_ms=int((time.time() - start_time) * 1000)
            )

class FileProcessingOrchestrator:
    """Orchestrates file processing across different processors"""

    def __init__(self):
        self.processors: List[FileProcessor] = [
            PDFProcessor(),
            ImageProcessor(),
            # Add more processors: MarkdownProcessor, TextProcessor, etc.
        ]

    def get_processor(self, mime_type: str) -> Optional[FileProcessor]:
        for processor in self.processors:
            if processor.supports_type(mime_type):
                return processor
        return None

    async def process_file(
        self,
        file_path: str,
        mime_type: str,
        options: Optional[Dict[str, Any]] = None
    ) -> ProcessingResult:
        processor = self.get_processor(mime_type)
        if not processor:
            return ProcessingResult(
                success=False,
                error=f"Unsupported file type: {mime_type}"
            )

        return await processor.process(file_path, options or {})
```

**API Endpoints:**

```python
# services/api-gateway/app/api/file_processing.py

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import List

router = APIRouter(prefix="/api/files", tags=["file-processing"])

@router.post("/{attachment_id}/process")
async def trigger_file_processing(
    attachment_id: str,
    options: FileProcessingOptions,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger asynchronous file processing.

    Options:
    - extract_text: bool - Extract text content
    - extract_entities: bool - Extract medical entities
    - generate_embeddings: bool - Generate searchable embeddings
    - ocr_fallback: bool - Use OCR if text extraction fails
    """
    attachment = await get_attachment_or_404(attachment_id, current_user, db)

    # Create processing job
    job = FileProcessingJob(
        attachment_id=attachment_id,
        status='pending',
        processing_type='full',
        input_params=options.dict()
    )
    db.add(job)
    db.commit()

    # Queue background processing
    background_tasks.add_task(
        process_file_task,
        job_id=str(job.id),
        file_path=attachment.file_path,
        mime_type=attachment.mime_type,
        options=options.dict()
    )

    return {"job_id": str(job.id), "status": "queued"}

@router.get("/{attachment_id}/processing-status")
async def get_processing_status(
    attachment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the processing status of all jobs for an attachment"""
    jobs = db.query(FileProcessingJob)\
        .filter(FileProcessingJob.attachment_id == attachment_id)\
        .order_by(FileProcessingJob.created_at.desc())\
        .all()

    return {"jobs": [job.to_dict() for job in jobs]}

@router.get("/{attachment_id}/entities")
async def get_extracted_entities(
    attachment_id: str,
    entity_type: Optional[str] = None,
    min_confidence: float = 0.7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get extracted entities from a processed document"""
    query = db.query(DocumentEntity)\
        .filter(DocumentEntity.attachment_id == attachment_id)\
        .filter(DocumentEntity.confidence >= min_confidence)

    if entity_type:
        query = query.filter(DocumentEntity.entity_type == entity_type)

    entities = query.all()
    return {"entities": [e.to_dict() for e in entities]}

@router.post("/{attachment_id}/include-in-context")
async def include_in_rag_context(
    attachment_id: str,
    context_options: ContextInclusionOptions,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Include processed document in RAG context for a conversation.

    This adds the document's extracted text and entities to the
    conversation's context window for improved AI responses.
    """
    attachment = await get_attachment_or_404(attachment_id, current_user, db)

    # Get processing results
    job = db.query(FileProcessingJob)\
        .filter(FileProcessingJob.attachment_id == attachment_id)\
        .filter(FileProcessingJob.status == 'completed')\
        .first()

    if not job:
        raise HTTPException(
            status_code=400,
            detail="File has not been processed yet"
        )

    # Add to conversation context
    await context_service.add_document_context(
        conversation_id=context_options.conversation_id,
        document_text=job.output_data.get('extracted_text'),
        entities=job.output_data.get('entities'),
        embeddings=job.output_data.get('embeddings')
    )

    return {"message": "Document added to conversation context"}
```

#### A.1.2 Improvements & Optimizations

1. **Parallel Processing Pipeline:**
   - Use Celery or Redis Queue for distributed processing
   - Process multiple pages concurrently
   - Implement job prioritization based on file size

2. **Intelligent OCR Selection:**
   - Detect image-only vs text PDFs automatically
   - Use different OCR engines based on document type
   - Implement language detection for multi-language OCR

3. **Caching Layer:**
   - Cache extracted text for repeated access
   - Store embeddings in vector DB for semantic search
   - Implement content-based deduplication

4. **Medical Entity Enhancement:**
   - Integrate scispaCy for medical NER
   - Map entities to standard ontologies (RxNorm, ICD-10, SNOMED)
   - Build entity relationship graphs

5. **Resource Management:**
   - Implement memory-efficient streaming for large files
   - Add file size limits with graceful degradation
   - Monitor and limit CPU/memory per job

#### A.1.3 Testing Strategy

```python
# tests/unit/test_file_processing.py

import pytest
from unittest.mock import Mock, patch, AsyncMock
from app.services.file_processing_service import (
    PDFProcessor, ImageProcessor, FileProcessingOrchestrator, ProcessingResult
)

class TestPDFProcessor:
    @pytest.fixture
    def processor(self):
        return PDFProcessor()

    def test_supports_pdf_mime_types(self, processor):
        assert processor.supports_type('application/pdf') is True
        assert processor.supports_type('application/x-pdf') is True
        assert processor.supports_type('image/png') is False

    @pytest.mark.asyncio
    async def test_extract_text_from_text_pdf(self, processor, sample_text_pdf):
        """Test text extraction from a PDF with embedded text"""
        result = await processor.process(sample_text_pdf, {})

        assert result.success is True
        assert result.extracted_text is not None
        assert len(result.extracted_text) > 100
        assert result.metadata['extraction_method'] == 'text'

    @pytest.mark.asyncio
    async def test_ocr_fallback_for_scanned_pdf(self, processor, sample_scanned_pdf):
        """Test OCR fallback for scanned documents"""
        result = await processor.process(sample_scanned_pdf, {})

        assert result.success is True
        assert result.extracted_text is not None
        assert result.metadata['extraction_method'] == 'ocr'

    @pytest.mark.asyncio
    async def test_handles_corrupted_pdf(self, processor, corrupted_pdf):
        """Test graceful handling of corrupted files"""
        result = await processor.process(corrupted_pdf, {})

        assert result.success is False
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_processing_time_recorded(self, processor, sample_text_pdf):
        result = await processor.process(sample_text_pdf, {})

        assert result.processing_time_ms > 0
        assert result.processing_time_ms < 60000  # Should complete within 60s

class TestImageProcessor:
    @pytest.fixture
    def processor(self):
        return ImageProcessor()

    @pytest.mark.parametrize("mime_type,expected", [
        ('image/png', True),
        ('image/jpeg', True),
        ('image/tiff', True),
        ('application/pdf', False),
        ('text/plain', False),
    ])
    def test_supports_image_types(self, processor, mime_type, expected):
        assert processor.supports_type(mime_type) == expected

    @pytest.mark.asyncio
    async def test_extract_text_from_image(self, processor, sample_text_image):
        """Test OCR on an image with text"""
        result = await processor.process(sample_text_image, {})

        assert result.success is True
        assert result.metadata['width'] > 0
        assert result.metadata['height'] > 0

class TestFileProcessingOrchestrator:
    @pytest.fixture
    def orchestrator(self):
        return FileProcessingOrchestrator()

    def test_selects_correct_processor(self, orchestrator):
        pdf_processor = orchestrator.get_processor('application/pdf')
        assert isinstance(pdf_processor, PDFProcessor)

        image_processor = orchestrator.get_processor('image/png')
        assert isinstance(image_processor, ImageProcessor)

    def test_returns_none_for_unsupported_type(self, orchestrator):
        processor = orchestrator.get_processor('application/unknown')
        assert processor is None

    @pytest.mark.asyncio
    async def test_process_unsupported_type(self, orchestrator):
        result = await orchestrator.process_file(
            '/path/to/file',
            'application/unknown'
        )

        assert result.success is False
        assert 'unsupported' in result.error.lower()

# Integration tests
class TestFileProcessingIntegration:
    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_end_to_end_pdf_processing(
        self,
        test_client,
        authenticated_user,
        sample_pdf_upload
    ):
        """Test complete file processing workflow"""
        # Upload file
        upload_response = await test_client.post(
            f"/api/messages/{sample_message_id}/attachments",
            files={"file": sample_pdf_upload},
            headers=authenticated_user.headers
        )
        attachment_id = upload_response.json()['id']

        # Trigger processing
        process_response = await test_client.post(
            f"/api/files/{attachment_id}/process",
            json={"extract_text": True, "extract_entities": True},
            headers=authenticated_user.headers
        )
        job_id = process_response.json()['job_id']

        # Wait for completion
        await wait_for_job_completion(job_id, timeout=60)

        # Verify results
        status_response = await test_client.get(
            f"/api/files/{attachment_id}/processing-status",
            headers=authenticated_user.headers
        )

        jobs = status_response.json()['jobs']
        assert len(jobs) > 0
        assert jobs[0]['status'] == 'completed'

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_parallel_file_processing(
        self,
        test_client,
        authenticated_user
    ):
        """Test processing multiple files concurrently"""
        attachment_ids = await upload_multiple_files(5)

        # Trigger all processing jobs
        tasks = [
            test_client.post(
                f"/api/files/{aid}/process",
                json={"extract_text": True},
                headers=authenticated_user.headers
            )
            for aid in attachment_ids
        ]

        responses = await asyncio.gather(*tasks)
        job_ids = [r.json()['job_id'] for r in responses]

        # Wait for all to complete
        await asyncio.gather(*[
            wait_for_job_completion(jid, timeout=120)
            for jid in job_ids
        ])

        # Verify all completed successfully
        for aid in attachment_ids:
            status = await test_client.get(
                f"/api/files/{aid}/processing-status",
                headers=authenticated_user.headers
            )
            assert status.json()['jobs'][0]['status'] == 'completed'

# Load tests
class TestFileProcessingLoad:
    @pytest.mark.load
    @pytest.mark.asyncio
    async def test_concurrent_processing_limit(self):
        """Test system behavior at processing capacity"""
        # Simulate 50 concurrent file processing requests
        pass

    @pytest.mark.load
    @pytest.mark.asyncio
    async def test_large_file_processing(self):
        """Test processing of large files (50MB+)"""
        pass
```

---

### A.2 Conversation Sharing & Collaboration

**Original Scope:** Not implemented
**Enhanced Scope:** Full sharing with permissions, expiration, and collaboration features

#### A.2.1 Implementation Details

**Database Schema:**

```sql
-- Conversation sharing
CREATE TABLE conversation_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    share_token VARCHAR(64) UNIQUE NOT NULL,  -- Secure random token
    share_type VARCHAR(50) NOT NULL,  -- 'public_link', 'user_share', 'team_share'
    permission_level VARCHAR(50) NOT NULL DEFAULT 'view',  -- 'view', 'comment', 'edit'
    expires_at TIMESTAMP WITH TIME ZONE,
    max_views INTEGER,
    current_views INTEGER DEFAULT 0,
    password_hash VARCHAR(255),  -- Optional password protection
    require_authentication BOOLEAN DEFAULT FALSE,
    allow_download BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Share recipients (for user/team shares)
CREATE TABLE share_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES conversation_shares(id) ON DELETE CASCADE,
    recipient_type VARCHAR(50) NOT NULL,  -- 'user', 'team', 'email'
    recipient_id VARCHAR(255) NOT NULL,  -- user_id, team_id, or email
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Share access logs (audit trail)
CREATE TABLE share_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES conversation_shares(id) ON DELETE CASCADE,
    accessor_id UUID REFERENCES users(id),  -- NULL for anonymous
    accessor_ip VARCHAR(45),
    accessor_user_agent TEXT,
    access_type VARCHAR(50) NOT NULL,  -- 'view', 'download', 'comment'
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation comments (for collaboration)
CREATE TABLE conversation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,  -- Optional: comment on specific message
    user_id UUID NOT NULL REFERENCES users(id),
    parent_comment_id UUID REFERENCES conversation_comments(id),  -- For threaded comments
    content TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shares_token ON conversation_shares(share_token);
CREATE INDEX idx_shares_conversation ON conversation_shares(conversation_id);
CREATE INDEX idx_share_recipients_share ON share_recipients(share_id);
CREATE INDEX idx_share_access_logs_share ON share_access_logs(share_id);
CREATE INDEX idx_comments_conversation ON conversation_comments(conversation_id);
CREATE INDEX idx_comments_message ON conversation_comments(message_id);
```

**API Endpoints:**

```python
# services/api-gateway/app/api/sharing.py

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional, List
import secrets

router = APIRouter(prefix="/api/sharing", tags=["sharing"])

@router.post("/conversations/{conversation_id}/share")
async def create_share_link(
    conversation_id: str,
    share_options: ShareOptions,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a shareable link for a conversation.

    Options:
    - share_type: 'public_link' | 'user_share' | 'team_share'
    - permission_level: 'view' | 'comment' | 'edit'
    - expires_at: Optional expiration datetime
    - max_views: Optional maximum number of views
    - password: Optional password protection
    - require_authentication: Require login to view
    - recipients: List of user IDs or emails (for user_share)
    """
    # Verify ownership
    conversation = await verify_conversation_ownership(
        conversation_id, current_user, db
    )

    # Generate secure token
    share_token = secrets.token_urlsafe(32)

    # Create share record
    share = ConversationShare(
        conversation_id=conversation_id,
        created_by=current_user.id,
        share_token=share_token,
        share_type=share_options.share_type,
        permission_level=share_options.permission_level,
        expires_at=share_options.expires_at,
        max_views=share_options.max_views,
        password_hash=hash_password(share_options.password) if share_options.password else None,
        require_authentication=share_options.require_authentication,
        allow_download=share_options.allow_download
    )
    db.add(share)

    # Add recipients for user/team shares
    if share_options.recipients:
        for recipient in share_options.recipients:
            db.add(ShareRecipient(
                share_id=share.id,
                recipient_type=recipient.type,
                recipient_id=recipient.id
            ))

            # Send notification email
            await send_share_notification(recipient, conversation, share)

    db.commit()

    return {
        "share_id": str(share.id),
        "share_token": share_token,
        "share_url": f"{settings.BASE_URL}/shared/{share_token}",
        "expires_at": share_options.expires_at,
        "settings": share.to_dict()
    }

@router.get("/shared/{share_token}")
async def access_shared_conversation(
    share_token: str,
    request: Request,
    password: Optional[str] = None,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    Access a shared conversation via share token.

    - Validates share is active and not expired
    - Checks password if required
    - Logs access for audit trail
    - Returns conversation content based on permission level
    """
    share = db.query(ConversationShare)\
        .filter(ConversationShare.share_token == share_token)\
        .filter(ConversationShare.is_active == True)\
        .first()

    if not share:
        raise HTTPException(status_code=404, detail="Share not found or expired")

    # Check expiration
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link has expired")

    # Check max views
    if share.max_views and share.current_views >= share.max_views:
        raise HTTPException(status_code=410, detail="Maximum views exceeded")

    # Check authentication requirement
    if share.require_authentication and not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required to view this conversation"
        )

    # Check password
    if share.password_hash:
        if not password or not verify_password(password, share.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")

    # Log access
    access_log = ShareAccessLog(
        share_id=share.id,
        accessor_id=current_user.id if current_user else None,
        accessor_ip=request.client.host,
        accessor_user_agent=request.headers.get('user-agent'),
        access_type='view'
    )
    db.add(access_log)

    # Increment view counter
    share.current_views += 1
    db.commit()

    # Fetch conversation with messages
    conversation = await get_conversation_for_share(
        share.conversation_id,
        share.permission_level,
        db
    )

    return {
        "conversation": conversation,
        "permission_level": share.permission_level,
        "allow_download": share.allow_download,
        "can_comment": share.permission_level in ['comment', 'edit']
    }

@router.put("/shares/{share_id}")
async def update_share_settings(
    share_id: str,
    updates: ShareUpdateOptions,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update share settings (permission level, expiration, etc.)"""
    share = await get_share_or_404(share_id, current_user, db)

    for field, value in updates.dict(exclude_unset=True).items():
        if field == 'password':
            share.password_hash = hash_password(value) if value else None
        else:
            setattr(share, field, value)

    share.updated_at = datetime.utcnow()
    db.commit()

    return share.to_dict()

@router.delete("/shares/{share_id}")
async def revoke_share(
    share_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke a share link"""
    share = await get_share_or_404(share_id, current_user, db)
    share.is_active = False
    share.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Share revoked successfully"}

@router.get("/conversations/{conversation_id}/shares")
async def list_conversation_shares(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all shares for a conversation"""
    await verify_conversation_ownership(conversation_id, current_user, db)

    shares = db.query(ConversationShare)\
        .filter(ConversationShare.conversation_id == conversation_id)\
        .order_by(ConversationShare.created_at.desc())\
        .all()

    return {"shares": [s.to_dict() for s in shares]}

@router.get("/shares/{share_id}/access-logs")
async def get_share_access_logs(
    share_id: str,
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get access logs for a share (audit trail)"""
    share = await get_share_or_404(share_id, current_user, db)

    logs = db.query(ShareAccessLog)\
        .filter(ShareAccessLog.share_id == share_id)\
        .order_by(ShareAccessLog.accessed_at.desc())\
        .offset((page - 1) * page_size)\
        .limit(page_size)\
        .all()

    total = db.query(ShareAccessLog)\
        .filter(ShareAccessLog.share_id == share_id)\
        .count()

    return {
        "logs": [log.to_dict() for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size
    }

# Collaboration endpoints
@router.post("/conversations/{conversation_id}/comments")
async def add_comment(
    conversation_id: str,
    comment: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to a conversation or specific message"""
    # Verify access (owner or shared with edit/comment permission)
    await verify_comment_access(conversation_id, current_user, db)

    new_comment = ConversationComment(
        conversation_id=conversation_id,
        message_id=comment.message_id,
        user_id=current_user.id,
        parent_comment_id=comment.parent_comment_id,
        content=comment.content
    )
    db.add(new_comment)
    db.commit()

    # Notify conversation owner and other commenters
    await notify_comment_participants(conversation_id, new_comment, current_user)

    return new_comment.to_dict()

@router.get("/conversations/{conversation_id}/comments")
async def list_comments(
    conversation_id: str,
    message_id: Optional[str] = None,
    include_resolved: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List comments for a conversation"""
    await verify_comment_access(conversation_id, current_user, db)

    query = db.query(ConversationComment)\
        .filter(ConversationComment.conversation_id == conversation_id)

    if message_id:
        query = query.filter(ConversationComment.message_id == message_id)

    if not include_resolved:
        query = query.filter(ConversationComment.is_resolved == False)

    comments = query.order_by(ConversationComment.created_at.asc()).all()

    return {"comments": [c.to_dict() for c in comments]}
```

#### A.2.2 Improvements & Optimizations

1. **Security Enhancements:**
   - Rate limiting on share access attempts
   - IP-based access restrictions option
   - Automatic share expiration for inactive links
   - Watermarking for downloaded exports

2. **Performance Optimizations:**
   - Cache shared conversation data
   - Lazy load messages for long conversations
   - Compress response payloads
   - CDN for static assets in shared views

3. **Collaboration Features:**
   - Real-time collaboration via WebSocket
   - @mentions in comments
   - Comment threading with infinite depth
   - Comment resolution workflow

4. **Analytics:**
   - View count and engagement metrics
   - Geographic access distribution
   - Time-based access patterns
   - Referrer tracking

---

## Feature Category B: Collaboration Features

_(Covered in A.2 above - Conversation Sharing)_

---

## Feature Category C: Voice Pipeline Completion

**Timeline:** 3-4 weeks
**Priority:** HIGH

### C.1 Full Voice Pipeline with OpenAI Realtime API

**Original Scope:** Basic text-based streaming
**Enhanced Scope:** Complete voice assistant with VAD, WebRTC, barge-in, voice authentication, and Realtime API

**Features Included:**

- OpenAI Realtime API integration
- WebRTC audio streaming
- Voice Activity Detection (VAD)
- Echo cancellation and noise suppression
- Barge-in support for natural conversation
- Voice authentication

#### C.1.1 Implementation Details

**Database Schema:**

```sql
-- Voice session tracking
CREATE TABLE voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'initializing',  -- initializing, connected, speaking, listening, processing, ended
    voice_config JSONB,  -- voice settings, language, etc.
    metrics JSONB,  -- latency, audio quality metrics
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    total_duration_ms INTEGER,
    audio_bytes_sent BIGINT DEFAULT 0,
    audio_bytes_received BIGINT DEFAULT 0
);

-- Voice transcripts
CREATE TABLE voice_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id),
    transcript_type VARCHAR(50) NOT NULL,  -- 'user_speech', 'assistant_speech'
    content TEXT NOT NULL,
    confidence DECIMAL(3,2),
    language_detected VARCHAR(10),
    audio_duration_ms INTEGER,
    timestamps JSONB,  -- word-level timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice quality metrics
CREATE TABLE voice_quality_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,  -- 'latency', 'jitter', 'packet_loss', 'audio_level'
    metric_value DECIMAL(10,4),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_voice_sessions_conversation ON voice_sessions(conversation_id);
CREATE INDEX idx_voice_sessions_user ON voice_sessions(user_id);
CREATE INDEX idx_voice_transcripts_session ON voice_transcripts(voice_session_id);
CREATE INDEX idx_voice_metrics_session ON voice_quality_metrics(voice_session_id);
```

**WebSocket Voice Handler:**

```python
# services/api-gateway/app/api/voice_realtime.py

from fastapi import WebSocket, WebSocketDisconnect, Depends
import asyncio
import json
from typing import Optional
from dataclasses import dataclass
from enum import Enum

class VoiceSessionState(Enum):
    INITIALIZING = "initializing"
    CONNECTED = "connected"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    ENDED = "ended"

@dataclass
class VoiceConfig:
    voice_id: str = "alloy"
    language: str = "en"
    speech_rate: float = 1.0
    enable_vad: bool = True
    vad_threshold: float = 0.5
    enable_barge_in: bool = True
    audio_format: str = "pcm16"
    sample_rate: int = 24000

class VoiceSessionManager:
    """Manages WebRTC/WebSocket voice sessions with OpenAI Realtime API"""

    def __init__(self):
        self.active_sessions: dict[str, 'VoiceSession'] = {}
        self.openai_client = OpenAIRealtimeClient()

    async def create_session(
        self,
        websocket: WebSocket,
        user: User,
        conversation_id: str,
        config: VoiceConfig
    ) -> 'VoiceSession':
        session = VoiceSession(
            websocket=websocket,
            user=user,
            conversation_id=conversation_id,
            config=config,
            openai_client=self.openai_client
        )
        self.active_sessions[session.id] = session
        return session

    async def end_session(self, session_id: str):
        if session_id in self.active_sessions:
            session = self.active_sessions[session_id]
            await session.cleanup()
            del self.active_sessions[session_id]

class VoiceSession:
    """Individual voice session handling"""

    def __init__(
        self,
        websocket: WebSocket,
        user: User,
        conversation_id: str,
        config: VoiceConfig,
        openai_client: 'OpenAIRealtimeClient'
    ):
        self.id = str(uuid.uuid4())
        self.websocket = websocket
        self.user = user
        self.conversation_id = conversation_id
        self.config = config
        self.openai_client = openai_client
        self.state = VoiceSessionState.INITIALIZING
        self.openai_ws: Optional[WebSocket] = None
        self.vad = VoiceActivityDetector(config.vad_threshold)
        self.audio_buffer = AudioBuffer()
        self.metrics = VoiceMetrics()

    async def start(self):
        """Initialize voice session and connect to OpenAI Realtime"""
        try:
            # Connect to OpenAI Realtime API
            self.openai_ws = await self.openai_client.connect(
                model="gpt-4o-realtime-preview",
                voice=self.config.voice_id,
                language=self.config.language
            )

            # Configure session
            await self.openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": self._build_system_instructions(),
                    "voice": self.config.voice_id,
                    "input_audio_format": self.config.audio_format,
                    "output_audio_format": self.config.audio_format,
                    "input_audio_transcription": {
                        "model": "whisper-1"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": self.config.vad_threshold,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500
                    }
                }
            }))

            self.state = VoiceSessionState.CONNECTED

            # Start bidirectional streaming
            await asyncio.gather(
                self._handle_client_audio(),
                self._handle_openai_responses()
            )

        except Exception as e:
            await self._handle_error(e)

    async def _handle_client_audio(self):
        """Process incoming audio from client"""
        try:
            while self.state != VoiceSessionState.ENDED:
                try:
                    data = await asyncio.wait_for(
                        self.websocket.receive(),
                        timeout=30.0
                    )

                    if "bytes" in data:
                        audio_data = data["bytes"]

                        # Track metrics
                        self.metrics.bytes_received += len(audio_data)

                        # VAD processing (if client-side VAD disabled)
                        if not self.config.enable_vad:
                            is_speech = self.vad.process(audio_data)
                            if not is_speech:
                                continue

                        # Handle barge-in
                        if self.state == VoiceSessionState.SPEAKING and self.config.enable_barge_in:
                            if self.vad.process(audio_data):
                                await self._interrupt_response()

                        # Forward to OpenAI
                        await self.openai_ws.send(json.dumps({
                            "type": "input_audio_buffer.append",
                            "audio": base64.b64encode(audio_data).decode()
                        }))

                    elif "text" in data:
                        message = json.loads(data["text"])
                        await self._handle_client_message(message)

                except asyncio.TimeoutError:
                    # Send keepalive
                    await self.websocket.send_json({"type": "ping"})

        except WebSocketDisconnect:
            self.state = VoiceSessionState.ENDED

    async def _handle_openai_responses(self):
        """Process responses from OpenAI Realtime API"""
        try:
            async for message in self.openai_ws:
                data = json.loads(message)
                event_type = data.get("type")

                if event_type == "response.audio.delta":
                    # Stream audio to client
                    audio_data = base64.b64decode(data["delta"])
                    await self.websocket.send_bytes(audio_data)
                    self.state = VoiceSessionState.SPEAKING
                    self.metrics.bytes_sent += len(audio_data)

                elif event_type == "response.audio.done":
                    self.state = VoiceSessionState.LISTENING
                    await self.websocket.send_json({
                        "type": "audio_complete",
                        "response_id": data.get("response_id")
                    })

                elif event_type == "conversation.item.input_audio_transcription.completed":
                    # User speech transcribed
                    await self._save_transcript(
                        "user_speech",
                        data.get("transcript"),
                        data.get("confidence")
                    )
                    await self.websocket.send_json({
                        "type": "user_transcript",
                        "text": data.get("transcript")
                    })

                elif event_type == "response.text.delta":
                    # Streaming text response
                    await self.websocket.send_json({
                        "type": "text_delta",
                        "delta": data.get("delta")
                    })

                elif event_type == "error":
                    await self._handle_openai_error(data)

        except Exception as e:
            await self._handle_error(e)

    async def _interrupt_response(self):
        """Handle barge-in - interrupt current response"""
        await self.openai_ws.send(json.dumps({
            "type": "response.cancel"
        }))
        await self.websocket.send_json({
            "type": "response_interrupted"
        })
        self.state = VoiceSessionState.LISTENING

    def _build_system_instructions(self) -> str:
        """Build system instructions for the voice assistant"""
        return """You are a helpful medical AI assistant.
        Speak naturally and conversationally.
        Keep responses concise and focused.
        Ask clarifying questions when needed.
        Always cite sources when providing medical information.
        If unsure, recommend consulting a healthcare provider."""

    async def cleanup(self):
        """Cleanup session resources"""
        self.state = VoiceSessionState.ENDED
        if self.openai_ws:
            await self.openai_ws.close()

        # Save session metrics to database
        await self._save_session_metrics()

class VoiceActivityDetector:
    """Voice Activity Detection using WebRTC VAD or similar"""

    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        # Initialize VAD model (e.g., silero-vad, webrtcvad)
        import webrtcvad
        self.vad = webrtcvad.Vad()
        self.vad.set_mode(2)  # Moderate aggressiveness

    def process(self, audio_data: bytes) -> bool:
        """Check if audio contains speech"""
        try:
            # WebRTC VAD expects 10, 20, or 30ms frames at 8/16/32/48 kHz
            frame_duration = 30  # ms
            sample_rate = 16000
            frame_length = int(sample_rate * frame_duration / 1000) * 2  # 16-bit

            # Process frames
            speech_frames = 0
            total_frames = 0

            for i in range(0, len(audio_data) - frame_length, frame_length):
                frame = audio_data[i:i + frame_length]
                if len(frame) == frame_length:
                    is_speech = self.vad.is_speech(frame, sample_rate)
                    if is_speech:
                        speech_frames += 1
                    total_frames += 1

            if total_frames == 0:
                return False

            return (speech_frames / total_frames) >= self.threshold

        except Exception:
            return True  # Assume speech on error

class OpenAIRealtimeClient:
    """Client for OpenAI Realtime API"""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.base_url = "wss://api.openai.com/v1/realtime"

    async def connect(
        self,
        model: str = "gpt-4o-realtime-preview",
        **kwargs
    ):
        """Establish WebSocket connection to OpenAI Realtime API"""
        import websockets

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }

        ws = await websockets.connect(
            f"{self.base_url}?model={model}",
            extra_headers=headers,
            ping_interval=30,
            ping_timeout=10
        )

        return ws

# FastAPI WebSocket endpoint
@router.websocket("/api/voice/realtime")
async def voice_realtime_websocket(
    websocket: WebSocket,
    token: str,
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time voice interactions.

    Protocol:
    - Client sends audio as binary WebSocket messages
    - Server sends audio responses as binary messages
    - JSON messages for control and metadata
    """
    # Authenticate
    user = await authenticate_websocket(token, db)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    # Parse voice config from query params or initial message
    config = VoiceConfig()

    session_manager = VoiceSessionManager()
    session = await session_manager.create_session(
        websocket=websocket,
        user=user,
        conversation_id=conversation_id,
        config=config
    )

    try:
        await session.start()
    finally:
        await session_manager.end_session(session.id)
```

#### C.1.2 Improvements & Optimizations

1. **Latency Optimization:**
   - Implement audio streaming with chunked transfer
   - Use Opus codec for lower bandwidth
   - Pre-warm WebSocket connections
   - Edge deployment for regional latency reduction

2. **Quality Enhancements:**
   - Echo cancellation using WebRTC AEC
   - Noise suppression using RNNoise
   - Automatic gain control
   - Audio level normalization

3. **Reliability:**
   - Automatic reconnection with state preservation
   - Graceful degradation to text mode
   - Audio buffer management for network jitter
   - Connection quality monitoring

4. **Advanced Features:**
   - Multi-language support with auto-detection
   - Custom wake words
   - Speaker diarization for multi-user scenarios
   - Emotion detection in voice

#### C.1.3 Testing Strategy

```python
# tests/integration/test_voice_realtime.py

import pytest
import asyncio
import websockets
import json
import base64
from pathlib import Path

class TestVoiceRealtimeAPI:
    @pytest.fixture
    def sample_audio_file(self):
        return Path("tests/fixtures/sample_speech.wav")

    @pytest.fixture
    async def voice_websocket(self, test_server, auth_token):
        async with websockets.connect(
            f"ws://{test_server}/api/voice/realtime?token={auth_token}&conversation_id=test-conv-1"
        ) as ws:
            yield ws

    @pytest.mark.asyncio
    async def test_voice_session_connection(self, voice_websocket):
        """Test WebSocket connection establishment"""
        # Should receive session confirmation
        response = await asyncio.wait_for(
            voice_websocket.recv(),
            timeout=5.0
        )
        data = json.loads(response)
        assert data["type"] == "session.created"
        assert "session_id" in data

    @pytest.mark.asyncio
    async def test_audio_streaming(self, voice_websocket, sample_audio_file):
        """Test sending audio and receiving response"""
        # Wait for session ready
        await voice_websocket.recv()

        # Send audio chunks
        audio_data = sample_audio_file.read_bytes()
        chunk_size = 4096

        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            await voice_websocket.send(chunk)
            await asyncio.sleep(0.02)  # Simulate real-time

        # Wait for transcription
        transcript = None
        timeout = 10.0
        start = asyncio.get_event_loop().time()

        while asyncio.get_event_loop().time() - start < timeout:
            response = await voice_websocket.recv()
            if isinstance(response, str):
                data = json.loads(response)
                if data.get("type") == "user_transcript":
                    transcript = data.get("text")
                    break

        assert transcript is not None
        assert len(transcript) > 0

    @pytest.mark.asyncio
    async def test_barge_in(self, voice_websocket, sample_audio_file):
        """Test interrupting assistant speech"""
        await voice_websocket.recv()  # Session ready

        # Trigger a response (text input for simplicity)
        await voice_websocket.send(json.dumps({
            "type": "text_input",
            "text": "Tell me a long story about medicine"
        }))

        # Wait for response to start
        await asyncio.sleep(1)

        # Send interrupt audio (simulating user speaking)
        audio_chunk = sample_audio_file.read_bytes()[:8192]
        await voice_websocket.send(audio_chunk)

        # Should receive interruption event
        found_interrupt = False
        timeout = 5.0
        start = asyncio.get_event_loop().time()

        while asyncio.get_event_loop().time() - start < timeout:
            response = await voice_websocket.recv()
            if isinstance(response, str):
                data = json.loads(response)
                if data.get("type") == "response_interrupted":
                    found_interrupt = True
                    break

        assert found_interrupt

    @pytest.mark.asyncio
    async def test_session_metrics(self, voice_websocket, db_session):
        """Test that session metrics are recorded"""
        # Get session ID from connection
        response = await voice_websocket.recv()
        session_id = json.loads(response)["session_id"]

        # Send some audio
        await voice_websocket.send(b"\x00" * 4096)
        await asyncio.sleep(1)

        # Close connection
        await voice_websocket.close()
        await asyncio.sleep(0.5)

        # Verify metrics in database
        session = db_session.query(VoiceSession)\
            .filter(VoiceSession.id == session_id)\
            .first()

        assert session is not None
        assert session.audio_bytes_received > 0
        assert session.ended_at is not None

class TestVoiceActivityDetection:
    @pytest.fixture
    def vad(self):
        return VoiceActivityDetector(threshold=0.5)

    def test_detects_speech(self, vad, speech_audio_sample):
        """Test VAD correctly identifies speech"""
        result = vad.process(speech_audio_sample)
        assert result is True

    def test_detects_silence(self, vad, silence_audio_sample):
        """Test VAD correctly identifies silence"""
        result = vad.process(silence_audio_sample)
        assert result is False

    def test_handles_noise(self, vad, noise_audio_sample):
        """Test VAD handles background noise"""
        result = vad.process(noise_audio_sample)
        # Should not trigger on pure noise
        assert result is False

# Performance tests
class TestVoicePerformance:
    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_audio_latency(self, voice_websocket, sample_audio_file):
        """Test end-to-end latency for audio processing"""
        import time

        await voice_websocket.recv()  # Session ready

        audio_chunk = sample_audio_file.read_bytes()[:4096]

        start_time = time.time()
        await voice_websocket.send(audio_chunk)

        # Wait for first response
        response = await voice_websocket.recv()
        end_time = time.time()

        latency_ms = (end_time - start_time) * 1000

        # Latency should be under 500ms for good UX
        assert latency_ms < 500, f"Latency too high: {latency_ms}ms"

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_concurrent_voice_sessions(self, test_server, auth_token):
        """Test multiple concurrent voice sessions"""
        num_sessions = 20

        async def create_session():
            async with websockets.connect(
                f"ws://{test_server}/api/voice/realtime?token={auth_token}&conversation_id=test"
            ) as ws:
                response = await ws.recv()
                return json.loads(response).get("session_id")

        # Create concurrent sessions
        tasks = [create_session() for _ in range(num_sessions)]
        session_ids = await asyncio.gather(*tasks)

        # All should succeed
        assert len(session_ids) == num_sessions
        assert all(sid is not None for sid in session_ids)
```

### C.2 Voice Authentication

**Purpose:** Verify user identity using voice biometrics as an additional authentication factor

#### C.2.1 Implementation Details

```python
# services/api-gateway/app/services/voice_auth_service.py

from typing import Optional, Tuple
import numpy as np
from dataclasses import dataclass

@dataclass
class VoicePrint:
    """User voice biometric data"""
    user_id: str
    embedding: np.ndarray
    created_at: datetime
    quality_score: float
    sample_count: int

class VoiceAuthService:
    """Voice biometric authentication service"""

    def __init__(self):
        # Using speaker verification model (e.g., speechbrain, resemblyzer)
        from resemblyzer import VoiceEncoder
        self.encoder = VoiceEncoder()
        self.similarity_threshold = 0.85
        self.min_audio_duration = 3.0  # seconds

    async def enroll_voice(
        self,
        user_id: str,
        audio_samples: list[bytes],
        db: Session
    ) -> VoicePrint:
        """
        Enroll user's voice for authentication.
        Requires multiple samples for better accuracy.
        """
        if len(audio_samples) < 3:
            raise ValueError("At least 3 audio samples required for enrollment")

        embeddings = []
        for audio in audio_samples:
            # Validate audio quality
            quality = self._assess_audio_quality(audio)
            if quality < 0.7:
                continue

            # Generate voice embedding
            embedding = await self._generate_embedding(audio)
            embeddings.append(embedding)

        if len(embeddings) < 3:
            raise ValueError("Insufficient quality audio samples")

        # Average embeddings for robustness
        avg_embedding = np.mean(embeddings, axis=0)
        avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)

        # Store voice print
        voice_print = UserVoicePrint(
            user_id=user_id,
            embedding=avg_embedding.tobytes(),
            quality_score=np.mean([self._assess_audio_quality(a) for a in audio_samples]),
            sample_count=len(embeddings)
        )
        db.add(voice_print)
        db.commit()

        return VoicePrint(
            user_id=user_id,
            embedding=avg_embedding,
            created_at=voice_print.created_at,
            quality_score=voice_print.quality_score,
            sample_count=len(embeddings)
        )

    async def verify_voice(
        self,
        user_id: str,
        audio: bytes,
        db: Session
    ) -> Tuple[bool, float]:
        """
        Verify if audio matches user's enrolled voice.
        Returns (is_match, confidence_score)
        """
        # Get stored voice print
        stored = db.query(UserVoicePrint).filter(
            UserVoicePrint.user_id == user_id
        ).first()

        if not stored:
            return False, 0.0

        # Check audio quality
        quality = self._assess_audio_quality(audio)
        if quality < 0.5:
            return False, 0.0

        # Generate embedding for verification audio
        verify_embedding = await self._generate_embedding(audio)

        # Compare with stored embedding
        stored_embedding = np.frombuffer(stored.embedding, dtype=np.float32)
        similarity = self._cosine_similarity(verify_embedding, stored_embedding)

        is_match = similarity >= self.similarity_threshold

        # Log verification attempt
        db.add(VoiceAuthLog(
            user_id=user_id,
            success=is_match,
            similarity_score=similarity,
            audio_quality=quality
        ))
        db.commit()

        return is_match, float(similarity)

    async def _generate_embedding(self, audio: bytes) -> np.ndarray:
        """Generate voice embedding from audio"""
        import soundfile as sf
        from io import BytesIO

        # Convert bytes to numpy array
        audio_buffer = BytesIO(audio)
        waveform, sample_rate = sf.read(audio_buffer)

        # Resample if needed
        if sample_rate != 16000:
            import librosa
            waveform = librosa.resample(waveform, orig_sr=sample_rate, target_sr=16000)

        # Generate embedding
        embedding = self.encoder.embed_utterance(waveform)
        return embedding

    def _assess_audio_quality(self, audio: bytes) -> float:
        """Assess audio quality for voice authentication"""
        import soundfile as sf
        from io import BytesIO

        audio_buffer = BytesIO(audio)
        waveform, sample_rate = sf.read(audio_buffer)

        # Check duration
        duration = len(waveform) / sample_rate
        if duration < self.min_audio_duration:
            return 0.0

        # Check signal-to-noise ratio (simplified)
        signal_power = np.mean(waveform ** 2)
        noise_floor = np.percentile(np.abs(waveform), 10)
        snr = 10 * np.log10(signal_power / (noise_floor ** 2 + 1e-10))

        # Normalize to 0-1 range
        quality = min(1.0, max(0.0, snr / 30))
        return quality

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity between two embeddings"""
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# API Endpoints
@router.post("/api/voice-auth/enroll")
async def enroll_voice_auth(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Enroll voice for authentication.
    Requires at least 3 audio samples of user speaking.
    """
    if len(files) < 3:
        raise HTTPException(
            status_code=400,
            detail="At least 3 audio samples required"
        )

    audio_samples = [await f.read() for f in files]

    voice_auth = VoiceAuthService()
    voice_print = await voice_auth.enroll_voice(
        user_id=str(current_user.id),
        audio_samples=audio_samples,
        db=db
    )

    return {
        "message": "Voice authentication enrolled successfully",
        "quality_score": voice_print.quality_score,
        "sample_count": voice_print.sample_count
    }

@router.post("/api/voice-auth/verify")
async def verify_voice_auth(
    file: UploadFile = File(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Verify voice for authentication"""
    audio = await file.read()

    voice_auth = VoiceAuthService()
    is_match, confidence = await voice_auth.verify_voice(
        user_id=user_id,
        audio=audio,
        db=db
    )

    return {
        "verified": is_match,
        "confidence": confidence,
        "threshold": voice_auth.similarity_threshold
    }
```

#### C.2.2 Testing for Voice Authentication

```python
class TestVoiceAuthentication:
    @pytest.mark.asyncio
    async def test_voice_enrollment(self, voice_auth_service, audio_samples):
        """Test voice enrollment with multiple samples"""
        voice_print = await voice_auth_service.enroll_voice(
            user_id="test-user",
            audio_samples=audio_samples,
            db=mock_db
        )

        assert voice_print.sample_count >= 3
        assert voice_print.quality_score > 0.7

    @pytest.mark.asyncio
    async def test_voice_verification_success(self, voice_auth_service, enrolled_user):
        """Test successful voice verification"""
        is_match, confidence = await voice_auth_service.verify_voice(
            user_id=enrolled_user.id,
            audio=enrolled_user.verification_sample,
            db=mock_db
        )

        assert is_match is True
        assert confidence >= 0.85

    @pytest.mark.asyncio
    async def test_voice_verification_failure(self, voice_auth_service, enrolled_user, different_user_audio):
        """Test voice verification with different user"""
        is_match, confidence = await voice_auth_service.verify_voice(
            user_id=enrolled_user.id,
            audio=different_user_audio,
            db=mock_db
        )

        assert is_match is False
        assert confidence < 0.85

    @pytest.mark.asyncio
    async def test_low_quality_audio_rejection(self, voice_auth_service, noisy_audio):
        """Test rejection of low quality audio"""
        is_match, confidence = await voice_auth_service.verify_voice(
            user_id="test-user",
            audio=noisy_audio,
            db=mock_db
        )

        assert confidence == 0.0
```

---

## Feature Category D: Advanced Medical AI

**Timeline:** 4-5 weeks
**Priority:** HIGH

### D.1 BioGPT/PubMedBERT Integration

**Purpose:** Medical-specific embeddings and language models for improved accuracy

#### D.1.1 Implementation Details

```python
# services/api-gateway/app/services/medical_ai_service.py

from typing import List, Optional, Dict, Any
from transformers import AutoTokenizer, AutoModel
import torch

class MedicalEmbeddingService:
    """Medical-specific embeddings using BioGPT and PubMedBERT"""

    def __init__(self):
        self.models = {}
        self._load_models()

    def _load_models(self):
        """Load medical language models"""
        # PubMedBERT for medical embeddings
        self.models['pubmedbert'] = {
            'tokenizer': AutoTokenizer.from_pretrained(
                "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext"
            ),
            'model': AutoModel.from_pretrained(
                "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext"
            )
        }

        # BioGPT for medical text generation
        from transformers import BioGptTokenizer, BioGptForCausalLM
        self.models['biogpt'] = {
            'tokenizer': BioGptTokenizer.from_pretrained("microsoft/biogpt"),
            'model': BioGptForCausalLM.from_pretrained("microsoft/biogpt")
        }

        # SciBERT for scientific text
        self.models['scibert'] = {
            'tokenizer': AutoTokenizer.from_pretrained("allenai/scibert_scivocab_uncased"),
            'model': AutoModel.from_pretrained("allenai/scibert_scivocab_uncased")
        }

    async def generate_medical_embedding(
        self,
        text: str,
        model_type: str = "pubmedbert"
    ) -> List[float]:
        """Generate embeddings using medical language model"""
        if model_type not in self.models:
            raise ValueError(f"Unknown model type: {model_type}")

        model_config = self.models[model_type]
        tokenizer = model_config['tokenizer']
        model = model_config['model']

        # Tokenize and encode
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )

        with torch.no_grad():
            outputs = model(**inputs)

        # Use [CLS] token embedding or mean pooling
        embedding = outputs.last_hidden_state[:, 0, :].squeeze().numpy()

        return embedding.tolist()

    async def generate_medical_text(
        self,
        prompt: str,
        max_length: int = 200,
        temperature: float = 0.7
    ) -> str:
        """Generate medical text using BioGPT"""
        tokenizer = self.models['biogpt']['tokenizer']
        model = self.models['biogpt']['model']

        inputs = tokenizer(prompt, return_tensors="pt")

        outputs = model.generate(
            **inputs,
            max_length=max_length,
            temperature=temperature,
            do_sample=True,
            top_p=0.9
        )

        generated = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return generated

class MedicalNERService:
    """Medical Named Entity Recognition"""

    def __init__(self):
        import spacy
        # Load scispacy models
        self.nlp = spacy.load("en_core_sci_lg")

        # Add entity linker for medical ontologies
        from scispacy.linking import EntityLinker
        self.nlp.add_pipe(
            "scispacy_linker",
            config={
                "resolve_abbreviations": True,
                "linker_name": "umls"  # Links to UMLS concepts
            }
        )

    async def extract_entities(self, text: str) -> List[Dict[str, Any]]:
        """Extract medical entities from text"""
        doc = self.nlp(text)

        entities = []
        for ent in doc.ents:
            entity_data = {
                "text": ent.text,
                "label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char,
                "kb_ids": []
            }

            # Add knowledge base links
            if hasattr(ent._, 'kb_ents') and ent._.kb_ents:
                for kb_ent in ent._.kb_ents:
                    entity_data["kb_ids"].append({
                        "cui": kb_ent[0],  # UMLS CUI
                        "score": kb_ent[1]
                    })

            entities.append(entity_data)

        return entities

    async def normalize_entities(
        self,
        entities: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Normalize entities to standard medical ontologies"""
        normalized = []

        for entity in entities:
            norm_entity = entity.copy()

            # Map to standard codes
            if entity.get("kb_ids"):
                cui = entity["kb_ids"][0]["cui"]

                # Look up ICD-10, RxNorm, SNOMED mappings
                mappings = await self._get_ontology_mappings(cui)
                norm_entity["mappings"] = mappings

            normalized.append(norm_entity)

        return normalized

    async def _get_ontology_mappings(self, cui: str) -> Dict[str, str]:
        """Get ontology mappings for a UMLS CUI"""
        # Query UMLS API or local cache for mappings
        # Returns: {"icd10": "I10", "snomed": "38341003", "rxnorm": "..."}
        return {}

# API Endpoints
@router.post("/api/medical-ai/embed")
async def generate_medical_embedding(
    request: EmbeddingRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate medical-specific embeddings"""
    service = MedicalEmbeddingService()
    embedding = await service.generate_medical_embedding(
        text=request.text,
        model_type=request.model_type or "pubmedbert"
    )

    return {"embedding": embedding, "model": request.model_type}

@router.post("/api/medical-ai/extract-entities")
async def extract_medical_entities(
    request: TextRequest,
    current_user: User = Depends(get_current_user)
):
    """Extract medical entities from text"""
    ner_service = MedicalNERService()
    entities = await ner_service.extract_entities(request.text)
    normalized = await ner_service.normalize_entities(entities)

    return {"entities": normalized}
```

### D.2 Domain-Specific Language Models

```python
# services/api-gateway/app/services/domain_llm_service.py

class DomainLLMService:
    """Specialized LLM routing for different medical domains"""

    DOMAIN_PROMPTS = {
        "cardiology": """You are a specialized cardiology AI assistant.
        Focus on cardiovascular conditions, treatments, and diagnostics.
        Reference ACC/AHA guidelines when applicable.""",

        "oncology": """You are a specialized oncology AI assistant.
        Focus on cancer diagnosis, staging, and treatment protocols.
        Reference NCCN guidelines when applicable.""",

        "neurology": """You are a specialized neurology AI assistant.
        Focus on neurological conditions and treatments.
        Reference AAN guidelines when applicable.""",

        "general": """You are a general medical AI assistant.
        Provide comprehensive medical information with appropriate citations."""
    }

    def __init__(self):
        self.embedding_service = MedicalEmbeddingService()
        self.domain_classifier = self._load_domain_classifier()

    async def detect_domain(self, query: str) -> str:
        """Classify query into medical domain"""
        embedding = await self.embedding_service.generate_medical_embedding(query)

        # Use classifier to determine domain
        domain = self.domain_classifier.predict([embedding])[0]
        return domain

    async def get_domain_response(
        self,
        query: str,
        context: Optional[str] = None,
        domain: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate response using domain-specific prompt"""
        if not domain:
            domain = await self.detect_domain(query)

        system_prompt = self.DOMAIN_PROMPTS.get(domain, self.DOMAIN_PROMPTS["general"])

        # Call LLM with domain-specific prompt
        response = await self.llm.generate(
            system_prompt=system_prompt,
            user_message=query,
            context=context
        )

        return {
            "response": response,
            "domain": domain,
            "confidence": await self._get_confidence(query, response)
        }

    def _load_domain_classifier(self):
        """Load domain classification model"""
        from sklearn.ensemble import RandomForestClassifier
        import joblib

        # Load pre-trained classifier
        return joblib.load("models/domain_classifier.joblib")
```

---

## Feature Category E: External Medical Integrations

**Timeline:** 6-8 weeks
**Priority:** HIGH

### E.1 UpToDate API Integration

**Purpose:** Real-time clinical decision support, drug interactions, diagnostic algorithms

```python
# services/api-gateway/app/services/uptodate_service.py

import httpx
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

@dataclass
class UpToDateResult:
    """UpToDate search result"""
    topic_id: str
    title: str
    summary: str
    url: str
    last_updated: str
    grade_of_evidence: Optional[str]

class UpToDateService:
    """Integration with UpToDate clinical decision support"""

    def __init__(self):
        self.api_key = settings.UPTODATE_API_KEY
        self.base_url = "https://api.uptodate.com/v1"
        self.rate_limiter = RateLimiter(requests_per_minute=60)

    async def search(
        self,
        query: str,
        specialty: Optional[str] = None,
        max_results: int = 10
    ) -> List[UpToDateResult]:
        """Search UpToDate knowledge base"""
        await self.rate_limiter.acquire()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/search",
                params={
                    "query": query,
                    "specialty": specialty,
                    "limit": max_results
                },
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()

            results = []
            for item in response.json().get("results", []):
                results.append(UpToDateResult(
                    topic_id=item["topicId"],
                    title=item["title"],
                    summary=item.get("summary", ""),
                    url=item["url"],
                    last_updated=item.get("lastUpdated"),
                    grade_of_evidence=item.get("gradeOfEvidence")
                ))

            return results

    async def get_drug_interactions(
        self,
        drugs: List[str]
    ) -> List[Dict[str, Any]]:
        """Check drug-drug interactions"""
        await self.rate_limiter.acquire()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/drug-interactions",
                json={"drugs": drugs},
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()

            return response.json().get("interactions", [])

    async def get_diagnostic_calculator(
        self,
        calculator_name: str,
        inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Run a clinical diagnostic calculator"""
        await self.rate_limiter.acquire()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/calculators/{calculator_name}",
                json=inputs,
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()

            return response.json()

# API Endpoints
@router.get("/api/uptodate/search")
async def search_uptodate(
    query: str,
    specialty: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Search UpToDate knowledge base"""
    service = UpToDateService()
    results = await service.search(query, specialty)
    return {"results": [r.__dict__ for r in results]}

@router.post("/api/uptodate/drug-interactions")
async def check_drug_interactions(
    request: DrugInteractionRequest,
    current_user: User = Depends(get_current_user)
):
    """Check for drug-drug interactions"""
    service = UpToDateService()
    interactions = await service.get_drug_interactions(request.drugs)
    return {"interactions": interactions}
```

### E.2 OpenEvidence API Integration

```python
# services/api-gateway/app/services/openevidence_service.py

class OpenEvidenceService:
    """Integration with OpenEvidence for evidence-based medicine"""

    def __init__(self):
        self.api_key = settings.OPENEVIDENCE_API_KEY
        self.base_url = "https://api.openevidence.com/v1"

    async def query(
        self,
        question: str,
        include_trials: bool = True,
        include_guidelines: bool = True
    ) -> Dict[str, Any]:
        """Query OpenEvidence for medical evidence"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/query",
                json={
                    "question": question,
                    "include_clinical_trials": include_trials,
                    "include_guidelines": include_guidelines
                },
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()

            data = response.json()
            return {
                "answer": data.get("answer"),
                "evidence_grade": data.get("evidenceGrade"),
                "sources": data.get("sources", []),
                "clinical_trials": data.get("clinicalTrials", []),
                "guidelines": data.get("guidelines", [])
            }

    async def get_systematic_reviews(
        self,
        topic: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get systematic reviews for a topic"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/systematic-reviews",
                params={"topic": topic, "limit": limit},
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()

            return response.json().get("reviews", [])
```

### E.3 PubMed Integration

```python
# services/api-gateway/app/services/pubmed_service.py

from Bio import Entrez
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class PubMedArticle:
    """PubMed article metadata"""
    pmid: str
    title: str
    authors: List[str]
    abstract: str
    journal: str
    publication_date: str
    doi: Optional[str]
    mesh_terms: List[str]
    citation_count: int

class PubMedService:
    """Integration with PubMed for literature search"""

    def __init__(self):
        Entrez.email = settings.PUBMED_EMAIL
        Entrez.api_key = settings.PUBMED_API_KEY

    async def search(
        self,
        query: str,
        max_results: int = 20,
        sort: str = "relevance",
        date_range: Optional[tuple] = None
    ) -> List[PubMedArticle]:
        """Search PubMed literature"""
        import asyncio

        loop = asyncio.get_event_loop()

        def _search():
            # Build search query
            search_query = query
            if date_range:
                search_query += f" AND {date_range[0]}:{date_range[1]}[dp]"

            # Search PubMed
            handle = Entrez.esearch(
                db="pubmed",
                term=search_query,
                retmax=max_results,
                sort=sort
            )
            results = Entrez.read(handle)
            handle.close()

            pmids = results.get("IdList", [])
            if not pmids:
                return []

            # Fetch article details
            handle = Entrez.efetch(
                db="pubmed",
                id=",".join(pmids),
                rettype="xml",
                retmode="xml"
            )
            records = Entrez.read(handle)
            handle.close()

            articles = []
            for record in records.get("PubmedArticle", []):
                article = self._parse_article(record)
                if article:
                    articles.append(article)

            return articles

        return await loop.run_in_executor(None, _search)

    def _parse_article(self, record: Dict) -> Optional[PubMedArticle]:
        """Parse PubMed XML record into article object"""
        try:
            medline = record.get("MedlineCitation", {})
            article_data = medline.get("Article", {})

            # Extract authors
            authors = []
            for author in article_data.get("AuthorList", []):
                if "LastName" in author and "ForeName" in author:
                    authors.append(f"{author['LastName']} {author['ForeName']}")

            # Extract MeSH terms
            mesh_terms = []
            for mesh in medline.get("MeshHeadingList", []):
                mesh_terms.append(mesh.get("DescriptorName", {}).get("#text", ""))

            return PubMedArticle(
                pmid=str(medline.get("PMID")),
                title=article_data.get("ArticleTitle", ""),
                authors=authors,
                abstract=article_data.get("Abstract", {}).get("AbstractText", [""])[0],
                journal=article_data.get("Journal", {}).get("Title", ""),
                publication_date=self._extract_date(article_data),
                doi=self._extract_doi(record),
                mesh_terms=mesh_terms,
                citation_count=0  # Would require additional API call
            )
        except Exception:
            return None

    async def get_citations(self, pmid: str) -> List[str]:
        """Get articles that cite this article"""
        import asyncio
        loop = asyncio.get_event_loop()

        def _get_citations():
            handle = Entrez.elink(
                dbfrom="pubmed",
                db="pubmed",
                id=pmid,
                linkname="pubmed_pubmed_citedin"
            )
            results = Entrez.read(handle)
            handle.close()

            citing_ids = []
            for linkset in results:
                for link in linkset.get("LinkSetDb", []):
                    for item in link.get("Link", []):
                        citing_ids.append(item.get("Id"))

            return citing_ids

        return await loop.run_in_executor(None, _get_citations)

    async def format_citation(
        self,
        pmid: str,
        style: str = "AMA"
    ) -> str:
        """Generate formatted citation"""
        articles = await self.search(f"{pmid}[uid]", max_results=1)
        if not articles:
            return ""

        article = articles[0]

        if style == "AMA":
            # AMA style citation
            authors_str = ", ".join(article.authors[:3])
            if len(article.authors) > 3:
                authors_str += ", et al"

            return f"{authors_str}. {article.title}. {article.journal}. {article.publication_date}."

        return ""

# API Endpoints
@router.get("/api/pubmed/search")
async def search_pubmed(
    query: str,
    max_results: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Search PubMed literature"""
    service = PubMedService()
    articles = await service.search(query, max_results)
    return {"articles": [a.__dict__ for a in articles]}

@router.get("/api/pubmed/{pmid}/citations")
async def get_pubmed_citations(
    pmid: str,
    current_user: User = Depends(get_current_user)
):
    """Get articles citing a specific article"""
    service = PubMedService()
    citing_ids = await service.get_citations(pmid)
    return {"citing_pmids": citing_ids, "count": len(citing_ids)}
```

### E.4 Medical Calculators Library

```python
# services/api-gateway/app/services/medical_calculators.py

from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

class RiskLevel(Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"

@dataclass
class CalculatorResult:
    """Result from a medical calculator"""
    calculator_name: str
    score: float
    risk_level: RiskLevel
    interpretation: str
    recommendations: list[str]
    inputs_used: Dict[str, Any]
    references: list[str]

class MedicalCalculatorService:
    """Library of clinical scoring tools"""

    async def wells_dvt(
        self,
        active_cancer: bool = False,
        paralysis: bool = False,
        bedridden: bool = False,
        tenderness: bool = False,
        leg_swelling: bool = False,
        calf_swelling: bool = False,
        pitting_edema: bool = False,
        collateral_veins: bool = False,
        previous_dvt: bool = False,
        alternative_diagnosis: bool = False
    ) -> CalculatorResult:
        """Wells Score for DVT probability"""
        score = 0

        if active_cancer:
            score += 1
        if paralysis or bedridden:
            score += 1
        if bedridden:
            score += 1
        if tenderness:
            score += 1
        if leg_swelling:
            score += 1
        if calf_swelling:
            score += 1
        if pitting_edema:
            score += 1
        if collateral_veins:
            score += 1
        if previous_dvt:
            score += 1
        if alternative_diagnosis:
            score -= 2

        if score <= 0:
            risk = RiskLevel.LOW
            interpretation = "Low probability of DVT (3%)"
            recommendations = [
                "Consider D-dimer testing",
                "If D-dimer negative, DVT is unlikely"
            ]
        elif score <= 2:
            risk = RiskLevel.MODERATE
            interpretation = "Moderate probability of DVT (17%)"
            recommendations = [
                "Perform D-dimer testing",
                "If positive, proceed to ultrasound"
            ]
        else:
            risk = RiskLevel.HIGH
            interpretation = "High probability of DVT (75%)"
            recommendations = [
                "Proceed directly to venous ultrasound",
                "Consider empiric anticoagulation"
            ]

        return CalculatorResult(
            calculator_name="Wells Score for DVT",
            score=score,
            risk_level=risk,
            interpretation=interpretation,
            recommendations=recommendations,
            inputs_used={
                "active_cancer": active_cancer,
                "paralysis": paralysis,
                "bedridden": bedridden,
                "tenderness": tenderness,
                "leg_swelling": leg_swelling,
                "calf_swelling": calf_swelling,
                "pitting_edema": pitting_edema,
                "collateral_veins": collateral_veins,
                "previous_dvt": previous_dvt,
                "alternative_diagnosis": alternative_diagnosis
            },
            references=[
                "Wells PS, et al. Lancet. 1997;350(9094):1795-1798.",
                "Wells PS, et al. JAMA. 2006;295(2):199-207."
            ]
        )

    async def cha2ds2_vasc(
        self,
        age: int,
        sex: str,
        chf: bool = False,
        hypertension: bool = False,
        stroke_tia: bool = False,
        vascular_disease: bool = False,
        diabetes: bool = False
    ) -> CalculatorResult:
        """CHA2DS2-VASc Score for AFib stroke risk"""
        score = 0

        if chf:
            score += 1
        if hypertension:
            score += 1
        if age >= 75:
            score += 2
        elif age >= 65:
            score += 1
        if diabetes:
            score += 1
        if stroke_tia:
            score += 2
        if vascular_disease:
            score += 1
        if sex.lower() == "female":
            score += 1

        # Annual stroke risk
        risk_map = {
            0: (0.2, RiskLevel.LOW),
            1: (0.6, RiskLevel.LOW),
            2: (2.2, RiskLevel.MODERATE),
            3: (3.2, RiskLevel.MODERATE),
            4: (4.8, RiskLevel.HIGH),
            5: (7.2, RiskLevel.HIGH),
            6: (9.7, RiskLevel.VERY_HIGH),
            7: (11.2, RiskLevel.VERY_HIGH),
            8: (10.8, RiskLevel.VERY_HIGH),
            9: (12.2, RiskLevel.VERY_HIGH)
        }

        annual_risk, risk_level = risk_map.get(min(score, 9), (12.2, RiskLevel.VERY_HIGH))

        if score == 0:
            recommendations = ["No anticoagulation recommended"]
        elif score == 1 and sex.lower() == "female":
            recommendations = ["Low risk, consider no anticoagulation"]
        else:
            recommendations = [
                "Oral anticoagulation recommended",
                "Consider DOACs over warfarin if no contraindication",
                "Assess bleeding risk with HAS-BLED"
            ]

        return CalculatorResult(
            calculator_name="CHA2DS2-VASc Score",
            score=score,
            risk_level=risk_level,
            interpretation=f"Annual stroke risk: {annual_risk}%",
            recommendations=recommendations,
            inputs_used={
                "age": age,
                "sex": sex,
                "chf": chf,
                "hypertension": hypertension,
                "stroke_tia": stroke_tia,
                "vascular_disease": vascular_disease,
                "diabetes": diabetes
            },
            references=[
                "Lip GY, et al. Chest. 2010;137(2):263-272."
            ]
        )

    async def gfr_ckd_epi(
        self,
        creatinine: float,
        age: int,
        sex: str,
        race: Optional[str] = None
    ) -> CalculatorResult:
        """eGFR calculation using CKD-EPI equation (2021, race-free)"""
        import math

        # CKD-EPI 2021 equation (race-free)
        if sex.lower() == "female":
            if creatinine <= 0.7:
                gfr = 142 * pow(creatinine / 0.7, -0.241) * pow(0.9938, age) * 1.012
            else:
                gfr = 142 * pow(creatinine / 0.7, -1.2) * pow(0.9938, age) * 1.012
        else:
            if creatinine <= 0.9:
                gfr = 142 * pow(creatinine / 0.9, -0.302) * pow(0.9938, age)
            else:
                gfr = 142 * pow(creatinine / 0.9, -1.2) * pow(0.9938, age)

        gfr = round(gfr, 1)

        # CKD staging
        if gfr >= 90:
            stage = "G1"
            risk = RiskLevel.LOW
            interpretation = "Normal or high GFR"
        elif gfr >= 60:
            stage = "G2"
            risk = RiskLevel.LOW
            interpretation = "Mildly decreased GFR"
        elif gfr >= 45:
            stage = "G3a"
            risk = RiskLevel.MODERATE
            interpretation = "Mildly to moderately decreased GFR"
        elif gfr >= 30:
            stage = "G3b"
            risk = RiskLevel.MODERATE
            interpretation = "Moderately to severely decreased GFR"
        elif gfr >= 15:
            stage = "G4"
            risk = RiskLevel.HIGH
            interpretation = "Severely decreased GFR"
        else:
            stage = "G5"
            risk = RiskLevel.VERY_HIGH
            interpretation = "Kidney failure"

        recommendations = []
        if gfr < 60:
            recommendations.append("Monitor kidney function regularly")
            recommendations.append("Review medications for renal dosing")
        if gfr < 30:
            recommendations.append("Nephrology referral recommended")
            recommendations.append("Prepare for renal replacement therapy if progressing")

        return CalculatorResult(
            calculator_name="eGFR (CKD-EPI 2021)",
            score=gfr,
            risk_level=risk,
            interpretation=f"CKD Stage {stage}: {interpretation}",
            recommendations=recommendations,
            inputs_used={
                "creatinine": creatinine,
                "age": age,
                "sex": sex
            },
            references=[
                "Inker LA, et al. N Engl J Med. 2021;385(19):1737-1749."
            ]
        )

    # Add more calculators: MELD, CURB-65, APACHE II, etc.

# API Endpoints
@router.post("/api/calculators/{calculator_name}")
async def run_calculator(
    calculator_name: str,
    inputs: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Run a medical calculator"""
    service = MedicalCalculatorService()

    calculator_method = getattr(service, calculator_name, None)
    if not calculator_method:
        raise HTTPException(
            status_code=404,
            detail=f"Calculator '{calculator_name}' not found"
        )

    result = await calculator_method(**inputs)
    return result.__dict__

@router.get("/api/calculators")
async def list_calculators(
    current_user: User = Depends(get_current_user)
):
    """List available medical calculators"""
    return {
        "calculators": [
            {
                "name": "wells_dvt",
                "description": "Wells Score for DVT probability",
                "category": "Hematology"
            },
            {
                "name": "cha2ds2_vasc",
                "description": "CHA2DS2-VASc for AFib stroke risk",
                "category": "Cardiology"
            },
            {
                "name": "gfr_ckd_epi",
                "description": "eGFR using CKD-EPI 2021 equation",
                "category": "Nephrology"
            }
            # Add more calculators
        ]
    }
```

---

## Feature Category F: Authentication & Security

**Timeline:** 4-5 weeks
**Priority:** HIGH

### F.1 OIDC/SSO Authentication

**Original Scope:** JWT-only authentication
**Enhanced Scope:** Full OIDC with multiple providers, MFA, and session management

**Features Included:**

- OIDC Single Sign-On with Nextcloud
- Google and Microsoft OAuth support
- Multi-factor authentication (MFA/TOTP)
- Backup codes generation

#### F.1.1 Implementation Details

```python
# services/api-gateway/app/core/oidc.py

from authlib.integrations.starlette_client import OAuth
from starlette.config import Config

class OIDCProvider:
    """OIDC Provider configuration"""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.client_id = config['client_id']
        self.client_secret = config['client_secret']
        self.authorization_endpoint = config['authorization_endpoint']
        self.token_endpoint = config['token_endpoint']
        self.userinfo_endpoint = config['userinfo_endpoint']
        self.jwks_uri = config['jwks_uri']
        self.scopes = config.get('scopes', ['openid', 'email', 'profile'])

class OIDCManager:
    """Manages OIDC authentication flows"""

    def __init__(self):
        self.oauth = OAuth()
        self.providers: dict[str, OIDCProvider] = {}
        self._setup_providers()

    def _setup_providers(self):
        """Configure OIDC providers"""
        # Nextcloud
        if settings.NEXTCLOUD_OIDC_ENABLED:
            self.register_provider('nextcloud', {
                'client_id': settings.NEXTCLOUD_CLIENT_ID,
                'client_secret': settings.NEXTCLOUD_CLIENT_SECRET,
                'authorization_endpoint': f'{settings.NEXTCLOUD_URL}/apps/oauth2/authorize',
                'token_endpoint': f'{settings.NEXTCLOUD_URL}/apps/oauth2/api/v1/token',
                'userinfo_endpoint': f'{settings.NEXTCLOUD_URL}/ocs/v2.php/cloud/user',
                'jwks_uri': f'{settings.NEXTCLOUD_URL}/apps/oauth2/jwks',
            })

        # Google
        if settings.GOOGLE_OAUTH_ENABLED:
            self.register_provider('google', {
                'client_id': settings.GOOGLE_CLIENT_ID,
                'client_secret': settings.GOOGLE_CLIENT_SECRET,
                'authorization_endpoint': 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_endpoint': 'https://oauth2.googleapis.com/token',
                'userinfo_endpoint': 'https://openidconnect.googleapis.com/v1/userinfo',
                'jwks_uri': 'https://www.googleapis.com/oauth2/v3/certs',
            })

        # Microsoft
        if settings.MICROSOFT_OAUTH_ENABLED:
            tenant = settings.MICROSOFT_TENANT_ID
            self.register_provider('microsoft', {
                'client_id': settings.MICROSOFT_CLIENT_ID,
                'client_secret': settings.MICROSOFT_CLIENT_SECRET,
                'authorization_endpoint': f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
                'token_endpoint': f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
                'userinfo_endpoint': 'https://graph.microsoft.com/oidc/userinfo',
                'jwks_uri': f'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys',
            })

    def register_provider(self, name: str, config: dict):
        provider = OIDCProvider(name, config)
        self.providers[name] = provider

        self.oauth.register(
            name=name,
            client_id=provider.client_id,
            client_secret=provider.client_secret,
            authorize_url=provider.authorization_endpoint,
            access_token_url=provider.token_endpoint,
            userinfo_endpoint=provider.userinfo_endpoint,
            jwks_uri=provider.jwks_uri,
            client_kwargs={'scope': ' '.join(provider.scopes)}
        )

    async def get_authorization_url(
        self,
        provider_name: str,
        redirect_uri: str,
        state: str,
        nonce: str
    ) -> str:
        """Generate authorization URL for OIDC flow"""
        provider = self.oauth.create_client(provider_name)
        return await provider.create_authorization_url(
            redirect_uri,
            state=state,
            nonce=nonce
        )

    async def handle_callback(
        self,
        provider_name: str,
        request,
        db: Session
    ) -> User:
        """Handle OIDC callback and create/update user"""
        provider = self.oauth.create_client(provider_name)

        # Exchange code for tokens
        token = await provider.authorize_access_token(request)

        # Get user info
        userinfo = await provider.userinfo(token=token)

        # Find or create user
        user = db.query(User).filter(
            User.email == userinfo['email']
        ).first()

        if not user:
            user = User(
                email=userinfo['email'],
                full_name=userinfo.get('name'),
                avatar_url=userinfo.get('picture'),
                is_active=True,
                email_verified=userinfo.get('email_verified', False)
            )
            db.add(user)

        # Update OIDC link
        oidc_link = db.query(UserOIDCLink).filter(
            UserOIDCLink.user_id == user.id,
            UserOIDCLink.provider == provider_name
        ).first()

        if not oidc_link:
            oidc_link = UserOIDCLink(
                user_id=user.id,
                provider=provider_name,
                provider_user_id=userinfo['sub']
            )
            db.add(oidc_link)

        oidc_link.last_login = datetime.utcnow()
        oidc_link.access_token = token['access_token']
        oidc_link.refresh_token = token.get('refresh_token')
        oidc_link.token_expires_at = datetime.utcnow() + timedelta(
            seconds=token.get('expires_in', 3600)
        )

        db.commit()
        return user

# API Endpoints
@router.get("/auth/providers")
async def list_auth_providers():
    """List available authentication providers"""
    oidc_manager = OIDCManager()
    return {
        "providers": [
            {
                "name": name,
                "login_url": f"/api/auth/login/{name}"
            }
            for name in oidc_manager.providers.keys()
        ]
    }

@router.get("/auth/login/{provider}")
async def initiate_oidc_login(
    provider: str,
    request: Request,
    redirect_uri: Optional[str] = None
):
    """Initiate OIDC login flow"""
    oidc_manager = OIDCManager()

    if provider not in oidc_manager.providers:
        raise HTTPException(status_code=400, detail="Unknown provider")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)

    # Store in session/cache
    await cache.set(f"oidc_state:{state}", {
        "nonce": nonce,
        "redirect_uri": redirect_uri or settings.DEFAULT_REDIRECT_URI
    }, ttl=600)

    auth_url = await oidc_manager.get_authorization_url(
        provider,
        redirect_uri=f"{settings.BASE_URL}/api/auth/callback/{provider}",
        state=state,
        nonce=nonce
    )

    return RedirectResponse(auth_url)

@router.get("/auth/callback/{provider}")
async def oidc_callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Handle OIDC callback"""
    state = request.query_params.get('state')

    # Verify state
    state_data = await cache.get(f"oidc_state:{state}")
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid state")

    await cache.delete(f"oidc_state:{state}")

    oidc_manager = OIDCManager()
    user = await oidc_manager.handle_callback(provider, request, db)

    # Generate JWT tokens
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    # Redirect to frontend with tokens
    redirect_uri = state_data['redirect_uri']
    return RedirectResponse(
        f"{redirect_uri}?access_token={access_token}&refresh_token={refresh_token}"
    )
```

#### F.1.2 MFA Implementation

```python
# services/api-gateway/app/core/mfa.py

import pyotp
import qrcode
from io import BytesIO
import base64

class MFAManager:
    """Multi-Factor Authentication Manager"""

    def __init__(self):
        self.issuer = "VoiceAssist"

    def generate_totp_secret(self) -> str:
        """Generate a new TOTP secret"""
        return pyotp.random_base32()

    def get_totp_uri(self, user_email: str, secret: str) -> str:
        """Generate TOTP URI for QR code"""
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(
            name=user_email,
            issuer_name=self.issuer
        )

    def generate_qr_code(self, uri: str) -> str:
        """Generate QR code image as base64"""
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(uri)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format='PNG')

        return base64.b64encode(buffer.getvalue()).decode()

    def verify_totp(self, secret: str, code: str) -> bool:
        """Verify TOTP code"""
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)

    def generate_backup_codes(self, count: int = 10) -> list[str]:
        """Generate backup codes"""
        return [secrets.token_hex(4).upper() for _ in range(count)]

# API Endpoints
@router.post("/auth/mfa/setup")
async def setup_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Initialize MFA setup"""
    mfa_manager = MFAManager()

    secret = mfa_manager.generate_totp_secret()
    uri = mfa_manager.get_totp_uri(current_user.email, secret)
    qr_code = mfa_manager.generate_qr_code(uri)

    # Store pending secret (not activated until verified)
    current_user.mfa_secret_pending = secret
    db.commit()

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_code}",
        "manual_entry_key": secret
    }

@router.post("/auth/mfa/verify-setup")
async def verify_mfa_setup(
    verification: MFAVerification,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify and activate MFA"""
    mfa_manager = MFAManager()

    if not current_user.mfa_secret_pending:
        raise HTTPException(status_code=400, detail="MFA setup not initiated")

    if not mfa_manager.verify_totp(current_user.mfa_secret_pending, verification.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Activate MFA
    current_user.mfa_secret = current_user.mfa_secret_pending
    current_user.mfa_secret_pending = None
    current_user.mfa_enabled = True

    # Generate backup codes
    backup_codes = mfa_manager.generate_backup_codes()
    current_user.mfa_backup_codes = [hash_code(code) for code in backup_codes]

    db.commit()

    return {
        "message": "MFA enabled successfully",
        "backup_codes": backup_codes  # Show once, never again
    }

@router.post("/auth/mfa/verify")
async def verify_mfa(
    verification: MFAVerification,
    token: str,  # Temporary token from initial login
    db: Session = Depends(get_db)
):
    """Verify MFA code during login"""
    # Decode temporary token
    payload = decode_mfa_pending_token(token)
    user = db.query(User).get(payload['user_id'])

    if not user or not user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Invalid request")

    mfa_manager = MFAManager()

    # Try TOTP first
    if mfa_manager.verify_totp(user.mfa_secret, verification.code):
        access_token = create_access_token({"sub": str(user.id)})
        refresh_token = create_refresh_token({"sub": str(user.id)})
        return {"access_token": access_token, "refresh_token": refresh_token}

    # Try backup codes
    for i, hashed_code in enumerate(user.mfa_backup_codes or []):
        if verify_code_hash(verification.code, hashed_code):
            # Remove used backup code
            user.mfa_backup_codes.pop(i)
            db.commit()

            access_token = create_access_token({"sub": str(user.id)})
            refresh_token = create_refresh_token({"sub": str(user.id)})
            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "warning": "Backup code used. Consider generating new codes."
            }

    raise HTTPException(status_code=401, detail="Invalid MFA code")
```

---

## Feature Category G: Nextcloud Integration Completion

**Timeline:** 4-5 weeks
**Priority:** HIGH

**Features Included:**

- OIDC Single Sign-On with Nextcloud
- Complete email integration (IMAP/SMTP)
- CardDAV contacts synchronization
- Nextcloud app store packaging
- Google Calendar sync

### G.1 Complete Email Integration

**Original Scope:** Email skeleton only
**Enhanced Scope:** Full IMAP/SMTP support with AI-powered email processing

```python
# services/api-gateway/app/services/email_service.py

import imaplib
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.parser import BytesParser
from email.policy import default
from typing import List, Optional
import asyncio

class EmailService:
    """Complete email integration service"""

    def __init__(self, user_email_config: dict):
        self.imap_host = user_email_config['imap_host']
        self.imap_port = user_email_config.get('imap_port', 993)
        self.smtp_host = user_email_config['smtp_host']
        self.smtp_port = user_email_config.get('smtp_port', 587)
        self.username = user_email_config['username']
        self.password = user_email_config['password']  # Encrypted in DB

    async def fetch_emails(
        self,
        folder: str = "INBOX",
        limit: int = 50,
        since_date: Optional[datetime] = None,
        search_criteria: Optional[str] = None
    ) -> List[dict]:
        """Fetch emails from mailbox"""
        loop = asyncio.get_event_loop()

        def _fetch():
            with imaplib.IMAP4_SSL(self.imap_host, self.imap_port) as imap:
                imap.login(self.username, self.password)
                imap.select(folder)

                # Build search criteria
                criteria = []
                if since_date:
                    criteria.append(f'SINCE {since_date.strftime("%d-%b-%Y")}')
                if search_criteria:
                    criteria.append(search_criteria)

                search_string = ' '.join(criteria) if criteria else 'ALL'
                _, message_ids = imap.search(None, search_string)

                emails = []
                for msg_id in message_ids[0].split()[-limit:]:
                    _, msg_data = imap.fetch(msg_id, '(RFC822)')
                    email_body = msg_data[0][1]
                    message = BytesParser(policy=default).parsebytes(email_body)

                    emails.append({
                        'id': msg_id.decode(),
                        'subject': message['subject'],
                        'from': message['from'],
                        'to': message['to'],
                        'date': message['date'],
                        'body': self._get_email_body(message),
                        'attachments': self._get_attachments(message)
                    })

                return emails

        return await loop.run_in_executor(None, _fetch)

    async def send_email(
        self,
        to: List[str],
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        attachments: Optional[List[dict]] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """Send email via SMTP"""
        loop = asyncio.get_event_loop()

        def _send():
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.username
            msg['To'] = ', '.join(to)
            if cc:
                msg['Cc'] = ', '.join(cc)

            # Add text body
            msg.attach(MIMEText(body, 'plain'))

            # Add HTML body if provided
            if html_body:
                msg.attach(MIMEText(html_body, 'html'))

            # Add attachments
            if attachments:
                for attachment in attachments:
                    # Handle attachment
                    pass

            # Send
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as smtp:
                smtp.starttls()
                smtp.login(self.username, self.password)
                recipients = to + (cc or []) + (bcc or [])
                smtp.sendmail(self.username, recipients, msg.as_string())

            return True

        return await loop.run_in_executor(None, _send)

    async def summarize_email(self, email_content: dict) -> dict:
        """Use AI to summarize email content"""
        from app.services.llm_service import LLMService

        llm = LLMService()
        summary = await llm.generate(
            prompt=f"Summarize this email in 2-3 sentences:\n\n{email_content['body']}",
            max_tokens=150
        )

        # Extract action items
        actions = await llm.generate(
            prompt=f"Extract any action items or requests from this email:\n\n{email_content['body']}",
            max_tokens=200
        )

        return {
            'summary': summary,
            'action_items': actions,
            'priority': await self._classify_priority(email_content)
        }

    def _get_email_body(self, message) -> str:
        """Extract email body text"""
        if message.is_multipart():
            for part in message.walk():
                if part.get_content_type() == 'text/plain':
                    return part.get_payload(decode=True).decode()
        return message.get_payload(decode=True).decode()

    def _get_attachments(self, message) -> List[dict]:
        """Extract attachment metadata"""
        attachments = []
        if message.is_multipart():
            for part in message.walk():
                if part.get_content_disposition() == 'attachment':
                    attachments.append({
                        'filename': part.get_filename(),
                        'content_type': part.get_content_type(),
                        'size': len(part.get_payload(decode=True))
                    })
        return attachments

# API Endpoints
@router.get("/api/email/messages")
async def list_emails(
    folder: str = "INBOX",
    limit: int = 50,
    since: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List emails from connected mailbox"""
    email_config = await get_user_email_config(current_user, db)
    if not email_config:
        raise HTTPException(status_code=400, detail="Email not configured")

    email_service = EmailService(email_config)
    emails = await email_service.fetch_emails(folder, limit, since)

    return {"emails": emails}

@router.post("/api/email/send")
async def send_email(
    email_request: EmailSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send email"""
    email_config = await get_user_email_config(current_user, db)
    email_service = EmailService(email_config)

    success = await email_service.send_email(
        to=email_request.to,
        subject=email_request.subject,
        body=email_request.body,
        html_body=email_request.html_body,
        attachments=email_request.attachments
    )

    if success:
        return {"message": "Email sent successfully"}
    raise HTTPException(status_code=500, detail="Failed to send email")

@router.post("/api/email/{message_id}/summarize")
async def summarize_email_endpoint(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get AI summary of an email"""
    email_config = await get_user_email_config(current_user, db)
    email_service = EmailService(email_config)

    # Fetch specific email
    emails = await email_service.fetch_emails(search_criteria=f'UID {message_id}')
    if not emails:
        raise HTTPException(status_code=404, detail="Email not found")

    summary = await email_service.summarize_email(emails[0])
    return summary
```

### G.2 CardDAV Contacts Synchronization

```python
# services/api-gateway/app/services/carddav_service.py

from typing import List, Dict, Any, Optional
import vobject
import httpx

class CardDAVService:
    """CardDAV contacts synchronization service"""

    def __init__(self, config: dict):
        self.server_url = config['server_url']
        self.username = config['username']
        self.password = config['password']
        self.addressbook_url = f"{self.server_url}/remote.php/dav/addressbooks/users/{self.username}/contacts/"

    async def get_contacts(self) -> List[Dict[str, Any]]:
        """Fetch all contacts from CardDAV server"""
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method="PROPFIND",
                url=self.addressbook_url,
                auth=(self.username, self.password),
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml"
                },
                content='''<?xml version="1.0" encoding="UTF-8"?>
                    <d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
                        <d:prop>
                            <card:address-data />
                        </d:prop>
                    </d:propfind>'''
            )

            contacts = []
            # Parse response and extract vCards
            for vcard_data in self._parse_propfind_response(response.text):
                contact = self._parse_vcard(vcard_data)
                if contact:
                    contacts.append(contact)

            return contacts

    async def create_contact(self, contact: Dict[str, Any]) -> str:
        """Create a new contact"""
        vcard = self._create_vcard(contact)
        uid = contact.get('uid', str(uuid.uuid4()))

        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.addressbook_url}{uid}.vcf",
                auth=(self.username, self.password),
                headers={"Content-Type": "text/vcard; charset=utf-8"},
                content=vcard.serialize()
            )
            response.raise_for_status()

        return uid

    async def update_contact(self, uid: str, contact: Dict[str, Any]) -> bool:
        """Update an existing contact"""
        vcard = self._create_vcard(contact)

        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.addressbook_url}{uid}.vcf",
                auth=(self.username, self.password),
                headers={"Content-Type": "text/vcard; charset=utf-8"},
                content=vcard.serialize()
            )
            return response.status_code == 204

    async def delete_contact(self, uid: str) -> bool:
        """Delete a contact"""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.addressbook_url}{uid}.vcf",
                auth=(self.username, self.password)
            )
            return response.status_code == 204

    def _parse_vcard(self, vcard_text: str) -> Optional[Dict[str, Any]]:
        """Parse vCard text into contact dictionary"""
        try:
            vcard = vobject.readOne(vcard_text)

            contact = {
                'uid': str(vcard.uid.value) if hasattr(vcard, 'uid') else None,
                'full_name': str(vcard.fn.value) if hasattr(vcard, 'fn') else None,
                'emails': [],
                'phones': [],
                'organization': None,
                'title': None
            }

            if hasattr(vcard, 'email'):
                for email in vcard.email_list:
                    contact['emails'].append(str(email.value))

            if hasattr(vcard, 'tel'):
                for tel in vcard.tel_list:
                    contact['phones'].append(str(tel.value))

            if hasattr(vcard, 'org'):
                contact['organization'] = str(vcard.org.value[0])

            if hasattr(vcard, 'title'):
                contact['title'] = str(vcard.title.value)

            return contact
        except Exception:
            return None

    def _create_vcard(self, contact: Dict[str, Any]) -> vobject.vCard:
        """Create vCard from contact dictionary"""
        vcard = vobject.vCard()

        vcard.add('fn').value = contact.get('full_name', '')
        vcard.add('uid').value = contact.get('uid', str(uuid.uuid4()))

        if contact.get('emails'):
            for email in contact['emails']:
                vcard.add('email').value = email

        if contact.get('phones'):
            for phone in contact['phones']:
                vcard.add('tel').value = phone

        if contact.get('organization'):
            vcard.add('org').value = [contact['organization']]

        if contact.get('title'):
            vcard.add('title').value = contact['title']

        return vcard

# API Endpoints
@router.get("/api/carddav/contacts")
async def list_contacts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all contacts from CardDAV"""
    config = await get_user_carddav_config(current_user, db)
    service = CardDAVService(config)
    contacts = await service.get_contacts()
    return {"contacts": contacts}

@router.post("/api/carddav/contacts")
async def create_contact(
    contact: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new contact"""
    config = await get_user_carddav_config(current_user, db)
    service = CardDAVService(config)
    uid = await service.create_contact(contact.dict())
    return {"uid": uid, "message": "Contact created"}
```

### G.3 Google Calendar Sync

```python
# services/api-gateway/app/services/google_calendar_service.py

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

class GoogleCalendarService:
    """Google Calendar synchronization service"""

    SCOPES = ['https://www.googleapis.com/auth/calendar']

    def __init__(self, credentials: Credentials):
        self.service = build('calendar', 'v3', credentials=credentials)

    @classmethod
    async def get_authorization_url(cls, redirect_uri: str) -> tuple[str, str]:
        """Get OAuth authorization URL"""
        flow = Flow.from_client_secrets_file(
            settings.GOOGLE_CLIENT_SECRETS_FILE,
            scopes=cls.SCOPES,
            redirect_uri=redirect_uri
        )

        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true'
        )

        return authorization_url, state

    @classmethod
    async def exchange_code(cls, code: str, redirect_uri: str) -> Credentials:
        """Exchange authorization code for credentials"""
        flow = Flow.from_client_secrets_file(
            settings.GOOGLE_CLIENT_SECRETS_FILE,
            scopes=cls.SCOPES,
            redirect_uri=redirect_uri
        )

        flow.fetch_token(code=code)
        return flow.credentials

    async def list_calendars(self) -> List[Dict[str, Any]]:
        """List all calendars"""
        calendars = []
        page_token = None

        while True:
            calendar_list = self.service.calendarList().list(
                pageToken=page_token
            ).execute()

            for calendar in calendar_list.get('items', []):
                calendars.append({
                    'id': calendar['id'],
                    'summary': calendar['summary'],
                    'description': calendar.get('description'),
                    'primary': calendar.get('primary', False),
                    'accessRole': calendar.get('accessRole')
                })

            page_token = calendar_list.get('nextPageToken')
            if not page_token:
                break

        return calendars

    async def get_events(
        self,
        calendar_id: str = 'primary',
        time_min: Optional[datetime] = None,
        time_max: Optional[datetime] = None,
        max_results: int = 100
    ) -> List[Dict[str, Any]]:
        """Get events from calendar"""
        if not time_min:
            time_min = datetime.utcnow()
        if not time_max:
            time_max = time_min + timedelta(days=30)

        events_result = self.service.events().list(
            calendarId=calendar_id,
            timeMin=time_min.isoformat() + 'Z',
            timeMax=time_max.isoformat() + 'Z',
            maxResults=max_results,
            singleEvents=True,
            orderBy='startTime'
        ).execute()

        events = []
        for event in events_result.get('items', []):
            events.append({
                'id': event['id'],
                'summary': event.get('summary'),
                'description': event.get('description'),
                'start': event['start'].get('dateTime', event['start'].get('date')),
                'end': event['end'].get('dateTime', event['end'].get('date')),
                'location': event.get('location'),
                'attendees': event.get('attendees', []),
                'status': event.get('status')
            })

        return events

    async def create_event(
        self,
        calendar_id: str,
        event: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a calendar event"""
        event_body = {
            'summary': event['summary'],
            'description': event.get('description'),
            'location': event.get('location'),
            'start': {
                'dateTime': event['start'].isoformat(),
                'timeZone': event.get('timezone', 'UTC')
            },
            'end': {
                'dateTime': event['end'].isoformat(),
                'timeZone': event.get('timezone', 'UTC')
            }
        }

        if event.get('attendees'):
            event_body['attendees'] = [
                {'email': email} for email in event['attendees']
            ]

        created_event = self.service.events().insert(
            calendarId=calendar_id,
            body=event_body,
            sendUpdates='all' if event.get('notify_attendees') else 'none'
        ).execute()

        return {
            'id': created_event['id'],
            'htmlLink': created_event.get('htmlLink')
        }

    async def sync_to_nextcloud(
        self,
        calendar_id: str,
        nextcloud_calendar_service
    ) -> Dict[str, int]:
        """Sync Google Calendar events to Nextcloud CalDAV"""
        events = await self.get_events(calendar_id)

        stats = {'created': 0, 'updated': 0, 'skipped': 0}

        for event in events:
            # Check if event already exists in Nextcloud
            existing = await nextcloud_calendar_service.find_event_by_google_id(
                event['id']
            )

            if existing:
                # Update if modified
                await nextcloud_calendar_service.update_event(
                    existing['uid'],
                    event
                )
                stats['updated'] += 1
            else:
                # Create new event
                await nextcloud_calendar_service.create_event(event)
                stats['created'] += 1

        return stats

# API Endpoints
@router.get("/api/google-calendar/auth")
async def google_calendar_auth(
    current_user: User = Depends(get_current_user)
):
    """Initiate Google Calendar OAuth flow"""
    redirect_uri = f"{settings.BASE_URL}/api/google-calendar/callback"
    auth_url, state = await GoogleCalendarService.get_authorization_url(redirect_uri)

    return {"authorization_url": auth_url, "state": state}

@router.get("/api/google-calendar/callback")
async def google_calendar_callback(
    code: str,
    state: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Handle Google Calendar OAuth callback"""
    redirect_uri = f"{settings.BASE_URL}/api/google-calendar/callback"
    credentials = await GoogleCalendarService.exchange_code(code, redirect_uri)

    # Store credentials securely
    await store_user_google_credentials(current_user, credentials, db)

    return {"message": "Google Calendar connected successfully"}

@router.get("/api/google-calendar/events")
async def list_google_events(
    calendar_id: str = "primary",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List events from Google Calendar"""
    credentials = await get_user_google_credentials(current_user, db)
    service = GoogleCalendarService(credentials)
    events = await service.get_events(calendar_id)
    return {"events": events}

@router.post("/api/google-calendar/sync")
async def sync_google_to_nextcloud(
    calendar_id: str = "primary",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sync Google Calendar to Nextcloud"""
    google_creds = await get_user_google_credentials(current_user, db)
    nextcloud_config = await get_user_nextcloud_config(current_user, db)

    google_service = GoogleCalendarService(google_creds)
    nextcloud_service = NextcloudCalendarService(nextcloud_config)

    stats = await google_service.sync_to_nextcloud(calendar_id, nextcloud_service)
    return {"message": "Sync completed", "stats": stats}
```

### G.4 Nextcloud App Store Packaging

**Purpose:** Package VoiceAssist apps for Nextcloud App Store distribution

#### Implementation Guide

```bash
# Nextcloud App Structure
voiceassist-nextcloud/
├── appinfo/
│   ├── info.xml          # App metadata
│   ├── routes.php        # Route definitions
│   └── app.php           # App initialization
├── lib/
│   ├── Controller/
│   │   └── PageController.php
│   ├── Service/
│   │   └── VoiceAssistService.php
│   └── AppInfo/
│       └── Application.php
├── templates/
│   └── index.php         # Main template
├── js/
│   └── voiceassist.js    # React app bundle
├── css/
│   └── voiceassist.css
└── img/
    └── app.svg           # App icon
```

**App Metadata (info.xml):**

```xml
<?xml version="1.0"?>
<info xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="https://apps.nextcloud.com/schema/apps/info.xsd">
    <id>voiceassist</id>
    <name>VoiceAssist</name>
    <summary>Medical AI Voice Assistant</summary>
    <description><![CDATA[
        VoiceAssist is an AI-powered medical assistant that helps healthcare
        professionals with clinical decision support, literature search,
        and voice-based interactions.

        Features:
        - Voice-based queries with natural language understanding
        - Medical knowledge base search
        - Clinical calculators
        - Drug interaction checking
        - Citation management
    ]]></description>
    <version>1.0.0</version>
    <licence>agpl</licence>
    <author mail="support@voiceassist.io">VoiceAssist Team</author>
    <namespace>VoiceAssist</namespace>
    <category>office</category>
    <category>tools</category>
    <bugs>https://github.com/voiceassist/nextcloud-app/issues</bugs>
    <repository type="git">https://github.com/voiceassist/nextcloud-app</repository>
    <dependencies>
        <nextcloud min-version="28" max-version="30"/>
        <php min-version="8.1"/>
    </dependencies>
    <navigations>
        <navigation>
            <name>VoiceAssist</name>
            <route>voiceassist.page.index</route>
            <icon>app.svg</icon>
        </navigation>
    </navigations>
    <settings>
        <admin>OCA\VoiceAssist\Settings\AdminSettings</admin>
        <admin-section>OCA\VoiceAssist\Settings\AdminSection</admin-section>
    </settings>
</info>
```

**Build and Package Script:**

```python
# scripts/package_nextcloud_app.py

import os
import shutil
import subprocess
from pathlib import Path

def package_nextcloud_app():
    """Package VoiceAssist as Nextcloud app"""

    # Build React app
    print("Building React app...")
    subprocess.run(
        ["pnpm", "build"],
        cwd="clients/web-app",
        check=True
    )

    # Create Nextcloud app directory
    app_dir = Path("dist/voiceassist-nextcloud")
    if app_dir.exists():
        shutil.rmtree(app_dir)

    app_dir.mkdir(parents=True)

    # Copy app structure
    shutil.copytree("nextcloud-app/appinfo", app_dir / "appinfo")
    shutil.copytree("nextcloud-app/lib", app_dir / "lib")
    shutil.copytree("nextcloud-app/templates", app_dir / "templates")
    shutil.copytree("nextcloud-app/img", app_dir / "img")

    # Copy built assets
    (app_dir / "js").mkdir()
    (app_dir / "css").mkdir()

    for js_file in Path("clients/web-app/dist/assets").glob("*.js"):
        shutil.copy(js_file, app_dir / "js" / "voiceassist.js")
        break

    for css_file in Path("clients/web-app/dist/assets").glob("*.css"):
        shutil.copy(css_file, app_dir / "css" / "voiceassist.css")
        break

    # Create tarball for app store
    print("Creating tarball...")
    subprocess.run(
        ["tar", "-czf", "voiceassist.tar.gz", "voiceassist-nextcloud"],
        cwd="dist",
        check=True
    )

    # Sign the app (requires Nextcloud certificate)
    if os.environ.get("NEXTCLOUD_CERT"):
        print("Signing app...")
        subprocess.run([
            "openssl", "dgst", "-sha512",
            "-sign", os.environ["NEXTCLOUD_CERT"],
            "-out", "dist/voiceassist.tar.gz.signature",
            "dist/voiceassist.tar.gz"
        ], check=True)

    print(f"App packaged: dist/voiceassist.tar.gz")

if __name__ == "__main__":
    package_nextcloud_app()
```

#### Testing for Nextcloud Integration

```python
class TestNextcloudIntegration:
    @pytest.mark.integration
    async def test_carddav_contact_sync(self, carddav_service):
        """Test CardDAV contact synchronization"""
        # Create contact
        contact = {
            'full_name': 'Test Doctor',
            'emails': ['doctor@hospital.org'],
            'phones': ['+1234567890'],
            'organization': 'Test Hospital'
        }
        uid = await carddav_service.create_contact(contact)
        assert uid is not None

        # Fetch and verify
        contacts = await carddav_service.get_contacts()
        found = next((c for c in contacts if c['uid'] == uid), None)
        assert found is not None
        assert found['full_name'] == 'Test Doctor'

        # Cleanup
        await carddav_service.delete_contact(uid)

    @pytest.mark.integration
    async def test_google_calendar_sync(self, google_service, nextcloud_service):
        """Test Google to Nextcloud calendar sync"""
        stats = await google_service.sync_to_nextcloud('primary', nextcloud_service)

        assert stats['created'] >= 0
        assert stats['updated'] >= 0

    @pytest.mark.integration
    async def test_nextcloud_app_health(self, test_client):
        """Test Nextcloud app is accessible"""
        response = await test_client.get("/apps/voiceassist/")
        assert response.status_code == 200
```

---

## Feature Category H: Advanced RAG & Reasoning

**Timeline:** 4-5 weeks
**Priority:** HIGH

### H.1 Advanced RAG Techniques

**Original Scope:** Basic semantic search
**Enhanced Scope:** Hybrid search, re-ranking, query expansion, multi-hop reasoning

```python
# services/api-gateway/app/services/advanced_rag.py

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import asyncio

@dataclass
class SearchResult:
    doc_id: str
    content: str
    score: float
    metadata: Dict[str, Any]
    source: str  # 'semantic', 'keyword', 'hybrid'

class HybridSearchEngine:
    """Combines semantic and keyword search with re-ranking"""

    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_db = QdrantClient()
        self.bm25_index = BM25Index()
        self.reranker = CrossEncoderReranker()

    async def search(
        self,
        query: str,
        top_k: int = 10,
        alpha: float = 0.5,  # Weight between semantic (1) and keyword (0)
        filters: Optional[Dict[str, Any]] = None,
        rerank: bool = True
    ) -> List[SearchResult]:
        """
        Perform hybrid search combining semantic and keyword search.

        Args:
            query: Search query
            top_k: Number of results to return
            alpha: Balance between semantic (1.0) and keyword (0.0) search
            filters: Metadata filters (e.g., source_type, date_range)
            rerank: Whether to apply cross-encoder re-ranking
        """
        # Expand query with medical synonyms
        expanded_query = await self._expand_query(query)

        # Run semantic and keyword search in parallel
        semantic_results, keyword_results = await asyncio.gather(
            self._semantic_search(expanded_query, top_k * 2, filters),
            self._keyword_search(expanded_query, top_k * 2, filters)
        )

        # Fuse results using Reciprocal Rank Fusion
        fused_results = self._reciprocal_rank_fusion(
            semantic_results,
            keyword_results,
            alpha=alpha
        )

        # Re-rank with cross-encoder
        if rerank and len(fused_results) > 0:
            fused_results = await self.reranker.rerank(
                query=query,
                documents=fused_results,
                top_k=top_k
            )

        return fused_results[:top_k]

    async def _expand_query(self, query: str) -> str:
        """Expand query with medical synonyms and related terms"""
        # Use medical ontology for synonym expansion
        # e.g., "heart attack" -> "heart attack myocardial infarction MI"

        from app.services.medical_ontology import MedicalOntology
        ontology = MedicalOntology()

        expanded_terms = await ontology.get_synonyms(query)
        return f"{query} {' '.join(expanded_terms)}"

    async def _semantic_search(
        self,
        query: str,
        top_k: int,
        filters: Optional[Dict[str, Any]]
    ) -> List[SearchResult]:
        """Vector similarity search"""
        query_embedding = await self.embedding_service.generate_embedding(query)

        results = await self.vector_db.search(
            collection_name="medical_kb",
            query_vector=query_embedding,
            limit=top_k,
            query_filter=self._build_qdrant_filter(filters)
        )

        return [
            SearchResult(
                doc_id=r.id,
                content=r.payload['content'],
                score=r.score,
                metadata=r.payload.get('metadata', {}),
                source='semantic'
            )
            for r in results
        ]

    async def _keyword_search(
        self,
        query: str,
        top_k: int,
        filters: Optional[Dict[str, Any]]
    ) -> List[SearchResult]:
        """BM25 keyword search"""
        results = await self.bm25_index.search(
            query=query,
            top_k=top_k,
            filters=filters
        )

        return [
            SearchResult(
                doc_id=r['id'],
                content=r['content'],
                score=r['score'],
                metadata=r.get('metadata', {}),
                source='keyword'
            )
            for r in results
        ]

    def _reciprocal_rank_fusion(
        self,
        semantic_results: List[SearchResult],
        keyword_results: List[SearchResult],
        alpha: float = 0.5,
        k: int = 60
    ) -> List[SearchResult]:
        """
        Fuse results using Reciprocal Rank Fusion.

        RRF score = sum(1 / (k + rank_i))
        """
        scores = {}

        # Score semantic results
        for rank, result in enumerate(semantic_results):
            rrf_score = alpha * (1 / (k + rank + 1))
            if result.doc_id not in scores:
                scores[result.doc_id] = {'result': result, 'score': 0}
            scores[result.doc_id]['score'] += rrf_score

        # Score keyword results
        for rank, result in enumerate(keyword_results):
            rrf_score = (1 - alpha) * (1 / (k + rank + 1))
            if result.doc_id not in scores:
                scores[result.doc_id] = {'result': result, 'score': 0}
            scores[result.doc_id]['score'] += rrf_score

        # Sort by fused score
        sorted_results = sorted(
            scores.values(),
            key=lambda x: x['score'],
            reverse=True
        )

        return [
            SearchResult(
                doc_id=item['result'].doc_id,
                content=item['result'].content,
                score=item['score'],
                metadata=item['result'].metadata,
                source='hybrid'
            )
            for item in sorted_results
        ]

class CrossEncoderReranker:
    """Re-rank results using a cross-encoder model"""

    def __init__(self):
        from sentence_transformers import CrossEncoder
        self.model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

    async def rerank(
        self,
        query: str,
        documents: List[SearchResult],
        top_k: int
    ) -> List[SearchResult]:
        """Re-rank documents using cross-encoder"""
        if not documents:
            return []

        # Prepare pairs for cross-encoder
        pairs = [(query, doc.content) for doc in documents]

        # Get cross-encoder scores
        loop = asyncio.get_event_loop()
        scores = await loop.run_in_executor(
            None,
            lambda: self.model.predict(pairs)
        )

        # Combine with original results
        for doc, score in zip(documents, scores):
            doc.score = float(score)

        # Sort by reranked score
        reranked = sorted(documents, key=lambda x: x.score, reverse=True)

        return reranked[:top_k]

class MultiHopReasoner:
    """Multi-hop reasoning for complex queries"""

    def __init__(self):
        self.search_engine = HybridSearchEngine()
        self.llm = LLMService()

    async def reason(
        self,
        query: str,
        max_hops: int = 3,
        context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Perform multi-hop reasoning.

        1. Decompose complex query into sub-questions
        2. Answer each sub-question with retrieval
        3. Synthesize final answer
        """
        # Step 1: Decompose query
        sub_questions = await self._decompose_query(query)

        reasoning_chain = []
        accumulated_context = context or ""

        # Step 2: Answer sub-questions iteratively
        for i, sub_q in enumerate(sub_questions[:max_hops]):
            # Search with accumulated context
            search_results = await self.search_engine.search(
                query=sub_q,
                top_k=5
            )

            # Generate intermediate answer
            intermediate_answer = await self._generate_intermediate_answer(
                question=sub_q,
                context=accumulated_context,
                retrieved_docs=search_results
            )

            reasoning_chain.append({
                'step': i + 1,
                'question': sub_q,
                'retrieved_docs': [r.doc_id for r in search_results],
                'answer': intermediate_answer
            })

            # Update context for next hop
            accumulated_context += f"\n\nQ: {sub_q}\nA: {intermediate_answer}"

        # Step 3: Synthesize final answer
        final_answer = await self._synthesize_answer(
            original_query=query,
            reasoning_chain=reasoning_chain
        )

        return {
            'answer': final_answer,
            'reasoning_chain': reasoning_chain,
            'confidence': self._calculate_confidence(reasoning_chain)
        }

    async def _decompose_query(self, query: str) -> List[str]:
        """Decompose complex query into sub-questions"""
        prompt = f"""Break down this complex medical question into simpler sub-questions that can be answered independently:

Question: {query}

Generate 2-4 sub-questions that together would help answer the main question.
Format: One question per line, no numbering."""

        response = await self.llm.generate(prompt, max_tokens=200)
        sub_questions = [q.strip() for q in response.split('\n') if q.strip()]
        return sub_questions

    async def _generate_intermediate_answer(
        self,
        question: str,
        context: str,
        retrieved_docs: List[SearchResult]
    ) -> str:
        """Generate answer for a sub-question"""
        doc_context = "\n\n".join([
            f"Source: {doc.metadata.get('source', 'Unknown')}\n{doc.content}"
            for doc in retrieved_docs
        ])

        prompt = f"""Based on the following context, answer the question concisely.

Previous Context:
{context}

Retrieved Information:
{doc_context}

Question: {question}

Answer (be concise and cite sources):"""

        return await self.llm.generate(prompt, max_tokens=300)

    async def _synthesize_answer(
        self,
        original_query: str,
        reasoning_chain: List[Dict]
    ) -> str:
        """Synthesize final answer from reasoning chain"""
        chain_text = "\n".join([
            f"Step {step['step']}: {step['question']}\nAnswer: {step['answer']}"
            for step in reasoning_chain
        ])

        prompt = f"""Based on the following reasoning chain, provide a comprehensive answer to the original question.

Original Question: {original_query}

Reasoning Chain:
{chain_text}

Synthesized Answer (comprehensive, well-structured, with citations):"""

        return await self.llm.generate(prompt, max_tokens=500)

    def _calculate_confidence(self, reasoning_chain: List[Dict]) -> float:
        """Calculate confidence score for the reasoning"""
        # Simple heuristic based on chain completeness
        if not reasoning_chain:
            return 0.0
        return min(1.0, len(reasoning_chain) * 0.3)
```

---

## Comprehensive Testing Strategy

### Testing Categories

```python
# tests/conftest.py - Shared fixtures

import pytest
import asyncio
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
def test_db():
    """Create test database"""
    engine = create_engine("postgresql://test:test@localhost:5432/voiceassist_test")
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)

@pytest.fixture
def db_session(test_db) -> Generator:
    """Create new database session for each test"""
    Session = sessionmaker(bind=test_db)
    session = Session()
    yield session
    session.rollback()
    session.close()

@pytest.fixture
async def test_client(db_session):
    """Async test client"""
    from httpx import AsyncClient
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def authenticated_user(test_client, db_session):
    """Create and authenticate test user"""
    # Create user
    user = User(email="test@example.com", hashed_password=hash_password("testpass"))
    db_session.add(user)
    db_session.commit()

    # Login
    response = await test_client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "testpass"
    })

    token = response.json()["access_token"]

    class AuthenticatedUser:
        def __init__(self):
            self.user = user
            self.token = token
            self.headers = {"Authorization": f"Bearer {token}"}

    return AuthenticatedUser()
```

### Test Categories Summary

| Category          | Description                     | Coverage Target |
| ----------------- | ------------------------------- | --------------- |
| Unit Tests        | Individual function/class tests | 85%             |
| Integration Tests | API endpoint tests              | 80%             |
| E2E Tests         | Full workflow tests             | Key paths       |
| Load Tests        | Performance under load          | P95 < targets   |
| Security Tests    | Vulnerability scanning          | 0 critical/high |
| Chaos Tests       | Failure mode testing            | Recovery < 30s  |

---

## Performance Benchmarks

### Target Metrics

| Feature             | Metric           | Target  | Critical Threshold |
| ------------------- | ---------------- | ------- | ------------------ |
| File Processing     | 10MB PDF         | < 30s   | < 60s              |
| Voice Latency       | First audio byte | < 300ms | < 500ms            |
| Hybrid Search       | Query response   | < 200ms | < 500ms            |
| Multi-hop Reasoning | 3-hop query      | < 5s    | < 10s              |
| Share Link Access   | Time to render   | < 500ms | < 1s               |
| Email Fetch         | 50 messages      | < 2s    | < 5s               |
| MFA Verification    | TOTP check       | < 50ms  | < 100ms            |

### Load Test Scenarios

```yaml
# k6 load test configuration
scenarios:
  file_upload:
    executor: ramping-vus
    startVUs: 1
    stages:
      - duration: 1m
        target: 10
      - duration: 3m
        target: 50
      - duration: 1m
        target: 0
    thresholds:
      http_req_duration:
        - p(95)<30000
        - p(99)<60000

  voice_sessions:
    executor: constant-vus
    vus: 100
    duration: 5m
    thresholds:
      ws_connecting:
        - p(95)<500
      ws_session_duration:
        - p(95)<300000

  hybrid_search:
    executor: constant-arrival-rate
    rate: 100
    timeUnit: 1s
    duration: 5m
    thresholds:
      http_req_duration:
        - p(95)<200
        - p(99)<500
```

---

## Security Considerations

### Security Checklist

- [ ] **File Upload Security**
  - [ ] File type validation (whitelist)
  - [ ] File size limits (configurable)
  - [ ] Virus scanning (ClamAV)
  - [ ] Secure file storage (S3 with signed URLs)
  - [ ] No path traversal vulnerabilities

- [ ] **Voice Session Security**
  - [ ] Encrypted WebSocket connections
  - [ ] Session token rotation
  - [ ] Rate limiting per user
  - [ ] Audio data not persisted (unless configured)

- [ ] **Sharing Security**
  - [ ] Cryptographically secure share tokens
  - [ ] Password protection option
  - [ ] Expiration enforcement
  - [ ] Access logging for audit
  - [ ] Rate limiting on access attempts

- [ ] **OIDC/MFA Security**
  - [ ] State parameter validation (CSRF prevention)
  - [ ] Nonce validation
  - [ ] Token encryption at rest
  - [ ] Backup code hashing
  - [ ] Brute force protection

- [ ] **Email Security**
  - [ ] Credentials encrypted at rest
  - [ ] TLS for IMAP/SMTP
  - [ ] PHI detection in email content
  - [ ] Attachment scanning

---

## Implementation Timeline

**Total Duration:** 17-21 weeks (4-5 months)

### Phase 1: Voice Pipeline Completion (Weeks 1-4)

| Week | Focus                | Deliverables                                     |
| ---- | -------------------- | ------------------------------------------------ |
| 1    | Voice Infrastructure | WebSocket handler, VAD setup                     |
| 2    | OpenAI Realtime      | Realtime API integration, streaming              |
| 3    | Voice Features       | Barge-in, echo cancellation, noise suppression   |
| 4    | Voice Auth           | Voice authentication enrollment and verification |

**Milestone:** Full voice pipeline operational

### Phase 2: Advanced Medical AI (Weeks 5-9)

| Week | Focus               | Deliverables                                  |
| ---- | ------------------- | --------------------------------------------- |
| 5    | Medical Models      | BioGPT/PubMedBERT integration                 |
| 6    | Medical NER         | Entity extraction, UMLS linking               |
| 7    | Domain LLM          | Domain-specific prompts, classification       |
| 8-9  | Multi-hop Reasoning | Query decomposition, cross-document synthesis |

**Milestone:** Medical AI capabilities enhanced

### Phase 3: External Medical Integrations (Weeks 10-16)

| Week  | Focus               | Deliverables                           |
| ----- | ------------------- | -------------------------------------- |
| 10-11 | UpToDate            | Search, drug interactions, calculators |
| 12-13 | OpenEvidence        | Evidence queries, systematic reviews   |
| 14-15 | PubMed              | Literature search, citation management |
| 16    | Medical Calculators | Wells, CHA2DS2-VASc, eGFR, etc.        |

**Milestone:** External integrations complete

### Phase 4: Nextcloud Integration (Weeks 17-20)

| Week | Focus          | Deliverables                   |
| ---- | -------------- | ------------------------------ |
| 17   | OIDC/SSO       | Nextcloud SSO, MFA integration |
| 18   | Email/Contacts | IMAP/SMTP, CardDAV sync        |
| 19   | Calendar       | Google Calendar sync, CalDAV   |
| 20   | App Packaging  | Nextcloud App Store packaging  |

**Milestone:** Nextcloud integration complete

### Phase 5: Advanced RAG & Polish (Weeks 21-24)

| Week | Focus           | Deliverables                                  |
| ---- | --------------- | --------------------------------------------- |
| 21   | Hybrid Search   | Semantic + keyword, re-ranking                |
| 22   | File Processing | PDF/OCR, entity extraction                    |
| 23   | Testing         | Integration tests, load tests, security audit |
| 24   | Documentation   | API docs, deployment guides                   |

**Milestone:** Production-ready system

### Timeline Summary

| Category                         | Duration        | Priority |
| -------------------------------- | --------------- | -------- |
| Voice Pipeline Completion        | 3-4 weeks       | HIGH     |
| Advanced Medical AI              | 4-5 weeks       | HIGH     |
| External Medical Integrations    | 6-8 weeks       | HIGH     |
| Nextcloud Integration Completion | 4-5 weeks       | HIGH     |
| Advanced RAG & Polish            | 3-4 weeks       | MEDIUM   |
| **Total**                        | **17-21 weeks** | -        |

---

## Dependencies & Prerequisites

### Required Packages

```bash
# Python - Core
pip install python-jose[cryptography]  # JWT
pip install passlib[bcrypt]  # Password hashing
pip install authlib  # OIDC
pip install pyotp  # TOTP
pip install qrcode[pil]  # QR codes

# File Processing
pip install pypdf  # PDF text extraction
pip install pdf2image  # PDF to image
pip install pytesseract  # OCR
pip install pillow  # Image processing

# Voice Pipeline
pip install webrtcvad  # Voice activity detection
pip install websockets  # WebSocket client
pip install resemblyzer  # Voice authentication
pip install soundfile  # Audio processing
pip install librosa  # Audio resampling

# Medical AI
pip install transformers  # BioGPT, PubMedBERT
pip install torch  # Deep learning
pip install scispacy  # Medical NER
pip install spacy  # NLP foundation
pip install en_core_sci_lg  # SciSpacy model

# RAG & Search
pip install sentence-transformers  # Cross-encoder re-ranking
pip install rank-bm25  # BM25 search
pip install qdrant-client  # Vector DB

# External Integrations
pip install biopython  # PubMed/Entrez
pip install httpx  # Async HTTP client
pip install vobject  # vCard/CardDAV
pip install google-api-python-client  # Google Calendar
pip install google-auth-oauthlib  # Google OAuth
```

### Infrastructure

- **Redis**: Session storage, caching
- **PostgreSQL**: Primary database with pgvector
- **Qdrant**: Vector storage for embeddings
- **Tesseract**: OCR engine
- **ClamAV**: Virus scanning
- **GPU (Optional)**: For medical model inference

### External Services

- **OpenAI**: GPT-4, Realtime API, Whisper, Embeddings
- **OIDC Providers**: Nextcloud, Google, Microsoft
- **UpToDate API**: Clinical decision support (requires license)
- **OpenEvidence API**: Evidence-based medicine
- **PubMed/NCBI**: Literature search (free with API key)
- **Google Calendar API**: Calendar sync

---

## Risk Assessment & Mitigation

| Risk                         | Impact | Probability | Mitigation                     |
| ---------------------------- | ------ | ----------- | ------------------------------ |
| OpenAI Realtime API latency  | High   | Medium      | Fallback to Whisper + TTS      |
| File processing memory usage | Medium | High        | Streaming, size limits         |
| OIDC provider downtime       | Medium | Low         | JWT fallback auth              |
| Voice quality issues         | High   | Medium      | Quality monitoring, fallbacks  |
| MFA adoption resistance      | Low    | Medium      | Clear onboarding, backup codes |

---

## Success Criteria

### Functional

- [ ] All file types processed correctly
- [ ] Voice sessions maintain < 500ms latency
- [ ] Share links work with all permission levels
- [ ] OIDC works with all configured providers
- [ ] MFA reduces unauthorized access to 0

### Performance

- [ ] P95 latencies within targets
- [ ] 100 concurrent voice sessions
- [ ] 1000 concurrent search queries
- [ ] < 1% error rate

### Security

- [ ] 0 critical vulnerabilities
- [ ] 0 high vulnerabilities
- [ ] All PHI properly protected
- [ ] Audit logs complete

---

## Appendix: API Reference

_Detailed OpenAPI specifications will be generated from the implemented endpoints._

---

**Document Version:** 1.0
**Created:** 2025-11-26
**Last Updated:** 2025-11-26
**Author:** Claude (AI Assistant)
**Status:** Ready for Review
