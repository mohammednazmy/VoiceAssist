"""
Unit tests for Advanced RAG Services (Phase 5)

Tests cover:
- Hybrid search service (BM25 + Vector)
- Re-ranking service
- Medical embeddings service
- Query expansion service
- Advanced search aggregator
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.hybrid_search_service import BM25Index, HybridSearchService, SearchResult, SearchStrategy
from app.services.medical_embeddings import (
    EmbeddingConfig,
    EmbeddingResult,
    HybridEmbeddingService,
    MedicalModelType,
    OpenAIEmbeddings,
    QueryType,
)
from app.services.query_expansion import QueryExpansionConfig, QueryExpansionService
from app.services.reranking_service import RerankedResult, RerankerConfig, RerankerType, RerankingService

# ===================================
# BM25 Index Tests
# ===================================


class TestBM25Index:
    """Tests for BM25 index."""

    def test_initialization(self):
        """Test BM25 index initialization."""
        index = BM25Index(k1=1.5, b=0.75)
        assert index.k1 == 1.5
        assert index.b == 0.75
        assert not index._initialized

    def test_add_document(self):
        """Test adding documents to index."""
        index = BM25Index()
        index.add_document("doc1", "heart disease treatment options")
        index.add_document("doc2", "diabetes management guidelines")

        assert index._initialized
        assert len(index.documents) == 2
        assert "doc1" in index.documents
        assert "doc2" in index.documents

    def test_search(self):
        """Test BM25 search."""
        index = BM25Index()
        index.add_document("doc1", "heart disease treatment options cardiac care")
        index.add_document("doc2", "diabetes management blood sugar control")
        index.add_document("doc3", "heart failure symptoms and diagnosis")

        results = index.search("heart disease", top_k=2)

        assert len(results) == 2
        # Doc1 and Doc3 should rank higher (contain "heart")
        doc_ids = [r[0] for r in results]
        assert "doc1" in doc_ids or "doc3" in doc_ids

    def test_search_empty_index(self):
        """Test search on empty index."""
        index = BM25Index()
        results = index.search("test query")
        assert results == []

    def test_tokenization(self):
        """Test tokenization."""
        index = BM25Index()
        tokens = index._tokenize("Heart Disease, Treatment! Options?")
        assert tokens == ["heart", "disease", "treatment", "options"]


# ===================================
# Hybrid Search Service Tests
# ===================================


class TestHybridSearchService:
    """Tests for hybrid search service."""

    @pytest.fixture
    def hybrid_service(self):
        """Create hybrid search service with Qdrant disabled."""
        with patch("app.services.hybrid_search_service.settings") as mock_settings:
            mock_settings.QDRANT_ENABLED = False
            return HybridSearchService()

    def test_initialization(self, hybrid_service):
        """Test service initialization."""
        assert hybrid_service.bm25_index is not None
        assert hybrid_service.config is not None

    def test_search_strategy_selection_short_query(self, hybrid_service):
        """Test strategy selection for short queries."""
        strategy = hybrid_service._select_strategy("diabetes")
        assert strategy == SearchStrategy.HYBRID

    def test_search_strategy_selection_question(self, hybrid_service):
        """Test strategy selection for question queries."""
        strategy = hybrid_service._select_strategy(
            "What are the treatment options for heart failure in elderly patients?"
        )
        assert strategy == SearchStrategy.VECTOR_ONLY

    def test_search_strategy_selection_medical_terms(self, hybrid_service):
        """Test strategy selection for medical term queries."""
        strategy = hybrid_service._select_strategy("HbA1c target level for diabetics")
        assert strategy == SearchStrategy.HYBRID

    def test_normalize_scores(self, hybrid_service):
        """Test score normalization."""
        results = [
            SearchResult("1", "doc1", "content1", 0.8, {}),
            SearchResult("2", "doc2", "content2", 0.4, {}),
            SearchResult("3", "doc3", "content3", 0.6, {}),
        ]

        normalized = hybrid_service._normalize_scores(results)

        assert normalized[0].score == 1.0  # Max becomes 1
        assert normalized[1].score == 0.0  # Min becomes 0
        assert normalized[2].score == pytest.approx(0.5)  # Mid value

    def test_reciprocal_rank_fusion(self, hybrid_service):
        """Test RRF fusion."""
        list1 = [
            SearchResult("a", "doc_a", "content_a", 0.9, {}),
            SearchResult("b", "doc_b", "content_b", 0.8, {}),
        ]
        list2 = [
            SearchResult("b", "doc_b", "content_b", 0.95, {}),
            SearchResult("c", "doc_c", "content_c", 0.85, {}),
        ]

        fused = hybrid_service._reciprocal_rank_fusion([list1, list2], k=60)

        # "b" appears in both lists and should rank high
        assert len(fused) == 3
        chunk_ids = [r.chunk_id for r in fused]
        assert "b" in chunk_ids

    @pytest.mark.asyncio
    async def test_bm25_search(self, hybrid_service):
        """Test BM25 search."""
        # Add documents to BM25 index
        await hybrid_service.initialize_bm25_index(
            [
                {"id": "doc1", "content": "heart disease treatment", "metadata": {}},
                {"id": "doc2", "content": "diabetes management", "metadata": {}},
            ]
        )

        results = await hybrid_service._bm25_search("heart", top_k=5)

        assert len(results) >= 1
        assert results[0].content == "heart disease treatment"


# ===================================
# Re-ranking Service Tests
# ===================================


class TestRerankingService:
    """Tests for re-ranking service."""

    def test_config_creation(self):
        """Test reranker config creation."""
        config = RerankerConfig(
            reranker_type=RerankerType.COHERE,
            top_n=5,
            score_weight=0.8,
        )
        assert config.reranker_type == RerankerType.COHERE
        assert config.top_n == 5
        assert config.score_weight == 0.8

    def test_reranked_result_creation(self):
        """Test reranked result creation."""
        result = RerankedResult(
            chunk_id="chunk1",
            document_id="doc1",
            content="Test content",
            original_score=0.8,
            rerank_score=0.9,
            final_score=0.85,
            metadata={"title": "Test"},
        )

        assert result.chunk_id == "chunk1"
        assert result.final_score == 0.85

    @pytest.fixture
    def reranker_service(self):
        """Create reranker service with no re-ranking."""
        return RerankingService(config=RerankerConfig(reranker_type=RerankerType.NONE))

    @pytest.mark.asyncio
    async def test_no_reranking(self, reranker_service):
        """Test passthrough when reranking disabled."""
        results = [
            {"chunk_id": "1", "content": "content1", "score": 0.8, "metadata": {}},
            {"chunk_id": "2", "content": "content2", "score": 0.6, "metadata": {}},
        ]

        reranked = await reranker_service.rerank("test query", results)

        assert len(reranked) == 2
        assert reranked[0].chunk_id == "1"
        assert reranked[0].final_score == 0.8


class TestCohereReranker:
    """Tests for Cohere reranker."""

    @pytest.mark.asyncio
    async def test_rerank_without_api_key(self):
        """Test reranker behavior without API key."""
        from app.services.reranking_service import CohereReranker

        reranker = CohereReranker(api_key=None)
        results = await reranker.rerank("test", ["doc1", "doc2"], top_n=2)

        # Should return fallback results
        assert len(results) == 2
        assert results[0][0] == 0  # First doc index
        assert results[0][1] == 1.0  # Default score


# ===================================
# Medical Embeddings Tests
# ===================================


class TestMedicalEmbeddings:
    """Tests for medical embeddings service."""

    def test_embedding_config(self):
        """Test embedding config creation."""
        config = EmbeddingConfig(
            model_type=MedicalModelType.PUBMEDBERT,
            device="cpu",
            batch_size=16,
        )
        assert config.model_type == MedicalModelType.PUBMEDBERT
        assert config.device == "cpu"
        assert config.batch_size == 16

    def test_embedding_result(self):
        """Test embedding result creation."""
        result = EmbeddingResult(
            embedding=[0.1, 0.2, 0.3],
            model="pubmedbert",
            dimensions=3,
        )
        assert len(result.embedding) == 3
        assert result.dimensions == 3

    def test_query_type_enum(self):
        """Test query type enum."""
        assert QueryType.GENERAL.value == "general"
        assert QueryType.CLINICAL.value == "clinical"
        assert QueryType.RESEARCH.value == "research"


class TestOpenAIEmbeddings:
    """Tests for OpenAI embeddings."""

    @pytest.mark.asyncio
    async def test_embed_with_mock(self):
        """Test embedding with mocked OpenAI."""
        # Mock the entire openai module's embeddings.create method
        mock_data = MagicMock()
        mock_data.embedding = [0.1, 0.2, 0.3]
        mock_response = MagicMock()
        mock_response.data = [mock_data]

        with patch("app.services.medical_embeddings.openai") as mock_openai:
            mock_openai.embeddings.create = AsyncMock(return_value=mock_response)

            embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
            result = await embeddings.embed("test text")

            assert len(result) == 1
            assert len(result[0]) == 3
            mock_openai.embeddings.create.assert_called_once()


class TestHybridEmbeddingService:
    """Tests for hybrid embedding service."""

    def test_weight_configuration(self):
        """Test weight configuration by query type."""
        service = HybridEmbeddingService()

        clinical_weights = service._get_weights(QueryType.CLINICAL)
        general_weights = service._get_weights(QueryType.GENERAL)

        # Clinical queries should favor medical embeddings
        assert clinical_weights["medical"] > clinical_weights["openai"]
        # General queries should favor OpenAI
        assert general_weights["openai"] > general_weights["medical"]


# ===================================
# Query Expansion Tests
# ===================================


class TestQueryExpansion:
    """Tests for query expansion service."""

    @pytest.fixture
    def expansion_service(self):
        """Create query expansion service."""
        return QueryExpansionService(
            config=QueryExpansionConfig(
                enable_abbreviation=True,
                enable_synonym=True,
                enable_llm=False,
            )
        )

    def test_abbreviation_expansion(self, expansion_service):
        """Test medical abbreviation expansion."""
        expansions = expansion_service._expand_abbreviations("patient with MI and CHF")

        assert len(expansions) > 0
        assert any("myocardial infarction" in e for e in expansions)
        assert any("heart failure" in e for e in expansions)

    def test_synonym_expansion(self, expansion_service):
        """Test synonym expansion."""
        expansions = expansion_service._expand_synonyms("patient with fever and pain")

        assert len(expansions) > 0
        # Should include fever synonyms
        assert any("pyrexia" in e or "elevated temperature" in e for e in expansions)

    @pytest.mark.asyncio
    async def test_expand_query(self, expansion_service):
        """Test full query expansion."""
        result = await expansion_service.expand("patient with MI")

        assert result.original_query == "patient with MI"
        assert "myocardial infarction" in result.expanded_query.lower()
        assert len(result.expansion_terms) > 0

    @pytest.mark.asyncio
    async def test_expand_without_abbreviations(self, expansion_service):
        """Test expansion without medical abbreviations."""
        result = await expansion_service.expand("headache treatment")

        # Should still work but with fewer expansions
        assert result.original_query == "headache treatment"

    @pytest.mark.asyncio
    async def test_terminology_normalization(self, expansion_service):
        """Test terminology normalization."""
        normalized = await expansion_service.normalize_terminology("patient with heart attack and high blood pressure")

        assert "myocardial infarction" in normalized
        assert "hypertension" in normalized


class TestQueryExpansionConfig:
    """Tests for query expansion config."""

    def test_default_config(self):
        """Test default configuration."""
        config = QueryExpansionConfig()

        assert config.enable_abbreviation is True
        assert config.enable_synonym is True
        assert config.enable_llm is False
        assert config.max_expansion_terms == 5

    def test_custom_config(self):
        """Test custom configuration."""
        config = QueryExpansionConfig(
            enable_abbreviation=False,
            enable_llm=True,
            max_expansion_terms=10,
        )

        assert config.enable_abbreviation is False
        assert config.enable_llm is True
        assert config.max_expansion_terms == 10


# ===================================
# Advanced Search Aggregator Tests
# ===================================


class TestAdvancedSearchAggregator:
    """Tests for advanced search aggregator."""

    def test_mode_settings(self):
        """Test search mode settings."""
        from app.services.advanced_search import AdvancedSearchAggregator, SearchMode

        aggregator = AdvancedSearchAggregator()

        fast_settings = aggregator._get_mode_settings(SearchMode.FAST)
        precise_settings = aggregator._get_mode_settings(SearchMode.PRECISE)

        assert fast_settings["rerank"] is False
        assert fast_settings["expand"] is False

        assert precise_settings["rerank"] is True
        assert precise_settings["expand"] is True

    def test_format_context(self):
        """Test RAG context formatting."""
        from app.services.advanced_search import AdvancedSearchAggregator, AdvancedSearchResult

        aggregator = AdvancedSearchAggregator()

        results = [
            AdvancedSearchResult(
                chunk_id="1",
                document_id="doc1",
                content="Heart failure is a condition...",
                score=0.9,
                title="Harrison's Cardiology",
            ),
            AdvancedSearchResult(
                chunk_id="2",
                document_id="doc2",
                content="Treatment options include...",
                score=0.8,
                title="UpToDate",
            ),
        ]

        context = aggregator.format_context_for_rag(results)

        assert "Harrison's Cardiology" in context
        assert "Heart failure" in context
        assert "[1" in context  # Format is [1 | SOURCE]
        assert "[2" in context  # Format is [2 | SOURCE]

    def test_format_empty_results(self):
        """Test formatting empty results."""
        from app.services.advanced_search import AdvancedSearchAggregator

        aggregator = AdvancedSearchAggregator()
        context = aggregator.format_context_for_rag([])

        assert "No relevant information found" in context


# ===================================
# Integration Tests
# ===================================


class TestIntegration:
    """Integration tests for advanced RAG pipeline."""

    @pytest.mark.asyncio
    async def test_full_pipeline_mock(self):
        """Test full search pipeline with mocks."""
        from app.services.advanced_search import AdvancedSearchAggregator, AdvancedSearchConfig, SearchMode

        # Create aggregator with everything disabled
        config = AdvancedSearchConfig(
            enable_hybrid=False,
            enable_reranking=False,
            enable_expansion=False,
        )

        aggregator = AdvancedSearchAggregator(config=config)

        # Should not raise even with services disabled
        results, metrics = await aggregator.search(
            query="heart failure treatment",
            top_k=5,
            mode=SearchMode.FAST,
        )

        # Results may be empty but should complete
        assert isinstance(results, list)
        assert metrics.total_time_ms >= 0


# ===================================
# Edge Cases
# ===================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_document_bm25(self):
        """Test BM25 with empty document."""
        index = BM25Index()
        index.add_document("empty", "")

        results = index.search("test")
        # Should handle gracefully
        assert isinstance(results, list)

    def test_very_long_query(self):
        """Test handling very long queries."""
        from app.services.query_expansion import QueryExpansionService

        service = QueryExpansionService()
        long_query = " ".join(["medical"] * 1000)

        # Should not raise
        expansions = service._expand_abbreviations(long_query)
        assert isinstance(expansions, list)

    def test_special_characters_in_query(self):
        """Test handling special characters."""
        index = BM25Index()
        index.add_document("doc1", "test content")

        # Should handle special chars gracefully
        results = index.search("test!@#$%^&*()")
        assert isinstance(results, list)

    def test_unicode_in_query(self):
        """Test handling unicode characters."""
        from app.services.query_expansion import QueryExpansionService

        service = QueryExpansionService()

        # Should not raise
        expansions = service._expand_abbreviations("患者 with MI")
        assert isinstance(expansions, list)
