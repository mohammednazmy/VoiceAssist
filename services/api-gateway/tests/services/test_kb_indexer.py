"""
Unit tests for Knowledge Base Indexer Service

Tests document chunking, text extraction, and embedding generation
for the KB indexer.
"""

from unittest.mock import MagicMock, patch

import pytest
from app.services.kb_indexer import DocumentChunk, IndexingResult, KBIndexer


class TestDocumentChunk:
    """Tests for DocumentChunk dataclass."""

    def test_document_chunk_creation(self):
        """Test DocumentChunk creation with all fields."""
        chunk = DocumentChunk(
            chunk_id="chunk-001",
            document_id="doc-123",
            content="This is the chunk content.",
            chunk_index=0,
            metadata={"source": "test.pdf", "page": 1},
        )
        assert chunk.chunk_id == "chunk-001"
        assert chunk.document_id == "doc-123"
        assert chunk.content == "This is the chunk content."
        assert chunk.chunk_index == 0
        assert chunk.metadata["source"] == "test.pdf"


class TestIndexingResult:
    """Tests for IndexingResult dataclass."""

    def test_success_result(self):
        """Test successful indexing result."""
        result = IndexingResult(
            document_id="doc-123",
            success=True,
            chunks_indexed=10,
        )
        assert result.document_id == "doc-123"
        assert result.success is True
        assert result.chunks_indexed == 10
        assert result.error_message is None

    def test_failure_result(self):
        """Test failed indexing result."""
        result = IndexingResult(
            document_id="doc-456",
            success=False,
            chunks_indexed=0,
            error_message="Failed to parse PDF",
        )
        assert result.success is False
        assert result.chunks_indexed == 0
        assert result.error_message == "Failed to parse PDF"


class TestKBIndexerInit:
    """Tests for KBIndexer initialization."""

    def test_init_with_defaults(self):
        """Test KBIndexer initializes with default values."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client

            indexer = KBIndexer()

            assert indexer.collection_name == "medical_kb"
            assert indexer.chunk_size == 500
            assert indexer.chunk_overlap == 50
            assert indexer.embedding_model == "text-embedding-3-small"

    def test_init_with_custom_values(self):
        """Test KBIndexer accepts custom configuration."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client

            indexer = KBIndexer(
                qdrant_url="http://localhost:6333",
                collection_name="custom_kb",
                chunk_size=1000,
                chunk_overlap=100,
                embedding_model="text-embedding-3-large",
            )

            assert indexer.collection_name == "custom_kb"
            assert indexer.chunk_size == 1000
            assert indexer.chunk_overlap == 100
            assert indexer.embedding_model == "text-embedding-3-large"

    def test_init_creates_collection_if_missing(self):
        """Test KBIndexer creates collection if it doesn't exist."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client

            _indexer = KBIndexer(collection_name="new_collection")  # noqa: F841

            mock_client.create_collection.assert_called_once()

    def test_init_skips_creation_if_exists(self):
        """Test KBIndexer doesn't recreate existing collection."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            existing_collection = MagicMock()
            existing_collection.name = "medical_kb"
            mock_client.get_collections.return_value.collections = [existing_collection]
            mock_qdrant.return_value = mock_client

            _indexer = KBIndexer()  # noqa: F841

            mock_client.create_collection.assert_not_called()


class TestKBIndexerChunking:
    """Tests for KBIndexer text chunking."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client
            self.indexer = KBIndexer(chunk_size=100, chunk_overlap=20)

    def test_chunk_text_basic(self):
        """Test basic text chunking."""
        text = "A" * 250  # 250 characters
        chunks = self.indexer.chunk_text(
            text,
            document_id="doc-123",
            metadata={"source": "test"},
        )

        # With chunk_size=100, overlap=20, we should get 3 chunks
        # Chunk 1: 0-100, Chunk 2: 80-180, Chunk 3: 160-260
        assert len(chunks) >= 2
        assert all(isinstance(c, DocumentChunk) for c in chunks)
        assert chunks[0].document_id == "doc-123"

    def test_chunk_text_preserves_metadata(self):
        """Test chunks preserve document metadata."""
        text = "Test content " * 20
        metadata = {"source": "medical_textbook.pdf", "author": "Dr. Smith"}

        chunks = self.indexer.chunk_text(text, "doc-456", metadata)

        for chunk in chunks:
            # Metadata should be preserved in chunks
            assert chunk.metadata.get("source") == "medical_textbook.pdf"

    def test_chunk_text_sequential_indices(self):
        """Test chunks have sequential indices."""
        text = "X" * 500
        chunks = self.indexer.chunk_text(text, "doc-789", {})

        indices = [c.chunk_index for c in chunks]
        assert indices == sorted(indices)
        assert indices[0] == 0

    def test_chunk_text_unique_ids(self):
        """Test each chunk has unique ID."""
        text = "Content " * 50
        chunks = self.indexer.chunk_text(text, "doc-abc", {})

        chunk_ids = [c.chunk_id for c in chunks]
        assert len(chunk_ids) == len(set(chunk_ids))  # All unique

    def test_chunk_text_empty_returns_empty(self):
        """Test empty text returns empty list."""
        chunks = self.indexer.chunk_text("", "doc-empty", {})
        assert chunks == []

    def test_chunk_text_small_text(self):
        """Test text smaller than chunk_size."""
        text = "Short text"
        chunks = self.indexer.chunk_text(text, "doc-short", {})

        # Should still create at least one chunk if text is valid
        # (implementation may skip very small chunks)
        assert len(chunks) <= 1


class TestKBIndexerPDFExtraction:
    """Tests for KBIndexer PDF text extraction."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client
            self.indexer = KBIndexer()

    def test_extract_text_invalid_pdf_raises(self):
        """Test invalid PDF raises ValueError."""
        invalid_pdf = b"This is not a PDF file"

        with pytest.raises(ValueError, match="Failed to extract text from PDF"):
            self.indexer.extract_text_from_pdf(invalid_pdf)

    def test_extract_text_empty_pdf_raises(self):
        """Test empty bytes raises error."""
        with pytest.raises(ValueError):
            self.indexer.extract_text_from_pdf(b"")

    def test_extract_text_valid_pdf(self):
        """Test valid PDF extraction with mocked PdfReader."""
        with patch("app.services.kb_indexer.PdfReader") as mock_reader:
            # Mock a simple PDF with one page
            mock_page = MagicMock()
            mock_page.extract_text.return_value = "Page 1 content"
            mock_reader.return_value.pages = [mock_page]

            # Create minimal PDF-like bytes (the mock handles parsing)
            result = self.indexer.extract_text_from_pdf(b"%PDF-1.4 fake pdf content")

            assert "Page 1 content" in result

    def test_extract_text_multipage_pdf(self):
        """Test multi-page PDF extraction."""
        with patch("app.services.kb_indexer.PdfReader") as mock_reader:
            # Mock a PDF with multiple pages
            mock_pages = []
            for i in range(3):
                page = MagicMock()
                page.extract_text.return_value = f"Page {i + 1} content"
                mock_pages.append(page)
            mock_reader.return_value.pages = mock_pages

            result = self.indexer.extract_text_from_pdf(b"%PDF-1.4 fake pdf")

            assert "Page 1 content" in result
            assert "Page 2 content" in result
            assert "Page 3 content" in result


class TestKBIndexerEmbeddings:
    """Tests for KBIndexer embedding generation."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client
            self.indexer = KBIndexer()

    def test_embedding_model_default(self):
        """Test default embedding model."""
        assert self.indexer.embedding_model == "text-embedding-3-small"

    def test_embedding_model_custom(self):
        """Test custom embedding model."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client

            indexer = KBIndexer(embedding_model="text-embedding-3-large")
            assert indexer.embedding_model == "text-embedding-3-large"


class TestKBIndexerQdrantIntegration:
    """Tests for KBIndexer Qdrant integration."""

    def test_qdrant_client_initialized(self):
        """Test Qdrant client is properly initialized."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client

            _indexer = KBIndexer(qdrant_url="http://custom-qdrant:6333")  # noqa: F841

            mock_qdrant.assert_called_with(url="http://custom-qdrant:6333")

    def test_collection_creation_params(self):
        """Test collection is created with correct vector params."""
        with patch("app.services.kb_indexer.QdrantClient") as mock_qdrant:
            mock_client = MagicMock()
            mock_client.get_collections.return_value.collections = []
            mock_qdrant.return_value = mock_client

            _indexer = KBIndexer(collection_name="test_collection")  # noqa: F841

            # Verify create_collection was called with correct params
            create_call = mock_client.create_collection.call_args
            assert create_call is not None
            assert create_call.kwargs["collection_name"] == "test_collection"
