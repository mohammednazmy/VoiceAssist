"""
Knowledge Base Indexer Service

Handles document ingestion, text extraction, chunking, embedding generation,
and storage in Qdrant vector database.

Features:
- PDF structure extraction (pages, TOC, sections, figures)
- Page-aware chunking with navigation metadata
- OpenAI embeddings (text-embedding-3-small)
- Qdrant vector storage
- GPT-4 Vision figure descriptions (optional)
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from openai import AsyncOpenAI
from pypdf import PdfReader
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.core.config import settings
from app.services.pdf_structure_extractor import DocumentStructure, PDFStructureExtractor

# Enhanced extraction services (lazy imports to avoid circular dependencies)
_enhanced_processor = None
_page_analysis_service = None

logger = logging.getLogger(__name__)


def _get_enhanced_processor():
    """Get enhanced PDF processor instance (lazy load)."""
    global _enhanced_processor
    if _enhanced_processor is None:
        from app.services.enhanced_pdf_processor import get_enhanced_pdf_processor
        _enhanced_processor = get_enhanced_pdf_processor()
    return _enhanced_processor


def _get_page_analysis_service():
    """Get page analysis service instance (lazy load)."""
    global _page_analysis_service
    if _page_analysis_service is None:
        from app.services.page_analysis_service import get_page_analysis_service
        _page_analysis_service = get_page_analysis_service()
    return _page_analysis_service


@dataclass
class DocumentChunk:
    """Represents a chunk of a document with metadata."""

    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: Dict[str, Any]


@dataclass
class IndexingResult:
    """Result of document indexing operation."""

    document_id: str
    success: bool
    chunks_indexed: int
    error_message: Optional[str] = None


class KBIndexer:
    """
    Knowledge Base Indexer for document ingestion and embedding generation.

    Handles the complete pipeline from raw documents to searchable vectors in Qdrant.
    """

    def __init__(
        self,
        qdrant_url: str = "http://qdrant:6333",
        collection_name: str = "medical_kb",
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        embedding_model: str = "text-embedding-3-small",
    ):
        """
        Initialize KB Indexer.

        Args:
            qdrant_url: Qdrant server URL
            collection_name: Name of the collection to store embeddings
            chunk_size: Size of text chunks in characters
            chunk_overlap: Overlap between chunks
            embedding_model: OpenAI embedding model to use
        """
        # Qdrant configuration
        self.qdrant_enabled: bool = getattr(settings, "QDRANT_ENABLED", True)
        self.qdrant_client: QdrantClient | None = None
        if self.qdrant_enabled:
            try:
                self.qdrant_client = QdrantClient(url=qdrant_url, timeout=5.0)
            except Exception as e:  # pragma: no cover - defensive
                logger.warning(
                    "Failed to initialize Qdrant client for KBIndexer: %s",
                    e,
                    exc_info=True,
                )
                self.qdrant_client = None
                self.qdrant_enabled = False
        else:
            logger.warning("Qdrant is disabled - KB indexing will be a no-op")
        self.collection_name = collection_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.embedding_model = embedding_model

        # Initialize PDF structure extractor
        self.structure_extractor = PDFStructureExtractor()

        # Initialize async OpenAI client only when API key is configured
        openai_api_key = getattr(settings, "OPENAI_API_KEY", None)
        if openai_api_key:
            self.openai_client: AsyncOpenAI | None = AsyncOpenAI(
                api_key=openai_api_key,
                timeout=getattr(settings, "OPENAI_TIMEOUT_SEC", 30),
            )
        else:
            self.openai_client = None
            logger.warning(
                "OPENAI_API_KEY not configured - KBIndexer embeddings will be disabled"
            )

        # Ensure collection exists when Qdrant is available
        if self.qdrant_client is not None:
            self._ensure_collection()

    def _ensure_collection(self):
        """Ensure Qdrant collection exists with correct configuration."""
        if not self.qdrant_enabled or self.qdrant_client is None:
            # In local/test environments without Qdrant, silently skip collection creation.
            logger.warning(
                "Qdrant is disabled or unavailable - skipping KBIndexer collection initialization"
            )
            return
        try:
            collections = self.qdrant_client.get_collections().collections
            collection_names = [c.name for c in collections]

            if self.collection_name not in collection_names:
                # Create collection with vector size for text-embedding-3-small (1536)
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
                )
                logger.info(f"Created Qdrant collection: {self.collection_name}")
            else:
                logger.info(f"Qdrant collection already exists: {self.collection_name}")
        except Exception as e:
            # In tests and in environments without Qdrant, we don't want import-time failure.
            logger.error(
                "Error ensuring Qdrant collection (KBIndexer will operate in degraded mode): %s",
                e,
                exc_info=True,
            )

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """
        Extract text content from PDF file.

        Args:
            pdf_bytes: PDF file content as bytes

        Returns:
            Extracted text content
        """
        try:
            import io

            pdf_file = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_file)

            text_parts = []
            for page in reader.pages:
                text_parts.append(page.extract_text())

            full_text = "\n".join(text_parts)
            logger.debug(f"Extracted {len(full_text)} characters from PDF")
            return full_text

        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}", exc_info=True)
            raise ValueError(f"Failed to extract text from PDF: {e}")

    def chunk_text(self, text: str, document_id: str, metadata: Dict[str, Any]) -> List[DocumentChunk]:
        """
        Split text into overlapping chunks.

        Args:
            text: Full text content
            document_id: Unique document identifier
            metadata: Document metadata to attach to chunks

        Returns:
            List of document chunks
        """
        chunks = []
        text_length = len(text)

        for i in range(0, text_length, self.chunk_size - self.chunk_overlap):
            chunk_text = text[i : i + self.chunk_size]

            # Skip very small chunks at the end
            if len(chunk_text) < 50:
                continue

            chunk_id = str(uuid.uuid4())
            chunk = DocumentChunk(
                chunk_id=chunk_id,
                document_id=document_id,
                content=chunk_text,
                chunk_index=i // (self.chunk_size - self.chunk_overlap),
                metadata={
                    **metadata,
                    "chunk_index": i // (self.chunk_size - self.chunk_overlap),
                    "char_start": i,
                    "char_end": min(i + self.chunk_size, text_length),
                    # Duplicate document-level PHI risk at chunk level for filtering
                    "chunk_phi_risk": metadata.get("phi_risk"),
                },
            )
            chunks.append(chunk)

        logger.info(f"Created {len(chunks)} chunks from document {document_id}")
        return chunks

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text using OpenAI.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        if self.openai_client is None:
            raise RuntimeError("OpenAI client is not configured for KBIndexer")
        try:
            # Use OpenAI async client
            response = await self.openai_client.embeddings.create(model=self.embedding_model, input=text)
            embedding = response.data[0].embedding
            return embedding

        except Exception as e:
            logger.error(f"Error generating embedding: {e}", exc_info=True)
            raise

    async def index_document(
        self,
        content: str,
        document_id: str,
        title: str,
        source_type: str = "uploaded",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> IndexingResult:
        """
        Index a document: chunk, embed, and store in Qdrant.

        Args:
            content: Document text content
            document_id: Unique document identifier
            title: Document title
            source_type: Type of source (uploaded, guideline, journal, etc.)
            metadata: Additional metadata

        Returns:
            IndexingResult with success status and details
        """
        try:
            if self.qdrant_client is None:
                raise RuntimeError("Qdrant client is not configured for KBIndexer")
            # Prepare metadata
            doc_metadata = {
                "document_id": document_id,
                "title": title,
                "source_type": source_type,
                "indexed_at": datetime.now(timezone.utc).isoformat(),
                **(metadata or {}),
            }

            # Chunk the document
            chunks = self.chunk_text(content, document_id, doc_metadata)

            if not chunks:
                return IndexingResult(
                    document_id=document_id,
                    success=False,
                    chunks_indexed=0,
                    error_message="No chunks generated from document",
                )

            # Generate embeddings and create points for Qdrant
            points = []
            for chunk in chunks:
                # Generate embedding
                embedding = await self.generate_embedding(chunk.content)

                # Create Qdrant point
                point = PointStruct(
                    id=chunk.chunk_id,
                    vector=embedding,
                    payload={
                        "document_id": chunk.document_id,
                        "content": chunk.content,
                        "chunk_index": chunk.chunk_index,
                        **chunk.metadata,
                    },
                )
                points.append(point)

            # Upload to Qdrant
            self.qdrant_client.upsert(collection_name=self.collection_name, points=points)

            logger.info(f"Successfully indexed document {document_id} with {len(points)} chunks")

            return IndexingResult(document_id=document_id, success=True, chunks_indexed=len(points))

        except Exception as e:
            logger.error(f"Error indexing document {document_id}: {e}", exc_info=True)
            return IndexingResult(
                document_id=document_id,
                success=False,
                chunks_indexed=0,
                error_message=str(e),
            )

    async def index_pdf_document(
        self,
        pdf_bytes: bytes,
        document_id: str,
        title: str,
        source_type: str = "uploaded",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> IndexingResult:
        """
        Index a PDF document.

        Args:
            pdf_bytes: PDF file content
            document_id: Unique document identifier
            title: Document title
            source_type: Type of source
            metadata: Additional metadata

        Returns:
            IndexingResult with success status
        """
        try:
            # Extract text from PDF
            text_content = self.extract_text_from_pdf(pdf_bytes)

            # Index the extracted text
            return await self.index_document(
                content=text_content,
                document_id=document_id,
                title=title,
                source_type=source_type,
                metadata=metadata,
            )

        except Exception as e:
            logger.error(f"Error indexing PDF document {document_id}: {e}", exc_info=True)
            return IndexingResult(
                document_id=document_id,
                success=False,
                chunks_indexed=0,
                error_message=f"PDF processing failed: {e}",
            )

    def delete_document(self, document_id: str) -> bool:
        """
        Delete all chunks of a document from Qdrant.

        Args:
            document_id: Document identifier

        Returns:
            True if successful
        """
        if self.qdrant_client is None:
            logger.warning(
                "Qdrant client not configured - delete_document is a no-op for %s",
                document_id,
            )
            return False
        try:
            # Delete all points with matching document_id
            points_selector = FilterSelector(
                filter=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id),
                        )
                    ]
                )
            )
            self.qdrant_client.delete(collection_name=self.collection_name, points_selector=points_selector)
            logger.info(f"Deleted document {document_id} from index")
            return True

        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}", exc_info=True)
            return False

    # ========== Structure-Aware Indexing Methods ==========

    async def index_pdf_document_with_structure(
        self,
        pdf_bytes: bytes,
        document_id: str,
        title: str,
        source_type: str = "uploaded",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Tuple[IndexingResult, Optional[DocumentStructure]]:
        """
        Index a PDF document with full structure extraction.

        This method extracts document structure (pages, TOC, sections, figures)
        and creates chunks with page/section metadata for voice navigation.

        Args:
            pdf_bytes: PDF file content
            document_id: Unique document identifier
            title: Document title
            source_type: Type of source (uploaded, guideline, journal, etc.)
            metadata: Additional metadata

        Returns:
            Tuple of (IndexingResult, DocumentStructure or None)
        """
        try:
            logger.info(f"Starting structure-aware indexing for document {document_id}")
            if self.qdrant_client is None:
                raise RuntimeError("Qdrant client is not configured for KBIndexer")

            # Extract document structure
            structure = self.structure_extractor.extract(pdf_bytes)

            logger.info(
                f"Extracted structure: {structure.total_pages} pages, "
                f"{len(structure.toc)} TOC entries, {len(structure.figures)} figures"
            )

            # Prepare base metadata
            doc_metadata = {
                "document_id": document_id,
                "title": title,
                "source_type": source_type,
                "indexed_at": datetime.now(timezone.utc).isoformat(),
                "total_pages": structure.total_pages,
                "has_toc": len(structure.toc) > 0,
                "has_figures": len(structure.figures) > 0,
                **(metadata or {}),
            }

            # Create structure-aware chunks
            chunks = self._create_structured_chunks(structure, document_id, title, doc_metadata)

            if not chunks:
                return (
                    IndexingResult(
                        document_id=document_id,
                        success=False,
                        chunks_indexed=0,
                        error_message="No chunks generated from document",
                    ),
                    structure,
                )

            # Generate embeddings and create points for Qdrant
            points = []
            for chunk in chunks:
                # Generate embedding
                embedding = await self.generate_embedding(chunk.content)

                # Create Qdrant point with rich metadata
                point = PointStruct(
                    id=chunk.chunk_id,
                    vector=embedding,
                    payload={
                        "document_id": chunk.document_id,
                        "content": chunk.content,
                        "chunk_index": chunk.chunk_index,
                        **chunk.metadata,
                    },
                )
                points.append(point)

            # Upload to Qdrant
            self.qdrant_client.upsert(collection_name=self.collection_name, points=points)

            logger.info(f"Successfully indexed document {document_id} with {len(points)} structure-aware chunks")

            return (
                IndexingResult(document_id=document_id, success=True, chunks_indexed=len(points)),
                structure,
            )

        except Exception as e:
            logger.error(f"Error indexing PDF document {document_id}: {e}", exc_info=True)
            return (
                IndexingResult(
                    document_id=document_id,
                    success=False,
                    chunks_indexed=0,
                    error_message=f"PDF processing failed: {e}",
                ),
                None,
            )

    def _create_structured_chunks(
        self,
        structure: DocumentStructure,
        document_id: str,
        title: str,
        base_metadata: Dict[str, Any],
    ) -> List[DocumentChunk]:
        """
        Create chunks that preserve page and section information.

        Each chunk includes:
        - Page number
        - Section ID and title (if applicable)
        - Character positions within the document

        Args:
            structure: Extracted document structure
            document_id: Document identifier
            title: Document title
            base_metadata: Base metadata to include in all chunks

        Returns:
            List of DocumentChunks with structure metadata
        """
        chunks = []
        chunk_index = 0

        for page in structure.pages:
            # Find which section this page belongs to
            section = self._find_section_for_page(structure, page.page_number)

            # Chunk the page content
            page_chunks = self._chunk_page_content(
                text=page.text,
                document_id=document_id,
                page_number=page.page_number,
                section_id=section.section_id if section else None,
                section_title=section.title if section else None,
                page_start_char=page.start_char,
                base_metadata=base_metadata,
                start_chunk_index=chunk_index,
            )

            chunks.extend(page_chunks)
            chunk_index += len(page_chunks)

        logger.info(f"Created {len(chunks)} structured chunks from {structure.total_pages} pages")
        return chunks

    def _find_section_for_page(self, structure: DocumentStructure, page_number: int):
        """Find the section that contains a given page."""
        for section in structure.sections:
            if section.start_page <= page_number <= section.end_page:
                return section
        return None

    def _chunk_page_content(
        self,
        text: str,
        document_id: str,
        page_number: int,
        section_id: Optional[str],
        section_title: Optional[str],
        page_start_char: int,
        base_metadata: Dict[str, Any],
        start_chunk_index: int,
    ) -> List[DocumentChunk]:
        """
        Chunk page content while preserving structure metadata.

        Args:
            text: Page text content
            document_id: Document identifier
            page_number: Page number
            section_id: Section ID if page is part of a section
            section_title: Section title
            page_start_char: Start character position in full document
            base_metadata: Base metadata to include
            start_chunk_index: Starting chunk index

        Returns:
            List of DocumentChunks for this page
        """
        chunks = []
        text_length = len(text)
        chunk_index = start_chunk_index

        for i in range(0, text_length, self.chunk_size - self.chunk_overlap):
            chunk_text = text[i : i + self.chunk_size]

            # Skip very small chunks at the end
            if len(chunk_text) < 50:
                continue

            chunk_id = str(uuid.uuid4())
            chunk = DocumentChunk(
                chunk_id=chunk_id,
                document_id=document_id,
                content=chunk_text,
                chunk_index=chunk_index,
                metadata={
                    **base_metadata,
                    "page_number": page_number,
                    "section_id": section_id,
                    "section_title": section_title,
                    "char_start_in_page": i,
                    "char_end_in_page": min(i + self.chunk_size, text_length),
                    "char_start_in_doc": page_start_char + i,
                    "char_end_in_doc": page_start_char + min(i + self.chunk_size, text_length),
                    # Duplicate document-level PHI risk at chunk level for filtering
                    "chunk_phi_risk": base_metadata.get("phi_risk"),
                },
            )
            chunks.append(chunk)
            chunk_index += 1

        return chunks

    # ========== Enhanced Extraction with GPT-4 Vision ==========

    async def index_document_with_enhanced_extraction(
        self,
        pdf_bytes: bytes,
        document_id: str,
        title: str,
        source_type: str = "uploaded",
        metadata: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Any] = None,
    ) -> Tuple[IndexingResult, Optional[Dict[str, Any]], Optional[str]]:
        """
        Index a PDF document with enhanced extraction using pdfplumber and GPT-4 Vision.

        This method provides the highest quality extraction:
        1. pdfplumber for layout-aware text and table extraction
        2. GPT-4 Vision for page analysis, figure descriptions, and voice narration
        3. Permanent storage of rendered page images

        Cost: ~$0.01275 per page at high resolution

        Args:
            pdf_bytes: PDF file content
            document_id: Unique document identifier
            title: Document title
            source_type: Type of source
            metadata: Additional metadata
            progress_callback: Optional callback(progress: int) for 0-100 progress updates

        Returns:
            Tuple of (IndexingResult, enhanced_structure_dict or None, page_images_path or None)
        """
        try:
            logger.info(f"Starting enhanced extraction for document {document_id}")
            if self.qdrant_client is None:
                raise RuntimeError("Qdrant client is not configured for KBIndexer")

            # Get service instances
            processor = _get_enhanced_processor()
            analyzer = _get_page_analysis_service()
            # Reset cost tracking for this document
            analyzer.reset_cost_tracking()

            # Stage 1: Extract with pdfplumber (0-20%)
            logger.info("Stage 1: Extracting with pdfplumber")
            extractions = processor.extract_with_pdfplumber(
                pdf_bytes,
                progress_callback=progress_callback,
            )

            total_pages = len(extractions)
            logger.info(f"Extracted {total_pages} pages with pdfplumber")

            # Stage 2: Render and store page images (20-30%)
            logger.info("Stage 2: Rendering page images")
            page_images_path = processor.render_page_images(
                pdf_bytes,
                document_id,
                dpi=200,
                progress_callback=progress_callback,
            )

            if page_images_path:
                logger.info(f"Page images stored at: {page_images_path}")
            else:
                logger.warning("Failed to render page images")

            # Stage 3: Vision model analysis (30-90%)
            logger.info("Stage 3: Analyzing pages with vision model %s", analyzer.model)

            analyses: List[Any] = []

            if page_images_path:
                logger.info("Analyzing pages using pre-rendered page images")
                total_pages = max(total_pages, 1)

                for extraction in extractions:
                    page_num = extraction.page_number

                    image_path = processor.get_page_image_path(document_id, page_num)
                    if image_path and image_path.exists():
                        try:
                            with open(image_path, "rb") as f:
                                image_bytes = f.read()

                            result = await analyzer.analyze_page(
                                image_bytes=image_bytes,
                                page_number=page_num,
                                context=title,
                            )
                        except Exception as e:  # pragma: no cover - defensive
                            logger.error(
                                "Error analyzing page %s from image, falling back to PDF: %s",
                                page_num,
                                e,
                            )
                            result = await analyzer.analyze_single_page_from_pdf(
                                pdf_bytes=pdf_bytes,
                                page_number=page_num,
                            )
                    else:
                        logger.warning(
                            "Page image not found for document %s page %s, "
                            "falling back to PDF-based analysis",
                            document_id,
                            page_num,
                        )
                        result = await analyzer.analyze_single_page_from_pdf(
                            pdf_bytes=pdf_bytes,
                            page_number=page_num,
                        )

                    analyses.append(result)

                    # Update progress (30-90% for analysis phase)
                    if progress_callback:
                        progress = 30 + int((page_num / total_pages) * 60)
                        progress_callback(progress)

                    logger.info(
                        "Analyzed page %s/%s with GPT-4 Vision",
                        page_num,
                        total_pages,
                    )
            else:
                # Fallback: let the analysis service handle PDF → image conversion
                analyses = await analyzer.analyze_document(
                    pdf_bytes,
                    document_id,
                    progress_callback=progress_callback,
                )

            logger.info(f"Analyzed {len(analyses)} pages with GPT-4 Vision")
            analysis_cost = analyzer.get_total_cost()

            # Stage 4: Merge extractions and analyses (90-95%)
            logger.info("Stage 4: Merging extractions and analyses")
            enhanced_structure = self._merge_enhanced_extractions(
                extractions,
                analyses,
                total_pages,
                analysis_cost,
                vision_model=analyzer.model,
            )

            if progress_callback:
                progress_callback(95)

            # Stage 5: Index with enhanced content (95-100%)
            logger.info("Stage 5: Indexing enhanced content")

            # Create chunks from enhanced content
            chunks = self._create_enhanced_chunks(
                enhanced_structure,
                document_id,
                title,
                source_type,
                metadata or {},
            )

            if not chunks:
                return (
                    IndexingResult(
                        document_id=document_id,
                        success=False,
                        chunks_indexed=0,
                        error_message="No chunks generated from enhanced content",
                    ),
                    enhanced_structure,
                    page_images_path,
                )

            # Generate embeddings and store in Qdrant
            points = []
            for chunk in chunks:
                embedding = await self.generate_embedding(chunk.content)
                point = PointStruct(
                    id=chunk.chunk_id,
                    vector=embedding,
                    payload={
                        "document_id": chunk.document_id,
                        "content": chunk.content,
                        "chunk_index": chunk.chunk_index,
                        **chunk.metadata,
                    },
                )
                points.append(point)

            if self.qdrant_client is None:
                raise RuntimeError("Qdrant client is not configured for KBIndexer")

            self.qdrant_client.upsert(collection_name=self.collection_name, points=points)

            if progress_callback:
                progress_callback(100)

            logger.info(
                f"Successfully indexed document {document_id} with {len(points)} chunks. "
                f"Analysis cost: ${analysis_cost:.2f}"
            )

            return (
                IndexingResult(
                    document_id=document_id,
                    success=True,
                    chunks_indexed=len(points),
                ),
                enhanced_structure,
                page_images_path,
            )

        except Exception as e:
            logger.error(f"Error in enhanced extraction for {document_id}: {e}", exc_info=True)
            return (
                IndexingResult(
                    document_id=document_id,
                    success=False,
                    chunks_indexed=0,
                    error_message=f"Enhanced extraction failed: {e}",
                ),
                None,
                None,
            )

    def _merge_enhanced_extractions(
        self,
        extractions: List,
        analyses: List,
        total_pages: int,
        analysis_cost: float,
        vision_model: str,
    ) -> Dict[str, Any]:
        """
        Merge pdfplumber extractions with vision model analyses.

        Args:
            extractions: List of PageExtraction from pdfplumber
            analyses: List of PageAnalysisResult from GPT-4 Vision
            total_pages: Total number of pages
            analysis_cost: Total cost of vision analysis
            vision_model: OpenAI vision model identifier

        Returns:
            Enhanced structure dictionary
        """
        pages = []

        # Create lookup for analyses by page number
        analyses_by_page = {a.page_number: a for a in analyses}

        for extraction in extractions:
            page_num = extraction.page_number
            analysis = analyses_by_page.get(page_num)

            page_data = {
                "page_number": page_num,
                "raw_text": extraction.raw_text,
                "word_count": extraction.word_count,
                "content_blocks": [],
                "voice_narration": "",
            }

            if analysis:
                # Use GPT-4 Vision analysis (higher quality)
                page_data["content_blocks"] = analysis.content_blocks
                page_data["voice_narration"] = analysis.voice_narration
                page_data["detected_errors"] = analysis.detected_errors
            else:
                # Fall back to pdfplumber extraction
                page_data["content_blocks"] = [
                    b.to_dict() for b in extraction.content_blocks
                ]
                page_data["voice_narration"] = f"Page {page_num} content."

            pages.append(page_data)

        return {
            "pages": pages,
            "metadata": {
                "total_pages": total_pages,
                "processing_cost": analysis_cost,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "extraction_method": "enhanced_openai_vision",
                "vision_model": vision_model,
            },
        }

    def _create_enhanced_chunks(
        self,
        enhanced_structure: Dict[str, Any],
        document_id: str,
        title: str,
        source_type: str,
        metadata: Dict[str, Any],
    ) -> List[DocumentChunk]:
        """
        Create searchable chunks from enhanced structure.

        Uses voice narration and content blocks for better search quality.

        Args:
            enhanced_structure: Enhanced structure from GPT-4 Vision
            document_id: Document identifier
            title: Document title
            source_type: Source type
            metadata: Additional metadata

        Returns:
            List of DocumentChunks
        """
        chunks = []
        chunk_index = 0

        base_metadata = {
            "document_id": document_id,
            "title": title,
            "source_type": source_type,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "total_pages": enhanced_structure["metadata"]["total_pages"],
            **metadata,
        }

        for page_data in enhanced_structure.get("pages", []):
            page_number = page_data["page_number"]

            # Combine content for chunking
            content_parts = []

            # Add voice narration
            if page_data.get("voice_narration"):
                content_parts.append(page_data["voice_narration"])

            # Add content from blocks
            for block in page_data.get("content_blocks", []):
                if block["type"] in ("text", "heading"):
                    content_parts.append(block.get("content", ""))
                elif block["type"] == "table":
                    # Format table for search
                    table_text = self._format_table_for_search(block)
                    content_parts.append(table_text)
                elif block["type"] == "figure":
                    # Include figure description
                    if block.get("description"):
                        content_parts.append(f"Figure: {block['description']}")
                    elif block.get("caption"):
                        content_parts.append(f"Figure: {block['caption']}")

            # Combine and chunk
            page_text = "\n\n".join(filter(None, content_parts))

            if not page_text.strip():
                continue

            # Create chunks for this page
            for i in range(0, len(page_text), self.chunk_size - self.chunk_overlap):
                chunk_text = page_text[i : i + self.chunk_size]

                if len(chunk_text) < 50:
                    continue

                chunk_id = str(uuid.uuid4())
                chunk = DocumentChunk(
                    chunk_id=chunk_id,
                    document_id=document_id,
                    content=chunk_text,
                    chunk_index=chunk_index,
                    metadata={
                        **base_metadata,
                        "page_number": page_number,
                        "has_voice_narration": bool(page_data.get("voice_narration")),
                        "char_start_in_page": i,
                        "char_end_in_page": min(i + self.chunk_size, len(page_text)),
                        # Duplicate document-level PHI risk at chunk level for filtering
                        "chunk_phi_risk": base_metadata.get("phi_risk"),
                    },
                )
                chunks.append(chunk)
                chunk_index += 1

        return chunks

    def update_document_phi_risk(self, document_id: str, phi_risk: str) -> bool:
        """
        Update PHI risk payload for all chunks of a document in Qdrant.

        This helper operates in-place on existing vectors without re-embedding.
        It sets both document-level and chunk-level PHI risk metadata so that
        filters can be applied at query time.
        """
        if not phi_risk:
            return False

        if not self.qdrant_enabled or self.qdrant_client is None:
            logger.warning(
                "Qdrant disabled or unavailable - skipping phi_risk payload update for %s",
                document_id,
            )
            return False

        try:
            self.qdrant_client.set_payload(
                collection_name=self.collection_name,
                payload={
                    "phi_risk": phi_risk,
                    "chunk_phi_risk": phi_risk,
                },
                filter=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id),
                        )
                    ]
                ),
            )
            logger.info(
                "Updated phi_risk payload for document %s to %s",
                document_id,
                phi_risk,
            )
            return True
        except Exception as e:  # pragma: no cover - defensive
            logger.error(
                "Failed to update phi_risk payload for document %s: %s",
                document_id,
                e,
                exc_info=True,
            )
            return False

    def _format_table_for_search(self, table_block: Dict[str, Any]) -> str:
        """Format a table block for text search."""
        parts = []

        if table_block.get("caption"):
            parts.append(f"Table: {table_block['caption']}")

        headers = table_block.get("headers", [])
        rows = table_block.get("rows", [])

        if headers:
            parts.append("Headers: " + ", ".join(headers))

        for row in rows[:10]:  # Limit rows for chunking
            parts.append(" | ".join(row))

        return "\n".join(parts)
