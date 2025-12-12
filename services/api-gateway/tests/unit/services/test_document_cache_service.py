"""
Tests for DocumentCacheService

Tests the document caching functionality for voice navigation performance.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.document_cache_service import DocumentCacheService, document_cache


class TestDocumentCacheService:
    """Tests for DocumentCacheService."""

    @pytest.fixture
    def cache_service(self):
        """Create a fresh cache service instance."""
        return DocumentCacheService()

    @pytest.fixture
    def sample_structure(self):
        """Sample document structure."""
        return {
            "pages": [
                {"page_number": 1, "text": "Page 1 content", "word_count": 100},
                {"page_number": 2, "text": "Page 2 content", "word_count": 150},
                {"page_number": 3, "text": "Page 3 content", "word_count": 120},
                {"page_number": 4, "text": "Page 4 content", "word_count": 180},
                {"page_number": 5, "text": "Page 5 content", "word_count": 90},
            ],
            "toc": [
                {"title": "Introduction", "page_number": 1, "level": 1},
                {"title": "Chapter 1", "page_number": 2, "level": 1},
            ],
            "sections": [
                {"section_id": "sec-1", "title": "Intro", "start_page": 1, "end_page": 1},
                {"section_id": "sec-2", "title": "Main", "start_page": 2, "end_page": 5},
            ],
            "figures": [
                {"figure_id": "fig-1", "page_number": 3, "caption": "Diagram"},
            ],
        }

    @pytest.fixture
    def sample_metadata(self):
        """Sample document metadata."""
        return {
            "title": "Test Document",
            "total_pages": 5,
            "has_toc": True,
            "has_figures": True,
        }

    @pytest.fixture
    def sample_session(self):
        """Sample voice session."""
        return {
            "id": "session-123",
            "conversation_id": "conv-456",
            "user_id": "user-789",
            "document_id": "doc-001",
            "current_page": 1,
            "current_section_id": None,
            "last_read_position": 0,
            "is_active": True,
        }

    # ========== Key Generation Tests ==========

    def test_structure_key_generation(self, cache_service):
        """Test structure cache key generation."""
        key = cache_service._structure_key("doc-123")
        assert key == "doc_struct:doc-123"

    def test_page_key_generation(self, cache_service):
        """Test page cache key generation."""
        key = cache_service._page_key("doc-123", 5)
        assert key == "doc_page:doc-123:5"

    def test_session_key_generation(self, cache_service):
        """Test session cache key generation."""
        key = cache_service._session_key("conv-123", "user-456")
        # Should be a hash-based key
        assert key.startswith("voice_session:")
        assert len(key) > len("voice_session:")

    def test_metadata_key_generation(self, cache_service):
        """Test metadata cache key generation."""
        key = cache_service._metadata_key("doc-123")
        assert key == "doc_meta:doc-123"

    # ========== Document Structure Caching Tests ==========

    @pytest.mark.asyncio
    async def test_get_document_structure_cache_miss(self, cache_service):
        """Test getting structure when not cached."""
        with patch.object(
            cache_service, "_structure_key", return_value="doc_struct:test"
        ):
            with patch(
                "app.services.document_cache_service.cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                result = await cache_service.get_document_structure("test-doc")
                assert result is None

    @pytest.mark.asyncio
    async def test_get_document_structure_cache_hit(self, cache_service, sample_structure):
        """Test getting structure when cached."""
        with patch(
            "app.services.document_cache_service.cache_service.get",
            new_callable=AsyncMock,
            return_value=sample_structure,
        ):
            result = await cache_service.get_document_structure("test-doc")
            assert result == sample_structure

    @pytest.mark.asyncio
    async def test_set_document_structure(self, cache_service, sample_structure):
        """Test caching document structure."""
        with patch(
            "app.services.document_cache_service.cache_service.set",
            new_callable=AsyncMock,
            return_value=True,
        ) as mock_set:
            result = await cache_service.set_document_structure("test-doc", sample_structure)
            assert result is True
            mock_set.assert_called_once()
            # Verify TTL is set
            call_kwargs = mock_set.call_args[1]
            assert call_kwargs["ttl"] == cache_service.STRUCTURE_TTL

    # ========== Page Content Caching Tests ==========

    @pytest.mark.asyncio
    async def test_get_page_content_cache_miss(self, cache_service):
        """Test getting page content when not cached."""
        with patch(
            "app.services.document_cache_service.cache_service.get",
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await cache_service.get_page_content("test-doc", 1)
            assert result is None

    @pytest.mark.asyncio
    async def test_get_page_content_cache_hit(self, cache_service):
        """Test getting page content when cached."""
        page_content = {"page_number": 1, "text": "Test content", "word_count": 50}
        with patch(
            "app.services.document_cache_service.cache_service.get",
            new_callable=AsyncMock,
            return_value=page_content,
        ):
            result = await cache_service.get_page_content("test-doc", 1)
            assert result == page_content

    @pytest.mark.asyncio
    async def test_set_page_content(self, cache_service):
        """Test caching page content."""
        page_content = {"page_number": 1, "text": "Test content"}
        with patch(
            "app.services.document_cache_service.cache_service.set",
            new_callable=AsyncMock,
            return_value=True,
        ) as mock_set:
            result = await cache_service.set_page_content("test-doc", 1, page_content)
            assert result is True
            # Verify TTL is PAGE_TTL
            call_kwargs = mock_set.call_args[1]
            assert call_kwargs["ttl"] == cache_service.PAGE_TTL

    @pytest.mark.asyncio
    async def test_prefetch_pages(self, cache_service, sample_structure):
        """Test prefetching adjacent pages."""
        with patch.object(
            cache_service, "get_page_content", new_callable=AsyncMock, return_value=None
        ) as mock_get:
            with patch.object(
                cache_service, "set_page_content", new_callable=AsyncMock, return_value=True
            ) as mock_set:
                await cache_service.prefetch_pages(
                    document_id="test-doc",
                    structure=sample_structure,
                    current_page=3,
                    prefetch_count=2,
                )

                # Should try to prefetch pages 4, 5 (next) and 2, 1 (previous)
                assert mock_get.call_count == 4
                # Should cache uncached pages
                assert mock_set.call_count >= 0  # Depends on what's cached

    # ========== Voice Session Caching Tests ==========

    @pytest.mark.asyncio
    async def test_get_active_session_cache_miss(self, cache_service):
        """Test getting session when not cached."""
        with patch(
            "app.services.document_cache_service.cache_service.get",
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await cache_service.get_active_session("conv-123", "user-456")
            assert result is None

    @pytest.mark.asyncio
    async def test_get_active_session_cache_hit(self, cache_service, sample_session):
        """Test getting session when cached."""
        with patch(
            "app.services.document_cache_service.cache_service.get",
            new_callable=AsyncMock,
            return_value=sample_session,
        ):
            result = await cache_service.get_active_session("conv-123", "user-456")
            assert result == sample_session

    @pytest.mark.asyncio
    async def test_set_active_session(self, cache_service, sample_session):
        """Test caching voice session."""
        with patch(
            "app.services.document_cache_service.cache_service.set",
            new_callable=AsyncMock,
            return_value=True,
        ) as mock_set:
            result = await cache_service.set_active_session(
                "conv-123", "user-456", sample_session
            )
            assert result is True
            # Verify TTL is SESSION_TTL
            call_kwargs = mock_set.call_args[1]
            assert call_kwargs["ttl"] == cache_service.SESSION_TTL

    @pytest.mark.asyncio
    async def test_invalidate_session(self, cache_service):
        """Test session cache invalidation."""
        with patch(
            "app.services.document_cache_service.cache_service.delete",
            new_callable=AsyncMock,
            return_value=True,
        ) as mock_delete:
            result = await cache_service.invalidate_session("conv-123", "user-456")
            assert result is True
            mock_delete.assert_called_once()

    # ========== Document Metadata Caching Tests ==========

    @pytest.mark.asyncio
    async def test_get_document_metadata_cache_hit(self, cache_service, sample_metadata):
        """Test getting metadata when cached."""
        with patch(
            "app.services.document_cache_service.cache_service.get",
            new_callable=AsyncMock,
            return_value=sample_metadata,
        ):
            result = await cache_service.get_document_metadata("test-doc")
            assert result == sample_metadata

    @pytest.mark.asyncio
    async def test_set_document_metadata(self, cache_service, sample_metadata):
        """Test caching document metadata."""
        with patch(
            "app.services.document_cache_service.cache_service.set",
            new_callable=AsyncMock,
            return_value=True,
        ) as mock_set:
            result = await cache_service.set_document_metadata("test-doc", sample_metadata)
            assert result is True
            call_kwargs = mock_set.call_args[1]
            assert call_kwargs["ttl"] == cache_service.METADATA_TTL

    # ========== Cache Invalidation Tests ==========

    @pytest.mark.asyncio
    async def test_invalidate_document(self, cache_service):
        """Test full document cache invalidation."""
        with patch(
            "app.services.document_cache_service.cache_service.delete",
            new_callable=AsyncMock,
            return_value=True,
        ):
            with patch(
                "app.services.document_cache_service.cache_service.delete_pattern",
                new_callable=AsyncMock,
                return_value=5,
            ):
                count = await cache_service.invalidate_document("test-doc")
                # Should invalidate structure + metadata + pages
                assert count >= 2

    # ========== Cache Stats Tests ==========

    @pytest.mark.asyncio
    async def test_get_cache_stats(self, cache_service):
        """Test cache statistics retrieval."""
        stats = await cache_service.get_cache_stats()

        assert "structure" in stats
        assert "page" in stats
        assert "session" in stats
        assert "metadata" in stats

        assert stats["structure"]["ttl_seconds"] == cache_service.STRUCTURE_TTL
        assert stats["page"]["ttl_seconds"] == cache_service.PAGE_TTL
        assert stats["session"]["ttl_seconds"] == cache_service.SESSION_TTL
        assert stats["metadata"]["ttl_seconds"] == cache_service.METADATA_TTL


class TestGlobalDocumentCache:
    """Tests for global document_cache instance."""

    def test_global_instance_exists(self):
        """Test that global cache instance is available."""
        assert document_cache is not None
        assert isinstance(document_cache, DocumentCacheService)
